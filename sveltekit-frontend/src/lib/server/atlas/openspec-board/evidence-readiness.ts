import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveOpenSpecReportDirectory } from './report-reader';

/**
 * Read-only readiness chips for the OpenSpec evidence pipeline. Each chip reports the
 * status string of one committed plan report; "not run yet" / "blocked" is a neutral
 * state, never an error. Request-local: no module state.
 */
export type EvidenceReadinessChipV1 = {
  id: 'embedding' | 'pgvector' | 'gpuParity' | 'hybridRrf' | 'projectionParity' | 'ledgerImport';
  label: string;
  report: string;
  status: string;
  tone: 'ok' | 'blocked' | 'unknown';
};

const CHIPS: Array<Omit<EvidenceReadinessChipV1, 'status' | 'tone'>> = [
  { id: 'embedding', label: 'Embedding model', report: 'openspec-evidence-embedding-plan-v1.json' },
  { id: 'pgvector', label: 'pgvector oracle', report: 'openspec-evidence-retrieval-plan-v1.json' },
  { id: 'projectionParity', label: 'Projection parity', report: 'openspec-evidence-projection-parity-plan-v1.json' },
  { id: 'gpuParity', label: 'GPU acceleration', report: 'openspec-evidence-gpu-acceleration-plan-v1.json' },
  { id: 'hybridRrf', label: 'Hybrid RRF', report: 'openspec-evidence-hybrid-rrf-audit-v1.json' },
  { id: 'ledgerImport', label: 'Ledger import', report: 'openspec-evidence-ledger-import-plan-v1.json' }
];

export function toneForReadinessStatus(status: string): EvidenceReadinessChipV1['tone'] {
  if (status === 'REPORT_MISSING' || status === 'REPORT_INVALID') return 'unknown';
  const tokens = status.split('_');
  const negative = tokens.some((t) => t === 'BLOCKED' || t === 'NOT' || t === 'FAILED' || /^UN[A-Z]+$/.test(t));
  const positive = tokens.some((t) => t === 'PROVEN' || t === 'READY' || t === 'PASS' || t === 'COMPLETED');
  return positive && !negative ? 'ok' : 'blocked';
}

export async function readEvidenceReadinessChipsV1(
  reportDirectory?: string
): Promise<EvidenceReadinessChipV1[]> {
  let dir = reportDirectory;
  if (!dir) {
    try {
      dir = await resolveOpenSpecReportDirectory();
    } catch {
      dir = path.resolve(process.cwd(), 'docs', 'reports');
    }
  }
  return Promise.all(
    CHIPS.map(async (chip) => {
      try {
        const parsed: unknown = JSON.parse(await fs.readFile(path.join(dir as string, chip.report), 'utf8'));
        const raw = (parsed as { status?: unknown } | null)?.status;
        const status = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 96) : 'REPORT_INVALID';
        return { ...chip, status, tone: toneForReadinessStatus(status) };
      } catch {
        return { ...chip, status: 'REPORT_MISSING', tone: 'unknown' as const };
      }
    })
  );
}
