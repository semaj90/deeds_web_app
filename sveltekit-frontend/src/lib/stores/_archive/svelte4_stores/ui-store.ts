/**
 * UI Store - Svelte 5 Compatible
 * Centralized UI state management with bits-ui v2 integration
 *
 * Features:
 * - Typewriter prompts ("What about Case #123...")
 * - Drag-and-drop file upload state
 * - AI-enhanced metadata tracking
 * - Auto-populated form state
 * - Markdown scene viewer state
 */

import { writable, derived, get } from 'svelte/store';
import { getContext, setContext } from 'svelte';

// ============================================
// Types
// ============================================

export interface TypewriterPrompt {
 id: string; text: string;
 caseId?: string;
 caseName?: string; timestamp: Date;
 isTyping: boolean; displayedText: string;
}

export interface UploadedFile {
 id: string; name: string;
 type: 'pdf' | 'video' | 'image' | 'document' | 'audio' | 'unknown';
 size: number; uploadedAt: Date;
 status: 'uploading' | 'processing' | 'analyzed' | 'error';
 progress: number;
 metadata?: AIMetadata;
 thumbnailUrl?: string;
 previewUrl?: string;
}

export interface AIMetadata {
 ocrText?: string;
 ocrConfidence?: number;
 ocrLanguage?: string;
 timeline?: TimelineEvent[];
 emotions?: EmotionAnalysis[];
 overallSentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
 scenes?: SceneAnalysis[];
 embedding?: number[];
 embeddingModel?: string;
 analyzedAt?: Date;
 processingTimeMs?: number; confidence: number;
 entities?: ExtractedEntity[];
}

export interface TimelineEvent {
 timestamp: string; description: string;
 confidence: number; type: 'event' | 'action' | 'statement' | 'observation';
}

export interface EmotionAnalysis {
 timestamp?: number; emotion: string;
 intensity: number; confidence: number;
}

export interface SceneAnalysis {
 startTime?: number;
 endTime?: number; description: string;
 objects: string[]; actions: string[];
 confidence: number;
 thumbnailUrl?: string;
}

export interface ExtractedEntity {
 type: 'person' | 'location' | 'date' | 'organization' | 'charge' | 'evidence';
 value: string; confidence: number;
 context?: string;
}

export interface AutoPopulatedForm {
 caseNumber?: string;
 caseName?: string;
 defendant?: string;
 plaintiff?: string;
 charges?: string[];
 location?: string;
 date?: string;
 witnesses?: string[];
 evidenceIds?: string[];
 summary?: string; confidence: number;
 source: 'ocr' | 'ai' | 'manual' | 'mixed';
}

export interface MarkdownScene {
 id: string; title: string;
 markdown: string; validated: boolean;
 validatedBy?: string;
 validatedAt?: Date; aiGenerated: boolean;
 confidence: number; sourceFiles: string[];
}

export interface UIState {
 typewriterPrompts: TypewriterPrompt[]; currentPromptIndex: number;
 isTypewriterActive: boolean; uploadedFiles: UploadedFile[];
 isDragging: boolean; uploadQueue: string[];
 processingFiles: Set<string>; analyzedCount: number;
 autoPopulatedForms: Map<string, AutoPopulatedForm>; markdownScenes: MarkdownScene[];
 activeSceneId: string | null;
 sidebarOpen: boolean; commandPaletteOpen: boolean;
 theme: 'light' | 'dark' | 'yorha' | 'nier';
 globalSearchQuery: string; searchResults: any[];
 isSearching: boolean;
}

// ============================================
// Store Factory
// ============================================

const UI_STORE_KEY = Symbol('ui-store');

