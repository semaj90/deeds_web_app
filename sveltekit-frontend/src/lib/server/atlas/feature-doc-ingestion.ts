import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { validateExternalUrl } from '$lib/server/security/url-validator.js';
import {
  FeatureDocumentManifestSchema,
  FeatureDocumentManifestSourceSchema,
  getFeatureDocumentEvidence,
  type FeatureDocumentEvidence,
} from './feature-document-evidence.js';

const APPROVED_WORKSPACE_ROOTS = [
  path.resolve(process.cwd()),
  path.resolve(process.cwd(), '..'),
];

function normalizeFsPath(value: string): string {
  return path.normalize(value);
}

export const FeatureDocumentPlannedSourceSchema = z.object({
  sourceRef: z.string().min(1),
  title: z.string().min(1).optional(),
  sourceType: z.string().min(1),
  authorityClass: z.string().min(1),
  accepted: z.boolean(),
  ingestionAdapter: z.enum(['remote_crawl', 'local_file', 'reuse_existing', 'none']),
  canonicalUrl: z.string().url().optional(),
  localPath: z.string().min(1).optional(),
  rejectionReason: z.string().min(1).optional(),
});

export const FeatureDocumentIngestionPlanSchema = z.object({
  featureId: z.string().min(1),
  title: z.string().min(1),
  manifestPath: z.string().min(1),
  docsDirectory: z.string().nullable(),
  featureNotePath: z.string().nullable(),
  corpusType: z.literal('docs'),
  totalOfficialDocs: z.number().int().nonnegative(),
  totalManifestSources: z.number().int().nonnegative(),
  remoteCrawlSources: z.array(FeatureDocumentPlannedSourceSchema),
  localRepositorySources: z.array(FeatureDocumentPlannedSourceSchema),
  existingIndexedSources: z.array(FeatureDocumentPlannedSourceSchema),
  rejectedSources: z.array(FeatureDocumentPlannedSourceSchema),
  storage: z.object({
    documentsTable: z.string().min(1),
    chunksTable: z.string().min(1),
    qdrantCollection: z.string().min(1),
    embeddingDimension: z.number().int().positive(),
  }),
  warnings: z.array(z.string()),
});

export type FeatureDocumentIngestionPlan = z.infer<typeof FeatureDocumentIngestionPlanSchema>;

export interface BuildFeatureDocumentIngestionPlanResult {
  evidence: FeatureDocumentEvidence;
  plan: FeatureDocumentIngestionPlan;
}

function normalizeRepoRelativeSourceRef(absolutePath: string): string {
  const repoRoot = path.resolve(process.cwd(), '..');
  const frontendRoot = path.resolve(process.cwd());
  const relToFrontend = path.relative(frontendRoot, absolutePath).replace(/\\/g, '/');
  if (relToFrontend && !relToFrontend.startsWith('..')) return relToFrontend;

  const relToRepo = path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
  if (relToRepo && !relToRepo.startsWith('..')) return relToRepo;

  return absolutePath.replace(/\\/g, '/');
}

function resolveApprovedLocalPath(localPath: string): { ok: true; absolutePath: string; sourceRef: string } | { ok: false; reason: string } {
  const trimmed = String(localPath ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'missing_local_path' };

  const candidateBases = path.isAbsolute(trimmed)
    ? ['']
    : APPROVED_WORKSPACE_ROOTS;

  for (const base of candidateBases) {
    const candidate = path.normalize(base ? path.resolve(base, trimmed) : trimmed);
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;

    const realCandidate = normalizeFsPath(fs.realpathSync.native(candidate));
    const approved = APPROVED_WORKSPACE_ROOTS.some((root) => {
      const realRoot = normalizeFsPath(fs.existsSync(root) ? fs.realpathSync.native(root) : root);
      return realCandidate === realRoot || realCandidate.startsWith(`${realRoot}${path.sep}`);
    });

    if (!approved) {
      return { ok: false, reason: 'local_path_outside_workspace_roots' };
    }

    return {
      ok: true,
      absolutePath: realCandidate,
      sourceRef: normalizeRepoRelativeSourceRef(realCandidate),
    };
  }

  return { ok: false, reason: 'local_path_missing_or_not_file' };
}

