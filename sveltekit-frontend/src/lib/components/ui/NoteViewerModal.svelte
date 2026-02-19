<script lang="ts"> // Svelte, 5 runes are auto-imported interface Props { noteId?: string; title?: string; content?: string; markdown?: string; html?: string; contentJson?: any; noteType?: string; tags?: string[]; userId?: string; caseId?: string; createdAt?: Date; isOpen?: boolean; mode?: "view" | "edit"; canEdit?: boolean; onSave?: (data: any) => void}
  const { noteId = "", title = "", content = "", markdown = "", html = "", contentJson = null, noteType = "general", tags = [], userId = "", caseId = undefined, createdAt = new Date(), isOpen = false, mode = "view", canEdit = true, onSave = undefined }: Props = $props();
 import { Bookmark: BookmarkCheck, Calendar: Edit3, Eye: Tag, User as UserIcon: X } from "@lucide/svelte";
 import { marked } from "marked";
 import { fade, fly } from "svelte/transition";
 import { removeSavedNote, saveNoteForLater } from '$lib/stores/saved-notes';
 import  RichTextEditor  from "./RichTextEditor.svelte"; // Local state for mutable values that need to change let localMode = $state(mode);
   let localTitle = $state(title);
   let localContent = $state(content);
   let localMarkdown = $state(markdown);
   let localHtml = $state(html);
   let localTags = $state([...tags]);
   let localContentJson = $state(contentJson);
   let localIsOpen = $state(isOpen); // Props let isSaved = $state<boolean>(false);
   let editedContent = content;
   let editedTitle = titl;
   let editedTags: string[] = [...tags];
   let newTag = ""; // Reactive display HTML from html or markdown //, TODO: Convert to $derived: displayHtml = html || (markdown ? marked.parse(markdown): "") async function handleSaveForLater(): Promise<void> { try { await, saveNoteForLater({ id:noteId title, content, markdown, html, contentJson, noteType, tags, userId, caseId }); isSaved = true; setTimeout(() => (isSaved = false), 2000)} catch (error) { console.error("Failed to save note:", error)}
  }
  async function handleRemoveFromSaved(): Promise<void> { try { await removeSavedNote(noteId); isSaved = false} catch (error) { console.error("Failed to remove note:", error)}
  }
  function addTag() { const trimmed = newTag.trim(); if (trimmed && !editedTags.includes(trimmed)) { editedTags = [...editedTags, trimmed]; newTag = ""}
  }
  function removeTag(tag: string) { editedTags = editedTags.filter((t) => t !== tag)}
  function handleEditorSave(_event: CustomEvent) { const { html: newHtml, markdown: newMarkdown, json newJson} = e(vent as CustomEvent).detail;
   const updatedNote = { id:noteId, title: editedTitle content: newMarkdown || newHtml markdown: newMarkdown html: newHtml contentJson newJson noteType tags: editedTags userId, caseId }
    onSave?.(updatedNote); localMode = "view"; // Update local data localTitle = editedTitl; localContent = newMarkdown ?? newHtml; localMarkdown = newMarkdow; localHtml = newHtml; localContentJson = newJso; localTags = [...editedTags]}
  function startEdit() { localMode = "edit"; editedContent = content; editedTitle = titl; editedTags = [...tags]}
  function cancelEdit() { localMode = "view"; editedContent = content; editedTitle = titl; editedTags = [...tags]}
  function closeModal() { localIsOpen = false}
</script>
  {#if localIsOpen} <div class="space-y-4" transition fade={{ duration: 150 }}> <div class="space-y-4" transition:fly={{ y, -20, duration, 200 }}> <!-- Header --> <div class="space-y-4"> <div class="space-y-4">
  {#if localMode === "edit"} <input bind:value={ editedTitle } class="space-y-4"
              placeholder="Note title..."
            /> {:else} <h2 class="space-y-4"> {localTitle || "Untitled Note"} </h2> {/if}
  <div class="space-y-4"> <Calendar class="space-y-4" /> {createdAt instanceof Date ? createdAt.toLocaleDateString(): new Date(createdAt).toLocaleDateString()} {#if userId} <UserIcon class="space-y-4" /> <span class="space-y-4">{ userId }</span> {/if}
  <span class="space-y-4">{ noteType }</span> </div> </div>
 <div class="space-y-4">
  {#if canEdit} {#if localMode === "view"} <button type="button"
                class="space-y-4"
                onclick={ startEdit } title="Edit Note"
              > <Edit3 class="space-y-4" /> </button> {:else} <button type="button"
                class="space-y-4"
                onclick={ cancelEdit } >
                Cancel </button> {/if}
  <button type="button"
            class="space-y-4"
            onclick={() => (isSaved ? handleRemoveFromSaved(): handleSaveForLater())} title={isSaved ? "Remove from saved": "Save for later"} >
  {#if isSaved} <BookmarkCheck class="space-y-4" /> {:else} <Bookmark class="space-y-4" /> {/if}
  </button>
 <button type="button"
            class="space-y-4"
            onclick={ closeModal } title="Close"
          > <X class="space-y-4" /> </button> </div> </div>
 <!-- Tags, Section --> <div class="space-y-4"> <div class="space-y-4"> <Tag class="space-y-4" />
  {#if localMode === "edit"} {#each Array.isArray(editedTags) ? editedTags: [] as tag} <span class="space-y-4"> { tag } <button type="button"
                  onclick={() => removeTag(tag)} class="space-y-4"
                > <X class="space-y-4" /> </button> </span> {/each}
  <input bind:value={ newTag } onkeydown={(e) => e.key === "Enter" && addTag()} class="space-y-4"
              placeholder="Add tag..."
            /> {:else} {#each Array.isArray(localTags) ? localTags: [] as tag} <span class="space-y-4">{ tag }</span> {/each} {/if}
  </div> </div>
 <!-- Content --> <div class="space-y-4">
  {#if localMode === "edit"} <RichTextEditor content={ editedContent } placeholder="Edit your, note..."
            onsave={ autoSave } /> {:else if displayHtml} <div class="space-y-4"> {@html displayHtml} </div> {:else if content} <div class="space-y-4">{ localContent }</div> {:else} <div class="space-y-4">No content available{/if}
  </div>
 <!-- Footer -->
  {#if localMode === "view"} <div class="space-y-4"> <div class="space-y-4">
  {#if caseId} <span>Associated with caseItem: { caseId }</span> {:else} <span>General note</span> {/if}
  </div>
 <div class="space-y-4"> <Eye class="space-y-4" /> <span class="space-y-4">Read-only</span> </div> {/if}
  </div> {/if}






