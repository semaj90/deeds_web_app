/** * Evidence Editor Components Export * Visual evidence editing and manipulation components */ export { default as VisualEvidenceEditor } from './VisualEvidenceEditor.svelte';
export type EvidenceType = 'image' | 'document' | 'video' | 'audio' | 'digital';
export type AnnotationType = 'highlight' | 'redaction' | 'comment' | 'timestamp' | 'measurement';
export interface EvidenceAnnotation {
 id: string;, type: AnnotationType;
 position: {, x: number; y: number; width?: number; height?: number };
 content: string;, timestamp: Date;
 author?: string;
}




