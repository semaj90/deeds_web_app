import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const VALKEY_URL = process.env.VALKEY_URL || 'redis://127.0.0.1:6379';
const client = new Redis(VALKEY_URL);

async function main() {
  try {
    // allow override: --packet <path>
    const argv = process.argv.slice(2);
    let packetPath = path.join(process.cwd(), '.opencode', 'ace-packet.json');
    const pIdx = argv.indexOf('--packet');
    if (pIdx !== -1 && argv[pIdx + 1]) packetPath = path.resolve(argv[pIdx + 1]);

    const raw = await fs.readFile(packetPath, 'utf8');
    const packet = JSON.parse(raw);

    // compute canonical cache key to match server hashQuery behavior
    const hash = crypto.createHash('sha256').update(String(packet.query || '')).digest('hex');
    const key = `ace:packet:${hash}`;
    const srcKey = `ace:sourceRefs:${hash}`;
    const ttl = 60 * 60 * 24; // 24h

    // load quarantine list if present
    const quarantinePath = path.join(process.cwd(), '.opencode', 'quarantine', 'invalid-cards.ndjson');
    let quarantineSet = new Set();
    try {
      const qRaw = await fs.readFile(quarantinePath, 'utf8');
      for (const line of qRaw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          const id = obj.card_id || obj.id || obj.sourceRef || obj.source || null;
          if (id) quarantineSet.add(String(id));
        } catch (e) {
          // ignore malformed quarantine lines
        }
      }
    } catch (e) {
      // no quarantine file — treat as empty
    }

    // ensure quarantined cards are not present
    const packetCardIds = (Array.isArray(packet.cards) ? packet.cards : []).map(c => c.card_id || c.id || c.sourceRef || null).filter(Boolean);
    const foundQuarantined = packetCardIds.filter(id => quarantineSet.has(String(id)));
    const report = { key, srcKey, ttl, packetCards: packetCardIds.length, cached: false, quarantinedFound: foundQuarantined.length, errors: [] };
    if (foundQuarantined.length) {
      report.errors.push(`Quarantined cards present: ${foundQuarantined.join(', ')}`);
      await fs.mkdir(path.join(process.cwd(), '.tmp'), { recursive: true });
      await fs.writeFile(path.join(process.cwd(), '.tmp', 'valkey-cache-report.json'), JSON.stringify(report, null, 2), 'utf8');
      console.error('Refusing to cache: packet contains quarantined cards:', foundQuarantined);
      process.exitCode = 2;
      return;
    }

    // write packet and sourceRefs
    await client.setEx(key, ttl, JSON.stringify(packet));
    const sourceRefs = Array.isArray(packet.sourceRefs) ? packet.sourceRefs : packetCardIds;
    await client.setEx(srcKey, ttl, JSON.stringify(sourceRefs));

    report.cached = true;
    report.sourceRefsCount = sourceRefs.length;
    await fs.mkdir(path.join(process.cwd(), '.tmp'), { recursive: true });
    await fs.writeFile(path.join(process.cwd(), '.tmp', 'valkey-cache-report.json'), JSON.stringify(report, null, 2), 'utf8');

    // compact summary to stdout
    console.log(`${key} cached; srcRefs=${sourceRefs.length}; ttl=${ttl}; cards=${packetCardIds.length}`);
  } catch (err) {
    console.error('Failed to cache ACE packet:', err.message || err);
    try { await fs.mkdir(path.join(process.cwd(), '.tmp'), { recursive: true }); await fs.writeFile(path.join(process.cwd(), '.tmp', 'valkey-cache-report.json'), JSON.stringify({ error: String(err) }, null, 2), 'utf8'); } catch(_){}
    process.exitCode = 1;
  } finally {
    try { await client.quit(); } catch {}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
