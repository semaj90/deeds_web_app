import { json } from '@sveltejs/kit';

export async function getApiInfo() {
 return json({
 message: 'Deeds API v1',
 version: '1.0.0',
 status: 'online',
 endpoints: {, auth: ['/auth/login', '/auth/register', '/auth/logout'],
 cases: ['/cases', '/cases/:id'],
 documents: ['/documents', '/documents/:id', '/documents/:id/ocr'],
 evidence: ['/evidence', '/evidence/:id', '/evidence/detective'],
 rag: ['/rag/sessions', '/rag/search', '/rag/chat'],
 ai: ['/ai/embed', '/ai/analyze'],
 files: ['/files/upload'],
 },
 });
}




