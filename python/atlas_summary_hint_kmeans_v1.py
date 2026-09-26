"""SUMMARY-DEDUP-01 + SUMMARY-KMEANS-01 (artifact-only; no DB/Qdrant/Valkey/model): spherical K-means over the legacy-summary HINT vectors.
Dedupe first: one representative per summaryDigest (smallest chunkRowId); duplicates inherit the group's assignment. Same algorithm and
top-2/margin definition as sveltekit-frontend/scripts/atlas/kmeans-chunk-cluster.py (MiniBatchKMeans on L2-normalised 768-d, margin = cos1 - cos2),
but reads the raw F32LE artifact and writes a SEPARATE artifact (SummaryHintClusterAssignmentV1); it never touches canonical cluster fields.
Usage: python python/atlas_summary_hint_kmeans_v1.py --dir <embedding-full dir> [--ks 64,128,256]
"""
import argparse, datetime, hashlib, json, os

import numpy as np
from sklearn.cluster import MiniBatchKMeans
from sklearn.preprocessing import normalize

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIM = 768


def sha(b):
    return "sha256:" + hashlib.sha256(b).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--ks", default="64,128,256")
    a = ap.parse_args()
    d = os.path.join(ROOT, a.dir) if not os.path.isabs(a.dir) else a.dir
    vman = json.load(open(os.path.join(d, "manifest.json"), encoding="utf8"))
    idx = [json.loads(l) for l in open(os.path.join(d, "index.ndjson"), encoding="utf8") if l.strip()]
    raw = np.fromfile(os.path.join(d, "vectors.f32"), dtype="<f4").reshape(-1, DIM)
    assert raw.shape[0] == len(idx), "VECTOR_INDEX_LENGTH_MISMATCH"

    groups = {}
    for r in idx:
        groups.setdefault(r["summaryDigest"], []).append(r)
    nodes = []
    for dig, rows in groups.items():
        rows.sort(key=lambda r: r["chunkRowId"])
        nodes.append((dig, rows))
    nodes.sort(key=lambda n: n[1][0]["chunkRowId"])
    X = normalize(raw[[n[1][0]["row"] for n in nodes]].astype(np.float32), norm="l2")
    N = len(nodes)

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = os.path.join(ROOT, ".tmp", "atlas", "summary-hint-kmeans-v1", stamp)
    os.makedirs(out, exist_ok=False)
    per_k = []
    for K in [int(x) for x in a.ks.split(",")]:
        km = MiniBatchKMeans(n_clusters=K, batch_size=4096, n_init=5, max_iter=200, random_state=42, verbose=0)
        km.fit(X)
        C = normalize(km.cluster_centers_, norm="l2").astype(np.float32)
        sims = X @ C.T
        top2 = np.argpartition(-sims, 1, axis=1)[:, :2]
        s_top2 = np.take_along_axis(sims, top2, axis=1)
        o = np.argsort(-s_top2, axis=1)
        c1 = np.take_along_axis(top2, o, axis=1)[:, 0]
        c2 = np.take_along_axis(top2, o, axis=1)[:, 1]
        s1 = np.take_along_axis(s_top2, o, axis=1)[:, 0]
        s2 = np.take_along_axis(s_top2, o, axis=1)[:, 1]
        margin = s1 - s2
        revision = sha(json.dumps({"vectorSet": vman["files"], "k": K, "algo": "MiniBatchKMeans", "n_init": 5, "max_iter": 200, "random_state": 42, "dedupe": "summaryDigest", "sklearn": __import__("sklearn").__version__}, sort_keys=True).encode())
        cbuf = C.tobytes()
        open(os.path.join(out, f"k{K}-centroids.f32"), "wb").write(cbuf)
        lines = []
        for i, (dig, rows) in enumerate(nodes):
            for r in rows:
                lines.append(json.dumps({"schema": "atlas.summary-hint-cluster-assignment.v1", "summaryDigest": dig, "chunkRowId": r["chunkRowId"], "clusterId": int(c1[i]), "secondClusterId": int(c2[i]),
                                         "centroidCosine": round(float(s1[i]), 6), "secondCentroidCosine": round(float(s2[i]), 6), "clusterMargin": round(float(margin[i]), 6),
                                         "clusterModelRevision": revision, "hintClass": r["hintClass"], "duplicateCount": len(rows), "canonicalAuthority": False}))
        body = ("\n".join(lines) + "\n").encode()
        open(os.path.join(out, f"k{K}-assignments.ndjson"), "wb").write(body)
        sizes = np.bincount(c1, minlength=K)
        q = lambda arr, p: round(float(np.quantile(arr, p)), 4)
        per_k.append({"k": K, "clusterModelRevision": revision, "inertia": round(float(km.inertia_), 4), "emptyClusters": int((sizes == 0).sum()),
                      "clusterSize": {"min": int(sizes.min()), "median": int(np.median(sizes)), "max": int(sizes.max())},
                      "margin": {"p10": q(margin, 0.10), "median": q(margin, 0.5), "p90": q(margin, 0.9)},
                      "centroidCosine": {"p10": q(s1, 0.10), "median": q(s1, 0.5)},
                      "ambiguousShareMarginBelow0.02": round(float((margin < 0.02).mean()), 4),
                      "files": {f"k{K}-centroids.f32": {"bytes": len(cbuf), "sha256": sha(cbuf)}, f"k{K}-assignments.ndjson": {"rows": len(lines), "sha256": sha(body)}}})
    manifest = {"schema": "atlas.summary-hint-kmeans-set.v1", "canonicalAuthority": False, "retrievalVoteAdded": False,
                "sourceVectorSet": os.path.relpath(d, ROOT).replace("\\", "/"), "inputRows": len(idx), "dedupeGroups": N, "duplicateRowsCollapsed": len(idx) - N,
                "note": "K chosen by routing/retrieval lift, not inertia; no graded labels exist yet, so no K is selected here.", "perK": per_k,
                "databaseWrites": 0, "qdrantWrites": 0, "valkeyWrites": 0, "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    json.dump(manifest, open(os.path.join(out, "manifest.json"), "w", encoding="utf8"), indent=2)
    print(json.dumps({"dir": os.path.relpath(out, ROOT).replace("\\", "/"), **{k: v for k, v in manifest.items() if k != "perK"}, "perK": [{k: v for k, v in p.items() if k != "files"} for p in per_k]}, indent=1))


if __name__ == "__main__":
    main()
