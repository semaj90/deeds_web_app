#!/usr/bin/env node
/** Enhanced Route Map Export Script */
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const guessedFrontend =
  path.basename(cwd) === 'sveltekit-frontend' ? cwd : path.join(cwd, 'sveltekit-frontend');
const frontendDir = fs.existsSync(path.join(guessedFrontend, 'src'))
  ? guessedFrontend
  : path.join(cwd, 'sveltekit-frontend');
const root = path.basename(frontendDir) === 'sveltekit-frontend' ? path.dirname(frontendDir) : cwd;
const routesConfigPath = path.join(frontendDir, 'src', 'lib', 'data', 'routes-config.ts');
const multiProtoConfigPath = path.join(
  frontendDir,
  'src',
  'lib',
  'config',
  'multi-protocol-routes.ts'
);
const routesDir = path.join(frontendDir, 'src', 'routes');
const outputPath = path.join(root, 'ROUTE_MAP_EXPORT.txt');
const jsonOutputPath = path.join(root, 'ROUTE_MAP_EXPORT.json');
const extended = process.argv.includes('--extended');
const scaffoldMissing = process.argv.includes('--scaffold-missing');
const filterCategory = process.argv.find((arg) => arg.startsWith('--category='))?.split('=')[1];
const filterStatus = process.argv.find((arg) => arg.startsWith('--status='))?.split('=')[1];
const filterTag = process.argv.find((arg) => arg.startsWith('--tag='))?.split('=')[1];
const searchTerm = process.argv.find((arg) => arg.startsWith('--search='))?.split('=')[1];
const outputFormat =
  process.argv.find((arg) => arg.startsWith('--format='))?.split('=')[1] || 'text';
const analytics = process.argv.includes('--analytics');
const interactive = process.argv.includes('--interactive');

// Interactive mode check
if (interactive) {
  console.log('🎛️  Interactive Route Explorer');
  console.log('=====================================');
  console.log('Use this mode to explore routes interactively.');
  console.log('Note: Interactive mode requires additional readline setup.');
  console.log('For now, use command-line filters like:');
  console.log('  --category=dashboard --status=active --search=legal');
  console.log('');
  process.exit(0);
}

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Route Map Export Script

USAGE:
  node scripts/export-routes-map.mjs [OPTIONS]

OPTIONS:
  --extended           Include extended metadata in JSON output
  --scaffold-missing   Create stub +page.svelte files for config routes without pages
  --category=TYPE      Filter by category (dashboard, admin, api, etc.)
  --status=STATE       Filter by status (active, deprecated, experimental)
  --tag=TAG            Filter by tag (secure, public, internal, etc.)
  --search=TERM        Search routes by label, path, or ID
  --format=FORMAT      Output format: 'text' (default) or 'json'
  --analytics          Generate route analytics and usage patterns
  --interactive        Start interactive filtering mode
  --help, -h          Show this help message

OUTPUTS:
  ROUTE_MAP_EXPORT.txt    Human-readable route inventory
  ROUTE_MAP_EXPORT.json   Machine-readable route data

EXAMPLES:
  node scripts/export-routes-map.mjs                           # Basic export
  node scripts/export-routes-map.mjs --extended                # With metadata
  node scripts/export-routes-map.mjs --scaffold-missing        # Create stubs + export
  node scripts/export-routes-map.mjs --category=dashboard      # Only dashboard routes
  node scripts/export-routes-map.mjs --status=active          # Only active routes
  node scripts/export-routes-map.mjs --search=legal           # Search for "legal"
  node scripts/export-routes-map.mjs --analytics              # Route analytics
  node scripts/export-routes-map.mjs --format=json           # JSON output only
  node scripts/export-routes-map.mjs --interactive            # Interactive mode
`);
  process.exit(0);
}

function safeRead(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
const routesConfigContent = safeRead(routesConfigPath);
const multiProtoContent = safeRead(multiProtoConfigPath);

const configRouteRegex =
  /{\s*id:\s*'([^']+)'[\s\S]*?label:\s*'([^']+)'[\s\S]*?route:\s*'([^']+)'[\s\S]*?category:\s*'([^']+)'[\s\S]*?status:\s*'([^']+)'[\s\S]*?tags:\s*\[([^\]]*)\]/g;
let configMatch;
const configRoutes = [];
while ((configMatch = configRouteRegex.exec(routesConfigContent))) {
  const [, id, label, route, category, status, rawTags] = configMatch;
  const tags = rawTags
    .split(',')
    .map((t) => t.trim().replace(/['"`]/g, ''))
    .filter(Boolean);
  configRoutes.push({ id, label, route, category, status, tags });
}

