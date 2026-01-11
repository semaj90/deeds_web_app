import type { RequestHandler } from './$types';

/*
 * Document Drafting Assistant API Endpoint
 * Provides AI-powered legal document drafting assistance with templates and guidance
 */

import { synthesizeAIInput, processAIAssistantQuery } from "$lib/services/comprehensive-database-orchestrator";

export interface DocumentDraftingRequest {
  documentType: string;
  jurisdiction?: string;
  parties: {
    role: string;
    name: string;
    type?: 'individual' | 'corporation' | 'government';
  }[];
  keyTerms?: {
    [key: string]: unknown;
  };
  templateId?: string;
  userRole?: string;
  complexity?: 'simple' | 'standard' | 'complex';
  urgency?: 'low' | 'normal' | 'high';
  customRequirements?: string;
}

export interface DraftingAssistance {
  documentStructure: {
    section: string;
    description: string;
    required: boolean;
    template?: string;
    guidance?: string[];
  }[];
  templateContent: string;
  legalConsiderations: string[];
  complianceChecklist: string[];
  commonPitfalls: string[];
  nextSteps: string[];
}

export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();

  try {
    const body: DocumentDraftingRequest = await request.json();
    const {
      documentType,
      jurisdiction = 'federal',
      parties,
      keyTerms = {},
      templateId,
      userRole,
      complexity = 'standard',
      urgency = 'normal',
      customRequirements,
    } = body;

    if (!documentType?.trim()) {
      return json({ error: 'Document type is required' }, { status: 400 });
    }

    if (!parties?.length) {
      return json({ error: 'At least one party must be specified' }, { status: 400 });
    }

    // Generate drafting assistance
    const assistance = await generateDraftingAssistance(body);

    // Generate AI-powered content suggestions
    const aiSuggestions = await generateAIContentSuggestions(body, assistance);

    // Create compliance analysis
    const complianceAnalysis = await generateComplianceAnalysis(body);

    // Calculate drafting confidence
    const confidence = calculateDraftingConfidence(body, assistance);

    const response = {
      documentType,
      assistance,
      aiSuggestions,
      complianceAnalysis,
      metadata: {
        processingTime: Date.now() - startTime,
        jurisdiction,
        complexity,
        urgency,
        userRole,
        confidence,
        partiesCount: parties.length,
        templateUsed: templateId || 'auto-generated',
      },
      recommendations: generateDraftingRecommendations(body, assistance),
    };

    return json(response);
  } catch (error: any) {
    console.error('Document drafting API error:', error);

    return json(
      {
        error: 'Drafting assistance failed',
        message: error.message,
        processingTime: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
};

async function generateDraftingAssistance(
  request: DocumentDraftingRequest
): Promise<DraftingAssistance> {
  const { documentType, jurisdiction, parties, complexity } = request;

  // Get document template and structure
  const documentStructure = getDocumentStructure(documentType, jurisdiction);
  const templateContent = await generateTemplateContent(request, documentStructure);

  // Generate legal considerations
  const legalConsiderations = generateLegalConsiderations(documentType, jurisdiction, complexity);

  // Create compliance checklist
  const complianceChecklist = generateComplianceChecklist(documentType, jurisdiction);

  // Identify common pitfalls
  const commonPitfalls = generateCommonPitfalls(documentType, parties);

  // Generate next steps
  const nextSteps = generateNextSteps(documentType, complexity);

  return {
    documentStructure,
    templateContent,
    legalConsiderations,
    complianceChecklist,
    commonPitfalls,
    nextSteps,
  };
}

function getDocumentStructure(documentType: string, jurisdiction: string) {
  const commonStructures = {
    contract: [
      {
        section: 'Title and Parties',
        description: 'Document title and identification of all parties',
        required: true,
        guidance: ['Use full legal names', 'Include addresses', 'Specify entity types'],
      },
      {
        section: 'Recitals',
        description: 'Background information and purpose',
        required: false,
        guidance: ['Provide context', 'State purpose', 'Reference relevant facts'],
      },
      {
        section: 'Definitions',
        description: 'Key terms and definitions',
        required: true,
        guidance: ['Define technical terms', 'Avoid ambiguity', 'Use consistent terminology'],
      },
      {
        section: 'Terms and Conditions',
        description: 'Main contractual obligations',
        required: true,
        guidance: [
          'Clearly state obligations',
          'Include performance standards',
          'Specify deadlines',
        ],
      },
      {
        section: 'Payment Terms',
        description: 'Payment obligations and schedules',
        required: true,
        guidance: ['Specify amounts', 'Include due dates', 'Address late payments'],
      },
      {
        section: 'Term and Termination',
        description: 'Contract duration and termination provisions',
        required: true,
        guidance: [
          'State contract period',
          'Include termination events',
          'Address post-termination obligations',
        ],
      },
      {
        section: 'Dispute Resolution',
        description: 'Mechanisms for resolving disputes',
        required: true,
        guidance: ['Specify governing law', 'Include arbitration clauses', 'Define jurisdiction'],
      },
      {
        section: 'Miscellaneous',
        description: 'General provisions',
        required: true,
        guidance: ['Include entire agreement clause', 'Address amendments', 'Include signatures'],
      },
    ],
    motion: [
      {
        section: 'Caption',
        description: 'Court identification and case information',
        required: true,
        guidance: ['Include court name', 'Case number', 'Party names and roles'],
      },
      {
        section: 'Introduction',
        description: 'Motion purpose and relief sought',
        required: true,
        guidance: ['State motion type', 'Summarize relief requested', 'Cite applicable rules'],
      },
      {
        section: 'Statement of Facts',
        description: 'Relevant factual background',
        required: true,
        guidance: [
          'Present facts chronologically',
          'Include only relevant facts',
          'Cite to record',
        ],
      },
      {
        section: 'Legal Argument',
        description: 'Legal basis for relief',
        required: true,
        guidance: ['Cite applicable law', 'Apply law to facts', 'Address counterarguments'],
      },
      {
        section: 'Conclusion',
        description: 'Summary and requested relief',
        required: true,
        guidance: ['Summarize argument', 'Specify relief requested', 'Include prayer for relief'],
      },
    ],
    brief: [
      {
        section: 'Table of Contents',
        description: 'Document outline with page numbers',
        required: true,
        guidance: [
          'Include all major sections',
          'Update page numbers',
          'Use consistent formatting',
        ],
      },
      {
        section: 'Table of Authorities',
        description: 'Cases, statutes, and other authorities cited',
        required: true,
        guidance: ['Alphabetize by type', 'Include pinpoint citations', 'Update before filing'],
      },
      {
        section: 'Statement of Issues',
        description: 'Questions presented for review',
        required: true,
        guidance: [
          'Frame issues favorably',
          'Be specific and concrete',
          'Include standard of review',
        ],
      },
      {
        section: 'Statement of Facts',
        description: 'Relevant factual and procedural background',
        required: true,
        guidance: ['Present facts persuasively', 'Cite to record', 'Include procedural history'],
      },
      {
        section: 'Summary of Argument',
        description: 'Concise overview of legal arguments',
        required: true,
        guidance: ['Provide roadmap', 'Highlight key points', 'Keep concise'],
      },
      {
        section: 'Argument',
        description: 'Detailed legal analysis',
        required: true,
        guidance: ['Use clear headings', 'Apply law to facts', 'Address opposing arguments'],
      },
      {
        section: 'Conclusion',
        description: 'Summary and requested relief',
        required: true,
        guidance: ['Restate key points', 'Specify relief requested', 'End persuasively'],
      },
    ],
  };

  return commonStructures[documentType.toLowerCase()] || commonStructures['contract'];
}

async function generateTemplateContent(
  request: DocumentDraftingRequest,
  structure: any[]
): Promise<string> {
  const { documentType, parties, keyTerms, jurisdiction } = request;

  let template = `${documentType.toUpperCase()}\n\n`;

  // Add parties section
  template += `PARTIES:\n`;
  parties.forEach((party, index) => {
    template += `${index + 1}. ${party.name} ("${party.role}")\n`;
  });
  template += `\n`;

  // Add structure sections
  structure.forEach((section) => {
    template += `${section.section.toUpperCase()}\n`;
    template += `[${section.description}]\n\n`;

    if (section.guidance) {
      template += `Guidance:\n`;
      section.guidance.forEach((guide) => {
        template += `• ${guide}\n`;
      });
      template += `\n`;
    }
  });

  // Add jurisdiction-specific notes
  template += `JURISDICTION NOTES (${jurisdiction}):\n`;
  template += `[Include any jurisdiction-specific requirements or considerations]\n\n`;

  return template;
}

function generateLegalConsiderations(
  documentType: string,
  jurisdiction: string,
  complexity: string
): string[] {
  const considerations = [];

  // Document-specific considerations
  switch (documentType.toLowerCase()) {
    case 'contract':
      considerations.push(
        'Ensure all essential contract elements are present (offer, acceptance, consideration)'
      );
      considerations.push('Include clear performance standards and deadlines');
      considerations.push('Address intellectual property ownership if applicable');
      considerations.push('Consider force majeure and impossibility clauses');
      break;
    case 'motion':
      considerations.push('Verify proper court jurisdiction and venue');
      considerations.push('Ensure compliance with local court rules');
      considerations.push('Include proper service and notice requirements');
      considerations.push('Consider timing requirements and deadlines');
      break;
    case 'brief':
      considerations.push('Comply with page and word limits');
      considerations.push('Follow court formatting requirements');
      considerations.push('Ensure all citations are accurate and complete');
      considerations.push('Address standard of review appropriately');
      break;
  }

  // Jurisdiction considerations
  if (jurisdiction === 'federal') {
    considerations.push('Review Federal Rules of Civil Procedure');
    considerations.push('Consider federal question or diversity jurisdiction');
  } else {
    considerations.push(`Review ${jurisdiction} state law requirements`);
    considerations.push('Consider state-specific procedural rules');
  }

  // Complexity considerations
  if (complexity === 'complex') {
    considerations.push('Consider engaging specialized counsel');
    considerations.push('Plan for extended review and revision process');
    considerations.push('Document decision-making process');
  }

  return considerations;
}

function generateComplianceChecklist(documentType: string, jurisdiction: string): string[] {
  const checklist = [
    'Review applicable statutes and regulations',
    'Verify compliance with court rules if applicable',
    'Check signature and notarization requirements',
    'Confirm proper service methods if required',
    'Review filing deadlines and procedures',
  ];

  // Document-specific compliance
  switch (documentType.toLowerCase()) {
    case 'contract':
      checklist.push('Verify parties have authority to enter contract');
      checklist.push('Ensure consideration is adequate');
      checklist.push('Check for required disclosures');
      break;
    case 'motion':
      checklist.push('Verify meet and confer requirements');
      checklist.push('Check supporting documentation requirements');
      checklist.push('Confirm proper notice to all parties');
      break;
  }

  return checklist;
}

function generateCommonPitfalls(documentType: string, parties: any[]): string[] {
  const pitfalls = [
    'Ambiguous or unclear language',
    'Missing essential terms or conditions',
    'Inconsistent terminology throughout document',
    'Failure to consider all relevant parties',
    'Inadequate dispute resolution provisions',
  ];

  // Document-specific pitfalls
  switch (documentType.toLowerCase()) {
    case 'contract':
      pitfalls.push('Unclear payment terms or schedules');
      pitfalls.push('Missing termination clauses');
      pitfalls.push('Inadequate liability limitations');
      break;
    case 'motion':
      pitfalls.push('Insufficient factual support');
      pitfalls.push('Failure to address counterarguments');
      pitfalls.push('Missing procedural requirements');
      break;
  }

  // Party-specific considerations
  if (parties.some((p) => p.type === 'corporation')) {
    pitfalls.push('Failure to verify corporate authority');
    pitfalls.push('Missing corporate resolutions if required');
  }

  return pitfalls;
}

function generateNextSteps(documentType: string, complexity: string): string[] {
  const steps = [
    'Review and refine draft document',
    'Obtain necessary approvals from stakeholders',
    'Conduct legal review with counsel',
    'Prepare for execution and implementation',
  ];

  if (complexity === 'complex') {
    steps.unshift('Schedule planning meeting with all stakeholders');
    steps.push('Develop implementation timeline');
    steps.push('Create compliance monitoring procedures');
  }

  switch (documentType.toLowerCase()) {
    case 'motion':
      steps.push('Prepare supporting documentation');
      steps.push('Schedule hearing if required');
      steps.push('File with court and serve opposing parties');
      break;
    case 'contract':
      steps.push('Negotiate terms with counterparty');
      steps.push('Execute original documents');
      steps.push('Distribute copies to all parties');
      break;
  }

  return steps;
}

async function generateAIContentSuggestions(
  request: DocumentDraftingRequest,
  assistance: DraftingAssistance
): Promise<string> {
  const prompt = `Generate specific content suggestions for a ${request.documentType} involving:

Parties: ${request.parties.map((p) => `${p.name} (${p.role})`).join(', ')}
Jurisdiction: ${request.jurisdiction}
Complexity: ${request.complexity}

Key considerations:
${assistance.legalConsiderations.join('\n')}

Provide specific language suggestions and alternatives for key sections:`;

  try {
    return await ollamaService.generateCompletion(prompt, {
      temperature: 0.4,
      maxTokens: 800,
    });
  } catch (error: any) {
    console.warn('AI content suggestions failed:', error);

    return `Content Suggestions for ${request.documentType}:

Key Language Recommendations:
• Use clear, unambiguous terms throughout
• Define technical or legal terms in a definitions section
• Include specific performance metrics where applicable
• Consider alternative dispute resolution mechanisms

For ${request.parties.length} parties: Ensure balanced obligations and mutual considerations.
Jurisdiction (${request.jurisdiction}): Review applicable local law requirements.
Complexity (${request.complexity}): ${request.complexity === 'complex' ? 'Consider phased implementation and detailed specifications.' : 'Focus on essential terms and clear obligations.'}`;
  }
}

async function generateComplianceAnalysis(request: DocumentDraftingRequest): Promise<string> {
  const analysisPoints = [];

  // Jurisdiction compliance
  analysisPoints.push(`${request.jurisdiction} Jurisdiction Requirements:`);
  analysisPoints.push(`• Review applicable state/federal law`);
  analysisPoints.push(`• Verify court rules compliance if litigation document`);

  // Document type compliance
  switch (request.documentType.toLowerCase()) {
    case 'contract':
      analysisPoints.push('Contract Formation Requirements:');
      analysisPoints.push('• Ensure mutual assent and consideration');
      analysisPoints.push('• Verify parties have capacity to contract');
      break;
    case 'motion':
      analysisPoints.push('Motion Practice Requirements:');
      analysisPoints.push('• Comply with court deadlines and procedures');
      analysisPoints.push('• Include proper citations and legal authority');
      break;
  }

  // Party-specific compliance
  if (request.parties.some((p) => p.type === 'corporation')) {
    analysisPoints.push('Corporate Compliance:');
    analysisPoints.push('• Verify corporate authority and good standing');
    analysisPoints.push('• Consider required board resolutions');
  }

  return analysisPoints.join('\n');
}

function calculateDraftingConfidence(
  request: DocumentDraftingRequest,
  assistance: DraftingAssistance
): number {
  let confidence = 0.5; // Base confidence

  // Boost from clear document type
  const recognizedTypes = ['contract', 'motion', 'brief', 'agreement', 'complaint'];
  if (recognizedTypes.includes(request.documentType.toLowerCase())) {
    confidence += 0.2;
  }

  // Boost from complete party information
  if (request.parties.every((p) => p.name && p.role)) {
    confidence += 0.15;
  }

  // Boost from jurisdiction specification
  if (request.jurisdiction) {
    confidence += 0.1;
  }

  // Boost from structure completeness
  const requiredSections = assistance.documentStructure.filter((s) => s.required);
  confidence += requiredSections.length * 0.02;

  return Math.min(confidence, 0.95);
}

function generateDraftingRecommendations(
  request: DocumentDraftingRequest,
  assistance: DraftingAssistance
): string[] {
  const recommendations = [];

  // Based on complexity
  switch (request.complexity) {
    case 'simple':
      recommendations.push('Use standard templates and proven language');
      recommendations.push('Focus on essential terms and clear obligations');
      break;
    case 'complex':
      recommendations.push('Engage specialized legal counsel for review');
      recommendations.push('Plan for iterative drafting and stakeholder review');
      recommendations.push('Consider phased implementation approach');
      break;
  }

  // Based on urgency
  switch (request.urgency) {
    case 'high':
      recommendations.push('Prioritize essential terms over comprehensive coverage');
      recommendations.push('Use proven templates to accelerate drafting');
      break;
    case 'low':
      recommendations.push('Take time for comprehensive legal research');
      recommendations.push('Consider innovative approaches and recent legal developments');
      break;
  }

  // General recommendations
  recommendations.push('Maintain version control throughout drafting process');
  recommendations.push('Document rationale for key drafting decisions');
  recommendations.push('Plan for regular stakeholder review and feedback');

  return recommendations;
}
