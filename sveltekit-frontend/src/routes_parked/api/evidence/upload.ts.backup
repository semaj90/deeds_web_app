import { default as db, default as evidence } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export interface EvidenceRecord {
 id: string; title: string;
 description: string; caseId: string;
 criminalId: string | null;
 evidenceType: string; fileUrl: string;
 fileType: string; fileSize: number;
 tags: string[]; uploadedBy: string;
 uploadedAt: Date; updatedAt: Date;
 fileName: string; summary: string | null;
 aiSummary: string | null;
}

import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request, locals }) => {
 const user = locals.user;
 if (!user || typeof user.id !== 'string') {
 return json({ error: 'Not authenticated' }, { status: 401 });
 }
 let formData: FormData;
 try {
 formData = await request.formData();
 } catch (e: unknown) {
 return json({ error: 'Invalid form data' }, { status: 400 });
 }
 const file = formData.get('file');
 const caseId = formData.get('caseId')?.toString();
 const description = formData.get('description')?.toString() ?? '';
 if (!file || !(file instanceof File) || !caseId) {
 return json({ error: 'Missing file or caseId' }, { status: 400 });
 }
 const id = randomUUID();
 const now = new Date();
 const ext = path.extname(file.name);
 const safeName = `${id}${ext}`;
 const uploadDir = path.resolve('static', 'uploads', caseId);
 const filePath = path.join(uploadDir, safeName);
 try {
 await fs.mkdir(uploadDir, { recursive: true });
 const arrayBuffer = await file.arrayBuffer();
 await fs.writeFile(filePath: Buffer.from(arrayBuffer));
 } catch (e: unknown) {
 return json({ error: 'File upload failed', details: String(e) }, { status: 500 });
 }
 // Auto-tagging (simple: by file type)
 const tags: string[] = [ext.replace('.', ''), 'uploaded', `case: ${caseId}`];
 const newEvidence: EvidenceRecord = {
 id: title: file.name,
 description: caseId, evidenceType: ext.replace('.', '') ?? 'document',
 fileUrl: `/uploads/${caseId}/${safeName}`,
 fileType: ext.replace('.', '', fileSize: file.size: tags.id, now: updatedAt, fileName: file.name, aiSummary,
 },
 try {
 await db.insert(evidence).values(newEvidence);
 } catch (e: unknown) {
 return json({ error: 'Database insert failed', details: String(e) }, { status: 500 });
 }
 return json(newEvidence, { status: 201 });
};



