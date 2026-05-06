#!/usr/bin/env node
/**
 * proto-from-zod.mjs
 *
 * Generates protobuf contracts from the canonical JSONB/Zod schema shapes used
 * throughout the YoRHa codebase (metadata envelopes, code relations, ACE retrieval).
 *
 * JSONB remains the Postgres storage format; protobuf becomes the service
 * contract for gRPC-based retrieval, embedding, and indexing services.
 *
 * Usage:
 *   node scripts/proto-from-zod.mjs
 *   npm run proto:from-zod
 *
 * Output:
 *   proto/generated/yorha_metadata.proto
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

const proto = `syntax = "proto3";

package yorha.metadata.v1;

// ── Shared blob ───────────────────────────────────────────────────────────────

message JsonBlob {
  string json = 1;
}

// ── Metadata envelope (mirrors metadata_envelopes Postgres table) ─────────────

message MetadataEnvelope {
  string id              = 1;
  string source_type     = 2;
  string stable_key      = 3;
  string repo_root       = 4;
  string file_path       = 5;
  string directory_path  = 6;
  string name            = 7;
  string language        = 8;
  string content_hash    = 9;
  int32  schema_version  = 10;

  // JSONB columns serialised as strings for transport
  string metadata_json    = 11;
  string features_json    = 12;
  string diagnostics_json = 13;

  // Qdrant pointers
  string embedding_model   = 14;
  string qdrant_collection = 15;
  string qdrant_point_id   = 16;
}

// ── Code relation (mirrors code_relations Postgres table) ─────────────────────

message CodeRelation {
  string source_key   = 1;
  string target_key   = 2;
  string relation_type = 3;
  double confidence   = 4;
  string evidence_json = 5;
  string source_file  = 6;
  int32  source_line  = 7;
  string target_file  = 8;
  int32  target_line  = 9;
}

// ── ACE retrieval audit trail ─────────────────────────────────────────────────

message AceRetrievalRun {
  string id            = 1;
  string query         = 2;
  string intent        = 3;
  string mode          = 4;
  string model         = 5;
  string metadata_json = 6;
}

message AceRetrievalHit {
  string id            = 1;
  string run_id        = 2;
  string stable_key    = 3;
  string file_path     = 4;
  string source        = 5;
  double vector_score  = 6;
  double graph_score   = 7;
  double tag_score     = 8;
  double entity_score  = 9;
  double final_score   = 10;
  int32  rank          = 11;
  string reason        = 12;
  string metadata_json = 13;
}

// ── tsgo diagnostics (mirrors tsgo_diagnostics_json JSONB) ───────────────────

message TsgoDiagnostic {
  string stable_key = 1;   // sha1(file:line:col:code:msg)
  string file_path  = 2;
  int32  line       = 3;
  int32  col        = 4;
  int32  code       = 5;
  string message    = 6;
  string category   = 7;   // "error" | "warning" | "suggestion"
}

// ── HMM ACE analyzer metadata ─────────────────────────────────────────────────

message AceHmmMeta {
  bool   hmm_analyzer_used = 1;
  string intent            = 2;
  double confidence        = 3;
  string state             = 4;   // "context_sufficient" | "context_partial" | "context_empty"
  repeated string signals  = 5;
}

// ── Services ──────────────────────────────────────────────────────────────────

service MetadataIndexService {
  rpc UpsertEnvelope (MetadataEnvelope) returns (MetadataEnvelope);
  rpc UpsertRelation (CodeRelation)    returns (CodeRelation);
}

service AceRetrievalService {
  rpc RecordRun (AceRetrievalRun) returns (AceRetrievalRun);
  rpc RecordHit (AceRetrievalHit) returns (AceRetrievalHit);
}
`;

const outDir  = path.join(ROOT, 'proto', 'generated');
const outFile = path.join(outDir, 'yorha_metadata.proto');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, proto, 'utf8');

console.log(`wrote ${path.relative(ROOT, outFile)}`);
