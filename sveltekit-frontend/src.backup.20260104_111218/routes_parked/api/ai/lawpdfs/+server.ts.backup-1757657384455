import type { RequestHandler } from './$types';

/*
 * Enhanced AI Assistant API Route
 * Handles local model processing for law PDFs with gemma3-legal and nomic-embed-text
 */


export interface LawPdfRequest {
  content: string;
  fileName?: string;
  analysisType?: 'basic' | 'comprehensive' | 'legal-focused';
  useLocalModels?: boolean;
  modelPreferences?: {
    summaryModel?: string;
    embeddingModel?: string;
  };
}

export interface LawPdfResponse {
  summary: string;
  entities: Array<{
    text: string;
    type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'LEGAL_CONCEPT' | 'DATE';
    confidence: number;
  }>;
  legalConcepts: Array<{
    concept: string;
    relevance: number;
    definition?: string;
  }>;
  keyTerms: string[];
  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high';
    riskFactors: string[];
    recommendations: string[];
  };
  embedding?: number[];
  metadata: {
    processingTime: number;
    modelUsed: string;
    embeddingModel: string;
    localProcessing: boolean;
    confidence: number;
  };
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const startTime = Date.now();

  try {
    // Check if this is a file upload request (multipart/form-data)
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle file upload with evidence processing pipeline
      return await handleFileUpload(request, locals);
    }
    
    // Handle JSON request (existing API)
    const body: LawPdfRequest = await request.json();
    const {
      content,
      fileName = 'document.pdf',
      analysisType = 'comprehensive',
      useLocalModels = true,
      modelPreferences = {},
    } = body;

    if (!content) {
      return json({ error: 'Content is required' }, { status: 400 });
    }

    // Model configuration with local preferences
    const summaryModel = modelPreferences.summaryModel || 'gemma3-legal:latest';
    const embeddingModel = modelPreferences.embeddingModel || 'nomic-embed-text:latest';

    let response: LawPdfResponse;

    if (useLocalModels) {
      response = await processWithLocalModels(content, summaryModel, embeddingModel, analysisType);
    } else {
      response = await processWithCloudFallback(content, analysisType);
    }

    // Add processing metadata
    response.metadata = {
      ...response.metadata,
      processingTime: Date.now() - startTime,
      localProcessing: useLocalModels,
    };

    return json(response);
  } catch (error: any) {
    console.error('[LawPDF API] Processing failed:', error);
    const message = error instanceof Error ? error.message : String(error);

    return json(
      {
        error: 'Document processing failed',
        details: message,
        fallbackSuggestion: 'Try with useLocalModels: false for cloud processing',
      },
      { status: 500 }
    );
  }
};

