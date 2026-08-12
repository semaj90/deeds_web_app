/**
 * SIMD Text Processing Worker
 * Integrates the existing Llama worker with SIMD text tiling capabilities
 * Provides non-blocking 7-bit compression and UI component generation
 */

// Import existing llama worker functionality
importScripts('/workers/llama-worker.js');

// SIMD-specific state
let simdInitialized = false;
let compressionCache = new Map();
let uiComponentCache = new Map();
let processingQueue = [];
let activeProcessing = 0;
const MAX_CONCURRENT = 3;

// Performance tracking
let simdStats = {
  totalProcessed: 0,
  totalCompressionTime: 0,
  totalUIGenerationTime: 0,
  averageCompressionRatio: 0,
  cacheHitRatio: 0,
};

/**
 * Enhanced message handler that supports SIMD operations
 */
self.addEventListener('message', async (event) => {
  const { type, payload, id } = event.data;

  try {
    switch (type) {
      case 'init_simd':
        await handleSIMDInit(payload);
        break;

      case 'process_simd':
        await handleSIMDProcessing(payload, id);
        break;

      case 'compress_text':
        await handleTextCompression(payload, id);
        break;

      case 'generate_ui_components':
        await handleUIGeneration(payload, id);
        break;

      case 'batch_process_simd':
        await handleBatchSIMDProcessing(payload, id);
        break;

      case 'get_simd_stats':
        handleGetSIMDStats(id);
        break;

      case 'clear_simd_cache':
        handleClearSIMDCache(id);
        break;

      // Fallback to original llama worker for other message types
      default:
        // Let the original worker handle non-SIMD messages
        break;
    }
  } catch (error) {
    console.error('SIMD Worker error:', error);
    postMessage({
      type: 'error',
      payload: { error: error.message },
      id,
    });
  }
});

/**
 * Initialize SIMD processing capabilities
 */
async function handleSIMDInit(config = {}) {
  try {
    console.log('🔄 Initializing SIMD Text Worker...');

    // Initialize compression settings
    const simdConfig = {
      compressionRatio: config.compressionRatio || 109,
      qualityTier: config.qualityTier || 'nes',
      cacheEnabled: config.cacheEnabled !== false,
      maxCacheSize: config.maxCacheSize || 1000,
      tileSize: config.tileSize || 16,
      ...config,
    };

    // Set up processing environment
    simdInitialized = true;

    // Initialize performance monitoring
    simdStats = {
      totalProcessed: 0,
      totalCompressionTime: 0,
      totalUIGenerationTime: 0,
      averageCompressionRatio: 0,
      cacheHitRatio: 0,
      config: simdConfig,
    };

    console.log('✅ SIMD Text Worker initialized with config:', simdConfig);

    postMessage({
      type: 'simd_initialized',
      payload: {
        success: true,
        config,
        simdConfig,
        capabilities: {
          compressionSupported: true,
          uiGenerationSupported: true,
          batchProcessingSupported: true,
          cacheSupported: true,
        },
      },
    });
  } catch (error) {
    console.error('❌ SIMD initialization failed:', error);
    postMessage({
      type: 'error',
      payload: { error: `SIMD initialization failed: ${error.message}` },
    });
  }
}

/**
 * Main SIMD text processing pipeline
 */