export async function buildFeatureDocumentIngestionPlan(
  featureIdInput: string
): Promise<BuildFeatureDocumentIngestionPlanResult> {
  const featureId = String(featureIdInput ?? '').trim();
  if (!featureId) {
    throw new Error('featureId is required');
  }

  const evidence = await getFeatureDocumentEvidence(featureId);
  if (!evidence.manifestPath) {
    throw new Error(`Feature manifest missing for ${featureId}`);
  }

  const rawManifest = fs.readFileSync(evidence.manifestPath, 'utf8');
  const manifest = FeatureDocumentManifestSchema.parse(JSON.parse(rawManifest));

  const remoteCrawlSources: Array<z.infer<typeof FeatureDocumentPlannedSourceSchema>> = [];
  const localRepositorySources: Array<z.infer<typeof FeatureDocumentPlannedSourceSchema>> = [];
  const existingIndexedSources: Array<z.infer<typeof FeatureDocumentPlannedSourceSchema>> = [];
  const rejectedSources: Array<z.infer<typeof FeatureDocumentPlannedSourceSchema>> = [];
  const seenSourceRefs = new Set<string>();

  for (const doc of manifest.officialDocs) {
    const validation = validateExternalUrl(doc.url);
    if (validation.valid) {
      if (seenSourceRefs.has(doc.url)) continue;
      seenSourceRefs.add(doc.url);
      remoteCrawlSources.push({
        sourceRef: doc.url,
        title: doc.title,
        sourceType: doc.sourceType,
        authorityClass: doc.sourceType === 'official_docs' || doc.sourceType === 'github_repo' ? 'official' : 'secondary',
        accepted: true,
        ingestionAdapter: 'remote_crawl',
        canonicalUrl: doc.url,
      });
    } else {
      rejectedSources.push({
        sourceRef: doc.url,
        title: doc.title,
        sourceType: doc.sourceType,
        authorityClass: doc.sourceType === 'official_docs' || doc.sourceType === 'github_repo' ? 'official' : 'secondary',
        accepted: false,
        ingestionAdapter: 'none',
        canonicalUrl: doc.url,
        rejectionReason: validation.error ?? 'invalid_url',
      });
    }
  }

  for (const source of manifest.sources) {
    const parsed = FeatureDocumentManifestSourceSchema.parse(source);
    if (parsed.url) {
      const validation = validateExternalUrl(parsed.url);
      const planned = {
        sourceRef: parsed.sourceRef,
        title: parsed.title,
        sourceType: parsed.sourceType,
        authorityClass: parsed.authorityClass,
        canonicalUrl: parsed.url,
      };
      if (seenSourceRefs.has(parsed.sourceRef)) continue;
      seenSourceRefs.add(parsed.sourceRef);

      if (validation.valid) {
        remoteCrawlSources.push({
          ...planned,
          accepted: true,
          ingestionAdapter: 'remote_crawl',
        });
      } else {
        rejectedSources.push({
          ...planned,
          accepted: false,
          ingestionAdapter: 'none',
          rejectionReason: validation.error ?? 'invalid_url',
        });
      }
      continue;
    }

    if (parsed.localPath) {
      const resolved = resolveApprovedLocalPath(parsed.localPath);
      if (resolved.ok === false) {
        rejectedSources.push({
          sourceRef: parsed.sourceRef,
          title: parsed.title,
          sourceType: parsed.sourceType,
          authorityClass: parsed.authorityClass,
          accepted: false,
          ingestionAdapter: 'none',
          localPath: parsed.localPath,
          rejectionReason: resolved.reason,
        });
        continue;
      }

      if (seenSourceRefs.has(parsed.sourceRef)) continue;
      seenSourceRefs.add(parsed.sourceRef);
      localRepositorySources.push({
        sourceRef: parsed.sourceRef || resolved.sourceRef,
        title: parsed.title,
        sourceType: parsed.sourceType,
        authorityClass: parsed.authorityClass,
        accepted: true,
        ingestionAdapter: 'local_file',
        localPath: resolved.absolutePath.replace(/\\/g, '/'),
      });
    }
  }

  const warnings = [...evidence.warnings];
  if (remoteCrawlSources.length === 0 && localRepositorySources.length === 0 && existingIndexedSources.length === 0) {
    warnings.push('no_accepted_feature_document_sources');
  }
  if (remoteCrawlSources.length === 0) warnings.push('no_valid_remote_doc_sources');
  if (localRepositorySources.length === 0) warnings.push('no_valid_local_repository_sources');
  if (rejectedSources.length > 0) warnings.push('feature_document_sources_rejected');

  const plan = FeatureDocumentIngestionPlanSchema.parse({
    featureId,
    title: manifest.title ?? featureId,
    manifestPath: evidence.manifestPath,
    docsDirectory: evidence.docsDirectory,
    featureNotePath: evidence.featureNotePath,
    corpusType: 'docs',
    totalOfficialDocs: manifest.officialDocs.length,
    totalManifestSources: manifest.sources.length,
    remoteCrawlSources,
    localRepositorySources,
    existingIndexedSources,
    rejectedSources,
    storage: {
      documentsTable: evidence.storage.postgres.documentsTable,
      chunksTable: evidence.storage.postgres.chunksTable,
      qdrantCollection: evidence.storage.qdrant.collection,
      embeddingDimension: evidence.storage.qdrant.embeddingDimension,
    },
    warnings,
  });

  return { evidence, plan };
}
