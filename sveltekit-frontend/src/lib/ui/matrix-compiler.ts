// JSON UI Compiler with Matrix Transforms
// Builds on UnoCSS + Svelte 5 for GPU-accelerated layouts
import { mat4, vec4 } from 'gl-matrix';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

export interface MatrixUINode {
    type?: 'button' | 'card' | 'input' | 'dialog' | 'grid' | 'evidence-item' | 'panel' | 'text' | 'image' | 'container';
    id: string;
	matrix: number[]; // 4x4 transform matrix
    styles: {
        base?: string;
        color?: string;
        backgroundColor?: string;
        border?: string;
        opacity?: number;
        hover?: string;
        active?: string;
        disabled?: string;
        [key: string]: unknown;
    };
    events?: string[];
    children?: MatrixUINode[];
    metadata?: {
        priority?: 'critical' | 'high' | 'medium' | 'low';
        confidence?: number;
        evidenceType?: string;
        aiGenerated?: boolean;
        lodLevel?: 'low' | 'mid' | 'high';
        component?: string;
    };
    content?: string;
    bounds?: {
	x: number; y: number;
	width: number; height: number };
}

export interface EnhancedWebGLBuffer {
    vertices: Float32Array;
	indices: Uint16Array;
    colors: Float32Array;
	texCoords: Float32Array;
    matrices: Float32Array;
	metadata: {
        vertexCount: number;
	indexCount: number;
        nodeCount: number;
	lodLevel: 'low' | 'mid' | 'high';
        shaderComplexity: 'basic' | 'standard' | 'advanced';
    };
}

export interface CSSOutput {
    classes: string[];
	variables: Record<string, string>;
    animations: string[];
	unoCSS: string;
}

export interface EventMapping {
    nodeId: string;
	events: {
        type: string;
	handler: string;
        matrix: number[];
	bounds: { x: number;
	y: number; width: number;
	height: number };
    }[];
}

export interface CompiledNode {
    element: HTMLElement;
	matrix: mat4;
    cssClasses: string[];
    webglBuffer?: WebGLBuffer;
    enhancedBuffer?: EnhancedWebGLBuffer;
	lodLevel: 'low' | 'mid' | 'high';
}

export class MatrixUICompiler {
    private gl: WebGL2RenderingContext | null = null;
    private cssCache = new Map<string, string>();
    private bufferCache = new Map<string, WebGLBuffer>();
    private lodThresholds = {
        low: {
	maxVertices: 1000, maxNodes: 50 },
	mid: {
	maxVertices: 5000, maxNodes: 200 },
	high: {
	maxVertices: 20000, maxNodes: 1000 }
    };

    constructor(canvas?: HTMLCanvasElement) {
        if (canvas) {
            this.gl = canvas.getContext('webgl2');
        }
    }

    /**
     * Enhanced compilation with full Phase 8 features: JSON → WebGL + CSS + Events
     */
    async compileEnhanced(
        nodes: MatrixUINode[],
        _xstateContext?: unknown
    ): Promise<{
	compiled: CompiledNode[];
        webgl: EnhancedWebGLBuffer;
	css: CSSOutput;
        events: EventMapping[];
	optimizations: string[];
    }> {
        const optimizations: string[] = [];

        // 1. Optimize node tree for performance
        const optimizedNodes = this.optimizeNodeTree(nodes, optimizations);

        // 2. Calculate LOD level
        const lodLevel = this.calculateLODLevel(optimizedNodes);
        optimizations.push(`Selected LOD level: ${lodLevel}`);

        // 3. Compile individual nodes
        const compiledNodes: CompiledNode[] = [];
        for (const node of optimizedNodes) {
            const compiled = await this.compileNode(node);
            compiledNodes.push(compiled);
        }

        // 4. Generate enhanced WebGL buffers
        const webglBuffer = this.generateEnhancedWebGLBuffers(optimizedNodes, lodLevel);

        // 5. Generate UnoCSS classes and CSS
        const cssOutput = await this.generateEnhancedCSS(optimizedNodes, _xstateContext);

        // 6. Map events with matrix-aware coordinates
        const eventMappings = this.generateEventMappings(optimizedNodes);

        return {
            compiled: compiledNodes,
            webgl: webglBuffer,
            css: cssOutput,
            events: eventMappings,
            optimizations
        };
    }

    /**
     * Legacy compile method for backward compatibility
     */
    async compile(uiDefinition: MatrixUINode[]): Promise<CompiledNode[]> {
        const result = await this.compileEnhanced(uiDefinition);
        return result.compiled;
    }

    private optimizeNodeTree(nodes: MatrixUINode[], optimizations: string[]): MatrixUINode[] {
        const optimized = nodes.filter((node) => !node.styles?.disabled);
        optimizations.push(`Removed ${nodes.length - optimized.length} disabled nodes`);
        return optimized;
    }

