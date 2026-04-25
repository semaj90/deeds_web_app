/**
 * SvelteKit API Endpoint: QLoRA Training Data Export
 * Exports legal documents in QLoRA training format for fine-tuning
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { postgresqlVectorStorage } from '../../../../lib/services/postgresql-vector-storage.js';
import { autoDocumentFetcher } from '../../../../lib/services/auto-document-fetcher.js';
import fs from 'fs/promises';
import path from 'path';

interface QLoRAExportRequest {
  format: 'jsonl' | 'json' | 'huggingface' | 'csv';
  filters?: {
    document_types?: string[];
    practice_areas?: string[];
    confidence_min?: number;
    limit?: number;
  };
  training_config?: {
    instruction_templates?: string[];
    max_token_length?: number;
    include_context?: boolean;
    difficulty_levels?: number[];
  };
  output_path?: string;
}

interface QLoRAExportResponse {
  success: boolean;
  export_id: string;
  format: string;
  file_path?: string;
  download_url?: string;
  statistics: {
    total_examples: number;
    by_legal_area: Record<string, number>;
    by_difficulty: Record<string, number>;
    avg_token_count: number;
    file_size_mb: number;
  };
  training_config: any;
  processing_time_ms: number;
}

/**
 * POST: Export QLoRA training data
 */
