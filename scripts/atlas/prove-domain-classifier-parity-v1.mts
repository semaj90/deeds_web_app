import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDomainClassifierParityReport, evaluateDomainClassifierTrainingReadinessV1 } from '../../sveltekit-frontend/src/lib/server/ace/features/domain-classifier-parity-v1.ts';

const repoRoot = resolve(process.cwd());
const reportPath = resolve(repoRoot, 'docs/reports/domain-classifier-parity-v1.json');
const parity = buildDomainClassifierParityReport(resolve(repoRoot, 'sveltekit-frontend'));
const report = {
  ...parity,
  trainingReadiness: evaluateDomainClassifierTrainingReadinessV1({
    corpusRows: parity.fixture.rowCount,
    observedClassCount: new Set(parity.rows.map((row) => row.taxonomyLabel).filter((label) => label && label !== 'general')).size,
  }),
};
mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, exactMatches: report.exactMatches, disagreements: report.disagreements.length, missingLabels: report.missingLabels.length, trainingReady: report.trainingReadiness.status, writesPerformed: false, reportPath }, null, 2));
