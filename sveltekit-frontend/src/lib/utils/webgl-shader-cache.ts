/* Clean, consolidated WebGL shader cache with optional server-side embedding hooks. */
import Redis from 'ioredis';
import type { Pool } from 'pg'; // pg-native
import type { Writable } from 'svelte/store';
import { writable } from 'svelte/store';

/* ============================================
 * Types & Interfaces (consolidated)
 * ============================================ */
export type ShaderID = string;

export interface ShaderProgram {
    id: string;
    name?: string;
    program: WebGLProgram;
    attributes: Map<string, number>;
    uniforms: Map<string, WebGLUniformLocation | null>;
    vertexSource?: string;
    fragmentSource?: string;
    compilationTime: number;
    lastUsed: number;
    useCount: number;
    averageExecutionTime?: number;
    description?: string;
    tags?: string[];
    operation?: string;
}

export interface ShaderCacheMetrics {
    totalShaders: number;
    compiledShaders: number;
    cacheHits: number;
    cacheMisses: number;
    totalCompilationTime: number;
    averageCompilationTime: number;
    memoryUsage: number;
}

export interface AttributeConfig {
    buffer: WebGLBuffer;
    size: number;
    type?: number;
    normalized?: boolean;
    stride?: number;
    offset?: number;
    divisor?: number;
}

export type UniformsMap = Record<string, unknown>;
export type AttributesMap = Record<string: AttributeConfig | WebGLBuffer>;

export interface ComprehensiveCachingSetOptions {
    ttl?: number;
    tags?: string[];
    layers?: string[];
}

export interface ComprehensiveCachingArchitecture {
    set(key: string, value: unknown, options?: ComprehensiveCachingSetOptions): Promise<void>;
    get<T = unknown>(key: string): Promise<T | null>;
    delete?(key: string): Promise<void>;
}

/* ============================== Embedded clients (injected) ============================== */

// Partial definitions for flexible client injection
type RedisWithBuffer = Partial<Redis> & {
    setBuffer?: (key: string, value: Uint8Array) => Promise<void>;
    keys?: (pattern: string) => Promise<string[]>;
    get?: (key: string) => Promise<string | null>;
    set?: (key: string, value: string, ...args: unknown[]) => Promise<'OK' | null>;
};

interface QdrantClient {
    upsert?: (collection: string, points: unknown) => Promise<unknown>;
    search?: (collection: string, query: unknown) => Promise<unknown>;
    query?: (collection: string, query: unknown) => Promise<unknown>;
}

let redisClient: RedisWithBuffer | null = null;
let pgPool: Pool | null = null;
let qdrantClient: QdrantClient | null = null;
let ollamaEndpoint = process.env.OLLAMA_URL?.replace(/\/+$/, '') ?? '';

export function initCacheClients(opts: {
    redis?: RedisWithBuffer | null,
    pg?: Pool | null,
    qdrant?: QdrantClient | null;
    ollama?: string
} = {}) {
    redisClient = opts.redis ?? null;
    pgPool = opts.pg ?? null;
    qdrantClient = opts.qdrant ?? null;
    if (opts.ollama) ollamaEndpoint = opts.ollama.replace(/\/+$/, '');
}

