import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'legal',
  user: process.env.POSTGRES_USER || 'user',
  password: process.env.POSTGRES_PASSWORD || 'pass',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function createDocumentRecord(data: {
  caseId: string;
  filename: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  minioKey: string;
}) {
  const query = `
    INSERT INTO documents (case_id, filename, original_name, file_size, mime_type, minio_key)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `;

  const values = [
    data.caseId,
    data.filename,
    data.originalName,
    data.fileSize,
    data.mimeType,
    data.minioKey
  ];

  try {
    const result = await pool.query(query, values);
    const documentId = result.rows[0].id;
    console.log(`📄 Created document record: ${documentId}`);
    return documentId;
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  }
}

export async function updateDocumentStatus(documentId: string, status: string) {
  const query = `
    UPDATE documents
    SET status = $1, updated_at = NOW()
    WHERE id = $2
  `;

  try {
    await pool.query(query, [status, documentId]);
    console.log(`📄 Updated document ${documentId} status to: ${status}`);
  } catch (error) {
    console.error('Database update error:', error);
    throw error;
  }
}

export async function getDocument(documentId: string) {
  const query = 'SELECT * FROM documents WHERE id = $1';

  try {
    const result = await pool.query(query, [documentId]);
    return result.rows[0];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function getCases() {
  const query = 'SELECT * FROM cases ORDER BY created_at DESC';

  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function closeDatabase() {
  await pool.end();
}

export async function checkPostgresConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('PostgreSQL connection check failed:', error);
    return false;
  }
}