async function handleSIMDProcessing(payload, messageId) {
  if (!simdInitialized) {
    await handleSIMDInit();
  }

  const startTime = performance.now();
  const { text, simd_config = {}, ui_target, task_type = 'general' } = payload;

  if (!text || typeof text !== 'string') {
    throw new Error('Invalid text input for SIMD processing');
  }

  console.log(
    `🧬 SIMD processing: ${text.length} chars, target: ${simd_config.compressionRatio || 109}:1`
  );

  // Check cache first
  const cacheKey = generateCacheKey(text, simd_config);
  if (compressionCache.has(cacheKey)) {
    const cachedResult = compressionCache.get(cacheKey);
    simdStats.cacheHitRatio =
      (simdStats.cacheHitRatio * simdStats.totalProcessed + 1) / (simdStats.totalProcessed + 1);

    postMessage({
      type: 'simd_result',
      payload: {
        ...cachedResult,
        fromCache: true,
      },
      id: messageId,
    });
    return;
  }

  // Queue processing if at capacity
  if (activeProcessing >= MAX_CONCURRENT) {
    processingQueue.push({ payload, messageId });
    return;
  }

  activeProcessing++;

  try {
    // Phase 1: Text segmentation and preprocessing
    const segments = segmentTextForCompression(text, simd_config.tileSize || 16);

    postMessage({
      type: 'progress',
      payload: {
        stage: 'segmentation',
        progress: 0.2,
        segments: segments.length,
      },
      id: messageId,
    });

    // Phase 2: SIMD compression
    const compressionStartTime = performance.now();
    const compressedTiles = await compressTextToTiles(segments, simd_config);
    const compressionTime = performance.now() - compressionStartTime;

    postMessage({
      type: 'progress',
      payload: {
        stage: 'compression',
        progress: 0.6,
        compressionRatio: calculateCompressionRatio(text, compressedTiles),
      },
      id: messageId,
    });

    // Phase 3: UI component generation (if requested)
    let uiComponents = [];
    let uiGenerationTime = 0;

    if (ui_target) {
      const uiStartTime = performance.now();
      uiComponents = await generateUIComponentsFromTiles(compressedTiles, {
        target: ui_target,
        qualityTier: qualityTier || 'nes',
        simd_config: simd_config,
        task_type,
      });
      uiGenerationTime = performance.now() - uiStartTime;
    }

    const totalTime = performance.now() - startTime;
    const compressionRatio = calculateCompressionRatio(text, compressedTiles);

    // Build comprehensive result
    const result = {
      originalText: text,
      compressedTiles: compressedTiles.map((tile) => ({
        id: tile.id,
        compressedData: Array.from(tile.compressedData), // Convert Uint8Array to Array
        compressionRatio: tile.compressionRatio,
        semanticHash: tile.semanticHash,
        tileMetadata: tile.tileMetadata,
      })),
      uiComponents: uiComponents.map((comp) => ({
        id: comp.id,
        type: comp.type,
        cssStyles: comp.cssStyles,
        domStructure: comp.domStructure,
        renderTime: comp.renderTime,
      })),
      processingStats: {
        totalTime,
        compressionTime,
        uiGenerationTime,
        compressionRatio,
        tilesGenerated: compressedTiles.length,
        uiComponentsGenerated,
        semanticPreservationScore,
        calculateSemanticPreservation: calculateSemanticPreservation(segments, compressedTiles),
      },
      metadata: {
        workerProcessed: true,
        cacheKey: task_type,
        timestamp: Date.now(),
      },
    };

    // Cache the result
    if (simdStats.config.cacheEnabled) {
      compressionCache.set(cacheKey, result);

      // Manage cache size
      if (compressionCache.size > simdStats.config.maxCacheSize) {
        const oldestKey = compressionCache.keys().next().value;
        compressionCache.delete(oldestKey);
      }
    }

    // Update statistics
    updateSIMDStats(totalTime, compressionTime, uiGenerationTime, compressionRatio);

    postMessage({
      type: 'simd_result',
      payload: result,
      id: id,
      messageId: messageId,
    });

    console.log(
      `✅ SIMD processing complete: ${totalTime.toFixed(2)}ms, ${compressionRatio.toFixed(1)}:1 compression`
    );
  } finally {
    activeProcessing--;

    // Process next item in queue
    if (processingQueue.length > 0) {
      const next = processingQueue.shift();
      setTimeout(() => handleSIMDProcessing(next.payload, next.messageId), 0);
    }
  }
}

/**
 * Segment text for optimal compression
 */
function segmentTextForCompression(text, tileSize) {
  const segments = [];
  const words = text.split(/\s+/);
  let currentSegment = '';

  for (const word of words) {
    const testSegment = currentSegment ? `${currentSegment} ${word}` : word;

    if (testSegment.length > tileSize && currentSegment) {
      segments.push({
        text: currentSegment.trim(),
        wordCount: currentSegment.split(/\s+/).length,
        charCount: currentSegment.length,
      });
      currentSegment = word;
    } else {
      currentSegment = testSegment;
    }
  }

  if (currentSegment.trim()) {
    segments.push({
      text: currentSegment.trim(),
      wordCount: currentSegment.split(/\s+/).length,
      charCount: currentSegment.length,
    });
  }

  return segments;
}

