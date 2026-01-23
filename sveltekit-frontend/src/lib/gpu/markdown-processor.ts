/**
 * Phase53: GPU-Accelerated Markdown Processing Pipeline
 *
 * WebGPU kernels for parallel markdown parsing, tokenization, and semantic chunking
 * Optimized for legal document processing with section-aware splitting.
 */

// Define WebGPU constants locally to avoid TS errors if types are missing
const GPUBufferUsage = {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
} as const;

export interface MarkdownProcessingResult {
    sections: MarkdownSection[];
    tokens: Token[];
    embeddings: Float32Array[];
    performance: ProcessingMetrics;
}

export interface MarkdownSection {
    type?: 'heading' | 'paragraph' | 'list' | 'code' | 'facts' | 'reasoning' | 'holding' | 'conclusion';
    level?: number;
    content: string;
    startOffset: number;
    endOffset: number;
    metadata?: Record<string, any>;
}

export interface Token {
    text: string;
    type: 'word' | 'punctuation' | 'number' | 'legal_term';
    position: number;
    confidence: number;
}

export interface ProcessingMetrics {
    tokenizationTime: number;
    chunkingTime: number;
    embeddingTime: number;
    gpuMemoryUsed: number;
    totalTime: number;
}

/**
 * WebGPU Kernel for Parallel Markdown Scanning
 * Detects headings, sections, and legal document patterns
 */
export class GPUMarkdownScanner {
    private device: GPUDevice | null = null;
    private pipelines: Map<string, any> = new Map();

    async initialize(): Promise<void> {
        if (!(navigator as any).gpu) {
            throw new Error('WebGPU not supported');
        }

        const adapter = await (navigator as any).gpu.requestAdapter();
        if (!adapter) {
            throw new Error('No WebGPU adapter found');
        }

        this.device = await adapter.requestDevice();

        // Create compute pipelines for different scanning operations
        await this.createScanPipelines();
    }

    private async createScanPipelines(): Promise<void> {
        if (!this.device) return;

        // Pipeline for heading detection (# ## ###)
        const headingShader = this.createHeadingDetectionShader();
        this.pipelines.set('headings', await this.createComputePipeline(headingShader));

        // Pipeline for section marker detection (FACTS: REASONING, etc.)
        const sectionShader = this.createSectionDetectionShader();
        this.pipelines.set('sections', await this.createComputePipeline(sectionShader));

        // Pipeline for token boundary detection
        const tokenShader = this.createTokenBoundaryShader();
        this.pipelines.set('tokens', await this.createComputePipeline(tokenShader));
    }

    private createHeadingDetectionShader(): string {
        return `
            @group(0) @binding(0) var<storage, read> inputText: array<u32>;
            @group(0) @binding(1) var<storage, read_write> headingPositions: array<u32>;
            @group(0) @binding(2) var<storage, read_write> headingLevels: array<u32>;

            @compute @workgroup_size(256)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let idx = global_id.x;
                if (idx >= arrayLength(&inputText) - 1) {
                    return;
                }

                // Look for '#' followed by space
                let char1 = inputText[idx];
                let char2 = inputText[idx + 1];

                if (char1 == 35u && char2 == 32u) { // '#' and ' '
                    // Count consecutive '#' characters
                    var level = 1u;
                    var pos = idx + 2u;

                    while (pos < arrayLength(&inputText) && inputText[pos] == 35u) {
                        level = level + 1u;
                        pos = pos + 1u;
                    }

                    // Store heading position and level
                    headingPositions[idx] = 1u;
                    headingLevels[idx] = level;
                }
            }
        `;
    }

