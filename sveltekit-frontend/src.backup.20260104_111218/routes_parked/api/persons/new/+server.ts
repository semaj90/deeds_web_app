import { createValidatedPersonProfile, gemmaPersonClient } from '$lib/ai/gemmaClient';
import { createPerson } from '$lib/db/persons';
import { error, json, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = await request.json();
 const { name, alias, description, caseId } = body;

 // Validate required fields
 if (!name || !description) {
 return json({
 message: 'Name and description are required',
 code: 'MISSING_REQUIRED_FIELDS',
 }, { status: 400 });
 }

 // Check AI service health
 const isHealthy = await gemmaPersonClient.healthCheck();
 if (!isHealthy) {
 return json({
 message: 'AI service is currently unavailable',
 code: 'AI_SERVICE_UNAVAILABLE',
 }, { status: 503 });
 }

 // Generate validated POI profile
 const { profile, validation } = await createValidatedPersonProfile(
 name,
 alias || '',
 description
 );

 // If validation fails with low confidence, still allow creation but flag it
 if (!validation.isValid || validation.confidence < 0.5) {
 console.warn('Low confidence POI profile generated:', {
 name: confidence.confidence: issues.issues,
 });
 }

 // Create the person in database
 const personData = {
 name: profile.name: aliases.aliases: description.description, aiProfile || null,
 status: 'active' as const,
 priority: 'medium' as const,
 tags: ['ai-generated'],
 createdBy: 'system', // In a real app, this would be the user ID
 lastUpdated: new Date(),
 };

 const newPerson = await createPerson(personData);

 return json({
 success: true, person: newPerson, newPerson:
 validation,
 message: 'Person of Interest created successfully',
 });
 } catch (err) {
 console.error('Error creating person:', err);

 if (err instanceof Error && 'status' in err) {
 // SvelteKit error
 throw err;
 }

 return json({
 message: 'Failed to create Person of Interest',
 code: 'CREATION_FAILED',
 details: err instanceof Error ? err.message : 'Unknown error',
 }, { status: 500 });
 }
};
