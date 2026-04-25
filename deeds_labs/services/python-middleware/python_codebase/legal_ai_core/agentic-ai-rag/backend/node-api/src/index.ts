import express from 'express';
import { callAgenticFunction } from './services/ragService'; // <-- fixed relative path

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

// use built-in JSON parser with same limit
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'agentic-node-api' }));

// RPC endpoint to call an agentic function by name
app.post('/api/agentic/call', async (req, res) => {
  try {
    const { name, args } = req.body || {};
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Missing agent function name' });
    }
    const safeArgs = Array.isArray(args) ? args : [];
    const result = await callAgenticFunction(name, safeArgs);
    return res.json({ ok: true, result });
  } catch (err: any) {
    console.error('Agentic RPC error:', err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// start server and export app + server for tests
const server = app.listen(port, () => console.log(`🚀 agentic-node-api listening on http://localhost:${port}`));

export default app;
export { server };
