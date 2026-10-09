import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Node, Project, SyntaxKind } from 'ts-morph';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);

function argument(name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function sha256(value: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

const sourceRef = argument('--source-ref');
const packetKey = argument('--packet-key');
const symbolVersionId = argument('--symbol-version-id');
const requestedOutput = argument('--output');
if (!sourceRef || !packetKey || !symbolVersionId || !requestedOutput) {
  throw new Error('SOURCE_PACKET_SYMBOL_AND_OUTPUT_REQUIRED');
}
if (!sourceRef.endsWith('.ts')) throw new Error('TYPESCRIPT_SOURCE_REQUIRED');

const sourcePath = path.resolve(root, sourceRef);
const relativeSource = path.relative(root, sourcePath);
if (!relativeSource || relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
  throw new Error('SOURCE_REF_ESCAPES_REPOSITORY');
}
const realRoot = fs.realpathSync(root);
const realSourcePath = fs.realpathSync(sourcePath);
if (!realSourcePath.startsWith(realRoot + path.sep)) throw new Error('SOURCE_REALPATH_ESCAPES_REPOSITORY');

const outputPath = path.resolve(root, requestedOutput);
const scratchRoot = path.resolve(root, '.tmp', 'atlas');
const relativeOutput = path.relative(scratchRoot, outputPath);
if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
  throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
}
if (fs.existsSync(outputPath)) throw new Error('OUTPUT_ALREADY_EXISTS');

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 12000,
  application_name: 'atlas-packet-ts-type-alias-semantic-alignment-v1',
});

let binding: Record<string, any> | null = null;
const client = await pool.connect();
try {
  await client.query('BEGIN TRANSACTION READ ONLY ISOLATION LEVEL REPEATABLE READ');
  await client.query("SET LOCAL statement_timeout = '12000ms'");
  const result = await client.query(`
    SELECT p.packet_key, p.source_ref, p.source_revision,
           p.workspace_revision_key AS workspace_revision,
           v.symbol_version_id, v.stable_symbol_id, v.qualified_name,
           v.byte_start, v.byte_end, v.producer_revision,
           EXISTS (
             SELECT 1
               FROM public.atlas_workspace_source_bindings b
              WHERE b.repo_id = 'deeds-web-app'
                AND b.workspace_revision = p.workspace_revision_key
                AND b.canonical_source_ref = p.source_ref
                AND b.source_revision = p.source_revision
           ) AS workspace_source_binding,
           g.workspace_revisions AS graphify_workspace_revisions
      FROM public.atlas_packets p
      JOIN public.atlas_symbol_versions v
        ON v.packet_key = p.packet_key
       AND v.source_ref = p.source_ref
       AND v.source_revision = p.source_revision
       AND v.workspace_revision = p.workspace_revision_key
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT gf.workspace_revision) AS workspace_revisions
          FROM public.graphify_files gf
         WHERE gf.source_ref = p.source_ref
           AND gf.code_source_revision = p.source_revision
      ) g ON true
     WHERE p.packet_key = $1
       AND p.source_ref = $2
       AND v.symbol_version_id = $3
       AND p.source_revision ~ '^sha256:[0-9a-f]{64}$'
       AND p.workspace_revision_key ~ '^sha256:[0-9a-f]{64}$'
     LIMIT 2
  `, [packetKey, sourceRef, symbolVersionId]);
  if (result.rows.length !== 1) throw new Error(result.rows.length ? 'PACKET_SYMBOL_BINDING_AMBIGUOUS' : 'PACKET_SYMBOL_BINDING_MISSING');
  binding = result.rows[0];
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}

const sourceBytes = fs.readFileSync(realSourcePath);
const sourceRevision = sha256(sourceBytes);
if (sourceRevision !== binding.source_revision) throw new Error('SOURCE_REVISION_MISMATCH');

const sourceText = sourceBytes.toString('utf8');
const project = new Project({ skipAddingFilesFromTsConfig: true });
const sourceFile = project.addSourceFileAtPath(realSourcePath);
const qualifiedParts = String(binding.qualified_name).split('::');
const expectedKind = qualifiedParts.find((part) => part === 'type_alias_declaration');
const symbolName = qualifiedParts.at(-1);
if (expectedKind !== 'type_alias_declaration' || !symbolName) throw new Error('QUALIFIED_NAME_NOT_TYPE_ALIAS');
const aliases = sourceFile.getTypeAliases().filter((alias) => alias.getName() === symbolName);
if (aliases.length !== 1) throw new Error(aliases.length ? 'TS_TYPE_ALIAS_AMBIGUOUS' : 'TS_TYPE_ALIAS_NOT_FOUND');
const alias = aliases[0];
const typeKeyword = alias.getFirstChildByKind(SyntaxKind.TypeKeyword);
if (!typeKeyword) throw new Error('TS_TYPE_KEYWORD_NOT_FOUND');

