import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGraphJsonContractStreamV1 } from './lib/graph-json-contract-stream-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const argument = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
	try {
		const exportArgument = argument('in');
		const coverageArgument = argument('coverage');
		const reportArgument = argument('report');
		if (!exportArgument || !coverageArgument || !reportArgument) {
			throw new Error('GRAPH_EXPORT_COVERAGE_AND_UNIQUE_REPORT_REQUIRED');
		}
		const exportPath = path.resolve(root, exportArgument);
		const coveragePath = path.resolve(root, coverageArgument);
		const reportPath = path.resolve(root, reportArgument);
		const reportsRoot = path.resolve(root, '.tmp/atlas');
		const relativeReport = path.relative(reportsRoot, reportPath);
		if (!relativeReport || relativeReport.startsWith('..') || path.isAbsolute(relativeReport)) {
			throw new Error('VALIDATION_REPORT_MUST_STAY_UNDER_TMP_ATLAS');
		}
		if (!fs.existsSync(exportPath)) throw new Error(`GRAPH_EXPORT_NOT_FOUND:${exportPath}`);
		const report = await validateGraphJsonContractStreamV1({ root, exportPath, coveragePath });
		fs.mkdirSync(path.dirname(reportPath), { recursive: true });
		fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
		console.log(JSON.stringify({ verdict: report.verdict, validationMode: report.validationMode, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }));
		process.exitCode = report.verdict === 'FAIL' ? 1 : 0;
	} catch (error) {
		console.error('Graph export validation failed:', error.message);
		process.exitCode = 1;
	}
}

main();
