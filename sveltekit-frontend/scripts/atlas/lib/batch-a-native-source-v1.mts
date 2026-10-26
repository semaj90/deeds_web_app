import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { v5 as uuidv5 } from 'uuid';
import { resolveExactIndexFileTargetV1 } from '../../../../scripts/atlas/lib/exact-index-file-target-v1.mjs';
import type { BatchASnapshotV1 } from './batch-a-validation-v1.mjs';

const NAMESPACE_TREE_NODES = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const providerUrl = new URL('../../../src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.ts', import.meta.url);
const coordinateUrl = new URL('../../../src/lib/server/atlas/indexing/source-coordinate-map-v1.ts', import.meta.url);
const svelteUrl = new URL('../../../../scripts/atlas/svelte-dom-splitter-v1.mjs', import.meta.url);

export interface BatchAIndexedNodeV1 {
  node_id: string;
  root_id: string | null;
  parent_id: string | null;
  packet_key: null;
  feature_id: null;
  feature_label: null;
  source_ref: string;
  file_path: string;
  node_type: string;
  tree_depth: number;
  metadata: Record<string, unknown>;
  lineage_version: string;
  ledger_type: 'synthetic';
}

export interface BatchAIndexedEdgeV1 {
  parent_tree_node_id: string;
  child_tree_node_id: string;
  edge_kind: 'parent_child';
  workspace_revision: null;
}

interface Observation {
  kind: string;
  start: number;
  end: number;
  text: string;
  syntaxPath: string;
  parent: number | null;
  depth: number;
}

export function excludedBatchASourceV1(sourceRef: string): boolean {
  return sourceRef.replaceAll('\\', '/').split('/').some(segment =>
    ['node_modules', '.git', '.tmp', '.svelte-kit', 'dist', 'build', 'coverage', 'site-packages', 'dist-packages', 'archives', 'archive'].includes(segment)
    || /^\.venv|^venv(?:[-_]|$)|^\.python\d/.test(segment));
}

export async function resolveBatchASourceV1(workspaceRoot: string, sourceRef: string) {
  const provider = await import(providerUrl.href);
  const extension = path.extname(sourceRef).toLowerCase();
  if (extension !== '.svelte' && !provider.nodeTreeSitterLanguageForSourceRefV1(sourceRef)) {
    throw new Error(`BATCH_A_UNSUPPORTED_LANGUAGE:${extension}`);
  }
  return resolveExactIndexFileTargetV1({
    workspaceRoot,
    relativePath: sourceRef,
    indexableExtensions: new Set([extension]),
    skipPath: excludedBatchASourceV1,
  });
}