    private createSectionDetectionShader(): string {
        return `
            @group(0) @binding(0) var<storage, read> inputText: array<u32>;
            @group(0) @binding(1) var<storage, read_write> sectionMarkers: array<u32>;

            @compute @workgroup_size(256)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let idx = global_id.x;
                if (idx >= arrayLength(&inputText) - 5) {
                    return;
                }

                // Check for legal section markers (case-insensitive)
                // Need to store patterns in a way that WebGPU can read, usually uniform or buffer,
                // but for this shader embedded arrays might work if compiler supports it well,
                // or simplistic unrolled logic.
                // Assuming simplified logic for brevity as per original intent:

                // Patterns (simplified ASCII check)
                // 1. FACTS
                // 2. REASONING
                // 3. HOLDING
                // 4. CONCLUSION

                // Note: Real implementation would use more robust string matching.

                // Placeholder logic for detecting section headers
                let char = inputText[idx];
                // if 'F' or 'f' and followed by 'ACTS' ...
                // Setting simplified markers for the sake of the shader example to avoid complexity errors.
                // In production, use Aho-Corasick on GPU or similar.

                if (char == 70u || char == 102u) { // F
                     sectionMarkers[idx] = 1u; // Potential FACTS
                }
            }
        `;
    }

    private createTokenBoundaryShader(): string {
        return `
            @group(0) @binding(0) var<storage, read> inputText: array<u32>;
            @group(0) @binding(1) var<storage, read_write> tokenBoundaries: array<u32>;

            @compute @workgroup_size(256)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let idx = global_id.x;
                if (idx >= arrayLength(&inputText)) {
                    return;
                }

                let char = inputText[idx];
                var isBoundary = false;

                // Space, tab, newline, punctuation
                if (char == 32u || char == 9u || char == 10u || char == 13u) {
                    isBoundary = true;
                }
                // Common punctuation
                if (char >= 33u && char <= 47u) {
                    isBoundary = true;
                }
                if (char >= 58u && char <= 64u) {
                    isBoundary = true;
                }
                if (char >= 91u && char <= 96u) {
                    isBoundary = true;
                }
                if (char >= 123u && char <= 126u) {
                    isBoundary = true;
                }

                tokenBoundaries[idx] = select(0u, 1u, isBoundary);
            }
        `;
    }

    private async createComputePipeline(shaderCode: string): Promise<any> {
        if (!this.device) throw new Error('Device not initialized');

        const shaderModule = (this.device as any).createShaderModule({
            code: shaderCode,
        });

        return (this.device as any).createComputePipeline({
            layout: 'auto',
            compute: {
                module: shaderModule,
                entryPoint: 'main',
            },
        });
    }

    /**
     * Scan markdown text for headings and sections using GPU
     */
    async scanMarkdown(text: string): Promise<{
        headings: Array<{ position: number; level: number }>;
        sections: Array<{ position: number; type: string }>;
    }> {
        if (!this.device) await this.initialize();

        const encoder = new TextEncoder();
        const textArray = encoder.encode(text);

        // Pad array to multiple of 4 for alignment if needed, or handle in buffer creation

        const textBuffer = (this.device! as any).createBuffer({
            size: Math.max(textArray.length * 4, 16), // Use u32 array size mapping roughly
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        const u32Array = new Uint32Array((textBuffer as any).getMappedRange());
        for (let i = 0; i < textArray.length; i++) {
            u32Array[i] = textArray[i];
        }
        (textBuffer as any).unmap();

        // Create output buffers
        const bufferSize = Math.max(textArray.length * 4, 16);
        const headingPositionsBuffer = (this.device! as any).createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const headingLevelsBuffer = (this.device! as any).createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const sectionMarkersBuffer = (this.device! as any).createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        // 1. Headings Pass
        const headingCommandEncoder = (this.device! as any).createCommandEncoder();
        const headingPass = headingCommandEncoder.beginComputePass();
        headingPass.setPipeline(this.pipelines.get('headings')!);
        headingPass.setBindGroup(
            0,
            (this.device! as any).createBindGroup({
                layout: this.pipelines.get('headings')!.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: textBuffer } },
                    { binding: 1, resource: { buffer: headingPositionsBuffer } },
                    { binding: 2, resource: { buffer: headingLevelsBuffer } }
                ],
            })
        );
        headingPass.dispatchWorkgroups(Math.ceil(textArray.length / 256));
        headingPass.end();
        (this.device! as any).queue.submit([headingCommandEncoder.finish()]);

