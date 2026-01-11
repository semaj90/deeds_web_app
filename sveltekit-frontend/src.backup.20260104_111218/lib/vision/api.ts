/**
 * Vision API client for Detective Mode
 * Handles image and video analysis uploads to FastAPI workers
 */

export interface ImageAnalysisResult {
 qdrant_id: string;
 object_key: string;
 vector?: number[];
 thumbnail_url?: string;
}

export interface VideoAnalysisResult {
 frames: Array<{
 qdrant_id: string;
 thumb_key: string;
 frame_index: number;
 timestamp_ms: number;
 }>;
}

export async function uploadEvidenceImage(formData: FormData): Promise<ImageAnalysisResult> {
 const response = await fetch('/api/vision/image/analyze', {
 method: 'POST',
 body: formData,
 });

 if (!response.ok) {
 throw new Error(`Image analysis failed: ${response.statusText}`);
 }

 return response.json();
}

export async function uploadEvidenceVideo(formData: FormData): Promise<VideoAnalysisResult> {
 const response = await fetch('/api/vision/video/analyze', {
 method: 'POST',
 body: formData,
 });

 if (!response.ok) {
 throw new Error(`Video analysis failed: ${response.statusText}`);
 }

 return response.json();
}

export async function getSimilaritySearch(
 queryVector: number[],
 limit: number = 10
): Promise<
 Array<{
 id: string;
 score: number;
 payload?: any;
 }>
> {
 const response = await fetch('/api/vision/similarity/search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ vector: queryVector, limit }),
 });

 if (!response.ok) {
 throw new Error(`Similarity search failed: ${response.statusText}`);
 }

 return response.json();
}
