/**
 * Demo RAG functionality for testing
 * Simulates AI-powered case analysis with mock data
 */

import type { Evidence, Case, Report } from "$lib/types";

export interface RAGDemoQuery {
  query: string;
  caseId: string;
  evidence?: Evidence[];
  reports?: Report[];
  maxTokens?: number;
  temperature?: number;
}

export interface RAGDemoResponse {
  response: string;
  sources: Array<{
    id: string;
    type: "evidence" | "report" | "case";
    relevance: number;
    excerpt?: string;
  }>;
  confidence: number;
  tokensUsed: number;
  reasoning: string[];
}

/**
 * Mock case data for testing
 */
const mockCaseData = {
  "1": {
    title: "Financial Fraud Investigation",
    description: "Investigation into suspicious financial transactions",
    evidence: [
      {
        id: "e1",
        filename: "bank_statements.pdf",
        type: "document" as const,
        description: "Bank statements showing unusual transfers",
        uploadedAt: new Date("2024-01-15"),
        metadata: { amount: "$50,000", account: "****1234" },
      },
      {
        id: "e2",
        filename: "email_thread.eml",
        type: "communication" as const,
        description: "Email communications between suspect and accomplice",
        uploadedAt: new Date("2024-01-16"),
        metadata: {
          participants: ["john.doe@email.com", "jane.smith@email.com"],
        },
      },
      {
        id: "e3",
        filename: "transaction_logs.csv",
        type: "data" as const,
        description: "Digital transaction logs from internal systems",
        uploadedAt: new Date("2024-01-17"),
        metadata: { entries: 247, dateRange: "2023-12-01 to 2024-01-15" },
      },
    ],
    reports: [
      {
        id: "r1",
        title: "Initial Assessment Report",
        content:
          "Preliminary analysis shows patterns consistent with fraudulent activity...",
        createdAt: new Date("2024-01-18"),
        generatedBy: "AI Assistant",
      },
    ],
  },
  "2": {
    title: "Corporate Espionage Case",
    description: "Investigation into data theft and industrial espionage",
    evidence: [
      {
        id: "e4",
        filename: "security_footage.mp4",
        type: "media" as const,
        description: "Security camera footage from server room",
        uploadedAt: new Date("2024-02-01"),
        metadata: { duration: "2:30:45", quality: "1080p" },
      },
      {
        id: "e5",
        filename: "network_logs.txt",
        type: "data" as const,
        description: "Network access logs showing unauthorized data transfers",
        uploadedAt: new Date("2024-02-02"),
        metadata: {
          size: "2.3MB",
          suspicious_ips: ["192.168.1.157", "10.0.0.233"],
        },
      },
    ],
    reports: [],
  },
};

/**
 * Simulate AI analysis with realistic responses
 */
export async function demoQueryLLM(
  query: RAGDemoQuery,
): Promise<RAGDemoResponse> {
  // Simulate network delay
  await new Promise((resolve) =>
    setTimeout(resolve, 800 + Math.random() * 1200),
  );

  const caseData = mockCaseData[query.caseId as keyof typeof mockCaseData];
  if (!caseData) {
    throw new Error(`No demo data for case ${query.caseId}`);
  }

  const queryLower = query.query.toLowerCase();
  const sources: RAGDemoResponse["sources"] = [];
  const reasoning: string[] = [];

  // Analyze query against evidence
  caseData.evidence.forEach((evidence) => {
    const relevance = calculateRelevance(queryLower, evidence);
    if (relevance > 0.3) {
      sources.push({
        id: evidence.id,
        type: "evidence",
        relevance,
        excerpt: generateExcerpt(evidence, queryLower),
      });
      reasoning.push(
        `Found relevant evidence: ${evidence.filename} (${Math.round(relevance * 100)}% relevance)`,
      );
    }
  });

  // Analyze query against reports
  caseData.reports.forEach((report) => {
    const relevance = calculateReportRelevance(queryLower, report);
    if (relevance > 0.3) {
      sources.push({
        id: report.id,
        type: "report",
        relevance,
        excerpt: report.content.substring(0, 150) + "...",
      });
      reasoning.push(
        `Referenced report: ${report.title} (${Math.round(relevance * 100)}% relevance)`,
      );
    }
  });

  // Generate contextual response based on query type
  const response = generateResponse(queryLower, caseData, sources);

  return {
    response,
    sources: sources.sort((a, b) => b.relevance - a.relevance),
    confidence: Math.min(0.95, 0.6 + sources.length * 0.1),
    tokensUsed: Math.floor(300 + Math.random() * 200),
    reasoning,
  };
}

