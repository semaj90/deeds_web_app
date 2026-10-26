export function parseAstGrepJsonOutputV1({ stdout, stderr, exitCode, ruleId }) {
  let matches;
  try {
    matches = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`ast-grep ${ruleId} returned non-JSON output: ${error.message}`);
  }

  if (!Array.isArray(matches)) {
    throw new Error(`ast-grep ${ruleId} returned a non-array result`);
  }

  if (exitCode === 0) return matches;
  if (exitCode === 1 && matches.length === 0 && !String(stderr ?? '').trim()) return matches;

  throw new Error(`ast-grep ${ruleId} exited ${exitCode}: ${String(stderr ?? '').slice(0, 300)}`);
}
