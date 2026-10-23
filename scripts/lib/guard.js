// Command guard rules for the Bash and PowerShell tools.
//
// evaluate(command, { cwd, home, tmpDirs, config }) -> { decision: "deny" | "ask" | "none", matches: [{ id, level, reason }] }
//
//   deny  catastrophic or irreversible, almost never legitimate: blocked, no confirmation can unlock it
//   ask   risky but sometimes legitimate: the user must confirm
//   none  no opinion (the normal permission flow applies; silence is NOT an approval)
//
// This is a static, best-effort analysis of the command text. It does not expand variables, glob patterns or
// aliases, so it has false negatives and false positives, and it never replaces the platform's permission system
// or the operating system's own controls. Unparsable high-risk input is handled conservatively (ask).
const os = require("os");
const path = require("path");

const MAX_DEPTH = 3;

const REASONS = {
  "rm-root": "recursive delete of the filesystem root, a drive, the home folder or a system folder",
  "fork-bomb": "fork bomb",
  "disk-wipe": "formatting or overwriting a disk or device",
  "force-push-protected": "force push or deletion of the protected branch main/master",
  "secret-write": "writing a secret or key file (.env, *.pem, *.key, id_rsa…) through the shell",
  "rm-recursive-outside": "recursive delete outside the project or with a target that cannot be verified (absolute path, .., ~, variable, substitution or wildcard)",
  "git-history-loss": "git command that discards work or rewrites shared history (reset --hard, clean -f, force push, checkout/restore of the whole tree, branch -D, stash clear)",
  "secret-read": "reading a secret or key file (.env, private keys, cloud credentials)",
  "secret-commit": "staging a secret or key file for commit",
  "pipe-to-shell": "downloading or decoding content and piping it straight into a shell",
  "sql-destructive": "destructive database statement (DROP, TRUNCATE, DELETE without WHERE, FLUSHALL)",
  "perm-recursive": "recursive permission or ownership change that is too broad",
  "publish-irreversible": "irreversible publish or deletion on a remote service",
  "eval-unresolved": "executing a command built from a variable or substitution that cannot be inspected",
  "encoded-command": "encoded command that cannot be inspected",
  "too-nested": "command nested too deeply to inspect",
};

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "fish"]);
const PREFIXES = new Set(["sudo", "doas", "nohup", "time", "nice", "ionice", "command", "exec", "builtin", "stdbuf", "setsid", "env", "timeout", "xargs", "busybox"]);
const INTERPRETERS = new Set(["python", "python3", "py", "node", "perl", "ruby", "php"]);
const EXFIL = new Set(["cp", "scp", "rsync", "tar", "zip", "7z", "curl", "wget"]);
const DISK_RE = /^\/dev\/(sd|hd|vd|xvd|nvme|mmcblk|disk|rdisk)/;
const LEADING = new Set(["{", "}", "!", "if", "then", "else", "elif", "do", "while", "until", "fi", "done"]);
const READERS = new Set(["cat", "type", "more", "less", "head", "tail", "bat", "nl", "tac", "strings", "xxd", "hexdump", "od", "base64", "grep", "egrep", "fgrep", "rg", "ag", "awk", "sed", "cut", "sort", "uniq", "jq", "get-content", "gc", "select-string", "sls", "source", "."]);
const DB_CLIENTS = new Set(["psql", "mysql", "mariadb", "sqlite3", "sqlcmd", "mongosh", "mongo", "redis-cli", "mssql-cli", "clickhouse-client"]);
const DELETERS = new Set(["rm", "remove-item", "ri", "del", "erase", "rd", "rmdir", "unlink"]);
const PS_VALUE_FLAGS = new Set(["path", "literalpath", "filter", "include", "exclude", "credential", "stream"]);

