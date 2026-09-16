import { createHash } from 'node:crypto';

export const UNIFIED_RESIDENCY_SCHEMA = 'atlas.unified-residency.v1' as const;
export const GPU_CEILING_BYTES = 6_000_000_000;
export const DEFAULT_RESERVED_HEADROOM_BYTES = 2_000_000_000;

export type ResidencyState =
  | 'EMPTY'
  | 'LOADING'
  | 'RESIDENT'
  | 'IN_USE'
  | 'EVICTION_PENDING'
  | 'EVICTED'
  | 'FAILED';

export type ResidencyKind = 'FEATURE_TILE' | 'TRANSFORMER_KV' | 'MAMBA_STATE' | 'SAMBA_WINDOW' | 'TITANS_MEMORY';
export type ResidencyDType = 'float32' | 'float16' | 'bfloat16' | 'int32' | 'uint32' | 'uint8';

export interface UnifiedResidencyDescriptor {
  schema: typeof UNIFIED_RESIDENCY_SCHEMA;
  residencyKey: string;
  kind: ResidencyKind;
  workspaceRevision: string;
  sourceRevision: string;
  representationRevision: string;
  featureRevision: string;
  modelRevision: string;
  tokenizerRevision: string;
  ropeRevision: string;
  candidateOrdinal: number;
  artifactChecksum: string;
  shape: readonly number[];
  dtype: ResidencyDType;
  byteLength: number;
  state: ResidencyState;
  positionBase?: number;
  contextWindow?: number;
  leaseUntil?: number;
}

export interface ResidencyBuffer { readonly byteLength: number; readonly buffer: ArrayBufferView; }
export interface ResidencyProvider<K extends ResidencyKind = ResidencyKind> {
  readonly kind: K;
  load(descriptor: UnifiedResidencyDescriptor): Promise<ResidencyBuffer | null>;
}
export type FeatureTileProvider = ResidencyProvider<'FEATURE_TILE'>;
export type TransformerKvProvider = ResidencyProvider<'TRANSFORMER_KV'>;
export type MambaStateProvider = ResidencyProvider<'MAMBA_STATE'>;
export type SambaWindowProvider = ResidencyProvider<'SAMBA_WINDOW'>;
export type TitansMemoryProvider = ResidencyProvider<'TITANS_MEMORY'>;

export function requireProvider<K extends ResidencyKind>(provider: ResidencyProvider<K> | null | undefined, kind: K): ResidencyProvider<K> {
  if (!provider || provider.kind !== kind) throw new Error(`${kind}_PROVIDER_UNAVAILABLE`);
  return provider;
}

export function packFloat32Tile(values: readonly number[]): { buffer: Float32Array; byteLength: number; checksum: string } {
  if (values.some((value) => !Number.isFinite(value))) throw new Error('NUMERIC_TILE_NONFINITE');
  const buffer = new Float32Array(values);
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return { buffer, byteLength: buffer.byteLength, checksum: createHash('sha256').update(bytes).digest('hex') };
}

export function unpackFloat32Tile(buffer: ArrayBufferView, expectedLength: number): Float32Array {
  if (buffer.byteLength !== expectedLength * Float32Array.BYTES_PER_ELEMENT) throw new Error('NUMERIC_TILE_LENGTH_MISMATCH');
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return new Float32Array(bytes.slice().buffer);
}

export interface DomainLutEntry {
  lutRevision: string;
  tokenBudget: number;
  featureMask: readonly string[];
  tileWidth: number;
  contextWindow: number;
  residencyPriority: number;
}

export interface DomainRoutingInput { domain: string; lutRevision: string; table: Readonly<Record<string, DomainLutEntry>>; }
export interface DomainRoutingDecision extends DomainLutEntry { domain: string; }