export async function selectBatchASourcesV1(workspaceRoot: string, limit: number, explicit: string[] = []): Promise<string[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('BATCH_A_LIMIT_MUST_BE_1_TO_1000');
  let candidates = explicit;
  if (candidates.length === 0) {
    const result = spawnSync('git', ['-C', workspaceRoot, 'ls-files', '-z', '--', 'sveltekit-frontend/src', 'packages', 'python', 'simd-bridge', 'scripts/atlas'], {
      encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error('BATCH_A_TRACKED_SOURCE_DISCOVERY_FAILED');
    const provider = await import(providerUrl.href);
    candidates = result.stdout.split('\0').filter(sourceRef => sourceRef && !excludedBatchASourceV1(sourceRef)
      && (sourceRef.toLowerCase().endsWith('.svelte') || provider.nodeTreeSitterLanguageForSourceRefV1(sourceRef)));
  }
  const selected = [...new Set(candidates.map(sourceRef => sourceRef.replaceAll('\\', '/')))]
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (explicit.length > 0 && selected.length > limit) throw new Error('BATCH_A_EXPLICIT_SELECTION_EXCEEDS_LIMIT');
  return selected.slice(0, limit);
}

export async function extractBatchANativeSourceV1(sourceRef: string, bytes: Buffer) {
  if (bytes.length > 2 * 1024 * 1024) throw new Error('BATCH_A_SOURCE_EXCEEDS_2_MIB');
  const source = bytes.toString('utf8');
  if (!Buffer.from(source).equals(bytes)) throw new Error('BATCH_A_INVALID_UTF8');
  const provider = await import(providerUrl.href);
  const { createSourceOffsetConverter } = await import(coordinateUrl.href);
  const converter = createSourceOffsetConverter(source);
  const observations: Observation[] = [];
  const append = (kind: string, start: number, end: number, text: string, syntaxPath: string, parent: number | null, depth: number) => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > source.length
      || source.slice(start, end) !== text) throw new Error('BATCH_A_PARSER_SOURCE_SPAN_MISMATCH');
    converter.utf16CodeUnitToUtf8Byte(start);
    converter.utf16CodeUnitToUtf8Byte(end);
    if (observations.length >= 50000) throw new Error('BATCH_A_SOURCE_EXCEEDS_50000_NODES');
    observations.push({ kind, start, end, text, syntaxPath, parent, depth });
    return observations.length - 1;
  };
  let parserName: string;
  let parserVersion: string;
  let grammarVersion: string;
  if (sourceRef.toLowerCase().endsWith('.svelte')) {
    const { parseSvelteStructuralSourceV1 } = await import(svelteUrl.href);
    const { ast, parserVersion: version } = parseSvelteStructuralSourceV1(source);
    parserName = 'svelte/compiler';
    parserVersion = version;
    grammarVersion = version;
    const seen = new WeakSet<object>();
    const pending: Array<{ value: unknown; parent: number | null; syntaxPath: string; depth: number }> = [{ value: ast, parent: null, syntaxPath: 'root', depth: 0 }];
    while (pending.length) {
      const item = pending.pop()!;
      if (!item.value || typeof item.value !== 'object' || seen.has(item.value)) continue;
      seen.add(item.value);
      const node = item.value as Record<string, any>;
      let parent = item.parent;
      let depth = item.depth;
      if (typeof node.type === 'string' && Number.isInteger(node.start) && Number.isInteger(node.end)) {
        parent = append(node.type, node.start, node.end, source.slice(node.start, node.end), item.syntaxPath, parent, depth);
        depth++;
      }
      for (const key of Object.keys(node).sort().reverse()) {
        if (['parent', 'metadata', 'loc'].includes(key)) continue;
        const value = node[key];
        if (Array.isArray(value)) {
          for (let position = value.length - 1; position >= 0; position--) pending.push({ value: value[position], parent, syntaxPath: `${item.syntaxPath}.${key}.${position}`, depth });
        } else if (value && typeof value === 'object') pending.push({ value, parent, syntaxPath: `${item.syntaxPath}.${key}`, depth });
      }
    }
  } else {
    const language = provider.nodeTreeSitterLanguageForSourceRefV1(sourceRef);
    if (!language) throw new Error('BATCH_A_UNSUPPORTED_LANGUAGE');
    const parsed = provider.parseNodeTreeSitterSourceV1({ source, sourceRef, language });
    parserName = 'node-tree-sitter-challenger';
    parserVersion = parsed.parserRevision;
    grammarVersion = parsed.grammarRevision;
    const pending = [{ node: parsed.tree.rootNode, parent: null as number | null, syntaxPath: 'root', depth: 0 }];
    while (pending.length) {
      const { node, parent, syntaxPath, depth } = pending.pop()!;
      const missing = typeof node.isMissing === 'function' ? node.isMissing() : node.isMissing;
      if (node.type === 'ERROR' || missing) throw new Error('BATCH_A_NATIVE_SYNTAX_ERROR');
      const index = append(node.type, node.startIndex, node.endIndex, node.text, syntaxPath, parent, depth);
      const children = node.namedChildren ?? [];
      for (let position = children.length - 1; position >= 0; position--) {
        pending.push({ node: children[position], parent: index, syntaxPath: `${syntaxPath}.${position}`, depth: depth + 1 });
      }
    }
  }
  if (observations.length === 0) throw new Error('BATCH_A_NATIVE_ROOT_MISSING');
  const inputChecksum = createHash('sha256').update(bytes).digest('hex');
  const ids = observations.map(node => uuidv5(JSON.stringify([
    sourceRef, inputChecksum, parserName, parserVersion, grammarVersion, node.syntaxPath, node.kind,
  ]), NAMESPACE_TREE_NODES));
  const nodes: BatchAIndexedNodeV1[] = observations.map((node, position) => {
    const startByte = converter.utf16CodeUnitToUtf8Byte(node.start);
    const endByte = converter.utf16CodeUnitToUtf8Byte(node.end);
    if (!bytes.subarray(startByte, endByte).equals(Buffer.from(node.text))) throw new Error('BATCH_A_EXACT_BYTE_SLICE_MISMATCH');
    if (node.parent !== null) {
      const parent = observations[node.parent];
      if (node.start < parent.start || node.end > parent.end) throw new Error('BATCH_A_CHILD_OUTSIDE_PARENT');
    }
    return {
      node_id: ids[position], root_id: ids[0], parent_id: node.parent === null ? null : ids[node.parent],
      packet_key: null, feature_id: null, feature_label: null,
      source_ref: sourceRef, file_path: sourceRef, node_type: node.kind, tree_depth: node.depth,
      metadata: {
        producerId: 'batch-a-structural-materializer', producerRevision: 'native-index-observations-v1',
        parser_name: parserName, parser_version: parserVersion, grammar_version: grammarVersion,
        start_byte: startByte, end_byte: endByte, start_utf16: node.start, end_utf16: node.end,
        syntax_path: node.syntaxPath, input_checksum: inputChecksum,
        node_hash: createHash('sha256').update(bytes.subarray(startByte, endByte)).digest('hex'),
        source_revision: null, workspace_revision: null, canonicalAuthority: false,
        extractionMethod: 'native_parser', structuralTruth: false, nativeSpanVerified: true,
        boundaryPrecision: 'exact', hierarchyProven: true,
      },
      lineage_version: 'tree-nodes-v1', ledger_type: 'synthetic',
    };
  });
  const edges: BatchAIndexedEdgeV1[] = nodes.filter(node => node.parent_id !== null).map(node => ({
    parent_tree_node_id: node.parent_id!, child_tree_node_id: node.node_id, edge_kind: 'parent_child', workspace_revision: null,
  }));
  return { nodes, edges, observedNodeCount: observations.length, inputChecksum, parserName, parserVersion, grammarVersion };
}