// ---------------------------------------------------------------------------------------------------------------
// Lexer: splits a command line into simple commands, respecting quotes, operators and redirections, and collects
// the text of $(...) substitutions and backticks so they can be analyzed too.
function lex(text) {
  const segs = [];
  const nested = [];
  let cur = { tokens: [], redirects: [], pipedFrom: null };
  let i = 0;
  const n = text.length;
  let unbalanced = false;
  const pending = []; // here-documents declared on the current line, filled in at the next newline

  const endSeg = (op) => {
    if (cur.tokens.length || cur.redirects.length) segs.push(cur);
    cur = { tokens: [], redirects: [], pipedFrom: op === "|" && segs.length ? segs[segs.length - 1] : null };
  };

  const matchParen = (start) => {
    let depth = 1;
    let j = start;
    while (j < n && depth) {
      if (text[j] === "(") depth++;
      else if (text[j] === ")") depth--;
      j++;
    }
    if (depth) unbalanced = true;
    return { inner: text.slice(start, depth ? n : j - 1), next: j };
  };

  function readWord() {
    const tok = { v: "", unresolved: false, quoted: false };
    while (i < n) {
      const c = text[i];
      if (/\s/.test(c) || c === ";" || c === "|" || c === "&" || c === ">" || c === "<" || c === "(" || c === ")") break;
      if (c === "'") {
        tok.quoted = true;
        const end = text.indexOf("'", i + 1);
        if (end < 0) {
          unbalanced = true;
          tok.v += text.slice(i + 1);
          i = n;
        } else {
          tok.v += text.slice(i + 1, end);
          i = end + 1;
        }
      } else if (c === '"') {
        tok.quoted = true;
        i++;
        let closed = false;
        while (i < n) {
          const d = text[i];
          if (d === "\\" && i + 1 < n && ['"', "\\", "$", "`"].includes(text[i + 1])) {
            // `\"` escapes the quote only when another quote follows; otherwise it is a Windows path ending in a backslash
            if (text[i + 1] === '"' && text.indexOf('"', i + 2) < 0) {
              tok.v += "\\";
              i++;
              continue;
            }
            tok.v += text[i + 1];
            i += 2;
          } else if (d === '"') {
            closed = true;
            i++;
            break;
          } else if (d === "$" && text[i + 1] === "(") {
            const m = matchParen(i + 2);
            nested.push(m.inner);
            tok.unresolved = true;
            tok.v += `$(${m.inner})`;
            i = m.next;
          } else if (d === "`") {
            const end = text.indexOf("`", i + 1);
            const inner = end < 0 ? text.slice(i + 1) : text.slice(i + 1, end);
            nested.push(inner);
            tok.unresolved = true;
            tok.v += `\`${inner}\``;
            i = end < 0 ? n : end + 1;
          } else {
            tok.v += d;
            i++;
          }
        }
        if (!closed) unbalanced = true;
      } else if (c === "$" && text[i + 1] === "(") {
        const m = matchParen(i + 2);
        nested.push(m.inner);
        tok.unresolved = true;
        tok.v += `$(${m.inner})`;
        i = m.next;
      } else if (c === "`") {
        const end = text.indexOf("`", i + 1);
        const inner = end < 0 ? text.slice(i + 1) : text.slice(i + 1, end);
        nested.push(inner);
        tok.unresolved = true;
        tok.v += `\`${inner}\``;
        i = end < 0 ? n : end + 1;
      } else if (c === "\\" && text[i + 1] === "\n") {
        i += 2;
      } else {
        tok.v += c;
        i++;
      }
    }
    return tok;
  }

  while (i < n) {
    const c = text[i];
    if (c === "\n") {
      i++;
      for (const p of pending) {
        const lines = [];
        while (i < n) {
          let end = text.indexOf("\n", i);
          if (end < 0) end = n;
          const line = text.slice(i, end);
          i = Math.min(end + 1, n);
          if ((p.strip ? line.trim() : line) === p.delim) break;
          lines.push(line);
        }
        p.seg.heredoc = lines.join("\n");
      }
      pending.length = 0;
      endSeg(";");
    } else if (/\s/.test(c)) {
      i++;
    } else if (c === "#" ) {
      while (i < n && text[i] !== "\n") i++;
    } else if (c === "(" || c === ")") {
      endSeg(";");
      i++;
    } else if (c === ";") {
      endSeg(";");
      i++;
    } else if (c === "&" && text[i + 1] === "&") {
      endSeg("&&");
      i += 2;
    } else if (c === "|" && text[i + 1] === "|") {
      endSeg("||");
      i += 2;
    } else if (c === "|") {
      endSeg("|");
      i += text[i + 1] === "&" ? 2 : 1;
    } else if (c === "&" && text[i + 1] === ">") {
      i += 1; // `&>file` behaves like `>file`
    } else if (c === "&") {
      endSeg("&");
      i++;
    } else if ((c === "<" || c === ">") && text[i + 1] === "(") {
      // process substitution: <(cmd) / >(cmd)
      i += 2;
      const m = matchParen(i);
      nested.push(m.inner);
      cur.tokens.push({ v: `<(${m.inner})`, unresolved: true, quoted: false, procsub: m.inner });
      i = m.next;
    } else if (c === ">" || c === "<") {
      let op = c;
      i++;
      if (text[i] === c) {
        op += c;
        i++;
      }
      let strip = false;
      if (op === "<<" && text[i] === "-") {
        strip = true;
        i++;
      }
      if (op === ">" && text[i] === "|") i++; // `>|` (clobber) behaves like `>`
      while (i < n && /[ \t]/.test(text[i])) i++;
      const target = readWord();
      if (op === "<<") pending.push({ seg: cur, delim: target.v, strip });
      else cur.redirects.push({ op, target: target.v });
    } else {
      const tok = readWord();
      if (!tok.quoted && /^\d+$/.test(tok.v) && (text[i] === ">" || text[i] === "<")) continue; // file descriptor such as 2>
      if (tok.v !== "" || tok.quoted) cur.tokens.push(tok);
      else i++; // never loop on an unexpected character
    }
  }
  endSeg(";");
  return { segs, nested, unbalanced };
}

