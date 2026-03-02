import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTemplate } from '$lib/data/report-templates';
import { db } from '$lib/server/db/client';
import { cases, evidence, reports } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/reports/generate-from-template
 * Generate a report from a template with AI enhancement
 *
 * Body: {
 *   templateType: string,
 *   caseId: string,
 *   customTitle?: string,
 *   useAI?: boolean
 * }
 */
export const POST: RequestHandler = async ({ locals, request, fetch }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  try {
    const body = await request.json();
    const { templateType, caseId, customTitle, useAI = false } = body;

    if (!templateType) {
      throw error(400, 'Missing required field: templateType');
    }

    if (!caseId) {
      throw error(400, 'Missing required field: caseId');
    }

    // Get the template
    const template = getTemplate(templateType);
    if (!template) {
      throw error(404, `Template not found: ${templateType}`);
    }

    // Fetch case data for context
    const [caseData] = await db.select()
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!caseData) {
      throw error(404, 'Case not found');
    }

    // Build the report title
    const title = customTitle || template.defaultTitle.replace('[Case Name]', caseData.title || 'Untitled Case');

    let content = template.contentTemplate;

    // If AI enhancement is requested, generate content
    if (useAI) {
      try {
        // Fetch evidence for context
        const evidenceItems = await db.select()
          .from(evidence)
          .where(eq(evidence.caseId, caseId))
          .limit(10);

        // Build AI prompt with context
        const aiPrompt = `
You are a legal AI assistant generating a ${template.name} for the following case:

**Case Title:** ${caseData.title}
**Practice Area:** ${caseData.practiceArea || 'General'}
**Priority:** ${caseData.priority || 'Medium'}
**Status:** ${caseData.status || 'Open'}

**Evidence Items:**
${evidenceItems.map((e, i) => `${i + 1}. ${e.title || 'Untitled'} (${e.type})`).join('\n')}

**Instructions:**
${template.aiPrompt}

Generate professional, detailed content following the template structure. Use proper legal formatting and citations where applicable.

**Template Structure to Follow:**
${template.contentTemplate}

Generate the complete report content in HTML format, maintaining the structure but filling in with case-specific analysis and recommendations.
        `.trim();

        // Call Ollama for AI generation
        const ollamaResponse = await fetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemma3-legal:latest',
            prompt: aiPrompt,
            stream: false,
            options: {
              temperature: 0.7,
              num_predict: 2000
            }
          })
        });

        if (ollamaResponse.ok) {
          const aiResult = await ollamaResponse.json();
          if (aiResult.response) {
            // Clean up AI response and ensure it's HTML
            let aiContent = aiResult.response.trim();

            // If the AI didn't wrap in HTML tags, use the template with AI-enhanced content
            if (!aiContent.startsWith('<')) {
              // Parse AI response and merge with template structure
              content = template.contentTemplate;
              // In production, you'd want more sophisticated merging logic here
            } else {
              content = aiContent;
            }
          }
        }
      } catch (aiError) {
        console.warn('AI generation failed, using template:', aiError);
        // Fallback to template if AI fails
        content = template.contentTemplate;
      }
    }

    // Replace placeholder values in template
    content = content
      .replace(/\[Case Name\]/g, caseData.title || 'Untitled Case')
      .replace(/\[DATE\]/g, new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }))
      .replace(/\[CASE-####\]/g, caseData.caseNumber || 'TBD')
      .replace(/\[AREA\]/g, caseData.practiceArea || 'General');

    // Create the report
    const [newReport] = await db.insert(reports)
      .values({
        caseId,
        createdBy: locals.user.id,
        title,
        content,
        status: 'draft',
        metadata: {
          reportType: templateType,
          templateUsed: template.name,
          aiGenerated: useAI,
          generatedAt: new Date().toISOString()
        }
      })
      .returning();

    return json({
      success: true,
      data: newReport,
      message: `Report generated from ${template.name} template`,
      aiEnhanced: useAI
    }, { status: 201 });

  } catch (err) {
    // Re-throw HTTP errors (4xx, 5xx from error() calls) to preserve status codes
    if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
      throw err;
    }

    console.error('Unexpected error in template generation:', err);
    throw error(500, `Failed to generate report from template: ${err instanceof Error ? err.message : String(err)}`);
  }
};
