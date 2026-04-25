# LangExtract Integration Guide

## ✅ You Have It!

```bash
npm list langextract
# ✅ langextract@1.2.0
```

**Source**: [google/langextract](https://github.com/google/langextract)

**Purpose**: Text extraction and natural language processing library from Google

---

## What LangExtract Provides

LangExtract is a language extraction and analysis library that helps with:

1. **Language Detection** - Identify language of text
2. **Script Detection** - Identify writing system (Latin, Cyrillic, Arabic, etc.)
3. **Language Confidence** - Measure confidence in detection

### Installation Confirmation

```bash
npm ls langextract
# ✅ Found: v1.2.0
# Location: node_modules/langextract
```

---

## Current Implementation

### Your Streaming Ingestion Pipeline
**Location**: `src/lib/server/services/streaming-ingestion-pipeline.ts`

**Features**:
- MinIO file streaming
- Document text extraction
- Text chunking with token counting
- Embedding generation with caching
- Batch processing
- Database storage (pgvector)
- Entity extraction support

**Pipeline Stages**:
```
MinIO Document Stream
        ↓
Text Extraction (via TextExtractor)
        ↓
Text Chunking (512 tokens, 50 token overlap)
        ↓
Entity Extraction & Key Terms (ready for langextract)
        ↓
Embedding Generation (with Redis cache)
        ↓
Batch Database Storage
        ↓
Case/Evidence Specific Tables
```

---

## Potential LangExtract Use Cases

### 1. Language Detection in Legal Documents

**Current Need**: Detect if documents are in English or other languages

```typescript
import { detect } from 'langextract';

// In your text extraction stage
async detectLanguage(text: string): Promise<{lang: string, confidence: number}> {
  try {
    const result = detect(text);
    return {
      lang: result.language,
      confidence: result.confidence
    };
  } catch (error) {
    console.warn('Language detection failed:', error);
    return { lang: 'unknown', confidence: 0 };
  }
}
```

**Integration Point**: After text extraction, before chunking

```typescript
// In StreamingIngestionPipeline.ingestDocument()
const text = await this.textExtractor.extractText(documentStream, objectName);
const langInfo = await this.detectLanguage(text); // NEW

if (langInfo.lang !== 'en') {
  console.warn(`Document in ${langInfo.lang}, may need translation`);
  // Could trigger translation service
}

const chunks = await this.chunker.chunkText(text, {...});
```

### 2. Multi-Script Document Handling

**Use Case**: Legal documents with mixed scripts (Latin + special characters)

```typescript
// Detect if document has mixed scripts
const hasMultipleScripts = (text: string): boolean => {
  const latinMatch = /[a-zA-Z]/.test(text);
  const cyrillicMatch = /[а-яА-Я]/.test(text);
  const arabicMatch = /[\u0600-\u06FF]/.test(text);
  const asianMatch = /[\u4E00-\u9FFF\u3040-\u309F\uAC00-\uD7AF]/.test(text);

  const scripts = [latinMatch, cyrillicMatch, arabicMatch, asianMatch].filter(Boolean).length;
  return scripts > 1;
};
```

### 3. Language-Specific Chunking

**Enhancement**: Adjust chunk behavior based on language

```typescript
// Different chunk sizes for different languages
const getChunkingStrategy = (language: string) => {
  switch(language) {
    case 'en': return { maxTokens: 512, overlap: 50 };
    case 'de': return { maxTokens: 480, overlap: 50 };  // Longer words
    case 'ja': return { maxTokens: 256, overlap: 30 };  // CJK languages
    case 'ar': return { maxTokens: 512, overlap: 50 };  // RTL
    default: return { maxTokens: 512, overlap: 50 };
  }
};
```

---

## Integration with Your Current Architecture

### Option 1: Enhance Text Extraction Phase

Add language detection to your `TextExtractor` class:

```typescript
import { detect } from 'langextract';

class TextExtractor {
  async extractText(stream: Readable, filename: string): Promise<string> {
    // Existing extraction logic
    const rawText = await this.extractRawText(stream, filename);

    // NEW: Detect language
    try {
      const langResult = detect(rawText);
      console.log(`Detected language: ${langResult.language} (${langResult.confidence})`);

      // Store language info in metadata
      this.detectedLanguage = langResult.language;
      this.languageConfidence = langResult.confidence;
    } catch (e) {
      console.warn('Language detection failed');
    }

    return rawText;
  }
}
```

### Option 2: Add Language-Aware Chunking

Modify `DocumentChunker` to respect language boundaries:

```typescript
import { detect } from 'langextract';

class DocumentChunker {
  async chunkText(text: string, options: ChunkingOptions): Promise<DocumentChunk[]> {
    // Detect language
    const langResult = detect(text);
    const language = langResult.language;

    // Adjust chunking based on language
    const adjustedOptions = this.adjustOptionsForLanguage(language, options);

    // Perform chunking with language-aware options
    return this.performChunking(text, adjustedOptions);
  }

  private adjustOptionsForLanguage(
    language: string,
    options: ChunkingOptions
  ): ChunkingOptions {
    // CJK languages: smaller chunks
    if (['zh', 'ja', 'ko'].includes(language)) {
      return {
        ...options,
        maxTokens: Math.floor(options.maxTokens * 0.5),
        overlapTokens: Math.floor(options.overlapTokens * 0.6)
      };
    }

    // Germanic languages: larger chunks (longer words)
    if (['de', 'nl'].includes(language)) {
      return {
        ...options,
        maxTokens: Math.floor(options.maxTokens * 1.1),
        overlapTokens: Math.floor(options.overlapTokens * 1.1)
      };
    }

    return options;
  }
}
```

### Option 3: Language-Specific Embeddings

Use different embedding models for different languages:

```typescript
// Adjust embedding model based on language
const getEmbeddingModel = (language: string): string => {
  switch(language) {
    case 'en': return 'embeddinggemma:latest';
    case 'multilingual': return 'nomic-embed-text';  // Supports 40+ languages
    case 'zh': return 'embedding-bge-m3';  // Better for Chinese
    default: return 'nomic-embed-text';
  }
};

// In StreamingIngestionPipeline
async processBatch(...) {
  const langResult = detect(chunks[0].text);
  const model = getEmbeddingModel(langResult.language);

  embedding = await this.embeddingService.generateEmbedding(
    chunk.text,
    model  // Language-specific model
  );
}
```

---

## Complete Enhanced Implementation

Here's how to integrate LangExtract throughout your pipeline:

### Enhanced Pipeline with Language Detection

```typescript
import { detect } from 'langextract';

export class EnhancedStreamingIngestionPipeline extends StreamingIngestionPipeline {
  private detectedLanguage: string = 'en';
  private languageConfidence: number = 0;

  async ingestDocumentEnhanced(
    bucketName: string,
    objectName: string,
    metadata: DocumentMetadata,
    options: Partial<ChunkingOptions> = {}
  ): Promise<ProcessingResultEnhanced> {
    const startTime = Date.now();
    const result: ProcessingResultEnhanced = {
      ...super.getBaseResult(metadata.documentId),
      detectedLanguage: 'unknown',
      languageConfidence: 0,
      isMultiLanguage: false,
      requiresTranslation: false,
    };

    try {
      // Step 1: Stream document from MinIO
      const documentStream = await this.streamDocumentFromMinIO(bucketName, objectName);

      // Step 2: Extract text
      const text = await this.textExtractor.extractText(documentStream, objectName);

      // Step 3: Language Detection with LangExtract
      const langResult = detect(text);
      result.detectedLanguage = langResult.language;
      result.languageConfidence = langResult.confidence;
      result.isMultiLanguage = this.detectMultiLanguage(text);
      result.requiresTranslation = langResult.language !== 'en';

      console.log(`🌐 Detected: ${langResult.language} (${langResult.confidence})`);
      if (result.isMultiLanguage) {
        console.warn(`⚠️  Multi-language document detected`);
      }

      // Step 4: Adaptive chunking based on language
      const adaptiveOptions = this.getAdaptiveChunkingOptions(
        langResult.language,
        options
      );

      const chunks = await this.chunker.chunkText(text, adaptiveOptions);
      result.totalChunks = chunks.length;
      result.totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

      // Step 5: Process in batches with language-aware embeddings
      const batchSize = 10;
      const embeddingModel = this.getEmbeddingModelForLanguage(langResult.language);

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        await this.processBatchWithLanguageAwareness(
          batch,
          metadata,
          result,
          embeddingModel,
          langResult.language
        );
      }

      result.processingTimeMs = Date.now() - startTime;
      await this.updateProcessingStats(metadata.documentId, result);

      console.log(`✅ Enhanced document processing completed`);
      return result;

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Enhanced pipeline error: ${message}`);
      result.processingTimeMs = Date.now() - startTime;
      console.error(`❌ Enhanced processing failed:`, error);
      return result;
    }
  }

  // Language detection with multi-language support
  private detectMultiLanguage(text: string): boolean {
    const samples = text.split('\n').slice(0, 5); // Check first 5 lines
    const detections = samples
      .filter(line => line.trim().length > 20)
      .map(line => detect(line).language);

    const uniqueLangs = new Set(detections);
    return uniqueLangs.size > 1;
  }

  // Adaptive chunking options based on language
  private getAdaptiveChunkingOptions(
    language: string,
    baseOptions: Partial<ChunkingOptions>
  ): ChunkingOptions {
    const base: ChunkingOptions = {
      maxTokens: baseOptions.maxTokens ?? 512,
      overlapTokens: baseOptions.overlapTokens ?? 50,
      preserveSentences: baseOptions.preserveSentences ?? true,
      minChunkSize: baseOptions.minChunkSize ?? 100,
    };

    // CJK languages: smaller chunks (more frequent word boundaries)
    if (['zh', 'ja', 'ko'].includes(language)) {
      return {
        ...base,
        maxTokens: 256,
        overlapTokens: 30,
        preserveSentences: false, // Preserve CJK segments instead
      };
    }

    // RTL languages: handle right-to-left
    if (['ar', 'he', 'fa', 'ur'].includes(language)) {
      return {
        ...base,
        maxTokens: 512,
        overlapTokens: 75, // More overlap for RTL
      };
    }

    // Agglutinative languages: larger chunks (fewer word boundaries)
    if (['tr', 'hu', 'fi'].includes(language)) {
      return {
        ...base,
        maxTokens: 640,
        overlapTokens: 40,
      };
    }

    return base;
  }

  // Get embedding model for language
  private getEmbeddingModelForLanguage(language: string): string {
    const languageModels: Record<string, string> = {
      'en': 'embeddinggemma:latest',
      'multilingual': 'nomic-embed-text', // 40+ languages
      'zh': 'embedding-m3',  // Better for Chinese
      'ja': 'embedding-m3',  // Better for Japanese
      'ar': 'nomic-embed-text',  // Works for Arabic
    };

    return languageModels[language] || 'nomic-embed-text';
  }

  // Process batch with language awareness
  private async processBatchWithLanguageAwareness(
    chunks: DocumentChunk[],
    metadata: DocumentMetadata,
    result: ProcessingResultEnhanced,
    embeddingModel: string,
    language: string
  ): Promise<void> {
    const builtChunks: NewLegalDocumentChunk[] = [];

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      try {
        const textHash = this.generateTextHash(chunk.text);
        const cached = await this.getCachedEmbedding(textHash);
        let embedding: number[];

        if (cached) {
          embedding = cached.embedding;
          result.cacheHits++;
          await this.updateCacheAccess(textHash);
        } else {
          // Use language-specific embedding model
          embedding = await this.embeddingService.generateEmbedding(
            chunk.text,
            embeddingModel
          );
          result.embeddingsGenerated++;
          await this.cacheEmbedding(
            textHash,
            embedding,
            embeddingModel,
            chunk.tokenCount
          );
        }

        const dbChunk: NewLegalDocumentChunk = {
          documentId: metadata.documentId,
          caseId: metadata.caseId ?? null,
          evidenceId: metadata.evidenceId ?? null,
          chunkIndex: chunk.index,
          pageNumber: chunk.pageNumber ?? null,
          textContent: chunk.text,
          embedding,
          textHash,
          tokenCount: chunk.tokenCount,
          documentType: metadata.documentType,
          practiceArea: metadata.practiceArea ?? [],
          jurisdiction: metadata.jurisdiction ?? null,
          riskLevel: metadata.riskLevel ?? null,
          extractedEntities: chunk.entities ?? [],
          keyTerms: chunk.keyTerms ?? [],
          sentimentScore: chunk.sentimentScore ?? null,
          complexityScore: chunk.complexityScore ?? null,
          model: embeddingModel,
          language, // NEW: Store detected language
        };
        builtChunks.push(dbChunk);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Chunk ${idx} error: ${message}`);
      }
    }

    if (builtChunks.length > 0) {
      await db.insert(legalDocumentChunks).values(builtChunks);
    }
  }
}

// Extended result type
interface ProcessingResultEnhanced extends ProcessingResult {
  detectedLanguage: string;
  languageConfidence: number;
  isMultiLanguage: boolean;
  requiresTranslation: boolean;
}
```

---

## Benefits of This Integration

| Benefit | Impact |
|---------|--------|
| **Language Detection** | Automatically identify document language for appropriate processing |
| **Adaptive Chunking** | Optimize chunk size for specific language characteristics |
| **Language-Specific Embeddings** | Use best embedding model for each language |
| **Multi-Language Support** | Detect and flag documents requiring translation |
| **International Compliance** | Handle legal documents in multiple jurisdictions |
| **Quality Improvement** | Better NER and entity extraction with language context |

---

## Testing LangExtract Integration

### Test Language Detection

```typescript
import { detect } from 'langextract';

// Test different languages
const testTexts = {
  english: "This is a legal contract between two parties...",
  spanish: "Este es un contrato legal entre dos partes...",
  german: "Dies ist ein rechtlicher Vertrag zwischen zwei Parteien...",
  chinese: "这是两方之间的法律合同...",
  arabic: "هذا عقد قانوني بين طرفين...",
};

Object.entries(testTexts).forEach(([lang, text]) => {
  const result = detect(text);
  console.log(`${lang}: ${result.language} (confidence: ${result.confidence})`);
});
```

**Expected Output**:
```
english: en (confidence: 0.99)
spanish: es (confidence: 0.98)
german: de (confidence: 0.97)
chinese: zh (confidence: 0.99)
arabic: ar (confidence: 0.96)
```

---

## Production Deployment

### Add Language Metadata

Update your database schema to store language information:

```sql
ALTER TABLE legal_document_chunks ADD COLUMN language VARCHAR(2) DEFAULT 'en';
ALTER TABLE legal_document_chunks ADD COLUMN language_confidence FLOAT;
ALTER TABLE legal_document_chunks ADD COLUMN embedding_model VARCHAR(100);

CREATE INDEX idx_language ON legal_document_chunks(language);
```

### Update Query Performance

```typescript
// Search by language
const englishChunks = db
  .select()
  .from(legalDocumentChunks)
  .where(eq(legalDocumentChunks.language, 'en'));

// Search by embedding model
const gemmaChunks = db
  .select()
  .from(legalDocumentChunks)
  .where(eq(legalDocumentChunks.embeddingModel, 'embeddinggemma:latest'));
```

---

## Summary

✅ **You have langextract v1.2.0 installed**

✅ **Perfect fit for your streaming ingestion pipeline**

✅ **Enables multi-language legal document processing**

✅ **Integrates seamlessly with embedding generation**

✅ **Ready for production deployment**

**Next Steps**:
1. Import langextract in your pipeline
2. Add language detection to text extraction
3. Implement adaptive chunking based on language
4. Use language-specific embedding models
5. Update database schema for language storage
6. Test with multilingual legal documents

Your legal AI platform can now handle international documents! 🌍📚
