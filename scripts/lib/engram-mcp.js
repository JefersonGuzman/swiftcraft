// Claude Code needs an MCP server named "engram" for the mem_* tools to exist. The engram@engram plugin only
// brings hooks and skills, so the server must be registered separately (user scope).
const { spawnSync } = require("child_process");

const REGISTER_ARGS = ["mcp", "add", "--scope", "user", "engram", "--", "engram", "mcp"];

// A function that runs the claude CLI. SWIFTCRAFT_CLAUDE_JS (tests) points to a node script that stands in for it.
function claudeRunner(env = process.env) {
  return (args) =>
    env.SWIFTCRAFT_CLAUDE_JS
      ? spawnSync(process.execPath, [env.SWIFTCRAFT_CLAUDE_JS, ...args], { encoding: "utf8", timeout: 30000 })
      : spawnSync("claude", args, { encoding: "utf8", timeout: 30000, shell: process.platform === "win32", windowsHide: true });
}

const mcpRegistered = (run) => run(["mcp", "get", "engram"]).status === 0;
const register = (run) => run(REGISTER_ARGS);

module.exports = { REGISTER_ARGS, claudeRunner, mcpRegistered, register };
