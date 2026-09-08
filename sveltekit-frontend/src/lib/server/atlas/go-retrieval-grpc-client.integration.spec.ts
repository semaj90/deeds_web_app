// @vitest-environment node
//
// Live (non-mocked) runtime proof for the "Tensor / gRPC / protobuf" cluster in
// openspec/changes/parent-atlas-trace-search-joinback-proof/tasks.md's "Repository-first search
// inventory".
//
// Was a CHARACTERIZATION test of a known bug (found 2026-09-08): retrieveFromGo()'s gRPC client
// init returns null (the client is an unimplemented "TODO: Generate from .proto" stub -- expected,
// not itself the bug), and its HTTP fallback called a fictional `/retrieval/retrieve` route that
// never existed on the live `legal-ai-go-retrieval` service. Fixed 2026-09-08 (same day, later
// continuation): the HTTP fallback now calls the real `/search/codebase` route (verified against
// `proto/active/retrieval.proto`'s `CodebaseSearchResponse`/`CodebaseChunk` messages AND the live
// response's actual snake_case HTTP JSON field names. This test does not claim
// the endpoint uses the ProtoJSON runtime serializer; it verifies the live
// HTTP response shape against the .proto message contract.
// and maps its response into `RetrieveResponse.evidence`. The gRPC path is still expected to fail
// (real proto codegen was never wired) -- that's fine, it's documented as a fallback path; this
// test asserts the fallback now succeeds, not that gRPC itself works.
//
// Opt-in only via RUN_LIVE_INTEGRATION=1 (needs the live legal-ai-go-retrieval container).
//
// buildContextFromGoHttp / validatePacketFromGoHttp had the identical fictional-route bug
// (`/context/build`, `/validate` -- neither ever existed on the Go service's real route table).
// Fixed 2026-09-08 (later same-day continuation): since the Go service has no equivalent route
// for either, and both call sites' own stated intent is a Postgres-canonical check/assembly (see
// routes/api/atlas/runtime-retrieve/+server.ts's VERIFY/SYNTHESIZE state comments), both fallbacks
// now query `atlas_packets` in Postgres directly instead of a nonexistent Go endpoint -- no Go
// service dependency at all for these two paths now. Gated RUN_DB_INTEGRATION=1, not
// RUN_LIVE_INTEGRATION, since they only need live Postgres.

import { describe, expect, it } from 'vitest';

const RUN_LIVE_INTEGRATION = process.env.RUN_LIVE_INTEGRATION === '1';
const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === '1';
const describeIf = RUN_LIVE_INTEGRATION ? describe : describe.skip;
const describeDbIf = RUN_DB_INTEGRATION ? describe : describe.skip;

describeIf('retrieveFromGo (live Go retrieval service, HTTP fallback fixed 2026-09-08)', () => {
	it('falls back to a real route and returns real evidence packets', async () => {
		const { createAtlasRuntimeContext } = await import('./atlas-runtime-context.js');
		const { retrieveFromGo } = await import('./go-retrieval-grpc-client.js');

		const runtime = createAtlasRuntimeContext({
			runId: 'runtime-proof-run',
			threadId: 'runtime-proof-thread',
			resourceId: 'runtime-proof-resource',
			workspaceId: 'runtime-proof-workspace',
			packetKey: 'runtime-proof-packet',
		});

		const result = await retrieveFromGo(runtime, 'function', { topK: 3 });

		expect(result.workspaceRevision).toBe(runtime.workspaceRevision);
		expect(Array.isArray(result.evidence)).toBe(true);
		expect(result.evidence.length).toBeGreaterThan(0);
		for (const hit of result.evidence) {
			expect(typeof hit.packetKey).toBe('string');
			expect(hit.packetKey.length).toBeGreaterThan(0);
			expect(typeof hit.sourceRef).toBe('string');
		}
	});
});

describeDbIf('validatePacketFromGo / buildContextFromGo (Postgres-direct, fixed 2026-09-08)', () => {
	it('validates a real packet_key against canonical Postgres and rejects an unknown one', async () => {
		const { pool } = await import('$lib/server/db/client.js');
		const { createAtlasRuntimeContext } = await import('./atlas-runtime-context.js');
		const { validatePacketFromGo } = await import('./go-retrieval-grpc-client.js');

		const { rows } = await pool.query<{ packet_key: string; source_ref: string }>(
			`SELECT packet_key, source_ref FROM atlas_packets WHERE packet_key IS NOT NULL LIMIT 1`
		);
		expect(rows.length).toBeGreaterThan(0);
		const real = rows[0]!;

		const runtime = createAtlasRuntimeContext({
			runId: 'runtime-proof-run',
			threadId: 'runtime-proof-thread',
			resourceId: 'runtime-proof-resource',
			workspaceId: 'runtime-proof-workspace',
			packetKey: real.packet_key,
		});

		const okResult = await validatePacketFromGo(runtime, real.packet_key, {
			sourceRef: real.source_ref,
		});
		expect(okResult.status).toBe('PASS');
		expect(okResult.valid).toBe(true);

		const missingResult = await validatePacketFromGo(runtime, 'nonexistent-packet-key-proof', {});
		expect(missingResult.status).toBe('FAIL');
		expect(missingResult.valid).toBe(false);
		expect(missingResult.errors.length).toBeGreaterThan(0);
	});

	it('builds a bounded context packet from real packetKeys via Postgres', async () => {
		const { pool } = await import('$lib/server/db/client.js');
		const { createAtlasRuntimeContext } = await import('./atlas-runtime-context.js');
		const { buildContextFromGo } = await import('./go-retrieval-grpc-client.js');

		const { rows } = await pool.query<{ packet_key: string }>(
			`SELECT packet_key FROM atlas_packets WHERE packet_key IS NOT NULL AND summary IS NOT NULL LIMIT 3`
		);
		expect(rows.length).toBeGreaterThan(0);
		const packetKeys = rows.map((r) => r.packet_key);

		const runtime = createAtlasRuntimeContext({
			runId: 'runtime-proof-run',
			threadId: 'runtime-proof-thread',
			resourceId: 'runtime-proof-resource',
			workspaceId: 'runtime-proof-workspace',
			packetKey: packetKeys[0]!,
		});

		const contextPacket = await buildContextFromGo(runtime, packetKeys, 2048);
		expect(typeof contextPacket.prompt).toBe('string');
		expect(contextPacket.prompt.length).toBeGreaterThan(0);
		expect(contextPacket.tokenCount).toBeGreaterThan(0);
		expect(Array.isArray(contextPacket.evidence)).toBe(true);
		expect(contextPacket.evidence.length).toBeGreaterThan(0);
	});
});