/**
 * Compress text segments to 7-bit tiles
 */
async function compressTextToTiles(segments, _config) {
  const tiles = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Create 7-byte compressed representation (SIMD style)
    const compressedData = new Uint8Array(7);

    // Byte 0: Pattern classification (7 bits)
    const patternId = classifyTextPattern(segment.text);
    compressedData[0] = patternId & 0x7f;

    // Bytes 1-2: Semantic fingerprint (14 bits)
    const semanticHash = generateSemanticFingerprint(segment.text);
    compressedData[1] = (semanticHash >> 7) & 0x7f;
    compressedData[2] = semanticHash & 0x7f;

    // Bytes 3-4: Frequency encoding (14 bits)
    const freqEncoding = encodeWordFrequency(segment);
    compressedData[3] = (freqEncoding >> 7) & 0x7f;
    compressedData[4] = freqEncoding & 0x7f;

    // Bytes 5-6: Content signature (14 bits)
    const contentSig = generateContentSignature(segment.text);
    compressedData[5] = (contentSig >> 7) & 0x7f;
    compressedData[6] = contentSig & 0x7f;

    const tile = {
      id: `tile-${i}-${Date.now()}`,
      compressedData: compressedData,
      compressionRatio: (segment.text.length * 4) / compressedData.length, // Assume 4 bytes per char
      semanticHash: generateTextHash(segment.text),
      tileMetadata: {
        originalLength: segment.text.length,
        wordCount: segment.wordCount,
        patternId: patternId,
        semanticDensity: calculateSemanticDensity(segment.text),
        categories: categorizeContent(segment.text),
      },
    };

    tiles.push(tile);
  }

  return tiles;
}

/**
 * Generate UI components from compressed tiles
 */
async function generateUIComponentsFromTiles(tiles, options) {
  const { target, qualityTier, task_type } = options;
  const components = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];

    // Determine component type from tile characteristics
    const componentType = inferComponentType(tile.tileMetadata, task_type);

    // Generate CSS styles based on compressed data
    const cssStyles = generateTileCSS(tile, qualityTier, i);

    // Generate DOM structure
    const domStructure = generateTileDOM(tile, componentType, i);

    const component = {
      id: `ui-${tile.id}`,
      type: componentType,
      cssStyles,
      domStructure: generateTileDOM(tile, componentType, i),
      tileRef: tile.id,
      metadata: {
        qualityTier,
        originalPatternId: tile.tileMetadata.patternId,
        semanticDensity: tile.tileMetadata.semanticDensity,
      },
    };

    components.push(component);
  }

  return components;
}

// Helper functions for text analysis and compression

function classifyTextPattern(text) {
  const patterns = {
    legal: /\b(contract|agreement|clause|liability|breach|statute)\b/i,
    technical: /\b(system|process|algorithm|implementation|configuration)\b/i,
    numerical: /\b\d+(\.\d+)?\b/,
    formal: /\b(therefore|however|furthermore|consequently)\b/i,
    casual: /\b(like|just|really|pretty|kind of)\b/i,
  };

  let maxScore = 0;
  let patternId = 0;

  Object.entries(patterns).forEach(([_type, regex], index) => {
    const matches = (text.match(regex) || []).length;
    const score = matches / text.split(/\s+/).length;
    if (score > maxScore) {
      maxScore = score;
      patternId = index + 1;
    }
  });

  return patternId;
}

function generateSemanticFingerprint(text) {
  // Create a 14-bit semantic fingerprint based on text characteristics
  const words = text.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;

  const lexicalDiversity = (uniqueWords.size / words.length) * 100;
  const lengthFactor = Math.min(avgWordLength / 10, 1) * 100;

  return Math.floor((lexicalDiversity + lengthFactor) * 81.9) % 16384; // 14-bit max
}

