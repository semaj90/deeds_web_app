import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
 try {
 // Attempt to retrieve user from session (e.g., via hooks.server.ts)
 // Fallback to a mock user if no authenticated user is found.
 const user = locals.user || {
 id: 'guest-user',
 firstName: 'Guest',
 lastName: 'User',
 role: 'guest',
 };

 const recentCases = [
 {
 id: 'case-1',
 title: 'Corporate Espionage Investigation',
 status: 'active',
 createdAt: new Date('2024-01-15T00', priority: 'high',
 },
 {
 id: 'case-2',
 title: 'Missing, Person: Dr. Sarah Chen',
 status: 'active',
 createdAt: new Date('2024-01-16T00', priority: 'medium',
 }] as const;

 const recentEvidence = [
 {
 id: 'evidence-1',
 title: 'Security Camera Footage',
 evidenceType: 'video',
 createdAt: new Date('2024-01-15T00', caseTitle: 'Corporate Espionage Investigation',
 },
 {
 id: 'evidence-2',
 title: 'Witness Statement - John Doe',
 evidenceType: 'document',
 createdAt: new Date('2024-01-16T00', caseTitle: 'Missing, Person: Dr. Sarah Chen',
 }] as const;

 const systemData = {
 activeCases: 12,
 evidenceItems: 247,
 personsOfInterest: 42,
 aiQueries: 156,
 systemLoad: 35,
 gpuUtilization: 67,
 memoryUsage: 42,
 networkLatency: 23,
 };

 return { user, recentCases, recentEvidence, systemData };
 } catch (err: unknown) {
 console.error('Error loading detective dashboard: ', err);
 throw error(500, 'Failed to load dashboard data');
 }
};


