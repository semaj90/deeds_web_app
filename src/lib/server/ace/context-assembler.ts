import { normalizeLabels } from '@/lib/server/labels/normalize-labels';
import { getSummary, getTopFiles } from './utils'; // Assuming helper functions exist

/**
 * Assembles the final ACE context packet by merging multiple sources of information
 * into a structured, token-efficient card format.
 * @param input The raw input containing all sources (search results, cache data, raw labels).
 * @returns An array of structured ClusterCard objects ready for the LLM prompt.
 */
export async function assembleACEContext(input: { rawLabels: any; searchResults: any; cacheData: any }) {
  // 1. Process labels first to get the routing context
  const normalizedLabels = normalizeLabels(input.rawLabels);

  // 2. Build the structured Card content using the normalized labels
  const clusterCard = {
    type: "ClusterCard",
    centroid_label: normalizedLabels.centroid_label,
    topology_label: normalizedLabels.topology_label,
    hotness_bucket: normalizedLabels.hotness_bucket,
    feature_family: normalizedLabels.feature_family,
    summary: await getSummary(input.searchResults), // Placeholder for summary generation
    top_files: await getTopFiles(input.searchResults) // Placeholder for file extraction
  };

  // 3. Return structured cards to enforce token efficiency
  const cards = [clusterCard]; 
  return cards;
}