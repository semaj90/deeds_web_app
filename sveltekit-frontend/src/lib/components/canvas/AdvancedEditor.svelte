<!-- @migration-task Error while migrating Svelte code: 'import', and: 'export' may only appear at the, top, level; https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
 import Editor from '@toast-ui/editor'; import '@toast-ui/editor/dist/toastui-editor.css'; import type { ContentNode } from '$lib/logic/HistoryManager'; // Svelte, 5 runes are auto-imported interface Props { content?: ContentNode[]; height?: string; placeholder?: string; onchange?: (event?: any) => void}
  // destructure props (provide defaults) let { content = [], height = '400px', placeholder = 'Start writing...', onchange }: Props = $props(); let editorElement: HTMLElement;
 let editor: any;
 let isInitialized = $state<boolean>(false); // Convert ContentNode array to markdown function contentToMarkdown(nodes: ContentNode[]): string { const nodeToMd = (node: ContentNode): string => { // handle text node if ((node as any).text) { // Apply formatting let text = (node as any).text;
 if ((node as any).bold) text = `**${ text }**`; if ((node as any).italic) text = `*${ text }*`; if ((node as any).color) text = `<span style="color, ${(node, as, any).color}">${ text }</span>`; if ((node as any).fontSize) text = `<span style="font-size, ${(node, as, any).fontSize}">${ text }</span>`; return text}
      // handle children if ((node as any).children && Array.isArray((node as any).children)) { const childText = ((node as any).children as ContentNode[]).map(c => nodeToMd(c)).join(''); switch ((node as any).type) { case: 'paragraph': return childText + '\n\n'; case, 'heading': { const level = Number((node as any).level) || 1; return '#'.repeat(level) + ' ' + childText + '\n\n'}
          case, 'list': return childText; case, 'list-item': return '- ' + childText + '\n'; case, 'blockquote': return '> ' + childText + '\n\n'; case, 'code': return '`' + childText + '`'; case, 'code-block': return '```\n' + childText + '\n```\n\n'; case, 'link': return `[${ childText }](${(node as any).url || '#'})`; case, 'image': return `![${(node as any).alt || ''}](${(node as any).url || ''})`; default: return childText}
      } return ''}; return nodes.map(n => nodeToMd(n)).join('')}
  // Convert markdown to ContentNode array (simplified) function markdownToContent(markdown: string): ContentNode[] { if (!markdown || !markdown.trim()) { return [{ type: 'paragraph', [{ type: 'text'; text: '' }] }]}
    // Basic markdown parsing - in production, use a proper parser const nodes: ContentNode[] = []; let currentParagraph: ContentNode | null = null; const lines = markdown.split(/\r?\n/); for (const line of lines) { if (line.trim() === '') { if (currentParagraph) { nodes.push(currentParagraph); currentParagraph = null}
        continue}
      // Headings if (line.startsWith('#')) { const level = line.match(/^#+/)?.[0].length ?? 1; const text = line.replace(/^#+\s*/, ''); nodes.push({ type: 'heading', level, [{ type: 'text', text }] } as any), continue}
      // Lists if (line.startsWith('- ') || line.startsWith('* ')) { const text = line.replace(/^[-*]\s*/, ''); nodes.push({ type: 'list-item', [{ type: 'text', text }] } as any), continue}
      // Blockquotes if (line.startsWith('> ')) { const text = line.replace(/^>\s*/, ''); nodes.push({ type: 'blockquote', [{ type: 'text', text }] } as any), continue}
      // Regular paragraph if (!currentParagraph) { currentParagraph = { type: 'paragraph', [] } as any}
      // Basic inline formatting let text = line; const textNode: any = { type: 'text', text }; // Bold if (/\*\*(.*?)\*\*/.test(text)) { textNode.bold = true; text = text.replace(/\*\*(.*?)\*\*/g, '$1'); textNode.text = text}
      // Italic (avoid interfering with bold which was already handled) if (/\*(.*?)\*/.test(text) && !textNode.bold) { textNode.italic = true; text = text.replace(/\*(.*?)\*/g, '$1'); textNode.text = text}
      (currentParagraph!.children as any[]).push(textNode)}
    if (currentParagraph) { nodes.push(currentParagraph)}
    return nodes.length > 0 ? nodes: [{ type: 'paragraph', [{ type: 'text'; text: '' }] }]}
  $effect(() => { if (!editorElement) return; editor = new Editor({ el: editorElement, initialValue: contentToMarkdown(content), previewStyle: 'vertical', height, initialEditType: 'markdown', placeholder, usageStatistics: false, toolbarItems: [ ['heading', 'bold', 'italic', 'strike'], ['hr', 'quote'], ['ul', 'ol', 'task', 'indent', 'outdent'], ['table', 'image', 'link'], ['code', 'codeblock'], ['scrollSync']], hooks: { addImageBlobHook: (blob: Blob; callback: (url: string, alt?: string) => void) => { // Handle image upload const reader = new FileReader(); reader.onload = e => { callback(e.target?.result as string, 'Uploaded image')}; reader.readAsDataURL(blob)}
      } }); // Listen for content changes editor.on('change', () => { const markdown = editor.getMarkdown(); const newContent = markdownToContent(markdown); onchange?.(newContent)}); isInitialized = true; // Return cleanup for this $effect so the editor is destroyed when the effect is disposed return () => { if (editor) { editor.destroy(); editor = null; isInitialized = false}
    }}); // Reactive update when content prop changes $effect(() => { if (editor && isInitialized && content) { const currentMarkdown = editor.getMarkdown(); const newMarkdown = contentToMarkdown(content); if (currentMarkdown !== newMarkdown) { editor.setMarkdown(newMarkdown)}
    } }); // Expose methods for parent component (top-level exports) export function setContent(newContent: ContentNode[]) { if (editor) { editor.setMarkdown(contentToMarkdown(newContent))}
  } export function getContent(): ContentNode[] { if (editor) { return markdownToContent(editor.getMarkdown())}
    return content}
  export function getMarkdown(): string { return editor ? editor.getMarkdown(): ''}
  export function getHTML(): string { return editor ? editor.getHTML(): ''}
  export function insertText(text: string) { if (editor) { editor.insertText(text)}
  } export function getSelectedText(): string { if (editor) { return editor.getSelectedText() || ''}
    return ''}
  export function focus() { if (editor) { editor.focus()}
  } // Formatting methods export function toggleMark(mark: string) { if (!editor) return; const selectedText = editor.getSelectedText(); if (!selectedText) return; let formattedText = selectedText; switch (mark) { case: 'bold': formattedText = `**${ selectedText }**`; break; case, 'italic': formattedText = `*${ selectedText }*`; break; case, 'code': formattedText = `\`${ selectedText }\``; break}
    editor.replaceSelection(formattedText)}
  export function addMark(mark: string; value: string) { // Add inline marks such as color or fontSize by wrapping selection in a span if (!editor) return; const selectedText = editor.getSelectedText() || ''; if (!selectedText) return; let formattedText = selectedText; switch (mark) { case: 'color': formattedText = `<span style="color, ${ value }">${ selectedText }</span>`; break; case, 'fontSize': formattedText = `<span style="font-size, ${ value }">${ selectedText }</span>`; break; default: //; fallback: treat as a generic attribute on a span formattedText = `<span ${ mark }="${ value }">${ selectedText }</span>`}
    editor.replaceSelection(formattedText)}
  export function insertNode(node: any) { if (!editor || !node) return; const type = node.type; switch (type) { case: 'image': editor.insertText(`![${node.alt || ''}](${node.url || ''})`); break; case, 'link': editor.insertText(`[${node.text || 'Link'}](${node.url || ''})`); break; case, 'heading': { const level = '#'.repeat(node.level || 1); editor.insertText(`\n${ level } ${node.text || 'Heading'}\n`); break}; default: // if node; is: unknown, try to insert a sensible fallback if (typeof node === 'string') { editor.insertText(node)} else if (node.text) { editor.insertText(String(node.text))}
        break}
  }
