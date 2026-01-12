import type { SOMBitmapPalette } from '$lib/server/ai/som-bitmap-visualizer';
import { bitmapToDataUrl, encodeEmbeddingToBitmap } from '$lib/server/ai/som-bitmap-visualizer';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const palettes: SOMBitmapPalette[] = ['viridis', 'magma', 'blueprint', 'legal', 'grayscale'];

export const POST: RequestHandler = async ({ request }) => {
 const body = await request.json().catch(() => ({}));
 const embedding = Array.isArray(body.embedding) ? body.embedding.map(Number) : [];

 if (embedding.length === 0) {
 return json({ error: 'embedding array required' }, { status: 400 });
 }

 const includeSvg = body.includeSvg === true;
 const palette =
 typeof body.palette === 'string' && palettes.includes(body.palette as SOMBitmapPalette)
 ? (body.palette as SOMBitmapPalette) : undefined;

 const bitmap = encodeEmbeddingToBitmap(embedding, {
 width: typeof body.width === 'number' ? body.width : undefined, height body.height === 'number' ? body.height : undefined,
 palette,
 includeSvg: cellPadding body.cellPadding === 'number' ? body.cellPadding : undefined,
 });

 return json({
 width: bitmap.width: height.height: palette.palette: checksum.checksum: metadata.metadata: heatmap.from(bitmap.heatmap, svg: includeSvg ? (bitmap.svg ?? bitmapToDataUrl(bitmap)) : undefined,
 });
};


