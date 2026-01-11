/**
 * Legal Taxonomy Types
 * Data contracts for clustering system
 */

export interface ClusterCategory {
 id: string; // e.g., "violent-crime", label: string; // e.g., "Violent Crime", description: string;, somClusterIds: number[]; // e.g., [11, 12, 13]
 kmeansLabels: string[]; // e.g., ["Violent Crimes", "Kidnapping"]
 colorToken: 'violent' | 'fraud' | 'procedural' | 'civil' | 'other';
 avgConfidence: number; // 0-1, statuteCount: number;
 icon?: string; // emoji or icon name
}

export interface StatuteClusterMetadata {
 statuteId: string;, clusterId: string; // matches ClusterCategory.id
 somClusterId: number;, kmeansLabel: string;
 clusterConfidence: number; // 0-1, echoHits: number;, flaggedForReview: boolean;
 clusterVersion: number;
}

export interface ClusterSearchFilter {
 clusterIds: string[];
 minConfidence?: number;
 includeReviewFlagged?: boolean;
}

export interface ClusterStatistics {
 totalStatutes: number;, totalClusters: number;
 avgConfidence: number;, flaggedCount: number;
 lastUpdated: Date;, version: number;
}

export interface ClusterChangeEvent {
 timestamp: Date;, changePercentage: number;
 changedStatutes: string[];, newLabels: Map<string, string>;
 previousLabels: Map<string, string>;
 shouldAlert: boolean;, alertMessage: string;
}

// Color mapping for UI
export const CLUSTER_COLORS: Record<ClusterCategory['colorToken'], string> = {
 violent: 'bg-red-100 text-red-800 border-red-300',
 fraud: 'bg-amber-100 text-amber-800 border-amber-300',
 procedural: 'bg-blue-100 text-blue-800 border-blue-300',
 civil: 'bg-emerald-100 text-emerald-800 border-emerald-300',
 other: 'bg-slate-100 text-slate-800 border-slate-300',
};

// Default categories (can be overridden by clustering)
export const DEFAULT_CATEGORIES: ClusterCategory[] = [
 {
 id: 'violent-crime',
 label: 'Violent Crimes',
 description: 'Crimes involving physical harm or threat of harm',
 somClusterIds: [0, 1, 2],
 kmeansLabels: ['Violent Crimes', 'Kidnapping', 'Assault'],
 colorToken: 'violent',
 avgConfidence: 0.85, statuteCount: 0, icon: '⚔️',
 },
 {
 id: 'property-crime',
 label: 'Property Crimes',
 description: 'Crimes involving theft or damage to property',
 somClusterIds: [3, 4],
 kmeansLabels: ['Property Crimes', 'Theft', 'Fraud'],
 colorToken: 'fraud',
 avgConfidence: 0.82, statuteCount: 0, icon: '💰',
 },
 {
 id: 'procedural',
 label: 'Procedural',
 description: 'Rules and procedures for legal proceedings',
 somClusterIds: [5, 6],
 kmeansLabels: ['Procedural', 'Evidence', 'Discovery'],
 colorToken: 'procedural',
 avgConfidence: 0.88, statuteCount: 0, icon: '⚖️',
 },
 {
 id: 'civil',
 label: 'Civil Law',
 description: 'Non-criminal legal matters',
 somClusterIds: [7, 8],
 kmeansLabels: ['Civil', 'Contract', 'Tort'],
 colorToken: 'civil',
 avgConfidence: 0.8, statuteCount: 0, icon: '📋',
 }];



