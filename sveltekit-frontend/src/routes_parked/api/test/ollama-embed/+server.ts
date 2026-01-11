
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tryEmbedOllama, embeddingDims } from '$lib/server/embeddings/ollama';

// GET /api/test/ollama-embed?q=hello
export const GET: RequestHandler = async ({ url }) => {
    const q = url.searchParams.get('q') ?? 'hello world';

    const result = await tryEmbedOllama(q, {
        // keep this lightweight
        timeoutMs: 1500
    });

    if (!result) {
        return json({
            ok: false,
            message: 'Ollama embeddings unavailable or not running on localhost:11434'
        }, { status: 200 }); // Return 200 with error info so client doesn't explode
    }

    return json({
        ok: true,
        model: result.model,
        dims: embeddingDims(result.embedding)
    }, { status: 200 });
};
