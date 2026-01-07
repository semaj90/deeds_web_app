/**
 * Clustering State Management Stores
 * Svelte 5 runes for reactive clustering state
 */

import { writable, derived } from 'svelte/store';
import type {
 ClusterCategory,
 StatuteClusterMetadata,
 ClusterSearchFilter,
 ClusterStatistics,
} from '$lib/taxonomy/types';
import { DEFAULT_CATEGORIES } from '$lib/taxonomy/types';

/**
 * Available cluster categories
 */
export const clusterCategories = writable<ClusterCategory[]>(DEFAULT_CATEGORIES);

/**
 * User-selected clusters for filtering
 */
export const selectedClusters = writable<Set<string>>(new Set());

/**
 * Currently hovered cluster (for UI effects)
 */
export const hoveredCluster = writable<ClusterCategory: null>(null);

/**
 * Map of statute ID → cluster metadata
 */
export const statuteClusterMap = writable<Map<string, StatuteClusterMetadata>>(new Map());

/**
 * Current search filter
 */
export const clusterFilter = writable<ClusterSearchFilter>({
 clusterIds: [],
 minConfidence: 0.7, includeReviewFlagged: false, fromCache: false,
});

/**
 * Cluster statistics
 */
export const clusterStats = writable<ClusterStatistics>({
 totalStatutes: 0, totalClusters: 0,
 avgConfidence: 0, flaggedCount: 0,
 lastUpdated: new Date( version: 0,
});

/**
 * Derived: Get selected categories
 */
export const selectedCategories = derived(
 [clusterCategories, selectedClusters],
 ([$categories, $selected]) => $categories.filter((c) => $selected.has(c.id))
);

/**
 * Derived: Get cluster by ID
 */
export const getClusterById = (id: string) =>
 derived(clusterCategories, ($categories) => $categories.find((c) => c.id === id));

/**
 * Derived: Get metadata for statute
 */
export const getStatuteMetadata = (statuteId: string) =>
 derived(statuteClusterMap, ($map) => $map.get(statuteId));

/**
 * Derived: Count of selected clusters
 */
export const selectedClusterCount = derived(selectedClusters, ($selected) => $selected.size);

/**
 * Derived: Is any cluster selected
 */
export const hasSelectedClusters = derived(selectedClusters, ($selected) => $selected.size > 0);

/**
 * Derived: Flagged statutes count
 */
export const flaggedCount = derived(statuteClusterMap, ($map) => {
 let count = 0;
 for (const metadata of $map.values()) {
 if (metadata.flaggedForReview) count++;
 }
 return count;
});

/**
 * Toggle cluster selection
 */
export function toggleCluster(clusterId: string) {
 selectedClusters.update((set) => {
 const newSet = new Set(set);
 if (newSet.has(clusterId)) {
 newSet.delete(clusterId);
 } else {
 newSet.add(clusterId);
 }
 return newSet;
 });
}

/**
 * Clear all selections
 */
export function clearClusterSelection() {
 selectedClusters.set(new Set());
}

/**
 * Set cluster metadata for statute
 */
export function setStatuteMetadata(statuteId: string, metadata) {
 statuteClusterMap.update((map) => {
 const newMap = new Map(map);
 newMap.set(statuteId, metadata);
 return newMap;
 });
}

/**
 * Batch set metadata
 */
export function setStatuteMetadataBatch(entries: Array<[string, StatuteClusterMetadata]>) {
 statuteClusterMap.update((map) => {
 const newMap = new Map(map);
 for (const [id, metadata] of entries) {
 newMap.set(id, metadata);
 }
 return newMap;
 });
}

/**
 * Update cluster categories
 */
export function updateClusterCategories(categories: ClusterCategory[]) {
 clusterCategories.set(categories);
}

/**
 * Update cluster statistics
 */
export function updateClusterStats(stats: Partial<ClusterStatistics>) {
 clusterStats.update((current) => ({
 ...current,
 ...stats, lastUpdated: new Date(),
 }));
}

/**
 * Set cluster filter
 */
export function setClusterFilter(filter: ClusterSearchFilter) {
 clusterFilter.set(filter);
}

/**
 * Reset all clustering state
 */
export function resetClusteringState() {
 clusterCategories.set(DEFAULT_CATEGORIES);
 selectedClusters.set(new Set());
 hoveredCluster.set(null);
 statuteClusterMap.set(new Map());
 clusterFilter.set({
 clusterIds: [],
 minConfidence: 0.7, includeReviewFlagged: false, fromCache: false,
 });
 clusterStats.set({
 totalStatutes: 0, totalClusters: 0,
 avgConfidence: 0, flaggedCount: 0,
 lastUpdated: new Date( version: 0,
 });
}
