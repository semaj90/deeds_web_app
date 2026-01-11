
import { json } from '@sveltejs/kit';
import { qdrantService } from '$lib/server/services/qdrant-service';
import type { RequestHandler } from './$types';

interface ScoreFactor {
  category: string;
  weight: number;
  impact: number; // 0-1 scaled
  description: string;
  confidence: number;
}

interface CaseScore {
  id: string;
  title: string;
  description: string;
  score: number; // 0-100
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number; // 0-100
  dateCreated: string;
  lastUpdated: string;
  factors: ScoreFactor[];
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

function derivePriority(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function deriveRisk(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function sampleCase(id: number, title: string, base: number): CaseScore {
  const score = Math.min(100, Math.max(0, Math.round(base + (Math.random() * 10 - 5))));
  const now = new Date();
  const created = new Date(now.getTime() - 1000 * 60 * 60 * 24 * (7 + id));
  const factors: ScoreFactor[] = [
    {
      category: 'Admissibility',
      weight: 0.25,
      impact: Math.random(),
      description: 'Evidentiary compliance & chain of custody',
      confidence: 70 + Math.round(Math.random() * 25),
    },
    {
      category: 'Relevance',
      weight: 0.25,
      impact: Math.random(),
      description: 'Direct relevance to core legal issues',
      confidence: 65 + Math.round(Math.random() * 30),
    },
    {
      category: 'Strategic Value',
      weight: 0.25,
      impact: Math.random(),
      description: 'Influence on negotiation / litigation strategy',
      confidence: 60 + Math.round(Math.random() * 35),
    },
    {
      category: 'Quality',
      weight: 0.25,
      impact: Math.random(),
      description: 'Completeness, clarity & contextual richness',
      confidence: 60 + Math.round(Math.random() * 30),
    },
  ];
  const recommendations = [
    'Validate chain of custody documentation',
    'Corroborate with additional witness statements',
    'Enhance narrative coherence using AI summarization',
    'Cross-link with similar precedent cases',
  ].slice(0, 2 + Math.floor(Math.random() * 2));
  return {
    id: `case_${id}`,
    title,
    description: `Automated risk scoring profile for ${title}.`,
    score,
    priority: derivePriority(score),
    confidence: 60 + Math.round(Math.random() * 35),
    dateCreated: created.toISOString(),
    lastUpdated: now.toISOString(),
    factors,
    recommendations,
    riskLevel: deriveRisk(score),
  };
}

export const GET: RequestHandler = async () => {
  // Provide sample cases for the dashboard GET fetch
  const cases: CaseScore[] = [
    sampleCase(1, 'Contract Dispute: Vendor Non-Performance', 72),
    sampleCase(2, 'IP Infringement – Software Licensing', 64),
    sampleCase(3, 'Employment Claim – Wrongful Termination', 55),
    sampleCase(4, 'Data Privacy Incident – Regulatory Notice', 88),
    sampleCase(5, 'Product Liability – Consumer Injury', 47),
  ];
  return json({ cases });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { content = 'N/A', evidenceType = 'evidence', metadata = {} } = await request.json();

    let rawScore: number | string = 50;
    try {
      rawScore = await qdrantService.calculateAISummaryScore(content, evidenceType, metadata);
    } catch (inner) {
      // Fallback: deterministic pseudo-random score based on content length
      const seed = (content?.length || 13) % 37;
      rawScore = 40 + ((seed * 3) % 55); // 40-95 range
    }

    const score = Number(rawScore);
    if (Number.isNaN(score)) throw new Error('Invalid score returned (NaN)');

    return json({
      score,
      breakdown: {
        admissibility: Math.round(score * 0.25),
        relevance: Math.round(score * 0.25),
        quality: Math.round(score * 0.25),
        strategic: Math.round(score * 0.25),
      },
      reasoning: await generateScoreReasoning(score, evidenceType),
      confidence: score > 70 ? 0.85 : score > 50 ? 0.75 : 0.65,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    return json(
      { error: 'Scoring failed', details: error?.message ?? String(error) },
      { status: 500 }
    );
  }
};

async function generateScoreReasoning(score: number, evidenceType: string): Promise<string> {
  if (score >= 80) return `High-value ${evidenceType} with strong legal admissibility and strategic relevance.`;
  if (score >= 60) return `Solid ${evidenceType} evidence with moderate legal value and clear procedural compliance.`;
  if (score >= 40) return `Basic ${evidenceType} evidence requiring additional corroboration for optimal case strength.`;
  return `Limited ${evidenceType} evidence with significant admissibility concerns requiring review.`;
}