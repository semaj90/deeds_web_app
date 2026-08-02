import { eq, and, ilike } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { libraryIdentities, type LibraryIdentityRow } from '$lib/server/db/schema/library-identities.js';
import type { LibraryIdentity } from './types.js';

export interface ParsedAddress {
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'pip';
  packageName: string;
  packageVersion: string;
}

/** Parses "npm:ts-morph@27.0.2" / "pip:torch@2.8.0+cu128" (version may itself contain "@"-free "+" suffixes). */
export function parseAddress(address: string): ParsedAddress | null {
  const colonIdx = address.indexOf(':');
  if (colonIdx === -1) return null;
  const packageManager = address.slice(0, colonIdx) as ParsedAddress['packageManager'];
  const rest = address.slice(colonIdx + 1);
  const atIdx = rest.lastIndexOf('@');
  // scoped npm packages ("@scope/name@version") have an earlier "@" too — only the LAST "@" separates version
  if (atIdx <= 0) return null;
  const packageName = rest.slice(0, atIdx);
  const packageVersion = rest.slice(atIdx + 1);
  if (!packageName || !packageVersion) return null;
  return { packageManager, packageName, packageVersion };
}

function rowToIdentity(row: LibraryIdentityRow): LibraryIdentity {
  return {
    packageName: row.packageName,
    packageVersion: row.packageVersion,
    packageManager: row.packageManager as LibraryIdentity['packageManager'],
    lockfileDigest: row.lockfileDigest,
    packageJsonDigest: row.packageJsonDigest,
    installationPath: row.installationPath,
    sourceType: row.sourceType as LibraryIdentity['sourceType'],
    address: row.address,
    workspaceRoot: row.workspaceRoot,
    tier1: row.tier1 ?? null,
    tier2Paths: row.tier2Paths ?? null,
    scannedAt: row.scannedAt instanceof Date ? row.scannedAt.toISOString() : String(row.scannedAt),
  };
}

export async function resolveLibraryIdentity(address: string): Promise<LibraryIdentity | null> {
  const rows = await db.select().from(libraryIdentities).where(eq(libraryIdentities.address, address)).limit(1);
  return rows[0] ? rowToIdentity(rows[0]) : null;
}

export interface SearchLibraryIdentitiesOptions {
  query?: string;
  sourceType?: LibraryIdentity['sourceType'];
  packageManager?: LibraryIdentity['packageManager'];
  workspaceRoot?: string;
  limit?: number;
}

export async function searchLibraryIdentities(opts: SearchLibraryIdentitiesOptions = {}): Promise<LibraryIdentity[]> {
  const conditions = [];
  if (opts.query) conditions.push(ilike(libraryIdentities.packageName, `%${opts.query}%`));
  if (opts.sourceType) conditions.push(eq(libraryIdentities.sourceType, opts.sourceType));
  if (opts.packageManager) conditions.push(eq(libraryIdentities.packageManager, opts.packageManager));
  if (opts.workspaceRoot) conditions.push(eq(libraryIdentities.workspaceRoot, opts.workspaceRoot));

  const rows = await db
    .select()
    .from(libraryIdentities)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(Math.min(opts.limit ?? 50, 200));

  return rows.map(rowToIdentity);
}
