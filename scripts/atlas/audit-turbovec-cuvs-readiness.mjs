#!/usr/bin/env node
/**
 * @file scripts/atlas/audit-turbovec-cuvs-readiness.mjs
 * @description Audits external dependencies and hardware readiness for advanced retrieval components (TurboVec, cuVS).
 * This is a critical pre-flight check before running full data population or complex queries.
 */

import fs from 'fs/promises';

const REPORT_FILE = 'docs/reports/turbovec-cuvs-readiness.json';
const TURBOVEC_URL = (process.env.TURBOVEC_PYTHON_URL ?? 'http://127.0.0.1:8791').replace(/\/+$/, '');
const RAPIDS_URL = (process.env.ATLAS_GPU_8098_URL ?? 'http://127.0.0.1:8098').replace(/\/+$/, '');

async function probeJson(url, timeoutMs = 2500) {
    const startedAt = Date.now();
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        const body = await response.json().catch(() => null);
        return {
            reachable: response.ok,
            httpStatus: response.status,
            latencyMs: Date.now() - startedAt,
            body,
            error: response.ok ? null : `HTTP_${response.status}`,
        };
    } catch (error) {
        return {
            reachable: false,
            httpStatus: null,
            latencyMs: Date.now() - startedAt,
            body: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Executes a series of checks to ensure external dependencies (TurboVec, cuVS) are ready for use.
 * @param {boolean} isDryRun - If true, only reports changes without writing/upserting.
 */
async function auditDependencies(isDryRun) {
    console.log(`\n--- Starting External Dependency Audit: TurboVec & cuVS ---`);
    const auditResult = {
        schema: 'atlas.turbovec-cuvs-readiness.v2',
        run: new Date().toISOString(),
        dry_run: isDryRun,
        canonicalAuthority: false,
        writesPerformed: false,
        dependencies: {},
        blockers: [],
    };

    if (isDryRun) {
        auditResult.blockers.push('LIVE_PROBE_SKIPPED_DRY_RUN');
        auditResult.dependencies.turbovec = { status: 'NOT_PROVEN', ready_for_use: false, endpoint: `${TURBOVEC_URL}/health` };
        auditResult.dependencies.cuvs = { status: 'NOT_PROVEN', ready_for_use: false, endpoint: `${RAPIDS_URL}/health` };
    } else {
      // 1. TurboVec health (accelerator projection only)
    console.log("-> [TurboVec] Checking embedding service connectivity and version...");
    const turbovec = await probeJson(`${TURBOVEC_URL}/health`);
    auditResult.dependencies.turbovec = {
        status: turbovec.reachable ? 'OK' : 'UNAVAILABLE',
        ready_for_use: turbovec.reachable,
        endpoint: `${TURBOVEC_URL}/health`,
        latencyMs: turbovec.latencyMs,
        observed: turbovec.body,
        error: turbovec.error,
        canonicalAuthority: false,
    };
    if (!turbovec.reachable) auditResult.blockers.push('TURBOVEC_HEALTH_UNREACHABLE');

    // 2. WSL2/RAPIDS sidecar health. The sidecar is the only live cuDF/cuVS owner.
    console.log("-> [RAPIDS] Checking WSL2/cuDF/cuVS sidecar health...");
    const rapids = await probeJson(`${RAPIDS_URL}/health`);
    const body = rapids.body ?? {};
    const rapidsReady = rapids.reachable && body.ok === true && body.executionOnly === true && body.cudaAvailable === true && body.torchAvailable === true;
    auditResult.dependencies.cuvs = {
        status: rapidsReady ? 'OK' : rapids.reachable ? 'DEGRADED' : 'UNAVAILABLE',
        ready_for_use: rapidsReady,
        endpoint: `${RAPIDS_URL}/health`,
        latencyMs: rapids.latencyMs,
        observed: body,
        error: rapids.error,
        owner: 'services/atlas-gpu-8098',
        executionOnly: body.executionOnly ?? null,
        cudaAvailable: body.cudaAvailable ?? null,
        torchAvailable: body.torchAvailable ?? null,
        canonicalAuthority: false,
    };
    if (!rapids.reachable) auditResult.blockers.push('RAPIDS_8098_HEALTH_UNREACHABLE');
    else if (!rapidsReady) auditResult.blockers.push('RAPIDS_CUDA_TORCH_EXECUTION_NOT_PROVEN');
    }

    // 3. Overall Status
    const allReady = auditResult.blockers.length === 0 && Object.values(auditResult.dependencies).every(dep => dep.status === 'OK' && dep.ready_for_use);
    console.log(`\nOverall Audit Status: ${allReady ? '✅ ALL SYSTEMS GO' : '❌ WARNING: Check logs for failures.'}`);

    await fs.mkdir('docs/reports', { recursive: true });
    await fs.writeFile(REPORT_FILE, `${JSON.stringify({ ...auditResult, status: allReady ? 'LIVE_ACCELERATOR_CHAIN_PROVEN' : 'LIVE_ACCELERATOR_CHAIN_BLOCKED' }, null, 2)}\n`);
    console.log(`\n✅ Readiness report persisted: ${REPORT_FILE}`);
    console.log(JSON.stringify(auditResult));
}

// --- Execution Logic ---
async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    
    await auditDependencies(isDryRun);
}

main();
