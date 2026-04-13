const r = await fetch("http://localhost:6333/collections/codebase_chunks_768/points/scroll", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ limit: 1, with_vector: ["content"], with_payload: false })
});
const d = await r.json();
const pt = d.result?.points?.[0];
if (!pt) { console.log("no points"); process.exit(1); }
console.log("vector type:", typeof pt.vector, Array.isArray(pt.vector) ? "array" : "object");
console.log("vector keys:", Object.keys(pt.vector ?? {}));
const cv = pt.vector?.content;
console.log("content vec:", Array.isArray(cv) ? `length=${cv.length}` : `type=${typeof cv}, val=${JSON.stringify(cv).slice(0,100)}`);
