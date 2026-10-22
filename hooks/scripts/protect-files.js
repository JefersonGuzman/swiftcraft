#!/usr/bin/env node
// PreToolUse: block writes to secrets and key material. Exit 2 = block, stderr goes to Claude.
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let file = "";
  try {
    file = (JSON.parse(raw).tool_input || {}).file_path || "";
  } catch {
    process.exit(0);
  }
  const p = file.replace(/\\/g, "/").toLowerCase();
  const base = p.split("/").pop();

  const isEnv = /^\.env(\..+)?$/.test(base) && !/\.(example|sample|template)$/.test(base);
  const isKey = /\.(pem|key|p12|pfx)$/.test(base) || /^id_(rsa|ed25519|ecdsa)/.test(base);

  if (isEnv || isKey) {
    process.stderr.write(
      `swiftcraft: blocked write to "${file}" (secret/key file). Edit it manually, or write a ".env.example" with placeholders instead.\n`
    );
    process.exit(2);
  }
  process.exit(0);
});
