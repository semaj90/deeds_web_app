/**
 * GET /api/graph/colab-export
 *
 * Generates and returns a complete Jupyter notebook (.ipynb) for GPU graph analysis
 * on Google Colab. The notebook runs PageRank, K-means, and SOM on codebase embeddings
 * fetched from Qdrant and Neo4j.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// ── Notebook cell builders ────────────────────────────────────────────

function markdownCell(source: string[]): object {
	return {
		cell_type: 'markdown',
		metadata: {},
		source,
	};
}

function codeCell(source: string[]): object {
	return {
		cell_type: 'code',
		metadata: {},
		source,
		outputs: [],
		execution_count: null,
	};
}

// ── Notebook definition ───────────────────────────────────────────────

function buildNotebook(errorCell?: string): object {
	const cells: object[] = [];

	// Cell 1 — Title / description (markdown)
	cells.push(
		markdownCell([
			'# Deeds Legal AI — GPU Graph Analysis\n',
			'\n',
			'This notebook performs GPU-accelerated analysis of the Deeds codebase graph:\n',
			'\n',
			'1. **Fetch embeddings** from Qdrant `codebase_chunks_768` collection (768-dim vectors)\n',
			'2. **Build adjacency matrix** from Neo4j `CodebaseFile` → `IMPORTS` relationships\n',
			'3. **GPU PageRank** — power iteration with teleport damping (mirrors C++ `pageRankGPU`)\n',
			'4. **GPU K-Means** — PyTorch `cdist` + argmin clustering loop with centroid output\n',
			'5. **Kohonen SOM** — BMU search, neighbourhood decay, weight update (mirrors C++ `trainSOM`)\n',
			'6. **Visualisation** — 3-panel matplotlib figure (SOM heatmap, PageRank bar chart, K-means PCA scatter)\n',
			'7. **Export to Neo4j** — write `pagerank_score` property and `SIMILAR_TOPOLOGY` edges\n',
			'\n',
			'> **Requirements**: Select a GPU runtime in Colab — Runtime → Change runtime type → T4 GPU\n',
		])
	);

	if (errorCell) {
		cells.push(
			codeCell([
				`# ERROR: notebook generation encountered a problem\n`,
				`# ${errorCell}\n`,
				`print("Notebook generated in degraded mode — please check server logs.")`,
			])
		);
		return buildIpynb(cells);
	}

	// Cell 2 — pip installs
	cells.push(
		codeCell([
			'!pip install torch torchvision --quiet\n',
			'!pip install qdrant-client --quiet\n',
			'!pip install neo4j --quiet\n',
			'!pip install matplotlib scikit-learn --quiet\n',
			'!pip install redis --quiet\n',
			'print("All dependencies installed.")',
		])
	);

	// Cell 3 — imports + config
	cells.push(
		codeCell([
			'import torch\n',
			'import numpy as np\n',
			'import matplotlib.pyplot as plt\n',
			'from sklearn.decomposition import PCA\n',
			'from qdrant_client import QdrantClient\n',
			'from neo4j import GraphDatabase\n',
			'\n',
			'# ── Fill in your service URLs ──────────────────────────────────────────\n',
			'QDRANT_URL  = "http://localhost:6333"   # Replace with your Qdrant URL\n',
			'NEO4J_URI   = "bolt://localhost:7687"   # Replace with your Neo4j URI\n',
			'NEO4J_USER  = "neo4j"\n',
			'NEO4J_PASS  = "password"\n',
			'# ───────────────────────────────────────────────────────────────────────\n',
			'\n',
			'device = "cuda" if torch.cuda.is_available() else "cpu"\n',
			'print(f"Using device: {device}")\n',
			'if device == "cuda":\n',
			'    print(f"  GPU: {torch.cuda.get_device_name(0)}")\n',
			'    print(f"  VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")',
		])
	);

	// Cell 4 — fetch embeddings from Qdrant
	cells.push(
		codeCell([
			'# Fetch embeddings from Qdrant codebase_chunks_768 collection\n',
			'qdrant = QdrantClient(url=QDRANT_URL)\n',
			'\n',
			'COLLECTION = "codebase_chunks_768"\n',
			'FETCH_LIMIT = 2000\n',
			'\n',
			'all_points = []\n',
			'offset = None\n',
			'\n',
			'while True:\n',
			'    response = qdrant.scroll(\n',
			'        collection_name=COLLECTION,\n',
			'        limit=250,\n',
			'        offset=offset,\n',
			'        with_vectors=True,\n',
			'        with_payload=True,\n',
			'    )\n',
			'    points, next_offset = response\n',
			'    all_points.extend(points)\n',
			'    if next_offset is None or len(all_points) >= FETCH_LIMIT:\n',
			'        break\n',
			'    offset = next_offset\n',
			'\n',
			'all_points = all_points[:FETCH_LIMIT]\n',
			'\n',
			'# Extract vectors + file paths\n',
			'vectors   = []\n',
			'file_paths = []\n',
			'\n',
			'for pt in all_points:\n',
			'    v = pt.vector\n',
			'    if isinstance(v, dict):\n',
			'        v = v.get("content") or v.get("dense") or list(v.values())[0]\n',
			'    if v and len(v) == 768:\n',
			'        vectors.append(v)\n',
			'        file_paths.append(pt.payload.get("file_path", str(pt.id)))\n',
			'\n',
			'embeddings = torch.tensor(vectors, dtype=torch.float32, device=device)\n',
			'print(f"Fetched {embeddings.shape[0]} embeddings ({embeddings.shape[1]}-dim) from Qdrant")',
		])
	);

	// Cell 5 — build adjacency matrix from Neo4j
	cells.push(
		codeCell([
			'# Build adjacency matrix from Neo4j CodebaseFile IMPORTS relationships\n',
			'driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))\n',
			'\n',
			'def fetch_imports(tx):\n',
			'    result = tx.run(\n',
			'        """\n',
			'        MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile)\n',
			'        RETURN a.filePath AS src, b.filePath AS dst\n',
			'        LIMIT 20000\n',
			'        """\n',
			'    )\n',
			'    return [(r["src"], r["dst"]) for r in result]\n',
			'\n',
			'with driver.session() as session:\n',
			'    edges = session.read_transaction(fetch_imports)\n',
			'\n',
			'driver.close()\n',
			'\n',
			'# Map file paths to indices (intersection with fetched embeddings)\n',
			'path_to_idx = {p: i for i, p in enumerate(file_paths)}\n',
			'n = len(file_paths)\n',
			'\n',
			'adj = torch.zeros((n, n), dtype=torch.float32, device=device)\n',
			'edge_count = 0\n',
			'for src, dst in edges:\n',
			'    i = path_to_idx.get(src)\n',
			'    j = path_to_idx.get(dst)\n',
			'    if i is not None and j is not None:\n',
			'        adj[i, j] = 1.0\n',
			'        edge_count += 1\n',
			'\n',
			'print(f"Built {n}×{n} adjacency matrix with {edge_count} edges")',
		])
	);

	// Cell 6 — GPU PageRank
	cells.push(
		codeCell([
			'# GPU PageRank — power iteration with teleport damping\n',
			'# Mirrors the C++ pageRankGPU logic: row-normalise adj, iterate with teleport\n',
			'\n',
			'def gpu_pagerank(adj: torch.Tensor, damping: float = 0.85, max_iter: int = 50) -> torch.Tensor:\n',
			'    n = adj.shape[0]\n',
			'    dev = adj.device\n',
			'\n',
			'    # Row-normalise (dangling nodes get uniform teleport)\n',
			'    row_sums = adj.sum(dim=1, keepdim=True).clamp(min=1.0)\n',
			'    M = adj / row_sums  # stochastic transition matrix\n',
			'\n',
			'    rank = torch.full((n,), 1.0 / n, dtype=torch.float32, device=dev)\n',
			'    teleport = torch.full((n,), (1.0 - damping) / n, dtype=torch.float32, device=dev)\n',
			'\n',
			'    for _ in range(max_iter):\n',
			'        new_rank = damping * (M.T @ rank) + teleport\n',
			'        delta = (new_rank - rank).abs().max().item()\n',
			'        rank = new_rank\n',
			'        if delta < 1e-6:\n',
			'            break\n',
			'\n',
			'    # Normalise to [0, 1]\n',
			'    rank = rank / rank.max().clamp(min=1e-12)\n',
			'    return rank\n',
			'\n',
			'pagerank_scores = gpu_pagerank(adj)\n',
			'pagerank_cpu = pagerank_scores.cpu().numpy()\n',
			'\n',
			'# Top-20 by PageRank\n',
			'top20_idx = np.argsort(pagerank_cpu)[::-1][:20]\n',
			'print("Top-20 files by GPU PageRank:")\n',
			'for rank_pos, idx in enumerate(top20_idx, 1):\n',
			'    path = file_paths[idx] if idx < len(file_paths) else f"node_{idx}"\n',
			'    print(f"  {rank_pos:2d}. {path} — {pagerank_cpu[idx]:.4f}")',
		])
	);

	// Cell 7 — GPU K-Means
	cells.push(
		codeCell([
			'# GPU K-Means — PyTorch cdist + argmin clustering with centroid output\n',
			'\n',
			'def gpu_kmeans(\n',
			'    X: torch.Tensor,\n',
			'    k: int,\n',
			'    max_iter: int = 100,\n',
			'    tol: float = 1e-4,\n',
			') -> tuple[torch.Tensor, torch.Tensor]:\n',
			'    """\n',
			'    Returns:\n',
			'        assignments: (N,) int64 cluster index per point\n',
			'        centroids:   (k, D) float32 centroid vectors\n',
			'    """\n',
			'    n, d = X.shape\n',
			'    # Initialise centroids by sampling k random points\n',
			'    perm = torch.randperm(n, device=X.device)[:k]\n',
			'    centroids = X[perm].clone()\n',
			'\n',
			'    assignments = torch.zeros(n, dtype=torch.long, device=X.device)\n',
			'\n',
			'    for iteration in range(max_iter):\n',
			'        # Assign each point to nearest centroid via Euclidean distance\n',
			'        dists = torch.cdist(X, centroids)   # (N, k)\n',
			'        new_assignments = dists.argmin(dim=1)  # (N,)\n',
			'\n',
			'        # Recompute centroids\n',
			'        new_centroids = torch.zeros_like(centroids)\n',
			'        counts = torch.zeros(k, device=X.device)\n',
			'        for c in range(k):\n',
			'            mask = new_assignments == c\n',
			'            if mask.any():\n',
			'                new_centroids[c] = X[mask].mean(dim=0)\n',
			'                counts[c] = mask.sum()\n',
			'            else:\n',
			'                new_centroids[c] = centroids[c]  # keep old if empty\n',
			'\n',
			'        centroid_shift = (new_centroids - centroids).norm(dim=1).max().item()\n',
			'        assignments = new_assignments\n',
			'        centroids = new_centroids\n',
			'\n',
			'        if centroid_shift < tol:\n',
			'            print(f"  K-Means converged at iteration {iteration + 1}")\n',
			'            break\n',
			'\n',
			'    return assignments, centroids\n',
			'\n',
			'K = 8\n',
			'kmeans_assignments, kmeans_centroids = gpu_kmeans(embeddings, k=K)\n',
			'assignments_cpu = kmeans_assignments.cpu().numpy()\n',
			'centroids_cpu   = kmeans_centroids.cpu().numpy()\n',
			'\n',
			'for c in range(K):\n',
			'    count = (assignments_cpu == c).sum()\n',
			'    print(f"  Cluster {c}: {count} files")',
		])
	);

	// Cell 8 — Kohonen SOM
	cells.push(
		codeCell([
			'# Kohonen SOM — BMU search, neighbourhood decay, weight update\n',
			'# Mirrors C++ trainSOM: BMU via cdist, h = exp(-d²/2r²), weight += lr*h*(x-w)\n',
			'\n',
			'def train_som(\n',
			'    X: torch.Tensor,\n',
			'    grid_h: int = 10,\n',
			'    grid_w: int = 10,\n',
			'    epochs: int = 20,\n',
			'    lr0: float = 0.5,\n',
			'    radius0: float = 5.0,\n',
			') -> tuple[torch.Tensor, torch.Tensor]:\n',
			'    """\n',
			'    Returns:\n',
			'        weights:     (grid_h*grid_w, D) SOM weight matrix\n',
			'        bmu_indices: (N,) index of best-matching unit per sample\n',
			'    """\n',
			'    n, d = X.shape\n',
			'    n_nodes = grid_h * grid_w\n',
			'    dev = X.device\n',
			'\n',
			'    # Initialise weights from random data samples\n',
			'    perm = torch.randperm(n, device=dev)[:n_nodes]\n',
			'    weights = X[perm].clone().float()  # (n_nodes, D)\n',
			'\n',
			'    # Precompute grid positions for neighbourhood distance\n',
			'    gy, gx = torch.meshgrid(\n',
			'        torch.arange(grid_h, device=dev, dtype=torch.float32),\n',
			'        torch.arange(grid_w, device=dev, dtype=torch.float32),\n',
			'        indexing="ij",\n',
			'    )\n',
			'    grid_pos = torch.stack([gy.flatten(), gx.flatten()], dim=1)  # (n_nodes, 2)\n',
			'\n',
			'    total_steps = epochs * n\n',
			'    step = 0\n',
			'\n',
			'    for epoch in range(epochs):\n',
			'        perm = torch.randperm(n, device=dev)\n',
			'        for i in perm:\n',
			'            x = X[i]  # (D,)\n',
			'\n',
			'            # BMU — node with smallest Euclidean distance to x\n',
			'            dists_to_weights = torch.cdist(x.unsqueeze(0), weights).squeeze(0)  # (n_nodes,)\n',
			'            bmu_idx = dists_to_weights.argmin().item()\n',
			'\n',
			'            # Learning rate + radius decay\n',
			'            t = step / max(total_steps - 1, 1)\n',
			'            lr = lr0 * (0.01 / lr0) ** t\n',
			'            radius = radius0 * (0.5 / radius0) ** t\n',
			'\n',
			'            # Neighbourhood function h = exp(-d² / 2r²)\n',
			'            bmu_pos = grid_pos[bmu_idx]  # (2,)\n',
			'            grid_dists_sq = ((grid_pos - bmu_pos) ** 2).sum(dim=1)  # (n_nodes,)\n',
			'            h = torch.exp(-grid_dists_sq / (2 * radius ** 2 + 1e-9))  # (n_nodes,)\n',
			'\n',
			'            # Weight update: w += lr * h * (x - w)\n',
			'            weights += lr * h.unsqueeze(1) * (x.unsqueeze(0) - weights)\n',
			'            step += 1\n',
			'\n',
			'        if (epoch + 1) % 5 == 0:\n',
			'            print(f"  SOM epoch {epoch + 1}/{epochs}, lr={lr:.4f}, radius={radius:.2f}")\n',
			'\n',
			'    # Assign each sample to its BMU\n',
			'    bmu_indices = torch.cdist(X, weights).argmin(dim=1)  # (N,)\n',
			'    return weights, bmu_indices\n',
			'\n',
			'GRID_H, GRID_W = 10, 10\n',
			'som_weights, som_bmu = train_som(embeddings, grid_h=GRID_H, grid_w=GRID_W, epochs=20)\n',
			'som_weights_cpu = som_weights.cpu().numpy()\n',
			'som_bmu_cpu     = som_bmu.cpu().numpy()\n',
			'print(f"SOM training complete — {GRID_H}×{GRID_W} grid, {embeddings.shape[0]} samples mapped")',
		])
	);

	// Cell 9 — Visualisation (3-panel)
	cells.push(
		codeCell([
			'# Visualisation — 3-panel figure\n',
			'# (a) SOM grid heatmap coloured by K-Means cluster\n',
			'# (b) PageRank bar chart — top 20 files\n',
			'# (c) K-Means 2-D scatter via PCA\n',
			'\n',
			'fig, axes = plt.subplots(1, 3, figsize=(20, 6))\n',
			'fig.suptitle("Deeds Legal AI — GPU Graph Analysis", fontsize=14, fontweight="bold")\n',
			'\n',
			'# ── (a) SOM heatmap ──────────────────────────────────────────────────────\n',
			'ax_som = axes[0]\n',
			'\n',
			'# Build grid: for each SOM node, find the most-common K-Means cluster of\n',
			'# all samples whose BMU is that node.\n',
			'grid_cluster = np.full(GRID_H * GRID_W, -1, dtype=int)\n',
			'for node_idx in range(GRID_H * GRID_W):\n',
			'    mask = som_bmu_cpu == node_idx\n',
			'    if mask.any():\n',
			'        node_clusters = assignments_cpu[mask]\n',
			'        grid_cluster[node_idx] = int(np.bincount(node_clusters).argmax())\n',
			'\n',
			'heatmap = grid_cluster.reshape(GRID_H, GRID_W).astype(float)\n',
			'heatmap[heatmap == -1] = np.nan\n',
			'im = ax_som.imshow(heatmap, cmap="tab10", aspect="auto", vmin=0, vmax=K - 1)\n',
			'ax_som.set_title(f"SOM Grid — K-Means cluster ({GRID_H}×{GRID_W})")\n',
			'ax_som.set_xlabel("SOM column")\n',
			'ax_som.set_ylabel("SOM row")\n',
			'plt.colorbar(im, ax=ax_som, label="Cluster ID")\n',
			'\n',
			'# ── (b) PageRank bar chart ───────────────────────────────────────────────\n',
			'ax_pr = axes[1]\n',
			'top20_scores = pagerank_cpu[top20_idx]\n',
			'top20_labels = [\n',
			'    (file_paths[i].split("/")[-1] if i < len(file_paths) else f"node_{i}")[:30]\n',
			'    for i in top20_idx\n',
			']\n',
			'bars = ax_pr.barh(range(20), top20_scores[::-1], color="steelblue")\n',
			'ax_pr.set_yticks(range(20))\n',
			'ax_pr.set_yticklabels(top20_labels[::-1], fontsize=7)\n',
			'ax_pr.set_xlabel("PageRank score (normalised)")\n',
			'ax_pr.set_title("Top-20 Files by GPU PageRank")\n',
			'ax_pr.invert_yaxis()\n',
			'\n',
			'# ── (c) K-Means PCA scatter ─────────────────────────────────────────────\n',
			'ax_km = axes[2]\n',
			'emb_cpu = embeddings.cpu().numpy()\n',
			'pca = PCA(n_components=2, random_state=42)\n',
			'coords = pca.fit_transform(emb_cpu)  # (N, 2)\n',
			'\n',
			'scatter = ax_km.scatter(\n',
			'    coords[:, 0], coords[:, 1],\n',
			'    c=assignments_cpu, cmap="tab10", s=5, alpha=0.6, vmin=0, vmax=K - 1,\n',
			')\n',
			'# Plot centroids\n',
			'centroid_coords = pca.transform(centroids_cpu)\n',
			'ax_km.scatter(\n',
			'    centroid_coords[:, 0], centroid_coords[:, 1],\n',
			'    c=range(K), cmap="tab10", s=100, marker="X", edgecolors="black", linewidths=0.8,\n',
			'    vmin=0, vmax=K - 1, zorder=5,\n',
			')\n',
			'ax_km.set_title(f"K-Means Clusters (k={K}) — PCA 2D")\n',
			'ax_km.set_xlabel("PC1")\n',
			'ax_km.set_ylabel("PC2")\n',
			'plt.colorbar(scatter, ax=ax_km, label="Cluster ID")\n',
			'\n',
			'plt.tight_layout()\n',
			'plt.savefig("deeds-graph-analysis.png", dpi=150, bbox_inches="tight")\n',
			'plt.show()\n',
			'print("Figure saved to deeds-graph-analysis.png")',
		])
	);

	// Cell 10 — export results back to Neo4j
	cells.push(
		codeCell([
			'# Export results back to Neo4j\n',
			'# 1. Write pagerank_score property to each CodebaseFile node\n',
			'# 2. Create SIMILAR_TOPOLOGY edges between nodes in the same K-Means cluster\n',
			'\n',
			'driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))\n',
			'\n',
			'BATCH_SIZE = 200\n',
			'\n',
			'def write_pagerank_batch(tx, batch):\n',
			'    tx.run(\n',
			'        """\n',
			'        UNWIND $rows AS row\n',
			'        MATCH (f:CodebaseFile {filePath: row.filePath})\n',
			'        SET f.pagerank_score = row.score\n',
			'        """,\n',
			'        rows=batch,\n',
			'    )\n',
			'\n',
			'def write_similar_edges_batch(tx, batch):\n',
			'    tx.run(\n',
			'        """\n',
			'        UNWIND $pairs AS pair\n',
			'        MATCH (a:CodebaseFile {filePath: pair.src})\n',
			'        MATCH (b:CodebaseFile {filePath: pair.dst})\n',
			'        MERGE (a)-[:SIMILAR_TOPOLOGY {cluster: pair.cluster}]->(b)\n',
			'        """,\n',
			'        pairs=batch,\n',
			'    )\n',
			'\n',
			'# -- PageRank scores --\n',
			'pagerank_rows = [\n',
			'    {"filePath": file_paths[i], "score": float(pagerank_cpu[i])}\n',
			'    for i in range(len(file_paths))\n',
			']\n',
			'with driver.session() as session:\n',
			'    for start in range(0, len(pagerank_rows), BATCH_SIZE):\n',
			'        batch = pagerank_rows[start : start + BATCH_SIZE]\n',
			'        session.write_transaction(write_pagerank_batch, batch)\n',
			'print(f"Wrote pagerank_score to {len(pagerank_rows)} nodes")\n',
			'\n',
			'# -- SIMILAR_TOPOLOGY edges (only within same cluster, limit per cluster) --\n',
			'similar_pairs = []\n',
			'MAX_EDGES_PER_CLUSTER = 50\n',
			'for c in range(K):\n',
			'    indices = np.where(assignments_cpu == c)[0]\n',
			'    # Pair consecutive nodes in the cluster (avoid O(n²) explosion)\n',
			'    for j in range(min(len(indices) - 1, MAX_EDGES_PER_CLUSTER)):\n',
			'        src = file_paths[indices[j]] if indices[j] < len(file_paths) else None\n',
			'        dst = file_paths[indices[j + 1]] if indices[j + 1] < len(file_paths) else None\n',
			'        if src and dst and src != dst:\n',
			'            similar_pairs.append({"src": src, "dst": dst, "cluster": c})\n',
			'\n',
			'with driver.session() as session:\n',
			'    for start in range(0, len(similar_pairs), BATCH_SIZE):\n',
			'        batch = similar_pairs[start : start + BATCH_SIZE]\n',
			'        session.write_transaction(write_similar_edges_batch, batch)\n',
			'\n',
			'driver.close()\n',
			'print(f"Wrote {len(similar_pairs)} SIMILAR_TOPOLOGY edges across {K} clusters")\n',
			'print("Neo4j export complete.")',
		])
	);

	// Cell 11 — Pre-warm LangGraph KAG Redis cache
	// Reads SIMILAR_TOPOLOGY edges (written in Cell 10) and the Qdrant point IDs
	// (available from Cell 4's all_points) to populate per-file neighbor lists in
	// Redis under the key prefix that app.py's kag_neighbors() checks first.
	//
	// Key contract (must match app.py kag_neighbors exactly):
	//   norm = "|".join(sorted(set(doc_ids)))
	//   key  = REDIS_KAG_PREFIX + MD5(norm.encode())[:12]
	// Payload: {"v": 1, "neighbors": [...], "source": "colab-prewarm"}
	// app.py reads v==1 versioned format; legacy plain-list format also accepted.
	cells.push(
		codeCell([
			'# Cell 11 — Pre-warm LangGraph KAG Redis cache\n',
			'# Maps Qdrant point IDs → top-K SIMILAR_TOPOLOGY neighbors so app.py\n',
			'# skips Neo4j for files already analyzed by this notebook.\n',
			'\n',
			'import redis as sync_redis\n',
			'import hashlib\n',
			'import json\n',
			'from collections import defaultdict\n',
			'\n',
			'REDIS_URL        = "redis://localhost:6379/0"   # Replace with your Redis URL\n',
			'REDIS_KAG_PREFIX = "langgraph:kag:neighbors:"\n',
			'KAG_TTL          = 86_400  # 24 h — matches app.py REDIS_KAG_TTL\n',
			'\n',
			'r = sync_redis.from_url(REDIS_URL)\n',
			'r.ping()  # fail fast if Redis unreachable\n',
			'\n',
			'# ── 1. Build file_path → Qdrant point_id map (Cell 4 loaded all_points) ──\n',
			'path_to_point_id = {\n',
			'    pt.payload.get("file_path", ""): str(pt.id)\n',
			'    for pt in all_points\n',
			'    if pt.payload and pt.payload.get("file_path")\n',
			'}\n',
			'print(f"Path → point_id map: {len(path_to_point_id)} entries")\n',
			'\n',
			'# ── 2. Fetch SIMILAR_TOPOLOGY edges from Neo4j (Cell 10 wrote these) ────\n',
			'driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))\n',
			'\n',
			'def _fetch_topo(tx):\n',
			'    result = tx.run(\n',
			'        """\n',
			'        MATCH (a:CodebaseFile)-[r:SIMILAR_TOPOLOGY]->(b:CodebaseFile)\n',
			'        RETURN a.filePath AS src, b.filePath AS dst,\n',
			'               r.cluster AS cluster,\n',
			'               coalesce(b.pagerank_score, 0.0) AS score\n',
			'        LIMIT 100000\n',
			'        """\n',
			'    )\n',
			'    return [(row["src"], row["dst"], row["cluster"], row["score"]) for row in result]\n',
			'\n',
			'with driver.session() as session:\n',
			'    topo_edges = session.read_transaction(_fetch_topo)\n',
			'\n',
			'driver.close()\n',
			'print(f"Fetched {len(topo_edges)} SIMILAR_TOPOLOGY edges from Neo4j")\n',
			'\n',
			'# ── 3. Group neighbors by source file ────────────────────────────────────\n',
			'neighbors_by_path: dict = defaultdict(list)\n',
			'for src, dst, cluster, score in topo_edges:\n',
			'    dst_id = path_to_point_id.get(dst, "")\n',
			'    neighbors_by_path[src].append({\n',
			'        "id":      dst_id,\n',
			'        "path":    dst,\n',
			'        "summary": "",\n',
			'        "cluster": cluster,\n',
			'        "score":   float(score) if score else 0.0,\n',
			'    })\n',
			'\n',
			'# Sort each neighbor list by pagerank score descending, keep top 8\n',
			'for path in neighbors_by_path:\n',
			'    neighbors_by_path[path].sort(key=lambda x: x["score"], reverse=True)\n',
			'    neighbors_by_path[path] = neighbors_by_path[path][:8]\n',
			'\n',
			'# ── 4. Write to Redis ────────────────────────────────────────────────────\n',
			'# Key contract (must match app.py kag_neighbors exactly):\n',
			'#   norm = "|".join(sorted(set(doc_ids)))     # dedup + sort\n',
			'#   key  = REDIS_KAG_PREFIX + MD5(norm)[:12]\n',
			'# For single-id calls (most common): sorted(set([point_id])) == [point_id]\n',
			'# so key == REDIS_KAG_PREFIX + MD5(point_id)[:12]\n',
			'written = 0\n',
			'pipe = r.pipeline()\n',
			'for path, point_id in path_to_point_id.items():\n',
			'    neighbors = neighbors_by_path.get(path, [])\n',
			'    if not neighbors:\n',
			'        continue\n',
			'    # Use sorted(set([point_id])) to be explicit about the normalization contract\n',
			'    norm = "|".join(sorted(set([point_id])))\n',
			'    cache_key = REDIS_KAG_PREFIX + hashlib.md5(norm.encode()).hexdigest()[:12]\n',
			'    payload = {"v": 1, "neighbors": neighbors, "source": "colab-prewarm"}\n',
			'    pipe.set(cache_key, json.dumps(payload), ex=KAG_TTL)\n',
			'    written += 1\n',
			'\n',
			'pipe.execute()\n',
			'r.close()\n',
			'\n',
			'print(f"Pre-warmed {written} LangGraph KAG cache entries in Redis")\n',
			'print(f"TTL: {KAG_TTL}s = {KAG_TTL // 3600}h")\n',
			'print(f"Key prefix: {REDIS_KAG_PREFIX}")\n',
			'print(f"Payload version: v=1, source=colab-prewarm")\n',
			'print("\\nDone: kag_neighbors() will now serve these entries from Redis, skipping Neo4j.")',
		])
	);

	return buildIpynb(cells);
}

function buildIpynb(cells: object[]): object {
	return {
		nbformat: 4,
		nbformat_minor: 5,
		metadata: {
			kernelspec: {
				display_name: 'Python 3 (GPU)',
				language: 'python',
				name: 'python3',
			},
			accelerator: 'GPU',
		},
		cells,
	};
}

// ── Route handler ─────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const notebook = buildNotebook();

		return new Response(JSON.stringify(notebook, null, 2), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': 'attachment; filename="deeds-graph-analysis.ipynb"',
			},
		});
	} catch (err) {
		const errorMsg = (err as Error)?.message ?? 'Unknown error during notebook generation';
		console.error('[colab-export] Notebook generation failed:', errorMsg);

		// Degraded: return a notebook with an error cell so the download still works
		const degradedNotebook = buildNotebook(errorMsg);

		return new Response(JSON.stringify(degradedNotebook, null, 2), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': 'attachment; filename="deeds-graph-analysis.ipynb"',
			},
		});
	}
};