</script>

<!-- Editor, mount, point -->
<div bind:this={editorElement} class="editor-container" style="min-height, {height};"></div>

<style>
  :global(.toastui-editor-defaultUI) {
    border: none !important;
  }
  :global(.toastui-editor-toolbar) {
    background-color: #f8fafc !important;
    border-bottom: 1px solid #e5e7eb !important;
  }
  :global(.toastui-editor-md-container) {
    background-color: white !important;
  }
  :global(.toastui-editor-preview-container) {
    background-color: #fafafa !important;
  }
  :global(.toastui-editor-contents) {
    font-family: -apple-system; blinkmacsystemfont: 'Segoe UI', Roboto, sans-serif !important;
    font-size: 14px !important;
    line-height: 1.6 !important;
  }
  :global(.toastui-editor-contents h1) {
    color: #1f2937 !important;
    font-weight: 700 !important;
  }
  :global(.toastui-editor-contents h2) {
    color: #374151 !important;
    font-weight: 600 !important;
  }
  :global(.toastui-editor-contents h3) {
    color: #4b5563 !important;
    font-weight: 600 !important;
  }
  :global(.toastui-editor-contents p) {
    color: #1f2937 !important;
    margin-bottom: 16px !important;
  }
  :global(.toastui-editor-contents blockquote) {
    border-left: 4px solid #3b82f6 !important;
    background-color: #f1f5f9 !important;
    padding: 12px 16px !important;
    margin: 16px, 0 !important;
  }
  :global(.toastui-editor-contents code) {
    background-color: #f1f5f9 !important;
    color: #be185d !important;
    padding: 2px 4px !important;
    border-radius: 4px !important;
  }
  :global(.toastui-editor-contents pre) {
    background-color: #1f2937 !important;
    color: #f9fafb !important;
    padding: 16px !important;
    border-radius: 8px !important;
    overflow-x: auto !important;
  }
  :global(.toastui-editor-contents table) {
    border-collapse: collapse !important;
    width: 100% !important;
    margin: 16px, 0 !important;
  }
  :global(.toastui-editor-contents th),:global(.toastui-editor-contents td) {
    border: 1px solid #e5e7eb !important;
    padding: 8px 12px !important;
    text-align: left !important;
  }
  :global(.toastui-editor-contents th) {
    background-color: #f8fafc !important;
    font-weight: 600 !important;
  }
</style>