// ---------------------------------------------------------------------------------------------------------------
const baseName = (s) => String(s).replace(/\\/g, "/").split("/").pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
const isVar = (v) => /^\$/.test(v) || /^%.*%$/.test(v) || /^`/.test(v);

// Strip leading keywords, VAR=value assignments and wrappers (sudo, env, nohup, xargs…) and return the real command.
function unwrap(seg) {
  let t = seg.tokens.map((x) => ({ ...x }));
  let viaXargs = false;
  for (let guard = 0; guard < 12 && t.length; guard++) {
    if (LEADING.has(t[0].v) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0].v)) {
      t.shift();
      continue;
    }
    const name = baseName(t[0].v);
    if (!PREFIXES.has(name)) break;
    t.shift();
    if (name === "xargs") viaXargs = true;
    const valueFlags = name === "sudo" || name === "doas" ? new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T"]) : name === "xargs" ? new Set(["-n", "-I", "-P", "-L", "-s", "-d", "-E"]) : new Set(["-u", "-n"]);
    while (t.length && (t[0].v.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0].v))) {
      const f = t.shift().v;
      if (valueFlags.has(f) && t.length) t.shift();
    }
    if (name === "timeout" && t.length && /^\d/.test(t[0].v)) t.shift();
  }
  if (!t.length) return null;
  return { name: baseName(t[0].v), args: t.slice(1), viaXargs, redirects: seg.redirects, pipedFrom: seg.pipedFrom, heredoc: seg.heredoc || "", raw: t.map((x) => x.v).join(" ") };
}

// ---------------------------------------------------------------------------------------------------------------
function normPath(v) {
  return String(v).replace(/\\/g, "/");
}

function homePatterns(home) {
  const h = normPath(home).replace(/\/+$/, "").toLowerCase();
  return h;
}

// Resolve `.` and `..` inside absolute paths so that `/tmp/../` is recognised as `/`.
function normAbs(v) {
  const d = v.match(/^([a-zA-Z]:)(\/.*)?$/);
  if (d) return d[1] + path.posix.normalize(d[2] || "/");
  return v.startsWith("/") ? path.posix.normalize(v) : v;
}

function redirectChecks(redirects, add) {
  for (const r of redirects) {
    if (r.op === ">" || r.op === ">>") {
      if (DISK_RE.test(normPath(r.target))) add("disk-wipe", "deny");
      if (isSecretFile(r.target)) add("secret-write", "deny");
    }
    if (r.op === "<" && isSecretRead(r.target)) add("secret-read", "ask");
  }
}

function classifyTarget(raw, ctx) {
  const v = normAbs(normPath(raw));
  const lower = v.toLowerCase();
  const home = ctx.homeNorm;
  if (/^\/+\*?$/.test(v) || /^[a-z]:\/*\*?$/i.test(v)) return "deny";
  if (/^(~|\$\{?home\}?|%userprofile%|%homepath%|\$env:(userprofile|home))\/*\*?$/i.test(v)) return "deny";
  if (home && (lower.replace(/\/+\*?$/, "") === home)) return "deny";
  if (/^\/(bin|boot|dev|etc|lib|lib64|proc|root|sbin|sys|usr|var|home|users|system|library|applications|opt)\/*\*?$/i.test(v)) return "deny";
  if (/^[a-z]:\/(windows|users|program files|program files \(x86\)|programdata)\/*\*?$/i.test(v)) return "deny";

  let t = v;
  const pwd = t.match(/^\$\{?PWD\}?(?=\/|$)/);
  if (pwd) t = normPath(ctx.cwd) + t.slice(pwd[0].length);
  if (/^(\.|\.\/|\.\.|\*|\.\*|\.\/\*|\.\/\.\*)$/.test(t)) return "ask";
  if (/(^|\/)\.\.(\/|$)/.test(t)) return "ask";
  if (/^~/.test(t) || /[$`%]/.test(t) || /\$\(/.test(t)) return "ask";
  if (path.isAbsolute(t) || /^[a-z]:\//i.test(t)) {
    const abs = path.resolve(t);
    const inside = (base) => {
      const rel = path.relative(path.resolve(base), abs);
      return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
    };
    if (inside(ctx.cwd) || ctx.tmpDirs.some(inside)) return "none";
    return "ask";
  }
  return "none";
}

