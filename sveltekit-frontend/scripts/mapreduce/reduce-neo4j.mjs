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
 *   4. Also UPDATEs CodebaseFile node properties: topo_byte, topo_class, manifold4_x/y/z/w.
 *
 * Usage:  called programmatically — not a standalone script.
 * Export: reduceNeo4j(topoRecords, opts)
 */

const EDGE_THRESHOLD   = 0.25;  // manifold4 Euclidean distance threshold
const MAX_EDGES_PER_NODE = 8;   // cap per-node edges to keep graph sparse
const BATCH_SIZE       = 200;   // edges per Neo4j transaction

/** Euclidean distance in 4D. */
function dist4(a, b) {
  return Math.sqrt(
    (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2 + (a[3]-b[3])**2
  );
}

/**
 * Execute a Cypher query against Neo4j HTTP endpoint.
 * @param {string} neo4jUrl
 * @param {string} user
 * @param {string} pass
 * @param {string} cypher
 * @param {Record<string, unknown>} params
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
 * @param {Array<{stableKey:string,filePath:string,topoClass:string,topoByte:number,manifold4:number[]}>} topoRecords
 * @param {{ neo4jUrl:string, neo4jUser:string, neo4jPass:string, dryRun:boolean }} opts
 * @returns {Promise<{ nodesUpdated:number, edgesWritten:number, edgesSkipped:number }>}
 */
export async function reduceNeo4j(topoRecords, opts) {
  const { neo4jUrl, neo4jUser, neo4jPass, dryRun = false } = opts;

  if (!topoRecords.length) return { nodesUpdated: 0, edgesWritten: 0, edgesSkipped: 0 };

  // ── Step 1: Update CodebaseFile node properties ───────────────────────────
  let nodesUpdated = 0;
  const nodeBatches = [];
  for (let i = 0; i < topoRecords.length; i += BATCH_SIZE) {
    nodeBatches.push(topoRecords.slice(i, i + BATCH_SIZE));
  }

  if (!dryRun) {
    for (const batch of nodeBatches) {
      const cypher = `
        UNWIND $rows AS row
        MERGE (f:CodebaseFile {stable_key: row.stableKey})
        ON MATCH  SET f.topo_byte     = row.topoByte,
                      f.topo_class    = row.topoClass,
                      f.manifold4_x   = row.m4x, f.manifold4_y = row.m4y,
                      f.manifold4_z   = row.m4z, f.manifold4_w = row.m4w
        ON CREATE SET f.topo_byte     = row.topoByte,
                      f.topo_class    = row.topoClass,
                      f.manifold4_x   = row.m4x, f.manifold4_y = row.m4y,
                      f.manifold4_z   = row.m4z, f.manifold4_w = row.m4w,
                      f.file_path     = row.filePath
      `;
      const rows = batch.map(r => ({
        stableKey: r.stableKey, topoByte: r.topoByte, topoClass: r.topoClass,
        filePath:  r.filePath,
        m4x: r.manifold4[0], m4y: r.manifold4[1],
        m4z: r.manifold4[2], m4w: r.manifold4[3],
      }));
      await neo4jRun(neo4jUrl, neo4jUser, neo4jPass, cypher, { rows }).catch(e => {
        console.warn(`  ⚠ neo4j node update failed: ${e.message}`);
      });
      nodesUpdated += batch.length;
    }
  } else {
    nodesUpdated = topoRecords.length;
  }

  // ── Step 2: Compute candidate SIMILAR_TOPOLOGY edges ─────────────────────
  // Group by topo class, then O(n²) within each group (capped by MAX_EDGES_PER_NODE)
  const byClass = new Map();
  for (const r of topoRecords) {
    let arr = byClass.get(r.topoClass);
    if (!arr) { arr = []; byClass.set(r.topoClass, arr); }
    arr.push(r);
  }

  /** @type {Array<{fromKey:string,toKey:string,dist:number,topoClass:string}>} */
  const candidateEdges = [];

  for (const [topoClass, items] of byClass) {
    // Skip if only 1 item in class
    if (items.length < 2) continue;

    // Per-node edge counter to enforce cap
    const edgeCount = new Map();
    const inc = (k) => { edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1); };

    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      // Neighbours sorted by distance — pick closest MAX_EDGES_PER_NODE
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
        candidateEdges.push({ fromKey: a.stableKey, toKey: b.stableKey, dist: nb.d, topoClass });
        inc(a.stableKey);
        inc(b.stableKey);
        added++;
      }
    }
  }

  // ── Step 3: Write SIMILAR_TOPOLOGY edges to Neo4j ────────────────────────
  let edgesWritten = 0;
  const edgesSkipped = topoRecords.length * (topoRecords.length - 1) / 2 - candidateEdges.length;

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
      await neo4jRun(neo4jUrl, neo4jUser, neo4jPass, cypher, { edges: batch }).catch(e => {
        console.warn(`  ⚠ neo4j edge batch failed: ${e.message}`);
      });
      edgesWritten += batch.length;
    }
  } else {
    edgesWritten = candidateEdges.length;
  }

  return { nodesUpdated, edgesWritten, edgesSkipped: Math.max(0, edgesSkipped) };
}

/**
 * Reduce phase for 'file' records: write Neo4j IMPORTS edges for extracted symbols.
 * @param {Array<{stableKey:string,filePath:string,symbols:string[]}>} fileRecords
 * @param {{ neo4jUrl:string, neo4jUser:string, neo4jPass:string, dryRun:boolean }} opts
 */
export async function reduceNeo4jSymbols(fileRecords, opts) {
  const { neo4jUrl, neo4jUser, neo4jPass, dryRun = false } = opts;
  if (!fileRecords.length || dryRun) return { symbolsWritten: fileRecords.length };

  let symbolsWritten = 0;
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
    const rows = batch.map(r => ({
      stableKey:  r.stableKey,
      symbols:    r.symbols.filter(s => !s.startsWith('.')),
      importRefs: r.symbols.filter(s => s.startsWith('.') || s.startsWith('$lib') || s.startsWith('src/')),
    }));
    await neo4jRun(neo4jUrl, neo4jUser, neo4jPass, cypher, { rows }).catch(() => {});
    symbolsWritten += batch.length;
  }
  return { symbolsWritten };
}