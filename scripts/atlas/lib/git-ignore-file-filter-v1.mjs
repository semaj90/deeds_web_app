import { spawnSync } from 'node:child_process';

export function filterGitIgnoredFiles(relativePaths, options = {}) {
  const paths = relativePaths.map((value) => String(value).replaceAll('\\', '/')).filter(Boolean);
  if (paths.length === 0) return { included: [], ignored: [] };

  const run = options.spawnSync ?? spawnSync;
  const result = run('git', ['check-ignore', '-z', '--stdin'], {
    cwd: options.cwd,
    input: `${paths.join('\0')}\0`,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
  });

  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`GIT_IGNORE_QUERY_FAILED:${result.error?.message ?? result.status}`);
  }

  const ignoredSet = new Set(String(result.stdout ?? '').split('\0').filter(Boolean));
  return {
    included: paths.filter((filePath) => !ignoredSet.has(filePath)),
    ignored: paths.filter((filePath) => ignoredSet.has(filePath)),
  };
}
