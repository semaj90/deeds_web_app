/**
 * Report Auto-Populator — fills report fields from case context using RAG.
 *
 * Each report template field is populated by a targeted RAG query against
 * the case's evidence + knowledge base.  Returns structured JSON that the
 * report editor can render and the user can review before saving.
 *
 * Depends on: rag-pipeline.ts (Layer 2.3), prompts.ts (Layer 0.1)
 *
 * Usage:
 *   const draft = await autoPopulateReport({ caseId, template: 'incident-summary' });
 *   // draft.fields → Record<string, string> ready for the report editor
 */

import { ragQuery } from '$lib/server/rag-pipeline.js';
import { SYSTEM_YORHA_LEGAL, FORMAT_CITE_SOURCES } from '$lib/ai/prompts.js';

// ─── Template definitions ─────────────────────────────────────────────────────

export type ReportTemplate =
  | 'incident-summary'
  | 'chronology'
  | 'parties-profile'
  | 'evidence-summary'
  | 'legal-analysis'
  | 'recommendations';

interface FieldSpec {
  label: string;
  query: (caseTitle: string) => string;
  /** Max tokens for this field (longer fields = more RAG context) */
  maxTokens: number;
}

const TEMPLATES: Record<ReportTemplate, Record<string, FieldSpec>> = {
  'incident-summary': {
    overview: {
      label: 'Incident Overview',
      query: (t) => `Summarize the key facts and allegations in the case: ${t}`,
      maxTokens: 400,
    },
    jurisdiction: {
      label: 'Jurisdiction & Venue',
      query: (t) => `What court and jurisdiction applies to: ${t}`,
      maxTokens: 150,
    },
    parties: {
      label: 'Parties Involved',
      query: (t) => `Who are the plaintiff, defendant, and key parties in: ${t}`,
      maxTokens: 200,
    },
  },
  chronology: {
    timeline: {
      label: 'Timeline of Events',
      query: (t) => `List the key events in chronological order for the case: ${t}`,
      maxTokens: 600,
    },
    criticalDates: {
      label: 'Critical Dates',
      query: (t) => `What are the key legal deadlines and statute of limitations for: ${t}`,
      maxTokens: 200,
    },
  },
  'parties-profile': {
    plaintiff: {
      label: 'Plaintiff Profile',
      query: (t) => `Summarize the plaintiff's background and claims in: ${t}`,
      maxTokens: 300,
    },
    defendant: {
      label: 'Defendant Profile',
      query: (t) => `Summarize the defendant's background and defenses in: ${t}`,
      maxTokens: 300,
    },
  },
  'evidence-summary': {
    keyEvidence: {
      label: 'Key Evidence',
      query: (t) => `What is the strongest evidence in the case: ${t}`,
      maxTokens: 400,
    },
    evidentiary: {
      label: 'Evidentiary Issues',
      query: (t) => `What evidentiary issues or objections apply to: ${t}`,
      maxTokens: 300,
    },
  },
  'legal-analysis': {
    elements: {
      label: 'Legal Elements',
      query: (t) => `What are the legal elements that must be proven in: ${t}`,
      maxTokens: 400,
    },
    precedent: {
      label: 'Relevant Precedent',
      query: (t) => `What case law and statutes are most relevant to: ${t}`,
      maxTokens: 400,
    },
    strengths: {
      label: 'Strengths & Weaknesses',
      query: (t) => `What are the legal strengths and weaknesses of the case: ${t}`,
      maxTokens: 400,
    },
  },
  recommendations: {
    strategy: {
      label: 'Recommended Strategy',
      query: (t) => `What legal strategy is recommended for: ${t}`,
      maxTokens: 400,
    },
    nextSteps: {
      label: 'Immediate Next Steps',
      query: (t) => `What are the immediate action items for the attorney on: ${t}`,
      maxTokens: 300,
    },
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoPopulateInput {
  caseId: string;
  /** Human-readable case title — used to build RAG queries */
  caseTitle: string;
  template: ReportTemplate;
  /** Override the default system prompt for this run */
  systemPrompt?: string;
}

export interface AutoPopulateResult {
  template: ReportTemplate;
  caseId: string;
  /** Populated field values — key matches the FieldSpec key */
  fields: Record<string, string>;
  /** RAG citations used across all fields */
  citations: Array<{ id: string; title: string; score: number }>;
  /** Whether all fields were populated (false = some fields fell back to empty) */
  complete: boolean;
  durationMs: number;
}

// ─── LLM synthesis helper ─────────────────────────────────────────────────────

async function synthesizeField(
  query: string,
  contextText: string,
  maxTokens: number
): Promise<string> {
  if (!contextText.trim()) return '';

  try {
    const { bifrostChat } = await import('$lib/server/ollama.js');
    const systemMsg = `${SYSTEM_YORHA_LEGAL}\n\n${FORMAT_CITE_SOURCES}`;
    const userMsg = `Context:\n${contextText}\n\nQuery: ${query}\n\nAnswer in ${maxTokens} tokens or fewer.`;

    const response = await bifrostChat(
      [{ role: 'user', content: userMsg }],
      'gemma4-legal-vlm:latest',
      { temperature: 0.2, maxTokens }
    );
    return (typeof response === 'string' ? response : String(response ?? '')).trim();
  } catch {
    // Graceful degradation — return the raw context excerpt
    return contextText.slice(0, maxTokens * 4);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Auto-populate a report template from case evidence via RAG.
 *
 * @example
 * const draft = await autoPopulateReport({
 *   caseId: 'c9b79f5d-...',
 *   caseTitle: 'Smith v. Acme Corp — Breach of Contract',
 *   template: 'incident-summary',
 * });
 * // Save draft.fields to the reports table
 */
export async function autoPopulateReport(
  input: AutoPopulateInput
): Promise<AutoPopulateResult> {
  const { caseId, caseTitle, template } = input;
  const specs = TEMPLATES[template];
  const start = Date.now();

  const fields: Record<string, string> = {};
  const allCitations: Array<{ id: string; title: string; score: number }> = [];
  let complete = true;

  // Process all fields concurrently
  const fieldEntries = Object.entries(specs);
  const results = await Promise.allSettled(
    fieldEntries.map(async ([key, spec]) => {
      const query = spec.query(caseTitle);
      const { contextText, citations } = await ragQuery(query, {
        caseId,
        topK: 5,
        rerank: true,
      });
      allCitations.push(...citations);

      const answer = await synthesizeField(query, contextText, spec.maxTokens);
      return { key, answer };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      fields[result.value.key] = result.value.answer;
      if (!result.value.answer) complete = false;
    } else {
      complete = false;
    }
  }

  // Deduplicate citations by id
  const seen = new Set<string>();
  const uniqueCitations = allCitations.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return {
    template,
    caseId,
    fields,
    citations: uniqueCitations.sort((a, b) => b.score - a.score).slice(0, 20),
    complete,
    durationMs: Date.now() - start,
  };
}

/**
 * List available templates and their field labels.
 * Used by the report editor UI to show template options.
 */
export function getTemplateFields(
  template: ReportTemplate
): Array<{ key: string; label: string }> {
  const specs = TEMPLATES[template];
  return Object.entries(specs).map(([key, s]) => ({ key, label: s.label }));
}

export const REPORT_TEMPLATES: ReportTemplate[] = Object.keys(TEMPLATES) as ReportTemplate[];
