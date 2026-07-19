#!/usr/bin/env python3
"""
cuGraph PageRank for atlas_packets.page_rank_score

Reads the import/edge graph from Postgres, computes PageRank on GPU via
cuGraph (RAPIDS miniforge WSL2), then bulk-writes scores back to
atlas_packets.page_rank_score.

CUDA / RAPIDS required in the calling environment:
  conda activate rapids && python cugraph-pagerank.py [--dry-run] [--verbose]

DB connection: reads DATABASE_URL from environment (or constructs from
POSTGRES_HOST / POSTGRES_PORT / POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB).
From WSL2, use host.docker.internal or 127.0.0.1 with the Windows-mapped port.

Fallback: if cuGraph is not available, falls back to networkx.pagerank (CPU).
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser(description='cuGraph PageRank for atlas_packets')
parser.add_argument('--dry-run', action='store_true', help='Compute but do not write')
parser.add_argument('--verbose', action='store_true', help='Print per-packet scores')
parser.add_argument('--damping', type=float, default=0.85, help='PageRank damping factor')
parser.add_argument('--iterations', type=int, default=100, help='Max iterations')
parser.add_argument('--tol', type=float, default=1e-6, help='Convergence tolerance')
parser.add_argument('--min-edges', type=int, default=1,
                    help='Minimum edges for a packet to get a non-default score')
args = parser.parse_args()

# ---------------------------------------------------------------------------
# DB connection
# ---------------------------------------------------------------------------
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print('ERROR: psycopg2 not installed. Run: pip install psycopg2-binary', file=sys.stderr)
    sys.exit(1)

db_url = os.environ.get('DATABASE_URL')
if not db_url:
    host = os.environ.get('POSTGRES_HOST', '127.0.0.1')
    port = os.environ.get('POSTGRES_PORT', '5434')  # Windows-mapped port from docker-compose
    user = os.environ.get('POSTGRES_USER', 'legal_admin')
    pwd  = os.environ.get('POSTGRES_PASSWORD', '')
    db   = os.environ.get('POSTGRES_DB', 'legal_ai_db')
    db_url = f'postgresql://{user}:{pwd}@{host}:{port}/{db}'

conn = psycopg2.connect(db_url)
conn.autocommit = False

# ---------------------------------------------------------------------------
# RAPIDS / cuGraph probe (with CPU networkx fallback)
# ---------------------------------------------------------------------------
USE_CUGRAPH = False
try:
    import cudf
    import cugraph
    USE_CUGRAPH = True
    print(f'[pagerank] cuGraph available — GPU PageRank enabled')
except ImportError:
    import networkx as nx
    print(f'[pagerank] cuGraph not found — falling back to networkx CPU PageRank')
    print(f'           To enable GPU: conda activate rapids')

# ---------------------------------------------------------------------------
# Load graph edges from Postgres
# We build edges from three sources (in priority order):
#   1. hypergraph_edges (IMPORTS_MODULE, CALLS_FUNCTION edges)
#   2. atlas_packet_features.imports / exports arrays if available
#   3. Fallback: directory co-location edges (weaker signal)
# ---------------------------------------------------------------------------
print('[pagerank] Loading edge graph from Postgres...')
t0 = time.time()

with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
    # Get all packet_keys and assign integer node IDs
    cur.execute("""
        SELECT packet_key, source_ref, page_rank_score
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
        ORDER BY packet_key
    """)
    packets = cur.fetchall()

n_packets = len(packets)
print(f'[pagerank] {n_packets} packets loaded')

if n_packets == 0:
    print('[pagerank] No packets found. Exiting.')
    conn.close()
    sys.exit(0)

# Map packet_key → integer node id
node_map = {row['packet_key']: i for i, row in enumerate(packets)}
reverse_map = {i: row['packet_key'] for i, row in enumerate(packets)}
existing_scores = {row['packet_key']: row['page_rank_score'] for row in packets}

# Load edges
edges_src = []
edges_dst = []
edge_count = 0

with conn.cursor() as cur:
    # Primary: hypergraph_edges (most reliable source)
    try:
        cur.execute("""
            SELECT source_packet_key, target_packet_key
            FROM hypergraph_edges
            WHERE source_packet_key IS NOT NULL
              AND target_packet_key IS NOT NULL
              AND source_packet_key != target_packet_key
        """)
        for src_key, dst_key in cur.fetchall():
            if src_key in node_map and dst_key in node_map:
                edges_src.append(node_map[src_key])
                edges_dst.append(node_map[dst_key])
                edge_count += 1
        print(f'[pagerank] hypergraph_edges: {edge_count} edges')
    except psycopg2.errors.UndefinedTable:
        conn.rollback()
        print('[pagerank] hypergraph_edges table not found, skipping')

    # Secondary: atlas_packet_features imports/exports (if table exists)
    try:
        cur.execute("""
            SELECT apf.packet_key, unnest(apf.imports) AS import_ref
            FROM atlas_packet_features apf
            WHERE array_length(apf.imports, 1) > 0
        """)
        import_edges = 0
        for row in cur.fetchall():
            src_key = row[0]
            import_ref = row[1]
            # Try to match import_ref to a packet source_ref
            cur2 = conn.cursor()
            cur2.execute(
                "SELECT packet_key FROM atlas_packets WHERE source_ref = %s LIMIT 1",
                (import_ref,)
            )
            target = cur2.fetchone()
            if target and src_key in node_map and target[0] in node_map:
                edges_src.append(node_map[src_key])
                edges_dst.append(node_map[target[0]])
                import_edges += 1
        print(f'[pagerank] atlas_packet_features imports: {import_edges} additional edges')
        edge_count += import_edges
    except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
        conn.rollback()
        print('[pagerank] atlas_packet_features.imports not available, skipping')

print(f'[pagerank] Total edges: {edge_count} (loaded in {time.time()-t0:.2f}s)')

if edge_count == 0:
    print('[pagerank] WARNING: No edges found. All packets will get uniform score 1/N.')
    print('[pagerank] Run graphify:daily or seed-neo4j-bounded-used-packet-edges.mjs first.')

# ---------------------------------------------------------------------------
# Compute PageRank
# ---------------------------------------------------------------------------
print(f'[pagerank] Computing PageRank (damping={args.damping}, iters={args.iterations})...')
t1 = time.time()

pr_scores = {}  # packet_key -> float

if USE_CUGRAPH and edge_count > 0:
    # GPU path via cuGraph
    gdf_edges = cudf.DataFrame({'src': edges_src, 'dst': edges_dst})
    G = cugraph.Graph(directed=True)
    G.from_cudf_edgelist(gdf_edges, source='src', destination='dst')
    pr_df = cugraph.pagerank(
        G,
        alpha=args.damping,
        max_iter=args.iterations,
        tol=args.tol,
    )
    # pr_df columns: vertex, pagerank
    for _, row in pr_df.to_pandas().iterrows():
        node_id = int(row['vertex'])
        score = float(row['pagerank'])
        if node_id in reverse_map:
            pr_scores[reverse_map[node_id]] = score

elif edge_count > 0:
    # CPU fallback via networkx
    G = nx.DiGraph()
    G.add_nodes_from(range(n_packets))
    for src, dst in zip(edges_src, edges_dst):
        G.add_edge(src, dst)
    raw = nx.pagerank(
        G,
        alpha=args.damping,
        max_iter=args.iterations,
        tol=args.tol,
    )
    for node_id, score in raw.items():
        if node_id in reverse_map:
            pr_scores[reverse_map[node_id]] = score

else:
    # No edges: uniform score
    uniform = 1.0 / n_packets
    for row in packets:
        pr_scores[row['packet_key']] = uniform

elapsed = time.time() - t1
print(f'[pagerank] Computed {len(pr_scores)} scores in {elapsed:.3f}s')

# Normalize to [0, 1] relative to max score
max_score = max(pr_scores.values()) if pr_scores else 1.0
if max_score > 0:
    pr_scores = {k: v / max_score for k, v in pr_scores.items()}

# Summary stats
scores_list = sorted(pr_scores.values(), reverse=True)
print(f'[pagerank] Score stats: max={scores_list[0]:.6f} p99={scores_list[max(0,int(len(scores_list)*0.01))]:.6f} '
      f'median={scores_list[len(scores_list)//2]:.6f} min={scores_list[-1]:.6f}')

if args.verbose:
    top10 = sorted(pr_scores.items(), key=lambda x: x[1], reverse=True)[:10]
    print('[pagerank] Top 10:')
    for key, score in top10:
        print(f'  {score:.6f}  {key}')

# ---------------------------------------------------------------------------
# Write back to atlas_packets.page_rank_score
# ---------------------------------------------------------------------------
if args.dry_run:
    print(f'[pagerank] DRY RUN — would update {len(pr_scores)} rows in atlas_packets')
    print('[pagerank] Re-run with --apply to write. (No --apply flag exists; remove --dry-run)')
    conn.close()
    sys.exit(0)

print(f'[pagerank] Writing {len(pr_scores)} scores to atlas_packets.page_rank_score...')
t2 = time.time()

# Use COPY for bulk update efficiency
with conn.cursor() as cur:
    # Stage into temp table, then UPDATE join
    cur.execute("""
        CREATE TEMP TABLE _pr_update (
            packet_key TEXT PRIMARY KEY,
            score REAL NOT NULL
        ) ON COMMIT DROP
    """)

    # Batch insert into temp table
    batch = [(k, float(v)) for k, v in pr_scores.items()]
    psycopg2.extras.execute_values(
        cur,
        "INSERT INTO _pr_update (packet_key, score) VALUES %s",
        batch,
        page_size=1000,
    )

    cur.execute("""
        UPDATE atlas_packets ap
        SET page_rank_score = u.score,
            enriched_at = NOW()
        FROM _pr_update u
        WHERE ap.packet_key = u.packet_key
    """)
    updated = cur.rowcount

conn.commit()
elapsed2 = time.time() - t2
print(f'[pagerank] Updated {updated} rows in {elapsed2:.3f}s')

# ---------------------------------------------------------------------------
# Fallback recommendations (unpopulated enrichment columns)
# ---------------------------------------------------------------------------
print('\n[pagerank] Checking enrichment column fill rates...')
with conn.cursor() as cur:
    cur.execute("""
        SELECT
            COUNT(*) AS total,
            COUNT(page_rank_score) FILTER (WHERE page_rank_score IS NOT NULL AND page_rank_score > 0) AS pagerank_nonzero,
            COUNT(som_cluster) FILTER (WHERE som_cluster IS NOT NULL) AS som_filled,
            COUNT(kmeans_cluster) FILTER (WHERE kmeans_cluster IS NOT NULL) AS kmeans_filled,
            COUNT(community_id) FILTER (WHERE community_id IS NOT NULL) AS community_filled
        FROM atlas_packets
    """)
    row = cur.fetchone()
    total, pr_nz, som, km, comm = row

print(f'  total packets:   {total}')
print(f'  page_rank_score: {pr_nz}/{total} ({100*pr_nz/max(total,1):.1f}%)')
print(f'  som_cluster:     {som}/{total} ({100*som/max(total,1):.1f}%)')
print(f'  kmeans_cluster:  {km}/{total} ({100*km/max(total,1):.1f}%)')
print(f'  community_id:    {comm}/{total} ({100*comm/max(total,1):.1f}%)')

recommendations = []
if pr_nz < total * 0.5:
    recommendations.append('page_rank_score: <50% filled → run cugraph-pagerank.py after adding edges (graphify:daily first)')
if som < total * 0.5:
    recommendations.append('som_cluster: <50% filled → run npm run atlas:som:train to assign BMU coordinates')
if km < total * 0.5:
    recommendations.append('kmeans_cluster: <50% filled → run npm run atlas:kmeans:train to assign cluster IDs')
if comm < total * 0.5:
    recommendations.append('community_id: <50% filled → run npm run graphify:gds or atlas:louvain to assign communities')

if recommendations:
    print('\n[pagerank] RECOMMENDATIONS (unpopulated columns):')
    for r in recommendations:
        print(f'  ⚠  {r}')
else:
    print('\n[pagerank] All enrichment columns adequately populated.')

conn.close()
print(f'\n[pagerank] Done. Total elapsed: {time.time()-t0:.2f}s')
