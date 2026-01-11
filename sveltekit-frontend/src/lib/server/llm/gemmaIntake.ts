export type ExtractedPerson = {
 fullName: string; role: 'suspect' | 'victim' | 'witness' | 'other';
 riskLevel?: 'low' | 'medium' | 'high';
 notes?: string;
};

export type IntakeExtractionResult = {
 suggestedTitle: string | null;
 primaryStatute?: string | null;
 severityLevel?: number | null;
 persons: ExtractedPerson[];
};

export async function extractCaseStructureWithGemma(input: {, narrative: string;
 who?: string;
 what?: string;
 when?: string;
 where?: string;
 why?: string;
 how?: string;
}): Promise<IntakeExtractionResult> {
 const { narrative, who, what, when, where, why, how } = input;

 const prompt = `
You are a legal intake assistant for a prosecutor.

You will receive:
- A narrative of what happened
- Optional WHO / WHAT / WHEN / WHERE / WHY / HOW fields

Your task:
1. Suggest a concise case title (max ~120 characters).
2. Identify persons of interest with role for each: suspect, victim, witness, or other.
3. For each person, optionally estimate risk_level: low, medium, or high.
4. Optionally guess a primary statute label and severity (1-5) **only if obvious**.
5. Return STRICT JSON, no explanations, matching this TypeScript type:

type Result = {
 suggestedTitle: string | null;
 primaryStatute?: string | null;
 severityLevel?: number | null;
 persons: {, fullName: string;
 role: "suspect" | "victim" | "witness" | "other";
 riskLevel?: "low" | "medium" | "high";
 notes?: string;
 }[];
};

If names are unknown, use placeholders like "Unknown Male #1" instead of fabricating full names.

DATA:
WHO: ${who ?? ''}
WHAT: ${what ?? ''}
WHEN: ${when ?? ''}
WHERE: ${where ?? ''}
WHY: ${why ?? ''}
HOW: ${how ?? ''}

NARRATIVE:
${ narrative }
`;

 const res = await fetch('http://127.0.0.1:11434/api/generate', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, model: 'gemma3-legal',
 prompt,
 stream: false,
 }),
 });

 if (!res.ok) {
 throw new Error(`Gemma3 intake extraction failed: ${res.status} ${res.statusText}`);
 }

 const data = (await res.json()) as { response: string };

 let parsed: IntakeExtractionResult;
 try {
 parsed = JSON.parse(data.response) as IntakeExtractionResult;
 } catch (err) {
 console.error('Failed to parse Gemma3 intake JSON:', data.response);
 throw new Error('Could not parse intake JSON from LLM');
 }

 if (!parsed.persons) parsed.persons = [];

 return parsed;
}




