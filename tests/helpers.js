// Shared test helper: temporary directories that are removed when the test process exits.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const made = [];
process.on("exit", () => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix = "swiftcraft-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}

module.exports = { tmp };
