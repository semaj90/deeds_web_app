<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

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

<div class="retro-toolbar-strip">
	<div class="toolbar-group">
		<button class="toolbar-btn" onclick={() => onAction("analyze")} title="AI Analyze">
			<Icon name="sparkles" size={14} />
			<span>ANALYZE</span>
		</button>

		<button class="toolbar-btn" onclick={() => onAction("attach")} title="Attach to Case">
			<Icon name="paperclip" size={14} />
			<span>ATTACH</span>
		</button>

		<button class="toolbar-btn" onclick={() => onAction("pin")} title="Pin Evidence">
			<Icon name="pin" size={14} />
			<span>PIN</span>
		</button>

		<button class="toolbar-btn" onclick={() => onAction("connect")} title="Connect Nodes">
			<Icon name="link" size={14} />
			<span>CONNECT</span>
		</button>
	</div>

	<div class="toolbar-spacer"></div>

	<div class="toolbar-group">
		<button class="toolbar-btn" onclick={() => onAction("exportPacket")} title="Export Packet">
			<Icon name="download" size={14} />
			<span>EXPORT</span>
		</button>

		<button class="toolbar-btn danger" onclick={() => onAction("delete")} title="Delete Selected">
			<Icon name="trash-2" size={14} />
			<span>DELETE</span>
		</button>
	</div>
</div>

<style>
	.retro-toolbar-strip {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px;
		background: #a8a480;
		border-bottom: 2px solid #8a855e;
	}

	.toolbar-group {
		display: flex;
		gap: 2px;
	}

	.toolbar-spacer {
		flex: 1;
	}

	.toolbar-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		font-family: "Courier New", monospace;
		font-size: 0.6rem;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		background: #c8c3a0;
		border: 2px solid #8a855e;
		color: #4a4630;
		cursor: pointer;
		transition: all 0.1s;
	}

	.toolbar-btn:hover {
		background: #d8d4b8;
		border-color: #6b654a;
	}

	.toolbar-btn:active {
		background: #4a4630;
		color: #e8e4c8;
	}

	.toolbar-btn.danger {
		border-color: #8a4040;
		color: #6a2020;
	}
	.toolbar-btn.danger:hover {
		background: #d8b0b0;
		border-color: #8a2020;
	}

	.toolbar-btn span {
		font-weight: 600;
	}
</style>
