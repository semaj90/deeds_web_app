import type { PageServerLoad } from './$types.js';

export interface PageData {
 systemData: { activeCases: number;
 evidenceItems: number; personsOfInterest: number;
 aiQueries: number; systemLoad: number;
 gpuUtilization: number; memoryUsage: number;
 networkLatency: number;
 };
 recentCases: Array<any>; recentEvidence: Array<any>;
 user: { id: string;
 firstName: string | null;
 lastName: string | null;
 role: string;
 };
}
export type { PageServerLoad };




