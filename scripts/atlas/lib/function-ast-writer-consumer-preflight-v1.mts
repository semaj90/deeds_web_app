import { createHash } from 'node:crypto';
import { writeAtlasAstNodes } from './atlas-ast-nodes-writer.mjs';
import { createFunctionRegistryPostgresReadPortsV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.ts';

type Ports = ReturnType<typeof createFunctionRegistryPostgresReadPortsV1>;
type SymbolRow = Parameters<Ports['getAstCandidates']>[0];
type BindingRow = Parameters<Ports['getAstCandidates']>[1];

function plannedInsertRow(sql: string, parameters: unknown[]): Record<string, unknown> {
  const match = sql.match(/INSERT INTO atlas_ast_nodes\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/s);
  if (!match) throw new Error('AST_WRITER_INSERT_SHAPE_UNSUPPORTED');
  const columns = match[1].split(',').map((column) => column.trim());
  const expressions = match[2].split(',').map((expression) => expression.trim());
  if (columns.length !== expressions.length) throw new Error('AST_WRITER_INSERT_ARITY_MISMATCH');
  return Object.fromEntries(columns.map((column, index) => {
    const expression = expressions[index];
    const parameter = expression.match(/^\$(\d+)(?:::[a-z0-9_]+)?$/i);
    if (parameter) {
      const ordinal = Number(parameter[1]);
      if (ordinal < 1 || ordinal > parameters.length) throw new Error('AST_WRITER_INSERT_PARAMETER_MISSING');
      return [column, parameters[ordinal - 1]];
    }
    if (expression === "''") return [column, ''];
    throw new Error('AST_WRITER_INSERT_EXPRESSION_UNSUPPORTED');
  }));
}

export async function probeFunctionAstWriterConsumerV1(input: {
  writerInput: Parameters<typeof writeAtlasAstNodes>[1];
  symbol: SymbolRow;
  binding: BindingRow;
  sourceBytes: Uint8Array;
}) {
  const sourceDigest = createHash('sha256').update(input.sourceBytes).digest('hex');
  if (input.symbol.sourceRevision !== `sha256:${sourceDigest}`
    || input.binding.sourceRevision !== input.symbol.sourceRevision
    || input.binding.workspaceRevision !== input.symbol.workspaceRevision
    || input.binding.canonicalSourceRef !== input.symbol.sourceRef
    || input.writerInput.sourceRef !== input.symbol.sourceRef
    || input.writerInput.sourceRevision !== input.symbol.sourceRevision
    || input.binding.contentDigest.replace(/^sha256:/, '') !== sourceDigest) {
    throw new Error('AST_PREFLIGHT_SOURCE_BINDING_MISMATCH');
  }
  if (input.writerInput.nodes.length !== 1) throw new Error('AST_PREFLIGHT_EXPECTED_ONE_DECLARATION');
  const declaration = input.writerInput.nodes[0];
  if (declaration.qualifiedSymbol !== input.symbol.qualifiedName
    || declaration.startByte !== input.symbol.byteStart || declaration.endByte !== input.symbol.byteEnd
    || declaration.sourceContentDigest.replace(/^sha256:/, '') !== sourceDigest) {
    throw new Error('AST_PREFLIGHT_DECLARATION_MISMATCH');
  }
  if (!Number.isSafeInteger(declaration.startByte) || !Number.isSafeInteger(declaration.endByte)
    || declaration.startByte < 0 || declaration.endByte <= declaration.startByte
    || declaration.endByte > input.sourceBytes.byteLength) throw new Error('AST_PREFLIGHT_SPAN_INVALID');
  new TextDecoder('utf-8', { fatal: true }).decode(input.sourceBytes);
  new TextDecoder('utf-8', { fatal: true }).decode(input.sourceBytes.subarray(declaration.startByte, declaration.endByte));

  const plannedRows: Record<string, unknown>[] = [];
  const recordingClient = {
    async query(sql: string, parameters: unknown[]) {
      if (sql.includes('FROM public.atlas_repository_identity')) {
        if (parameters[0] !== input.binding.repoId) throw new Error('AST_PREFLIGHT_REPOSITORY_MISMATCH');
        return { rows: [{ repository_id: input.binding.astRepoId }], rowCount: 1 };
      }
      plannedRows.push(plannedInsertRow(sql, parameters));
      return { rows: [], rowCount: 0 };
    },
  };
  const writerResult = await writeAtlasAstNodes(
    recordingClient as unknown as Parameters<typeof writeAtlasAstNodes>[0], input.writerInput,
  );

  let lookup: unknown[] | undefined;
  const ports = createFunctionRegistryPostgresReadPortsV1({
    async query(sql, parameters) {
      if (!['WITH RECURSIVE source_paths', 'candidates AS MATERIALIZED', 'n.repo_id = $1 AND n.relative_path = $2',
        'n.source_revision = $3 AND n.source_content_hash IN ($4, $5)',
        'n.qualified_symbol = $6 AND n.start_byte = $7 AND n.end_byte = $8',
        'AND (SELECT count(*) FROM source_paths) = 1',
        'AND EXISTS (SELECT 1 FROM source_paths WHERE canonical_source_ref = $11)']
        .every((clause) => sql.includes(clause))) throw new Error('AST_PREFLIGHT_UNEXPECTED_READER_QUERY');
      lookup = parameters;
      return { rows: [] };
    },
    release() {},
  }, '/unused-preflight-root');
  await ports.getAstCandidates(input.symbol, input.binding, input.sourceBytes);
  if (plannedRows.length !== 1 || !lookup) throw new Error('AST_PREFLIGHT_CAPTURE_INCOMPLETE');
  const planned = plannedRows[0];
  const lookupFields = {
    repo_id: planned.repo_id === lookup[0],
    relative_path: planned.relative_path === lookup[1],
    source_revision: planned.source_revision === lookup[2],
    source_content_hash: planned.source_content_hash === lookup[3] || planned.source_content_hash === lookup[4],
    qualified_symbol: planned.qualified_symbol === lookup[5],
    start_byte: planned.start_byte === lookup[6],
    end_byte: planned.end_byte === lookup[7],
  };
  const signaturePresent = typeof planned.normalized_signature === 'string' && planned.normalized_signature.trim().length > 0;
  const signatureCompatible = signaturePresent && (input.symbol.signatureNormalized === null
    || planned.normalized_signature === input.symbol.signatureNormalized);
  return {
    schema: 'atlas.function-ast-writer-consumer-preflight.v1',
    status: 'DIAGNOSTIC_ONLY',
    symbolVersionId: input.symbol.symbolVersionId,
    workspaceRevision: input.symbol.workspaceRevision,
    sourceRevision: input.symbol.sourceRevision,
    lookupFields,
    lookupCompatible: Object.values(lookupFields).every(Boolean),
    storedRelativePath: planned.relative_path,
    requestedRelativePath: lookup[1],
    signaturePresent,
    signatureCompatible,
    ancestryVerified: false,
    statementsCaptured: plannedRows.length,
    rowsInserted: writerResult.inserted,
    eligibleForApply: false,
    contextManifestAdmitted: false,
    writesPerformed: false,
    canonicalAuthority: false,
  } as const;
}
