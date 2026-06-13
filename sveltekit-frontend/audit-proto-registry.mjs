#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const PROTO_DIRS = [
  'sveltekit-frontend/proto/active',
  'sveltekit-frontend/proto',
  'proto/active',
  'proto'
].map(d => path.join(ROOT, d)).filter(d => fs.existsSync(d));

const args = process.argv.slice(2);
const SAVE = args.includes('--save') || args.includes('--apply');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

function parseProtoFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const services = [];
  const pkgMatch = content.match(/^\s*package\s+([a-z0-9_.]+)\s*;/m);
  const pkg = pkgMatch?.[1];
  const serviceRegex = /service\s+(\w+)\s*\{([^}]+)\}/g;
  let serviceMatch;
  while ((serviceMatch = serviceRegex.exec(content)) !== null) {
    const serviceName = serviceMatch[1];
    const serviceBody = serviceMatch[2];
    const rpcRegex = /rpc\s+(\w+)\s*\(/g;
    const methods = [];
    let rpcMatch;
    while ((rpcMatch = rpcRegex.exec(serviceBody)) !== null) {
      methods.push(rpcMatch[1]);
    }
    if (methods.length > 0) {
      services.push({ name: serviceName, methods, file: path.relative(ROOT, filePath), package: pkg });
    }
  }
  return services;
}

async function auditProtoRegistry() {
  const allServices = [];
  const activeFiles = [];
  const archivedFiles = [];
  if (VERBOSE) console.error(`\n═══ Proto Registry Audit ═══\n`);
  for (const dir of PROTO_DIRS) {
    if (VERBOSE) console.error(`Scanning ${path.relative(ROOT, dir)}...`);
    try {
      const protoFiles = await glob('**/*.proto', { cwd: dir });
      for (const file of protoFiles) {
        const fullPath = path.join(dir, file);
        const isActive = dir.includes('active');
        if (isActive) activeFiles.push(path.relative(ROOT, fullPath));
        else archivedFiles.push(path.relative(ROOT, fullPath));
        const services = parseProtoFile(fullPath);
        allServices.push(...services);
      }
    } catch (err) {
      if (VERBOSE) console.error(`  Warning: ${err.message}`);
    }
  }
  allServices.sort((a, b) => a.name.localeCompare(b.name));
  const registry = {
    timestamp: new Date().toISOString(),
    total_files: activeFiles.length + archivedFiles.length,
    total_services: [...new Set(allServices.map(s => s.name))].length,
    total_methods: allServices.reduce((sum, s) => sum + s.methods.length, 0),
    services: allServices,
    stats: {
      active_proto_count: activeFiles.length,
      archived_proto_count: archivedFiles.length,
      active_files: activeFiles.sort(),
      archived_files: archivedFiles.sort()
    }
  };
  console.log(`# Proto Registry — Active Services and RPC Methods`);
  console.log(`# Generated: ${registry.timestamp}`);
  console.log(`# Total: ${registry.total_services} unique services, ${registry.total_methods} methods across ${registry.total_files} proto files\n`);
  for (const service of allServices) {
    const entry = {
      service_name: service.name,
      file: service.file,
      package: service.package,
      methods: service.methods,
      method_count: service.methods.length
    };
    console.log(JSON.stringify(entry));
  }
  if (SAVE) {
    const reportPath = path.join(ROOT, 'docs', 'reports', 'proto-registry-audit.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(registry, null, 2));
    if (VERBOSE) console.error(`\n✅ Report saved to ${path.relative(ROOT, reportPath)}`);
  }
  if (VERBOSE) {
    console.error(`\n══ Summary ════════════════════════════`);
    console.error(`Active proto files: ${registry.stats.active_proto_count}`);
    console.error(`Archived proto files: ${registry.stats.archived_proto_count}`);
    console.error(`Unique services: ${registry.total_services}`);
    console.error(`Total RPC methods: ${registry.total_methods}`);
    console.error(`\n✅ Audit complete\n`);
  }
  return registry;
}

auditProtoRegistry().catch(err => {
  console.error(`❌ Audit failed: ${err.message}`);
  process.exit(1);
});
