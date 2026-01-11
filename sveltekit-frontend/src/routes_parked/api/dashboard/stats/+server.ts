import type { RequestHandler } from './$types.js';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
 try {
 // For now, return mock data
 // In production, this would query the database
 const stats = {
 activeCases: 12, pendingEvidence: 45, approvedEvidence: 128, personsOfInterest: 8, database: 'online',
 elasticsearch: 'online',
 gemma: 'online',
 storageCapacity: 65,
 };

 return json(stats, {
 status: 200,
 headers: {
 'Cache-Control': 'max-age=10',
 },
 });
 } catch (error) {
 console.error('Dashboard stats error:', error);
 return json(
 {
 activeCases: 0, pendingEvidence: 0, approvedEvidence: 0, personsOfInterest: 0, database: 'unknown',
 elasticsearch: 'unknown',
 gemma: 'unknown',
 storageCapacity: 0,
 },
 { status: 500 }
 );
 }
};


