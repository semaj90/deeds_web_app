require('dotenv').config();
const { Worker } = require('bullmq');
const { spawn } = require('child_process');

const connection = { host: '127.0.0.1', port: 6379 };

const worker = new Worker('document-pipeline', async job => {
  console.log('processing job', job.id, job.name, job.data);
  const { filePath } = job.data;
  // placeholder: extract text via OCR (call python script or tesseract)
  const extractedText = `Extracted text from ${filePath}`;

  // embed using ollama
  const ollama = spawn('ollama', ['embed', '-m', 'embedding-gemma:latest', extractedText]);
  let data = '';
  ollama.stdout.on('data', chunk => data += chunk.toString());
  ollama.stderr.on('data', err => console.error('Ollama Error:', err.toString()));
  await new Promise((resolve, reject) => {
    ollama.on('close', () => {
      try { resolve(JSON.parse(data).embedding); } catch(e) { reject(e); }
    })
  });

  // TODO: write vector to Qdrant / Postgres via Drizzle
  console.log('embedding computed for', filePath);
});

worker.on('completed', job => console.log('job completed', job.id));
worker.on('failed', (job, err) => console.error('job failed', job?.id, err));

console.log('worker started for document-pipeline');
