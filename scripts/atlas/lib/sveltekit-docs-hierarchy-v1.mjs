import crypto from 'node:crypto';
import path from 'node:path';

const NAV_GROUPS = [
  'Getting started',
  'Core concepts',
  'Build and deploy',
  'Advanced',
  'Best practices',
  'Appendix',
  'Reference',
];

const sha256 = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

function pageFromUrl(url) {
  const slug = new URL(url).pathname.split('/').filter(Boolean).at(-1);
  if (!slug) throw new Error('SVELTEKIT_HIERARCHY_URL_HAS_NO_PAGE');
  return slug;
}

function groupFromEditUrl(editUrl) {
  const pathname = new URL(editUrl).pathname;
  const match = pathname.match(/\/documentation\/docs\/([^/]+)\//);
  if (!match) throw new Error('SVELTEKIT_HIERARCHY_EDIT_URL_OUT_OF_SCOPE');
  const label = match[1].replace(/^\d+-/, '').replaceAll('-', ' ');
  const normalized = label.toLowerCase();
  return NAV_GROUPS.find(group => group.toLowerCase() === normalized) ?? label;
}

export function buildSveltekitDocsHierarchyV1({ rawFiles, metadataFiles, chunkRows }) {
  const rawByPage = new Map();
  for (const file of rawFiles) {
    if (typeof file.path !== 'string' || typeof file.text !== 'string') throw new Error('SVELTEKIT_HIERARCHY_RAW_FILE_INVALID');
    const page = file.path.replaceAll('\\', '/').split('/').at(-1).replace(/^svelte\.dev-docs-kit-/, '').replace(/\.md$/, '');
    if (!page || rawByPage.has(page)) throw new Error('SVELTEKIT_HIERARCHY_RAW_PAGE_DUPLICATE');
    const title = file.text.match(/^#\s+(.+)\s*$/m)?.[1]?.trim();
    if (!title) throw new Error(`SVELTEKIT_HIERARCHY_PAGE_TITLE_MISSING:${page}`);
    rawByPage.set(page, { path: file.path.replaceAll('\\', '/'), title, bytes: Buffer.byteLength(file.text, 'utf8'), sha256: sha256(Buffer.from(file.text, 'utf8')) });
  }

  const chunkPages = new Map();
  for (const row of chunkRows) {
    const page = pageFromUrl(row.source_url);
    const item = chunkPages.get(page) ?? { urls: new Set(), chunkIds: new Set(), headingPaths: new Set() };
    item.urls.add(row.source_url);
    item.chunkIds.add(row.chunk_id);
    item.headingPaths.add((row.heading_path ?? []).join(' > '));
    chunkPages.set(page, item);
  }

  const metadataByPage = new Map();
  for (const metadata of metadataFiles) {
    const page = pageFromUrl(metadata.resolved_url);
    const editUrl = metadata.outgoing_urls?.find(url => {
      try { return new URL(url).pathname.includes('/documentation/docs/'); } catch { return false; }
    });
    const existing = metadataByPage.get(page);
    if (existing) throw new Error(`SVELTEKIT_HIERARCHY_METADATA_DUPLICATE:${page}`);
    metadataByPage.set(page, { resolvedUrl: metadata.resolved_url, editUrl, group: editUrl ? groupFromEditUrl(editUrl) : null });
  }

  const pages = [...rawByPage.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([page, raw]) => {
    const chunks = chunkPages.get(page);
    const metadata = metadataByPage.get(page);
    const chunkUrl = chunks?.urls.size === 1 ? [...chunks.urls][0] : null;
    const matched = Boolean(chunks && chunks.urls.size === 1 && metadata?.editUrl && metadata.resolvedUrl === chunkUrl);
    return {
      page,
      title: raw.title,
      rawPath: raw.path,
      rawBytes: raw.bytes,
      rawSha256: raw.sha256,
      section: metadata?.group ?? null,
      sectionEvidenceUrl: metadata?.editUrl ?? null,
      sourceUrl: chunkUrl,
      chunkCount: chunks?.chunkIds.size ?? 0,
      headingPathCount: chunks?.headingPaths.size ?? 0,
      status: matched && NAV_GROUPS.includes(metadata.group) ? 'MAPPED_FROM_PINNED_SOURCE_METADATA' : 'UNRESOLVED',
    };
  });

  const rawPages = new Set(rawByPage.keys());
  const chunksWithoutRaw = [...chunkPages.keys()].filter(page => !rawPages.has(page)).sort();
  const metadataWithoutRaw = [...metadataByPage.keys()].filter(page => !rawPages.has(page)).sort();
  const referenceOnly = new Map();
  for (const metadata of metadataFiles) {
    for (const url of metadata.outgoing_urls ?? []) {
      let parsed;
      try { parsed = new URL(url); } catch { continue; }
      if (parsed.hostname !== 'svelte.dev' || !parsed.pathname.startsWith('/docs/kit/')) continue;
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const page = pathParts.at(-1);
      if (!rawPages.has(page) && (page.startsWith('$app') || page.startsWith('$env') || page.startsWith('@'))) {
        referenceOnly.set(url, { url, referencedBy: metadata.resolved_url });
      }
    }
  }

  const groups = NAV_GROUPS.map(name => ({
    name,
    pages: pages.filter(page => page.section === name).map(({ page, title, status }) => ({ page, title, status })),
    status: pages.some(page => page.section === name) ? 'HAS_PINNED_PAGES' : 'NO_PINNED_PAGE_IN_COHORT',
  }));
  const filesForChecksum = pages.map(({ rawPath, rawBytes, rawSha256 }) => ({ path: rawPath, bytes: rawBytes, sha256: rawSha256 }));
  const metadataInputs = metadataFiles.map(file => ({
    resolvedUrl: file.resolved_url,
    outgoingUrls: [...(file.outgoing_urls ?? [])].sort(),
  })).sort((a, b) => String(a.resolvedUrl).localeCompare(String(b.resolvedUrl)));
  const chunkInputs = chunkRows.map(row => ({ chunkId: row.chunk_id, sourceUrl: row.source_url, headingPath: row.heading_path ?? [] }))
    .sort((a, b) => String(a.chunkId).localeCompare(String(b.chunkId)));
  const inputChecksum = sha256(Buffer.from(JSON.stringify({ filesForChecksum, metadataInputs, chunkInputs }), 'utf8'));
  const unresolved = pages.filter(page => page.status === 'UNRESOLVED');
  return {
    schema: 'atlas.sveltekit-docs-hierarchy.v1',
    status: unresolved.length || chunksWithoutRaw.length || metadataWithoutRaw.length ? 'HIERARCHY_PARTIAL' : 'HIERARCHY_MAPPED_WITH_COHORT_LIMITS',
    navGroups: groups,
    pages,
    referenceOnlyUnpinnedLinks: [...referenceOnly.values()].sort((a, b) => a.url.localeCompare(b.url)),
    unmatched: { pagesWithoutChunkRecords: pages.filter(page => !page.chunkCount).map(page => page.page), chunkPagesWithoutRaw: chunksWithoutRaw, metadataPagesWithoutRaw: metadataWithoutRaw },
    counts: { rawPages: pages.length, mappedPages: pages.filter(page => page.status === 'MAPPED_FROM_PINNED_SOURCE_METADATA').length, unresolvedPages: unresolved.length, chunkRecords: chunkRows.length, referenceOnlyUnpinnedLinks: referenceOnly.size },
    inputChecksum,
    canonicalAuthority: false,
    datastoreWritesAttempted: 0,
    datastoreWritesCommitted: 0,
  };
}