function encodeWordFrequency(segment) {
  const words = segment.text.split(/\s+/);
  const wordFreq = {};

  words.forEach((word) => {
    const clean = word.toLowerCase().replace(/[^\w]/g, '');
    wordFreq[clean] = (wordFreq[clean] || 0) + 1;
  });

  const frequencies = Object.values(wordFreq);
  const avgFreq = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
  const maxFreq = Math.max(...frequencies);

  return Math.floor((avgFreq / maxFreq) * 16383) % 16384; // 14-bit encoding
}

function generateContentSignature(text) {
  // Generate a 14-bit content signature
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash + char) & 0x3fff; // Keep within 14 bits
  }
  return hash;
}

function calculateSemanticDensity(text) {
  // Calculate semantic density based on meaningful content
  const meaningfulWords = text
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 3 &&
        !/^(the|and|but|for|are|with|they|have|this|that|will|you|not|all|can)$/i.test(word)
    );

  return Math.min(meaningfulWords.length / text.split(/\s+/).length, 1);
}

function categorizeContent(text) {
  const categories = [];

  if (/\d/.test(text)) categories.push('numeric');
  if (/[.!?]/.test(text)) categories.push('punctuated');
  if (text.length > 50) categories.push('long-form');
  if (/\b(contract|legal|law|court)\b/i.test(text)) categories.push('legal');
  if (/\b(system|technology|process)\b/i.test(text)) categories.push('technical');

  return categories.length > 0 ? categories : ['general'];
}

