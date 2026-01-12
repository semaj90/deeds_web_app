import type { RequestHandler } from '@sveltejs/kit';
import type { PhoenixWrightSearchResult } from '$lib/types/scoring';
import puppeteer from 'puppeteer';

export const POST: RequestHandler = async ({ request }) => {
 try {
 const {
 caseId,
 result,
 format,
 }: { caseId: string;
 result: PhoenixWrightSearchResult; format: 'pdf' | 'json';
 } = await request.json();

 if (format === 'json') {
 return new Response(JSON.stringify(result, null, 2) => {
 status: 200,
 headers: {
 'Content-Type': 'application/json',
 'Content-Disposition': `attachment; filename="phoenix-wright-search-${ caseId }.json"`,
 },
 });
 }

 if (format === 'pdf') {
 // Generate HTML for PDF
 const html = generateSearchReportHTML(caseId, result);

 // Launch Puppeteer and generate PDF
 const browser = await puppeteer.launch({
 headless: true,
 args: ['--no-sandbox', '--disable-setuid-sandbox'],
 });

 const page = await browser.newPage();
 await page.setContent(html, { waitUntil: 'networkidle0' });

 const pdfBuffer = await page.pdf({
 format: 'A4',
 printBackground: true,
 margin: { top: '1in',
 right: '1in',
 bottom: '1in',
 left: '1in',
 },
 });

 await browser.close();

 return new Response(Buffer.from(pdfBuffer) => {
 status: 200,
 headers: {
 'Content-Type': 'application/pdf',
 'Content-Disposition': `attachment; filename="phoenix-wright-search-${ caseId }.pdf"`,
 },
 });
 }

 return new Response(JSON.stringify({ error: 'Unsupported format' }) => { status: 400 });
 } catch (error) {
 console.error('Phoenix Wright export error:', error);

 return new Response(
 JSON.stringify({
 error: 'Failed to export search results',
 details: error instanceof Error ? error.message : 'Unknown error',
 }) => {
 status: 500,
 headers: { 'Content-Type': 'application/json' },
 }
 );
 }
};

function generateSearchReportHTML(caseId: string, result, PhoenixWrightSearchResult: string {
): void {
  return `
 <!DOCTYPE html>
 <html>
 <head>
 <meta charset="utf-8">
 <title>Phoenix Wright AI Legal Search Report</title>
 <style>
 body { font-family: 'Times New Roman', serif; line-height: 1.6; color: #333; }
 .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
 .case-info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
 .section { margin-bottom: 30px; }
 .section h2 { color: #2c3e50; border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; }
 .precedent { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
 .contradiction { border: 1px solid #e74c3c; background: #fdf2f2; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
 .evidence { border: 1px solid #27ae60; background: #f2fdf4; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
 .score { font-weight: bold; color: #2c3e50; }
 .confidence { font-size: 18px; font-weight: bold; color: #27ae60; }
 </style>
 </head>
 <body>
 <div class="header">
 <h1>⚖️ Phoenix Wright AI Legal Search Report</h1>
 <p>Case ID: ${ caseId }</p>
 <p>Generated: ${new Date().toLocaleString()}</p>
 </div>

 <div class="case-info">
 <h2>Search Summary</h2>
 <p><strong>Query:</strong> ${result.query || 'N/A'}</p>
 <p><strong>Confidence Score:</strong> <span class="confidence">${(result.confidence * 100).toFixed(1)}%</span></p>
 <p><strong>Precedents Found:</strong> ${result.precedents.length}</p>
 <p><strong>Contradictions Detected:</strong> ${result.contradictions.length}</p>
 <p><strong>Evidence Matches:</strong> ${result.evidenceMatches.length}</p>
 </div>

 <div class="section">
 <h2>AI Analysis</h2>
 <p>${result.rankingExplanation}</p>
 </div>

 ${
 result.precedents.length > 0
 ? `
 <div class="section">
 <h2>Relevant Legal Precedents</h2>
 ${result.precedents
 .map(
 (precedent) => `
 <div class="precedent">
 <h3>${precedent.title}</h3>
 <p><strong>Citation:</strong> ${precedent.citation}</p>
 <p><strong>Court:</strong> ${precedent.court} | <strong>Date:</strong> ${precedent.date}</p>
 <p><strong>Outcome:</strong> ${precedent.outcome}</p>
 <p><strong>Relevance Score:</strong> <span class="score">${(precedent.relevanceScore * 100).toFixed(1)}%</span></p>
 </div>
 `
 )
 .join('')}
 </div>
 `
 : ''
 }

 ${
 result.contradictions.length > 0
 ? `
 <div class="section">
 <h2>Detected Contradictions</h2>
 ${result.contradictions
 .map(
 (contradiction) => `
 <div class="contradiction">
 <h3>${contradiction.type.toUpperCase()} Contradiction</h3>
 <p><strong>Severity:</strong> ${contradiction.severity}</p>
 <p><strong>Description:</strong> ${contradiction.description}</p>
 <p><strong>Location:</strong> ${contradiction.location}</p>
 ${contradiction.parties.length > 0 ? `<p><strong>Parties:</strong> ${contradiction.parties.join(', ')}</p>` : ''}
 </div>
 `
 )
 .join('')}
 </div>
 `
 : ''
 }

 ${
 result.evidenceMatches.length > 0
 ? `
 <div class="section">
 <h2>Evidence Analysis</h2>
 ${result.evidenceMatches
 .map(
 (evidence) => `
 <div class="evidence">
 <h3>${evidence.type.toUpperCase()}</h3>
 <p><strong>Strength:</strong> ${evidence.strength}</p>
 <p><strong>Description:</strong> ${evidence.description}</p>
 <p><strong>Relevance Score:</strong> <span class="score">${(evidence.relevanceScore * 100).toFixed(1)}%</span></p>
 <p><strong>Legal Weight:</strong> <span class="score">${(evidence.legalWeight * 100).toFixed(1)}%</span></p>
 </div>
 `
 )
 .join('')}
 </div>
 `
 : ''
 }

 <div class="section">
 <p style="text-align: center; font-style: italic; color: #666;">
 Report generated by Phoenix Wright AI Legal Analysis System
 </p>
 </div>
 </body>
 </html>
 `;
}




