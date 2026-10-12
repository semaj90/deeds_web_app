import fs from 'node:fs';
import path from 'node:path';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function loadLatestOpenSpecCensus(reportsRoot) {
  const runRoot = path.join(reportsRoot, 'openspec-evidence');
  const runs = fs.existsSync(runRoot)
    ? fs.readdirSync(runRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, reportPath: path.join(runRoot, entry.name, 'census-v1.json') }))
      .filter(({ reportPath }) => fs.existsSync(reportPath))
    : [];
  const candidates = runs
    .map(({ name, reportPath }) => ({ name, report: readJson(reportPath) }))
    .filter((candidate) => candidate.report !== null)
    .sort((left, right) => {
      const leftTime = Date.parse(String(left.report.generatedAt ?? ''));
      const rightTime = Date.parse(String(right.report.generatedAt ?? ''));
      if (Number.isFinite(leftTime) !== Number.isFinite(rightTime)) return Number.isFinite(rightTime) ? 1 : -1;
      if (Number.isFinite(leftTime) && leftTime !== rightTime) return rightTime - leftTime;
      return right.name.localeCompare(left.name);
    });
  if (candidates.length) return candidates[0].report;
  return readJson(path.join(reportsRoot, 'openspec-evidence-portfolio-census-v2.json'));
}