    private calculateLODLevel(nodes: MatrixUINode[]): 'low' | 'mid' | 'high' {
        const nodeCount = nodes.length;
        if (nodeCount < this.lodThresholds.low.maxNodes) return 'low';
        if (nodeCount < this.lodThresholds.mid.maxNodes) return 'mid';
        return 'high';
    }

    private generateEnhancedWebGLBuffers(
        nodes: MatrixUINode[],
        lodLevel: 'low' | 'mid' | 'high'
    ): EnhancedWebGLBuffer {
        const vertexCount = nodes.length * 4; // 4 vertices per node
        const vertices = new Float32Array(vertexCount * 3); // x, y, z
        const indices = new Uint16Array(nodes.length * 6); // 6 indices per quad
        const colors = new Float32Array(vertexCount * 4); // r, g, b, a
        const texCoords = new Float32Array(vertexCount * 2); // u, v
        const matricesBuffer = new Float32Array(nodes.length * 16); // 4x4 matrix per node

        nodes.forEach((node, i) => {
            const bounds = node?.bounds ?? { x: 0, y: 0, width: 100, height: 100 };
            const baseVertex = i * 4;
            const baseIndex = i * 6;

            // Vertices (quad)
            vertices[baseVertex * 3] = bounds.x;
            vertices[baseVertex * 3 + 1] = bounds.y;
            vertices[baseVertex * 3 + 2] = 0;

            vertices[baseVertex * 3 + 3] = bounds.x + bounds.width;
            vertices[baseVertex * 3 + 4] = bounds.y;
            vertices[baseVertex * 3 + 5] = 0;

            vertices[baseVertex * 3 + 6] = bounds.x + bounds.width;
            vertices[baseVertex * 3 + 7] = bounds.y + bounds.height;
            vertices[baseVertex * 3 + 8] = 0;

            vertices[baseVertex * 3 + 9] = bounds.x;
            vertices[baseVertex * 3 + 10] = bounds.y + bounds.height;
            vertices[baseVertex * 3 + 11] = 0;

            // Indices (two triangles)
            indices[baseIndex] = baseVertex;
            indices[baseIndex + 1] = baseVertex + 1;
            indices[baseIndex + 2] = baseVertex + 2;
            indices[baseIndex + 3] = baseVertex + 2;
            indices[baseIndex + 4] = baseVertex + 3;
            indices[baseIndex + 5] = baseVertex;

            // Matrix data
            const matrix = node?.matrix ?? Array(16).fill(0);
            matricesBuffer.set(matrix, i * 16);
        });

        return {
            vertices,
            indices,
            colors,
            texCoords,
            matrices: matricesBuffer,
            metadata: {
                vertexCount,
                indexCount: indices.length,
                nodeCount: nodes.length,
                lodLevel,
                shaderComplexity: lodLevel === 'high' ? 'advanced' : 'standard'
            }
        };
    }

    private generateNodeClasses(node: MatrixUINode): string[] {
        const classes: string[] = [];

        // Base styling
        classes.push('relative', 'transition-all', 'duration-300');

        // Node type specific classes
        switch (node.type) {
            case 'container':
                classes.push('flex', 'flex-col');
                break;
            case 'text':
                classes.push('text-base', 'leading-relaxed');
                break;
            case 'button':
                classes.push('px-4', 'py-2', 'rounded', 'cursor-pointer');
                break;
            default:
                classes.push('block');
        }

        return classes;
    }

    private async generateEnhancedCSS(
        nodes: MatrixUINode[],
        _xstateContext?: unknown
    ): Promise<CSSOutput> {
        const classes: string[] = [];
        const variables: Record<string, string> = {};
        const animations: string[] = [];

        nodes.forEach((node) => {
            const baseClasses = this.generateNodeClasses(node);
            classes.push(...baseClasses);

            // Add AI-specific classes
            if (node.metadata?.aiGenerated) {
                classes.push('ai-generated', 'border-purple-500/50');
            }

            // Add confidence-based styling
            if (node.metadata?.confidence !== undefined) {
                const confidence = node.metadata.confidence;
                if (confidence > 0.8) {
                    classes.push('border-green-500');
                } else if (confidence > 0.6) {
                    classes.push('border-yellow-500');
                } else {
                    classes.push('border-red-500');
                }
            }
        });

        return {
            classes: [...new Set(classes)],
            variables,
            animations,
            unoCSS: classes.join(' ')
        };
    }

    private generateEventMappings(nodes: MatrixUINode[]): EventMapping[] {
        return nodes.map((node) => ({
            nodeId: node.id,
            events: node.events?.map((eventType) => ({
                type: eventType,
                handler: `handle${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`,
                matrix: node?.matrix ?? Array(16).fill(0),
                bounds: node?.bounds ?? { x: 0, y: 0, width: 100, height: 100 }
            })) ?? []
        }));
    }

