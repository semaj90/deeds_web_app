import { readFileSync } from 'node:fs';

export function readJsonReport<T>(relativePath: string): T {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

export function readJsonlReport<T = Record<string, unknown>>(relativePath: string): T[] {
  const url = new URL(relativePath, import.meta.url);
  const text = readFileSync(url, 'utf8').trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