function required(value: string, field: string): string {
  if (!value.trim()) throw new Error(`${field}_REQUIRED`);
  return value;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field}_INVALID`);
  return value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function descriptorCacheKey(d: Pick<UnifiedResidencyDescriptor, 'kind' | 'workspaceRevision' | 'sourceRevision' | 'representationRevision' | 'featureRevision' | 'modelRevision' | 'tokenizerRevision' | 'ropeRevision' | 'candidateOrdinal' | 'artifactChecksum'>): string {
  return `atlas:residency:v1:${createHash('sha256').update(canonicalJson(d)).digest('hex')}`;
}

export function validateUnifiedDescriptor(d: UnifiedResidencyDescriptor): void {
  if (d.schema !== UNIFIED_RESIDENCY_SCHEMA) throw new Error('UNIFIED_RESIDENCY_SCHEMA_INVALID');
  required(d.residencyKey, 'residencyKey');
  for (const [field, value] of Object.entries({ workspaceRevision: d.workspaceRevision, sourceRevision: d.sourceRevision, representationRevision: d.representationRevision, featureRevision: d.featureRevision, modelRevision: d.modelRevision, tokenizerRevision: d.tokenizerRevision, ropeRevision: d.ropeRevision, artifactChecksum: d.artifactChecksum })) required(value, field);
  if (!Number.isInteger(d.candidateOrdinal) || d.candidateOrdinal < 0) throw new Error('candidateOrdinal_INVALID');
  if (!Array.isArray(d.shape) || d.shape.length === 0 || d.shape.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error('shape_INVALID');
  positiveInteger(d.byteLength, 'byteLength');
  if (d.kind === 'TRANSFORMER_KV' || d.kind === 'SAMBA_WINDOW') {
    positiveInteger(d.contextWindow ?? 0, 'contextWindow');
    if (!Number.isFinite(d.positionBase)) throw new Error('positionBase_REQUIRED');
  }
}

export function serializeResidencyControl(d: UnifiedResidencyDescriptor): string {
  validateUnifiedDescriptor(d);
  return JSON.stringify(d);
}

export function routeDomainWithLut(input: DomainRoutingInput): DomainRoutingDecision {
  required(input.domain, 'domain');
  required(input.lutRevision, 'lutRevision');
  const entry = input.table[input.domain];
  if (!entry || entry.lutRevision !== input.lutRevision) throw new Error('DOMAIN_LUT_STALE_OR_MISSING');
  if (entry.tokenBudget <= 0 || entry.contextWindow <= 0 || entry.tileWidth <= 0 || entry.residencyPriority < 0) throw new Error('DOMAIN_LUT_ENTRY_INVALID');
  return { domain: input.domain, ...entry };
}

export function domainRoutingCacheKey(input: DomainRoutingInput): string {
  const decision = routeDomainWithLut(input);
  return `atlas:residency:lut:v1:${createHash('sha256').update(canonicalJson({ domain: decision.domain, lutRevision: decision.lutRevision, tokenBudget: decision.tokenBudget, featureMask: decision.featureMask, tileWidth: decision.tileWidth, contextWindow: decision.contextWindow, residencyPriority: decision.residencyPriority })).digest('hex')}`;
}

export function transitionResidency(state: ResidencyState, next: ResidencyState): ResidencyState {
  const allowed: Record<ResidencyState, readonly ResidencyState[]> = {
    EMPTY: ['LOADING'], LOADING: ['RESIDENT', 'FAILED'], RESIDENT: ['IN_USE', 'EVICTION_PENDING', 'FAILED'], IN_USE: ['RESIDENT'], EVICTION_PENDING: ['EVICTED', 'RESIDENT'], EVICTED: ['LOADING'], FAILED: ['LOADING']
  };
  if (!allowed[state].includes(next)) throw new Error(`INVALID_RESIDENCY_TRANSITION_${state}_TO_${next}`);
  return next;
}

export function admitResidency(d: UnifiedResidencyDescriptor, availableBytes: number, reservedHeadroomBytes = DEFAULT_RESERVED_HEADROOM_BYTES): void {
  validateUnifiedDescriptor(d);
  if (d.byteLength > Math.max(0, Math.min(GPU_CEILING_BYTES, availableBytes) - reservedHeadroomBytes)) throw new Error('GPU_RESIDENCY_BUDGET_EXCEEDED');
}

export interface ResidencyAdapterEntry { descriptor: UnifiedResidencyDescriptor; lastUsedAt: number; leaseUntil?: number; }
export class UnifiedResidencyAdapter {
  private readonly entries = new Map<string, ResidencyAdapterEntry>();
  constructor(private readonly ceilingBytes = GPU_CEILING_BYTES, private readonly now = () => Date.now()) {}

  usedBytes(): number { return [...this.entries.values()].filter((e) => ['RESIDENT', 'IN_USE'].includes(e.descriptor.state)).reduce((n, e) => n + e.descriptor.byteLength, 0); }
  admit(descriptor: UnifiedResidencyDescriptor): void {
    admitResidency(descriptor, this.ceilingBytes - this.usedBytes(), 0);
    this.entries.set(descriptor.residencyKey, { descriptor: { ...descriptor, state: 'RESIDENT' }, lastUsedAt: this.now(), leaseUntil: descriptor.leaseUntil });
  }
  async load(descriptor: UnifiedResidencyDescriptor, provider: ResidencyProvider): Promise<UnifiedResidencyDescriptor> {
    validateUnifiedDescriptor(descriptor);
    if (provider.kind !== descriptor.kind) throw new Error('RESIDENCY_PROVIDER_KIND_MISMATCH');
    const loading = { ...descriptor, state: 'LOADING' as const };
    const buffer = await provider.load(loading);
    if (!buffer || buffer.byteLength !== descriptor.byteLength) throw new Error('RESIDENCY_BUFFER_LENGTH_MISMATCH');
    this.admit({ ...descriptor, state: 'RESIDENT' });
    return this.entries.get(descriptor.residencyKey)!.descriptor;
  }
  acquire(key: string): UnifiedResidencyDescriptor {
    const entry = this.entries.get(key);
    if (!entry) throw new Error('RESIDENCY_ENTRY_MISSING');
    if (entry.leaseUntil !== undefined && entry.leaseUntil < this.now()) throw new Error('RESIDENCY_LEASE_EXPIRED');
    entry.lastUsedAt = this.now();
    entry.descriptor = { ...entry.descriptor, state: 'IN_USE' };
    return entry.descriptor;
  }
  release(key: string): void { const entry = this.entries.get(key); if (!entry) throw new Error('RESIDENCY_ENTRY_MISSING'); entry.descriptor = { ...entry.descriptor, state: 'RESIDENT' }; entry.lastUsedAt = this.now(); }
  evictLeastRecentlyUsed(): UnifiedResidencyDescriptor | null {
    const candidate = [...this.entries.values()].filter((e) => e.descriptor.state === 'RESIDENT' && (!e.leaseUntil || e.leaseUntil <= this.now())).sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
    if (!candidate) return null;
    const evicted = { ...candidate.descriptor, state: 'EVICTED' as const };
    this.entries.delete(candidate.descriptor.residencyKey);
    return evicted;
  }
}

export function assertNoPersistedGpuState(value: unknown): void {
  const text = JSON.stringify(value);
  if (/cuda|device.?pointer|gpu.?pointer|tensor|hidden.?state|kv.?cache|cutile/i.test(text)) throw new Error('GPU_STATE_MUST_NOT_BE_PERSISTED');
}
