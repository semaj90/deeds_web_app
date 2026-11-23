#!/usr/bin/env node
/**
 * Daily Graphify Kanban + ACE Context Packet Builder (v1)
 *
 * Bridges the gap when TRACE/PostgreSQL returns SNAPSHOT_EMPTY_COHORT for
 * `openspec:crime-scene-reconstruction` by compiling a deterministic,
 * checksummed, proposal-only ACE Context Packet (`atlas.kanban-ace-packet.v1`)
 * from:
 *   1. docs/reports/crime-scene-top100-quick-hits-v1.json
 *   2. docs/reports/pg18-native-capability-audit-v1.json
 *   3. docs/reports/scene-ontology-kmeans-pagerank-v1.json
 *
 * Output: docs/reports/crime-scene-kanban-ace-packet-v1.json
 * Never mutates Kanban tables or promotes task status directly.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	appendPromptNode,
	buildRtxRpcPacketDescriptor,
	compileDspyRlmPrompt,
	createPromptContextChain
} from './lib/dspy-rlm-prompt-packet-v1.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const TOP100_PATH = resolve(repoRoot, 'docs/reports/crime-scene-top100-quick-hits-v1.json');
const PG_AUDIT_PATH = resolve(repoRoot, 'docs/reports/pg18-native-capability-audit-v1.json');
const ONTO_REC_PATH = resolve(repoRoot, 'docs/reports/scene-ontology-kmeans-pagerank-v1.json');
const OKF_KW_PATH = resolve(repoRoot, 'docs/reports/okf-domain-keyword-bitmap-alignment-v1.json');
const NLP_REC_PATH = resolve(repoRoot, 'docs/reports/crime-scene-nlp-ace-recommendations-v1.json');
const OUT_PATH = resolve(repoRoot, 'docs/reports/crime-scene-kanban-ace-packet-v1.json');
const DSPY_PROMPTS_OUT_PATH = resolve(repoRoot, 'docs/reports/crime-scene-dspy-rlm-task-prompts-v1.json');

function sha256(str) {
	return createHash('sha256').update(str, 'utf8').digest('hex');
}

function main() {
	const top100 = JSON.parse(readFileSync(TOP100_PATH, 'utf8'));
	const pgAudit = JSON.parse(readFileSync(PG_AUDIT_PATH, 'utf8'));
	const ontoRec = JSON.parse(readFileSync(ONTO_REC_PATH, 'utf8'));
	const okfKw = existsSync(OKF_KW_PATH) ? JSON.parse(readFileSync(OKF_KW_PATH, 'utf8')) : null;
	const nlpRec = existsSync(NLP_REC_PATH) ? JSON.parse(readFileSync(NLP_REC_PATH, 'utf8')) : null;
	const nlpByTaskId = new Map(
		(nlpRec?.top4Proposals ?? nlpRec?.proposals ?? []).map((p) => [p.taskId, p])
	);

	const topConceptIds = (ontoRec.topRecommendations ?? []).slice(0, 5).map((r) => r.conceptId);
	const dspyTaskPrompts = [];

	const prefillTasks = top100.top100.slice(0, 16).map((item, idx) => {
		const nlp = nlpByTaskId.get(item.taskId);
		const scopedTaskId = item.scopedTaskId ?? `openspec:crime-scene-reconstruction:${item.taskId}#L${item.line}`;
		const sourceRef = `openspec/changes/crime-scene-reconstruction/tasks.md#L${item.line}`;
		const chain = createPromptContextChain({
			chainId: `task_${item.taskId.replace(/[^A-Za-z0-9_-]/g, '_')}_${item.line}`,
			domain: nlp?.domain ?? 'SCENE_RECONSTRUCTION'
		});
		appendPromptNode(chain, {
			role: 'context',
			content: `task_id=${item.taskId} | score=${item.score} | concepts=${(nlp?.concepts ?? topConceptIds).join(', ')}\n${item.summary}`,
			sourceRefs: [sourceRef],
			acePacketRef: scopedTaskId,
			featureLabel: item.status === 'PARTIAL' ? 'WIRED_NEEDS_PROOF' : 'OPEN_CANDIDATE'
		});
		const compiled = compileDspyRlmPrompt(chain, {
			query: `Propose bounded verification and patch_targets for ${item.taskId} (${sourceRef}).`
		});
		const rtxDescriptor = buildRtxRpcPacketDescriptor(chain, compiled);
		dspyTaskPrompts.push({
			taskId: item.taskId,
			scopedTaskId,
			sourceRef,
			compiledPrompt: compiled,
			rtxRpcDescriptor: rtxDescriptor
		});

		return {
			rank: idx + 1,
			taskId: item.taskId,
			changeQualifiedKey: item.changeQualifiedKey ?? `crime-scene-reconstruction/tasks.md#L${item.line}`,
			scopedTaskId,
			line: item.line,
			quickHitScore: item.score,
			ganLane: item.status === 'PARTIAL' ? 'WIRED_NEEDS_PROOF' : 'OPEN_CANDIDATE',
			sourceRef,
			ConceptID: scopedTaskId,
			ConfidenceScore: Number((item.score / 100).toFixed(2)),
			summary: item.summary,
			...(nlp ? { nlp8095: { concepts: nlp.concepts ?? [], domain: nlp.domain ?? null, rankScore: nlp.combinedScore ?? null } } : {}),
			dspyRlmPrompt: {
				chainId: chain.chainId,
				promptSha256: compiled.promptSha256,
				rtxTotalBufferBytes: rtxDescriptor.totalBufferBytes,
				alignmentBytes: rtxDescriptor.alignmentBytes
			},
			kernelDagCandidate: {
				requiresSchemaGate: true,
				requiresIndependentReadback: true,
				autoPromoteAllowed: false
			}
		};
	});

	const contextBlob = {
		featureId: 'openspec:crime-scene-reconstruction',
		pg18: {
			connected: pgAudit.postgres?.connected ?? false,
			embedded768Rows: pgAudit.postgres?.chunkEmbeddingStats?.embedded_768_rows ?? 0,
			totalChunkRows: pgAudit.postgres?.chunkEmbeddingStats?.total_rows ?? 0,
			indexCount: pgAudit.postgres?.vectorAndSceneIndexes?.length ?? 0
		},
		ontologyGraph: {
			conceptCount: ontoRec.conceptCount,
			clusterCount: ontoRec.clusterCount,
			topConceptIds: (ontoRec.topRecommendations ?? []).slice(0, 5).map((r) => r.conceptId)
		},
		...(okfKw ? {
			keywordDomainAlignment: {
				status: okfKw.status ?? null,
				shadowCorpusEntries: okfKw.shadowCorpusEntries ?? 0,
				topKCount: okfKw.topKCount ?? 0,
				domainBitmapParity: okfKw.verdicts?.DOMAIN_BITMAP_PARITY ?? null,
				hybridTopKBaseline: okfKw.verdicts?.HYBRID_TOPK_BASELINE ?? null
			}
		} : {}),
		prefillTasks
	};

	const payload = {
		schema: 'atlas.kanban-ace-packet.v1',
		authorityLabel: 'KANBAN_ACE_PROPOSAL',
		canonicalAuthority: false,
		writesPerformed: false,
		redisKeyHint: 'ace:packet:openspec-crime-scene-reconstruction-v1',
		sourceRef: 'openspec/changes/crime-scene-reconstruction/tasks.md',
		ConceptID: 'openspec:crime-scene-reconstruction',
		ConfidenceScore: 0.88,
		ContextBlob: contextBlob,
		packetSha256: sha256(JSON.stringify(contextBlob))
	};

	mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
	writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
	writeFileSync(
		DSPY_PROMPTS_OUT_PATH,
		JSON.stringify(
			{
				schema: 'atlas.dspy-rlm-task-prompts.v1',
				canonicalAuthority: false,
				writesPerformed: false,
				packetSha256: payload.packetSha256,
				taskCount: dspyTaskPrompts.length,
				tasks: dspyTaskPrompts
			},
			null,
			2
		),
		'utf8'
	);
	console.log(
		JSON.stringify(
			{
				wrote: 'docs/reports/crime-scene-kanban-ace-packet-v1.json',
				prefillCount: prefillTasks.length,
				packetSha256: payload.packetSha256,
				canonicalAuthority: payload.canonicalAuthority
			},
			null,
			2
		)
	);
}

main();