    private async compileNode(node: MatrixUINode): Promise<CompiledNode> {
        // Create DOM element
        const element = this.createElement(node);

        // Parse matrix transform
        const matrix = node.matrix
            ? mat4.clone(node.matrix as unknown as mat4)
            : mat4.create();

        // Generate CSS classes with UnoCSS
        const cssClasses = await this.generateCSS(node);

        // Create WebGL buffer for GPU acceleration
        const webglBuffer = this.createWebGLBuffer(node, new Float32Array(matrix as unknown as ArrayLike<number>));

        // Determine LOD level
        const lodLevel: 'low' | 'mid' | 'high' = 'mid';

        return {
            element,
            matrix,
            cssClasses,
            webglBuffer,
            lodLevel
        };
    }

    private createElement(node: MatrixUINode): HTMLElement {
        let element: HTMLElement;

        switch (node.type) {
            case 'button':
                element = document.createElement('button');
                break;
            case 'card':
                element = document.createElement('div');
                element.setAttribute('role', 'article');
                break;
            case 'input':
                element = document.createElement('input');
                break;
            case 'dialog':
                element = document.createElement('dialog');
                break;
            case 'evidence-item':
                element = document.createElement('div');
                element.setAttribute('data-evidence-type', node.metadata?.evidenceType ?? '');
                break;
            default:
                element = document.createElement('div');
        }

        element.id = node.id;

        // Add event listeners
        if (node.events) {
            node.events.forEach((eventType) => {
                element.addEventListener(eventType, (e: Event) => {
                    this.handleEvent(e, node);
                });
            });
        }

        return element;
    }

    private async generateCSS(node: MatrixUINode): Promise<string[]> {
        const cacheKey = `${node.type}-${JSON.stringify(node.styles)}`;

        if (this.cssCache.has(cacheKey)) {
            return this.cssCache.get(cacheKey)!.split(' ');
        }

        const classes: string[] = [];

        // Base classes from UnoCSS shortcuts
        switch (node.type) {
            case 'button':
                classes.push('yorha-button');
                break;
            case 'card':
                classes.push('yorha-card');
                if (node.metadata?.priority) {
                    classes.push(`yorha-priority-${node.metadata.priority}`);
                }
                break;
            case 'evidence-item':
                classes.push('yorha-evidence-item');
                if (node.metadata?.evidenceType) {
                    classes.push(`evidence-type-${node.metadata.evidenceType}`);
                }
                break;
        }

        // Add style modifiers
        if (node.styles?.base) {
            classes.push(...node.styles.base.split(' '));
        }

        // AI confidence styling
        if (node.metadata?.confidence !== undefined) {
            if (node.metadata.confidence > 80) {
                classes.push('vector-confidence-high');
            } else if (node.metadata.confidence > 60) {
                classes.push('vector-confidence-medium');
            } else {
                classes.push('vector-confidence-low');
            }
        }

        // Matrix transform classes
        if (node.matrix) {
            const transformClass = this.generateTransformCSS(node.matrix);
            if (transformClass) {
                classes.push(transformClass);
            }
        }

        const classString = classes.join(' ');
        this.cssCache.set(cacheKey, classString);

        return classes;
    }

    private generateTransformCSS(matrix: number[]): string {
        const m = matrix;

        const translateX = m[12] ?? 0;
        const translateY = m[13] ?? 0;
        const translateZ = m[14] ?? 0;

        const scaleX = vec4.length(vec4.fromValues(m[0], m[1], m[2], m[3]));
        const scaleY = vec4.length(vec4.fromValues(m[4], m[5], m[6], m[7]));

        const transformValue = `translate3d(${translateX}px, ${translateY}px, ${translateZ}px) scale3d(${scaleX},
	${scaleY},
	1)`;
        const className = `matrix-transform-${Math.abs(translateX + translateY).toString(36)}`;

        if (typeof document !== 'undefined' && !document.querySelector(`style[data-matrix="${className}"]`)) {
            const style = document.createElement('style');
            style.setAttribute('data-matrix', className);
            style.textContent = `.${className} { transform: ${transformValue}; }`;
            document.head.appendChild(style);
        }

        return className;
    }

    private createWebGLBuffer(node: MatrixUINode, matrix: Float32Array): WebGLBuffer | undefined {
        if (!this.gl) return undefined;

        const cacheKey = node.id;
        if (this.bufferCache.has(cacheKey)) {
            return this.bufferCache.get(cacheKey);
        }

        const vertices = new Float32Array([
            -0.5, -0.5, 0.0, 0.0, 0.0, // Bottom-left
             0.5, -0.5, 0.0, 1.0, 0.0, // Bottom-right
             0.5,  0.5, 0.0, 1.0, 1.0, // Top-right
            -0.5,  0.5, 0.0, 0.0, 1.0  // Top-left
        ]);

        const buffer = this.gl.createBuffer();
        if (buffer) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
            this.bufferCache.set(cacheKey, buffer);
        }

        return buffer ?? undefined;
    }

    private handleEvent(event: Event, node: MatrixUINode): void {
        // Custom event handling with matrix context
        console.log(`Event ${event.type} on node ${node.id}`);
    }
}

// Export singleton instance
export const matrixCompiler = new MatrixUICompiler();
