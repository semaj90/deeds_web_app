const neo4j = require('neo4j-driver');
const d = neo4j.default.driver('bolt://localhost:7687', neo4j.default.auth.basic('neo4j', 'neo4j123'));
async function run() {
  const s = d.session({ database: 'neo4j' });
  try {
    // All 18 DDL statements from initializeNeo4jSchema() timed individually
    const ddl = [
      'CREATE CONSTRAINT IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (e:Evidence) REQUIRE e.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (s:Statute) REQUIRE s.code IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (o:Organization) REQUIRE o.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (g:GlossaryTerm) REQUIRE g.key IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (f:CodebaseFile) REQUIRE f.id IS UNIQUE',
      "CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.name)",
      "CREATE INDEX IF NOT EXISTS FOR (c:Case) ON (c.title)",
      "CREATE INDEX IF NOT EXISTS FOR (c:Case) ON (c.caseNumber)",
      "CREATE INDEX IF NOT EXISTS FOR (e:Evidence) ON (e.title)",
      "CREATE INDEX IF NOT EXISTS FOR (g:GlossaryTerm) ON (g.term)",
      "CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.filePath)",
      "CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.cluster)",
      "CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.type)",
      "CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.nodeLabel)",
      "CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.usesNative)",
      "CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.hasDynamicImports)",
    ];
    let totalMs = 0;
    for (let i = 0; i < ddl.length; i++) {
      const t = Date.now();
      await s.run(ddl[i]);
      const ms = Date.now() - t;
      totalMs += ms;
      console.log(`DDL[${i}] ${ms}ms: ${ddl[i].slice(0, 60)}`);
    }
    console.log('Total schema init time:', totalMs, 'ms');
  } finally {
    await s.close();
    await d.close();
  }
}
run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