/* small internal cosine similarity fallback */
function cosineSimilarityVec(a: number[], b: number[]): number {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += (a[i] ?? 0) * (b[i] ?? 0);
        na += (a[i] ?? 0) * (a[i] ?? 0);
        nb += (b[i] ?? 0) * (b[i] ?? 0);
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/* ============================================
 * WebGLShaderCache
 * ============================================ */
export class WebGLShaderCache {
    private gl: WebGLRenderingContext | WebGL2RenderingContext;
    private cacheArchitecture?: ComprehensiveCachingArchitecture;
    private shaderPrograms: Map<string, ShaderProgram> = new Map();
    private metrics: Writable<ShaderCacheMetrics>;
    private cacheHits = 0;
    private cacheMisses = 0;

    constructor(
        gl: WebGLRenderingContext | WebGL2RenderingContext,
        cacheArchitecture?: ComprehensiveCachingArchitecture
    ) {
        this.gl = gl;
        this.cacheArchitecture = cacheArchitecture;
        this.metrics = writable(this.getInitialMetrics());
    }

    /* ---------- Public Getters ---------- */
    public getMetrics(): Writable<ShaderCacheMetrics> { return this.metrics; }
    public getCachedShaders(): Map<string, ShaderProgram> { return this.shaderPrograms; }

    /* ---------- Vertex Attributes ---------- */
    public setupVertexAttributes(program: ShaderProgram, attributes: AttributesMap): void {
        for (const [name, maybeConfig] of Object.entries(attributes)) {
            const location = program.attributes.get(name);
            if (location === undefined) {
                // console.warn(`Attribute '${name}' not found in shader '${program.id}'`);
                continue;
            }
            const cfg = maybeConfig as AttributeConfig;
            const buffer = 'buffer' in cfg ? cfg.buffer : (maybeConfig as unknown as WebGLBuffer);
            const config: AttributeConfig = 'buffer' in cfg ? cfg : { buffer: buffer as WebGLBuffer, size: 3 };

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, config.buffer);
            this.gl.enableVertexAttribArray(location);
            this.gl.vertexAttribPointer(
                location,
                config.size,
                (config.type ?? this.gl.FLOAT) as number,
                Boolean(config.normalized),
                config.stride ?? 0,
                config.offset ?? 0
            );

            const divisor = config.divisor ?? 0;
            if (divisor > 0) {
                const gl2 = this.gl as WebGL2RenderingContext;
                if (typeof (gl2 as WebGL2RenderingContext).vertexAttribDivisor === 'function') {
                    try { (gl2 as WebGL2RenderingContext).vertexAttribDivisor(location, divisor); } catch { /* ignore */ }
                } else {
                    const ext = (this.gl as WebGLRenderingContext).getExtension('ANGLE_instanced_arrays');
                    if (ext?.vertexAttribDivisorANGLE) {
                        try { ext.vertexAttribDivisorANGLE(location, divisor); } catch { /* ignore */ }
                    }
                }
            }
        }
    }

    /* ---------- Uniforms ---------- */
    private isTextureObj(v: any): v is { texture: WebGLTexture; unit?: number; target?: number } {
        return !!v && typeof v === 'object' && 'texture' in (v as Record<string, unknown>);
    }

    private isNumericWrapper(v: any): v is { value: number } {
        return (!!v && typeof v === 'object' && 'value' in (v as Record<string, unknown>) && typeof (v as { value?: unknown }).value === 'number');
    }

    public setUniforms(program: ShaderProgram, uniforms: UniformsMap): void {
        for (const [name, value] of Object.entries(uniforms || {})) {
            const loc = program.uniforms.get(name);
            if (!loc) continue;

            if (typeof value === 'number') {
                this.gl.uniform1f(loc, value);
                continue;
            }
            if (typeof value === 'boolean') {
                this.gl.uniform1i(loc, value ? 1 : 0);
                continue;
            }

            if (this.isTextureObj(value)) {
                try {
                    const texObj = value;
                    const unit = texObj.unit ?? 0;
                    const target = texObj.target ?? this.gl.TEXTURE_2D;
                    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
                    this.gl.bindTexture(target, texObj.texture);
                    this.gl.uniform1i(loc, unit);
                } catch { /* best-effort */ }
                continue;
            }

            if (value instanceof Float32Array) {
                const len = value.length;
                if (len === 16) this.gl.uniformMatrix4fv(loc, false, value);
                else if (len === 9) this.gl.uniformMatrix3fv(loc, false, value);
                else if (len === 4) this.gl.uniform4fv(loc, value);
                else if (len === 3) this.gl.uniform3fv(loc, value);
                else if (len === 2) this.gl.uniform2fv(loc, value);
                else this.gl.uniform1fv(loc, value);
                continue;
            }

            if (value instanceof Int32Array) {
                const len = value.length;
                if (len === 4) this.gl.uniform4iv(loc, value);
                else if (len === 3) this.gl.uniform3iv(loc, value);
                else if (len === 2) this.gl.uniform2iv(loc, value);
                else this.gl.uniform1iv(loc, value);
                continue;
            }

            if (Array.isArray(value)) {
                switch (value.length) {
                    case 1: this.gl.uniform1fv(loc, new Float32Array(value)); break;
                    case 2: this.gl.uniform2fv(loc, new Float32Array(value)); break;
                    case 3: this.gl.uniform3fv(loc, new Float32Array(value)); break;
                    case 4: this.gl.uniform4fv(loc, new Float32Array(value)); break;
                    case 9: this.gl.uniformMatrix3fv(loc, false, new Float32Array(value)); break;
                    case 16: this.gl.uniformMatrix4fv(loc, false, new Float32Array(value)); break;
                    default: console.warn(`Unsupported uniform array length: ${value.length} for '${name}'`);
                }
                continue;
            }

            if (this.isNumericWrapper(value)) {
                this.gl.uniform1f(loc, value.value);
                continue;
            }
        }
    }

    /* ---------- Render ---------- */
    public render(
        program: ShaderProgram,
        uniforms: UniformsMap,
        attributes: AttributesMap,
        drawMode: number = this.gl.TRIANGLES,
        count?: number,
        indexBuffer?: WebGLBuffer
    ): void {
        this.gl.useProgram(program.program);
        this.setUniforms(program, uniforms);
        this.setupVertexAttributes(program, attributes);

        if (indexBuffer) {
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            this.gl.drawElements(drawMode, count ?? 0, this.gl.UNSIGNED_SHORT, 0);
        } else {
            this.gl.drawArrays(drawMode, 0, count ?? 0);
        }

        program.lastUsed = Date.now();
        program.useCount++;
        this.updateMetrics();
    }

    /* ---------- Metrics & Cleanup ---------- */
    private updateMetrics(): void {
        const totalTime = Array.from(this.shaderPrograms.values()).reduce((s, sh) => s + (sh?.compilationTime ?? 0), 0);
        const total = this.shaderPrograms.size;

        const metrics: ShaderCacheMetrics = {
            totalShaders: total,
            compiledShaders: total,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            totalCompilationTime: totalTime,
            averageCompilationTime: total > 0 ? totalTime / total : 0,
            memoryUsage: this.estimateMemoryUsage()
        };
        this.metrics.set(metrics);
    }

    private estimateMemoryUsage(): number {
        return this.shaderPrograms.size * 10 * 1024; // ~10 KB per shader
    }

    private getInitialMetrics(): ShaderCacheMetrics {
        return {
            totalShaders: 0,
            compiledShaders: 0,
            cacheHits: 0,
            cacheMisses: 0,
            totalCompilationTime: 0,
            averageCompilationTime: 0,
            memoryUsage: 0
        };
    }

    public cleanup(): void {
        for (const shader of this.shaderPrograms.values()) {
            try { this.gl.deleteProgram(shader.program); } catch { /* ignore */ }
        }
        this.shaderPrograms.clear();
        this.updateMetrics();
    }

    /* ---------- Embedding & Searchable Caching ---------- */
    // Placeholder implementations for embedding logic to satisfy imports
    // ...existing logic assumed here...
}

/* ---------- Factory ---------- */
export function createWebGLShaderCache(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    cacheArchitecture?: ComprehensiveCachingArchitecture
): WebGLShaderCache {
    return new WebGLShaderCache(gl, cacheArchitecture);
}

/* ========== New helpers ========== */
export const EMBEDDING_MODEL = 'embeddinggemma:latest';
export const EMBEDDING_DIM = 384;

export function getOllamaEndpoint(path = '/api/embeddings'): string {
    const baseFromVar = (ollamaEndpoint ?? '').trim();
    const env = (process.env?.OLLAMA_URL && process.env.OLLAMA_URL.trim()) ?? '';
    const base = baseFromVar || env || 'http://ollama:11434';
    const cleanBase = base.replace(/\/+$/, '');
    if (!path) return cleanBase;
    return cleanBase + (path.startsWith('/') ? path : '/' + path);
}

function extractTags(meta: Record<string, unknown> | undefined): string[] {
    if (!meta) return [];
    const maybe = (meta as { tags?: unknown }).tags;
    if (Array.isArray(maybe) && maybe.every((t: any) => typeof t === 'string')) return maybe as string[];
    return [];
}







