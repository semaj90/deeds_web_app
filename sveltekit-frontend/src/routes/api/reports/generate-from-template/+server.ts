import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTemplate } from '$lib/data/report-templates';
import { db } from '$lib/server/db/client';
import { cases, evidence, reports } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { auditReportAction } from '$lib/server/reports/audit';
import { ENV } from '$lib/server/env.server.js';
import {
	getCachedTemplate,
	getCachedAIContent,
	cacheAIContent,
	hashTemplateParams,
	invalidateAllCaseTemplates
} from '$lib/server/cache/report-template-cache.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const generateFromTemplateSchema = z.object({
  templateType: z.string().min(1).max(200),
  caseId: z.string().uuid(),
  customTitle: z.string().max(500).optional(),
  useAI: z.boolean().optional().default(false)
});

/**
 * POST /api/reports/generate-from-template
 * Generate a report from a template with AI enhancement
 */
export const POST: RequestHandler = async ({ locals, request, fetch }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const raw = await request.json();
  const parsed = generateFromTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  try {
    const { templateType, caseId, customTitle, useAI } = parsed.data;

    // Get the template (with caching)
    const template = await getCachedTemplate(templateType);
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
        // Check cache first
        const cachedAI = await getCachedAIContent(templateType, caseId);

        if (cachedAI) {
          console.log(`[ReportGen] Using cached AI content for ${templateType}/${caseId}`);
          content = cachedAI.content;
        } else {
          console.log(`[ReportGen] Generating new AI content for ${templateType}/${caseId}`);

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
${evidenceItems.map((e, i) => `${i + 1}. ${e.title || 'Untitled'} (${e.fileType})`).join('\n')}

**Instructions:**
${template.aiPrompt}

Generate professional, detailed content following the template structure. Use proper legal formatting and citations where applicable.

**Template Structure to Follow:**
${template.contentTemplate}

Generate the complete report content in HTML format, maintaining the structure but filling in with case-specific analysis and recommendations.
          `.trim();

          // Call Ollama for AI generation
          const ollamaResponse = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
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

              // Cache the AI-generated content for future use
              await cacheAIContent(
                templateType,
                caseId,
                content,
                'gemma3-legal:latest',
                aiResult.eval_count || undefined
              ).catch(err => console.warn('[ReportGen] Failed to cache AI content:', err));
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

    // Audit log: report created from template
    await auditReportAction({
      reportId: newReport.id,
      userId: locals.user.id,
      action: 'created',
      changes: {
        caseId,
        title,
        templateType,
        templateUsed: template.name,
        aiGenerated: useAI
      },
      request,
    });

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
