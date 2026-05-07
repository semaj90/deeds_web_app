/**
 * reduce-neo4j.mjs
 *
 * Reduce phase: writes Neo4j SIMILAR_TOPOLOGY edges and CodebaseFile node
 * updates from a shuffled 'topo' record group.
 *
 * Called by run-mapreduce-full.mjs after the Shuffle phase.
 *
 * Algorithm:
 *   1. For each (stableKey, manifold4) pair within the same topo class:
 *      compute Euclidean distance in 4D manifold space.
 *   2. Pairs with dist < EDGE_THRESHOLD get a SIMILAR_TOPOLOGY edge in Neo4j
 *      with edge properties: distance, topoClass, createdAt.
 *   3. Caps edges per node at MAX_EDGES_PER_NODE to avoid supernode explosion.
 *   4. Deduplicates bidirectional pairs — only one canonical A→B edge per pair.
 *   5. Also UPDATEs CodebaseFile node properties: topo_byte, topo_class, manifold4_x/y/z/w.
 *
 * Usage:  called programmatically — not a standalone script.
 * Export: reduceNeo4j(topoRecords, opts)
 *         reduceNeo4jSymbols(fileRecords, opts)
 *         ensureNeo4jConstraints(opts)
 */

const EDGE_THRESHOLD     = 0.25;  // manifold4 Euclidean distance threshold
const MAX_EDGES_PER_NODE = 8;     // cap per-node edges to keep graph sparse
const BATCH_SIZE         = 200;   // rows per Neo4j transaction

