import type { AtlasControlPacketV1 } from '../transport';
import type { ContextManifestV1 } from '../context-manifest';

export interface AtlasWarmHintV1 {
  bucketKeys: string[];
  promptPrefixKey?: string | null;
  evidenceRefs: string[];
}

export interface AcePacketDraftV1 {
  schema: 'atlas.ace-packet-draft.v1';
  control: AtlasControlPacketV1;
  packetKey: string;
  symbolVersionId?: string | null;
  canonicalIds: string[];
  contextManifestRequestId?: string;
  warmHints: AtlasWarmHintV1;
  authority: 'DRAFT_ONLY';
}

export interface AcePrefillReadinessV1 {
  ready: boolean;
  blockers: string[];
  checks: {
    workspaceRevision: boolean;
    sourceRevision: boolean;
    canonicalIds: boolean;
    contextManifest: boolean;
    evidenceRefs: boolean;
  };
}

export function assessAcePrefillReadiness(input: {
  packet: AcePacketDraftV1;
  contextManifest?: ContextManifestV1 | null;
}): AcePrefillReadinessV1 {
  const revisions = input.packet.control.revisions as Record<string, unknown>;
  const checks = {
    workspaceRevision: typeof revisions.workspace === 'string' && revisions.workspace.length > 0,
    sourceRevision: typeof revisions.source === 'string' && revisions.source.length > 0,
    canonicalIds: Boolean(input.packet.packetKey) && input.packet.canonicalIds.length > 0,
    contextManifest: Boolean(input.contextManifest && input.contextManifest.requestId === input.packet.control.requestId),
    evidenceRefs: input.packet.warmHints.evidenceRefs.length > 0
  };
  const blockers = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => `MISSING_${key.toUpperCase()}`);
  return { ready: blockers.length === 0, blockers, checks };
}