        // 2. Sections Pass
        const sectionCommandEncoder = (this.device! as any).createCommandEncoder();
        const sectionPass = sectionCommandEncoder.beginComputePass();
        sectionPass.setPipeline(this.pipelines.get('sections')!);
        sectionPass.setBindGroup(
            0,
            this.device!.createBindGroup({
                layout: this.pipelines.get('sections')!.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: textBuffer } },
                    { binding: 1, resource: { buffer: sectionMarkersBuffer } }
                ],
            })
        );
        sectionPass.dispatchWorkgroups(Math.ceil(textArray.length / 256));
        sectionPass.end();
        (this.device! as any).queue.submit([sectionCommandEncoder.finish()]);

        // Read results
        const headingPositions = await this.readBuffer(headingPositionsBuffer, textArray.length);
        const headingLevels = await this.readBuffer(headingLevelsBuffer, textArray.length);
        const sectionMarkers = await this.readBuffer(sectionMarkersBuffer, textArray.length);

        // Process results
        const headings: Array<{ position: number; level: number }> = [];
        const sections: Array<{ position: number; type: string }> = [];

        const sectionTypes = ['', 'facts', 'reasoning', 'holding', 'conclusion'];

        for (let i = 0; i < textArray.length; i++) {
            if (headingPositions[i] > 0) {
                headings.push({ position: i, level: headingLevels[i] });
            }
            if (sectionMarkers[i] > 0 && sectionMarkers[i] < sectionTypes.length) {
                sections.push({
                    position: i,
                    type: sectionTypes[sectionMarkers[i]],
                });
            }
        }

        // Cleanup
        textBuffer.destroy();
        headingPositionsBuffer.destroy();
        headingLevelsBuffer.destroy();
        sectionMarkersBuffer.destroy();

        return { headings, sections };
    }

    private async readBuffer(buffer: GPUBuffer, length: number): Promise<Uint32Array> {
        const size = Math.max(length * 4, 16);
        const readBuffer = (this.device! as any).createBuffer({
            size: size,
            usage: (8 /* COPY_DST */) | (1 /* MAP_READ */),
        });

        const commandEncoder = (this.device! as any).createCommandEncoder();
        commandEncoder.copyBufferToBuffer(buffer, 0, readBuffer, 0, size);
        (this.device! as any).queue.submit([commandEncoder.finish()]);

        await (readBuffer as any).mapAsync(1 /* READ */);
        // Create a copy because unmap invalidates the array
        const result = new Uint32Array((readBuffer as any).getMappedRange());
        const copy = new Uint32Array(result);

        (readBuffer as any).unmap();
        (readBuffer as any).destroy();

        return copy;
    }

    destroy(): void {
        this.pipelines.clear();
        if (this.device) {
            (this.device as any).destroy();
            this.device = null;
        }
    }
}

/**
 * GPU-Accelerated Markdown Processor
 * Combines scanning, tokenization, chunking, and embedding
 */
export class GPUMarkdownProcessor {
    private scanner: GPUMarkdownScanner;
    private tokenizer: GPUTokenizer;
    private embedder: GPUEmbedder;
    private gpuAvailable: boolean = false;

    constructor() {
        this.scanner = new GPUMarkdownScanner();
        this.tokenizer = new GPUTokenizer();
        this.embedder = new GPUEmbedder();
    }

    async initialize(): Promise<void> {
        try {
            // Try to initialize GPU components
            await Promise.all([
                this.scanner.initialize(),
                this.tokenizer.initialize(),
                this.embedder.initialize()
            ]);
            this.gpuAvailable = true;
            console.log('✅ GPU Markdown Processor initialized with WebGPU');
        } catch (error) {
            console.warn('⚠️ WebGPU initialization failed, using CPU fallback:', error);
            this.gpuAvailable = false;
        }
    }

    async processMarkdown(text: string): Promise<MarkdownProcessingResult> {
        const startTime = performance.now();

        if (this.gpuAvailable) {
            // GPU-accelerated processing
            return this.processWithGPU(text, startTime);
        } else {
            // CPU fallback processing
            return this.processWithCPU(text, startTime);
        }
    }

