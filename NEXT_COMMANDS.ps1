# Parent Atlas next commands

$ErrorActionPreference = 'Stop'

cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

# 1. Verify Graphify inputs without mutating stores
npm run atlas:graphify:daily:readiness

# If readiness fails, stop and review the stale-input cause before any Graphify refresh.

# 2. After the direct glob dependency/API check
node scripts/deep-audit-ast.mjs --gate=D9

# 3. Triage only — do not delete or move files
node scripts/triage-d9-orphans.mjs

# 4. Graphify revision authority safety
npx tsx scripts/atlas/audit-graphify-revision-migration-safety.mts
npx tsx scripts/atlas/prove-graphify-revision-migration-preflight.mts
npx tsx scripts/atlas/prove-code-revision-owner-canary.mts