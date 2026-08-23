import { readFile } from 'node:fs/promises';
import { okfSchema, type OkfRecord } from '../contracts/okf-schema';

export async function loadOkfRecord(path: string): Promise<OkfRecord> {
  const raw = await readFile(path, 'utf8');
  return okfSchema.parse(JSON.parse(raw));
}

