import { createHash } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';

const ERROR_FIX_PREFIX = 'agent:error-fix:';
const ERROR_FIX_FILE_PREFIX = 'agent:error-fix:file:';
const ERROR_FIX_TTL_SECONDS = 60 * 60 * 24 * 30;

export type ErrorFixMemoryVerificationStatus = 'passed' | 'failed' | 'unknown' | 'reverted';

export interface ErrorFixMemoryInput {
  errorText: string;
  filePath?: string;
  route?: string;
}

export interface ErrorFixMemoryRecord {
  errorHash: string;
  filePath?: string;
  route?: string;
  diagnosis: string;
  patchSummary: string;
  verificationStatus: ErrorFixMemoryVerificationStatus;
  toolCalls: string[];
  updatedAt: string;
}

function normalizeFilePath(filePath?: string): string | undefined {
  return filePath?.replace(/\\/g, '/').trim() || undefined;
}

function recordKey(errorHash: string): string {
  return `${ERROR_FIX_PREFIX}${errorHash}`;
}

function fileIndexKey(filePath: string): string {
  return `${ERROR_FIX_FILE_PREFIX}${filePath}`;
}

function safeParseRecord(raw: string | null): ErrorFixMemoryRecord | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ErrorFixMemoryRecord;
  } catch {
    return null;
  }
}

export function hashError(input: ErrorFixMemoryInput): string {
  const payload = {
    errorText: input.errorText.trim().slice(0, 4000),
    filePath: normalizeFilePath(input.filePath),
    route: input.route?.trim() || 'gemma4-agent',
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

export async function getErrorFixMemory(
  input: ErrorFixMemoryInput,
): Promise<ErrorFixMemoryRecord | null> {
  const redis = getRedis();
  const normalizedFilePath = normalizeFilePath(input.filePath);
  const errorHash = hashError({ ...input, filePath: normalizedFilePath });

  const exactMatch = safeParseRecord(await redis.get(recordKey(errorHash)));
  if (exactMatch) return exactMatch;

  if (!normalizedFilePath) return null;

  const knownHashes = await redis.smembers(fileIndexKey(normalizedFilePath));
  for (const knownHash of knownHashes) {
    const candidate = safeParseRecord(await redis.get(recordKey(knownHash)));
    if (candidate) return candidate;
  }

  return null;
}

export async function saveErrorFixMemory(
  input: ErrorFixMemoryInput,
  update: Omit<ErrorFixMemoryRecord, 'errorHash' | 'updatedAt' | 'filePath' | 'route'>,
): Promise<ErrorFixMemoryRecord> {
  const redis = getRedis();
  const normalizedFilePath = normalizeFilePath(input.filePath);
  const errorHash = hashError({ ...input, filePath: normalizedFilePath });
  const existing = safeParseRecord(await redis.get(recordKey(errorHash)));

  const record: ErrorFixMemoryRecord = {
    errorHash,
    filePath: normalizedFilePath ?? existing?.filePath,
    route: input.route?.trim() || existing?.route || 'gemma4-agent',
    diagnosis: update.diagnosis,
    patchSummary: update.patchSummary,
    verificationStatus: update.verificationStatus,
    toolCalls: update.toolCalls,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(recordKey(errorHash), JSON.stringify(record), 'EX', ERROR_FIX_TTL_SECONDS);

  if (record.filePath) {
    const indexKey = fileIndexKey(record.filePath);
    await redis.sadd(indexKey, errorHash);
    await redis.expire(indexKey, ERROR_FIX_TTL_SECONDS);
  }

  return record;
}