import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { MASTER_FEATURE_MAP } from './master-feature-map.js';
import { countFeatureScopedRows } from './feature-scope-query.js';
import {
  normalizeFeatureSlug,
  resolveExistingFeatureBundleDir,
  resolveExistingFeatureNotePath,
  toPosixAbsolute,
} from './feature-document-paths.js';

const SCREENSHOT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const FILE_EXTENSIONS = new Set(['.md', '.txt', '.pdf', '.json', '.jsonl', '.csv']);

export const FeatureDocumentSourceTypeSchema = z.enum([
  'official_docs',
  'github_repo',
  'github_issue',
  'web_page',
  'official_external',
  'first_party_repository',
  'local_spec',
  'api_schema',
  'runtime_report',
  'secondary_reference',
  'local_feature_note',
  'screenshot',
  'document_file',
]);

export const FeatureDocumentTrustTierSchema = z.enum([
  'official_or_primary',
  'trusted_community',
  'unverified',
  'local_workspace',
]);

export const FeatureDocumentArtifactSchema = z.object({
  kind: z.enum(['feature_note', 'official_doc', 'screenshot', 'file']),
  path: z.string().optional(),
  url: z.string().url().optional(),
  title: z.string().optional(),
  sourceType: FeatureDocumentSourceTypeSchema,
  trustTier: FeatureDocumentTrustTierSchema,
});

export const FeatureDocumentStorageSchema = z.object({
  postgres: z.object({
    documentsTable: z.string().min(1),
    chunksTable: z.string().min(1),
  }),
  seaweedfs: z.object({
    bucket: z.string().min(1),
  }),
  qdrant: z.object({
    collection: z.string().min(1),
    embeddingDimension: z.number().int().positive(),
  }),
});

export const FeatureDocumentAuthorityClassSchema = z.enum([
  'official',
  'first_party',
  'generated',
  'secondary',
]);

export const FeatureDocumentManifestSourceSchema = z.object({
  sourceRef: z.string().min(1),
  sourceType: z.enum([
    'official_external',
    'first_party_repository',
    'local_spec',
    'api_schema',
    'runtime_report',
    'secondary_reference',
  ]),
  authorityClass: FeatureDocumentAuthorityClassSchema,
  url: z.string().url().optional(),
  localPath: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  expectedContentHash: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.url && !value.localPath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Each manifest source requires either url or localPath',
      path: ['sourceRef'],
    });
  }
});

export const FeatureDocumentManifestSchema = z.object({
  schemaVersion: z.string().min(1).optional(),
  featureId: z.string().min(1),
  title: z.string().min(1).optional(),
  officialDocs: z.array(z.object({
    title: z.string().min(1),
    url: z.string().url(),
    sourceType: z.enum(['official_docs', 'github_repo', 'github_issue', 'web_page']).default('official_docs'),
    screenshotPaths: z.array(z.string()).default([]),
    filePaths: z.array(z.string()).default([]),
  })).default([]),
  sources: z.array(FeatureDocumentManifestSourceSchema).default([]),
  storage: FeatureDocumentStorageSchema.optional(),
});

export const FeatureDocumentEvidenceSchema = z.object({
  featureId: z.string().min(1),
  featureNotePath: z.string().nullable(),
  docsDirectory: z.string().nullable(),
  manifestPath: z.string().nullable(),
  manifestValid: z.boolean(),
  artifacts: z.array(FeatureDocumentArtifactSchema),
  counts: z.object({
    officialDocs: z.number().int().nonnegative(),
    manifestSources: z.number().int().nonnegative(),
    firstPartySources: z.number().int().nonnegative(),
    screenshots: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
    parentAtlasDocuments: z.number().int().nonnegative(),
    atlasFeatureMapRows: z.number().int().nonnegative(),
  }),
  storage: FeatureDocumentStorageSchema,
  status: z.enum([
    'DOCS_PENDING',
    'NOTE_ONLY',
    'MANIFEST_INVALID',
    'READY_FOR_INGESTION',
    'ATLAS_LINKED',
  ]),
  warnings: z.array(z.string()),
  nextActions: z.array(z.string()),
});

export type FeatureDocumentEvidence = z.infer<typeof FeatureDocumentEvidenceSchema>;

function normalizeFeatureId(featureId: string): string {
  return featureId.trim();
}

function findExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readManifest(manifestPath: string | null) {
  if (!manifestPath) {
    return { manifest: null, valid: false, warnings: [] as string[] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const manifest = FeatureDocumentManifestSchema.parse(parsed);
    return { manifest, valid: true, warnings: [] as string[] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      manifest: null,
      valid: false,
      warnings: [`manifest_invalid:${message.slice(0, 200)}`],
    };
  }
}

function collectDirectoryArtifacts(docsDirectory: string | null) {
  const artifacts: z.infer<typeof FeatureDocumentArtifactSchema>[] = [];

  if (!docsDirectory || !fs.existsSync(docsDirectory)) {
    return artifacts;
  }

  for (const entry of fs.readdirSync(docsDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(docsDirectory, entry.name);
    const ext = path.extname(entry.name).toLowerCase();

    if (SCREENSHOT_EXTENSIONS.has(ext)) {
      artifacts.push({
        kind: 'screenshot',
        path: toPosixAbsolute(fullPath),
        sourceType: 'screenshot',
        trustTier: 'local_workspace',
        title: entry.name,
      });
      continue;
    }

    if (FILE_EXTENSIONS.has(ext)) {
      artifacts.push({
        kind: 'file',
        path: toPosixAbsolute(fullPath),
        sourceType: 'document_file',
        trustTier: 'local_workspace',
        title: entry.name,
      });
    }
  }

  return artifacts;
}

function trustTierFromAuthorityClass(
  authorityClass: z.infer<typeof FeatureDocumentAuthorityClassSchema>
): z.infer<typeof FeatureDocumentTrustTierSchema> {
  if (authorityClass === 'official' || authorityClass === 'first_party') return 'official_or_primary';
  if (authorityClass === 'secondary') return 'trusted_community';
  return 'unverified';
}

async function countAtlasRows(featureId: string) {
  return {
    parentAtlasDocuments: await countFeatureScopedRows({
      label: 'atlas.feature_document_evidence.parent_atlas_documents',
      table: 'parent_atlas_documents',
      featureId,
    }),
    atlasFeatureMapRows: await countFeatureScopedRows({
      label: 'atlas.feature_document_evidence.atlas_feature_map',
      table: 'atlas_feature_map',
      featureId,
    }),
  };
}

function resolveFeatureNotePath(featureId: string): string | null {
  const featureEntry = MASTER_FEATURE_MAP[featureId];
  const docRef = typeof featureEntry?.params?.docRef === 'string' ? featureEntry.params.docRef : null;
  return resolveExistingFeatureNotePath(featureId, docRef);
}

function resolveDocsDirectory(featureId: string): string | null {
  return resolveExistingFeatureBundleDir(featureId);
}

function resolveManifestPath(featureId: string, docsDirectory: string | null): string | null {
  const slug = normalizeFeatureSlug(featureId);
  const featureNotePath = resolveFeatureNotePath(featureId);
  return findExistingPath([
    docsDirectory ? path.join(docsDirectory, 'manifest.json') : '',
    featureNotePath ? `${featureNotePath.replace(/\.md$/i, '')}.manifest.json` : '',
    featureNotePath ? path.join(path.dirname(featureNotePath), `${featureId}.manifest.json`) : '',
    featureNotePath ? path.join(path.dirname(featureNotePath), `${slug}.manifest.json`) : '',
  ].filter(Boolean));
}

export async function getFeatureDocumentEvidence(featureIdInput: string): Promise<FeatureDocumentEvidence> {
  const featureId = normalizeFeatureId(featureIdInput);
  if (!featureId) {
    throw new Error('featureId is required');
  }

  const featureNotePath = resolveFeatureNotePath(featureId);
  const docsDirectory = resolveDocsDirectory(featureId);
  const manifestPath = resolveManifestPath(featureId, docsDirectory);
  const manifestResult = readManifest(manifestPath);
  const atlasCounts = await countAtlasRows(featureId);

  const artifacts: z.infer<typeof FeatureDocumentArtifactSchema>[] = [];
  if (featureNotePath) {
    artifacts.push({
      kind: 'feature_note',
      path: toPosixAbsolute(featureNotePath),
      sourceType: 'local_feature_note',
      trustTier: 'local_workspace',
      title: path.basename(featureNotePath),
    });
  }

  artifacts.push(...collectDirectoryArtifacts(docsDirectory));

  for (const doc of manifestResult.manifest?.officialDocs ?? []) {
    artifacts.push({
      kind: 'official_doc',
      url: doc.url,
      title: doc.title,
      sourceType: doc.sourceType,
      trustTier: doc.sourceType === 'official_docs' || doc.sourceType === 'github_repo'
        ? 'official_or_primary'
        : doc.sourceType === 'github_issue'
          ? 'trusted_community'
          : 'unverified',
    });

    for (const screenshotPath of doc.screenshotPaths) {
      artifacts.push({
        kind: 'screenshot',
        path: screenshotPath,
        sourceType: 'screenshot',
        trustTier: 'local_workspace',
      });
    }

    for (const filePath of doc.filePaths) {
      artifacts.push({
        kind: 'file',
        path: filePath,
        sourceType: 'document_file',
        trustTier: 'local_workspace',
      });
    }
  }

  for (const source of manifestResult.manifest?.sources ?? []) {
    if (source.url) {
      artifacts.push({
        kind: 'official_doc',
        url: source.url,
        title: source.title,
        sourceType: source.sourceType,
        trustTier: trustTierFromAuthorityClass(source.authorityClass),
      });
    }

    if (source.localPath) {
      const lower = source.localPath.toLowerCase();
      artifacts.push({
        kind: 'file',
        path: source.localPath,
        title: source.title,
        sourceType: source.sourceType,
        trustTier: source.authorityClass === 'first_party' ? 'local_workspace' : trustTierFromAuthorityClass(source.authorityClass),
      });

      if (SCREENSHOT_EXTENSIONS.has(path.extname(lower))) {
        artifacts.push({
          kind: 'screenshot',
          path: source.localPath,
          title: source.title,
          sourceType: 'screenshot',
          trustTier: 'local_workspace',
        });
      }
    }
  }

  const officialDocs = artifacts.filter((artifact) => artifact.kind === 'official_doc').length;
  const manifestSources = manifestResult.manifest?.sources.length ?? 0;
  const firstPartySources = (manifestResult.manifest?.sources ?? []).filter((source) =>
    source.authorityClass === 'first_party' || source.authorityClass === 'official'
  ).length;
  const screenshots = artifacts.filter((artifact) => artifact.kind === 'screenshot').length;
  const files = artifacts.filter((artifact) => artifact.kind === 'file').length;
  const authoritativeSources = officialDocs + firstPartySources;

  const warnings: string[] = [...manifestResult.warnings];
  if (!featureNotePath) warnings.push('feature_note_missing');
  if (!docsDirectory) warnings.push('docs_directory_missing');
  if (!manifestPath) warnings.push('manifest_missing');
  if (officialDocs === 0) warnings.push('official_docs_missing');
  if (authoritativeSources === 0) warnings.push('authoritative_sources_missing');
  if (atlasCounts.parentAtlasDocuments === 0) warnings.push('parent_atlas_documents_missing');
  if (atlasCounts.atlasFeatureMapRows === 0) warnings.push('atlas_feature_map_missing');

  let status: FeatureDocumentEvidence['status'] = 'DOCS_PENDING';
  if (manifestPath && !manifestResult.valid) {
    status = 'MANIFEST_INVALID';
  } else if (featureNotePath && authoritativeSources === 0) {
    status = 'NOTE_ONLY';
  } else if (authoritativeSources > 0) {
    status = atlasCounts.parentAtlasDocuments > 0 || atlasCounts.atlasFeatureMapRows > 0
      ? 'ATLAS_LINKED'
      : 'READY_FOR_INGESTION';
  }

  const evidence = FeatureDocumentEvidenceSchema.parse({
    featureId,
    featureNotePath: featureNotePath ? toPosixAbsolute(featureNotePath) : null,
    docsDirectory: docsDirectory ? toPosixAbsolute(docsDirectory) : null,
    manifestPath: manifestPath ? toPosixAbsolute(manifestPath) : null,
    manifestValid: manifestPath ? manifestResult.valid : false,
    artifacts,
    counts: {
      officialDocs,
      manifestSources,
      firstPartySources,
      screenshots,
      files,
      ...atlasCounts,
    },
    storage: manifestResult.manifest?.storage ?? {
      postgres: {
        documentsTable: 'library_documents',
        chunksTable: 'legal_chunks',
      },
      seaweedfs: {
        bucket: 'legal-documents',
      },
      qdrant: {
        collection: 'documents',
        embeddingDimension: 768,
      },
    },
    status,
    warnings,
    nextActions: [
      ...(!featureNotePath ? [`create docs/features/${featureId.replace(/[:.]/g, '_')}.md`] : []),
      ...(!manifestPath ? [`create docs/${featureId.replace(/[:.]/g, '_')}/manifest.json`] : []),
      ...(authoritativeSources === 0 ? ['add manifest sources for first-party repository evidence or official documentation URLs'] : []),
      ...(firstPartySources === 0 ? ['add first-party repository sources to manifest.json for bounded local ingestion'] : []),
      ...(screenshots === 0 ? ['add screenshots or diagrams for the feature docs bundle'] : []),
      ...(atlasCounts.parentAtlasDocuments === 0 ? ['backfill parent_atlas_documents for this feature_id'] : []),
      ...(atlasCounts.atlasFeatureMapRows === 0 ? ['backfill atlas_feature_map rows for this feature_id'] : []),
      'ingest accepted feature document sources into library_documents and legal_chunks before Qdrant mirroring',
    ],
  });

  return evidence;
}
