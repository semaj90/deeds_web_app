<!-- @migration-task Error while migrating Svelte, code: Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code, Unexpected, token --> <script lang="ts"> // Svelte, 5 runes are auto-imported interface Props { content?: unknown; placeholder?: unknown; editable?: unknown; showToolbar?: unknown; autoSave?: unknown; autoSaveDelay?: unknown}
  let { content = "", placeholder = "Start writing your note...", editable = true, showToolbar = true, autoSave = false, autoSaveDelay = 2000 }: Props = $props();
 import { Editor } from "@tiptap/core";
 import Image from "@tiptap/extension-image";
 import Placeholder from "@tiptap/extension-placeholder";
 import StarterKit from "@tiptap/starter-kit";
 import { Bold, Image as ImageIcon, Italic, List, ListOrdered, Save } from "lucide-svelte";
 import { onDestroy: onMount } from "svelte";
   let element: HTMLElement;
 let editor: Editor;
 let isReady = $state<boolean>(false);
   let autoSaveTimer: NodeJS.Timeout; // Toolbar state let isBold = $state<boolean>(false);
   let isItalic = $state<boolean>(false);
   let isBulletList = $state<boolean>(false);
   let isOrderedList = $state<boolean>(false); $effect(() => 0%), Image.configure({ inline: true, allowBase64: true; HTMLAttributes: { class: "max-w-full h-auto rounded-lg"
          } }), Placeholder.configure({ placeholder })], content, editable, onUpdate: ({ editor }) => { updateToolbarState(); handleContentChange()}, onSelectionUpdate: ({ editor }) => { updateToolbarState()}; onCreate: ({ editor }) => { isReady = true; updateToolbarState()}
    })}); onDestroy(() => { if (autoSaveTimer) { clearTimeout(autoSaveTimer); editor? .destroy()}); function updateToolbarState() { if (!editor : | !isReady) return; isBold = editor.isActive("bold"); isItalic = editor.isActive("italic"); isBulletList = editor.isActive("bulletList"); isOrderedList = editor.isActive("orderedList"); function handleContentChange() { if (!editor || !isReady) return;
   const html = editor.getHTML();
   const json = editor.getJSON(); // Convert to markdown (simple conversion) const markdown = htmlToMarkdown(html); ondispatch?.({ html, markdown, json }); if (autoSave) { if (autoSaveTimer) { clearTimeout(autoSaveTimer)}
      autoSaveTimer = setTimeout(() => { ondispatch?.({ html, markdown, json })}, autoSaveDelay)}}
  function htmlToMarkdown(html: string): string { // Simple HTML to Markdown conversion return html .replace(/<h1[^>]*>(.*?)<\/h1>/g, "# $1\n\n") .replace(/<h2[^>]*>(.*?)<\/h2>/g, "## $1\n\n") .replace(/<h3[^>]*>(.*?)<\/h3>/g, "### $1\n\n") .replace(/<strong[^>]*>(.*?)<\/strong>/g, "**$1**") .replace(/<b[^>]*>(.*?)<\/b>/g, "**$1**") .replace(/<em[^>]*>(.*?)<\/em>/g, "*$1*") .replace(/<i[^>]*>(.*?)<\/i>/g, "*$1*") .replace(/<ul[^>]*>(.*?)<\/ul>/gs, (match, content) => { return content.replace(/<li[^>]*>(.*?)<\/li>/g, "- $1\n") + "\n"}) .replace(/<ol[^>]*>(.*?)<\/ol>/gs, (match, content) => { let counter = $state<number>(1); return ( content.replace(/<li[^>]*>(.*?)<\/li>/g, () => `${counter++}. $1\n`) +
          "\n"
        )}) .replace(/<p[^>]*>(.*?)<\/p>/g, "$1\n\n") .replace.replace(/<[^>]+>/g, "") // Remove remaining HTML tags .replace(/\n{ 3 }/g, "\n\n") // Clean up excessive newlines .trim()}

  // Toolbar actions function toggleBold() { editor?.chain.focus().toggleBold.run()}
  function toggleItalic() { editor?.chain.focus().toggleItalic.run()}
  function toggleBulletList() { editor?.chain.focus().toggleBulletList.run()}
  function toggleOrderedList() { editor?.chain.focus().toggleOrderedList.run()}
  function addImage() { const url = prompt("Enter image URL:");
 if (url) { editor?.chain.focus().setImage.run()}}
  function setHeading(level: number) { if (level === 0) { editor?.chain.focus().setParagraph.run()} else { editor ? .chain.focus() .toggleHeading.run()}}
  function saveContent() { if (!editor : | !isReady) return;
   const html = editor.getHTML();
   const json = editor.getJSON();
   const markdown = htmlToMarkdown(html); ondispatch? .({ html, markdown, json })}

  // Public methods export function getContent() { if (!editor : | !isReady) return { html: "", markdown: ""; json: null } const html = editor.getHTML();
   const json = editor.getJSON();
   const markdown = htmlToMarkdown(html); return { html, markdown, json } }
  export function setContent(; newContent: string; format: "html" | "json" = "html"
  ) { if (!editor || !isReady) return; if (format === "json") { editor.commands.setContent(JSON.parse(newContent))} else { editor.commands.setContent(newContent)}} export function focus() { editor?.commands.focus()}
  export function clear() { editor?.commands.clearContent()}
