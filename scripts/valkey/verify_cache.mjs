import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const VALKEY_URL = process.env.VALKEY_URL || 'redis://127.0.0.1:6379';
const client = new Redis(VALKEY_URL);

async function main() {
  try {
    const file = path.join(process.cwd(), '.opencode', 'ace-packet.json');
    const raw = await fs.readFile(file, 'utf8');
    const packet = JSON.parse(raw);

    const hash = crypto.createHash('sha256').update(String(packet.query || '')).digest('hex');
    const key = `ace:packet:${hash}`;

    const exists = await client.exists(key);
    const ttl = await client.ttl(key);
    const val = await client.get(key);
    let parsed = null;
    try { parsed = val ? JSON.parse(val) : null; } catch (e) { parsed = null; }

    const result = {
      key,
      exists: !!exists,
      ttl,
      packet: {
        tokenBudget: packet.tokenBudget ?? null,
        tokenEstimate: packet.tokenEstimate ?? null,
        cards: Array.isArray(packet.cards) ? packet.cards.length : null
      },
      cached: parsed ? {
        tokenBudget: parsed.tokenBudget ?? null,
        tokenEstimate: parsed.tokenEstimate ?? null,
        cards: Array.isArray(parsed.cards) ? parsed.cards.length : null,
        previewCard: Array.isArray(parsed.cards) && parsed.cards.length ? parsed.cards[0] : null
      } : null
    };

    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    console.error('Failed to verify cache:', err);
    process.exitCode = 1;
  } finally {
    try { await client.quit(); } catch {}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
