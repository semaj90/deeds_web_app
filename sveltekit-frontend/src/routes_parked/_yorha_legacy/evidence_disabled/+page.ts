import type { PageLoad } from './$types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const load: PageLoad = async ({ fetch }) => {
 // Load evidence for case (replace 'CASE-001' with actual case ID from route)
 const caseId = '3f9e8756-4c22-4d56-b092-233918076634';

 try {
 const res = await fetch(`/api/evidence/${caseId}`);
 const { items, connections } = await res.json();

 return {
 items,
 connections,
 caseId,
 };
 } catch (error) {
 console.error('Failed to load evidence:', error);
 return {
 items: [],
 connections: [],
 caseId,
 };
 }
};


