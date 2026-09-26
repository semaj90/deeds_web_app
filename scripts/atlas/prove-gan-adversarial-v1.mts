#!/usr/bin/env node
/**
 * GAN-ADVERSARIAL-PROOF-01 — runs ADV001-ADV016 as deterministic fixtures. No database, Redis, NATS, or file writes other than the receipt.
 * Proof level is FIXTURE_PROVEN at best: it shows the gates reject bad states; it says nothing about whether real rows satisfy them.
 * A probe passes only if the malicious fixture is rejected with EXACTLY the expected code and its benign control (when one exists) is accepted.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROBES_V1, measureHistoricalKnownGapsV1, type ProbeLane, type ProbeV1 } from './lib/gan-modern-probes-v1.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;

interface ProbeResult {
  id: string; lane: ProbeLane; origin: 'HISTORICAL' | 'MODERN'; description: string; expectedCode: string; maliciousRejectedWith: string | null;
  rejectedForExpectedReason: boolean; controlPresent: boolean; controlAccepted: boolean | null; controlResult: string | null; error: string | null; passed: boolean;
}

async function evaluate(probe: ProbeV1): Promise<ProbeResult> {
  let malicious: string | null = null;
  let control: string | null = null;
  let error: string | null = null;
  try {
    malicious = await probe.malicious();
    control = probe.control ? await probe.control() : null;
  } catch (e) {
    error = String((e as Error).message);
  }
  const rejectedForExpectedReason = malicious === probe.expectedCode;
  const controlAccepted = probe.control ? control === null : null;
  return {
    id: probe.id, lane: probe.lane, origin: probe.origin, description: probe.description, expectedCode: probe.expectedCode,
    maliciousRejectedWith: malicious, rejectedForExpectedReason, controlPresent: probe.control !== null, controlAccepted, controlResult: control, error,
    passed: error === null && rejectedForExpectedReason && controlAccepted !== false,
  };
}

const results: ProbeResult[] = [];
for (const probe of PROBES_V1) results.push(await evaluate(probe));

// The gate must be able to FAIL: each deliberately broken probe below has to be reported as failed.
const broken = (over: Partial<ProbeV1>): ProbeV1 => ({ id: 'SELFTEST', lane: 'authority', origin: 'MODERN', description: 'self-test', expectedCode: 'EXPECTED', malicious: () => 'EXPECTED', control: () => null, ...over });
const selfTests = {
  acceptedMaliciousInputDetected: !(await evaluate(broken({ malicious: () => null }))).passed,
  wrongRejectionCodeDetected: !(await evaluate(broken({ malicious: () => 'SOME_OTHER_CODE' }))).passed,
  rejectedBenignControlDetected: !(await evaluate(broken({ control: () => 'REJECTED_BENIGN' }))).passed,
  thrownErrorDetected: !(await evaluate(broken({ malicious: () => { throw new Error('boom'); } }))).passed,
  healthyProbeStillPasses: (await evaluate(broken({}))).passed,
};

const lanes: Record<ProbeLane, { total: number; passed: number }> = {
  authority: { total: 0, passed: 0 }, structuralLineage: { total: 0, passed: 0 }, semanticProjection: { total: 0, passed: 0 }, runtimeSideEffects: { total: 0, passed: 0 },
};
for (const r of results) { lanes[r.lane].total++; if (r.passed) lanes[r.lane].passed++; }
const knownGaps = await measureHistoricalKnownGapsV1();
const allPassed = results.every((r) => r.passed) && Object.values(selfTests).every(Boolean);

const receipt = {
  schema: 'atlas.gan-adversarial-proof.v1',
  status: allPassed ? 'ADVERSARIAL_FIXTURES_PROVEN' : 'ADVERSARIAL_FIXTURES_FAILED',
  proofLevel: allPassed ? 'FIXTURE_PROVEN' : 'BLOCKED',
  note: 'Fixtures test whether gates reject bad states. Whether live rows satisfy the gates is proven separately (prove-gan-audit-readonly-v1.mts). Known gaps below are measured weaknesses of the HISTORICAL validators and are not counted as passes.',
  generatedAt: new Date().toISOString(),
  totals: { probes: results.length, passed: results.filter((r) => r.passed).length, historical: results.filter((r) => r.origin === 'HISTORICAL').length, modern: results.filter((r) => r.origin === 'MODERN').length,
    withControl: results.filter((r) => r.controlPresent).length, withoutControl: results.filter((r) => !r.controlPresent).map((r) => r.id) },
  lanes, selfTests, results, knownGaps,
  producerRevision: sha(Buffer.concat([fs.readFileSync(fileURLToPath(import.meta.url)), fs.readFileSync(path.join(ROOT, 'scripts/atlas/lib/gan-modern-probes-v1.mts'))])),
  canonicalAuthority: false, writesPerformed: false, writes: { postgres: 0, redis: 0, nats: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
};

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const out = path.join(ROOT, 'docs/reports', `gan-adversarial-proof-v1-${stamp}.json`);
fs.writeFileSync(out, JSON.stringify(receipt, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ receipt: path.relative(ROOT, out), status: receipt.status, totals: receipt.totals, lanes, selfTests, failed: results.filter((r) => !r.passed).map((r) => ({ id: r.id, expected: r.expectedCode, got: r.maliciousRejectedWith, control: r.controlResult, error: r.error })), knownGaps: knownGaps.map((g) => `${g.id}: ${g.detail}`) }, null, 2));
process.exit(allPassed ? 0 : 2);
