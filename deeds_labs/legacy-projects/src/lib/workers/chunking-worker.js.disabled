import { parentPort, workerData } from "worker_threads";

/**
 * Phase 4: Document Chunking Worker
 * Handles intelligent document chunking with semantic boundaries
 */

class ChunkingWorker {
  constructor() {
    this.workerId = workerData?.workerId || "chunking-worker";
    this.config = {
      maxChunkSize: 800,
      overlapSize: 200,
      minChunkSize: 100,
      preserveFormatting: true,
    };

    console.log(`🔧 Chunking Worker ${this.workerId} initialized`);
  }

  /**
   * Process incoming messages
   */
  handleMessage(message) {
    const { taskId, data, options } = message;

    try {
      let result;

      switch (data.type) {
        case "chunk_document":
          result = this.chunkDocument(data.document, options);
          break;
        case "chunk_text":
          result = this.chunkText(data.text, options);
          break;
        case "semantic_chunk":
          result = this.semanticChunk(data.content, options);
          break;
        default:
          throw new Error(`Unknown chunking task type: ${data.type}`);
      }

      parentPort.postMessage({
        taskId,
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(`❌ Chunking error in ${this.workerId}:`, error);
      parentPort.postMessage({
        taskId,
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Chunk a document based on its type
   */
  chunkDocument(document, options = {}) {
    const { content, type, filename, metadata } = document;
    const config = { ...this.config, ...options };

    let chunks;

    switch (type?.toLowerCase()) {
      case "pdf":
      case "txt":
      case "text/plain":
        chunks = this.chunkText(content, config);
        break;
      case "json":
        chunks = this.chunkJSON(content, config);
        break;
      case "html":
        chunks = this.chunkHTML(content, config);
        break;
      case "markdown":
      case "md":
        chunks = this.chunkMarkdown(content, config);
        break;
      default:
        chunks = this.chunkText(content, config);
    }

    // Add metadata to each chunk
    return chunks.map((chunk, index) => ({
      ...chunk,
      documentId: document.id,
      filename,
      chunkIndex: index,
      documentType: type,
      metadata: {
        ...metadata,
        originalLength: content.length,
        chunkingStrategy: this.getChunkingStrategy(type),
      },
    }));
  }

  /**
   * Chunk plain text with semantic boundaries
   */
  chunkText(text, config = {}) {
    const maxSize = config.maxChunkSize || this.config.maxChunkSize;
    const overlap = config.overlapSize || this.config.overlapSize;
    const minSize = config.minChunkSize || this.config.minChunkSize;

    // First, split by paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    const chunks = [];
    let currentChunk = "";
    let currentSize = 0;

    for (const paragraph of paragraphs) {
      const paragraphSize = paragraph.length;

      // If adding this paragraph would exceed max size
      if (
        currentSize + paragraphSize > maxSize &&
        currentChunk.length > minSize
      ) {
        // Save current chunk
        chunks.push(this.createChunk(currentChunk, chunks.length));

        // Start new chunk with overlap
        const overlapText = this.extractOverlap(currentChunk, overlap);
        currentChunk = overlapText + paragraph;
        currentSize = currentChunk.length;
      } else {
        // Add paragraph to current chunk
        if (currentChunk) {
          currentChunk += "\n\n" + paragraph;
        } else {
          currentChunk = paragraph;
        }
        currentSize = currentChunk.length;
      }

      // If paragraph itself is too large, split by sentences
      if (paragraphSize > maxSize) {
        const sentenceChunks = this.chunkBySentences(
          paragraph,
          maxSize,
          overlap
        );
        chunks.push(
          ...sentenceChunks.map((chunk, idx) =>
            this.createChunk(chunk, chunks.length + idx)
          )
        );
        currentChunk = "";
        currentSize = 0;
      }
    }

    // Add final chunk if any content remains
    if (currentChunk.trim().length >= minSize) {
      chunks.push(this.createChunk(currentChunk, chunks.length));
    }

    return chunks;
  }

  /**
   * Chunk by sentences when paragraphs are too large
   */
  chunkBySentences(text, maxSize, overlap) {
    const sentences = this.splitIntoSentences(text);
    const chunks = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      if (
        currentChunk.length + sentence.length > maxSize &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.trim());

        // Add overlap
        const overlapText = this.extractOverlap(currentChunk, overlap);
        currentChunk = overlapText + sentence;
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Split text into sentences
   */
  splitIntoSentences(text) {
    // Simple sentence splitting - could be enhanced with NLP library
    return text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => s + ".");
  }

  /**
   * Extract overlap text from the end of a chunk
   */
  extractOverlap(text, overlapSize) {
    if (text.length <= overlapSize) return text;

    const overlapText = text.slice(-overlapSize);
    // Try to start overlap at a word boundary
    const spaceIndex = overlapText.indexOf(" ");

    return spaceIndex > 0 ? overlapText.slice(spaceIndex + 1) : overlapText;
  }

  /**
   * Semantic chunking based on topic boundaries
   */
  semanticChunk(content, options = {}) {
    // This is a simplified implementation
    // In production, you might use sentence transformers or topic modeling
    const sentences = this.splitIntoSentences(content);
    const chunks = [];
    let currentChunk = [];
    let currentTopic = null;

    for (const sentence of sentences) {
      const topic = this.extractTopic(sentence);

      if (currentTopic && topic !== currentTopic && currentChunk.length > 0) {
        // Topic change detected, create new chunk
        chunks.push(this.createChunk(currentChunk.join(" "), chunks.length));
        currentChunk = [sentence];
        currentTopic = topic;
      } else {
        currentChunk.push(sentence);
        currentTopic = topic || currentTopic;
      }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(currentChunk.join(" "), chunks.length));
    }

    return chunks;
  }

  /**
   * Simple topic extraction (could be enhanced with ML)
   */
  extractTopic(sentence) {
    // Legal-specific topic keywords
    const legalTopics = {
      evidence: ["evidence", "exhibit", "proof", "testimony"],
      procedure: ["court", "motion", "hearing", "trial", "proceeding"],
      charges: ["charge", "count", "offense", "violation", "crime"],
      parties: ["defendant", "plaintiff", "counsel", "attorney", "witness"],
      timeline: ["date", "time", "when", "occurred", "happened"],
    };

    const lowerSentence = sentence.toLowerCase();

    for (const [topic, keywords] of Object.entries(legalTopics)) {
      if (keywords.some((keyword) => lowerSentence.includes(keyword))) {
        return topic;
      }
    }

    return "general";
  }

  /**
   * Chunk JSON documents
   */
  chunkJSON(jsonContent, config = {}) {
    try {
      const data =
        typeof jsonContent === "string" ? JSON.parse(jsonContent) : jsonContent;

      if (Array.isArray(data)) {
        return data.map((item, index) =>
          this.createChunk(JSON.stringify(item, null, 2), index, {
            type: "json_array_item",
          })
        );
      } else {
        // For objects, chunk by top-level keys
        const chunks = [];
        let chunkIndex = 0;

        for (const [key, value] of Object.entries(data)) {
          const chunkContent = JSON.stringify({ [key]: value }, null, 2);
          chunks.push(
            this.createChunk(chunkContent, chunkIndex++, {
              type: "json_object_key",
              key,
            })
          );
        }

        return chunks;
      }
    } catch (error) {
      // Fallback to text chunking
      return this.chunkText(jsonContent, config);
    }
  }

  /**
   * Chunk HTML documents
   */
  chunkHTML(htmlContent, config = {}) {
    // Simple HTML chunking - remove tags and chunk the text
    const textContent = htmlContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return this.chunkText(textContent, config);
  }

  /**
   * Chunk Markdown documents
   */
  chunkMarkdown(markdownContent, config = {}) {
    // Split by headers first
    const sections = markdownContent.split(/^#+\s/m);
    const chunks = [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (section.trim().length === 0) continue;

      // Add header back if not the first section
      const content = i === 0 ? section : "# " + section;

      if (content.length > this.config.maxChunkSize) {
        // Section too large, chunk it further
        const subChunks = this.chunkText(content, config);
        chunks.push(...subChunks);
      } else {
        chunks.push(
          this.createChunk(content, chunks.length, {
            type: "markdown_section",
          })
        );
      }
    }

    return chunks;
  }

  /**
   * Create a standardized chunk object
   */
  createChunk(content, index, metadata = {}) {
    return {
      content: content.trim(),
      chunkIndex: index,
      size: content.length,
      wordCount: content.split(/\s+/).length,
      metadata: {
        workerId: this.workerId,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };
  }

  /**
   * Get chunking strategy name
   */
  getChunkingStrategy(docType) {
    switch (docType?.toLowerCase()) {
      case "json":
        return "json_structural";
      case "html":
        return "html_semantic";
      case "markdown":
      case "md":
        return "markdown_header";
      default:
        return "text_paragraph_sentence";
    }
  }
}

// Initialize worker
const worker = new ChunkingWorker();

// Handle messages from main thread
parentPort.on("message", (message) => {
  worker.handleMessage(message);
});

// Send ready signal
parentPort.postMessage({
  type: "ready",
  workerId: worker.workerId,
});
