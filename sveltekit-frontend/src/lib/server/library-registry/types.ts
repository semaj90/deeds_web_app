export interface LibraryIdentity {
  packageName: string;
  packageVersion: string;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'pip';
  lockfileDigest: string | null;
  packageJsonDigest: string | null;
  installationPath: string;
  sourceType: 'workspace' | 'dependency' | 'generated' | 'vendored';
  address: string;
  workspaceRoot: string;
  tier1: {
    exports?: unknown;
    types?: string;
    main?: string;
    description?: string;
  } | null;
  tier2Paths: string[] | null;
  scannedAt: string;
}

export type LibraryTier = 1 | 2 | 3 | 4;

export interface TierFileEntry {
  path: string;
  content?: string;
}