/** Euclidean distance in 4D. */
function dist4(a, b) {
  return Math.sqrt(
    (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2 + (a[3]-b[3])**2
  );
}

/** Canonical pair key — always smaller key first to deduplicate A→B and B→A. */
function pairKey(a, b) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/**
 * Execute a Cypher query against Neo4j HTTP endpoint.
 */
async function neo4jRun(neo4jUrl, user, pass, cypher, params = {}) {
  const res = await fetch(`${neo4jUrl}/db/neo4j/tx/commit`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
    },
    body: JSON.stringify({ statements: [{ statement: cypher, parameters: params }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join('; '));
  return data;
}

/**
 * Create indexes and constraints required for stable MERGE performance.
 * Safe to call repeatedly — all statements use IF NOT EXISTS.
 */
export async function ensureNeo4jConstraints(opts) {
  const { neo4jUrl, neo4jUser, neo4jPass, dryRun = false } = opts;
  if (dryRun) {
    console.log('[reduce-neo4j] dry-run: would create CodebaseFile constraints and indexes');
    return;
  }
  const statements = [
    `CREATE CONSTRAINT codebase_file_stable_key IF NOT EXISTS
     FOR (f:CodebaseFile) REQUIRE f.stable_key IS UNIQUE`,
    `CREATE INDEX codebase_file_path IF NOT EXISTS
     FOR (f:CodebaseFile) ON (f.file_path)`,
    `CREATE INDEX codebase_file_topo_class IF NOT EXISTS
     FOR (f:CodebaseFile) ON (f.topo_class)`,
  ];
  for (const cypher of statements) {
    await neo4jRun(neo4jUrl, neo4jUser, neo4jPass, cypher).catch(e => {
      console.warn(`  ⚠ constraint/index creation: ${e.message}`);
    });
  }
}

/**
 * @param {Array<{stableKey:string,filePath:string,topoClass:string,topoByte:number,manifold4:number[]}>} topoRecords
 * @param {{ neo4jUrl:string, neo4jUser:string, neo4jPass:string, dryRun:boolean }} opts
 * @returns {Promise<{
 *   nodesAttempted:number, nodesWritten:number, nodeFailures:number,
 *   edgesAttempted:number, edgesWritten:number, edgeFailures:number,
 *   edgesSkipped:number
 * }>}
 */
export async function reduceNeo4j(topoRecords, opts) {
  const { neo4jUrl, neo4jUser, neo4jPass, dryRun = false } = opts;

  if (!topoRecords.length) {
    return {
      nodesAttempted: 0, nodesWritten: 0, nodeFailures: 0,
      edgesAttempted: 0, edgesWritten: 0, edgeFailures: 0, edgesSkipped: 0,
    };
  }

  // ── Step 1: Update CodebaseFile node properties ───────────────────────────
  let nodesWritten  = 0;
  let nodeFailures  = 0;
  const nodesAttempted = topoRecords.length;

  if (!dryRun) {
    for (let i = 0; i < topoRecords.length; i += BATCH_SIZE) {
      const batch = topoRecords.slice(i, i + BATCH_SIZE);
      const cypher = `
        UNWIND $rows AS row
        MERGE (f:CodebaseFile {stable_key: row.stableKey})
        ON MATCH  SET f.topo_byte   = row.topoByte,
                      f.topo_class  = row.topoClass,
                      f.manifold4_x = row.m4x, f.manifold4_y = row.m4y,
                      f.manifold4_z = row.m4z, f.manifold4_w = row.m4w
        ON CREATE SET f.topo_byte   = row.topoByte,
                      f.topo_class  = row.topoClass,
                      f.manifold4_x = row.m4x, f.manifold4_y = row.m4y,
                      f.manifold4_z = row.m4z, f.manifold4_w = row.m4w,
                      f.file_path   = row.filePath
      `;
      const rows = batch.map(r => ({
        stableKey: r.stableKey, topoByte: r.topoByte, topoClass: r.topoClass,
        filePath:  r.filePath,
        m4x: r.manifold4[0], m4y: r.manifold4[1],
        m4z: r.manifold4[2], m4w: r.manifold4[3],
      }));
      try {
        await neo4jRun(neo4jUrl, neo4jUser, neo4jPass, cypher, { rows });
        nodesWritten += batch.length;
      } catch (e) {
        console.warn(`  ⚠ neo4j node update failed (batch ${i}): ${e.message}`);
        nodeFailures += batch.length;
      }
    }
  } else {
    nodesWritten = nodesAttempted;
  }

  // ── Step 2: Compute candidate SIMILAR_TOPOLOGY edges ─────────────────────
  // Group by topo class, then O(n²) within each group.
  // Deduplicate bidirectional pairs so we emit at most one canonical edge per pair.
  const byClass = new Map();
  for (const r of topoRecords) {
    let arr = byClass.get(r.topoClass);
    if (!arr) { arr = []; byClass.set(r.topoClass, arr); }
    arr.push(r);
  }

  // possiblePairs counts only within each class (not globally)
  let possiblePairs = 0;
  for (const items of byClass.values()) {
    possiblePairs += items.length * (items.length - 1) / 2;
  }

  /** @type {Array<{fromKey:string,toKey:string,dist:number,topoClass:string}>} */
  const candidateEdges = [];
  const seenPairs      = new Set();

  for (const [topoClass, items] of byClass) {
    if (items.length < 2) continue;

    const edgeCount = new Map();
    const inc = (k) => { edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1); };

    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      const neighbours = [];
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const d = dist4(a.manifold4, items[j].manifold4);
        if (d < EDGE_THRESHOLD) neighbours.push({ idx: j, d });
      }
      neighbours.sort((x, y) => x.d - y.d);

      const aCount = edgeCount.get(a.stableKey) ?? 0;
      let added = 0;
      for (const nb of neighbours) {
        if (aCount + added >= MAX_EDGES_PER_NODE) break;
        const b = items[nb.idx];
        if ((edgeCount.get(b.stableKey) ?? 0) >= MAX_EDGES_PER_NODE) continue;

        // Deduplicate: skip if we already emitted the canonical pair
        const pk = pairKey(a.stableKey, b.stableKey);
        if (seenPairs.has(pk)) continue;
        seenPairs.add(pk);

        candidateEdges.push({ fromKey: a.stableKey, toKey: b.stableKey, dist: nb.d, topoClass });
        inc(a.stableKey);
        inc(b.stableKey);
        added++;
      }
    }
  }

  const edgesSkipped = Math.max(0, possiblePairs - candidateEdges.length);

  // ── Step 3: Write SIMILAR_TOPOLOGY edges to Neo4j ────────────────────────
  let edgesWritten  = 0;
  let edgeFailures  = 0;
  const edgesAttempted = candidateEdges.length;

  if (!dryRun && candidateEdges.length > 0) {
    for (let i = 0; i < candidateEdges.length; i += BATCH_SIZE) {
      const batch = candidateEdges.slice(i, i + BATCH_SIZE);
      const cypher = `
        UNWIND $edges AS e
        MATCH (a:CodebaseFile {stable_key: e.fromKey})
        MATCH (b:CodebaseFile {stable_key: e.toKey})
        MERGE (a)-[r:SIMILAR_TOPOLOGY]->(b)
        SET r.manifold4_distance = e.dist,
            r.topo_class         = e.topoClass,
            r.updated_at         = datetime()
      `;
      try {
        await neo4jRun(neo4jUrl, neo4jUser, neo4jPass, cypher, { edges: batch });
        edgesWritten += batch.length;
      } catch (e) {
        console.warn(`  ⚠ neo4j edge batch failed (batch ${i}): ${e.message}`);
        edgeFailures += batch.length;
      }
    }
  } else {
    edgesWritten = edgesAttempted;
  }

  return { nodesAttempted, nodesWritten, nodeFailures, edgesAttempted, edgesWritten, edgeFailures, edgesSkipped };
}