    private async processWithGPU(text: string, startTime: number): Promise<MarkdownProcessingResult> {
        // Step 1: GPU scanning for structure
        const scanStart = performance.now();
        const { headings, sections } = await this.scanner.scanMarkdown(text);
        // const scanTime = performance.now() - scanStart; // unused

        // Step 2: Tokenization
        const tokenStart = performance.now();
        const tokens = await this.tokenizer.tokenize(text);
        const tokenTime = performance.now() - tokenStart;

        // Step 3: Semantic chunking
        const chunkStart = performance.now();
        const markdownSections = await this.createSections(text, headings, sections);
        const chunkTime = performance.now() - chunkStart;

        // Step 4: Embeddings
        const embedStart = performance.now();
        const embeddings = await this.embedder.embedSections(markdownSections);
        const embedTime = performance.now() - embedStart;

        const totalTime = performance.now() - startTime;
        const memoryUsed = await this.getGPUMemoryUsage();

        return {
            sections: markdownSections,
            tokens,
            embeddings,
            performance: {
                tokenizationTime: tokenTime,
                chunkingTime: chunkTime,
                embeddingTime: embedTime,
                gpuMemoryUsed: memoryUsed,
                totalTime,
            },
        };
    }

    private async processWithCPU(text: string, startTime: number): Promise<MarkdownProcessingResult> {
        // CPU-based processing as fallback
        const scanStart = performance.now();

        // Simple CPU-based section detection
        const { headings, sections } = this.scanMarkdownCPU(text);
        // const scanTime = performance.now() - scanStart; // unused

        // Simple tokenization
        const tokenStart = performance.now();
        const tokens = this.tokenizeCPU(text);
        const tokenTime = performance.now() - tokenStart;

        // Basic chunking
        const chunkStart = performance.now();
        const markdownSections = this.createSectionsCPU(text, headings, sections);
        const chunkTime = performance.now() - chunkStart;

        // No embeddings in CPU mode
        const embedTime = 0;
        const embeddings: Float32Array[] = [];

        const totalTime = performance.now() - startTime;

        return {
            sections: markdownSections,
            tokens,
            embeddings,
            performance: {
                tokenizationTime: tokenTime,
                chunkingTime: chunkTime,
                embeddingTime: embedTime,
                gpuMemoryUsed: 0,
                totalTime,
            },
        };
    }

    private async createSections(
        text: string,
        headings: Array<{ position: number; level: number }>,
        sections: Array<{ position: number; type: string }>
    ): Promise<MarkdownSection[]> {
        const result: MarkdownSection[] = [];
        const lines = text.split('\n');

        let currentSection: Partial<MarkdownSection> | null = null;
        let lineStart = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineOffset = text.indexOf(line, lineStart);

            // Check for headings
            const heading = headings.find((h) => Math.abs(h.position - lineOffset) < 10);
            if (heading) {
                // Save previous section
                if (currentSection) {
                    currentSection.endOffset = lineOffset;
                    currentSection.content = text.slice(
                        currentSection.startOffset!,
                        currentSection.endOffset
                    );
                    result.push(currentSection as MarkdownSection);
                }

                // Start new heading section
                currentSection = {
                    type: 'heading',
                    level: heading.level,
                    startOffset: lineOffset,
                    content: '',
                };
                lineStart = lineOffset + line.length + 1; // update lineStart
                continue;
            }

            // Check for legal sections
            const section = sections.find((s) => Math.abs(s.position - lineOffset) < 20);
            if (section) {
                // Save previous section
                if (currentSection) {
                    currentSection.endOffset = lineOffset;
                    currentSection.content = text.slice(
                        currentSection.startOffset!,
                        currentSection.endOffset
                    );
                    result.push(currentSection as MarkdownSection);
                }

                // Start new legal section
                currentSection = {
                    type: section.type as any,
                    startOffset: lineOffset,
                    content: '',
                };
                lineStart = lineOffset + line.length + 1;
                continue;
            }

            // Continue building current section
            if (currentSection && !currentSection.type) {
                if (line.trim().startsWith('- ') || line.trim().match(/^\d+\./)) {
                    currentSection.type = 'list';
                } else if (line.trim().startsWith('```')) {
                    currentSection.type = 'code';
                } else {
                    currentSection.type = 'paragraph';
                }
            }

            lineStart = lineOffset + line.length + 1;
        }

