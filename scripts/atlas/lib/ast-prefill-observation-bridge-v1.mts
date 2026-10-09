import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { adaptAstGrepMatches } from '../../../packages/parent-atlas/src/core/ast-grep-observation-adapter.js';
import { mapAstGrepDeclarationToOrfKindV1 } from './orf-ast-kind-crosswalk-v1.mjs';
import { sourceBytesMatchRevisionV1 } from './source-byte-revision-v1.mjs';

export interface AstPrefillObservationBridgeRowV1 {
  schema: 'atlas.ast-prefill-observation-bridge-row.v1';
  packetKey: string | null;
  identityStatus: 'PACKET_REFERENCE' | 'SOURCE_ONLY_UNBOUND';
  symbolKind: string | null;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string | null;
  observation: ReturnType<typeof adaptAstGrepMatches>[number];
  admissionStatus: 'PROPOSAL_ONLY';
  canonicalAuthority: false;
}

export type AstPrefillObservationBridgeRejectionV1 = {
  packetKey: string | null;
  sourceRef: string | null;
  reason:
    | 'IDENTITY_OR_REVISION_MISSING'
    | 'SOURCE_ONLY_IDENTITY_CONFLICT'
    | 'SOURCE_PATH_INVALID'
    | 'SOURCE_READ_FAILED'
    | 'SOURCE_REVISION_MISMATCH'
    | 'SPAN_INVALID'
    | 'SPAN_CONTENT_MISMATCH'
    | 'EXTRACTOR_REVISION_MISSING'
    | 'AST_KIND_UNMAPPED'
    | 'AST_KIND_CROSSWALK_CONFLICT';
};

export async function projectAstPrefillRowToObservationV1(input: {
  row: Record<string, unknown>;
  repoRoot: string;
  readBytes?: (sourcePath: string) => Promise<Uint8Array>;
}): Promise<{ row: AstPrefillObservationBridgeRowV1 } | { rejection: AstPrefillObservationBridgeRejectionV1 }> {
  const value = input.row;
  const packetKey = typeof value.packet_key === 'string' && value.packet_key.trim() ? value.packet_key : null;
  const sourceOnly = value.identity_status === 'SOURCE_ONLY_UNBOUND';
  const sourceRef = typeof value.source_ref === 'string' && value.source_ref.trim() ? value.source_ref : null;
  const sourceRevision = typeof value.source_revision === 'string' ? value.source_revision : '';
  const reject = (reason: AstPrefillObservationBridgeRejectionV1['reason']) => ({ rejection: { packetKey, sourceRef, reason } as const });

  if ((!packetKey && !sourceOnly) || !sourceRef || !sourceRevision) return reject('IDENTITY_OR_REVISION_MISSING');
  if (sourceOnly && (packetKey || typeof value.workspace_revision !== 'string' || !value.workspace_revision.trim()
    || value.canonical_symbol_id != null || value.symbol_version_id != null)) {
    return reject('SOURCE_ONLY_IDENTITY_CONFLICT');
  }
  if (typeof value.extractor_revision !== 'string' || !value.extractor_revision.trim()) return reject('EXTRACTOR_REVISION_MISSING');
  if (typeof value.resolved_path !== 'string' || !value.resolved_path.trim()) return reject('SOURCE_PATH_INVALID');
  const resolvedRoot = await realpath(input.repoRoot);
  const sourcePath = path.resolve(resolvedRoot, value.resolved_path);
  const relativePath = path.relative(resolvedRoot, sourcePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return reject('SOURCE_PATH_INVALID');

  let sourceBytes: Uint8Array;
  try {
    if (input.readBytes) {
      sourceBytes = await input.readBytes(sourcePath);
    } else {
      const sourceRealPath = await realpath(sourcePath);
      const realRelativePath = path.relative(resolvedRoot, sourceRealPath);
      if (!realRelativePath || realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) return reject('SOURCE_PATH_INVALID');
      sourceBytes = await readFile(sourceRealPath);
    }
  } catch {
    return reject('SOURCE_READ_FAILED');
  }
  if (!sourceBytesMatchRevisionV1(sourceBytes, sourceRevision)) return reject('SOURCE_REVISION_MISMATCH');

  const startByte = value.start_byte;
  const endByte = value.end_byte;
  if (!Number.isInteger(startByte) || !Number.isInteger(endByte)
    || (startByte as number) < 0 || (endByte as number) <= (startByte as number)
    || (endByte as number) > sourceBytes.byteLength) return reject('SPAN_INVALID');

  const rawSymbolKind = typeof value.symbol_kind === 'string' ? value.symbol_kind.trim() : '';
  const rawSyntaxKind = typeof value.ast_kind === 'string' ? value.ast_kind.trim() : '';
  const symbolKind = mapAstGrepDeclarationToOrfKindV1(rawSymbolKind);
  const syntaxKind = mapAstGrepDeclarationToOrfKindV1(rawSyntaxKind);
  if ((rawSymbolKind && !symbolKind) || (rawSyntaxKind && !syntaxKind)) return reject('AST_KIND_UNMAPPED');
  const functionValuedVariable = rawSyntaxKind === 'variable_declarator' && rawSymbolKind === 'function';
  if (symbolKind && syntaxKind && symbolKind !== syntaxKind && !functionValuedVariable) return reject('AST_KIND_CROSSWALK_CONFLICT');
  const observationKind = syntaxKind ?? symbolKind;
  if (!observationKind) return reject('AST_KIND_UNMAPPED');

  const text = Buffer.from(sourceBytes).subarray(startByte as number, endByte as number).toString('utf8');
  if (!text) return reject('SPAN_INVALID');
  if (typeof value.name === 'string' && value.name.trim() && !text.includes(value.name)) return reject('SPAN_CONTENT_MISMATCH');
  const [observation] = adaptAstGrepMatches({
    source_ref: sourceRef,
    source_revision: sourceRevision,
    extractor_revision: value.extractor_revision,
    chunks: [],
    matches: [{
      rule_id: `atlas.ast-entity-prefill:${String(value.ast_kind ?? observationKind)}`,
      text,
      byte_start: startByte as number,
      byte_end: endByte as number,
      observation_kind: observationKind,
      captures: {
        name: typeof value.name === 'string' ? value.name : '',
        syntax_kind: typeof value.ast_kind === 'string' ? value.ast_kind : '',
      },
      confidence: 1,
    }],
  });
  if (!observation) throw new Error('AST_OBSERVATION_ADAPTER_RETURNED_NO_ROW');

  return {
    row: {
      schema: 'atlas.ast-prefill-observation-bridge-row.v1',
      packetKey,
      identityStatus: sourceOnly ? 'SOURCE_ONLY_UNBOUND' : 'PACKET_REFERENCE',
      symbolKind: rawSymbolKind || null,
      sourceRef,
      sourceRevision,
      workspaceRevision: typeof value.workspace_revision === 'string' && value.workspace_revision.trim()
        ? value.workspace_revision
        : null,
      observation,
      admissionStatus: 'PROPOSAL_ONLY',
      canonicalAuthority: false,
    },
  };
}