const isSecretFile = (p) => {
  const base = normPath(p).split("/").pop().toLowerCase();
  if (/^\.env(\..+)?$/.test(base) && !/\.(example|sample|template)$/.test(base)) return true;
  if (/\.(pem|key|p12|pfx)$/.test(base)) return true;
  if (/^id_(rsa|ed25519|ecdsa|dsa)$/.test(base)) return true;
  return false;
};
const isSecretRead = (p) => {
  const v = normPath(p).toLowerCase();
  if (isSecretFile(p)) return true;
  if (/(^|\/)\.aws\/credentials$/.test(v) || /(^|\/)\.netrc$/.test(v) || /(^|\/)\.git-credentials$/.test(v)) return true;
  return false;
};

const protectedRef = (ref) => /^(refs\/heads\/)?(main|master)$/.test(ref.replace(/^\+/, "").split(":").pop());

function gitSub(args) {
  const v = args.map((a) => a.v);
  let i = 0;
  while (i < v.length && v[i].startsWith("-")) i += v[i] === "-C" || v[i] === "-c" ? 2 : 1;
  return { sub: v[i], rest: v.slice(i + 1) };
}

// ---------------------------------------------------------------------------------------------------------------
function analyzeCommand(c, ctx, add, prevNames) {
  const { name, args } = c;
  const vals = args.map((a) => a.v);
  const lowerVals = vals.map((a) => a.toLowerCase());
  redirectChecks(c.redirects, add);

  // process substitution that downloads code and hands it to a shell: bash <(curl …)
  if ((SHELLS.has(name) || name === "source" || name === ".") && args.some((a) => a.procsub && /^\s*(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b/i.test(a.procsub))) add("pipe-to-shell", "ask");

  // --- deleting files ------------------------------------------------------------------------------------
  if (DELETERS.has(name)) {
    let recursive = false;
    let noPreserve = false;
    const targets = [];
    const psLike = vals.some((a) => /^-(recurse|force|path|literalpath)/i.test(a)) || name === "remove-item" || name === "ri";
    for (let k = 0; k < args.length; k++) {
      const a = vals[k];
      const low = a.toLowerCase();
      if (low === "--no-preserve-root") noPreserve = true;
      if (low === "--recursive" || low === "-recurse" || low === "-r" && psLike) recursive = true;
      else if (/^-[a-z]+$/i.test(a) && !psLike && /[rR]/.test(a)) recursive = true;
      else if (psLike && /^-rec/i.test(a)) recursive = true;
      if ((name === "rd" || name === "rmdir" || name === "del" || name === "erase") && /^\/s$/i.test(a)) recursive = true;
      if (/^--?$/.test(a)) continue;
      if (a.startsWith("--")) continue;
      if (psLike && /^-/.test(a)) {
        if (PS_VALUE_FLAGS.has(low.replace(/^-/, "")) && k + 1 < args.length) {
          const isPath = /^-(literal)?path$/i.test(a);
          k++;
          if (isPath) targets.push(args[k]);
        }
        continue;
      }
      if (/^-[a-z]+$/i.test(a) && !psLike) continue;
      if ((name === "rd" || name === "rmdir" || name === "del" || name === "erase") && /^\/[a-z]$/i.test(a)) continue;
      targets.push(args[k]);
    }
    if (noPreserve && name === "rm") add("rm-root", "deny");
    if (recursive) {
      if (!targets.length && (c.viaXargs || c.pipedFrom)) add("rm-recursive-outside", "ask"); // the targets come from another command
      for (const t of targets) {
        const cls = t.unresolved ? "ask" : classifyTarget(t.v, ctx);
        if (cls === "deny") add("rm-root", "deny");
        else if (cls === "ask") add("rm-recursive-outside", "ask");
      }
    }
    return;
  }

  // --- find ... -delete / -exec rm ----------------------------------------------------------------------
  if (name === "find") {
    const paths = [];
    for (const a of vals) {
      if (a.startsWith("-") || a === "(" || a === "!") break;
      paths.push(a);
    }
    const destructive = lowerVals.includes("-delete") || (lowerVals.includes("-exec") && lowerVals.some((a) => a === "rm" || a === "remove-item"));
    if (destructive) for (const p of paths) if (classifyTarget(p, ctx) === "deny") add("rm-root", "deny");
    return;
  }

  // --- disks ---------------------------------------------------------------------------------------------
  if (name.startsWith("mkfs") || name === "wipefs") return add("disk-wipe", "deny");
  if (name === "format" && vals.some((a) => /^[a-z]:$/i.test(a))) return add("disk-wipe", "deny");
  if (name === "dd" && vals.some((a) => /^of=(\/dev\/|\\\\\.\\)/i.test(a))) return add("disk-wipe", "deny");
  if ((name === "shred" || name === "srm") && vals.some((a) => /^\/dev\//.test(a))) return add("disk-wipe", "deny");

  // --- git -----------------------------------------------------------------------------------------------
  if (name === "git") {
    const { sub, rest } = gitSub(args);
    if (sub === "push") {
      const flags = rest.filter((a) => a.startsWith("-"));
      const pos = rest.filter((a) => !a.startsWith("-"));
      const refs = pos.slice(1);
      const force = flags.some((f) => /^--force(-with-lease|-if-includes)?(=.*)?$/.test(f) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(f)) || refs.some((r) => r.startsWith("+"));
      const del = flags.includes("--delete") || flags.includes("-d") || refs.some((r) => r.startsWith(":"));
      const mirror = flags.includes("--mirror");
      if (del && refs.some((r) => protectedRef(r.replace(/^:/, "")))) return add("force-push-protected", "deny");
      if (force && refs.some(protectedRef)) return add("force-push-protected", "deny");
      if (force || mirror) return add("git-history-loss", "ask");
      return;
    }
    if (sub === "add" && rest.some((a) => !a.startsWith("-") && isSecretFile(a))) return add("secret-commit", "ask");
    if (sub === "reset" && rest.includes("--hard")) return add("git-history-loss", "ask");
    if (sub === "clean" && rest.some((a) => /^-[a-zA-Z]*f/.test(a) || a === "--force") && !rest.some((a) => a === "-n" || a === "--dry-run")) return add("git-history-loss", "ask");
    if (sub === "checkout" && rest.includes(".")) return add("git-history-loss", "ask");
    if (sub === "restore" && rest.includes(".") && !rest.includes("--staged")) return add("git-history-loss", "ask");
    if (sub === "branch" && rest.some((a) => a === "-D" || a === "--delete" && rest.includes("--force"))) return add("git-history-loss", "ask");
    if (sub === "stash" && (rest[0] === "clear" || rest[0] === "drop")) return add("git-history-loss", "ask");
    return;
  }

  // --- writing secrets -------------------------------------------------------------------------------------
  const writes = [];
  if (name === "tee") writes.push(...vals.filter((a) => !a.startsWith("-")));
  if (name === "dd") for (const a of vals) if (/^of=/.test(a)) writes.push(a.slice(3));
  if (["cp", "mv", "install", "copy", "move", "copy-item", "move-item", "ln"].includes(name)) {
    const pos = vals.filter((a) => !a.startsWith("-"));
    if (pos.length >= 2) writes.push(pos[pos.length - 1]);
  }
  if (["set-content", "add-content", "out-file", "sc", "ac"].includes(name)) {
    for (let k = 0; k < vals.length; k++) {
      if (/^-(file)?path$|^-literalpath$/i.test(vals[k]) && vals[k + 1]) writes.push(vals[k + 1]);
    }
    const first = vals.find((a) => !a.startsWith("-"));
    if (first) writes.push(first);
  }
  if (writes.some((w) => isSecretFile(w))) add("secret-write", "deny");

  // --- reading secrets --------------------------------------------------------------------------------------
  if (READERS.has(name)) {
    if (vals.filter((a) => !a.startsWith("-")).some((r) => isSecretRead(r))) add("secret-read", "ask");
  }
  // copying or uploading a secret: cp .env /tmp/x, tar czf x.tgz .env, curl -F file=@.env …
  if (EXFIL.has(name)) {
    const operands = vals
      .flatMap((a) => {
        const m = a.match(/^--?[\w-]+=(.+)$/);
        return m ? [m[1]] : [a];
      })
      .filter((a) => !a.startsWith("-"))
      .map((a) => a.replace(/^[^=@]*=@/, "").replace(/^@/, ""));
    if (operands.some((o) => isSecretRead(o))) add("secret-read", "ask");
  }

  // --- pipes into a shell ---------------------------------------------------------------------------------
  if (c.pipedFrom) {
    const prev = prevNames.get(c.pipedFrom);
    const downloader = ["curl", "wget", "iwr", "irm", "invoke-webrequest", "invoke-restmethod"].includes(prev && prev.name);
    const decoder = prev && prev.name === "base64" && prev.args.some((a) => /^(-d|--decode|-D)$/.test(a.v));
    const sink = SHELLS.has(name) || ["iex", "invoke-expression", "pwsh", "powershell", "python", "python3", "node", "perl", "ruby"].includes(name);
    if ((downloader || decoder) && sink && !vals.some((a) => /^-[a-z]*c$/.test(a))) add("pipe-to-shell", "ask");
  }

  // --- databases ----------------------------------------------------------------------------------------------
  if (DB_CLIENTS.has(name)) {
    const text = `${vals.join(" ")} ${c.heredoc || ""}`;
    if (/\b(drop\s+(table|database|schema|index|view)|truncate(\s+table)?)\b/i.test(text)) add("sql-destructive", "ask");
    else if (/\bdelete\s+from\s+\S+/i.test(text) && !/\bwhere\b/i.test(text)) add("sql-destructive", "ask");
    else if (name === "redis-cli" && /\b(flushall|flushdb)\b/i.test(text)) add("sql-destructive", "ask");
  }

  // --- permissions ----------------------------------------------------------------------------------------------
  if (name === "chmod" && vals.some((a) => a === "-R" || a === "--recursive") && vals.some((a) => /^(0?777|a\+rwx|ugo\+rwx|\+rwx)$/.test(a))) add("perm-recursive", "ask");
  if ((name === "chown" || name === "chmod") && vals.some((a) => a === "-R" || a === "--recursive")) {
    if (vals.filter((a) => !a.startsWith("-")).slice(1).some((a) => classifyTarget(a, ctx) === "deny")) add("perm-recursive", "ask");
  }

  // --- irreversible publishing -----------------------------------------------------------------------------------
  const sub = lowerVals.filter((a) => !a.startsWith("-"));
  if (["npm", "yarn", "pnpm"].includes(name) && ["publish", "unpublish"].includes(sub[0])) add("publish-irreversible", "ask");
  if (name === "gh" && ((sub[0] === "repo" && sub[1] === "delete") || (sub[0] === "release" && sub[1] === "delete"))) add("publish-irreversible", "ask");
  if (name === "twine" && sub[0] === "upload") add("publish-irreversible", "ask");
  if (name === "cargo" && sub[0] === "publish") add("publish-irreversible", "ask");
}

// ---------------------------------------------------------------------------------------------------------------
function inspect(text, ctx, add, depth) {
  if (depth > MAX_DEPTH) return add("too-nested", "ask");
  const { segs, nested, unbalanced } = lex(text);
  void unbalanced;
  const prevNames = new Map();
  for (const seg of segs) {
    const c = unwrap(seg);
    if (!c) {
      redirectChecks(seg.redirects, add); // e.g. `done < .env`, `fi > .env`
      continue;
    }
    prevNames.set(seg, c);
    const vals = c.args.map((a) => a.v);

    // inline code of interpreters: look at the string literals (system("rm -rf /"), rmtree('/'), execSync('…'))
    if (INTERPRETERS.has(c.name)) {
      const k = vals.findIndex((a) => /^-(c|e|E|r)$/.test(a));
      const code = k >= 0 ? vals[k + 1] : undefined;
      if (typeof code === "string") {
        const literals = [...code.matchAll(/(["'])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]).slice(0, 12);
        const removes = /rmtree|rmSync|rmdirSync|removeSync|remove_tree|unlinkSync|os\.remove/.test(code);
        const runs = /(system|exec|execSync|spawn|spawnSync|popen|run|check_output|call)\s*\(/.test(code);
        for (const l of literals) {
          if (removes) {
            const cls = classifyTarget(l, ctx);
            if (cls === "deny") add("rm-root", "deny");
            else if (cls === "ask" && /[\/\\~]|\.\./.test(l)) add("rm-recursive-outside", "ask");
          }
          if (runs && /\s/.test(l)) inspect(l, ctx, add, depth + 1);
        }
      }
    }

    // shells and eval: analyze the inner command string
    let inner = null;
    if (SHELLS.has(c.name)) {
      const k = vals.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
      if (k >= 0 && vals[k + 1] !== undefined) inner = vals[k + 1];
    } else if (c.name === "eval") {
      inner = vals.join(" ");
    } else if (["pwsh", "powershell"].includes(c.name)) {
      const k = vals.findIndex((a) => /^-(c|command)$/i.test(a));
      if (k >= 0) inner = vals.slice(k + 1).join(" ");
      if (vals.some((a) => /^-(e|enc|encodedcommand)$/i.test(a))) add("encoded-command", "ask");
    } else if (c.name === "cmd") {
      const k = vals.findIndex((a) => /^\/[ck]$/i.test(a));
      if (k >= 0) inner = vals.slice(k + 1).join(" ");
    }
    if (SHELLS.has(c.name) && c.heredoc) inspect(c.heredoc, ctx, add, depth + 1); // bash <<EOF … EOF
    if (inner !== null) {
      const first = inner.trim().split(/\s+/)[0] || "";
      if (isVar(first) || /^\$\(/.test(first)) add("eval-unresolved", "ask");
      inspect(inner, ctx, add, depth + 1);
    }
    analyzeCommand(c, ctx, add, prevNames);
  }
  for (const n of nested) inspect(n, ctx, add, depth + 1);
}

// ---------------------------------------------------------------------------------------------------------------
function cleanConfig(config) {
  const c = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  const regexes = (list) =>
    (Array.isArray(list) ? list : []).flatMap((p) => {
      if (typeof p !== "string") return [];
      try {
        return [new RegExp(p)];
      } catch {
        return [];
      }
    });
  const rules = (list, level) =>
    (Array.isArray(list) ? list : []).flatMap((r) => {
      if (!r || typeof r.id !== "string" || typeof r.pattern !== "string") return [];
      try {
        return [{ id: r.id, level, re: new RegExp(r.pattern), reason: typeof r.reason === "string" ? r.reason : `project rule ${r.id}` }];
      } catch {
        return [];
      }
    });
  return {
    allow: regexes(c.allow),
    disableAsk: (Array.isArray(c.disableAsk) ? c.disableAsk : []).filter((x) => typeof x === "string"),
    custom: [...rules(c.ask, "ask"), ...rules(c.deny, "deny")],
  };
}

function evaluate(command, opts = {}) {
  const none = { decision: "none", matches: [] };
  if (typeof command !== "string" || !command.trim()) return none;
  const home = opts.home || os.homedir();
  const ctx = {
    cwd: opts.cwd || process.cwd(),
    homeNorm: homePatterns(home),
    tmpDirs: opts.tmpDirs || [os.tmpdir(), "/tmp", "/var/tmp"],
  };
  const cfg = cleanConfig(opts.config);
  const found = new Map();
  const add = (id, level, reason) => {
    const key = `${level}:${id}`;
    if (!found.has(key)) found.set(key, { id, level, reason: reason || REASONS[id] || id });
  };

  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(command)) add("fork-bomb", "deny");
  try {
    inspect(command, ctx, add, 0);
  } catch {
    add("eval-unresolved", "ask", "the command could not be analyzed safely");
  }
  for (const r of cfg.custom) if (r.re.test(command)) add(r.id, r.level, r.reason);

  let matches = [...found.values()];
  const allowed = cfg.allow.some((re) => re.test(command));
  matches = matches.filter((m) => m.level === "deny" || m.id.startsWith("project:") || (!allowed && !cfg.disableAsk.includes(m.id)) || cfg.custom.some((r) => r.id === m.id && r.level === "ask"));
  const decision = matches.some((m) => m.level === "deny") ? "deny" : matches.some((m) => m.level === "ask") ? "ask" : "none";
  return { decision, matches };
}

module.exports = { evaluate, REASONS };