async function handleFileUpload(request: Request, locals: any): Promise<any> {
  try {
    console.log('[LawPDF] Handling file upload with evidence processing pipeline');
    
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const enableOCR = formData.get('enableOCR') === 'true';
    const enableEmbedding = formData.get('enableEmbedding') === 'true';
    const enableRAG = formData.get('enableRAG') === 'true';
    
    if (files.length === 0) {
      return json({ error: 'No files provided' }, { status: 400 });
    }
    
    const results = [];
    
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        results.push({
          filename: file.name,
          success: false,
          error: 'Only PDF files are supported'
        });
        continue;
      }
      
      try {
        // Generate evidence ID for this file
        const evidenceId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // TODO: Save file to MinIO or file system
        // For now, we'll simulate file storage
        console.log(`[LawPDF] Saving file ${file.name} as evidence ${evidenceId}`);
        
        // Prepare processing steps
        const steps = [];
        if (enableOCR) steps.push('ocr');
        if (enableEmbedding) steps.push('embedding');
        if (enableRAG) steps.push('analysis');
        
        if (steps.length === 0) {
          steps.push('analysis'); // Default step
        }
        
        // Start evidence processing pipeline
        const processResponse = await fetch(`${new URL(request.url).origin}/api/evidence/process`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('Cookie') || '' // Forward auth cookies
          },
          body: JSON.stringify({
            evidenceId,
            steps
          })
        });
        
        if (!processResponse.ok) {
          throw new Error(`Evidence processing failed: ${processResponse.status}`);
        }
        
        const { sessionId } = await processResponse.json();
        
        results.push({
          filename: file.name,
          success: true,
          documentId: evidenceId,
          sessionId,
          steps,
          contentLength: file.size,
          embeddingGenerated: enableEmbedding,
          processingTime: 'In progress',
          webSocketUrl: `${new URL(request.url).origin.replace(/^http/, 'ws')}/api/evidence/stream/${sessionId}`
        });
        
      } catch (error: any) {
        console.error(`[LawPDF] Failed to process file ${file.name}:`, error);
        results.push({
          filename: file.name,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    return json({
      success: successCount > 0,
      results,
      message: `${successCount}/${files.length} files queued for processing`,
      totalFiles: files.length,
      successfulFiles: successCount,
      failedFiles: files.length - successCount
    });
    
  } catch (error: any) {
    console.error('[LawPDF] File upload handling failed:', error);
    return json(
      {
        success: false,
        error: 'File upload processing failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

async function processWithLocalModels(
  content: string,
  summaryModel: string,
  embeddingModel: string,
  analysisType: string
): Promise<LawPdfResponse> {
  // Enhanced legal prompt for gemma3-legal
  const legalPrompt = buildLegalAnalysisPrompt(content, analysisType);

  try {
    // 1. Generate comprehensive legal summary with gemma3-legal
    const summaryResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: summaryModel.replace(':latest', ''),
        prompt: legalPrompt,
        stream: false,
        options: {
          temperature: 0.3, // Lower temperature for legal accuracy
          top_p: 0.9,
          max_tokens: 1500,
          stop: ['<|end|>', '\n\n---'],
        },
      }),
    });

    if (!summaryResponse.ok) {
      throw new Error(`Ollama summary failed: ${summaryResponse.status}`);
    }

    const summaryData = await summaryResponse.json();
    const analysisText = summaryData.response || '';

    // 2. Generate embeddings with nomic-embed-text
    let embedding: number[] | undefined;
    try {
      const embeddingResponse = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: embeddingModel.replace(':latest', ''),
          prompt: content.substring(0, 2000), // Limit for embedding
        }),
      });

      if (embeddingResponse.ok) {
        const embeddingData = await embeddingResponse.json();
        embedding = embeddingData.embedding || embeddingData.embeddings;
      }
    } catch (error: any) {
      console.warn('[LawPDF] Embedding generation failed:', error);
    }

    // 3. Parse the structured analysis from gemma3-legal response
    const parsedAnalysis = parseGemmaLegalResponse(analysisText);

    return {
      summary: parsedAnalysis.summary,
      entities: parsedAnalysis.entities,
      legalConcepts: parsedAnalysis.legalConcepts,
      keyTerms: parsedAnalysis.keyTerms,
      riskAssessment: parsedAnalysis.riskAssessment,
      embedding,
      metadata: {
        processingTime: 0, // Will be set by caller
        modelUsed: summaryModel,
        embeddingModel,
        localProcessing: true,
        confidence: parsedAnalysis.confidence,
      },
    };
  } catch (error: any) {
    console.error('[LawPDF] Local processing failed:', error);
    // Fallback to basic processing
    return await processWithCloudFallback(content, analysisType);
  }
}

