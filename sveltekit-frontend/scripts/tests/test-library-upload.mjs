/**
 * Test script for library upload + ingestion pipeline.
 * Run: node scripts/tests/test-library-upload.mjs
 */
import { FormData, File, fetch } from 'undici';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function createTestPDF() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);

  const lines = [
    'ARTICLE I - RIGHTS AND FREEDOMS',
    '',
    'Section 1. Due Process of Law',
    '',
    'No person shall be deprived of life, liberty, or property without',
    'due process of law. This fundamental right is guaranteed to all',
    'citizens and residents within the jurisdiction of this statute.',
    'The right to due process includes both procedural and substantive',
    'components as established by legal precedent and case law.',
    '',
    'Section 2. Equal Protection',
    '',
    'All persons within the jurisdiction shall be entitled to equal',
    'protection under the law regardless of race, gender, religion,',
    'or national origin. The state shall enforce this provision through',
    'appropriate legislation and judicial review.',
    '',
    'Section 3. Search and Seizure',
    '',
    'The right of the people to be secure in their persons, houses,',
    'papers, and effects against unreasonable searches and seizures',
    'shall not be violated. No warrant shall issue but upon probable',
    'cause, supported by oath or affirmation.',
  ];

  let y = 750;
  for (const line of lines) {
    if (line.trim()) page.drawText(line.trim(), { x: 50, y, size: 11, font });
    y -= 16;
  }

  return Buffer.from(await doc.save());
}

async function main() {
  const pdfBytes = await createTestPDF();
  console.log('Created test PDF:', pdfBytes.length, 'bytes');

  const form = new FormData();
  form.set('file', new File([pdfBytes], 'test-legal.pdf', { type: 'application/pdf' }));
  form.set('title', 'Test Legal Document');
  form.set('corpusType', 'statute');
  form.set('jurisdiction', 'federal');

  const resp = await fetch('http://localhost:5173/api/library/upload', { method: 'POST', body: form });
  console.log('Upload status:', resp.status);
  const body = await resp.json();
  console.log('Response:', JSON.stringify(body, null, 2));

  if (!body.success || !body.jobId) {
    console.error('Upload failed');
    pool.end();
    return;
  }

  console.log('\nWaiting 20s for ingestion pipeline...');
  await new Promise(r => setTimeout(r, 20000));

  const job = await pool.query('SELECT stage, status, progress, metrics_json::text FROM ingestion_jobs WHERE id = $1', [body.jobId]);
  const doc = await pool.query('SELECT processing_status, page_count FROM library_documents WHERE id = $1', [body.documentId]);
  const nodes = await pool.query('SELECT node_type, heading, node_path FROM legal_nodes WHERE document_id = $1 ORDER BY depth', [body.documentId]);
  const chunks = await pool.query('SELECT count(*) as cnt FROM legal_chunks lc JOIN legal_nodes ln ON lc.legal_node_id = ln.id WHERE ln.document_id = $1', [body.documentId]);

  console.log('\n=== Pipeline Result ===');
  console.log('Job:', JSON.stringify(job.rows[0]));
  console.log('Doc:', JSON.stringify(doc.rows[0]));
  console.log('Nodes:', nodes.rowCount);
  nodes.rows.forEach(n => console.log('  ' + n.node_type + ' | ' + n.heading + ' | ' + n.node_path));
  console.log('Chunks:', chunks.rows[0].cnt);

  const passed = job.rows[0]?.status === 'complete' && parseInt(chunks.rows[0].cnt) > 0;
  console.log('\n' + (passed ? 'PASS' : 'FAIL'));

  pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