        // Save final section
        if (currentSection) {
            currentSection.endOffset = text.length;
            currentSection.content = text.slice(currentSection.startOffset!, currentSection.endOffset);
            result.push(currentSection as MarkdownSection);
        }

        return result;
    }

    private scanMarkdownCPU(text: string): {
        headings: Array<{ position: number; level: number }>;
        sections: Array<{ position: number; type: string }>;
    } {
        const headings: Array<{ position: number; level: number }> = [];
        const sections: Array<{ position: number; type: string }> = [];

        const lines = text.split('\n');
        let currentPos = 0;

        for (const line of lines) {
            // Find headings
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const title = headingMatch[2].toLowerCase();

                headings.push({ position: currentPos, level });

                if (title.includes('fact')) sections.push({ position: currentPos, type: 'facts' });
                else if (title.includes('reasoning') || title.includes('analysis'))
                    sections.push({ position: currentPos, type: 'reasoning' });
                else if (title.includes('holding') || title.includes('decision'))
                    sections.push({ position: currentPos, type: 'holding' });
                else if (title.includes('conclusion') || title.includes('result'))
                    sections.push({ position: currentPos, type: 'conclusion' });
            }

            currentPos += line.length + 1; // +1 for newline
        }

        return { headings, sections };
    }

    private tokenizeCPU(text: string): Token[] {
        // Simple word-based tokenization
        // Using a simplistic regex split for demo
        const words = text.split(/\s+/).filter((word) => word.length > 0);
        let currentPos = 0;

        return words.map((word) => {
             const pos = text.indexOf(word, currentPos);
             currentPos = pos + word.length;
             return {
                text: word,
                type: 'word' as const,
                position: pos,
                confidence: 1.0,
            };
        });
    }

    private createSectionsCPU(
        text: string,
        headings: Array<{ position: number; level: number }>,
        sections: Array<{ position: number; type: string }>
    ): MarkdownSection[] {
        const result: MarkdownSection[] = [];

        // Combine markers
        const allMarkers = [
            ...headings.map((h) => ({ ...h, type: 'heading' as const, level: h.level })),
            ...sections.map((s) => ({ ...s, type: s.type as any, level: 1 })) // sections don't have level property
        ];

        allMarkers.sort((a, b) => a.position - b.position);

        for (let i = 0; i < allMarkers.length; i++) {
            const marker = allMarkers[i];
            const nextMarker = allMarkers[i + 1];
            const endOffset = nextMarker ? nextMarker.position : text.length;

            result.push({
                type: marker.type,
                level: (marker as any).level,
                startOffset: marker.position,
                endOffset: endOffset,
                content: text.slice(marker.position, endOffset).trim(),
                metadata: {},
            });
        }

        return result;
    }

    private async getGPUMemoryUsage(): Promise<number> {
        // This would integrate with WebGPU memory reporting
        // For now return dummy 0
        return 0;
    }

    destroy(): void {
        this.scanner.destroy();
        this.tokenizer.destroy();
        this.embedder.destroy();
    }
}

/**
 * GPU-Accelerated Tokenizer Placeholder
 */
export class GPUTokenizer {
    async initialize(): Promise<void> {
        // WebGPU tokenizer implementation stub
    }

    async tokenize(text: string): Promise<Token[]> {
        // GPU-accelerated tokenization stub
        return [];
    }

    destroy(): void {
        // Cleanup stub
    }
}

/**
 * GPU-Accelerated Embedder Placeholder
 */
export class GPUEmbedder {
    async initialize(): Promise<void> {
        // WebGPU embedder implementation stub
    }

    async embedSections(sections: MarkdownSection[]): Promise<Float32Array[]> {
        // GPU-accelerated embedding stub
        return [];
    }

    destroy(): void {
        // Cleanup stub
    }
}

// Export main processing function
export async function gpuMarkdownScan(device: GPUDevice, text: string) {
    // The processor handles device creation internaly in its scanner for this file's logic
    // But if we want to pass a device, we might need to modify the scanner to accept it.
    // For now keeping consistent with existing usage pattern found in class:
    const scanner = new GPUMarkdownProcessor();
    await scanner.initialize();
    return scanner.processMarkdown(text);
}
