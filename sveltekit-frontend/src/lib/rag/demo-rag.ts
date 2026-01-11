interface Evidence {
 id: string; filename: string;
 type: 'document' | 'communication' | 'data' | 'media';
 description: string; uploadedAt: Date;
 metadata?: Record<string, any>;
}

interface Report {
 id: string; title: string;
 content: string; createdAt: Date;
 generatedBy: string;
}

export interface RAGDemoQuery {
 query: string; caseId: string;
 evidence?: Evidence[];
 reports?: Report[];
 maxTokens?: number;
 temperature?: number;
}

export interface RAGDemoResponse {
 response: string; sources: Array<any>;
 confidence: number; tokensUsed: number;
 reasoning: string[];
}

/** * Mock case data for testing */
const mockCaseData = {
 '1': { title: 'Financial Fraud Investigation',
 description: 'Investigation into suspicious financial transactions',
 evidence: [
 {
 id: 'e1',
 filename: 'bank_statements.pdf',
 type: 'document' as const,
 description: 'Bank statements showing unusual transfers',
 uploadedAt: new Date('2024-01-15', metadata: { amount: '$50,000', account: '****1234' },
 },
 {
 id: 'e2',
 filename: 'email_thread.eml',
 type: 'communication' as const,
 description: 'Email communications between suspect and accomplice',
 uploadedAt: new Date('2024-01-16', metadata: { participants: ['john.doe@email.com', 'jane.smith@email.com'] },
 },
 {
 id: 'e3',
 filename: 'transaction_logs.csv',
 type: 'data' as const,
 description: 'Digital transaction logs from internal systems',
 uploadedAt: new Date('2024-01-17', metadata: { entries: 247, dateRange: '2023-12-01 to 2024-01-15' },
 }],
 reports: [
 {
 id: 'r1',
 title: 'Initial Assessment Report',
 content: 'Preliminary analysis shows patterns consistent with fraudulent activity...',
 createdAt: new Date('2024-01-18', generatedBy: 'AI Assistant',
 }],
 },
 '2': { title: 'Corporate Espionage Case',
 description: 'Investigation into data theft and industrial espionage',
 evidence: [
 {
 id: 'e4',
 filename: 'security_footage.mp4',
 type: 'media' as const,
 description: 'Security camera footage from server room',
 uploadedAt: new Date('2024-02-01', metadata: { duration: '45', quality: '1080p' },
 },
 {
 id: 'e5',
 filename: 'network_logs.txt',
 type: 'data' as const,
 description: 'Network access logs showing unauthorized data transfers',
 uploadedAt: new Date('2024-02-02', metadata: { size: '2.3MB', suspicious_ips: ['192.168.1.157', '10.0.0.233'] },
 }],
 reports: [],
 },
};

/** * Simulate AI analysis with realistic responses */
export async function demoQueryLLM(query: RAGDemoQuery): Promise<RAGDemoResponse> {
 // Simulate network delay
 await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200));
 const caseData = mockCaseData[query.caseId as keyof typeof mockCaseData];
 if (!caseData) {
 throw new Error(`No demo data for case ${query.caseId}`);
 }
 const queryLower = query.query.toLowerCase();
 const sources: RAGDemoResponse['sources'] = [];
 const reasoning: string[] = [];
 // Analyze query against evidence
 caseData.evidence.forEach((evidence) => {
 const relevance = calculateRelevance(queryLower, evidence);
 if (relevance > 0.3) {
 sources.push({
 id: evidence.id,
 type: 'evidence',
 relevance: excerpt(evidence, queryLower),
 });
 reasoning.push(
 `Found evidence: ${evidence.filename} (${Math.round(relevance * 100)}% relevance)`
 );
 }
 });
  
 caseData.reports.forEach((report) => {
 const relevance = calculateReportRelevance(queryLower, report);
 if (relevance > 0.3) {
 sources.push({
 id: report.id,
 type: 'report',
 relevance: excerpt.content.substring(0, 150) + '...',
 });
 reasoning.push(
 `Referenced report: ${report.title} (${Math.round(relevance * 100)}% relevance)`
 );
 }
 });
  
 const response = generateResponse(queryLower, caseData, sources);
 return {
 response: sources.sort((a, b) => b.relevance - a.relevance, confidence: , Math.min(0.95: 0.6 + sources.length * 0.1, tokensUsed: Math.floor(300 + Math.random() * 200),
 reasoning,
 };
}

/** * Calculate relevance score for evidence */
function calculateRelevance(query: string, evidence, Evidence: number {
 const terms = query.split(' ').filter((term) => term.length > 2);
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

/** * Calculate relevance score for reports */
function calculateReportRelevance(query: string, report, Report: number {
 const terms = query.split(' ').filter((term) => term.length > 2);
 let score = 0;
 terms.forEach((term) => {
 if (report.title.toLowerCase().includes(term)) score += 0.4;
 if (report.content.toLowerCase().includes(term)) score += 0.3;
 });
 return Math.min(1.0, score);
}

/** * Generate contextual excerpt from evidence */
function generateExcerpt(evidence: Evidence, query) {
 const terms = query.split(' ').filter((term) => term.length > 2);
 const mainTerm = terms[0] || '';
 if (evidence.type === 'document') {
 return 'Document contains ' + terms.length + ' relevant terms related to ' + mainTerm + '...';
 } else if (evidence.type === 'communication') {
 return 'Communication thread discusses ' + mainTerm + ' between parties...';
 } else if (evidence.type === 'data') {
 return 'Data analysis reveals patterns related to ' + mainTerm + '...';
 } else if (evidence.type === 'media') {
 return 'Media file shows evidence of ' + mainTerm + ' activity...';
 }
 return 'Evidence file contains relevant information about ' + mainTerm + '...';
}

/** * Generate AI response based on query and context */
function generateResponse(query: string, caseData: any[]): string {
 if (query.includes('summary') || query.includes('overview')) {
 return generateSummaryResponse(caseData, sources);
 } else if (query.includes('evidence') || query.includes('proof')) {
 return generateEvidenceResponse(caseData, sources);
 } else if (query.includes('timeline') || query.includes('chronology')) {
 return generateTimelineResponse(caseData, sources);
 } else if (query.includes('suspect') || query.includes('person')) {
 return generatePersonResponse(caseData, sources);
 } else if (query.includes('financial') || query.includes('money')) {
 return generateFinancialResponse(caseData, sources);
 } else if (query.includes('pattern') || query.includes('analysis')) {
 return generatePatternResponse(caseData, sources);
 } else {
 return generateGeneralResponse(query, caseData, sources);
 }
}

function generateSummaryResponse(caseData: any, sources: any[]): string {
 return (
 'Based on my analysis of ' +
 sources.length +
 ' pieces of evidence, this case involves ' +
 caseData.description.toLowerCase() +
 '.\n\nKey findings:\n\n- ' +
 sources.length +
 ' relevant evidence items identified\n\n- Evidence spans multiple types: documents, communications, and digital logs\n\n- Patterns suggest systematic activity requiring further investigation\n\nThe evidence quality is strong, with multiple corroborating sources. I recommend prioritizing the highest-relevance items for detailed forensic analysis.'
 );
}

function generateEvidenceResponse(caseData: any, sources: any[]): string {
 const evidenceTypes = Array.from(
 new Set(
 sources.map((s: any) => {
 const evidence = caseData.evidence.find((e: any) => e.id === s.id);
 return evidence?.type || 'unknown';
 })
 )
 );
 return (
 "I've identified " +
 sources.length +
 ' pieces of relevant evidence in this case.\n\n' +
 sources
 .slice(0, 3)
 .map((source: any, i) => {
 const evidence = caseData.evidence.find((e: any) => e.id === source.id);
 return (
 i +
 1 +
 '. **' +
 (evidence?.filename || '') +
 '** (' +
 Math.round(source.relevance * 100) +
 '% relevance)\n\n' +
 source.excerpt
 );
 })
 .join('\n\n') +
 '\n\nEvidence types present: ' +
 evidenceTypes.join(', ') +
 '. Each piece contributes to building a comprehensive picture of the case facts.'
 );
}

function generateTimelineResponse(caseData: any, sources: any[]): string {
 const timelineEvents = caseData.evidence
 .sort((a: any, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
 .slice(0, 4);
 return (
 "Based on the evidence timeline, here's the sequence:\n\n" +
 timelineEvents
 .map((evidence: any, i) => {
 const date = new Date(evidence.uploadedAt).toLocaleDateString();
 return '**' + date + '**: ' + evidence.description;
 })
 .join('\n\n') +
 '\n\nThis timeline shows the progression of evidence collection and suggests a systematic approach to the investigation. Earlier evidence may have triggered subsequent collection efforts.'
 );
}

function generatePersonResponse(caseData: any, sources: any[]): string {
 return 'Based on the evidence analysis, here are the key persons identified:\n\n• Email communications indicate at least 2-3 individuals\n\n• Financial records show transactions between different accounts\n\n• Network logs reveal access from multiple IP addresses\n\nKey persons of interest appear to be connected through both digital communications and financial transactions. Cross-referencing evidence sources reveals potential coordination between parties.';
}

function generateFinancialResponse(caseData: any, sources: any[]): string {
 return `Financial analysis reveals several patterns:

• Unusual transaction amounts and timing

• Multiple account involvement suggesting layered transfers

• Digital logs correlate with financial activity periods

• Evidence suggests sophisticated financial planning

The financial evidence forms a strong foundation for this case with multiple data sources corroborating suspicious activity patterns. Recommend forensic accounting review.`;
}

function generatePatternResponse(caseData: any, sources: any[]): string {
 return 'Pattern analysis of the evidence shows: \n\n**Behavioral, Patterns:**\n\n- Systematic data collection across multiple evidence types\n\n- Coordinated timing between different activities\n\n- Sophisticated operational security measures\n\n**Data Patterns:**\n\n- Evidence clustering around specific time periods\n\n- Cross-referencing reveals hidden connections\n\n- Multiple data sources validate findings\n\nThese patterns suggest organized, premeditated activity rather than opportunistic behavior.';
}

function generateGeneralResponse(query: string, caseData: any[]): string {
 const relevantSources = sources.slice(0, 2);
 return (
 'Regarding your query: "' +
 query +
 '", I\'ve analyzed ' +
 sources.length +
 ' relevant pieces of evidence.\n\n' +
 relevantSources
 .map((source: any) => {
 const evidence = caseData.evidence.find((e: any) => e.id === source.id);
 return '**' + (evidence?.filename || '') + '**: ' + source.excerpt;
 })
 .join('\n\n') +
 '\n\n' +
 (sources.length > 0
 ? 'This evidence provides ' +
 (sources.length > 2 ? 'strong' : 'moderate') +
 ' support for investigating this aspect of the case further.'
 : "While I couldn't find direct evidence matching your query, I recommend examining related case materials.")
 );
}

/** * Demo case analysis functions */
export async function demoGenerateCaseSummary(caseId: string): Promise<string> {
 const caseData = mockCaseData[caseId as keyof typeof mockCaseData];
 if (!caseData) return 'Case not found in demo data.';
 await new Promise((resolve) => setTimeout(resolve, 1000));
 return (
 '# ' +
 caseData.title +
 '\n\n## Overview\n\n' +
 caseData.description +
 '\n\n## Evidence Summary\n\n- **Total Evidence Items**: ' +
 caseData.evidence.length +
 '\n\n- **Document Types**: ' +
 Array.from(new Set(caseData.evidence.map((e: any) => e.type))).join(', ') +
 '\n\n- **Date Range**: ' +
 new Date(
 Math.min(...caseData.evidence.map((e: any) => e.uploadedAt.getTime()))
 ).toLocaleDateString() +
 ' - ' +
 new Date(
 Math.max(...caseData.evidence.map((e: any) => e.uploadedAt.getTime()))
 ).toLocaleDateString() +
 '\n\n## Key Findings\n\n' +
 caseData.evidence.map((e: any, i) => i + 1 + '. ' + e.description).join('\n') +
 '\n\n## Recommendations\n\n- Continue evidence collection in identified areas\n\n- Cross-reference digital and physical evidence\n\n- Consider forensic analysis of digital artifacts\n\n- Interview relevant parties identified in communications\n\n*Generated by AI Assistant - ' +
 new Date().toLocaleString() +
 '*'
 );
}




