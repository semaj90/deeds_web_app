#!/usr/bin/env node
/**
 * Add Missing Routes Configuration Script
 * Automatically adds the 189 missing routes to routes-config.ts
 */
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const routesConfigPath = path.join(cwd, 'src', 'lib', 'data', 'routes-config.ts');
const routeMapJsonPath = path.join(path.dirname(cwd), 'ROUTE_MAP_EXPORT.json');

console.log('🔧 Adding Missing Routes to Configuration...');

// Read the route map JSON
let routeMap;
try {
  const routeMapContent = fs.readFileSync(routeMapJsonPath, 'utf8');
  routeMap = JSON.parse(routeMapContent);
} catch (error) {
  console.error('❌ Failed to read route map JSON:', error.message);
  process.exit(1);
}

const missingRoutes = routeMap.filesMissingConfig || [];
console.log(`📊 Found ${missingRoutes.length} missing routes to add`);

// Generate route configuration entries
const routeEntries = missingRoutes.map((route) => {
  // Parse route to determine properties
  const routeParts = route.split('/').filter(Boolean);
  const lastPart = routeParts[routeParts.length - 1] || 'home';

  // Determine category based on route structure
  let category = 'utilities';
  let status = 'active';
  let tags = ['auto-generated'];

  if (route.includes('/admin/')) {
    category = 'admin';
    tags.push('admin', 'management');
  } else if (route.includes('/ai/') || route.includes('/ai-')) {
    category = 'ai';
    tags.push('ai', 'intelligence');
  } else if (route.includes('/demo/') || route.includes('-demo')) {
    category = 'demo';
    status = 'active';
    tags.push('demo', 'showcase');
  } else if (route.includes('/auth/')) {
    category = 'auth';
    tags.push('authentication', 'security');
  } else if (route.includes('/test') || route.includes('/debug')) {
    category = 'dev';
    status = 'development';
    tags.push('testing', 'development');
  } else if (route.includes('/cases') || route.includes('/legal')) {
    category = 'legal';
    tags.push('legal', 'cases');
  } else if (route.includes('/cache') || route.includes('/redis')) {
    category = 'system';
    tags.push('cache', 'performance');
  } else if (route.includes('/queue') || route.includes('/rabbit')) {
    category = 'system';
    tags.push('queue', 'messaging');
  } else if (route.includes('/gpu') || route.includes('/webgpu')) {
    category = 'system';
    tags.push('gpu', 'performance');
  }

  // Generate clean ID
  const id =
    route
      .replace(/^\//, '')
      .replace(/[/:]/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase() || 'root-page';

  // Generate human-readable label
  const label =
    lastPart
      .replace(/-/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') || 'Page';

  // Add specific icons based on category/route
  let icon = '📄';
  if (category === 'ai') icon = '🤖';
  else if (category === 'demo') icon = '🎮';
  else if (category === 'admin') icon = '⚙️';
  else if (category === 'auth') icon = '🔐';
  else if (category === 'legal') icon = '⚖️';
  else if (category === 'system') icon = '🔧';
  else if (category === 'dev') icon = '🔬';

  return {
    id,
    label,
    route,
    icon,
    category,
    status,
    tags: tags.slice(0, 4), // Limit to 4 tags
  };
});

// Generate the TypeScript configuration code
const configCode = routeEntries
  .map(
    (entry) => `  {
    id: '${entry.id}',
    label: '${entry.label}',
    route: '${entry.route}',
    icon: '${entry.icon}',
    description: '${entry.category} ${entry.label.toLowerCase()} functionality',
    category: '${entry.category}',
    status: '${entry.status}',
    tags: [${entry.tags.map((tag) => `'${tag}'`).join(', ')}]
  }`
  )
  .join(',\n');

// Read current routes config
let routesConfigContent;
try {
  routesConfigContent = fs.readFileSync(routesConfigPath, 'utf8');
} catch (error) {
  console.error('❌ Failed to read routes config:', error.message);
  process.exit(1);
}

// Find the insertion point (before the closing bracket of the array)
const insertionPoint = routesConfigContent.lastIndexOf('];');
if (insertionPoint === -1) {
  console.error('❌ Could not find insertion point in routes config');
  process.exit(1);
}

// Insert the new routes
const beforeInsertion = routesConfigContent.substring(0, insertionPoint);
const afterInsertion = routesConfigContent.substring(insertionPoint);

// Ensure proper comma separation
const needsComma = beforeInsertion.trim().endsWith('}');
const newContent =
  beforeInsertion +
  (needsComma ? ',\n' : '') +
  '  // Auto-generated missing routes\n' +
  configCode +
  '\n' +
  afterInsertion;

// Write the updated config
try {
  fs.writeFileSync(routesConfigPath, newContent, 'utf8');
  console.log(`✅ Successfully added ${missingRoutes.length} routes to configuration`);
  console.log('📝 Routes added with auto-generated categories and tags');
  console.log('💡 Review and adjust categories/tags as needed in routes-config.ts');
} catch (error) {
  console.error('❌ Failed to write routes config:', error.message);
  process.exit(1);
}

// Generate summary report
const categoryStats = {};
routeEntries.forEach((entry) => {
  categoryStats[entry.category] = (categoryStats[entry.category] || 0) + 1;
});

console.log('\n📊 Category Breakdown:');
Object.entries(categoryStats)
  .sort(([, a], [, b]) => b - a)
  .forEach(([category, count]) => {
    console.log(`  ${category}: ${count} routes`);
  });

console.log(`\n🎉 Total routes now configured: ${routeMap.counts.config + missingRoutes.length}`);
console.log('🔄 Re-run route export to verify: node scripts/export-routes-map.mjs');
