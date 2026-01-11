// Production API endpoints for Enhanced Legal Upload Analytics
// Integrates with Ollama, Drizzle ORM, Lucia Auth, and pgvector

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/database';
import { documents, cases, users, embeddings } from '$lib/server/database/schema';
import { validateAuthSession } from '$lib/server/auth';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';

// Ollama AI Analysis Endpoint
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Validate authentication
    const session = await validateAuthSession(request);
    if (!session) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const caseId = formData.get('caseId') as string;
    const legalContext = JSON.parse(formData.get('legalContext') as string || '{}');
    const model = formData.get('model') as string || 'gemma3:270m';
    const analysisType = formData.get('analysisType') as string || 'comprehensive_legal';

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    // Generate unique document ID and hash
    const documentId = nanoid();
    const buffer = await file.arrayBuffer();
    const hash = createHash('sha256').update(Buffer.from(buffer)).digest('hex');

    // Extract text content based on file type
    let textContent = '';
    try {
      if (file.type === 'application/pdf') {
        // PDF text extraction (you'd implement this with pdf-parse or similar)
        textContent = await extractPDFText(buffer);
      } else if (file.type.startsWith('text/')) {
        textContent = new TextDecoder().decode(buffer);
      } else if (file.type.startsWith('image/')) {
        // OCR for images (implement with Tesseract.js or similar)
        textContent = await performOCR(buffer);
      }
    } catch (error) {
      console.warn('Text extraction failed:', error);
      textContent = `[Unable to extract text from ${file.type}]`;
    }

    // Enhanced legal analysis prompt
    const legalAnalysisPrompt = `
You are an expert legal AI assistant analyzing documents for evidence and legal relevance.

Document: ${file.name}
Case Context: ${JSON.stringify(legalContext)}
Practice Area: ${legalContext.practiceArea || 'General'}
Urgency: ${legalContext.urgency || 'Medium'}

Please analyze this document and provide:
1. A comprehensive summary
2. Key legal entities (people, organizations, dates, monetary amounts)
3. Legal citations or references
4. Evidence type classification
5. Privilege assessment (attorney-client, work product, etc.)
6. Redaction requirements for PII/sensitive data
7. Relevance score (0-1) for the case
8. Risk factors or ethical concerns
9. Suggested evidence tags/categories

Document content:
${textContent.slice(0, 8000)} ${textContent.length > 8000 ? '...[truncated]' : ''}

Respond in JSON format with the following structure:
{
  "summary": "string",
  "entities": [{"type": "person|organization|date|money|legal_term", "value": "string", "confidence": 0.0-1.0}],
  "citations": [{"type": "case|statute|regulation", "citation": "string", "relevance": 0.0-1.0}],
  "evidenceType": "contract|correspondence|pleading|discovery|expert_report|other",
  "privileged": boolean,
  "needsRedaction": boolean,
  "relevanceScore": 0.0-1.0,
  "riskFactors": ["string"],
  "suggestedTags": ["string"],
  "confidence": 0.0-1.0
}`;

    // Call Ollama API
    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: legalAnalysisPrompt,
        format: 'json',
        stream: false,
        options: {
          temperature: 0.3, // Lower temperature for more consistent legal analysis
          top_p: 0.9,
          num_ctx: 4096
        }
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama API error: ${ollamaResponse.statusText}`);
    }

    const ollamaResult = await ollamaResponse.json();
    let analysisResult;

    try {
      analysisResult = JSON.parse(ollamaResult.response);
    } catch (error) {
      // Fallback if JSON parsing fails
      analysisResult = {
        summary: ollamaResult.response.slice(0, 500),
        entities: [],
        citations: [],
        evidenceType: 'other',
        privileged: false,
        needsRedaction: false,
        relevanceScore: 0.5,
        riskFactors: [],
        suggestedTags: ['legal_document'],
        confidence: 0.6
      };
    }

    // Store document in database
    await db.insert(documents).values({
      id: documentId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      hash: hash,
      caseId: caseId || null,
      userId: session.userId,
      textContent: textContent.slice(0, 50000), // Store up to 50k chars
      aiAnalysis: analysisResult,
      uploadedAt: new Date(),
      metadata: {
        legalContext,
        analysisModel: model,
        analysisType,
        chainOfCustody: [{
          timestamp: new Date().toISOString(),
          actor: session.userId,
          action: 'uploaded_and_analyzed',
          details: `Analyzed with ${model} at ${analysisResult.confidence * 100}% confidence`
        }]
      }
    });

    // Generate and store vector embeddings for semantic search
    if (textContent.length > 0) {
      try {
        const embeddingResponse = await fetch('http://localhost:11434/api/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'mxbai-embed-large', // Use a good embedding model
            prompt: textContent.slice(0, 2000) // Truncate for embedding
          })
        });

        if (embeddingResponse.ok) {
          const embeddingResult = await embeddingResponse.json();

          await db.insert(embeddings).values({
            id: nanoid(),
            documentId: documentId,
            embedding: embeddingResult.embedding,
            content: textContent.slice(0, 2000),
            metadata: {
              model: 'mxbai-embed-large',
              createdAt: new Date().toISOString()
            }
          });
        }
      } catch (embeddingError) {
        console.warn('Failed to generate embeddings:', embeddingError);
      }
    }

    return json({
      documentId,
      hash,
      summary: analysisResult.summary,
      entities: analysisResult.entities,
      citations: analysisResult.citations,
      evidenceType: analysisResult.evidenceType,
      privileged: analysisResult.privileged,
      needsRedaction: analysisResult.needsRedaction,
      relevanceScore: analysisResult.relevanceScore,
      riskFactors: analysisResult.riskFactors,
      tags: analysisResult.suggestedTags,
      confidence: analysisResult.confidence
    });

  } catch (error) {
    console.error('Legal document analysis error:', error);
    return json({ error: 'Analysis failed' }, { status: 500 });
  }
};

// Helper functions (you would implement these based on your needs)
async function extractPDFText(buffer: ArrayBuffer): Promise<string> {
  // Implement PDF text extraction
  // You could use pdf-parse, pdf2pic, or similar libraries
  return '[PDF text extraction not implemented]';
}

async function performOCR(buffer: ArrayBuffer): Promise<string> {
  // Implement OCR for images
  // You could use Tesseract.js or similar
  return '[OCR not implemented]';
}
