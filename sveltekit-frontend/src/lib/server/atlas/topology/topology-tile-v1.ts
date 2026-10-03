import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  canonicalCandidateV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';

const revision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const TopologyCoordinateFunctionRevisionsV1Schema = z.object({
  semantic: revision,
  ast: revision,
  graph: revision,
  temporal: revision,
}).strict();

export const TopologyCoordinateSchema = z.object({
  canonicalCandidateId: z.string().min(1),
  candidateRevision: revision,
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  w: z.number().finite(),
}).strict();

export const TopologyBuildInputV1Schema = z.object({
  candidateOrdinalMap: candidateOrdinalMapV1Schema,
  coordinateFunctionRevisions: TopologyCoordinateFunctionRevisionsV1Schema,
  coordinates: z.array(TopologyCoordinateSchema),
  tileSize: z.number().positive().finite(),
}).strict();

export const TopologyTileMemberV1Schema = z.object({
  canonicalCandidateId: z.string().min(1),
  candidateRevision: revision,
}).strict();

export const TopologyTileV1Schema = z.object({
  tileId: z.string().min(1),
  tileCoordinate: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]),
  workspaceRevision: revision,
  candidateSnapshotRevision: revision,
  candidateOrdinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  coordinateFunctionRevisions: TopologyCoordinateFunctionRevisionsV1Schema,
  inputChecksum: revision,
  topologyRevision: revision,
  members: z.array(TopologyTileMemberV1Schema),
  density: z.number().int().min(0),
  canonicalAuthority: z.literal(false),
  projectionState: z.literal('CHALLENGER_ONLY'),
}).strict();

export const TopologyCandidateRefV1Schema = z.object({
  canonicalCandidateId: z.string().min(1),
  candidateRevision: revision,
  candidateSnapshotRevision: revision,
  candidateOrdinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceRevision: revision,
  topologyRevision: revision,
  candidateState: z.literal('CANDIDATE_ONLY'),
  canonicalAuthority: z.literal(false),
}).strict();

