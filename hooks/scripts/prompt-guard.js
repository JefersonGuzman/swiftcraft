#!/usr/bin/env node
// UserPromptSubmit: stop a prompt that contains a credential (token or private key) before it reaches the model.
// The reason never repeats the secret. Escape hatch for a false positive: SWIFTCRAFT_NO_PROMPT_SCAN=1.
// Bad input never blocks.
const { SECRET_PATTERNS } = require("../../scripts/lib/review.js");

if (process.env.SWIFTCRAFT_NO_PROMPT_SCAN === "1") process.exit(0);

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const prompt = String(JSON.parse(raw).prompt || "");
    const found = SECRET_PATTERNS.some((re) => new RegExp(re.source, re.flags.replace("g", "")).test(prompt));
    if (!found) process.exit(0);
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason:
          "swiftcraft: your prompt looks like it contains a credential (a token or a private key), so it was not sent to the model. " +
          "Remove it and send the prompt again, using an environment variable or a .env file instead. " +
          "If it was real, treat it as exposed: rotate or revoke it. If this is a false positive, set SWIFTCRAFT_NO_PROMPT_SCAN=1.",
      })
    );
  } catch {}
  process.exit(0);
});
