import postgres from 'postgres';

(async () => {
  const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_test';
  const sql = postgres(connectionString, { max: 1 });
  try {
    await c.connect();
    const qCount = `SELECT count(*) AS total_non_uuid FROM vector_metadata WHERE document_id IS NOT NULL AND NOT (document_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')`;
    const r1 = await c.query(qCount);
    const count = parseInt(r1.rows[0].total_non_uuid, 10);
    console.log('total_non_uuid:', count);
    if (count > 0) {
      const r2 = await c.query(
        "SELECT document_id FROM vector_metadata WHERE document_id IS NOT NULL AND NOT (document_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') LIMIT 10"
      );
      console.log('examples:', r2.rows);
    }
    await c.end();
    process.exit(0);
  } catch (err) {
    console.error('error:', err && err.message ? err.message : err);
    try {
      await c.end();
    } catch (e) {}
    process.exit(1);
  }
})();
