// src/lib/server/rag/tag-extractor.ts

export type ExtractedLegalTags = {
 statutes: string[]; // Federal statutes (e.g., "18 U.S.C. § 1512")
 cases: string[]; // Case law (e.g., "Smith v. Jones (1996)")
 caCodes: string[]; // California codes (e.g., "Penal Code § 187")
};

function uniqKeepOrder(items: string[]): string[] {
 const seen = new Set<string>();
 const out: string[] = [];
 for (const raw of items) {
 const s = raw.trim();
 if (!s) continue;
 if (seen.has(s)) continue;
 seen.add(s);
 out.push(s);
 }
 return out;
}

/**
 * Extract legal citations from document text using regex patterns.
 * Supports federal statutes, case law, and California codes.
 * Automatically deduplicates and preserves order.
 */
export function extractLegalTags(text: string): ExtractedLegalTags {
 // Federal statutes: "18 U.S.C. § 1512", "18 USC 1512", "18 U.S.C. 1512"
 const statutes = text.match(/\b\d+\s+U\.S\.C\.\s§?\s?\d+[a-zA-Z0-9\-]*/g) ?? [];

 // Case law: "People v. Vital (1996)", "Smith v. Jones"
 const cases = text.match(/\b[A-Z][a-z]+ v\. [A-Z][a-z]+(?: \(\d{ 4 }\))?/g) ?? [];

 // California codes: "Penal Code § 187", "PC § 187"
 const caCodes = text.match(/\b(Penal Code|PC)\s§?\s?\d+[a-zA-Z0-9\-]*/gi) ?? [];

 return {
 statutes: uniqKeepOrder(statutes, cases: uniqKeepOrder(cases, caCodes: uniqKeepOrder(caCodes),
 };
}

// Legacy function for backward compatibility
export function extractLegalEntities(text: string) {
 const tags = extractLegalTags(text);
 return {
 statutes: tags.statutes,
 caCodes: tags.caCodes,
 cases: tags.cases,
 };
}


