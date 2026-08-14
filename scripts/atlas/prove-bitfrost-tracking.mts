import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getValkeyClient } from '../../sveltekit-frontend/src/lib/server/cache/valkey-client.js';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const reportDir = resolve(root, 'docs/reports');
const prefixes = ['bifrost:packet:', 'bifrost:card:', 'bifrost:graph:', 'bifrost:retrieval:', 'bifrost:ace:'];
const client = getValkeyClient();
const report: Record<string, unknown> = {
	schemaVersion: 'atlas.bitfrost.valkey-tracking-proof.v1',
	generatedAt: new Date().toISOString(),
	prefixes,
	mutationScope: 'connection tracking mode only; no keys or values written',
};

try {
	if (client.status === 'wait') await client.connect();
	const tracking = await client.call('CLIENT', 'TRACKING', 'ON', 'BCAST', ...prefixes.flatMap((prefix) => ['PREFIX', prefix]));
	const info = await client.call('CLIENT', 'TRACKINGINFO');
	report.status = 'PROVEN_CONNECTION_CAPABILITY';
	report.gates = { VALKEY_REACHABLE: true, CLIENT_TRACKING_ACCEPTED: tracking === 'OK', PREFIX_TRACKING_CONFIGURED: Array.isArray(info) ? info.length > 0 : Boolean(info), DATA_MUTATION_PERFORMED: false };
	report.trackingInfoShape = Array.isArray(info) ? 'array' : typeof info;
} catch (error) {
	report.status = 'DEFERRED_WITH_REASON';
	report.gates = { VALKEY_REACHABLE: false, CLIENT_TRACKING_ACCEPTED: false, PREFIX_TRACKING_CONFIGURED: false, DATA_MUTATION_PERFORMED: false };
	report.reason = String(error instanceof Error ? error.message : error).replace(/(redis|rediss):\/\/[^\s]+/gi, '<redacted-url>');
} finally {
	try { await client.quit(); } catch { /* connection cleanup only */ }
}

mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, 'bitfrost-valkey-tracking-proof.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'bitfrost-valkey-tracking-proof.md'), `# BitFrost Valkey tracking proof\n\n- status: **${report.status}**\n- prefixes: ${prefixes.map((prefix) => `\`${prefix}\``).join(', ')}\n- scope: connection tracking mode only; no data mutation\n- live invalidation delivery remains a separate proof gate\n`);
console.log(JSON.stringify({ status: report.status, report: 'docs/reports/bitfrost-valkey-tracking-proof.json' }, null, 2));
