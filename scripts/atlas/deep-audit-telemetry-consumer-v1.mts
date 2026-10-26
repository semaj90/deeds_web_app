/**
 * Read-only CLI for deep-audit telemetry receipts (M10).
 *
 * Thin wrapper over the shared runTelemetryConsumer in lib/deep-audit-telemetry-receipt-v1.mts.
 * The schema and the rules live in that one module; this file only prints results.
 * It never picks receipts by timestamp and never writes anything.
 *
 * usage: npx tsx scripts/atlas/deep-audit-telemetry-consumer-v1.mts <receipt.json> [more.json ...]
 * exit 0 only if every named receipt validates; exit 1 otherwise.
 */
import { runTelemetryConsumer } from './lib/deep-audit-telemetry-receipt-v1.mts';

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('usage: deep-audit-telemetry-consumer-v1.mts <receipt.json> [more.json ...]');
  process.exit(1);
}

const { exitCode, receipts } = runTelemetryConsumer(paths);
for (const { path, result } of receipts) {
  if (result.ok) {
    const counts = Object.entries(result.receipt.distinctCounts).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`PASS ${path}: window=${result.receipt.windowId} sha256=${result.sha256} ${counts}`);
  } else {
    console.log(`FAIL ${path}: ${result.reason}`);
  }
}
const passed = receipts.filter((r) => r.result.ok).length;
console.log(`${passed}/${receipts.length} receipts validated (read-only, nothing written)`);
process.exit(exitCode);