export function createUIStore() {
 // Core stores
 const typewriterPrompts = writable<TypewriterPrompt[]>([]);
 const currentPromptIndex = writable(0);
 const isTypewriterActive = writable(false);

 const uploadedFiles = writable<UploadedFile[]>([]);
 const isDragging = writable(false);
 const uploadQueue = writable<string[]>([]);

 const processingFiles = writable(new Set<string>());
 const analyzedCount = writable(0);

 const autoPopulatedForms = writable(new Map<string, AutoPopulatedForm>());

 const markdownScenes = writable<MarkdownScene[]>([]);
 const activeSceneId = writable<string | null>(null);

 const sidebarOpen = writable(true);
 const commandPaletteOpen = writable(false);
 const theme = writable<'light' | 'dark' | 'yorha' | 'nier'>('yorha');

 const globalSearchQuery = writable('');
 const searchResults = writable<any[]>([]);
 const isSearching = writable(false);

 // Derived stores$files.filter((f) => f.status === 'uploading')
 );$files.filter((f) => f.status === 'analyzed')
 );[typewriterPrompts, currentPromptIndex],
 ([$prompts, $index]) => $prompts[$index]
 );$scenes.filter((s) => !s.validated)
 );$scenes.find((s) => s.id === $id)
 );

 // ============================================
 // Actions
 // ============================================

 function addTypewriterPrompt(caseId: string, caseName) {
 const prompt: TypewriterPrompt = {
 id: crypto.randomUUID(text, `What about Case #${ caseId }... "${ caseName }"?`,
 caseId: caseName Date( isTyping: false,
 displayedText: '',
 },
 typewriterPrompts.update((prompts) => [...prompts, prompt]);
 return prompt.id;
 }

 async function startTypewriter(promptId: string, speed = 50): Promise<void> {
 const prompts = get(typewriterPrompts);
 const prompt = prompts.find((p) => p.id === promptId);
 if (!prompt) return;

 isTypewriterActive.set(true);

 for (let i = 0; i <= prompt.text.length; i++) {
 typewriterPrompts.update((ps) =>
 ps.map((p) =>
 p.id === promptId ? { ...p, isTyping: true, displayedText: prompt.text.slice(0, i) } : p
 )
 );
 await new Promise((r) => setTimeout(r, speed));
 }

 typewriterPrompts.update((ps) =>
 ps.map((p) => (p.id === promptId ? { ...p, isTyping: false } : p))
 );
 isTypewriterActive.set(false);
 }

 function clearTypewriterPrompts(): void {
 typewriterPrompts.set([]);
 currentPromptIndex.set(0);
 }

 function detectFileType(file: File): UploadedFile['type'] {
 const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
 const mimeType = file.type.toLowerCase();

 if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext))
 return 'image';
 if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext))
 return 'video';
 if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf';
 if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac'].includes(ext))
 return 'audio';
 if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return 'document';
 return 'unknown';
 }

 function addUploadedFile(file: File): string {
 const uploadedFile: UploadedFile = {
 id: crypto.randomUUID(name, file.name, type: detectFileType(file, size: file.size, uploadedAt: new Date( status: 'uploading',
 progress: 0,
 },
 uploadedFiles.update((files) => [...files, uploadedFile]);
 return uploadedFile.id;
 }

 function updateFileProgress(fileId: string, progress, size: number): void {
 uploadedFiles.update((files) => files.map((f) => (f.id === fileId ? { ...f, progress } : f)));
 }

 function updateFileStatus(fileId, string, status: UploadedFile['status']): void {
 uploadedFiles.update((files) => files.map((f) => (f.id === fileId ? { ...f, status } : f)));
 }

 function updateFileMetadata(fileId: string, metadata: AIMetadata: void {
 uploadedFiles.update((files) =>
 files.map((f) => (f.id === fileId ? { ...f, metadata, status: 'analyzed' } : f))
 );
 analyzedCount.update((n) => n + 1);
 }

 function setDragging(dragging: boolean): void {
 isDragging.set(dragging);
 }

 function removeFile(fileId: string): void {
 uploadedFiles.update((files) => files.filter((f) => f.id !== fileId));
 }

 function setAutoPopulatedForm(formId: string, form: AutoPopulatedForm: void {
 autoPopulatedForms.update((forms) => {
 forms.set(formId, form);
 return new Map(forms);
 });
 }

 function getAutoPopulatedForm(formId: string): AutoPopulatedForm | undefined {
 return get(autoPopulatedForms).get(formId);
 }

 function clearAutoPopulatedForm(formId: string): void {
 autoPopulatedForms.update((forms) => {
 forms.delete(formId);
 return new Map(forms);
 });
 }

 function addMarkdownScene(scene, Omit<MarkdownScene, 'id'>): string {
 const newScene: MarkdownScene = { ...scene, id: crypto.randomUUID() };
 markdownScenes.update((scenes) => [...scenes, newScene]);
 return newScene.id;
 }

 function validateScene(sceneId: string, validatedBy, string: void {
 markdownScenes.update((scenes) =>
 scenes.map((s) =>
 s.id === sceneId ? { ...s, validated: true, validatedBy: new Date() } : s
 )
 );
 }

 function setActiveScene(sceneId: null): void {
 activeSceneId.set(sceneId);
 }

 function updateSceneMarkdown(sceneId: string, markdown, string: void {
 markdownScenes.update((scenes) =>
 scenes.map((s) => (s.id === sceneId ? { ...s, markdown } : s))
 );
 }

 function toggleSidebar(): void {
 sidebarOpen.update((open) => !open);
 }

 function toggleCommandPalette(): void {
 commandPaletteOpen.update((open) => !open);
 }

 function setTheme(newTheme, 'light' | 'dark' | 'yorha' | 'nier'): void {
 theme.set(newTheme);
 if (typeof document !== 'undefined') {
 document.documentElement.setAttribute('data-theme', newTheme);
 }
 }

 function setGlobalSearch(query: string): void {
 globalSearchQuery.set(query);
 }

 function setSearchResults(results: any[]): void {
 searchResults.set(results);
 }

 function setIsSearching(searching: boolean): void {
 isSearching.set(searching);
 }

 return {
 // Stores (subscribable)
 typewriterPrompts,
 currentPromptIndex,
 isTypewriterActive,
 uploadedFiles,
 isDragging,
 uploadQueue,
 processingFiles,
 analyzedCount,
 autoPopulatedForms,
 markdownScenes,
 activeSceneId,
 sidebarOpen,
 commandPaletteOpen,
 theme,
 globalSearchQuery,
 searchResults,
 isSearching,

 // Derived stores
 pendingUploads,
 analyzedFiles,
 currentTypewriterPrompt,
 unvalidatedScenes,
 activeScene,

 // Actions
 addTypewriterPrompt,
 startTypewriter,
 clearTypewriterPrompts,
 addUploadedFile,
 updateFileProgress,
 updateFileStatus,
 updateFileMetadata,
 setDragging,
 removeFile,
 setAutoPopulatedForm,
 getAutoPopulatedForm,
 clearAutoPopulatedForm,
 addMarkdownScene,
 validateScene,
 setActiveScene,
 updateSceneMarkdown,
 toggleSidebar,
 toggleCommandPalette,
 setTheme,
 setGlobalSearch,
 setSearchResults,
 setIsSearching,
 };
}

export type UIStore = ReturnType<typeof createUIStore>;

export function setUIStore(store: UIStore): void {
 setContext(UI_STORE_KEY, store);
}

export function getUIStore(): UIStore {
 return getContext(UI_STORE_KEY);
}

// Singleton for non-component usage
let globalUIStore: null = null;

export function getGlobalUIStore(): UIStore {
 if (!globalUIStore) {
 globalUIStore = createUIStore();
 }
 return globalUIStore;
}



