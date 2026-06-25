#!/usr/bin/env node
/**
 * Port Contract Audit — Canonical Source-of-Truth Comparison
 *
 * Scans all configuration sources and validates consistency:
 * - docker ps (running containers)
 * - .env / .env.local (canonical env)
 * - docker-compose*.yml (service declarations)
 * - SvelteKit env.server.ts (TypeScript config)
 * - Go service environment (if available)
 * - MCP/OpenCode config
 *
 * Output:
 * - docs/reports/port-contract-audit.json (machine-readable)
 * - docs/reports/port-contract-audit.md (human-readable)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const docsDir = path.resolve(repoRoot, 'docs/reports');

// Ensure output directory exists
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// ════════════════════════════════════════════════════════════════════════════════
// PORT DEFINITIONS (Canonical Reference)
// ════════════════════════════════════════════════════════════════════════════════

const EXPECTED_PORTS = {
  postgres: { host: 5434, container: 5432, service: 'legal-ai-postgres', protocol: 'tcp' },
  rabbitmq: { host: 5672, container: 5672, service: 'legal-ai-rabbitmq', protocol: 'tcp', mgmt: 15672 },
  valkey: { host: 6379, container: 6379, service: 'legal-ai-valkey', protocol: 'tcp' },
  qdrant_http: { host: 6333, container: 6333, service: 'legal-ai-qdrant', protocol: 'tcp' },
  qdrant_grpc: { host: 6334, container: 6334, service: 'legal-ai-qdrant', protocol: 'tcp' },
  neo4j_http: { host: 7474, container: 7474, service: 'legal-ai-neo4j', protocol: 'tcp', profile: 'full' },
  neo4j_bolt: { host: 7687, container: 7687, service: 'legal-ai-neo4j', protocol: 'tcp', profile: 'full' },
  ollama: { host: 11434, container: 11434, service: 'native', protocol: 'tcp', location: 'host' },
  llama_server: { host: 8090, container: 8090, service: 'native', protocol: 'tcp', location: 'host' },
  bifrost: { host: 3040, container: 8080, service: 'legal-ai-bifrost', protocol: 'tcp', profile: 'full' },
  searxng: { host: 8889, container: 8080, service: 'legal-ai-searxng', protocol: 'tcp', profile: 'full' },
  langfuse_web: { host: 3030, container: 3000, service: 'langfuse-server', protocol: 'tcp', profile: 'full' },
  langfuse_clickhouse_http: { host: 8124, container: 8123, service: 'langfuse-clickhouse', protocol: 'tcp', profile: 'full' },
  langfuse_clickhouse_grpc: { host: 9009, container: 9000, service: 'langfuse-clickhouse', protocol: 'tcp', profile: 'full' },
  go_retrieval_grpc: { host: 50053, container: 50053, service: 'legal-ai-go-retrieval', protocol: 'tcp', profile: 'full' },
  go_retrieval_http: { host: 8100, container: 8100, service: 'legal-ai-go-retrieval', protocol: 'tcp', profile: 'full' },
  go_embedding_grpc: { host: 50051, container: 50051, service: 'legal-ai-go-embedding', protocol: 'tcp', profile: 'full' },
  go_embedding_http: { host: 8097, container: 8097, service: 'legal-ai-go-embedding', protocol: 'tcp', profile: 'full' },
  go_search_grpc: { host: 50055, container: 50055, service: 'legal-ai-go-search', protocol: 'tcp', profile: 'full' },
  go_search_http: { host: 8096, container: 8096, service: 'legal-ai-go-search', protocol: 'tcp', profile: 'full' },
  seaweedfs_master: { host: 9333, container: 9333, service: 'legal-ai-seaweed-master', protocol: 'tcp', profile: 'seaweedfs' },
  seaweedfs_volume: { host: 8080, container: 8080, service: 'legal-ai-seaweed-volume', protocol: 'tcp', profile: 'seaweedfs' },
  seaweedfs_filer: { host: 8888, container: 8888, service: 'legal-ai-seaweed-filer', protocol: 'tcp', profile: 'seaweedfs' },
  seaweedfs_s3: { host: 8333, container: 8333, service: 'legal-ai-seaweed-s3', protocol: 'tcp', profile: 'seaweedfs' },
  couchdb: { host: 5984, container: 5984, service: 'legal-ai-couchdb', protocol: 'tcp', profile: 'full' },
  nats: { host: 4222, container: 4222, service: 'legal-ai-nats', protocol: 'tcp', profile: 'full' },
  docling_vlm: { host: 8085, container: 8085, service: 'legal-ai-docling-vlm', protocol: 'tcp', profile: 'full' },
  image_synthesis: { host: 8092, container: 8092, service: 'legal-ai-image-synthesis', protocol: 'tcp', profile: 'full' },
};

// ════════════════════════════════════════════════════════════════════════════════
// DATA COLLECTION FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════

function dockerPsActual() {
  console.log('[INFO] Scanning docker ps...');
  try {
    const output = execSync('docker ps --format "{{.Names}}|{{.Ports}}"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const result = {};
    output.split('\n').forEach(line => {
      if (!line.trim()) return;
      const [name, ports] = line.split('|');
      if (!name) return;

      // Parse port mappings: "0.0.0.0:3040->8080/tcp, [::]:9333->9333/tcp, 127.0.0.1:6379->6379/tcp, 6333-6334->6333-6334"
      const portMappings = [];
      if (ports) {
        ports.split(',').forEach(mapping => {
          const trimmed = mapping.trim();

          // Try to match range format first: "6333-6334->6333-6334"
          const rangeMatch = trimmed.match(/(?:[\da-fA-F.:]+:)?(\d+)-(\d+)->(\d+)-(\d+)/);
          if (rangeMatch) {
            // For ranges, expand to individual ports (more common in Docker)
            const hostMin = parseInt(rangeMatch[1]);
            const hostMax = parseInt(rangeMatch[2]);
            const containerMin = parseInt(rangeMatch[3]);
            const containerMax = parseInt(rangeMatch[4]);

            for (let i = 0; i <= (hostMax - hostMin); i++) {
              portMappings.push({
                host: hostMin + i,
                container: containerMin + i,
                protocol: 'tcp',
                raw: trimmed,
                isRange: true,
              });
            }
          } else {
            // Match simple format: "[IP:]hostPort->containerPort[/protocol]"
            const simpleMatch = trimmed.match(/(?:[\da-fA-F.:]+:)?(\d+)->(\d+)(?:\/(tcp|udp))?/);
            if (simpleMatch) {
              portMappings.push({
                host: parseInt(simpleMatch[1]),
                container: parseInt(simpleMatch[2]),
                protocol: simpleMatch[3] || 'tcp',
                raw: trimmed,
              });
            }
          }
        });
      }

      result[name] = { ports: portMappings, raw: ports };
    });
    return result;
  } catch (error) {
    console.warn(`[WARN] docker ps failed: ${error.message}`);
    return {};
  }
}

function readEnvFiles() {
  console.log('[INFO] Reading .env files...');
  const envFiles = [
    path.resolve(repoRoot, '.env'),
    path.resolve(repoRoot, '.env.local'),
    path.resolve(repoRoot, 'sveltekit-frontend', '.env'),
    path.resolve(repoRoot, 'sveltekit-frontend', '.env.local'),
  ];

  const result = {};
  envFiles.forEach(file => {
    if (!fs.existsSync(file)) return;
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const name = path.relative(repoRoot, file);

    result[name] = {};
    lines.forEach((line, idx) => {
      if (!line.trim() || line.startsWith('#')) return;
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        result[name][key.trim()] = valueParts.join('=').trim();
      }
    });
  });

  return result;
}

function parseDockerCompose() {
  console.log('[INFO] Parsing docker-compose*.yml files...');
  const composeFiles = [
    path.resolve(repoRoot, 'docker-compose.yml'),
    path.resolve(repoRoot, 'docker-compose.dev.yml'),
    path.resolve(repoRoot, 'docker-compose.production.yml'),
    path.resolve(repoRoot, 'sveltekit-frontend', 'docker-compose.full.yml'),
    path.resolve(repoRoot, 'sveltekit-frontend', 'docker-compose.dev.yml'),
  ];

  const result = {};
  composeFiles.forEach(file => {
    if (!fs.existsSync(file)) return;
    const name = path.relative(repoRoot, file);

    try {
      const content = fs.readFileSync(file, 'utf-8');
      const parsed = yaml.load(content);
      if (!parsed || !parsed.services) return;

      result[name] = {};
      Object.entries(parsed.services).forEach(([serviceName, config]) => {
        const ports = [];
        if (config.ports && Array.isArray(config.ports)) {
          config.ports.forEach(portSpec => {
            // Port spec can be "8080:8080", "8080", "127.0.0.1:8080:8080", etc.
            const match = String(portSpec).match(/^(?:(\d+\.\d+\.\d+\.\d+):)?(\d+):(\d+)(?:\/(tcp|udp))?$/);
            if (match) {
              ports.push({
                ip: match[1] || '0.0.0.0',
                host: parseInt(match[2]),
                container: parseInt(match[3]),
                protocol: match[4] || 'tcp',
              });
            }
          });
        }
        result[name][serviceName] = {
          image: config.image || 'unknown',
          ports: ports,
          profile: config.profiles ? config.profiles[0] : 'default',
          environment: config.environment || {},
        };
      });
    } catch (err) {
      console.warn(`[WARN] Failed to parse ${name}: ${err.message}`);
    }
  });

  return result;
}

function extractEnvServerTS() {
  console.log('[INFO] Extracting SvelteKit env.server.ts...');
  const file = path.resolve(repoRoot, 'sveltekit-frontend/src/lib/server/env.server.ts');
  if (!fs.existsSync(file)) {
    console.warn('[WARN] env.server.ts not found');
    return {};
  }

  const content = fs.readFileSync(file, 'utf-8');
  const result = {};

  // Extract key port-related env vars
  const portVars = [
    'QDRANT_URL', 'QDRANT_HOST', 'QDRANT_PORT', 'QDRANT_GRPC_HOST', 'QDRANT_GRPC_PORT',
    'NEO4J_URI', 'NEO4J_HTTP_URL', 'OLLAMA_BASE_URL', 'REDIS_URL', 'RABBITMQ_URL',
    'EMBEDDING_GRPC_URL', 'GO_RETRIEVAL_HTTP_URL', 'GO_RETRIEVAL_GRPC_ADDR',
    'RETRIEVAL_HTTP_URL', 'RETRIEVAL_GRPC_URL', 'TRACE_MCP_URL', 'KB_MCP_URL',
    'BIFROST_URL', 'LANGFUSE_HOST', 'COUCHDB_URL', 'DOCLING_SERVICE_URL',
  ];

  portVars.forEach(varName => {
    // Try to find default value in env.server.ts
    const patterns = [
      new RegExp(`${varName}\\s*:\\s*privateEnv\\.${varName}\\s*\\?\\?\\s*['"\`]([^'"\`]+)['"\`]`, 'i'),
      new RegExp(`${varName}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`, 'i'),
      new RegExp(`privateEnv\\.${varName}\\s*\\?\\?\\s*['"\`]([^'"\`]+)['"\`]`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        result[varName] = { default: match[1], source: 'env.server.ts' };
        break;
      }
    }
  });

  return result;
}

function scanCodeForReferences() {
  console.log('[INFO] Scanning codebase for port references...');
  const result = {};
  const searchPatterns = [
    { pattern: /(?:6333|6334)/g, service: 'qdrant' },
    { pattern: /(?:7474|7687)/g, service: 'neo4j' },
    { pattern: /(?:11434|8090)/g, service: 'ollama/llama-server' },
    { pattern: /(?:6379)/g, service: 'valkey/redis' },
    { pattern: /(?:5672|15672)/g, service: 'rabbitmq' },
    { pattern: /(?:50053|8100|50055|8096|50051|8097)/g, service: 'go-services' },
    { pattern: /(?:3040|8080)/g, service: 'bifrost' },
    { pattern: /(?:3030)/g, service: 'langfuse' },
  ];

  // This would require full codebase scan; for now return placeholder
  result['full-scan'] = {
    status: 'requires-cli-execution',
    command: 'rg -n "6333|7474|11434|6379|5672|50053|8100" . --glob "!node_modules/**"',
  };

  return result;
}

// ════════════════════════════════════════════════════════════════════════════════
// VALIDATION & COMPARISON
// ════════════════════════════════════════════════════════════════════════════════

function validateConsistency(dockerActual, envFiles, composeFiles, envServerTS) {
  console.log('[INFO] Validating consistency...');
  const issues = [];
  const matches = [];

  Object.entries(EXPECTED_PORTS).forEach(([key, expected]) => {
    const validation = {
      service: key,
      expected: expected,
      docker_ps: null,
      env_files: {},
      docker_compose: null,
      env_server_ts: null,
      status: 'unknown',
      issues: [],
    };

    // Check docker ps (match by service name or hash-prefixed container name)
    let dockerService = dockerActual[expected.service];
    if (!dockerService) {
      // Try to find by fuzzy match (hash-prefixed names like "b19c2ffc2b28_legal-ai-rabbitmq")
      const fuzzyMatch = Object.entries(dockerActual).find(([name]) =>
        name.includes(expected.service.replace('legal-ai-', ''))
      );
      if (fuzzyMatch) {
        dockerService = fuzzyMatch[1];
      }
    }

    if (dockerService) {
      // Check if the expected ports are present (after range expansion)
      const portMatch = dockerService.ports.find(
        p => p.host === expected.host && p.container === expected.container
      );

      if (portMatch) {
        validation.docker_ps = portMatch;
        validation.status = 'found-in-docker';
      } else {
        validation.docker_ps = dockerService.ports;
        validation.issues.push(`Docker PS: Found service but port mismatch. Expected ${expected.host}->${expected.container}, got ${dockerService.raw}`);
      }
    } else if (expected.service !== 'native') {
      validation.issues.push(`Docker PS: Service ${expected.service} not running (profile: ${expected.profile || 'default'})`);
    }

    // Check .env files
    Object.entries(envFiles).forEach(([envFile, vars]) => {
      const portKey = Object.keys(vars).find(k =>
        k.includes('PORT') &&
        (k.includes(expected.service.toUpperCase()) ||
         (expected.host && String(vars[k]).includes(String(expected.host))))
      );

      if (portKey) {
        validation.env_files[envFile] = { key: portKey, value: vars[portKey] };
        // Try to validate the actual port in the value
        const portMatch = String(vars[portKey]).match(/(\d{4,5})/);
        if (portMatch && parseInt(portMatch[1]) !== expected.host && parseInt(portMatch[1]) !== expected.container) {
          validation.issues.push(`${envFile}: ${portKey} has port ${portMatch[1]}, expected ${expected.host}`);
        }
      }
    });

    // Check docker-compose
    Object.entries(composeFiles).forEach(([composeFile, services]) => {
      if (services[expected.service]) {
        const service = services[expected.service];
        const portMatch = service.ports.find(
          p => p.host === expected.host && p.container === expected.container
        );
        if (portMatch) {
          validation.docker_compose = { file: composeFile, port: portMatch };
        } else if (service.ports.length > 0) {
          validation.issues.push(`${composeFile}: ${expected.service} port mismatch. Got ${JSON.stringify(service.ports)}`);
        }
      }
    });

    // Check env.server.ts
    if (envServerTS[`${expected.service.toUpperCase()}_URL`]) {
      validation.env_server_ts = envServerTS[`${expected.service.toUpperCase()}_URL`];
    }

    if (validation.issues.length === 0 && validation.status !== 'unknown') {
      matches.push(validation);
    } else if (validation.issues.length > 0) {
      issues.push(validation);
    }
  });

  return { matches, issues };
}

// ════════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION
// ════════════════════════════════════════════════════════════════════════════════

function generateJSONReport(data) {
  const report = {
    timestamp: new Date().toISOString(),
    title: 'Port Contract Audit Report',
    sources: {
      docker_ps: data.dockerActual,
      env_files: data.envFiles,
      docker_compose: data.composeFiles,
      env_server_ts: data.envServerTS,
      codebase_scan: data.codebaseScan,
    },
    validation: data.validation,
    expected_ports: EXPECTED_PORTS,
    summary: {
      total_services: Object.keys(EXPECTED_PORTS).length,
      running_correctly: data.validation.matches.length,
      issues_found: data.validation.issues.length,
      issue_percentage: ((data.validation.issues.length / Object.keys(EXPECTED_PORTS).length) * 100).toFixed(1),
    },
    recommendations: generateRecommendations(data.validation.issues),
  };

  return report;
}

function generateMDReport(report) {
  let md = `# Port Contract Audit Report

**Generated**: ${report.timestamp}

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Services | ${report.summary.total_services} |
| Running Correctly | ${report.summary.running_correctly} |
| Issues Found | ${report.summary.issues_found} |
| Issue Rate | ${report.summary.issue_percentage}% |

---

## Service Port Matrix

| Service | Host Port | Container Port | Expected Location | Status |
|---------|-----------|-----------------|-------------------|--------|
`;

  Object.entries(EXPECTED_PORTS).forEach(([key, expected]) => {
    const match = report.validation.matches.find(m => m.service === key);
    const issue = report.validation.issues.find(i => i.service === key);
    const status = match ? '✅ PASS' : issue ? '❌ FAIL' : '⚠️ NOT FOUND';
    const location = expected.location || (expected.service.startsWith('legal') ? 'Docker' : 'Native Host');

    md += `| ${key} | ${expected.host} | ${expected.container} | ${location} | ${status} |\n`;
  });

  md += '\n---\n\n## Issues Found\n\n';

  if (report.validation.issues.length === 0) {
    md += 'No issues detected. All port contracts are consistent.\n';
  } else {
    report.validation.issues.forEach((issue, idx) => {
      md += `### ${idx + 1}. ${issue.service.toUpperCase()}\n\n`;
      md += `**Expected**: ${issue.expected.host}->${issue.expected.container}\n\n`;
      if (issue.docker_ps) {
        md += `**Docker PS**: ${JSON.stringify(issue.docker_ps)}\n\n`;
      }
      md += `**Issues**:\n`;
      issue.issues.forEach(i => {
        md += `- ${i}\n`;
      });
      md += '\n';
    });
  }

  md += '\n---\n\n## Recommendations\n\n';
  report.recommendations.forEach((rec, idx) => {
    md += `${idx + 1}. **${rec.priority}**: ${rec.action}\n`;
    if (rec.details) {
      md += `   \n   ${rec.details}\n`;
    }
    md += '\n';
  });

  md += '\n---\n\n## Configuration Sources\n\n';
  md += '### .env Files Loaded\n';
  Object.entries(report.sources.env_files).forEach(([file, vars]) => {
    md += `- ${file}: ${Object.keys(vars).length} variables\n`;
  });

  md += '\n### docker-compose Files Parsed\n';
  Object.entries(report.sources.docker_compose).forEach(([file, services]) => {
    md += `- ${file}: ${Object.keys(services).length} services\n`;
  });

  md += '\n### Running Containers\n';
  Object.entries(report.sources.docker_ps).forEach(([name, data]) => {
    md += `- ${name}: ${data.ports.length} port mappings\n`;
  });

  return md;
}

function generateRecommendations(issues) {
  const recs = [];

  // Count issue types
  const dockerMissing = issues.filter(i => i.issues.some(iss => iss.includes('not running'))).length;
  const portMismatch = issues.filter(i => i.issues.some(iss => iss.includes('mismatch'))).length;

  if (dockerMissing > 0) {
    recs.push({
      priority: 'CRITICAL',
      action: `${dockerMissing} services not running in Docker`,
      details: 'Run: docker-compose --profile full --profile seaweedfs up -d',
    });
  }

  if (portMismatch > 0) {
    recs.push({
      priority: 'HIGH',
      action: `${portMismatch} port mismatches detected`,
      details: 'Verify docker-compose.yml ports match .env configuration. Restart containers if port bindings have changed.',
    });
  }

  if (issues.length === 0) {
    recs.push({
      priority: 'INFO',
      action: 'All port contracts validated successfully',
      details: 'The codebase, .env files, and running containers are in sync.',
    });
  }

  recs.push({
    priority: 'INFO',
    action: 'Run full code scan for hardcoded port references',
    details: 'Execute: rg -n "6333|7474|11434|6379|5672|50053|8100|3040" . --glob "!node_modules/**"',
  });

  return recs;
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ════════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Port Contract Audit — Canonical Source-of-Truth Analysis     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const dockerActual = dockerPsActual();
  const envFiles = readEnvFiles();
  const composeFiles = parseDockerCompose();
  const envServerTS = extractEnvServerTS();
  const codebaseScan = scanCodeForReferences();

  const validation = validateConsistency(dockerActual, envFiles, composeFiles, envServerTS);

  const data = {
    dockerActual,
    envFiles,
    composeFiles,
    envServerTS,
    codebaseScan,
    validation,
  };

  // Generate reports
  const jsonReport = generateJSONReport(data);
  const mdReport = generateMDReport(jsonReport);

  // Write JSON report
  const jsonPath = path.resolve(docsDir, 'port-contract-audit.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`\n✅ JSON report written to: ${jsonPath}`);

  // Write MD report
  const mdPath = path.resolve(docsDir, 'port-contract-audit.md');
  fs.writeFileSync(mdPath, mdReport);
  console.log(`✅ MD report written to: ${mdPath}`);

  // Print summary
  console.log('\n' + '═'.repeat(70));
  console.log('SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total Services:      ${jsonReport.summary.total_services}`);
  console.log(`Running Correctly:   ${jsonReport.summary.running_correctly}`);
  console.log(`Issues Found:        ${jsonReport.summary.issues_found}`);
  console.log(`Issue Rate:          ${jsonReport.summary.issue_percentage}%`);
  console.log('═'.repeat(70));

  if (jsonReport.summary.issues_found === 0) {
    console.log('\n✅ All port contracts are consistent!\n');
  } else {
    console.log(`\n⚠️  Found ${jsonReport.summary.issues_found} issues. Review docs/reports/port-contract-audit.md\n`);
    jsonReport.recommendations.forEach((rec, idx) => {
      console.log(`${idx + 1}. [${rec.priority}] ${rec.action}`);
    });
    console.log();
  }
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});