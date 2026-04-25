# LangExtract - Quick Start Guide

## Installation Status
✅ **Already installed**: `langextract@1.2.0`

## Basic Usage

### 1. Import LangExtract

```typescript
import { detect } from 'langextract';
```

### 2. Detect Language

```typescript
const text = "This is a legal contract between two parties...";

const result = detect(text);
console.log(result);
// Output:
// {
//   language: 'en',
//   confidence: 0.99,
//   ...
// }
```

### 3. Use in Your Code

**Simple Detection:**
```typescript
function detectDocumentLanguage(text: string): string {
  try {
    const result = detect(text);
    return result.language; // 'en', 'es', 'de', etc.
  } catch (error) {
    console.warn('Language detection failed:', error);
    return 'unknown';
  }
}
```

**With Confidence Check:**
```typescript
function detectLanguageWithConfidence(
  text: string,
  minConfidence: number = 0.8
): { language: string; confidence: number; reliable: boolean } {
  try {
    const result = detect(text);
    return {
      language: result.language,
      confidence: result.confidence,
      reliable: result.confidence >= minConfidence,
    };
  } catch (error) {
    return {
      language: 'unknown',
      confidence: 0,
      reliable: false,
    };
  }
}
```

---

## Common Languages

| Language | Code | Example |
|----------|------|---------|
| English | `en` | "This is a contract..." |
| Spanish | `es` | "Este es un contrato..." |
| German | `de` | "Dies ist ein Vertrag..." |
| French | `fr` | "Ceci est un contrat..." |
| Chinese | `zh` | "这是一份合同..." |
| Japanese | `ja` | "これは契約です..." |
| Arabic | `ar` | "هذا عقد..." |
| Russian | `ru` | "Это договор..." |
| Portuguese | `pt` | "Este é um contrato..." |
| Dutch | `nl` | "Dit is een contract..." |

---

## Integration with Your Pipeline

### In Text Extraction

```typescript
// src/lib/server/services/text-extractor.ts
import { detect } from 'langextract';

export class TextExtractor {
  async extractText(stream: Readable, filename: string): Promise<ExtractionResult> {
    const text = await this.extractRawText(stream, filename);

    // NEW: Detect language
    const langDetection = detect(text);

    return {
      text,
      language: langDetection.language,
      languageConfidence: langDetection.confidence,
    };
  }
}
```

### In Document Chunking

```typescript
// Adjust chunks based on language
import { detect } from 'langextract';

const langResult = detect(text);
const chunkOptions = this.getChunkingOptionsForLanguage(langResult.language);

const chunks = await this.chunker.chunkText(text, chunkOptions);
```

### In Embedding Selection

```typescript
// Choose embedding model based on language
import { detect } from 'langextract';

const langResult = detect(text);
const embeddingModel = this.selectEmbeddingModelForLanguage(langResult.language);

const embedding = await this.embeddingService.generateEmbedding(
  text,
  embeddingModel
);
```

---

## Real-World Example

### Complete Pipeline Integration

```typescript
import { detect } from 'langextract';
import { StreamingIngestionPipeline } from './streaming-ingestion-pipeline';

class EnhancedLegalDocumentPipeline extends StreamingIngestionPipeline {
  async processLegalDocument(
    documentPath: string,
    metadata: DocumentMetadata
  ): Promise<ProcessingResult> {
    // Step 1: Read document
    const stream = fs.createReadStream(documentPath);
    const text = await this.extractText(stream);

    // Step 2: Detect language
    const detection = detect(text);
    console.log(`📄 Document language: ${detection.language} (${detection.confidence})`);

    // Step 3: Validate language
    if (detection.language !== 'en' && detection.confidence < 0.9) {
      console.warn(`⚠️  Low confidence language detection (${detection.confidence})`);
      // Could trigger manual review or translation
    }

    // Step 4: Select processing strategy
    const strategy = this.getProcessingStrategyForLanguage(detection.language);

    // Step 5: Process with appropriate settings
    const result = await this.ingestDocument(
      'legal-docs',
      documentPath,
      {
        ...metadata,
        language: detection.language,
      },
      strategy.chunkingOptions
    );

    return result;
  }

  private getProcessingStrategyForLanguage(language: string) {
    switch (language) {
      case 'en':
        return {
          chunkingOptions: {
            maxTokens: 512,
            overlapTokens: 50,
          },
          embeddingModel: 'embeddinggemma:latest',
        };

      case 'zh': // Chinese
        return {
          chunkingOptions: {
            maxTokens: 256,
            overlapTokens: 30,
            preserveSentences: false,
          },
          embeddingModel: 'nomic-embed-text',
        };

      case 'ar': // Arabic
        return {
          chunkingOptions: {
            maxTokens: 512,
            overlapTokens: 75, // More overlap for RTL
          },
          embeddingModel: 'nomic-embed-text',
        };

      default:
        return {
          chunkingOptions: {
            maxTokens: 512,
            overlapTokens: 50,
          },
          embeddingModel: 'nomic-embed-text',
        };
    }
  }
}
```