export const TopologyCandidateResolutionV1Schema = z.object({
  schema: z.literal('atlas.topology-candidate-resolution.v1'),
  topologyRevision: revision,
  candidateSnapshotRevision: revision,
  candidateOrdinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  candidates: z.array(canonicalCandidateV1Schema),
  resolutionState: z.literal('EXACT_IDENTITY_READBACK_ONLY'),
  retrievalEligibility: z.literal(false),
  identityAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type TopologyCoordinateFunctionRevisionsV1 = z.infer<typeof TopologyCoordinateFunctionRevisionsV1Schema>;
export type TopologyCoordinate = z.infer<typeof TopologyCoordinateSchema>;
export type TopologyTileV1 = z.infer<typeof TopologyTileV1Schema>;
export type TopologyCandidateRefV1 = z.infer<typeof TopologyCandidateRefV1Schema>;
export type TopologyCandidateResolutionV1 = z.infer<typeof TopologyCandidateResolutionV1Schema>;

export interface TopologyTileIndexV1 {
  topologyRevision: string;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  candidateOrdinalMapChecksum: string;
  tileCount: number;
  tilesByCoordinate: ReadonlyMap<string, readonly TopologyTileV1[]>;
}

export class TopologyRevisionError extends Error {}
export class TopologyIdentityError extends Error {}
export class TopologyCandidateResolutionError extends Error {}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stableCoordinates(coords: readonly TopologyCoordinate[]): TopologyCoordinate[] {
  return [...coords].sort((left, right) => left.canonicalCandidateId.localeCompare(right.canonicalCandidateId));
}

export function quantizeTo4DTile(
  coord: { x: number; y: number; z: number; w: number },
  tileSize = 1.0,
): [number, number, number, number] {
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new RangeError('tileSize must be finite and positive');
  return [
    Math.floor(coord.x / tileSize),
    Math.floor(coord.y / tileSize),
    Math.floor(coord.z / tileSize),
    Math.floor(coord.w / tileSize),
  ];
}

export function buildTopologyTiles(input: z.input<typeof TopologyBuildInputV1Schema>): TopologyTileV1[] {
  const parsed = TopologyBuildInputV1Schema.parse(input);
  const candidateOrdinalMap: CandidateOrdinalMapV1 = candidateOrdinalMapV1Schema.parse(parsed.candidateOrdinalMap);
  assertCandidateOrdinalMapIntegrityV1(candidateOrdinalMap);
  const coords = stableCoordinates(parsed.coordinates);
  const seenCandidateIds = new Set<string>();
  for (const coord of coords) {
    if (seenCandidateIds.has(coord.canonicalCandidateId)) {
      throw new TopologyIdentityError(`duplicate canonical candidate identity: ${coord.canonicalCandidateId}`);
    }
    seenCandidateIds.add(coord.canonicalCandidateId);
    const canonicalCandidate = candidateOrdinalMap.candidates.find((candidate) => candidate.canonicalId === coord.canonicalCandidateId);
    if (!canonicalCandidate) throw new TopologyIdentityError(`candidate is absent from canonical ordinal map: ${coord.canonicalCandidateId}`);
    if (canonicalCandidate.sourceRevision !== coord.candidateRevision) {
      throw new TopologyRevisionError(`candidate source revision mismatch: ${coord.canonicalCandidateId}`);
    }
  }

  const inputChecksum = sha256(JSON.stringify(coords));
  const topologyRevision = sha256(JSON.stringify({
    schema: 'atlas.topology-tile.v1',
    workspaceRevision: candidateOrdinalMap.workspaceRevision,
    candidateSnapshotRevision: candidateOrdinalMap.candidateSnapshotRevision,
    candidateOrdinalMapChecksum: candidateOrdinalMap.ordinalMapChecksum,
    coordinateFunctionRevisions: parsed.coordinateFunctionRevisions,
    inputChecksum,
    tileSize: parsed.tileSize,
  }));
  const tileMap = new Map<string, { tileCoordinate: [number, number, number, number]; members: TopologyTileV1['members'] }>();

  for (const coord of coords) {
    const tileCoordinate = quantizeTo4DTile(coord, parsed.tileSize);
    const key = tileCoordinate.join(',');
    const member = {
      canonicalCandidateId: coord.canonicalCandidateId,
      candidateRevision: coord.candidateRevision,
    };
    const existing = tileMap.get(key);
    if (existing) existing.members.push(member);
    else tileMap.set(key, { tileCoordinate, members: [member] });
  }

  const tiles: TopologyTileV1[] = [];
  for (const [key, value] of tileMap.entries()) {
    const members = value.members.sort((left, right) => left.canonicalCandidateId.localeCompare(right.canonicalCandidateId));
    tiles.push(TopologyTileV1Schema.parse({
      tileId: `tile:4d:${key}`,
      tileCoordinate: value.tileCoordinate,
      workspaceRevision: candidateOrdinalMap.workspaceRevision,
      candidateSnapshotRevision: candidateOrdinalMap.candidateSnapshotRevision,
      candidateOrdinalMapChecksum: candidateOrdinalMap.ordinalMapChecksum,
      coordinateFunctionRevisions: parsed.coordinateFunctionRevisions,
      inputChecksum,
      topologyRevision,
      members,
      density: members.length,
      canonicalAuthority: false,
      projectionState: 'CHALLENGER_ONLY',
    }));
  }
  return tiles.sort((left, right) => left.tileId.localeCompare(right.tileId));
}

export function buildTopologyTileIndexV1(tiles: readonly TopologyTileV1[]): TopologyTileIndexV1 {
  const parsedTiles = tiles.map((tile) => TopologyTileV1Schema.parse(tile));
  const firstTile = parsedTiles[0];
  if (!firstTile) throw new TopologyIdentityError('cannot index an empty topology tile set');

  const tilesByCoordinate = new Map<string, TopologyTileV1[]>();
  for (const tile of parsedTiles) {
    if (
      tile.topologyRevision !== firstTile.topologyRevision ||
      tile.workspaceRevision !== firstTile.workspaceRevision ||
      tile.candidateSnapshotRevision !== firstTile.candidateSnapshotRevision ||
      tile.candidateOrdinalMapChecksum !== firstTile.candidateOrdinalMapChecksum
    ) {
      throw new TopologyRevisionError('topology tile index cannot mix revisions or candidate maps');
    }
    const key = tile.tileCoordinate.join(',');
    const bucket = tilesByCoordinate.get(key);
    if (bucket) bucket.push(tile);
    else tilesByCoordinate.set(key, [tile]);
  }

  return {
    topologyRevision: firstTile.topologyRevision,
    workspaceRevision: firstTile.workspaceRevision,
    candidateSnapshotRevision: firstTile.candidateSnapshotRevision,
    candidateOrdinalMapChecksum: firstTile.candidateOrdinalMapChecksum,
    tileCount: parsedTiles.length,
    tilesByCoordinate,
  };
}

export function queryNearbyTileCandidates(
  queryCoord: { x: number; y: number; z: number; w: number },
  tileIndex: TopologyTileIndexV1,
  input: { expectedTopologyRevision: string; radius?: number; tileSize?: number; maxCandidates?: number },
): TopologyCandidateRefV1[] {
  const expectedRevision = revision.parse(input.expectedTopologyRevision);
  const radius = input.radius ?? 1;
  const maxCandidates = input.maxCandidates ?? 4096;
  if (!Number.isInteger(radius) || radius < 0) throw new RangeError('radius must be a nonnegative integer');
  const tileCoordinatesToProbe = (radius * 2 + 1) ** 4;
  if (tileCoordinatesToProbe > 65_536) throw new RangeError('topology tile lookup exceeds 65536 coordinate probes');
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 4096) {
    throw new RangeError('maxCandidates must be an integer in 1..4096');
  }
  if (tileIndex.topologyRevision !== expectedRevision) throw new TopologyRevisionError('stale topology tile index revision');
  const candidateMap = new Map<string, TopologyCandidateRefV1>();
  const center = quantizeTo4DTile(queryCoord, input.tileSize ?? 1.0);
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dw = -radius; dw <= radius; dw += 1) {
          const key = [center[0] + dx, center[1] + dy, center[2] + dz, center[3] + dw].join(',');
          for (const tile of tileIndex.tilesByCoordinate.get(key) ?? []) {
            for (const member of tile.members) {
              const candidate = TopologyCandidateRefV1Schema.parse({
                ...member,
                candidateSnapshotRevision: tile.candidateSnapshotRevision,
                candidateOrdinalMapChecksum: tile.candidateOrdinalMapChecksum,
                workspaceRevision: tile.workspaceRevision,
                topologyRevision: tile.topologyRevision,
                candidateState: 'CANDIDATE_ONLY',
                canonicalAuthority: false,
              });
              candidateMap.set(candidate.canonicalCandidateId, candidate);
            }
          }
        }
      }
    }
  }

  if (candidateMap.size > maxCandidates) throw new RangeError(`topology shortlist exceeds maxCandidates ${maxCandidates}`);
  return [...candidateMap.values()].sort((left, right) => left.canonicalCandidateId.localeCompare(right.canonicalCandidateId));
}