/**
 * Reduce phase for 'file' records: write Neo4j IMPORTS edges + extracted_symbols.
 *
 * Input shape:
 *   { stableKey: string; filePath: string; symbols: string[]; imports: string[] }
 *
 * `symbols` — exported/declared identifiers (no path prefix)
 * `imports` — resolved import paths starting with '.', '$lib/', or 'src/'
 *
 * If only the legacy `symbols` array is present (no `imports` field), falls
 * back to the old heuristic split for backward compatibility.
 *
 * @param {Array<{stableKey:string,filePath:string,symbols:string[],imports?:string[]}>} fileRecords
 * @param {{ neo4jUrl:string, neo4jUser:string, neo4jPass:string, dryRun:boolean }} opts
 * @returns {Promise<{ symbolsAttempted:number, symbolsWritten:number, symbolFailures:number }>}
 */
export async function reduceNeo4jSymbols(fileRecords, opts) {
  const { neo4jUrl, neo4jUser, neo4jPass, dryRun = false } = opts;

  const symbolsAttempted = fileRecords.length;
  if (!fileRecords.length) return { symbolsAttempted: 0, symbolsWritten: 0, symbolFailures: 0 };
  if (dryRun) return { symbolsAttempted, symbolsWritten: symbolsAttempted, symbolFailures: 0 };

  let symbolsWritten  = 0;
  let symbolFailures  = 0;

  for (let i = 0; i < fileRecords.length; i += BATCH_SIZE) {
    const batch = fileRecords.slice(i, i + BATCH_SIZE);
    const cypher = `
      UNWIND $rows AS row
      MATCH (f:CodebaseFile {stable_key: row.stableKey})
      SET f.extracted_symbols = row.symbols
      WITH f, row
      UNWIND row.importRefs AS importRef
      MERGE (dep:CodebaseFile {file_path: importRef})
      MERGE (f)-[:IMPORTS]->(dep)
    `;
    const rows = batch.map(r => {
      // Prefer explicit imports field; fall back to heuristic split for legacy callers
      const symbols    = Array.isArray(r.imports)
        ? r.symbols
        : r.symbols.filter(s => !s.startsWith('.') && !s.startsWith('$lib') && !s.startsWith('src/'));
      const importRefs = Array.isArray(r.imports)
        ? r.imports
        : r.symbols.filter(s => s.startsWith('.') || s.startsWith('$lib') || s.startsWith('src/'));
      return { stableKey: r.stableKey, symbols, importRefs };
    });
    try {
      await neo4jRun(neo4jUrl, neo4jUser, neo4jPass, cypher, { rows });
      symbolsWritten += batch.length;
    } catch (e) {
      console.warn(`  ⚠ neo4j symbols batch failed (batch ${i}): ${e.message}`);
      symbolFailures += batch.length;
    }
  }

  return { symbolsAttempted, symbolsWritten, symbolFailures };
}