async function processWithCloudFallback(
  content: string,
  analysisType: string
): Promise<LawPdfResponse> {
  // Basic fallback processing without external dependencies
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const summary = sentences.slice(0, 3).join('. ') + '.';

  // Simple entity extraction
  const entities = extractBasicEntities(content);

  // Basic legal concept detection
  const legalConcepts = detectLegalConcepts(content);

  // Simple keyword extraction
  const keyTerms = extractKeyTerms(content);

  // Basic risk assessment
  const riskAssessment = assessBasicRisk(content);

  return {
    summary,
    entities,
    legalConcepts,
    keyTerms,
    riskAssessment,
    metadata: {
      processingTime: 0,
      modelUsed: 'fallback-processor',
      embeddingModel: 'none',
      localProcessing: false,
      confidence: 0.6,
    },
  };
}

function buildLegalAnalysisPrompt(content: string, analysisType: string): string {
  const basePrompt = `As a legal AI assistant, analyze this document and provide a comprehensive legal analysis.

Document Content:
${content.substring(0, 3000)}

Please provide your analysis in the following structured format:

SUMMARY:
[Provide a clear, concise summary of the document's main legal points]

ENTITIES:
[List key persons, organizations, locations, and dates mentioned]

LEGAL CONCEPTS:
[Identify important legal concepts, terms, and principles]

KEY TERMS:
[Extract the most important legal terms and phrases]

RISK ASSESSMENT:
[Evaluate potential legal risks and provide recommendations]

Focus on accuracy and legal precision. Use clear, professional language.`;

  const enhancedPrompts = {
    basic: basePrompt,
    comprehensive:
      basePrompt +
      '\n\nProvide detailed analysis with citations and cross-references where applicable.',
    'legal-focused':
      basePrompt +
      '\n\nFocus particularly on contract terms, obligations, liabilities, and enforceability issues.',
  };

  return enhancedPrompts[analysisType] || enhancedPrompts['comprehensive'];
}
function parseGemmaLegalResponse(response: string): {
  summary: string;
  entities: LawPdfResponse['entities'];
  legalConcepts: LawPdfResponse['legalConcepts'];
  keyTerms: string[];
  riskAssessment: LawPdfResponse['riskAssessment'];
  confidence: number;
} {
  const sections: {
    summary: string;
    entities: LawPdfResponse['entities'];
    legalConcepts: LawPdfResponse['legalConcepts'];
    keyTerms: string[];
    riskAssessment: LawPdfResponse['riskAssessment'];
    confidence: number;
  } = {
    summary: '',
    entities: [] as LawPdfResponse['entities'],
    legalConcepts: [] as LawPdfResponse['legalConcepts'],
    keyTerms: [],
    riskAssessment: {
      riskLevel: 'medium',
      riskFactors: [],
      recommendations: [],
    },
    confidence: 0.8,
  };

  try {
    const summaryMatch = response.match(/SUMMARY:\s*(.*?)(?=\n\n|ENTITIES:|$)/s);
    if (summaryMatch) {
      sections.summary = summaryMatch[1].trim();
    }

    const entitiesMatch = response.match(/ENTITIES:\s*(.*?)(?=\n\n|LEGAL CONCEPTS:|$)/s);
    if (entitiesMatch) {
      const entityLines = entitiesMatch[1].split('\n').filter((line) => line.trim());
      sections.entities = entityLines
        .map((line) => ({
          text: line.replace(/^[-•*]\s*/, '').trim(),
          type: 'LEGAL_CONCEPT' as const,
          confidence: 0.8,
        }))
        .slice(0, 10);
    }

    const conceptsMatch = response.match(/LEGAL CONCEPTS:\s*(.*?)(?=\n\n|KEY TERMS:|$)/s);
    if (conceptsMatch) {
      const conceptLines = conceptsMatch[1].split('\n').filter((line) => line.trim());
      sections.legalConcepts = conceptLines
        .map((line) => ({
          concept: line.replace(/^[-•*]\s*/, '').trim(),
          relevance: 0.8,
        }))
        .slice(0, 8);
    }

    const termsMatch = response.match(/KEY TERMS:\s*(.*?)(?=\n\n|RISK ASSESSMENT:|$)/s);
    if (termsMatch) {
      sections.keyTerms = termsMatch[1]
        .split(/[,\n]/)
        .map((term) => term.replace(/^[-•*]\s*/, '').trim())
        .filter((term: string) => term.length > 2)
        .slice(0, 15);
    }

    const riskMatch = response.match(/RISK ASSESSMENT:\s*(.*?)$/s);
    if (riskMatch) {
      const riskText = riskMatch[1];

      if (
        riskText.toLowerCase().includes('high risk') ||
        riskText.toLowerCase().includes('significant risk')
      ) {
        sections.riskAssessment.riskLevel = 'high';
      } else if (
        riskText.toLowerCase().includes('low risk') ||
        riskText.toLowerCase().includes('minimal risk')
      ) {
        sections.riskAssessment.riskLevel = 'low';
      }

      const riskLines = riskText.split('\n').filter((line) => line.trim());
      sections.riskAssessment.riskFactors = riskLines
        .filter(
          (line) => line.toLowerCase().includes('risk') || line.toLowerCase().includes('concern')
        )
        .slice(0, 5);

      sections.riskAssessment.recommendations = riskLines
        .filter(
          (line) =>
            line.toLowerCase().includes('recommend') || line.toLowerCase().includes('should')
        )
        .slice(0, 5);
    }
  } catch (error: any) {
    console.warn('[LawPDF] Failed to parse gemma3-legal response:', error);
    sections.summary = response.substring(0, 500) + '...';
  }

  return sections;
}

