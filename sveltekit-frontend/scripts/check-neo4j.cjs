const neo4j = require("neo4j-driver");
const d = neo4j.default.driver("bolt://localhost:7687", neo4j.default.auth.basic("neo4j","neo4j123"));
async function run() {
  const s = d.session({database:"neo4j"});
  try {
    const r1 = await s.run("MATCH (f:CodebaseFile) RETURN count(f) AS total");
    console.log("Total CodebaseFile nodes:", r1.records[0].get("total").low);
    const r2 = await s.run("MATCH ()-[r]->() RETURN type(r) AS t, count(r) AS c ORDER BY c DESC LIMIT 6");
    r2.records.forEach(row => console.log(" Edge " + row.get("t") + ": " + row.get("c").low));
    const r3 = await s.run("MATCH (f:CodebaseFile) WHERE f.nodeLabel IS NOT NULL RETURN f.nodeLabel AS label, count(f) AS c ORDER BY c DESC LIMIT 6");
    r3.records.forEach(row => console.log(" Label " + row.get("label") + ": " + row.get("c").low));
    const r4 = await s.run("MATCH (f:CodebaseFile) WHERE size(f.usedTables) > 0 RETURN f.filePath, f.usedTables LIMIT 3");
    r4.records.forEach(row => console.log(" DB user:", row.get("f.filePath"), "->", JSON.stringify(row.get("f.usedTables"))));
  } finally { await s.close(); await d.close(); }
}
run().catch(e => console.error("ERR:", e.message));
