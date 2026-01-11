
import { aiService } from "$lib/server/services/ai-service.js";
import { evidence } from "$lib/server/db/schema.js";
import { z } from "zod";
import type { RequestHandler } from './$types';


const analysisSchema = z.object({
  evidenceId: z.string().uuid(),
  content: z.string().min(1).max(10000).optional(),
  forceReanalyze: z.boolean().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Check authentication
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse and validate request
    const body = await request.json();
    const { evidenceId, content, forceReanalyze = false } = analysisSchema.parse(body);

    // Get evidence from database
    const evidenceRecord = await db.query.evidence.findFirst({
      where: eq(evidence.id, evidenceId)
    });

    if (!evidenceRecord) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    // Check if user has access to this evidence (same case)
    // This is a simplified check - in production you'd want more robust authorization
    const userHasAccess = evidenceRecord.uploadedBy === locals.user.id || 
                         locals.user.role === 'admin';

    if (!userHasAccess) {
      return json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Use provided content or extract from evidence record
    const analysisContent = content || evidenceRecord.description || '';
    
    if (!analysisContent) {
      return json({ error: 'No content available for analysis' }, { status: 400 });
    }

    // Check if analysis already exists and not forcing reanalysis
    if (evidenceRecord.aiSummary && !forceReanalyze) {
      return json({
        success: true,
        data: {
          cached: true,
          analysis: {
            summary: evidenceRecord.aiSummary,
            tags: evidenceRecord.aiTags || [],
            confidence: 0.85, // Default confidence for cached results
            recommendations: []
          }
        }
      });
    }

    // Perform AI analysis
    const analysis = await aiService.analyzeEvidence(
      evidenceId,
      analysisContent,
      evidenceRecord.evidenceType
    );

    // Update evidence record with AI analysis
    await db.update(evidence)
      .set({
        aiSummary: analysis.summary,
        aiTags: analysis.tags,
        aiAnalysis: {
          confidence: analysis.confidence,
          entities: analysis.entities,
          keywords: analysis.keywords,
          recommendations: analysis.recommendations,
          analyzedAt: new Date().toISOString(),
          model: 'gemma3-legal'
        }
      })
      .where(eq(evidence.id, evidenceId));

    return json({
      success: true,
      data: {
        cached: false,
        analysis: {
          summary: analysis.summary,
          tags: analysis.tags,
          confidence: analysis.confidence,
          entities: analysis.entities,
          keywords: analysis.keywords,
          recommendations: analysis.recommendations
        }
      }
    });

  } catch (error: any) {
    console.error('Evidence analysis API error:', error);

    if (error instanceof z.ZodError) {
      return json(
        { 
          error: 'Validation failed', 
          details: error.errors 
        }, 
        { status: 400 }
      );
    }

    return json(
      { 
        error: 'Evidence analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
};