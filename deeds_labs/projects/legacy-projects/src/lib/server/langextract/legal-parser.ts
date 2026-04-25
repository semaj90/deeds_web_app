// src/lib/server/langextract/legal-parser.ts
import nlp from 'compromise';
import dates from 'compromise-dates';
import { OllamaClient } from '$lib/ai/ollama-client';

lp.extend(dates);

export interface Party {
  name: string;
  role: string;
  type: 'individual' | 'organization';
}

export interface LegalDate {
  text: string;
  normalized: string | null;
  type: string;
}

export interface Clause {
  number: number;
  heading: string;
  text: string;
  type: string;
}

export interface LegalDocument {
  parties: Party[];
  dates: LegalDate[];
  clauses: Clause[];
  jurisdiction: string;
  document_type: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

export class LegalParser {
  private ollama = new OllamaClient();

  async parse(text: string): Promise<LegalDocument> {
    // Extract entities with compromise.js (fast, rule-based)
    const doc = nlp(text);

    const parties = await this.extractParties(text, doc);
    const dates = this.extractDates(doc);
    const clauses = await this.extractClauses(text);

    // Classify with gemma3:270m (LLM-based)
    const classification = await this.classifyDocument(text);

    return {
      parties,
      dates,
      clauses,
      jurisdiction: classification.jurisdiction,
      document_type: classification.type,
      risk_level: classification.risk
    };
  }

  private async extractParties(text: string, doc: any): Promise<Party[]> {
    // Rule-based extraction
    const organizations = doc.organizations().out('array');
    const people = doc.people().out('array');

    // LLM-enhanced extraction with gemma3:270m
    const prompt = `Extract all parties from this legal document.

Document:
${text.slice(0, 2000)}

Return JSON array of parties with format:
[
  {"name": "Party A", "role": "plaintiff", "type": "individual"},
  {"name": "Party B", "role": "defendant", "type": "corporation"}
]`;

    const llmResult = await this.ollama.generate(prompt, {
      temperature: 0.1,
      maxTokens: 512
    });

    try {
      const llmParties = JSON.parse(llmResult.response);
      return llmParties;
    } catch {
      // Fallback to rule-based
      return [
        ...organizations.map(name => ({ name, type: 'organization', role: 'unknown' })),
        ...people.map(name => ({ name, type: 'individual', role: 'unknown' }))
      ];
    }
  }

  private extractDates(doc: any): LegalDate[] {
    const dates = doc.dates().json();

    return dates.map((d: any) => ({
      text: d.text,
      normalized: d.dates?.[0]?.start || null,
      type: this.classifyDateType(d.text)
    }));
  }

  private classifyDateType(text: string): string {
    // Placeholder for date type classification
    if (text.includes('effective')) return 'effective_date';
    if (text.includes('execution')) return 'execution_date';
    return 'general_date';
  }

  private async extractClauses(text: string): Promise<Clause[]> {
    // Split into potential clauses (numbered or headings)
    const clausePattern = /(?:^|\n)(\d+\.?\s+|[A-Z][^.!?]*:)/gm;
    const matches = text.matchAll(clausePattern);

    const clauses: Clause[] = [];
    let lastIndex = 0;

    for (const match of matches) {
      const startIndex = match.index!;

      if (lastIndex > 0) {
        const clauseText = text.slice(lastIndex, startIndex).trim();

        if (clauseText.length > 50) {
          clauses.push({
            number: clauses.length + 1,
            heading: match[0].trim(),
            text: clauseText,
            type: await this.classifyClause(clauseText)
          });
        }
      }

      lastIndex = startIndex;
    }

    // Add the last clause if any remaining text
    if (lastIndex < text.length) {
      const clauseText = text.slice(lastIndex).trim();
      if (clauseText.length > 50) {
        clauses.push({
          number: clauses.length + 1,
          heading: 'Remaining Text',
          text: clauseText,
          type: await this.classifyClause(clauseText)
        });
      }
    }

    return clauses;
  }

  private async classifyClause(clauseText: string): Promise<string> {
    // Placeholder for clause classification
    const prompt = `Classify the type of this legal clause (e.g., "indemnification", "termination", "governing_law", "payment").

Clause:
${clauseText.slice(0, 500)}

Return only the classification string.`;

    const result = await this.ollama.generate(prompt, {
      temperature: 0.1,
      maxTokens: 30
    });

    return result.response.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  private async classifyDocument(text: string): Promise<{
    jurisdiction: string;
    type: string;
    risk: 'low' | 'medium' | 'high' | 'critical';
  }> {
    const prompt = `Classify this legal document.

Document (first 1000 chars):
${text.slice(0, 1000)}

Return JSON:
{
  "jurisdiction": "federal|state|local",
  "type": "contract|evidence|brief|citation",
  "risk": "low|medium|high|critical"
}`;

    const result = await this.ollama.generate(prompt, {
      temperature: 0.1,
      maxTokens: 128
    });

    try {
      return JSON.parse(result.response);
    } catch {
      return {
        jurisdiction: 'unknown',
        type: 'contract',
        risk: 'medium'
      };
    }
  }
}