export async function collectBatchANativeCohortV1(workspaceRoot: string, sourceRefs: string[]) {
  const nodes: BatchAIndexedNodeV1[] = [];
  const edges: BatchAIndexedEdgeV1[] = [];
  const outcomes: Array<{ sourceRef: string; status: 'PROCESSED' | 'REJECTED' | 'FAILED' | 'UNSUPPORTED'; nodeCount: number; reason?: string }> = [];
  const inputs: Array<{ sourceRef: string; checksum: string | null }> = [];
  let observedNodeCount = 0;
  for (const sourceRef of sourceRefs) {
    let checksum: string | null = null;
    try {
      const target = await resolveBatchASourceV1(workspaceRoot, sourceRef);
      if (statSync(target.absolutePath).size > 2 * 1024 * 1024) throw new Error('BATCH_A_SOURCE_EXCEEDS_2_MIB');
      const bytes = readFileSync(target.absolutePath);
      checksum = createHash('sha256').update(bytes).digest('hex');
      const result = await extractBatchANativeSourceV1(target.relativePath, bytes);
      if (nodes.length + result.nodes.length > 100000) throw new Error('BATCH_A_COHORT_EXCEEDS_100000_NODES');
      nodes.push(...result.nodes);
      edges.push(...result.edges);
      observedNodeCount += result.observedNodeCount;
      outcomes.push({ sourceRef, status: 'PROCESSED', nodeCount: result.nodes.length });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const status = reason.startsWith('INDEX_FILE_TARGET_') ? 'REJECTED'
        : reason.startsWith('BATCH_A_UNSUPPORTED_LANGUAGE') ? 'UNSUPPORTED' : 'FAILED';
      outcomes.push({ sourceRef, status, nodeCount: 0, reason });
    }
    inputs.push({ sourceRef, checksum });
  }
  const snapshot: BatchASnapshotV1 = {
    schema: 'atlas.batch-a.snapshot.v1', nodes, edges, observedNodeCount,
    structuralEvidence: outcomes.length > 0 && outcomes.every(outcome => outcome.status === 'PROCESSED'),
    inputChecksum: `sha256:${createHash('sha256').update(JSON.stringify(inputs)).digest('hex')}`,
  };
  return { snapshot, nodes, edges, outcomes, counts: {
    requested: sourceRefs.length,
    processed: outcomes.filter(outcome => outcome.status === 'PROCESSED').length,
    failed: outcomes.filter(outcome => outcome.status === 'FAILED').length,
    rejected: outcomes.filter(outcome => outcome.status === 'REJECTED').length,
    skipped: outcomes.filter(outcome => outcome.status === 'UNSUPPORTED').length,
  } };
}
