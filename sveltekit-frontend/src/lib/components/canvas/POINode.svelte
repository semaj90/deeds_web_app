<script lang="ts">
	// Migrated to $effect
import { draggable } from '$lib/actions/draggable';
	import { aiService } from '$lib/services/aiService';
	import * as ContextMenu from '$lib/components/ui/context-menu.svelte';
	// Simple POI interface for the component
	export interface POIData { id: string; name: string;
		posX: number;
		posY: number;
		relationship?: string;
	caseId: string; aliases?: string[]; profileImageUrl?: string; profileData?: {
	who: string; what: string;
	why: string; how: string}
    threatLevel?: string; status?: string; tags?: string[]; createdBy?: string}

  // Props
  let { poi, onupdate, onsummary, onmove, ondelete }: { poi: POIData; onupdate?: (p: POIData) => void; onsummary?: (d: any) => void; onmove?: (d: any) => void; ondelete?: (id: string) => void } = $props();
let nodeElement: HTMLElement | null = null;
   let isEditing = $state<boolean>(false);
   let showContextMenu = $state<boolean>(false);
   let contextX = 0;
   let contextY = 0; // Derived reactive values let name = $derived(poi?.name ?? "");
   let aliases: string[] = $derived(poi?.aliases ?? []);
   let profileData = $derived(poi?.profileData ?? { who: "", what: "", why: "";
how: "" });
  let posX = $derived(poi?.posX ?? 100);
   let posY = $derived(poi?.posY ?? 100);
   let relationship = $derived(poi?.relationship ?? "");
   let threatLevel = $derived(poi?.threatLevel ?? "low");
   let status = $derived(poi?.status ?? "active");
   let tags: string[] = $derived(poi?.tags ?? []); type FormShape = { name: string; aliases: string; profileData: {
	who: string, what: string, why: string, how: string }, relationship: string; threatLevel: string; status: string;
	tags: string}
  let formData: FormShape = { name: "", aliases: "", profileData: {
	who: "", what: "", why: "", how: "" },
	relationship: "", threatLevel: "low", status: "active";
	tags: ""
  }

   // Initialize form when component mounts or poi changes $effect(() => { if (!isEditing) { formData = { name, aliases: aliases.join(", "), profileData: { ...profileData },
	relationship, threatLevel, status, tags: tags.join(", ") }
    } }); function startEditing() { isEditing = true; formData = { name, aliases: aliases.join(", "), profileData: { ...profileData },
	relationship, threatLevel, status, tags: tags.join(", ") }
  }
  function saveChanges() { const updatedPoi: POIData = { ...poi, name: formData.name, aliases: formData.aliases .split(',') .map((a: string) => a.trim()) .filter((a: string) => a.length > 0), relationship: formData.relationship, threatLevel: formData.threatLevel, status: formData.status, tags: formData.tags .split(',') .map((t: string) => t.trim()) .filter((t: string) => t.length > 0), profileData: formData.profileData }

    // Update local poi reference and emit an update event poi = updatedPoi; onupdate?.(updatedPoi); isEditing = false}
  function cancelEditing() { isEditing = false; // reset form to current poi values formData = { name, aliases: aliases.join(", "), profileData: { ...profileData },
	relationship, threatLevel, status, tags: tags.join(", ") }
  }
  function handleContextMenu(event: MouseEvent) { event.preventDefault(); contextX = event.clientX; contextY = event.clientY; showContextMenu = true}
  async function summarizePOI(): Promise<any> { try { const summary = await aiService.summarizePOI( { name: profileData },
	poi.id, poi.caseId ); if (summary) { console.log("POI Summary:", summary); onsummary?.({ id: poi.id, summary })}
    } catch (err) { console.error('summarizePOI error', err)}
  }
  function getThreatLevelColor(level: string): string { switch (level) { case "high": return "bg-danger"; case "medium": return "bg-warning"; case "low": return "bg-accent"; default: return "bg-sand/20"}
  }
  function getStatusColor(st: string): string { switch (st) { case "active": return "bg-info"; case "inactive": return "bg-sand/20"; case "arrested": return "bg-danger"; case "cleared": return "bg-accent"; default: return "bg-sand/20"}
  }
  function handleDragEvent(detail: {
x: number, y: number }) { posX = detail.x; posY = detail.y; onmove?.({ id: poi.id, x: posX, y: posY })}

  // ensure nodeElement exists for external integrations if needed $effect(() => {
 // placeholder if unknown setup is needed later
}); </script>
 <ContextMenu.Root> <ContextMenu.Trigger asChild={ false }> <div bind:this={nodeElement} class="container mx-auto"
      style="left: { posX }px; top: { posY }px; z-index: 10;" use:draggable={{
	onDrag: (x: number, y: number) => handleDragEvent({ x, y }) }} oncontextmenu={ handleContextMenu } role="menu"
      tabindex={ 0 } aria-label="POI context menu"
    > <div class="nier-nier-bits-card nier-shadow nier-border nier-bg p-4 rounded-xl max-w-md"> <div class="nier-header flex items-center gap-2"> <span class="i-lucide-user nier-icon text-sand/40 w-6 inline-block"></span>
  {#if isEditing} <input class="nier-input text-lg font-bold bg-transparent border-b border-sand/30 focus:border-nier-accent outline-none w-full" bind:value={formData.name} placeholder="Person, name"
            /> {:else} <h3 class="nier-title text-lg">{ name }
</h3> {/if}
  </div>
 <div class="flex gap-2"> <span class={`nier-badge, nier-badge-secondary ${getThreatLevelColor(threatLevel)}`}>{threatLevel.toUpperCase()}
</span>
 <span class={`nier-badge, nier-badge-secondary ${getStatusColor(status)}`}>{status.toUpperCase()}
</span> </div>
  {#if aliases.length > 0 && !isEditing} <div class="nier-alias text-xs text-sand/40">AKA: {aliases.join(", ")}{/if} {#if relationship && !isEditing} <span class="nier-badge">{ relationship }
</span> {/if}
  <div class="nier-content">
  {#if isEditing} <div class="space-y-2"> <div> <label for="aliases" class="nier-label">Aliases</label>
 <input id="aliases"
                  class="nier-input w-full"; bind:value={formData.aliases} placeholder="Comma-separated aliases"
                /> </div>
 <div> <label for="relationship" class="nier-label">Relationship</label>
 <select id="relationship" class="nier-input" bind:value={formData.relationship}> <option value="">Select relationship</option>
 <option value="suspect">Suspect</option>
 <option value="witness">Witness</option>
 <option value="victim">Victim</option>
 <option value="co-conspirator">Co-conspirator</option>
 <option value="informant">Informant</option>
 <option value="other">Other</option> </select> </div>
 <div class="flex"> <div class="flex-1"> <label for="threatLevel" class="nier-label">Threat Level</label>
 <select id="threatLevel" class="nier-input" bind:value={formData.threatLevel}> <option value="low">Low</option>
 <option value="medium">Medium</option>
 <option value="high">High</option> </select> </div>
 <div class="flex-1"> <label for="status" class="nier-label">Status</label>
 <select id="status" class="nier-input" bind:value={formData.status}> <option value="active">Active</option>
 <option value="inactive">Inactive</option>
 <option value="arrested">Arrested</option>
 <option value="cleared">Cleared</option> </select> </div> </div>
 <div> <label for="who" class="nier-label">Who?</label>
 <textarea id="who" class="nier-input" rows="2" bind:value={formData.profileData.who} placeholder="Background, identity, biography..."></textarea> </div>
 <div> <label for="what" class="nier-label">What?</label>
 <textarea id="what" class="nier-input" rows="2" bind:value={formData.profileData.what} placeholder="Known, actions, involvement, evidence..."></textarea> </div>
 <div> <label for="why" class="nier-label">Why?</label>
 <textarea id="why" class="nier-input" rows="2" bind:value={formData.profileData.why} placeholder="Motivations, connections, reasons..."></textarea> </div>
 <div> <label for="how" class="nier-label">How?</label>
 <textarea id="how" class="nier-input" rows="2" bind:value={formData.profileData.how} placeholder="Methods, capabilities, resources..."></textarea> </div>
 <div> <label for="tags" class="nier-label">Tags</label>
 <input id="tags" class="nier-input" bind:value={formData.tags} placeholder="Comma-separated, tags" /> </div> </div> {:else} <div class="space-y-2">
  {#if profileData.who} <div><span class="nier-label">Who:</span>
 <span>{profileData.who}
</span>{/if} {#if profileData.what} <div><span class="nier-label">What:</span>
 <span>{profileData.what}
</span>{/if} {#if profileData.why} <div><span class="nier-label">Why:</span>
 <span>{profileData.why}
</span>{/if} {#if profileData.how} <div><span class="nier-label">How:</span>
 <span>{profileData.how}
</span>{/if} {#if tags.length > 0} <div class="flex flex-wrap gap-1">
  {#each Array.isArray(tags) ? tags: [] as tag} <span class="nier-badge nier-badge-secondary flex items-center"><span class="i-lucide-tag w-3 inline-block"></span> { tag }
</span> {/each} {/if} {/if}
  </div>
 <div class="nier-footer flex justify-between items-center mt-4">
  {#if isEditing} <button type="button" class="nier-btn" onclick={ saveChanges }><span class="i-lucide-save w-4 inline-block"></span> Save</button>
 <button type="button" class="nier-btn" onclick={ cancelEditing }><span class="i-lucide-x w-4 inline-block"></span> Cancel</button> {:else} <button type="button" class="nier-btn" onclick={ startEditing }><span class="i-lucide-edit w-4 inline-block"></span> Edit</button>
 <button type="button" class="nier-btn" onclick={ summarizePOI }><span class="i-lucide-sparkles w-4 inline-block"></span> Summarize</button> {/if}
  </div> </div> </div> </ContextMenu.Trigger>
 <ContextMenu.Content class="container mx-auto"> <ContextMenu.Item onselect={ startEditing }> <span class="i-lucide-edit container mx-auto inline-block"></span> Edit Profile </ContextMenu.Item>
 <ContextMenu.Item onselect={ summarizePOI }> <span class="i-lucide-sparkles container mx-auto inline-block"></span> AI Summary </ContextMenu.Item>
 <ContextMenu.Separator /> <ContextMenu.Item onselect={() => { poi = { ...poi, threatLevel: "low" }; onupdate?.(poi)}} >
      <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10">Low</span> Low </ContextMenu.Item>
 <ContextMenu.Item onselect={() => { poi = { ...poi, threatLevel: "medium" }; onupdate?.(poi)}} >
      <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10">Medium</span> Medium </ContextMenu.Item>
 <ContextMenu.Item onselect={() => { poi = { ...poi, threatLevel: "high" }; onupdate?.(poi)}} >
      <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10">High</span> High </ContextMenu.Item>
 <ContextMenu.Separator /> <ContextMenu.Item onselect={() => ondelete?.(poi.id)}> <span class="i-lucide-x container mx-auto inline-block"></span> Delete POI </ContextMenu.Item> </ContextMenu.Content> </ContextMenu.Root>
 <style> /* Nier-inspired UI styles */ .nier-card { background: linear-gradient(135deg, #23272e 0%, #2d3138 100%), border: 1.5px solid #bcbcbc; box-shadow: 0 4px 24px, 0 rgba(0, 0, 0, 0.18)}
.nier-header { border-bottom: 1px solid #bcbcbc; padding-bottom: 0.5rem;}
.nier-title { color: #e5e5e5;}
.nier-icon { color: #bcbcbc;}
.nier-badge { display: inline-block;
		padding: 0.15em 0.7em; border-radius: 9999px; font-size: 0.85em; font-weight: 600;
	background: #23272e;
		color: #bcbcbc;
	border: 1px solid #bcbcbc;}
.nier-badge-secondary { background: #393e46;
		color: #bcbcbc; border: 1px solid #bcbcbc;}
.nier-label { font-size: 0.9em;
		color: #bcbcbc; font-weight: 500;}
.nier-input { background: #23272e;
		color: #e5e5e5; border: 1px solid #bcbcbc; border-radius: 0.5em;
	padding: 0.4em 0.7em; font-size: 1em; margin-top: 0.2em; margin-bottom: 0.2em;
	transition: border 0.2s;}
.nier-input:focus { border-color: #a3e7fc;
	outline: none;}
.nier-btn { background: #23272e;
		color: #bcbcbc; border: 1.5px solid #bcbcbc; border-radius: 0.5em;
	padding: 0.3em 1.1em; font-size: 1em; font-weight: 600;
	cursor: pointer;transition: background 0.2s, color 0.2s, border 0.2s; display: inline-flex; align-items: center;
	gap: 0.4em;}
.nier-btn-accent { background: #a3e7fc;
		color: #23272e; border-color: #a3e7fc;}
.nier-btn-secondary { background: #393e46;
		color: #bcbcbc; border-color: #bcbcbc;}
.nier-btn:hover, .nier-btn-accent:hover, .nier-btn-secondary:hover { background: #bcbcbc;
		color: #23272e;}
.nier-footer { border-top: 1px solid #bcbcbc; padding-top: 0.7em;}
.nier-alias { font-style: italic;}
</style>

