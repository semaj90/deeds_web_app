#!/usr/bin/env node

import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authorityAuditCompletedEventSchema,
  type AuthorityAuditCompletedEventV1,
} from '../../src/lib/server/queue/event-fabric.js';
import { publishEventIdempotent } from '../../src/lib/server/queue/valkey-event-stream.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '../..');
const ROOT = resolve(FRONTEND, '..');

const RUN_OWNER_REPORT = resolve(ROOT, 'docs/reports/current-graphify-run-owner-v1.json');
const PROMOTION_REPORT = resolve(ROOT, 'docs/reports/parent-atlas-promotion-gates-v1.json');

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function readJson(path: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, any>;
}

function deterministicUuid(seed: string): string {
  const bytes = Buffer.from(crypto.createHash('sha256').update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pickWorkspaceId(runOwner: Record<string, any>): string {
  return String(
    runOwner.currentRun?.workspaceId ??
      runOwner.currentRun?.workspace_id ??
      runOwner.workspaceId ??
      runOwner.workspace_id ??
      process.env.ATLAS_WORKSPACE_ID ??
      'local:deeds-web-app'
  );
}

function pickWorkspaceRevision(runOwner: Record<string, any>, promotion: Record<string, any>): string {
  const value =
    runOwner.expectedWorkspaceRevision ??
    promotion.expectedWorkspaceRevision ??
    promotion.currentWorkspaceRevision ??
    promotion.workspaceRevision;
  if (!value) {
    throw new Error('No workspace revision is present in the run-owner/promotion receipts; authority event emission fails closed.');
  }
  return String(value);
}

function buildEvent(runOwner: Record<string, any>, promotion: Record<string, any>): AuthorityAuditCompletedEventV1 {
  const workspaceRevision = pickWorkspaceRevision(runOwner, promotion);
  const workspaceId = pickWorkspaceId(runOwner);
  const gate = String(
    promotion.firstGate ??
      promotion.currentGate ??
      'CURRENT-SOURCE-TERMINAL-EXECUTION-01'
  );
  const blocker = String(
    promotion.blocker ??
      promotion.firstBlocker ??
      runOwner.promotion?.reason ??
      'NO_TERMINAL_GRAPHIFY_EXECUTION_MATCHES_ADMITTED_SNAPSHOT'
  );
  const nextGate = String(
    promotion.nextGate ??
      'SNAPSHOT-BOUND-GRAPHIFY-CANARY-01'
  );

  const stableSeed = JSON.stringify({
    gate,
    blocker,
    workspaceId,
    workspaceRevision,
    runCount: Number(runOwner.runCount ?? 0),
    completedOwnerCount: Number(runOwner.completedOwnerCount ?? 0),
    coordinatorExecutionCount: Number(runOwner.coordinatorExecutionCount ?? 0),
  });

  return authorityAuditCompletedEventSchema.parse({
    eventId: deterministicUuid(stableSeed),
    eventType: 'authority.audit.completed',
    occurredAt: new Date().toISOString(),
    producerId: 'current-graphify-run-owner-auditor',
    repositoryId: 'deeds-web-app',
    workspaceId,
    workspaceRevision,
    evidenceRefs: [
      'docs/reports/current-graphify-run-owner-v1.json',
      'docs/reports/parent-atlas-promotion-gates-v1.json',
    ],
    payload: {
      gate,
      status: 'BLOCKED',
      blocker,
      canonicalAuthority: false,
      mutationAuthorized: false,
      subjectType: 'graphify_run',
      subjectId: String(runOwner.currentRun?.id ?? runOwner.currentRun?.runId ?? 'current'),
      nextGate,
      counts: {
        terminalRunOwners: Number(runOwner.completedOwnerCount ?? 0),
        graphifyRuns: Number(runOwner.runCount ?? 0),
        coordinatorExecutions: Number(runOwner.coordinatorExecutionCount ?? 0),
      },
      sourceEvidenceRefs: [
        'docs/reports/current-graphify-run-owner-v1.json',
        'docs/reports/parent-atlas-promotion-gates-v1.json',
      ],
      metadata: {
        proofMode: hasFlag('--publish') ? 'VALKEY_STREAM_PUBLISH' : 'DRY_RUN',
        sourceReportsReadOnly: true,
        canonicalMutation: false,
        graphifyStarted: false,
        qdrantWrite: false,
        postgresWrite: false,
      },
    },
  });
}

async function main(): Promise<void> {
  const [runOwner, promotion] = await Promise.all([
    readJson(RUN_OWNER_REPORT),
    readJson(PROMOTION_REPORT),
  ]);
  const event = buildEvent(runOwner, promotion);

  if (!hasFlag('--publish')) {
    console.log(JSON.stringify({
      status: 'VALKEY_AUTHORITY_EVENT_DRY_RUN_PROVEN',
      published: false,
      event,
    }, null, 2));
    return;
  }

  const published = await publishEventIdempotent(event);
  console.log(JSON.stringify({
    status: 'VALKEY_AUTHORITY_EVENT_PUBLISHED',
    published: true,
    ...published,
    eventId: event.eventId,
    gate: event.payload.gate,
    blocker: event.payload.blocker,
    canonicalAuthority: event.payload.canonicalAuthority,
    mutationAuthorized: event.payload.mutationAuthorized,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'VALKEY_AUTHORITY_EVENT_PROOF_FAILED',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