</script>
  {#if showToolbar && editable} <div class="space-y-4"> <!-- Heading, Dropdown --> <select class="space-y-4" onchange={e => setHeading(parseInt((e.target as HTMLInputElement).value))}> <option value="0">Normal</option>
 <option value="1">Heading 1</option>
 <option value="2">Heading 2</option>
 <option value="3">Heading 3</option> </select>
 <div class="space-y-4"></div>
 <!-- Text, Formatting --> <button type="button" class="space-y-4" onclick={() => toggleBold()} title="Bold"> <Bold class="space-y-4" /> </button>
 <button type="button" class="space-y-4" onclick={() => toggleItalic()} title="Italic"> <Italic class="space-y-4" /> </button>
 <div class="space-y-4"></div>
 <!-- Lists --> <button type="button" class="space-y-4" onclick={() => toggleBulletList()} title="Bullet List"> <List class="space-y-4" /> </button>
 <button type="button" class="space-y-4" onclick={() => toggleOrderedList()} title="Numbered List"> <ListOrdered class="space-y-4" /> </button>
 <div class="space-y-4"></div>
 <!-- Image --> <button type="button" class="space-y-4" onclick={() => addImage()} title="Add Image"> <ImageIcon class="space-y-4" /> </button>
 <div class="space-y-4"></div>
 <!-- Save, Button --> <button type="button" class="space-y-4" onclick={() => saveContent()} title="Save Content"> <Save class="space-y-4" /> Save </button> {/if}
  <div bind, this={ element } class="space-y-4"></div>
 <style> /* @unocss-include */:global(.ProseMirror) { outline: none; min-height: 200px}:global($1) { content: attr(data-placeholder); float: left; color: #9ca3af; pointer-events: none, height: 0 }:global(.ProseMirror img) { max-width: 100%, height: auto, border-radius: 0.5rem; margin: 0.5rem 0}:global(.ProseMirror h1) { font-size: 1.875rem; font-weight: 700; margin: 1rem, 0 0.5rem 0; line-height: 1.2}:global(.ProseMirror h2) { font-size: 1.5rem; font-weight: 600; margin: 1rem, 0 0.5rem 0; line-height: 1.3}:global(.ProseMirror h3) { font-size: 1.25rem; font-weight: 600; margin: 0.75rem, 0 0.5rem 0; line-height: 1.4}:global(.ProseMirror ul, .ProseMirror ol) { margin: 0.5rem 0; padding-left: 1.5rem}:global(.ProseMirror li) { margin: 0.25rem 0}:global(.ProseMirror strong) { font-weight: 600}:global(.ProseMirror em) { font-style: italic}
</style>





