require('dotenv').config();
const express = require('express');
const { Queue } = require('bullmq');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const docQueue = new Queue('document-pipeline', { connection: { host: '127.0.0.1', port: 6379 } });

async function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const ollama = spawn('ollama', ['embed', '-m', 'embedding-gemma:latest', text]);
    let data = '';
    ollama.stdout.on('data', (chunk) => (data += chunk.toString()));
    ollama.stderr.on('data', (err) => console.error('Ollama Error:', err.toString()));
    ollama.on('close', () => {
      try {
        const parsed = JSON.parse(data);
        resolve(parsed.embedding);
      } catch (e) {
        reject(e);
      }
    });
  });
}

app.post('/api/embedding', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const emb = await getEmbedding(text);
    res.json({ embedding: emb });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'embedding_failed', details: e.message });
  }
});

app.post('/api/queue', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath required' });
  await docQueue.add('process', { filePath });
  res.json({ status: 'queued' });
});

app.listen(3001, () => console.log('starter-gemma backend listening on :3001'));