export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();

  try {
    const body: QLoRAExportRequest = await request.json();

    if (!['jsonl', 'json', 'huggingface', 'csv'].includes(body.format)) {
      throw error(400, 'Invalid export format. Supported: jsonl, json, huggingface, csv');
    }

    console.log(`📚 Starting QLoRA export in ${body.format} format...`);

    const exportId = generateExportId();

    // Step 1: Export training data from storage
    const trainingData = await postgresqlVectorStorage.exportForQLoRATraining(body.filters || {});

    if (trainingData.length === 0) {
      throw error(404, 'No documents found matching the specified filters');
    }

    console.log(`📖 Exported ${trainingData.length} training examples`);

    // Step 2: Apply training configuration filters
    const configuredData = applyTrainingConfig(trainingData, body.training_config || {});

    // Step 3: Format and save data
    const outputDir = body.output_path || './data/training';
    await fs.mkdir(outputDir, { recursive: true });

    const fileName = `legal-training-${exportId}.${getFileExtension(body.format)}`;
    const filePath = path.join(outputDir, fileName);

    let fileContent: string;
    let statistics: any;

    switch (body.format) {
      case 'jsonl':
        fileContent = formatAsJSONL(configuredData);
        break;
      case 'json':
        fileContent = formatAsJSON(configuredData);
        break;
      case 'huggingface':
        fileContent = formatAsHuggingFace(configuredData);
        break;
      case 'csv':
        fileContent = formatAsCSV(configuredData);
        break;
      default:
        throw error(400, 'Unsupported format');
    }

    // Write file
    await fs.writeFile(filePath, fileContent, 'utf-8');

    // Calculate statistics
    statistics = calculateStatistics(configuredData, fileContent);

    const processingTime = Date.now() - startTime;

    console.log(
      `✅ QLoRA export completed: ${statistics.total_examples} examples in ${processingTime}ms`
    );

    const response: QLoRAExportResponse = {
      success: true,
      export_id: exportId,
      format: body.format,
      file_path: filePath,
      download_url: `/api/training/download/${exportId}`,
      statistics,
      training_config: body.training_config || {},
      processing_time_ms: processingTime,
    };

    return json(response);
  } catch (err) {
    console.error('❌ QLoRA export failed:', err);
    throw error(500, {
      message: 'QLoRA export failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }
};

/**
 * GET: Get available training data statistics
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    const type = url.searchParams.get('type') || 'stats';

    if (type === 'stats') {
      const stats = await postgresqlVectorStorage.getStorageStatistics();

      return json({
        success: true,
        available_documents: stats.total_documents,
        by_document_type: stats.by_document_type,
        by_practice_area: stats.by_practice_area,
        by_jurisdiction: stats.by_jurisdiction,
        estimated_training_examples: Math.floor(stats.total_documents * 2.5), // Rough estimate
        formats_supported: ['jsonl', 'json', 'huggingface', 'csv'],
      });
    } else if (type === 'templates') {
      const templates = getInstructionTemplates();

      return json({
        success: true,
        instruction_templates: templates,
        template_count: templates.length,
      });
    } else if (type === 'preview') {
      // Generate a small preview of training data
      const limit = parseInt(url.searchParams.get('limit') || '5');
      const previewData = await postgresqlVectorStorage.exportForQLoRATraining({
        limit,
      });

      return json({
        success: true,
        preview_data: previewData,
        sample_count: previewData.length,
      });
    }

    throw error(400, 'Invalid request type');
  } catch (err) {
    console.error('❌ GET request failed:', err);
    throw error(500, {
      message: 'Request failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }
};

/**
 * Helper functions
 */
function applyTrainingConfig(
  data: any[],
  config: QLoRAExportRequest['training_config'] = {}
): any[] {
  let filteredData = [...data];

  // Filter by difficulty levels
  if (config.difficulty_levels?.length) {
    filteredData = filteredData.filter((item) =>
      config.difficulty_levels!.includes(item.metadata.difficulty_level)
    );
  }

  // Filter by token length
  if (config.max_token_length) {
    filteredData = filteredData.filter(
      (item) => item.metadata.token_count <= config.max_token_length!
    );
  }

  // Apply custom instruction templates
  if (config.instruction_templates?.length) {
    const templates = config.instruction_templates;
    filteredData = filteredData.map((item) => ({
      ...item,
      instruction: templates[Math.floor(Math.random() * templates.length)],
    }));
  }

  // Add context if requested
  if (config.include_context) {
    filteredData = filteredData.map((item) => ({
      ...item,
      input: `Context: ${item.metadata.legal_area}\n\n${item.input}`,
    }));
  }

  return filteredData;
}

function formatAsJSONL(data: any[]): string {
  return data
    .map((item) =>
      JSON.stringify({
        instruction: item.instruction,
        input: item.input,
        output: item.output,
      })
    )
    .join('\n');
}

function formatAsJSON(data: any[]): string {
  return JSON.stringify(
    data.map((item) => ({
      instruction: item.instruction,
      input: item.input,
      output: item.output,
      metadata: item.metadata,
    })),
    null,
    2
  );
}

function formatAsHuggingFace(data: any[]): string {
  const formatted = data.map((item) => ({
    text: `### Instruction:\n${item.instruction}\n\n### Input:\n${item.input}\n\n### Response:\n${item.output}`,
  }));

  return JSON.stringify(formatted, null, 2);
}

function formatAsCSV(data: any[]): string {
  const headers = [
    'instruction',
    'input',
    'output',
    'legal_area',
    'difficulty_level',
    'token_count',
  ];
  const rows = data.map((item) => [
    escapeCsvField(item.instruction),
    escapeCsvField(item.input),
    escapeCsvField(item.output),
    item.metadata.legal_area,
    item.metadata.difficulty_level,
    item.metadata.token_count,
  ]);

  return [headers, ...rows].map((row) => row.join(',')).join('\n');
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('\n') || field.includes('"')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function calculateStatistics(data: any[], fileContent: string): any {
  const byLegalArea: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  let totalTokens = 0;

  for (const item of data) {
    const legalArea = item.metadata.legal_area;
    const difficulty = item.metadata.difficulty_level.toString();

    byLegalArea[legalArea] = (byLegalArea[legalArea] || 0) + 1;
    byDifficulty[difficulty] = (byDifficulty[difficulty] || 0) + 1;
    totalTokens += item.metadata.token_count;
  }

  return {
    total_examples: data.length,
    by_legal_area: byLegalArea,
    by_difficulty: byDifficulty,
    avg_token_count: Math.round(totalTokens / data.length),
    file_size_mb: Math.round((Buffer.byteLength(fileContent, 'utf8') / (1024 * 1024)) * 100) / 100,
  };
}

function getInstructionTemplates(): string[] {
  return [
    'Analyze this legal document and provide key insights.',
    'Explain the legal principles discussed in this text.',
    'Summarize the main legal concepts in this document.',
    'What are the key legal issues addressed in this content?',
    'Provide a legal analysis of the following text.',
    'Identify the legal concepts and their implications in this document.',
    'Explain the legal significance of this text.',
    'What legal advice would you give based on this document?',
    'Analyze the legal precedents mentioned in this text.',
    'Explain how this legal document relates to current law.',
    'What are the practical implications of this legal text?',
    'Provide a comprehensive legal interpretation of this document.',
    'Explain the legal framework discussed in this content.',
    'What are the rights and obligations outlined in this legal text?',
    'Analyze the legal reasoning presented in this document.',
  ];
}

function getFileExtension(format: string): string {
  const extensions: Record<string, string> = {
    jsonl: 'jsonl',
    json: 'json',
    huggingface: 'json',
    csv: 'csv',
  };
  return extensions[format] || 'txt';
}

function generateExportId(): string {
  return `qlora_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
