#!/usr/bin/env node
/**
 * Startup Briefing Orchestrator
 *
 * Runs read-only Graphify/readiness passes and synthesizes a human-friendly
 * briefing for ACE/Gemma4 context. Executed on OpenCode startup.
 *
 * Flow:
 * 1. Run graphify/readiness scripts (read-only)
 * 2. Parse outputs: recommendations, tasks, production readiness, coverage
 * 3. Generate briefing JSON + markdown
 * 4. Gemma4 reads briefing before planning
 * 5. User selects next lane (mutations blocked by --apply gate)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OPENCODE_DIR = path.join(ROOT, '.opencode');
const DOCS_DIR = path.join(ROOT, 'docs/reports');
const TMP_DIR = path.join(ROOT, '.tmp');

// Ensure output directories exist
await Promise.all([
  fs.mkdir(OPENCODE_DIR, { recursive: true }),
  fs.mkdir(DOCS_DIR, { recursive: true }),
  fs.mkdir(TMP_DIR, { recursive: true }),
]).catch(() => {});

console.log('🚀 Startup Briefing: Gathering system state...\n');

const briefing = {
  timestamp: new Date().toISOString(),
  greeting: 'Hello James.',
  sinceLastWorked: {
    tasksOpen: 0,
    tasksClosed: 0,
    newRecommendations: 0,
    productionReadiness: 'UNKNOWN',
  },
  systems: {
    postgres: 'unknown',
    redis: 'unknown',
    qdrant: 'unknown',
    neo4j: 'unknown',
    turbovec: 'unknown',
    ldjson: 'unknown',
  },
  coverage: {
    qdrant: '?%',
    som: '?%',
    parentAtlas: '?%',
  },
  warnings: [],
  recommendations: [],
  nextLane: 'Diagnosis',
};

// 1. Parse task state
try {
  const taskStateFile = path.join(OPENCODE_DIR, 'tasks/task-state.md');
  const taskContent = await fs.readFile(taskStateFile, 'utf-8').catch(() => '');

  const openMatch = taskContent.match(/Open:\s*(\d+)/);
  const closedMatch = taskContent.match(/Closed:\s*(\d+)/);
  const newMatch = taskContent.match(/New:\s*(\d+)/);

  if (openMatch) briefing.sinceLastWorked.tasksOpen = parseInt(openMatch[1], 10);
  if (closedMatch) briefing.sinceLastWorked.tasksClosed = parseInt(closedMatch[1], 10);
  if (newMatch) briefing.sinceLastWorked.newRecommendations = parseInt(newMatch[1], 10);
} catch (err) {
  // Task state may not exist yet
}

// 2. Parse production readiness report
try {
  const readinessFile = path.join(DOCS_DIR, 'parent-atlas-production-readiness-report.json');
  const readinessContent = await fs.readFile(readinessFile, 'utf-8').catch(() => '{}');
  const readiness = JSON.parse(readinessContent);

  if (readiness.summary) {
    const { pass, warn, fail } = readiness.summary;
    briefing.sinceLastWorked.productionReadiness = `PASS ${pass || 0} / WARN ${warn || 0} / FAIL ${fail || 0}`;

    // Extract system health from gates
    if (readiness.gates) {
      readiness.gates.forEach((gate) => {
        if (gate.status === 'FAIL') {
          briefing.warnings.push(`${gate.name}: ${gate.reason}`);
        }
      });
    }
  }
} catch (err) {
  briefing.sinceLastWorked.productionReadiness = 'UNKNOWN';
}

// 3. Parse recommendations
try {
  const recFile = path.join(OPENCODE_DIR, 'recommendations/recommendations.json');
  const recContent = await fs.readFile(recFile, 'utf-8').catch(() => '{"recommendations":[]}');
  const recData = JSON.parse(recContent);

  if (Array.isArray(recData.recommendations)) {
    briefing.sinceLastWorked.newRecommendations = recData.recommendations.length;
    briefing.recommendations = recData.recommendations
      .slice(0, 6)
      .map((r) => r.title || r.description || String(r));
  }
} catch (err) {
  // Recommendations may not exist
}

// 4. Parse coverage reports
try {
  const coverageFile = path.join(ROOT, 'docs/reports/parent-atlas-production-readiness-report.json');
  const coverageContent = await fs.readFile(coverageFile, 'utf-8').catch(() => '{}');
  const coverage = JSON.parse(coverageContent);

  if (coverage.coverage) {
    if (coverage.coverage.qdrant) briefing.coverage.qdrant = `${coverage.coverage.qdrant}%`;
    if (coverage.coverage.som) briefing.coverage.som = `${coverage.coverage.som}%`;
    if (coverage.coverage.parentAtlas) briefing.coverage.parentAtlas = `${coverage.coverage.parentAtlas}%`;
  }
} catch (err) {
  // Coverage data may not be available
}

// 5. System health checks (non-blocking)
const systemHealthChecks = {
  postgres: async () => {
    try {
      execSync('psql "$DATABASE_URL" -c "SELECT 1" 2>/dev/null', {
        stdio: 'pipe',
        timeout: 2000,
      });
      return 'healthy';
    } catch {
      return 'offline';
    }
  },
  redis: async () => {
    try {
      execSync('redis-cli ping 2>/dev/null', {
        stdio: 'pipe',
        timeout: 2000,
      });
      return 'healthy';
    } catch {
      return 'offline';
    }
  },
  qdrant: async () => {
    try {
      execSync('curl -s http://localhost:6333/health 2>/dev/null | grep -q "ok"', {
        stdio: 'pipe',
        timeout: 2000,
      });
      return 'healthy';
    } catch {
      return 'offline (check coverage %)';
    }
  },
};

// Run health checks in parallel (with timeout)
const healthResults = await Promise.allSettled([
  systemHealthChecks.postgres().catch(() => 'unknown'),
  systemHealthChecks.redis().catch(() => 'unknown'),
  systemHealthChecks.qdrant().catch(() => 'unknown'),
]).catch(() => []);

if (healthResults[0]?.status === 'fulfilled') briefing.systems.postgres = healthResults[0].value;
if (healthResults[1]?.status === 'fulfilled') briefing.systems.redis = healthResults[1].value;
if (healthResults[2]?.status === 'fulfilled') briefing.systems.qdrant = healthResults[2].value;

// 6. Determine next lane based on state
const determineNextLane = () => {
  if (briefing.systems.redis === 'offline') {
    briefing.recommendations.unshift('📍 Fix Redis preflight (cache offline)');
    return 'Infrastructure Repair';
  }

  if (briefing.warnings.length > 0) {
    const dbWarning = briefing.warnings.find((w) => w.includes('atlas_feature_map'));
    if (dbWarning) {
      briefing.recommendations.unshift('📍 Repair atlas_feature_map → parent_atlas_documents join');
      return 'Runtime Coverage Repair';
    }
  }

  if (briefing.coverage.qdrant !== '100%') {
    briefing.recommendations.unshift('📍 Materialize route_runtime_packets coverage');
    return 'Vector Index Completion';
  }

  return 'Phase 4B Validation (ready)';
};

briefing.nextLane = determineNextLane();

// Add context notes
if (briefing.systems.redis === 'offline') {
  briefing.warnings.push('⚠️ Redis offline: ACE cache using disk fallback only');
}

// 7. Write outputs
const briefingMd = `# Startup Briefing — ${new Date().toLocaleString()}

${briefing.greeting}

## Since We Last Worked

- **Tasks Open**: ${briefing.sinceLastWorked.tasksOpen}
- **Tasks Closed**: ${briefing.sinceLastWorked.tasksClosed}
- **New Recommendations**: ${briefing.sinceLastWorked.newRecommendations}
- **Production Readiness**: ${briefing.sinceLastWorked.productionReadiness}

## System Health

| System | Status |
|--------|--------|
| PostgreSQL | ${briefing.systems.postgres} |
| Redis | ${briefing.systems.redis} |
| Qdrant | ${briefing.systems.qdrant} |
| Neo4j | ${briefing.systems.neo4j} |
| TurboVec | ${briefing.systems.turbovec} |

## Coverage

- **Qdrant Coverage**: ${briefing.coverage.qdrant}
- **SOM Coverage**: ${briefing.coverage.som}
- **Parent Atlas Coverage**: ${briefing.coverage.parentAtlas}

## Warnings

${briefing.warnings.length > 0 ? briefing.warnings.map((w) => `- ${w}`).join('\n') : '- None'}

## Top Recommendations

${briefing.recommendations.length > 0 ? briefing.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n') : '- All systems nominal'}

## Recommended Next Lane

**${briefing.nextLane}**

---

*Generated by startup-briefing orchestrator*
`;

await fs.writeFile(path.join(OPENCODE_DIR, 'startup-briefing.md'), briefingMd);
await fs.writeFile(path.join(OPENCODE_DIR, 'startup-briefing.json'), JSON.stringify(briefing, null, 2));

// 8. Print human summary
console.log('════════════════════════════════════════════════════════════');
console.log(briefing.greeting);
console.log('════════════════════════════════════════════════════════════\n');

console.log(`Since we last worked:`);
console.log(`  • ${briefing.sinceLastWorked.tasksOpen} tasks open`);
console.log(`  • ${briefing.sinceLastWorked.newRecommendations} recommendations pending`);
console.log(`  • Production: ${briefing.sinceLastWorked.productionReadiness}\n`);

console.log(`System Status:`);
console.log(`  • PostgreSQL: ${briefing.systems.postgres}`);
console.log(`  • Redis: ${briefing.systems.redis}`);
console.log(`  • Qdrant: ${briefing.systems.qdrant}\n`);

console.log(`Coverage:`);
console.log(`  • Qdrant: ${briefing.coverage.qdrant}`);
console.log(`  • SOM: ${briefing.coverage.som}`);
console.log(`  • Parent Atlas: ${briefing.coverage.parentAtlas}\n`);

if (briefing.warnings.length > 0) {
  console.log(`⚠️  Warnings:`);
  briefing.warnings.forEach((w) => console.log(`  • ${w}`));
  console.log('');
}

console.log(`🎯 Recommended Next Lane:`);
console.log(`  ${briefing.nextLane}\n`);

console.log(`Top Actions:`);
briefing.recommendations.slice(0, 3).forEach((r, i) => {
  console.log(`  ${i + 1}. ${r}`);
});

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`📄 Full briefing: .opencode/startup-briefing.md`);
console.log(`📊 JSON export: .opencode/startup-briefing.json\n`);

// Export for Gemma4 context injection
const contextForGemma = {
  systemState: briefing,
  safetyGates: {
    allowRead: true,
    allowGraphifyReadonly: true,
    allowMutations: false,
    mutationGate: '--apply flag required',
  },
  nextActions: briefing.recommendations.slice(0, 3),
};

await fs.writeFile(
  path.join(OPENCODE_DIR, '.startup-context.json'),
  JSON.stringify(contextForGemma, null, 2)
);

process.exit(0);
