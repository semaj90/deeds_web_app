import type {
  FactContradiction,
  UIContradiction,
  TimelineContradiction
} from '$lib/server/contradictionEngine';
import { broadcastEvidenceUpdate } from './socketManager';

type Contradiction =
  | FactContradiction
  | UIContradiction
  | TimelineContradiction;

interface EvidenceBoard {
  addLink(link: EvidenceLink): void;
}

interface EvidenceLink {
  from?: string;
  to?: string;
  color: string;
  label: string;
  intensity?: 'low' | 'medium' | 'high';
}

const CONTRADICTION_COLOR: Record<string, string> = {
  'impossible-presence': '#ff3b30',
  'order-violation': '#ffd60a',
  'alibi-failure': '#0a84ff',
  'duration-contradiction': '#bf5af2',
  default: '#ec4899'
};

function resolveColor(type?: string): string {
  if (!type) return CONTRADICTION_COLOR.default;
  return CONTRADICTION_COLOR[type] ?? CONTRADICTION_COLOR.default;
}

function resolveLabel(type?: string): string {
  return type ? type.replace(/-/g, ' ').toUpperCase() : 'CONTRADICTION';
}

function linkEndpoints(entry: Contradiction): { from?: string; to?: string } {
  if ('first' in entry && 'second' in entry) {
    return {
      from: entry.first?.raw?.rawId ?? entry.first?.raw?.actor,
      to: entry.second?.raw?.rawId ?? entry.second?.raw?.actor
    };
  }

  if ('a' in entry && 'b' in entry) {
    return { from: entry.a?.rawId, to: entry.b?.rawId };
  }

  return { from: entry.details?.actual?.route, to: entry.details?.expected?.route };
}

export function autoLinkContradictions(
  board: EvidenceBoard,
  contradictions: Contradiction[]
): void {
  for (const contradiction of contradictions) {
    const { from, to } = linkEndpoints(contradiction);
    board.addLink({
      from,
      to,
      color: resolveColor((contradiction as any).type),
      label: resolveLabel((contradiction as any).type),
      intensity: 'high'
    });
  }

  if (contradictions.length) {
    broadcastEvidenceUpdate({
      type: 'contradiction-links',
      count: contradictions.length,
      timestamp: Date.now()
    });
  }
}
