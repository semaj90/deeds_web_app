import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const hookPath = path.join(root, 'sveltekit-frontend/src/hooks.server.ts');
const envPath = path.join(root, 'sveltekit-frontend/src/lib/server/env.server.ts');
const reportPath = path.join(root, 'docs/reports/auth-surface-audit-v1.json');

const hook = fs.readFileSync(hookPath, 'utf8');
const env = fs.readFileSync(envPath, 'utf8');
const flagged = [
  '/api/ai/emotion',
  '/api/batch-summary/jobs',
  '/api/retrieval/dual-lane',
  '/api/telemetry/implementation-clusters',
  '/api/phase102/retrieval-pipeline',
];

const publicBlock = hook.match(/const PUBLIC = \[(.*?)\];/s)?.[1] ?? '';
const publicPrefixes = [...publicBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
const routeStatus = flagged.map((route) => ({
  route,
  routeExists: fs.existsSync(path.join(root, 'sveltekit-frontend/src/routes', `${route.slice(1)}/+server.ts`)),
  centralizedHookDecision: publicPrefixes.some((prefix) => route.startsWith(prefix)) ? 'PUBLIC_ALLOWLIST' : 'AUTH_REQUIRED',
  localGuard: 'NOT_REQUIRED_FOR_CENTRAL_HOOK_PROOF',
}));

const report = {
  schema: 'atlas.auth-surface-audit.v1',
  generatedAt: new Date().toISOString(),
  timestampMethod: 'AUDIT_EXECUTION_TIME',
  scope: 'flagged-route-central-hook-reconciliation',
  counts: {
    flaggedRoutes: flagged.length,
    centrallyProtected: routeStatus.filter((row) => row.centralizedHookDecision === 'AUTH_REQUIRED').length,
    publicAllowlisted: routeStatus.filter((row) => row.centralizedHookDecision === 'PUBLIC_ALLOWLIST').length,
    productionBypassGuardPresent: env.includes('DEV_BYPASS_AUTH_FORBIDDEN_IN_PRODUCTION'),
  },
  routeStatus,
  tRPC: {
    status: 'DEEP_MIDDLEWARE_REVIEW_REQUIRED',
    reason: 'Route-level static analysis cannot prove procedure middleware authorization.',
  },
  separateConcerns: [
    'Zod validation is separate from authorization.',
    'Rate limiting and bounded LLM inputs are separate from authorization.',
    'Centralized hook protection does not prove resource-level authorization.',
  ],
  writesPerformed: false,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath: path.relative(root, reportPath), counts: report.counts }, null, 2));
