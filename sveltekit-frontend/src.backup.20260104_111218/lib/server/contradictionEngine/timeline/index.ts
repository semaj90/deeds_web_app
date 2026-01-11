import type { FactCluster } from '../types.js';
import { extractTimelineFacts } from './extractTimelineFacts.js';
import { normalizeTimelineFacts } from './normalizeTime.js';
import { solveTimelineContradictions } from './solver.js';
import { describeTimelineContradictions } from './contradictions.js';

export function analyzeTimeline(clusters: FactCluster[]) {
 const extracted = extractTimelineFacts(clusters);
 const normalized = normalizeTimelineFacts(extracted);
 const contradictions = solveTimelineContradictions(normalized);
 const descriptions = describeTimelineContradictions(contradictions);

 return {
  timelineFacts: normalized, timelineContradictions: contradictions, timelineDescriptions, descriptions,
  };
}
