// Fire cluster-detect + recommendations jobs and poll for results
const BASE = "http://localhost:5173";

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) {
    console.log("POST", path, "->", r.status, text.slice(0, 300));
    return null;
  }
  return JSON.parse(text);
}

async function poll(path, jobId, label, maxWait = 120000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    await new Promise(res => setTimeout(res, 3000));
    const r = await fetch(`${BASE}${path}?jobId=${jobId}`);
    const d = await r.json();
    console.log(`[${label}] status=${d.status} jobId=${jobId}`);
    if (d.status === "done" || d.status === "error") {
      console.log(`[${label}] FINAL:`, JSON.stringify(d.result ?? d.error ?? d, null, 2).slice(0, 800));
      return d;
    }
  }
  console.log(`[${label}] TIMEOUT after ${maxWait}ms`);
  return null;
}

async function main() {
  // 1. Cluster detect
  console.log("\n=== Firing cluster-detect (k=12, maxFiles=500) ===");
  const cd = await post("/api/codebase-index/cluster-detect", { k: 12, maxFiles: 500 });
  if (cd) {
    console.log("cluster-detect started:", cd.jobId ?? cd.message ?? cd.error);
    if (cd.jobId) await poll("/api/codebase-index/cluster-detect", cd.jobId, "cluster-detect");
  }

  // 2. Recommendations
  console.log("\n=== Firing recommendations (threshold=0.8, topK=5, maxFiles=200) ===");
  const rr = await post("/api/codebase-index/recommendations", { threshold: 0.80, topK: 5, maxFiles: 200 });
  if (rr) {
    console.log("recommendations started:", rr.jobId ?? rr.message ?? rr.error);
    if (rr.jobId) await poll("/api/codebase-index/recommendations", rr.jobId, "recommendations", 180000);
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
