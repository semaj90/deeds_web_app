import path from 'node:path';
import { existsSync } from 'node:fs';

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((value) => path.resolve(value)))];
}

export function normalizeFeatureSlug(featureId: string): string {
  return featureId.trim().replace(/[:.]/g, '_').replace(/[^A-Za-z0-9_-]/g, '_');
}

export function getFeatureDocsRoots(): string[] {
  const cwd = process.cwd();

  return uniquePaths([
    path.join(cwd, 'docs'),
    path.join(cwd, 'sveltekit-frontend', 'docs'),
    path.resolve(cwd, '..', 'docs'),
  ]);
}

export function getFeatureNotesRoots(): string[] {
  return getFeatureDocsRoots().map((docsRoot) => path.join(docsRoot, 'features'));
}

export function resolvePreferredDocsRoot(): string {
  const docsRoot = getFeatureDocsRoots().find((candidate) =>
    existsSync(candidate) && existsSync(path.join(candidate, 'features'))
  );

  return docsRoot ?? getFeatureDocsRoots()[0];
}

export function resolvePreferredFeatureNotesRoot(): string {
  const featureNotesRoot = getFeatureNotesRoots().find((candidate) => existsSync(candidate));
  return featureNotesRoot ?? path.join(resolvePreferredDocsRoot(), 'features');
}

export function resolveExistingFeatureNotePath(featureId: string, docRef?: string | null): string | null {
  const slug = normalizeFeatureSlug(featureId);
  const candidates = uniquePaths([
    ...(docRef ? [docRef] : []),
    ...getFeatureNotesRoots().flatMap((root) => [
      path.join(root, `${featureId}.md`),
      path.join(root, `${slug}.md`),
      path.join(root, `feature_${slug}.md`),
    ]),
  ]);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function resolveExistingFeatureBundleDir(featureId: string): string | null {
  const slug = normalizeFeatureSlug(featureId);
  const candidates = uniquePaths(
    getFeatureDocsRoots().flatMap((docsRoot) => [
      path.join(docsRoot, featureId),
      path.join(docsRoot, slug),
      path.join(docsRoot, 'features', featureId),
      path.join(docsRoot, 'features', slug),
    ])
  );

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function resolvePreferredFeatureNotePath(featureId: string, docRef?: string | null): string {
  const existing = resolveExistingFeatureNotePath(featureId, docRef);
  if (existing) return existing;

  const slug = normalizeFeatureSlug(featureId);
  if (docRef) return path.resolve(docRef);
  return path.join(resolvePreferredFeatureNotesRoot(), `feature_${slug}.md`);
}

export function resolvePreferredFeatureBundleDir(featureId: string): string {
  const existing = resolveExistingFeatureBundleDir(featureId);
  if (existing) return existing;

  return path.join(resolvePreferredDocsRoot(), normalizeFeatureSlug(featureId));
}

export function toPosixAbsolute(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
