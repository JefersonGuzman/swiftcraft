// Which files hold secrets or key material. Shared by protect-files (writes) and read-guard (reads).
// Templates (.env.example, .env.sample, .env.template) are never secret.
const CREDENTIAL_STORES = /^(\.npmrc|\.netrc|\.git-credentials|\.pypirc)$/;

function isSecretFile(file, opts = {}) {
  const p = String(file || "").replace(/\\/g, "/").toLowerCase();
  const base = p.split("/").pop();
  const isEnv = /^\.env(\..+)?$/.test(base) && !/\.(example|sample|template)$/.test(base);
  const isKey = /\.(pem|key|p12|pfx)$/.test(base) || /^id_(rsa|ed25519|ecdsa)/.test(base);
  if (isEnv || isKey) return true;
  if (opts.read) return CREDENTIAL_STORES.test(base) || /(^|\/)\.aws\/credentials$/.test(p);
  return false;
}

module.exports = { isSecretFile };
