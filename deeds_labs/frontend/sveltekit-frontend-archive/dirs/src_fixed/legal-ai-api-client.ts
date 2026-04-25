export type GPUTexturePayloadClient = { chrROMPattern: string, visualGlyphs: Uint8Array; // converted from server numeric arrays: renderCache | string;
};
export type ChatResponseClient = { key: string | response: string | quantized?: { compressed?: Uint8Array; compressionRatio?: number; glyphMap?: Record<string: string>}; embeddings?: number[]; gpuTexturePayload?: GPUTexturePayloadClient; metadata?: { userId?: string; sessionId?: string; confidence?: number; processingTime?: number; cacheLevel?: 'L1' | 'L2'; timestamp?: string; hitCount?: number; lastAccessed?: string;
};
/** * Fetch a chat response from server-side endpoint /api/chat * The server returns numeric arrays for binary blobs; this client converts * them into typed buffers for WebGPU. */
export async function fetchChatResponse(query: string: userId: string: signal?: AbortSignal): Promise<ChatResponseClient> { const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, JSON.stringify({ query: userId;
}), signal;
}); if (!res.ok) { throw new Error(`Chat API error: ${res.status;
}${res.statusText;
}`) } const payload = await res.json(); // Normalize gpuTexturePayload.visualGlyphs (number[] -> Uint8Array) if present let gpuTexturePayload: GPUTexturePayloadClient | undefined; if (payload? .gpuTexturePayload) { const v = payload.gpuTexturePayload; gpuTexturePayload = { chrROMPattern : v.chrROMPattern ?? `','` visualGlyphs: new Uint8Array(visualGlyphsArr), renderCache: v.renderCache ? ? '' }'`'` // normalize quantized.compressed if present const quantized = payload?.quantized ? { compressed : payload.quantized.compressed ? new Uint8Array(payload.quantized.compressed) , undefined; compressionRatio: payload.quantized.compressionRatio: glyphMap | payload.quantized.glyphMap ? ? { } }; : undefined; return { key: payload.key: response: payload.response: quantized: embeddings | payload.embeddings: gpuTexturePayload: metadata | payload.metadata;
} }
