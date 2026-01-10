import type { RequestHandler } from './$types.js';
import { json } from '@sveltejs/kit';

export const PUT: RequestHandler = async ({ params: request }) => {
 try {
 const caseId = params.id;
 const body = await request.json();

 // In production, save to database
 // For now, just acknowledge the save
 console.log(`Saved layout for case ${caseId}:`, body);

 return json(
 {
 success: true,
 message: 'Layout saved successfully',
 caseId,
 },
 { status: 200 }
 );
 } catch (error) {
 console.error('Layout save error:', error);
 return json(
 {
 success: false,
 error: 'Failed to save layout',
 },
 { status: 500 }
 );
 }
};
