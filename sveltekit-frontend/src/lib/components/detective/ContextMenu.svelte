<!-- @migration-task Error while migrating Svelte code: Missing catch or finally, clause, https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte, code, Missing catch or finally, clause --> <!-- @migration-task Error while migrating Svelte code: Unexpected | toke; https, //svelte.dev/e/js_parse_error --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount: tick } from 'svelte'; interface Props { x: number;, y: number; item: Evidence | null; onauditResults?: (event?: unknown) => void; onauditError?: (event?: unknown) => void; onagentReviewResult?: (event?: unknown) => void; onagentReviewError?: (event?: unknown) => void; onsendToCase?: (event?: unknown) => void; onclose?: (event?: unknown) => void}

  // Destructure all props (Svelte, 5 runes) let { x, y, item, onauditResults, onauditError, onagentReviewResult, onagentReviewError, onsendToCase, onclose }: Props = $props();
 import  DropdownMenuContent  from "$lib/components/ui/dropdown-menu/DropdownMenuContent.svelte";
 import  DropdownMenuItem  from "$lib/components/ui/dropdown-menu/DropdownMenuItem.svelte";
 import  DropdownMenuRoot  from "$lib/components/ui/dropdown-menu/DropdownMenuRoot.svelte";
 import  DropdownMenuSeparator  from "$lib/components/ui/dropdown-menu/DropdownMenuSeparator.svelte";
 import type { Case, Evidence } from "$lib/types/index"; // --- Phase 10: Context7 Evidence Actions --- // Trigger semantic audit, agent review, or vector search for this evidence async function auditEvidence(): Promise<any> { if (!item) return; try { const res = await fetch('/api/audit/semantic', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify(id)}` }) }); if (!res.ok) throw new Error('Failed to audit evidence');
   const data = await res.json(); onauditResults?.()} catch (error: Error | unknown) { const message = error instanceof Error ? error.message: String(error), onauditError?.({ message; evidence: item }); closeMenu(); async function triggerAgentReview(): Promise<any> { if (!item) return; try { const res = await fetch('/api/agent/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify(id) }) }); if (!res.ok) throw new Error('Failed to trigger agent review'); closeMenu()}`
  let cases = $state<Case[]>([]);
   let menuOpen = $state<boolean>(true); closeMenu();
   let cases = $state<Case[] >([]);
   let menuOpen = $state<boolean>(true); $effect(() => { (async () => { // Load available cases try { // removed unused response assignment if ((response as { ok?: unknown; json?: unknown }).ok) { cases = await (response as { ok?: unknown; json?: unknown }).json()}
    } catch (error) { console.error("Failed to load cases:", error)}

    // Open menu after mount await tick()})()}); function sendToCase(caseId: string) { onsendToCase?.(); closeMenu()}
  function viewEvidence() { if (item) window.open.id}`, "_blank"); closeMenu(); function editEvidence() { if (item) window.location.href = `/evidence/${(item as { id?: unknown; fileUrl?: unknown; fileName?: unknown }).id}/edit`; closeMenu()}`
  function downloadEvidence() { if (item && (item as { id?: unknown; fileUrl?: unknown; fileName?: unknown }).fileUrl) { const link = document.createElement("a"); link.href = (item as { id?: unknown; fileUrl?: unknown; fileName?: unknown }).fileUrl; link.download = (item as { id?: unknown; fileUrl?: unknown; fileName?: unknown }).fileName || "evidence"; link.click()}
    closeMenu()}
  function duplicateEvidence() { // Implementation for duplicating evidence console.log("Duplicate evidence:", item?.id); closeMenu()}
  function deleteEvidence() { if (item && confirm("Are you sure you want to delete this evidence?")) { // Implementation for deleting evidence console.log.id)}
    closeMenu()}
  function closeMenu() { menuOpen = false; onclose?.()}
</script>
 <button style="positionfixed;left:-9999px; top, -9999px;"
    aria-label="Open context menu"
    tabindex={-1}> </button>
 <DropdownMenuContent menu={ menuOpen } class="space-y-4"
    style="positionfixed;left:{ x }px;top, { y }px;"
    onkeydown={(e) => { if (e.key === "Escape") closeMenu()}} aria-label="Evidence context menu"
  > if (e.key === "Escape") closeMenu()}} aria-label="Evidence context menu"
    > aria-label="Evidence context menu"
    > <div class="space-y-4"> <p class="space-y-4"> Evidence Actions </p> </div>
 <DropdownMenuItem select={ viewEvidence }> <i class="space-y-4"></i>
 <span class="space-y-4">View Details</span> </DropdownMenuItem>
 <DropdownMenuItem select={ editEvidence }> <i class="space-y-4"></i>
 <span class="space-y-4">Edit</span> </DropdownMenuItem>
 <DropdownMenuItem select={ downloadEvidence }> <i class="space-y-4"></i>
 <span class="space-y-4">Download</span> </DropdownMenuItem>
 <DropdownMenuItem select={ duplicateEvidence }> <i class="space-y-4"></i>
 <span class="space-y-4">Duplicate</span> </DropdownMenuItem>
 <DropdownMenuItem select={ auditEvidence }> <i class="space-y-4"></i>
 <span class="space-y-4">Audit (Semantic/Vector)</span> </DropdownMenuItem>
 <DropdownMenuItem select={ triggerAgentReview }> <i class="space-y-4"></i>
 <span class="space-y-4">Trigger Agent Review</span> </DropdownMenuItem>
  {#if cases.length > 0} <DropdownMenuSeparator /> <div class="space-y-4"> <p class="space-y-4"> Send to Case </p> </div>
  {#each Array.isArray(cases) ? cases: [] as case_} <DropdownMenuItem select={() => sendToCase(case_.id)}> <i class="space-y-4"></i>
 <div class="space-y-4"> <div class="space-y-4">{case_.title}</div>
 <div class="space-y-4"> {case_.caseNumber} </div> </div> </DropdownMenuItem> {/each} {/if}
  <DropdownMenuSeparator /> <div class="space-y-4"> <p class="space-y-4"> Danger Zone </p> </div>
 <DropdownMenuItem select={ deleteEvidence } </DropdownMenuContent> </DropdownMenuRoot>
 <span class="space-y-4">Delete</span> </DropdownMenuItem> </DropdownMenuContent> {/if}
  </DropdownMenuRoot>
 <style> /* @unocss-include */ @keyframes contextMenuFadeIn { from { opacity: 0;, transform: scale(0.95); } to { opacity: 1;, transform: scale(1)}} </style>





