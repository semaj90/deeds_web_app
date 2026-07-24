export const PARENT_ATLAS_RUNTIME_PROFILES = [
  'parent_atlas_full',
  'engram_only',
  'development',
  'ci_fixture',
] as const;

export type ParentAtlasRuntimeProfile = (typeof PARENT_ATLAS_RUNTIME_PROFILES)[number];

export const RUNTIME_SERVICE_NAMES = [
  'postgres',
  'redis',
  'qdrant',
  'neo4j',
  'ollama',
  'engram_embed',
] as const;

export type RuntimeServiceName = (typeof RUNTIME_SERVICE_NAMES)[number];

export const RUNTIME_FEATURE_NAMES = ['graphify_startup'] as const;

export type RuntimeFeatureName = (typeof RUNTIME_FEATURE_NAMES)[number];

export type RuntimeRequirementState = 'required' | 'optional' | 'disabled';

export type RuntimeProfileSource =
  | 'explicit_env'
  | 'legacy_engram_only'
  | 'test_env'
  | 'development_env'
  | 'default_full';

export interface RuntimeRequirement {
  state: RuntimeRequirementState;
  rationale: string;
  probe: string;
}

export interface RuntimeProfileManifest {
  manifestVersion: 1;
  profile: ParentAtlasRuntimeProfile;
  source: RuntimeProfileSource;
  services: Record<RuntimeServiceName, RuntimeRequirement>;
  features: Record<RuntimeFeatureName, RuntimeRequirement>;
  notes: string[];
}

const PROFILE_ALIASES: Record<string, ParentAtlasRuntimeProfile> = {
  full: 'parent_atlas_full',
  parent_atlas_full: 'parent_atlas_full',
  parentatlasfull: 'parent_atlas_full',
  engram: 'engram_only',
  engram_only: 'engram_only',
  engramonly: 'engram_only',
  development: 'development',
  dev: 'development',
  ci: 'ci_fixture',
  fixture: 'ci_fixture',
  ci_fixture: 'ci_fixture',
  test: 'ci_fixture',
};

function requirement(state: RuntimeRequirementState, rationale: string, probe: string): RuntimeRequirement {
  return { state, rationale, probe };
}

const MANIFESTS: Record<ParentAtlasRuntimeProfile, Omit<RuntimeProfileManifest, 'profile' | 'source'>> = {
  parent_atlas_full: {
    manifestVersion: 1,
    services: {
      postgres: requirement('required', 'Canonical store and orchestration registry', 'SELECT 1'),
      redis: requirement('required', 'Warm cache and board acceleration', 'PING'),
      qdrant: requirement('required', 'Durable semantic retrieval projection', 'GET /collections'),
      neo4j: requirement('required', 'Derived topology index and graph authority lane', 'RETURN 1'),
      ollama: requirement('required', 'Chat and embedding runtime', 'GET /api/tags'),
      engram_embed: requirement('required', 'Engram MCP / TurboVec sidecar for bounded context memory', 'GET /health on :8792'),
    },
    features: {
      graphify_startup: requirement('required', 'Graphify startup is part of the full workstation readiness contract', 'startup guard'),
    },
    notes: [
      'Full workstation profile keeps the graph authority, retrieval and cache lanes online.',
    ],
  },
  engram_only: {
    manifestVersion: 1,
    services: {
      postgres: requirement('required', 'Canonical store remains live', 'SELECT 1'),
      redis: requirement('disabled', 'Explicitly disabled by engram-only policy', 'skip probe'),
      qdrant: requirement('disabled', 'Explicitly disabled by engram-only policy', 'skip probe'),
      neo4j: requirement('disabled', 'Explicitly disabled by engram-only policy', 'skip probe'),
      ollama: requirement('required', 'Engram still needs model/runtime support', 'GET /api/tags'),
      engram_embed: requirement('required', 'Engram MCP / TurboVec sidecar is required', 'GET /health on :8792'),
    },
    features: {
      graphify_startup: requirement('disabled', 'Graphify startup is disabled in engram-only mode', 'skip startup'),
    },
    notes: [
      'Engram-only mode suppresses Redis, Qdrant, Neo4j and Graphify as policy-disabled.',
    ],
  },
  development: {
    manifestVersion: 1,
    services: {
      postgres: requirement('required', 'Local development still relies on the canonical DB', 'SELECT 1'),
      redis: requirement('optional', 'Useful warm cache, but not mandatory in development', 'PING'),
      qdrant: requirement('optional', 'Semantic retrieval lane, but dev can run degraded', 'GET /collections'),
      neo4j: requirement('optional', 'Graph lane can be offline while iterating locally', 'RETURN 1'),
      ollama: requirement('required', 'Local model runtime is required for app workflows', 'GET /api/tags'),
      engram_embed: requirement('optional', 'Sidecar accelerates memory and ANN routing when present', 'GET /health on :8792'),
    },
    features: {
      graphify_startup: requirement('optional', 'Graphify startup can be present but is not mandatory during dev', 'startup guard'),
    },
    notes: [
      'Development mode tolerates missing derived stores but still treats Postgres and Ollama as required.',
    ],
  },
  ci_fixture: {
    manifestVersion: 1,
    services: {
      postgres: requirement('optional', 'Fixture jobs may use a mocked or ephemeral DB', 'SELECT 1'),
      redis: requirement('optional', 'Fixture tests may stub Redis', 'PING'),
      qdrant: requirement('optional', 'Fixture tests may stub Qdrant', 'GET /collections'),
      neo4j: requirement('optional', 'Fixture tests may stub Neo4j', 'RETURN 1'),
      ollama: requirement('optional', 'Fixture tests may stub the model runtime', 'GET /api/tags'),
      engram_embed: requirement('optional', 'Fixture tests may stub the 8792 sidecar', 'GET /health on :8792'),
    },
    features: {
      graphify_startup: requirement('disabled', 'Fixture runs do not need graphify startup', 'skip startup'),
    },
    notes: [
      'CI fixture mode must not turn missing live services into a hard failure.',
    ],
  },
};

function normalizeProfileToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[-\s]+/g, '_');
}

export function resolveParentAtlasRuntimeProfile(
  env: Record<string, string | undefined> = process.env,
): { profile: ParentAtlasRuntimeProfile; source: RuntimeProfileSource; raw?: string } {
  const explicit = env.PARENT_ATLAS_RUNTIME_PROFILE ?? env.ATLAS_RUNTIME_PROFILE;
  if (explicit && explicit.trim()) {
    const normalized = normalizeProfileToken(explicit);
    const profile = PROFILE_ALIASES[normalized];
    if (profile) {
      return { profile, source: 'explicit_env', raw: explicit };
    }
  }

  if ((env.ENGRAM_ONLY ?? '').trim().toLowerCase() === 'true') {
    return { profile: 'engram_only', source: 'legacy_engram_only', raw: 'true' };
  }

  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'test' || (env.CI ?? '').trim().toLowerCase() === 'true') {
    return { profile: 'ci_fixture', source: 'test_env', raw: env.NODE_ENV ?? env.CI };
  }

  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'development') {
    return { profile: 'development', source: 'development_env', raw: env.NODE_ENV };
  }

  return { profile: 'parent_atlas_full', source: 'default_full' };
}

export function getParentAtlasRuntimeProfileManifest(
  env: Record<string, string | undefined> = process.env,
): RuntimeProfileManifest {
  const resolved = resolveParentAtlasRuntimeProfile(env);
  const base = MANIFESTS[resolved.profile];

  return {
    ...base,
    profile: resolved.profile,
    source: resolved.source,
  };
}

export function isRuntimeServiceRequired(profile: ParentAtlasRuntimeProfile, service: RuntimeServiceName): boolean {
  return MANIFESTS[profile].services[service].state === 'required';
}

export function isRuntimeServiceDisabled(profile: ParentAtlasRuntimeProfile, service: RuntimeServiceName): boolean {
  return MANIFESTS[profile].services[service].state === 'disabled';
}

export function getRuntimeRequirement(
  profile: ParentAtlasRuntimeProfile,
  service: RuntimeServiceName | RuntimeFeatureName,
  kind: 'service' | 'feature' = 'service',
): RuntimeRequirement {
  if (kind === 'feature') {
    return MANIFESTS[profile].features[service as RuntimeFeatureName];
  }
  return MANIFESTS[profile].services[service as RuntimeServiceName];
}

export const PARENT_ATLAS_RUNTIME_PROFILE_MANIFESTS = MANIFESTS;
