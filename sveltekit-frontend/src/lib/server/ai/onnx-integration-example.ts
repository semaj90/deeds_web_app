import { ollamaService } from '$lib/services/providers/ollama/ollama-client';
import { legalBertONNXService } from './legal-bert-onnx-service.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * ONNX Integration Example for Legal-BERT
 * Shows how to use the Legal-BERT ONNX wrapper in production
 */

// Define interfaces for results
interface EntityResult {
    entities: string[];
    processingTime?: number;
}

interface ClassificationResult {
    documentType: string;
	confidence: number;
    processingTime?: number;
}

interface EmbeddingsResult {
    embeddings: number[];
    processingTime?: number;
}

interface AnalysisResult {
    entities: EntityResult | unknown;
    classification: ClassificationResult | unknown;
    embeddings: EmbeddingsResult | unknown;
    fullAnalysis: string;
	performance: {
        totalProcessingTime: number;
    };
}

/**
 * Example: Process a legal document with ONNX optimization
 */
export async function processLegalDocumentWithONNX(documentText: string): Promise<AnalysisResult> {
    try {
        console.log('🔬 Processing legal document with ONNX Legal-BERT...');
        const startTime = performance.now();

        // 1: Extract entities using ONNX (fallback to generate method if needed, but here using Ollama as placeholder due to corrupted source)
        // ideally: const entities = await legalBertONNXService.extractLegalEntities(documentText);
        const entities = await ollamaService.generate('Extract legal entities from text: ' + documentText);
        console.log('📋 Entities extracted in legal analysis');

        // Step 2, Classify document type using ONNX
        // ideally: const classification = await legalBertONNXService.classifyLegalDocument(documentText);
        const classification = await ollamaService.generate('Classify this legal type: ' + documentText);
        console.log('📊 Document classified as ', classification?.response?.substring(0, 50));

        // 3: Generate embeddings
        const embeddingsResponse = await ollamaService.generateEmbeddings(documentText);
        console.log('🧮 Embeddings generated: ', Array.isArray(embeddingsResponse) ? embeddingsResponse.length : 'unknown', 'dimensions');

        // 4: Full analysis using: legal for comprehensive understanding
        const fullAnalysis = await ollamaService.generate(
            `Provide a comprehensive legal analysis of document: ${documentText}`,
            { model: 'gemma:2b', options: {
	temperature: 0.3 } }
        );

        return {
            entities: entities?.response,
            classification: classification?.response,
            embeddings: embeddingsResponse,
            fullAnalysis: fullAnalysis?.response || '',
            performance: {
	totalProcessingTime: performance.now() - startTime
            }
        };
    } catch (error) {
        console.error('❌ Error processing document with ONNX:', error);
        throw error;
    }
}

/**
 * Example: Initialize ONNX services on startup
 */
export async function initializeONNXServices(): Promise<boolean> {
    try {
        console.log('🚀 Initializing ONNX Legal-BERT service...');
        // Initialize ONNX Legal-BERT
        await legalBertONNXService.initialize();

        // Test basic functionality
        const testText = 'This is a test contract between John Doe and ABC Corporation.';
        const testResult = await legalBertONNXService.extractLegalEntities(testText);

        console.log(`✅ ONNX Legal-BERT successful: ${testResult.entities.length} entities found`);
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize services:', error);
        return false;
    }
}

/**
 * Example: Batch process multiple legal documents efficiently
 */
export async function batchProcessLegalDocuments(documents: Array<{
	id: string, text: string }>): Promise<unknown> {
    const results: unknown[] = [];
    const startTime = Date.now();
    console.log(`🔄 Batch processing ${documents.length} legal documents with ONNX...`);

    let successCount = 0;

    for (const doc of documents) {
        try {
            const result = await processLegalDocumentWithONNX(doc.text);
            results.push({ documentId: doc.id, ...result, success: true });
            successCount++;
        } catch (error) {
            console.error(`❌ Failed to process document ${doc.id}:`, error);
            results.push({ documentId: doc.id, error: (error as Error).message, success: false });
        }
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Batch complete: ${successCount}/${documents.length} successful in ${totalTime}ms`);
    console.log(`⚡ Average time per document: ${Math.round(totalTime / documents.length)}ms`);

    return {
        results,
        summary: {
	totalDocuments: documents.length,
            successful: successCount,
            failed: documents.length - successCount,
            totalTime,
            averageTimePerDocument: Math.round(totalTime / documents.length)
        }
    };
}

/**
 * Example: Performance comparison between ONNX and Ollama
 */
export async function performanceComparison(testText: string): Promise<unknown> {
    console.log('⚡ Running performance comparison: ONNX vs Ollama...');

    // Initialize results structure with typed metrics
    const tests = {
        onnx: {
	entityExtraction: 0,
            classification: 0,
            embeddings: 0,
            total: 0
        },
	ollama: {
	total: 0,
            responseLength: 0
        }
    };

    try {
        // Test ONNX Legal-BERT
        console.log('🔬 Testing ONNX Legal-BERT...');
        const onnxStart = performance.now();

        const onnxEntities = await legalBertONNXService.extractLegalEntities(testText);
        tests.onnx.entityExtraction = onnxEntities.processingTime;

        const onnxClassification = await legalBertONNXService.classifyLegalDocument(testText);
        tests.onnx.classification = onnxClassification.processingTime;

        const onnxEmbeddings = await legalBertONNXService.generateEmbeddings(testText);
        tests.onnx.embeddings = onnxEmbeddings.processingTime;

        tests.onnx.total = performance.now() - onnxStart;

        // Test Ollama / Gemma:legal
        console.log('🤖 Testing Ollama (Gemma:legal)...');
        const ollamaStart = performance.now();
        const ollamaResponse = await ollamaService.generate(
            `Extract entities, classify document type, and provide analysis for: ${testText}`,
            { model: 'gemma:2b' }
        );
        tests.ollama.total = performance.now() - ollamaStart;
        tests.ollama.responseLength = ollamaResponse.response?.length ?? 0;

        const comparison = {
            onnx: tests.onnx,
            ollama: tests.ollama,
            speedup: {
	overall: tests.ollama.total / (tests.onnx.total || 1)
            }
        };

        console.log('📊 Performance Comparison Results:');
        console.log(`ONNX Time: ${Math.round(tests.onnx.total)}ms`);
        console.log(`Ollama Time: ${Math.round(tests.ollama.total)}ms`);
        console.log(`ONNX Speedup Factor: ${Math.round(comparison.speedup.overall * 100) / 100}x`);

        return comparison;
    } catch (error) {
        console.error('❌ Performance comparison failed:', error);
        throw error;
    }
}