export function resolveTopologyCandidatesAgainstCanonicalMapV1(input: {
  candidates: readonly TopologyCandidateRefV1[];
  candidateOrdinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
}): TopologyCandidateResolutionV1 {
  const candidateOrdinalMap: CandidateOrdinalMapV1 = candidateOrdinalMapV1Schema.parse(input.candidateOrdinalMap);
  assertCandidateOrdinalMapIntegrityV1(candidateOrdinalMap);
  const seen = new Set<string>();
  const candidates = input.candidates.map((candidateInput) => {
    const candidate = TopologyCandidateRefV1Schema.parse(candidateInput);
    if (seen.has(candidate.canonicalCandidateId)) {
      throw new TopologyIdentityError(`duplicate topology candidate: ${candidate.canonicalCandidateId}`);
    }
    seen.add(candidate.canonicalCandidateId);
    if (candidate.candidateSnapshotRevision !== candidateOrdinalMap.candidateSnapshotRevision
      || candidate.candidateOrdinalMapChecksum !== candidateOrdinalMap.ordinalMapChecksum
      || candidate.workspaceRevision !== candidateOrdinalMap.workspaceRevision) {
      throw new TopologyCandidateResolutionError('topology shortlist does not match canonical candidate population revision');
    }
    const resolved = candidateOrdinalMap.candidates.find((row) => row.canonicalId === candidate.canonicalCandidateId);
    if (!resolved) throw new TopologyIdentityError(`topology candidate is absent from canonical map: ${candidate.canonicalCandidateId}`);
    if (resolved.sourceRevision !== candidate.candidateRevision) {
      throw new TopologyRevisionError(`topology candidate source revision is stale: ${candidate.canonicalCandidateId}`);
    }
    return resolved;
  }).sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));

  if (new Set(input.candidates.map((candidate) => candidate.topologyRevision)).size > 1) {
    throw new TopologyRevisionError('topology shortlist mixes topology revisions');
  }
  const topologyRevision = input.candidates[0]?.topologyRevision;
  if (!topologyRevision) throw new TopologyCandidateResolutionError('topology shortlist is empty');
  return TopologyCandidateResolutionV1Schema.parse({
    schema: 'atlas.topology-candidate-resolution.v1',
    topologyRevision,
    candidateSnapshotRevision: candidateOrdinalMap.candidateSnapshotRevision,
    candidateOrdinalMapChecksum: candidateOrdinalMap.ordinalMapChecksum,
    candidates,
    resolutionState: 'EXACT_IDENTITY_READBACK_ONLY',
    retrievalEligibility: false,
    identityAuthority: false,
    writesPerformed: false,
  });
}
