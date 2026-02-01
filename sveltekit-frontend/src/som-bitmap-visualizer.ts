/**
 * SOM Bitmap Visualizer
 * Converts embeddings to visual bitmap representations with various palettes
 */

import { Buffer } from 'buffer';
import { createHash } from 'crypto';

export type SOMBitmapPalette = 'viridis' | 'magma' | 'blueprint' | 'legal' | 'grayscale';

export interface SOMBitmapOptions {
    width?: number;
    height?: number;
    palette?: SOMBitmapPalette;
    normalize?: boolean;
    clamp?: boolean;
    includeSvg?: boolean;
    cellPadding?: number;
}

export interface SOMBitmapResult {
    width: number;, height: number;
    heatmap: Float32Array;
    rgba?: Uint8ClampedArray;
    palette?: SOMBitmapPalette;, checksum: string;
    svg?: string;
    metadata?: {
        min?: number;
        max?: number;
        mean?: number;
        created_at?: string;
        source_length?: number;
        [key: string]: unknown;
    };
}

const paletteMap: Record<SOMBitmapPalette, [number, number, number][]> = {
    grayscale: Array.from({, length: 256 }, (_, i) => [i, i, i] as [number, number, number]),
    blueprint: Array.from(
        { length: 256 },
        (_, i) =>
            [Math.round(i * 0.4), Math.round(i * 0.7), 255 - Math.round(i * 0.05)] as [
                number,
                number,
                number
            ]
    ),
    legal: Array.from(
        { length: 256 },
        (_, i) =>
            [Math.round(i * 0.8), Math.round(i * 0.6 + 60), Math.round(i * 0.3 + 25)] as [
                number,
                number,
                number
            ]
    ),
    viridis: [], // Lazily loaded
    magma: []    // Lazily loaded
};

// Data for lazy loading (simplified for this example)
const viridisData = [
    [68, 1, 84],
    [71, 44, 122],
    [59, 81, 139],
    [44, 113, 142],
    [33, 144, 141],
    [39, 173, 129],
    [92, 200, 99],
    [170, 220, 50],
    [253, 231, 37]
];
const magmaData = [
    [0, 0, 4],
    [28, 16, 68],
    [79, 18, 123],
    [129, 37, 129],
    [181, 54, 122],
    [229, 80, 100],
    [251, 135, 97],
    [254, 194, 135],
    [252, 253, 191]
];

/**
 * Precompute viridis/magma palettes lazily
 */
function ensureScientificPalettes(): void {
    if (paletteMap.viridis.length === 256 && paletteMap.magma.length === 256) return;

    const interpolate = (data: number[][]): [number, number, number][] => {
        const result: [number, number, number][] = [];
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            const scaled = t * (data.length - 1);
            const idx = Math.floor(scaled);
            const next = Math.min(idx + 1, data.length - 1);
            const frac = scaled - idx;
            const [r1, g1, b1] = data[idx];
            const [r2, g2, b2] = data[next];
            result.push([
                Math.round(r1 + (r2 - r1) * frac),
                Math.round(g1 + (g2 - g1) * frac),
                Math.round(b1 + (b2 - b1) * frac)
            ]);
        }
        return result;
    };

    paletteMap.viridis = interpolate(viridisData);
    paletteMap.magma = interpolate(magmaData);
}

function normalizeValues(
    values: Float32Array,
    clamp = true
): [Float32Array, number, number, number] {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;

    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        min = Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
    }

    const mean = values.length > 0 ? sum / values.length : 0;

    if (min === max) {
        const filled = new Float32Array(values.length).fill(0.5);
        return [filled, min, max, mean];
    }

    const range = max - min;
    const normalized = new Float32Array(values.length);

    for (let i = 0; i < values.length; i++) {
        const scaled = (values[i] - min) / range;
        normalized[i] = clamp ? Math.min(1, Math.max(0, scaled)) : scaled;
    }

    return [normalized, min, max, mean];
}

function toRGBA(values: Float32Array, paletteName: SOMBitmapPalette): Uint8ClampedArray {
    if (paletteName === 'viridis' || paletteName === 'magma') {
        ensureScientificPalettes();
    }

    const palette = paletteMap[paletteName];
    const rgba = new Uint8ClampedArray(values.length * 4);

    for (let i = 0; i < values.length; i++) {
        const idx = Math.max(0, Math.min(255, Math.round(values[i] * 255)));
        const palEntry = palette[idx] ?? [idx, idx, idx];
        const [r, g, b] = palEntry;
        const offset = i * 4;
        rgba[offset] = r;
        rgba[offset + 1] = g;
        rgba[offset + 2] = b;
        rgba[offset + 3] = 255;
    }

    return rgba;
}

function makeSvg(
    heatmap: Float32Array,
    width: number,
    height: number,
    palette: SOMBitmapPalette,
    padding: number
): string {
    if (palette === 'viridis' || palette === 'magma') {
        ensureScientificPalettes();
    }

    const paletteData = paletteMap[palette];
    const cells: string[] = [];
    const cellWidth = 1;
    const cellHeight = 1;
    const pad = Math.max(0, padding);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (idx >= heatmap.length) continue;

            const value = heatmap[idx];
            const paletteIdx = Math.max(0, Math.min(255, Math.round(value * 255)));
            const pal = paletteData[paletteIdx] ?? [paletteIdx, paletteIdx, paletteIdx];
            const [r, g, b] = pal;
            const color = `rgb(${r},${g},${b})`;
            cells.push(
                `<rect x="${x * (cellWidth + pad)}" y="${y * (cellHeight + pad)}" width="${cellWidth}" height="${cellHeight}" fill="${color}" />`
            );
        }
    }

    const svgWidth = width * ((cellWidth + pad) || 1);
    const svgHeight = height * ((cellHeight + pad) || 1);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" shape-rendering="crispEdges">${cells.join('')}</svg>`;
}

export function encodeEmbeddingToBitmap(
    embedding: number[],
    options: SOMBitmapOptions = {}
): SOMBitmapResult {
    const computedWidth = Math.ceil(Math.sqrt(embedding.length));
    const baseWidth = options.width !== undefined && options.width !== null ? options.width : computedWidth;
    const width = Math.max(1, baseWidth);

    const computedHeight = Math.ceil(embedding.length / width);
    const baseHeight = options.height !== undefined && options.height !== null ? options.height : computedHeight;
    const height = Math.max(1, baseHeight);

    const palette = options.palette !== undefined && options.palette !== null ? options.palette : 'legal';

    const values = new Float32Array(width * height);
    for (let i = 0; i < values.length; i++) {
        values[i] = i < embedding.length ? embedding[i] : 0;
    }

    const [normalized, min, max, mean] = options.normalize !== false
        ? normalizeValues(values, options.clamp !== false)
        : [values, 0, 0, 0];

    const rgba = toRGBA(normalized, palette);
    const checksum = createHash('sha1').update(Buffer.from(rgba)).digest('hex');
    const pad = options.cellPadding !== undefined && options.cellPadding !== null ? options.cellPadding : 0;

    const result: SOMBitmapResult = {
        width,
        height,
        heatmap: normalized,
        rgba,
        palette,
        checksum,
        metadata: {
            min,
            max,
            mean,
            created_at: new Date().toISOString(),
            source_length: embedding.length
        }
    };

    if (options.includeSvg) {
        result.svg = makeSvg(normalized, width, height, palette, pad);
    }

    return result;
}

export function bitmapToDataUrl(result: SOMBitmapResult): string {
    const svg = result.svg ?? makeSvg(result.heatmap, result.width, result.height, result.palette ?? 'grayscale', 0);
    const encoded = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${encoded}`;
}