/**
 * Calculate relevance score for evidence
 */
function calculateRelevance(query: string, evidence: any): number {
  const terms = query.split(" ").filter((term) => term.length > 2);
  let score = 0;

  terms.forEach((term) => {
    if (evidence.filename.toLowerCase().includes(term)) score += 0.4;
    if (evidence.description.toLowerCase().includes(term)) score += 0.3;
    if (evidence.type.toLowerCase().includes(term)) score += 0.2;

    // Check metadata
    if (evidence.metadata) {
      const metadataStr = JSON.stringify(evidence.metadata).toLowerCase();
      if (metadataStr.includes(term)) score += 0.1;
    }
  });

  return Math.min(1.0, score);
}

/**
 * Calculate relevance score for reports
 */
function calculateReportRelevance(query: string, report: any): number {
  const terms = query.split(" ").filter((term) => term.length > 2);
  let score = 0;

  terms.forEach((term) => {
    if (report.title.toLowerCase().includes(term)) score += 0.4;
    if (report.content.toLowerCase().includes(term)) score += 0.3;
  });

  return Math.min(1.0, score);
}

/**
 * Generate contextual excerpt from evidence
 */
function generateExcerpt(evidence: any, query: string): string {
  const terms = query.split(" ").filter((term) => term.length > 2);
  const mainTerm = terms[0] || "";

  if (evidence.type === "document") {
    return `Document contains ${terms.length} relevant terms related to ${mainTerm}...`;
  } else if (evidence.type === "communication") {
    return `Communication thread discusses ${mainTerm} between parties...`;
  } else if (evidence.type === "data") {
    return `Data analysis reveals patterns related to ${mainTerm}...`;
  } else if (evidence.type === "media") {
    return `Media file shows evidence of ${mainTerm} activity...`;
  }

  return `Evidence file contains relevant information about ${mainTerm}...`;
}

/**
 * Generate AI response based on query and context
 */
function generateResponse(
  query: string,
  caseData: any,
  sources: any[],
): string {
  if (query.includes("summary") || query.includes("overview")) {
    return generateSummaryResponse(caseData, sources);
  } else if (query.includes("evidence") || query.includes("proof")) {
    return generateEvidenceResponse(caseData, sources);
  } else if (query.includes("timeline") || query.includes("chronology")) {
    return generateTimelineResponse(caseData, sources);
  } else if (query.includes("suspect") || query.includes("person")) {
    return generatePersonResponse(caseData, sources);
  } else if (query.includes("financial") || query.includes("money")) {
    return generateFinancialResponse(caseData, sources);
  } else if (query.includes("pattern") || query.includes("analysis")) {
    return generatePatternResponse(caseData, sources);
  } else {
    return generateGeneralResponse(query, caseData, sources);
  }
}

function generateSummaryResponse(caseData: any, sources: any[]): string {
  return `Based on my analysis of ${sources.length} pieces of evidence, this case involves ${caseData.description.toLowerCase()}.

Key findings include:
• ${sources.length} relevant evidence items identified
• Evidence spans multiple data types: documents, communications, and digital logs
• Patterns suggest systematic activity requiring further investigation

The evidence quality is strong, with multiple corroborating sources. I recommend prioritizing the highest-relevance items for detailed forensic analysis.`;
}

function generateEvidenceResponse(caseData: any, sources: any[]): string {
  const evidenceTypes = Array.from(
    new Set(
      sources.map((s) => {
        const evidence = caseData.evidence.find((e: any) => e.id === s.id);
        return evidence?.type || "unknown";
      }),
    ),
  );

  return `I've identified ${sources.length} pieces of relevant evidence in this case:

${sources
  .slice(0, 3)
  .map((source, i) => {
    const evidence = caseData.evidence.find((e: any) => e.id === source.id);
    return `${i + 1}. **${evidence?.filename}** (${Math.round(source.relevance * 100)}% relevance)
   ${source.excerpt}`;
  })
  .join("\n\n")}

Evidence types present: ${evidenceTypes.join(", ")}. Each piece contributes to building a comprehensive picture of the case facts.`;
}

function generateTimelineResponse(caseData: any, sources: any[]): string {
  const timelineEvents = caseData.evidence
    .sort(
      (a: any, b: any) =>
        new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
    )
    .slice(0, 4);

  return `Based on the evidence timeline, here's the chronological sequence:

${timelineEvents
  .map((evidence: any, i: number) => {
    const date = new Date(evidence.uploadedAt).toLocaleDateString();
    return `**${date}**: ${evidence.description}`;
  })
  .join("\n\n")}

This timeline shows the progression of evidence collection and suggests a systematic approach to the investigation. Earlier evidence may have triggered subsequent collection efforts.`;
}

