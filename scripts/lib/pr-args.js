// Parse pr-fetch.js arguments: one positional PR reference and an optional `--repo owner/name`,
// in any order.
function parseFetchArgs(argv) {
  let repo = null;
  let ref;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") {
      repo = argv[i + 1] ?? null;
      i++;
    } else if (!argv[i].startsWith("--") && ref === undefined) {
      ref = argv[i];
    }
  }
  return { ref, repo };
}

module.exports = { parseFetchArgs };
