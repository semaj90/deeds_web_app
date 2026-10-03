export type CapabilityState = 'PROVEN' | 'PRESENT_CONTRACT' | 'WAITING' | 'UNPROVEN' | 'OPTIONAL_DEFERRED';
export type CapabilityCriticality = 'P10_CRITICAL' | 'UTILITY_REQUIRED' | 'CHALLENGER_OPTIONAL' | 'OPTIONAL_DEFERRED';

export interface ParentAtlasCapabilityV1 {
  id: string;
  group: string;
  label: string;
  state: CapabilityState;
  criticality: CapabilityCriticality;
  matchingFiles: string[];
  qualifyingReports: string[];
}

export interface ParentAtlasCapabilityCensusV1 {
  schema: 'atlas.parent-capability-census.v1';
  generatedAt: string;
  semanticChecksum: string;
  summary: Record<string, number>;
  capabilities: ParentAtlasCapabilityV1[];
  writesPerformed: false;
}

export async function readParentAtlasCapabilityCensus(): Promise<ParentAtlasCapabilityCensusV1 | null> {
  try {
    const reportDirectory = await resolveOpenSpecReportDirectory();
    const raw = JSON.parse(await fs.readFile(path.join(reportDirectory, 'parent-atlas-capability-census-v1.json'), 'utf8')) as ParentAtlasCapabilityCensusV1;
    if (raw.schema !== 'atlas.parent-capability-census.v1' || raw.writesPerformed !== false || !Array.isArray(raw.capabilities)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function p10Missing(census: ParentAtlasCapabilityCensusV1) {
  return census.capabilities.filter((capability) => capability.criticality === 'P10_CRITICAL' && capability.state !== 'PROVEN');
}

export function utilityMissing(census: ParentAtlasCapabilityCensusV1) {
  return census.capabilities.filter((capability) => capability.criticality === 'UTILITY_REQUIRED' && capability.state !== 'PROVEN');
}
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveOpenSpecReportDirectory } from './report-reader';