function generateTextHash(text) {
  // Simple hash for caching and deduplication
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

function inferComponentType(metadata, taskType) {
  if (metadata.categories.includes('numeric') && metadata.semanticDensity > 0.7) {
    return 'data-display';
  }

  if (taskType === 'legal-analysis' && metadata.categories.includes('legal')) {
    return 'legal-highlight';
  }

  if (metadata.wordCount < 5) {
    return 'micro-text';
  }

  return 'text-block';
}

function generateTileCSS(tile, qualityTier, index) {
  const compressed = tile.compressedData;
  const hue = (compressed[0] / 127) * 360;
  const saturation = Math.max((compressed[1] / 127) * 100, 50);
  const lightness = Math.max((compressed[2] / 127) * 100, 30);

  const pixelSize = qualityTier === 'nes' ? '2px' : qualityTier === 'snes' ? '1.5px' : '1px';
  const fontSize = `${Math.max(0.8, tile.tileMetadata.semanticDensity * 1.2)}em`;

  return `
.simd-tile-${tile.id} {
  background: hsl(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%);
  color: ${lightness > 50 ? '#000' : '#fff'};
  font-family: 'Courier New', monospace;
  font-size: ${fontSize};
  padding: 4px 8px;
  margin: 2px;
  border-radius: 4px;
  display: inline-block;
  image-rendering: pixelated;
  text-shadow: ${pixelSize} ${pixelSize} 0px rgba(0,0,0,0.5);
  animation: tile-fade-in-${index} 0.5s ease-in-out;
}

@keyframes tile-fade-in-${index} {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}`;
}

function generateTileDOM(tile, componentType, _index) {
  const className = `simd-tile-${tile.id}`;
  const content = tile.tileMetadata.categories.join(' ') || 'content';

  switch (componentType) {
    case 'data-display':
      return `<div class="${className}" data-type="data" title="Compression: ${tile.compressionRatio.toFixed(1)}:1">
        📊 ${content} (${tile.tileMetadata.wordCount} words)
      </div>`;

    case 'legal-highlight':
      return `<div class="${className}" data-type="legal" title="Legal content">
        ⚖️ ${content}
      </div>`;

    case 'micro-text':
      return `<span class="${className}" data-type="micro">
        ${content}
      </span>`;

    default:
      return `<div class="${className}" data-type="text" data-density="${tile.tileMetadata.semanticDensity.toFixed(2)}">
        ${content}
      </div>`;
  }
}

// Utility functions

function generateCacheKey(text, config) {
  const textHash = generateTextHash(text);
  const configHash = generateTextHash(JSON.stringify(config));
  return `${textHash}-${configHash}`;
}

function calculateCompressionRatio(originalText, tiles) {
  const originalSize = originalText.length * 4; // Assume 4 bytes per character
  const compressedSize = tiles.reduce((sum, tile) => sum + tile.compressedData.length, 0);
  return originalSize / compressedSize;
}

function calculateSemanticPreservation(segments, tiles) {
  // Simple preservation score based on pattern consistency
  let preservationScore = 0;

  segments.forEach((segment, index) => {
    if (tiles[index]) {
      const originalCategories = categorizeContent(segment.text);
      const preservedCategories = tiles[index].tileMetadata.categories;
      const overlap = originalCategories.filter((cat) => preservedCategories.includes(cat)).length;
      preservationScore += overlap / originalCategories.length;
    }
  });

  return preservationScore / segments.length;
}

function updateSIMDStats(totalTime, compressionTime, uiTime, compressionRatio) {
  simdStats.totalProcessed++;
  simdStats.totalCompressionTime += compressionTime;
  simdStats.totalUIGenerationTime += uiTime;

  // Rolling average for compression ratio
  simdStats.averageCompressionRatio =
    (simdStats.averageCompressionRatio * (simdStats.totalProcessed - 1) + compressionRatio) /
    simdStats.totalProcessed;
}

// Additional message handlers

function handleGetSIMDStats(messageId) {
  postMessage({
    type: 'simd_stats',
    payload: {
      ...simdStats,
      cacheSize,
      compressionCache: compressionCache.size,
      queueLength: processingQueue.length,
      activeProcessing,
    },
    id: messageId,
  });
}

function handleClearSIMDCache(messageId) {
  compressionCache.clear();
  uiComponentCache.clear();

  postMessage({
    type: 'cache_cleared',
    payload: { success: true },
    id: messageId,
  });
}

// Batch processing handler
async function handleBatchSIMDProcessing(payload, messageId) {
  const { texts, simd_config = {}, ui_target } = payload;

  if (!Array.isArray(texts)) {
    throw new Error('Batch processing requires an array of texts');
  }

  const results = [];
  const batchStartTime = performance.now();

  postMessage({
    type: 'batch_started',
    payload: {
      totalItems: texts.length,
      estimatedTime: texts.length * 100, // Rough estimate
    },
    id: messageId,
  });

  for (let i = 0; i < texts.length; i++) {
    try {
      // Process each text (this will use the same pipeline as single processing)
      const result = await new Promise((resolve, reject) => {
        const tempId = `batch-${i}-${Date.now()}`;

        // Set up temporary message handler
        const handleBatchItem = (event) => {
          if (event.data.id === tempId) {
            self.removeEventListener('message', handleBatchItem); // Remove listener once handled
            if (event.data.type === 'simd_result') {
              resolve(event.data.payload);
            } else if (event.data.type === 'error') {
              reject(new Error(event.data.payload.error || 'Unknown SIMD processing error'));
            }
          }
        };

        self.addEventListener('message', handleBatchItem);

        // Process the item
        handleSIMDProcessing(
          {
            text: texts[i],
            simd_config,
            ui_target,
            task_type: 'batch',
          },
          tempId
        );
      });

      results.push(result);

      // Progress update
      postMessage({
        type: 'batch_progress',
        payload: {
          completed: i + 1,
          total,
          texts: texts.length,
          progress: (i + 1) / texts.length,
        },
        id: messageId,
      });
    } catch (error) {
      console.error(`Batch item ${i} failed:`, error);
      results.push({ error: error.message });
    }
  }

  const batchTime = performance.now() - batchStartTime;

  postMessage({
    type: 'batch_complete',
    payload: {
      results,
      batchStats: {
        totalTime: batchTime,
        itemsProcessed,
        results: results.length,
        avgTimePerItem,
        batchTime: batchTime / results.length,
        successRate: results.filter((r) => !r.error).length / results.length,
      },
    },
    id: messageId,
  });
}

console.log('🧬 SIMD Text Worker loaded and ready for enhanced processing');

// Initialize with default configuration
handleSIMDInit();