function generatePersonResponse(caseData: any, sources: any[]): string {
  return `Analyzing person-related evidence in this case:

The evidence suggests involvement of multiple parties:
• Email communications indicate at least 2-3 individuals
• Financial records show transactions between different accounts
• Network logs reveal access from multiple IP addresses

Key persons of interest appear to be connected through both digital communications and financial transactions. Cross-referencing evidence sources reveals potential coordination between parties.`;
}

function generateFinancialResponse(caseData: any, sources: any[]): string {
  return `Financial analysis reveals several concerning patterns:

• Unusual transaction amounts and timing
• Multiple account involvement suggesting layered transfers
• Digital logs correlate with financial activity periods
• Evidence suggests sophisticated financial planning

The financial evidence forms a strong foundation for this case, with multiple data sources corroborating suspicious activity patterns. Recommend forensic accounting review.`;
}

function generatePatternResponse(caseData: any, sources: any[]): string {
  return `Pattern analysis of the available evidence shows:

**Behavioral Patterns:**
• Systematic data collection across multiple evidence types
• Coordinated timing between different activities
• Sophisticated operational security measures

**Data Patterns:**
• Evidence clustering around specific time periods
• Cross-referencing reveals hidden connections
• Multiple data sources validate findings

These patterns suggest organized, premeditated activity rather than opportunistic behavior.`;
}

function generateGeneralResponse(
  query: string,
  caseData: any,
  sources: any[],
): string {
  const relevantSources = sources.slice(0, 2);

  return `Regarding your question about "${query}", I've analyzed ${sources.length} relevant pieces of evidence.

${relevantSources
  .map((source) => {
    const evidence = caseData.evidence.find((e: any) => e.id === source.id);
    return `**${evidence?.filename}**: ${source.excerpt}`;
  })
  .join("\n\n")}

${
  sources.length > 0
    ? `This evidence provides ${sources.length > 2 ? "strong" : "moderate"} support for investigating this aspect of the case further.`
    : "While I couldn't find direct evidence matching your query, I recommend examining related case materials."
}`;
}

/**
 * Demo case analysis functions
 */
export async function demoGenerateCaseSummary(caseId: string): Promise<string> {
  const caseData = mockCaseData[caseId as keyof typeof mockCaseData];
  if (!caseData) return "Case not found in demo data.";

  await new Promise((resolve) => setTimeout(resolve, 1000));

  return `# Case Summary: ${caseData.title}

## Overview
${caseData.description}

## Evidence Summary
- **Total Evidence Items**: ${caseData.evidence.length}
- **Document Types**: ${Array.from(new Set(caseData.evidence.map((e: any) => e.type))).join(", ")}
- **Date Range**: ${new Date(Math.min(...caseData.evidence.map((e: any) => e.uploadedAt.getTime()))).toLocaleDateString()} - ${new Date(Math.max(...caseData.evidence.map((e: any) => e.uploadedAt.getTime()))).toLocaleDateString()}

## Key Findings
${caseData.evidence.map((e, i) => `${i + 1}. ${e.description}`).join("\n")}

## Recommendations
- Continue evidence collection in identified areas
- Cross-reference digital and physical evidence
- Consider forensic analysis of digital artifacts
- Interview relevant parties identified in communications

*Generated by AI Assistant - ${new Date().toLocaleString()}*`;
}

export async function demoAnalyzeEvidencePatterns(
  evidence: Evidence[],
): Promise<string[]> {
  await new Promise((resolve) => setTimeout(resolve, 600));

  const patterns = [
    "Evidence collection spans multiple data types (documents, communications, digital logs)",
    "Timeline suggests systematic evidence gathering over 2-3 day period",
    "Digital evidence correlates with physical document timestamps",
    "Communication patterns indicate 2-3 key persons of interest",
    "Financial data shows transaction clustering around evidence dates",
  ];

  // Randomize and return subset based on evidence count
  const shuffled = patterns.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(evidence.length + 1, patterns.length));
}

export async function demoSmartSearch(
  query: string,
  evidence: Evidence[],
): Promise<Evidence[]> {
  await new Promise((resolve) => setTimeout(resolve, 400));

  const queryLower = query.toLowerCase();
  return evidence
    .map((e) => ({
      ...e,
      relevance: calculateRelevance(queryLower, e),
    }))
    .filter((e) => e.relevance > 0.2)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);
}
