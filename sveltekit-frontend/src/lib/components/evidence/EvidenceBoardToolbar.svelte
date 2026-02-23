<script lang="ts">
 type ToolbarAction =
 | "analyze"
 | "attach"
 | "pin"
 | "connect"
 | "exportPacket"
 | "delete";

 let { onAction }: {
 onAction: (action: ToolbarAction) => void;
 } = $props();
</script>

<div class="flex flex-wrap items-center gap-2 border-b border-sand/20 bg-panel/40 p-2">
 <button class="rounded-md border border-sand/20 px-3 py-2 text-sm" onclick={() => onAction("analyze")}>
 Analyze
 </button>

 <button class="rounded-md border border-sand/20 px-3 py-2 text-sm" onclick={() => onAction("attach")}>
 Attach to Case
 </button>

 <button class="rounded-md border border-sand/20 px-3 py-2 text-sm" onclick={() => onAction("pin")}>
 Pin
 </button>

 <button class="rounded-md border border-sand/20 px-3 py-2 text-sm" onclick={() => onAction("connect")}>
 Connect
 </button>

 <div class="flex-1"></div>

 <button class="rounded-md border border-sand/20 px-3 py-2 text-sm" onclick={() => onAction("exportPacket")}>
 Export Packet
 </button>

 <button class="rounded-md border border-danger/30 px-3 py-2 text-sm" onclick={() => onAction("delete")}>
 Delete
 </button>
</div>