// Fallback processing functions
function extractBasicEntities(content: string) {
  const entities = [];

  // Simple regex patterns for common legal entities
  const patterns = {
    PERSON: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
    ORGANIZATION: /\b[A-Z][a-z]+ (?:Inc|Corp|LLC|Ltd|Company)\b/g,
    DATE: /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g,
    LEGAL_CONCEPT: /\b(?:contract|agreement|liability|warranty|indemnification|termination)\b/gi,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    const matches = content.match(pattern) || [];
    matches.slice(0, 5).forEach((match) => {
      entities.push({
        text: match,
        type: type as any,
        confidence: 0.7,
      });
    });
  }

  return entities;
}

function detectLegalConcepts(content: string) {
  const concepts = [
    'Contract Law',
    'Liability',
    'Intellectual Property',
    'Employment Law',
    'Corporate Governance',
    'Regulatory Compliance',
    'Data Privacy',
  ];

  return concepts
    .filter((concept) => content.toLowerCase().includes(concept.toLowerCase()))
    .map((concept) => ({
      concept,
      relevance: 0.7,
    }));
}

function extractKeyTerms(content: string) {
  const commonLegalTerms = [
    'agreement',
    'contract',
    'liability',
    'warranty',
    'indemnification',
    'termination',
    'breach',
    'damages',
    'confidentiality',
    'intellectual property',
  ];

  return commonLegalTerms.filter((term) => content.toLowerCase().includes(term)).slice(0, 10);
}

function assessBasicRisk(content: string) {
  const highRiskKeywords = ['unlimited liability', 'personal guarantee', 'liquidated damages'];
  const mediumRiskKeywords = ['termination', 'breach', 'penalty'];

  const hasHighRisk = highRiskKeywords.some((keyword) => content.toLowerCase().includes(keyword));

  const hasMediumRisk = mediumRiskKeywords.some((keyword) =>
    content.toLowerCase().includes(keyword)
  );

  return {
    riskLevel: hasHighRisk
      ? ('high' as const)
      : hasMediumRisk
        ? ('medium' as const)
        : ('low' as const),
    riskFactors: hasHighRisk
      ? ['High liability exposure detected']
      : hasMediumRisk
        ? ['Standard contractual risks']
        : ['Low risk profile'],
    recommendations: hasHighRisk
      ? ['Review with legal counsel', 'Consider liability caps']
      : hasMediumRisk
        ? ['Standard legal review recommended']
        : ['Minimal legal review required'],
  };
}
