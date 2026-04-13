// Probe Qdrant codebase_chunks_768 payload structure
const r = await fetch("http://localhost:6333/collections/codebase_chunks_768/points/scroll", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ limit: 3, with_vector: false, with_payload: true })
});
const d = await r.json();
const pts = d.result?.points ?? [];
console.log("Sample points count:", pts.length);
for (const pt of pts) {
  console.log("\nPoint ID:", pt.id);
  console.log("Payload keys:", Object.keys(pt.payload ?? {}));
  console.log("Payload:", JSON.stringify(pt.payload ?? {}, null, 2).slice(0, 500));
}