const checker = project.getTypeChecker();
const aliasSymbol = checker.getSymbolAtLocation(alias.getNameNode());
const references = sourceFile.getDescendantsOfKind(SyntaxKind.TypeReference).flatMap((reference) => {
  const symbol = checker.getSymbolAtLocation(reference.getTypeName());
  const declaresAlias = symbol?.getDeclarations().some((declaration) =>
    declaration.getSourceFile().getFilePath() === sourceFile.getFilePath()
    && declaration.getStart() === alias.getStart()
    && declaration.getEnd() === alias.getEnd());
  if (!declaresAlias) return [];
  const consumer = reference.getAncestors().find((ancestor) => Node.isFunctionDeclaration(ancestor));
  return [{
    consumerName: consumer && Node.isFunctionDeclaration(consumer) ? consumer.getName() ?? null : null,
    typeName: reference.getTypeName().getText(),
  }];
});
const toByte = (offset: number) => Buffer.byteLength(sourceText.slice(0, offset), 'utf8');
const syntaxStartByte = toByte(typeKeyword.getStart());
const syntaxEndByte = toByte(alias.getEnd());
const storedStartByte = Number(binding.byte_start);
const storedEndByte = Number(binding.byte_end);
const graphifyWorkspaceRevisions = Array.isArray(binding.graphify_workspace_revisions)
  ? binding.graphify_workspace_revisions
  : [];
const graphifyWorkspaceMatches = graphifyWorkspaceRevisions.includes(binding.workspace_revision);
const sourceSpanMatches = syntaxStartByte === storedStartByte && syntaxEndByte === storedEndByte;
const semanticIdentityMatches = aliasSymbol?.getName() === symbolName && references.length > 0;

const receipt: Record<string, any> = {
  schema: 'atlas.packet-ts-type-alias-semantic-alignment.v1',
  status: sourceSpanMatches && semanticIdentityMatches
    ? graphifyWorkspaceMatches ? 'SOURCE_TS_SYMBOL_SEMANTIC_MATCH' : 'SOURCE_TS_SYMBOL_SEMANTIC_MATCH_GRAPHIFY_UNBOUND'
    : 'SOURCE_TS_SYMBOL_ALIGNMENT_REJECTED',
  packetKey: binding.packet_key,
  sourceRef: binding.source_ref,
  sourceRevision,
  workspaceRevision: binding.workspace_revision,
  workspaceSourceBinding: binding.workspace_source_binding,
  symbolVersionId: binding.symbol_version_id,
  stableSymbolId: binding.stable_symbol_id,
  qualifiedName: binding.qualified_name,
  producerRevision: binding.producer_revision,
  astNodeKind: 'TypeAliasDeclaration',
  storedByteSpan: { start: storedStartByte, end: storedEndByte },
  tsMorphDeclarationByteSpan: { start: toByte(alias.getStart()), end: toByte(alias.getEnd()) },
  tsMorphSyntaxByteSpan: { start: syntaxStartByte, end: syntaxEndByte },
  declarationModifierPrefix: sourceText.slice(alias.getStart(), typeKeyword.getStart()),
  exactSyntaxSpanMatch: sourceSpanMatches,
  semanticSymbolResolved: aliasSymbol?.getName() === symbolName,
  semanticReferences: references,
  graphifyWorkspaceRevisions,
  graphifyWorkspaceMatches,
  admissionStatus: 'DIAGNOSTIC_ONLY_NOT_ADMITTED',
  canonicalAuthority: false,
  writesPerformed: false,
  databaseTransaction: 'REPEATABLE_READ_READ_ONLY_ROLLED_BACK',
  independentReadback: null,
};

const checksumPayload = { ...receipt };
delete checksumPayload.independentReadback;
receipt.receiptChecksum = sha256(JSON.stringify(checksumPayload));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
let readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
const readbackPayload = { ...readback };
delete readbackPayload.receiptChecksum;
delete readbackPayload.independentReadback;
const readbackChecksum = sha256(JSON.stringify(readbackPayload));
if (readbackChecksum !== receipt.receiptChecksum) throw new Error('RECEIPT_READBACK_MISMATCH');
receipt.independentReadback = { status: 'MATCH', receiptChecksum: readbackChecksum };
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
if (readback.independentReadback?.status !== 'MATCH' || readback.receiptChecksum !== receipt.receiptChecksum) {
  throw new Error('FINAL_RECEIPT_READBACK_MISMATCH');
}

process.stdout.write(`${JSON.stringify({
  status: receipt.status,
  exactSyntaxSpanMatch: receipt.exactSyntaxSpanMatch,
  semanticSymbolResolved: receipt.semanticSymbolResolved,
  graphifyWorkspaceMatches: receipt.graphifyWorkspaceMatches,
  independentReadback: receipt.independentReadback.status,
  admissionStatus: receipt.admissionStatus,
  canonicalAuthority: receipt.canonicalAuthority,
  writesPerformed: receipt.writesPerformed,
  reportPath: path.relative(root, outputPath).replaceAll('\\', '/'),
}, null, 2)}\n`);
