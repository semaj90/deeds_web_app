import { promises as fs } from 'fs';
import path from 'path';

const LEDGER_REL = '.opencode/outcome-ledger.ndjson';

function ledgerPath(): string {
  return path.join(process.cwd(), LEDGER_REL);
}

export async function appendOutcomeLedger(event: Record<string, unknown>): Promise<void> {
  try {
    const p = ledgerPath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    
    // Map outcome to reward scores
    let reward = event.reward;
    if (reward === undefined && typeof event.outcome === 'string') {
      const outcome = event.outcome.toLowerCase();
      if (outcome === 'success') {
        reward = 1.0;
      } else if (outcome === 'partial') {
        reward = 0.5;
      } else if (outcome === 'failure') {
        reward = 0.0;
      } else if (outcome === 'pending') {
        reward = null;
      }
    }
    
    const out = JSON.stringify({ ...event, reward, ts: new Date().toISOString() }) + '\n';
    await fs.appendFile(p, out, { encoding: 'utf8' });
  } catch (err) {
    // Non-fatal observability helper — swallow errors
    console.warn('[OutcomeLedger] append failed:', (err as Error)?.message ?? err);
  }
}
