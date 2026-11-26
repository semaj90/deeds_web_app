/**
 * Fail-closed gate for model-requested llama-server :8090 changes (CLAUDE.md, production
 * hardening). The operator token is never a tool argument and is never read into output: the
 * gate only checks that one is configured and that a fake token is refused. Per-request human
 * approval is a one-use grant file. The grant is a procedural control: a process that can write
 * files in this workspace could forge it.
 *
 * Idle slots, port-scoped PID selection and no force-kill are enforced by the controller.
 */
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyMcpOperatorToken } from './operator-token-verifier.js';
import { llamaLifecycleGrantSchema, type LlamaControlProfile, type LlamaMutationAction } from './llama-runtime-contracts.js';

const MAX_GRANT_LIFETIME_MS = 10 * 60_000;
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export type LlamaGateVerdict = { allowed: true; grantNonce: string } | { allowed: false; reason: string };

export interface LlamaLifecycleGate {
	authorize(action: LlamaMutationAction, profile: LlamaControlProfile | null): LlamaGateVerdict;
	audit(entry: Record<string, unknown>): void;
}

export interface LlamaGateOptions {
	grantPath?: string;
	auditPath?: string;
	sourcePaths?: string[];
	expectedToken?: string | undefined;
	processStartedAtMs?: number;
	now?: () => number;
}

export function createLlamaLifecycleGate(options: LlamaGateOptions = {}): LlamaLifecycleGate {
	const grantPath = options.grantPath ?? path.join(REPO_ROOT, '.tmp/atlas/llama-lifecycle-grant.json');
	const auditPath = options.auditPath ?? path.join(REPO_ROOT, '.tmp/atlas/llama-lifecycle-audit.ndjson');
	const sourcePaths = options.sourcePaths ?? [
		fileURLToPath(new URL('./llama-runtime-tools.ts', import.meta.url)),
		fileURLToPath(new URL('./llama-runtime-contracts.ts', import.meta.url)),
		fileURLToPath(new URL('./llama-runtime-gate.ts', import.meta.url)),
		path.join(REPO_ROOT, 'scripts/atlas/llama-server-control.ps1'),
		path.join(REPO_ROOT, 'scripts/launch-turboquant.ps1'),
	];
	const processStartedAtMs = options.processStartedAtMs ?? Date.now() - process.uptime() * 1000;
	const now = options.now ?? Date.now;
	const deny = (reason: string): LlamaGateVerdict => ({ allowed: false, reason });

	return {
		authorize(action, profile) {
			const expected = 'expectedToken' in options ? options.expectedToken : process.env.TRACE_MCP_OPERATOR_TOKEN;
			// Gates 1 and 2: a token is configured, and a random one is refused for the right reason.
			const negative = verifyMcpOperatorToken(randomBytes(32).toString('hex'), expected ?? '');
			if (negative.authorized) return deny('OPERATOR_TOKEN_NEGATIVE_TEST_FAILED');
			if (negative.reason !== 'INVALID_OPERATOR_TOKEN') return deny(negative.reason);

			// Gate 7: this process must be newer than the code it is about to run.
			try {
				if (sourcePaths.some((file) => statSync(file).mtimeMs > processStartedAtMs)) return deny('PROCESS_OLDER_THAN_SOURCE_RESTART_REQUIRED');
			} catch {
				return deny('LIFECYCLE_SOURCE_UNREADABLE');
			}

			let raw: string;
			try {
				raw = readFileSync(grantPath, 'utf8');
			} catch {
				return deny('HUMAN_GRANT_MISSING');
			}
			let parsed: ReturnType<typeof llamaLifecycleGrantSchema.safeParse>;
			try {
				parsed = llamaLifecycleGrantSchema.safeParse(JSON.parse(raw.replace(/^﻿/, '')));
			} catch {
				return deny('HUMAN_GRANT_INVALID');
			}
			if (!parsed.success) return deny('HUMAN_GRANT_INVALID');
			const grant = parsed.data;
			const created = Date.parse(grant.createdAt);
			const expires = Date.parse(grant.expiresAt);
			if (expires - created > MAX_GRANT_LIFETIME_MS || created > now() + 60_000) return deny('HUMAN_GRANT_LIFETIME_INVALID');
			if (now() >= expires) return deny('HUMAN_GRANT_EXPIRED');
			if (grant.action !== action || grant.profile !== profile) return deny('HUMAN_GRANT_DOES_NOT_MATCH_REQUEST');
			// Consume before acting. Renamed, not deleted; a second caller loses the rename.
			try {
				renameSync(grantPath, `${grantPath}.consumed-${grant.nonce}`);
			} catch {
				return deny('HUMAN_GRANT_ALREADY_CONSUMED');
			}
			return { allowed: true, grantNonce: grant.nonce };
		},
		audit(entry) {
			mkdirSync(path.dirname(auditPath), { recursive: true });
			// writesPerformed refers to datastores; these tools never write one.
			appendFileSync(auditPath, `${JSON.stringify({ schema: 'atlas.llama-lifecycle-audit.v1', at: new Date(now()).toISOString(), writesPerformed: false, ...entry })}\n`, 'utf8');
		},
	};
}