---

## Error Handling

### Graceful Fallback

```typescript
function safeLanguageDetection(text: string): string {
  try {
    const result = detect(text);
    return result.language;
  } catch (error) {
    console.warn('Language detection failed:', error);
    return 'en'; // Default to English
  }
}
```

### Low Confidence Handling

```typescript
function detectLanguageSafely(
  text: string,
  defaultLanguage: string = 'en'
): string {
  try {
    const result = detect(text);

    // If confidence is too low, use default
    if (result.confidence < 0.7) {
      console.warn(
        `Low confidence detection (${result.confidence}), using default ${defaultLanguage}`
      );
      return defaultLanguage;
    }

    return result.language;
  } catch (error) {
    console.warn('Language detection failed:', error);
    return defaultLanguage;
  }
}
```

---

## Performance Tips

### 1. Cache Language Detection

```typescript
const languageCache = new Map<string, string>();

function detectLanguageCached(text: string): string {
  const hash = createHash('sha256').update(text.slice(0, 500)).digest('hex');

  if (languageCache.has(hash)) {
    return languageCache.get(hash)!;
  }

  const language = detect(text).language;
  languageCache.set(hash, language);

  return language;
}
```

### 2. Batch Processing

```typescript
async function detectLanguagesForDocuments(
  documents: { id: string; text: string }[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (const doc of documents) {
    try {
      const result = detect(doc.text);
      results.set(doc.id, result.language);
    } catch (error) {
      console.warn(`Failed to detect language for ${doc.id}`);
      results.set(doc.id, 'unknown');
    }
  }

  return results;
}
```

### 3. Sample-Based Detection (for very long documents)

```typescript
function detectLanguageFromSample(text: string, sampleSize: number = 500): string {
  // Use first N characters for faster detection
  const sample = text.slice(0, sampleSize);
  const result = detect(sample);
  return result.language;
}
```

---

## Database Integration

### Store Language Information

```typescript
// Schema update
interface DocumentMetadata {
  documentId: string;
  language: string;
  languageConfidence: number;
  detectAt: Date;
}

// Query by language
const englishDocs = db
  .select()
  .from(documents)
  .where(eq(documents.language, 'en'));

// Multi-language search
const multiLangDocs = db
  .select()
  .from(documents)
  .where(inArray(documents.language, ['en', 'es', 'fr']));
```

---

## Testing

### Test Different Languages

```typescript
import { detect } from 'langextract';

const testCases = [
  { lang: 'en', text: 'This is an English legal document.' },
  { lang: 'es', text: 'Este es un documento legal en español.' },
  { lang: 'fr', text: 'Ceci est un document juridique en français.' },
  { lang: 'de', text: 'Dies ist ein deutsches Rechtsdokument.' },
  { lang: 'zh', text: '这是一份中文法律文件。' },
];

testCases.forEach(({ lang, text }) => {
  const result = detect(text);
  console.assert(
    result.language === lang,
    `Expected ${lang}, got ${result.language}`
  );
  console.log(`✓ ${lang} detected correctly`);
});
```

---

## Common Issues & Solutions

### Issue: "Cannot find module 'langextract'"

**Solution:**
```bash
npm install langextract
# Already installed: v1.2.0
```

### Issue: "Language detected incorrectly"

**Solution**: Check confidence, use longer text sample
```typescript
const result = detect(text);
if (result.confidence < 0.8) {
  // Use fallback or request user confirmation
}
```

### Issue: "Very slow language detection"

**Solution**: Use sample-based detection for long texts
```typescript
const language = detectLanguageFromSample(longText, 1000);
```

---

## Next Steps

1. ✅ **Done**: Install langextract (already v1.2.0)
2. ✅ **Done**: Import in your services
3. **Next**: Add language detection to text extraction
4. **Next**: Implement adaptive chunking
5. **Next**: Select language-specific embeddings
6. **Next**: Update database schema
7. **Next**: Test with multilingual documents

---

**You're ready to add language detection to your legal document pipeline!** 🌍
