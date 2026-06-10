/**
 * scripts/agents/repair-registry.ts
 *
 * Runtime repair registry for the agentic error-fixing loop.
 *
 * Flow:
 *   error event
 *   → classify stack trace / route / file
 *   → map source_ref → feature_id  (via atlas_feature_map)
 *   → retrieve NES/CHR packets     (via nes_chrom_packets / Redis)
 *   → select repair capability
 *   → dynamic import repair module (ONLY from signed manifest)
 *   → dry-run patch
 *   → tests/checks
 *   → kanban task update
 *
 * Hard rules:
 *   - dynamic import ONLY from repairSkillManifest entries
 *   - source_ref MUST start with 'scripts/agents/skills/'
 *   - never import from node_modules paths
 *   - never skip dry-run
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type RepairCapability =
  | 'svelte-fix'
  | 'zod-fix'
  | 'drizzle-fix'
  | 'route-fix'
  | 'test-fix'
  | 'type-fix'
  | 'import-fix';

export type RiskLevel = 'low' | 'medium' | 'high';

export type RepairInput = {
  error: string;        // raw error string / stack trace
  source_ref: string;   // file path where the error originated
  packet: unknown;      // NES/CHR packet retrieved for this source_ref
  dryRun: boolean;      // must be true on first invocation
};

export type RepairOutput = {
  patch?: string;           // unified diff
  files?: string[];         // files that would be modified
  confidence: number;       // 0.0 – 1.0
  notes: string[];          // explanation / caveats
  checkCommands?: string[]; // e.g. ['npm run check', 'npm run test -- auth']
};

export type AgentRepairSkill = {
  id: string;
  feature_id: string;
  source_ref: string;
  capability: RepairCapability;
  risk: RiskLevel;
  run(input: RepairInput): Promise<RepairOutput>;
};

// ── Signed skill manifest ─────────────────────────────────────────────────────
// Every entry must have source_ref starting with 'scripts/agents/skills/'
// import_path is relative to THIS file (resolved at import time)

export const repairSkillManifest = {
  'svelte-parse-fix': {
    feature_id:  'feat:svelte:parse-repair',
    source_ref:  'scripts/agents/skills/svelte-parse-fix.ts',
    import_path: './skills/svelte-parse-fix.ts',
    capability:  'svelte-fix' as RepairCapability,
    risk:        'medium' as RiskLevel,
    description: 'Fix Svelte 5 rune syntax errors, missing semicolons, slot→snippet rewrites',
  },
  'drizzle-23505-fix': {
    feature_id:  'feat:db:unique-constraint-repair',
    source_ref:  'scripts/agents/skills/drizzle-23505-fix.ts',
    import_path: './skills/drizzle-23505-fix.ts',
    capability:  'drizzle-fix' as RepairCapability,
    risk:        'low' as RiskLevel,
    description: 'Handle Postgres 23505 unique-constraint violations with ON CONFLICT guards',
  },
  'zod-schema-fix': {
    feature_id:  'feat:validation:zod-schema-repair',
    source_ref:  'scripts/agents/skills/zod-schema-fix.ts',
    import_path: './skills/zod-schema-fix.ts',
    capability:  'zod-fix' as RepairCapability,
    risk:        'low' as RiskLevel,
    description: 'Fix Zod schema mismatches, add missing fields, correct enum values',
  },
  'route-fix': {
    feature_id:  'feat:sveltekit:route-repair',
    source_ref:  'scripts/agents/skills/route-fix.ts',
    import_path: './skills/route-fix.ts',
    capability:  'route-fix' as RepairCapability,
    risk:        'medium' as RiskLevel,
    description: 'Fix SvelteKit route handler shape mismatches, missing auth guards, degraded response contract',
  },
  'type-import-fix': {
    feature_id:  'feat:typescript:import-repair',
    source_ref:  'scripts/agents/skills/type-import-fix.ts',
    import_path: './skills/type-import-fix.ts',
    capability:  'type-fix' as RepairCapability,
    risk:        'low' as RiskLevel,
    description: 'Fix broken import { A: B } syntax, missing .js extensions, ioredis type augmentations',
  },
} as const;

export type SkillId = keyof typeof repairSkillManifest;

// ── NES packet shape for repair skills ───────────────────────────────────────

export type RepairSkillPacket = {
  packet_id: string;
  feature_id: string;
  source_ref: string;
  kind: 'repair_skill';
  capability: RepairCapability;
  inputs: string[];
  outputs: string[];
  risk: RiskLevel;
};

// ── Kanban task card ──────────────────────────────────────────────────────────

export type RepairTaskCard = {
  id: string;
  title: string;
  feature_id: string;
  source_refs: string[];
  packet_refs: string[];
  status: 'pending' | 'ready_for_dry_run' | 'dry_run_done' | 'applied' | 'failed';
  checks: string[];
  patch?: string;
  confidence?: number;
  notes?: string[];
  createdAt: string;
  updatedAt: string;
};

// ── Safe skill loader ─────────────────────────────────────────────────────────

const SKILL_SOURCE_ALLOWLIST = 'scripts/agents/skills/';

export async function loadRepairSkill(skillId: SkillId): Promise<{
  meta: typeof repairSkillManifest[SkillId];
  skill: AgentRepairSkill;
}> {
  const meta = repairSkillManifest[skillId];

  // Safety gate 1: source_ref must be in the allowlist
  if (!meta.source_ref.startsWith(SKILL_SOURCE_ALLOWLIST)) {
    throw new Error(
      `[repair-registry] Blocked unsafe skill source_ref: "${meta.source_ref}". ` +
      `Must start with "${SKILL_SOURCE_ALLOWLIST}".`
    );
  }

  // Safety gate 2: dynamic import from resolved manifest path only
  const mod = await import(meta.import_path) as { default?: AgentRepairSkill };

  if (typeof mod.default?.run !== 'function') {
    throw new Error(
      `[repair-registry] Invalid repair skill "${skillId}": ` +
      `module.default must export a { run(input): Promise<RepairOutput> } object.`
    );
  }

  return { meta, skill: mod.default };
}

// ── Error → skill routing ─────────────────────────────────────────────────────

type ErrorClassification = {
  skillId: SkillId | null;
  confidence: number;
  matchedPattern: string;
};

const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  skillId: SkillId;
  confidence: number;
  label: string;
}> = [
  { pattern: /error P\d+.*svelte|Expected.*token.*svelte|Unexpected.*identifier.*svelte/i,      skillId: 'svelte-parse-fix',  confidence: 0.85, label: 'svelte-parse' },
  { pattern: /duplicate key.*violates unique|error code.*23505/i,                               skillId: 'drizzle-23505-fix', confidence: 0.95, label: 'pg-23505' },
  { pattern: /ZodError|z\.object|Expected.*received|invalid_type.*zod/i,                        skillId: 'zod-schema-fix',    confidence: 0.80, label: 'zod-schema' },
  { pattern: /\+server\.ts.*expected|RequestHandler.*missing|load\(\).*must return/i,           skillId: 'route-fix',         confidence: 0.75, label: 'sveltekit-route' },
  { pattern: /Cannot find module|Module.*not found|import.*\{.*:.*\}|\.js.*extension/i,         skillId: 'type-import-fix',   confidence: 0.80, label: 'import-error' },
];

export function classifyError(errorText: string): ErrorClassification {
  for (const { pattern, skillId, confidence, label } of ERROR_PATTERNS) {
    if (pattern.test(errorText)) {
      return { skillId, confidence, matchedPattern: label };
    }
  }
  return { skillId: null, confidence: 0, matchedPattern: 'unclassified' };
}

// ── Packet builder ────────────────────────────────────────────────────────────

export function buildRepairPacket(skillId: SkillId): RepairSkillPacket {
  const meta = repairSkillManifest[skillId];
  return {
    packet_id:  `ace:packet:${meta.feature_id}`,
    feature_id: meta.feature_id,
    source_ref: meta.source_ref,
    kind:       'repair_skill',
    capability: meta.capability,
    inputs:     deriveInputs(meta.capability),
    outputs:    ['patch', 'test_command', 'kanban_update'],
    risk:       meta.risk,
  };
}

function deriveInputs(cap: RepairCapability): string[] {
  switch (cap) {
    case 'svelte-fix':   return ['svelte_error', 'component_source', 'rune_context'];
    case 'drizzle-fix':  return ['postgres_error', 'route_action', 'drizzle_schema'];
    case 'zod-fix':      return ['zod_error', 'schema_definition', 'input_payload'];
    case 'route-fix':    return ['route_source', 'request_shape', 'auth_context'];
    case 'type-fix':     return ['ts_error', 'import_source', 'tsconfig'];
    case 'import-fix':   return ['import_error', 'module_path', 'package_json'];
    default:             return ['error', 'source_ref'];
  }
}

// ── Task card factory ─────────────────────────────────────────────────────────

export function buildTaskCard(opts: {
  skillId: SkillId;
  sourceRef: string;
  title: string;
  extraSourceRefs?: string[];
}): RepairTaskCard {
  const { skillId, sourceRef, title, extraSourceRefs = [] } = opts;
  const meta = repairSkillManifest[skillId];
  const now = new Date().toISOString();
  return {
    id:          `task:repair:${skillId}:${Date.now()}`,
    title,
    feature_id:  meta.feature_id,
    source_refs: [sourceRef, ...extraSourceRefs].filter(Boolean),
    packet_refs: [`ace:packet:${meta.feature_id}`],
    status:      'ready_for_dry_run',
    checks:      deriveChecks(meta.capability, sourceRef),
    createdAt:   now,
    updatedAt:   now,
  };
}

function deriveChecks(cap: RepairCapability, sourceRef: string): string[] {
  const base = ['npm run check'];
  const stem = sourceRef.split('/').pop()?.replace(/\.(ts|svelte)$/, '') ?? '';
  switch (cap) {
    case 'svelte-fix':
      return [...base, `npm run test -- ${stem}`];
    case 'drizzle-fix':
      return [...base, `npm run test -- ${stem}`, 'npx drizzle-kit check'];
    case 'zod-fix':
      return [...base, `npm run test -- ${stem}`];
    case 'route-fix':
      return [...base, `npm run test:routes -- ${stem}`];
    default:
      return base;
  }
}
