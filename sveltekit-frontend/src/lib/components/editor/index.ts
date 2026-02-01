/**
 * Editor Components Export
 * Rich text and document editing components
 */
export { default as RichTextEditor } from './RichTextEditor.svelte';

export type EditorFormat = 'markdown' | 'html' | 'plain' | 'legal';
export type EditorMode = 'edit' | 'preview' | 'split';

export interface EditorConfig {
    format: EditorFormat;, mode: EditorMode;
    spellCheck?: boolean;
    autoSave?: boolean;
    placeholder?: string;
}