function collectPageFiles(startDir) {
  const files = [];
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.') || ent.name === '__tests__')
          continue;
        stack.push(full);
        continue;
      }
      if (/\+page\.(svelte|ts)$/.test(ent.name)) files.push(full);
    }
  }
  return files;
}

function normalizeRouteFromFile(file) {
  let rel = path.relative(routesDir, file).replace(/\\/g, '/');

  // Handle the root +page.svelte case first
  if (rel === '+page.svelte' || rel === '+page.ts') return '/';

  // Remove the +page.svelte or +page.ts suffix
  rel = rel.replace(/\/\+page\.(svelte|ts)$/, '');

  // If we're left with empty string, it means we're at root
  if (rel === '' || rel === '+page') return '/';

  // Add leading slash if needed
  if (!rel.startsWith('/')) rel = '/' + rel;

  // Handle SvelteKit route conventions
  rel = rel.replace(/\[\[(.*?)\]\]/g, (_m, inner) => `:${inner}?`); // optional parameters
  rel = rel.replace(/\[(\.\.\.)?([^\]]+)\]/g, (_m, _dots, name) => `:${name}`); // dynamic parameters

  return rel.replace(/\/+/g, '/');
}

function extractTitle(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    let m = text.match(/export const metadata[^;]*title:\s*['"`]([^'"`]+)['"`]/);
    if (m) return m[1].trim();
    m = text.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (m) return m[1].trim();
  } catch {}
  return null;
}

async function scaffoldMissingPage(routePath, configRoutes) {
  // Find config entry for this route
  const config = configRoutes.find((r) => r.route === routePath);
  if (!config) return null;

  // Convert route path to file path
  let filePath = routePath === '/' ? '' : routePath;
  if (filePath.startsWith('/')) filePath = filePath.slice(1);

  // Handle dynamic segments - convert :param to [param]
  filePath = filePath.replace(/:([^/]+)/g, '[$1]');

  const pageDir = path.join(routesDir, filePath);
  const pageFile = path.join(pageDir, '+page.svelte');

  // Skip if file already exists
  if (fs.existsSync(pageFile)) return null;

  // Ensure directory exists
  fs.mkdirSync(pageDir, { recursive: true });

  // Generate page content
  const pageContent = generatePageTemplate(config);

  // Write the file
  fs.writeFileSync(pageFile, pageContent, 'utf8');

  return path.relative(frontendDir, pageFile).replace(/\\/g, '/');
}

function generatePageTemplate(config) {
  const title = config.label || 'Page';
  const description = `${config.category} page - ${config.label}`;

  return `<script lang="ts">
  // Generated stub for ${config.id} (${config.route})
  // Using Svelte 5 runes ($state, $effect, $derived)
  import { page } from '$app/stores';
  import { slide } from 'svelte/transition';
  import Button from '$lib/components/ui/Button.svelte';

  let mounted = $state(false);
  let showDebug = $state(false);

  // Reactive page info using $derived
  let pageInfo = $derived({
    route: $page.route?.id || 'unknown',
    params: $page.params || {},
    url: $page.url?.pathname || 'unknown',
    search: $page.url?.search || ''
  });

  $effect(() => {
    mounted = true;
    console.log('Page mounted:', '${config.route}');

    return () => {
      console.log('Page unmounted:', '${config.route}');
    };
  });

  function toggleDebug() {
    showDebug = !showDebug;
  }
</script>

<svelte:head>
  <title>${title} - Legal AI Platform</title>
  <meta name="description" content="${description}" />
</svelte:head>

<div class="page-container">
  <header class="page-header">
    <h1>${title}</h1>
    <p>{description}</p>
    <div class="route-meta">
      <span class="category-badge {config.category.toLowerCase()}">{config.category}</span>
      <span class="status-badge {config.status.toLowerCase()}">{config.status}</span>
    </div>
  </header>

  <main class="page-content">
    <div class="stub-notice">
      <h2>🚧 Page Under Construction</h2>
      <p>This is a generated stub for route: <code>${config.route}</code></p>
      <p>Category: <strong>${config.category}</strong> | Status: <strong>${config.status}</strong></p>
      ${config.tags.length ? `<p>Tags: ${config.tags.map((t) => `<span class="tag">${t}</span>`).join(' ')}</p>` : ''}

      <div class="actions">
        <Button variant="outline" onclick={toggleDebug}>
          {showDebug ? 'Hide' : 'Show'} Debug Info
        </Button>
      </div>

      {#if showDebug && mounted}
        <div class="debug-info" transition:slide={{ duration: 300 }}>
          <h3>Debug Information</h3>
          <div class="debug-grid">
            <div class="debug-item">
              <strong>Route ID:</strong>
              <code>{pageInfo.route}</code>
            </div>
            <div class="debug-item">
              <strong>URL Path:</strong>
              <code>{pageInfo.url}</code>
            </div>
            <div class="debug-item">
              <strong>Parameters:</strong>
              <pre>{JSON.stringify(pageInfo.params, null, 2)}</pre>
            </div>
            <div class="debug-item">
              <strong>Search:</strong>
              <code>{pageInfo.search || '(none)'}</code>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </main>
</div>

<style>
  .page-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .page-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: 2.5rem;
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .page-header p {
    font-size: 1.125rem;
    color: #6b7280;
    margin-bottom: 1rem;
  }

  .route-meta {
    display: flex;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .category-badge,
  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .category-badge.dashboard { background: #dbeafe; color: #1d4ed8; }
  .category-badge.legal { background: #dcfce7; color: #166534; }
  .category-badge.ai { background: #f3e8ff; color: #7c3aed; }
  .category-badge.demo { background: #fef3c7; color: #92400e; }
  .category-badge.system { background: #f1f5f9; color: #475569; }

  .status-badge.active { background: #dcfce7; color: #166534; }
  .status-badge.development { background: #fef3c7; color: #92400e; }
  .status-badge.planned { background: #f1f5f9; color: #475569; }
  .status-badge.deprecated { background: #fee2e2; color: #dc2626; }

  .page-content {
    display: flex;
    justify-content: center;
  }

  .stub-notice {
    background: #f8fafc;
    border: 2px dashed #cbd5e1;
    border-radius: 16px;
    padding: 2.5rem;
    text-align: center;
    max-width: 700px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .stub-notice h2 {
    color: #374151;
    margin-bottom: 1rem;
    font-size: 1.75rem;
  }

  .stub-notice code {
    background: #e2e8f0;
    color: #475569;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
    font-size: 0.9em;
  }

  .tag {
    display: inline-block;
    background: #e0f2fe;
    color: #0369a1;
    padding: 0.25rem 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin: 0 0.25rem;
    border: 1px solid #bae6fd;
  }

  .actions {
    margin: 1.5rem 0;
  }

  .debug-info {
    margin-top: 2rem;
    text-align: left;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.05);
  }

  .debug-info h3 {
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
    color: #374151;
    text-align: center;
  }

  .debug-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
  }

  .debug-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .debug-item strong {
    color: #475569;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .debug-info code {
    background: #1e293b;
    color: #f1f5f9;
    padding: 0.5rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .debug-info pre {
    background: #1e293b;
    color: #f1f5f9;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    overflow-x: auto;
    margin: 0;
    white-space: pre-wrap;
  }

  @media (max-width: 768px) {
    .page-container {
      padding: 1rem;
    }

    .stub-notice {
      padding: 1.5rem;
    }

    .page-header h1 {
      font-size: 2rem;
    }

    .route-meta {
      flex-direction: column;
      align-items: center;
    }
  }
</style>
`;
}

// Route filtering functions
function applyFilters(routes) {
  let filtered = [...routes];

  if (filterCategory) {
    filtered = filtered.filter(
      (r) => r.category && r.category.toLowerCase().includes(filterCategory.toLowerCase())
    );
  }

  if (filterStatus) {
    filtered = filtered.filter(
      (r) => r.status && r.status.toLowerCase().includes(filterStatus.toLowerCase())
    );
  }

  if (filterTag) {
    filtered = filtered.filter(
      (r) => r.tags && r.tags.some((tag) => tag.toLowerCase().includes(filterTag.toLowerCase()))
    );
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        (r.label && r.label.toLowerCase().includes(term)) ||
        (r.route && r.route.toLowerCase().includes(term)) ||
        (r.id && r.id.toLowerCase().includes(term))
    );
  }

  return filtered;
}

function generateAnalytics(configRoutes, fileRoutes) {
  const analytics = {
    routeDistribution: {},
    statusBreakdown: {},
    categoryBreakdown: {},
    tagUsage: {},
    complexityMetrics: {
      dynamicRoutes: 0,
      apiRoutes: 0,
      staticPages: 0,
      deepestNesting: 0,
    },
    recommendations: [],
  };

  // Analyze config routes
  configRoutes.forEach((route) => {
    // Status breakdown
    analytics.statusBreakdown[route.status] = (analytics.statusBreakdown[route.status] || 0) + 1;

    // Category breakdown
    analytics.categoryBreakdown[route.category] =
      (analytics.categoryBreakdown[route.category] || 0) + 1;

    // Tag usage
    route.tags.forEach((tag) => {
      analytics.tagUsage[tag] = (analytics.tagUsage[tag] || 0) + 1;
    });

    // Route complexity
    if (route.route.includes(':')) analytics.complexityMetrics.dynamicRoutes++;
    if (route.route.startsWith('/api')) analytics.complexityMetrics.apiRoutes++;
    if (!route.route.includes(':') && !route.route.startsWith('/api'))
      analytics.complexityMetrics.staticPages++;

    const depth = route.route.split('/').length - 1;
    analytics.complexityMetrics.deepestNesting = Math.max(
      analytics.complexityMetrics.deepestNesting,
      depth
    );
  });

  // Generate recommendations
  const deprecated = configRoutes.filter((r) => r.status === 'deprecated').length;
  if (deprecated > 0) {
    analytics.recommendations.push(
      `Consider removing or updating ${deprecated} deprecated route(s)`
    );
  }

  const experimental = configRoutes.filter((r) => r.status === 'experimental').length;
  if (experimental > 5) {
    analytics.recommendations.push(
      `High number of experimental routes (${experimental}) - consider stabilizing or removing`
    );
  }

  if (analytics.complexityMetrics.deepestNesting > 4) {
    analytics.recommendations.push(
      `Deep route nesting detected (${analytics.complexityMetrics.deepestNesting} levels) - consider flattening structure`
    );
  }

  return analytics;
}

const pageFiles = collectPageFiles(routesDir);
const pageRouteRecords = pageFiles.map((f) => ({
  file: path.relative(frontendDir, f).replace(/\\/g, '/'),
  route: normalizeRouteFromFile(f),
  title: extractTitle(f),
}));
const dedup = new Map();
for (const rec of pageRouteRecords) if (!dedup.has(rec.route)) dedup.set(rec.route, rec);
const fileRoutes = [...dedup.values()].sort((a, b) => a.route.localeCompare(b.route));

const apiEndpointRegex = /endpoint:\s*'([^']+)'/g;
let apiMatch;
const apiEndpoints = new Set();
while ((apiMatch = apiEndpointRegex.exec(multiProtoContent))) apiEndpoints.add(apiMatch[1]);
['/api/health', '/api/services', '/api/routes'].forEach((e) => apiEndpoints.add(e));

const configRouteSet = new Set(configRoutes.map((r) => r.route));
const fileRouteSet = new Set(fileRoutes.map((r) => r.route));
const configNotInFiles = [...configRouteSet].filter((r) => !fileRouteSet.has(r));
const filesNotInConfig = [...fileRouteSet].filter((r) => !configRouteSet.has(r));

// Scaffold missing pages if requested
if (scaffoldMissing) {
  if (configNotInFiles.length > 0) {
    console.log(`🔧 Scaffolding ${configNotInFiles.length} missing page(s)...`);
    for (const routePath of configNotInFiles) {
      try {
        const scaffolded = await scaffoldMissingPage(routePath, configRoutes);
        if (scaffolded) {
          console.log(`✅ Created: ${scaffolded}`);
        }
      } catch (error) {
        console.error(`❌ Failed to scaffold ${routePath}:`, error.message);
      }
    }
  } else {
    console.log('✅ All config routes have corresponding page files - no scaffolding needed');
  }
}

// Apply filters if specified
let filteredConfigRoutes = configRoutes;
let filteredFileRoutes = fileRoutes;

if (filterCategory || filterStatus || filterTag || searchTerm) {
  filteredConfigRoutes = applyFilters(configRoutes);
  // Note: File routes don't have category/status/tags, so we only apply search filter
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredFileRoutes = fileRoutes.filter(
      (r) =>
        (r.route && r.route.toLowerCase().includes(term)) ||
        (r.title && r.title.toLowerCase().includes(term)) ||
        (r.file && r.file.toLowerCase().includes(term))
    );
  }

  // Only show filter results in text mode, not JSON
  if (outputFormat !== 'json') {
    console.log(`\n🔍 Filters applied:`);
    if (filterCategory) console.log(`  Category: ${filterCategory}`);
    if (filterStatus) console.log(`  Status: ${filterStatus}`);
    if (filterTag) console.log(`  Tag: ${filterTag}`);
    if (searchTerm) console.log(`  Search: ${searchTerm}`);
    console.log(
      `  Results: ${filteredConfigRoutes.length} config routes, ${filteredFileRoutes.length} file routes\n`
    );
  }
}

// Generate analytics if requested
let analyticsData = null;
if (analytics) {
  analyticsData = generateAnalytics(configRoutes, fileRoutes);

  // Only show analytics summary in text mode
  if (outputFormat !== 'json') {
    console.log(`\n📊 Route Analytics:`);
    console.log(`  Categories: ${Object.keys(analyticsData.categoryBreakdown).length}`);
    console.log(`  Status types: ${Object.keys(analyticsData.statusBreakdown).length}`);
    console.log(`  Unique tags: ${Object.keys(analyticsData.tagUsage).length}`);
    console.log(`  Dynamic routes: ${analyticsData.complexityMetrics.dynamicRoutes}`);
    console.log(`  API routes: ${analyticsData.complexityMetrics.apiRoutes}`);
    console.log(`  Recommendations: ${analyticsData.recommendations.length}`);

    if (analyticsData.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      analyticsData.recommendations.forEach((rec) => console.log(`  • ${rec}`));
    }
    console.log();
  }
}

// Use filtered routes for display (but keep original logic for missing files detection)
const displayConfigRoutes = filteredConfigRoutes;
const displayFileRoutes = filteredFileRoutes;

// Aliases for clearer JSON naming
const configMissingFiles = configNotInFiles;
const filesMissingConfig = filesNotInConfig;

let out = '';
out += 'ROUTE MAP EXPORT\n';
out += 'Generated: ' + new Date().toISOString() + '\n';
out += '========================================\n\n';

// Add filter info to output header
if (filterCategory || filterStatus || filterTag || searchTerm) {
  out += 'FILTERS APPLIED:\n';
  if (filterCategory) out += `  Category: ${filterCategory}\n`;
  if (filterStatus) out += `  Status: ${filterStatus}\n`;
  if (filterTag) out += `  Tag: ${filterTag}\n`;
  if (searchTerm) out += `  Search: ${searchTerm}\n`;
  out += '\n';
}

out +=
  'SECTION 1: CONFIG ROUTES (showing ' +
  displayConfigRoutes.length +
  ' of ' +
  configRoutes.length +
  ')\n';
for (const r of displayConfigRoutes.sort((a, b) => a.route.localeCompare(b.route))) {
  out +=
    `- ${r.route}  [id=${r.id}]  label="${r.label}"  category=${r.category}  status=${r.status}  tags=${r.tags.join('|')}` +
    '\n';
}
out += '\n';

out +=
  'SECTION 2: FILE-BASED PAGE ROUTES (showing ' +
  displayFileRoutes.length +
  ' of ' +
  fileRoutes.length +
  ')\n';
if (!displayFileRoutes.length) {
  out += '(none match filters – try different criteria)\n';
} else {
  for (const fr of displayFileRoutes) {
    const dynamic = fr.route.includes(':');
    out +=
      `- ${fr.route}${dynamic ? '  (dynamic)' : ''}` + (fr.title ? `  "${fr.title}"` : '') + '\n';
  }
}
out += '\n';

out += 'SECTION 3: API ENDPOINTS (' + apiEndpoints.size + ')\n';
for (const ep of [...apiEndpoints].sort()) out += `- ${ep}` + '\n';
out += '\n';

out += 'SECTION 4: DIFFERENCES\n';
out += 'Config routes missing a file-based page (' + configMissingFiles.length + '):\n';
configMissingFiles.forEach((r) => {
  out += `  - ${r}\n`;
});
out += 'File-based routes not in config (' + filesMissingConfig.length + '):\n';
filesMissingConfig.forEach((r) => {
  out += `  - ${r}\n`;
});
out += '\n';

// Add analytics section if generated
if (analyticsData) {
  out += 'SECTION 5: ANALYTICS\n';

  out += 'Status Breakdown:\n';
  Object.entries(analyticsData.statusBreakdown).forEach(([status, count]) => {
    out += `  ${status}: ${count}\n`;
  });

  out += 'Category Breakdown:\n';
  Object.entries(analyticsData.categoryBreakdown).forEach(([category, count]) => {
    out += `  ${category}: ${count}\n`;
  });

  out += 'Complexity Metrics:\n';
  out += `  Dynamic routes: ${analyticsData.complexityMetrics.dynamicRoutes}\n`;
  out += `  API routes: ${analyticsData.complexityMetrics.apiRoutes}\n`;
  out += `  Static pages: ${analyticsData.complexityMetrics.staticPages}\n`;
  out += `  Deepest nesting: ${analyticsData.complexityMetrics.deepestNesting} levels\n`;

  if (analyticsData.recommendations.length > 0) {
    out += 'Recommendations:\n';
    analyticsData.recommendations.forEach((rec) => {
      out += `  • ${rec}\n`;
    });
  }
  out += '\n';
}

out += 'NOTES:\n';
out += '- Dynamic routes show parameters as :param (?: indicates optional)\n';
out += '- Mismatches can indicate missing config entries or deprecated pages.\n';
out += '- Titles extracted heuristically from metadata or first <h1>.\n';

const jsonData = {
  generated: new Date().toISOString(),
  filters: {
    applied: !!(filterCategory || filterStatus || filterTag || searchTerm),
    category: filterCategory || null,
    status: filterStatus || null,
    tag: filterTag || null,
    search: searchTerm || null,
  },
  counts: {
    total: {
      config: configRoutes.length,
      fileBased: fileRoutes.length,
      api: apiEndpoints.size,
    },
    displayed: {
      config: displayConfigRoutes.length,
      fileBased: displayFileRoutes.length,
    },
    issues: {
      configMissingFiles: configMissingFiles.length,
      filesMissingConfig: filesMissingConfig.length,
    },
  },
  data: {
    configRoutes: displayConfigRoutes,
    fileRoutes: displayFileRoutes,
    apiEndpoints: [...apiEndpoints].sort(),
    configMissingFiles,
    filesMissingConfig,
  },
  analytics: analyticsData,
  extended: extended || undefined,
};

// Output based on format
if (outputFormat === 'json') {
  // For JSON format, output to stdout for API consumption
  console.log(JSON.stringify(jsonData, null, 2));
} else {
  // Default text format - write both files and show success messages
  fs.writeFileSync(outputPath, out, 'utf8');
  fs.writeFileSync(jsonOutputPath, JSON.stringify(jsonData, null, 2), 'utf8');
  console.log('✅ ROUTE MAP exported to', outputPath);
  console.log('✅ ROUTE MAP JSON exported to', jsonOutputPath);
}

if (scaffoldMissing) {
  if (configNotInFiles.length === 0) {
    console.log('ℹ️ No missing pages to scaffold');
  } else {
    console.log(`🔧 Scaffold mode: Created ${configNotInFiles.length} stub page(s)`);
    console.log('💡 Tip: Re-run without --scaffold-missing to see updated inventory');
  }
}
