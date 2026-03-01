<script lang="ts">
import { onMount } from 'svelte';
import Icon from '$lib/components/ui/Icon.svelte';
import Button from '$lib/components/ui/Button.svelte';

interface Props {
	noteId: string;
	caseId: string;
	onRestore?: (versionId: string) => void;
}

let { noteId, caseId, onRestore }: Props = $props();

interface NoteVersion {
	id: string;
	noteId: string;
	title: string;
	content: string;
	versionNumber: number;
	editedBy?: string;
	createdAt: string;
}

let versions = $state<NoteVersion[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
let selectedVersion = $state<NoteVersion | null>(null);
let showDiff = $state(false);

async function fetchVersions() {
	loading = true;
	error = null;

	try {
		const res = await fetch(`/api/cases/${caseId}/notes/${noteId}/versions`);
		if (!res.ok) throw new Error('Failed to fetch version history');

		const data = await res.json();
		versions = data.versions || [];
	} catch (err) {
		error = err instanceof Error ? err.message : 'Unknown error';
		versions = [];
	} finally {
		loading = false;
	}
}

async function handleRestore(version: NoteVersion) {
	if (!confirm(`Restore version ${version.versionNumber}? This will create a new version with this content.`)) {
		return;
	}

	if (onRestore) {
		onRestore(version.id);
	}
}

function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString();
}

function togglePreview(version: NoteVersion) {
	if (selectedVersion?.id === version.id) {
		selectedVersion = null;
	} else {
		selectedVersion = version;
	}
}

$effect(() => {
	fetchVersions();
});
</script>

<div class="version-history-container flex flex-col h-full bg-panel border border-sand-6 rounded-lg">
	<!-- Header -->
	<div class="flex items-center justify-between px-4 py-3 border-b border-sand-6">
		<div class="flex items-center gap-2">
			<Icon name="history" class="w-4 h-4 text-accent" />
			<h3 class="text-sm font-semibold text-sand-12">Version History</h3>
			<span class="text-xs text-sand-11 bg-sand-4 px-2 py-0.5 rounded">
				{versions.length} {versions.length === 1 ? 'version' : 'versions'}
			</span>
		</div>
		<Button variant="ghost" size="sm" onclick={fetchVersions} disabled={loading}>
			<Icon name="refresh-cw" class="w-3.5 h-3.5 {loading ? 'animate-spin' : ''}" />
		</Button>
	</div>

	<!-- Version List -->
	<div class="flex-1 overflow-y-auto version-scroll">
		{#if loading}
			<div class="flex items-center justify-center h-full">
				<div class="flex items-center gap-2 text-sand-11">
					<Icon name="loader-2" class="w-4 h-4 animate-spin" />
					<span class="text-sm">Loading versions...</span>
				</div>
			</div>
		{:else if error}
			<div class="flex items-center justify-center h-full">
				<div class="flex items-center gap-2 text-danger">
					<Icon name="alert-circle" class="w-4 h-4" />
					<span class="text-sm">{error}</span>
				</div>
			</div>
		{:else if versions.length === 0}
			<div class="flex flex-col items-center justify-center h-full gap-2 text-sand-11">
				<Icon name="file-clock" class="w-8 h-8" />
				<p class="text-sm">No version history available</p>
			</div>
		{:else}
			<div class="divide-y divide-sand-5">
				{#each versions as version (version.id)}
					<div class="version-item p-3 hover:bg-sand-3 transition-colors">
						<!-- Version Header -->
						<div class="flex items-start justify-between gap-2 mb-2">
							<div class="flex items-center gap-2">
								<div class="flex items-center justify-center w-7 h-7 rounded-full bg-accent/10 text-accent">
									<span class="text-xs font-semibold">v{version.versionNumber}</span>
								</div>
								<div>
									<p class="text-sm font-medium text-sand-12 line-clamp-1">{version.title}</p>
									<div class="flex items-center gap-2 text-xs text-sand-11">
										<span>{formatDate(version.createdAt)}</span>
										{#if version.editedBy}
											<span>•</span>
											<span>{version.editedBy}</span>
										{/if}
									</div>
								</div>
							</div>
							<div class="flex items-center gap-1">
								<Button
									variant="ghost"
									size="sm"
									class="h-7 px-2"
									onclick={() => togglePreview(version)}
								>
									<Icon name={selectedVersion?.id === version.id ? 'eye-off' : 'eye'} class="w-3.5 h-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="sm"
									class="h-7 px-2 text-info hover:text-info"
									onclick={() => handleRestore(version)}
								>
									<Icon name="rotate-ccw" class="w-3.5 h-3.5" />
								</Button>
							</div>
						</div>

						<!-- Content Preview (Expanded) -->
						{#if selectedVersion?.id === version.id}
							<div class="mt-2 p-3 bg-sand-2 border border-sand-5 rounded text-sm text-sand-12 max-h-48 overflow-y-auto preview-scroll">
								{@html version.content}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<div class="px-4 py-2 border-t border-sand-6 text-xs text-sand-11">
		<div class="flex items-center gap-1">
			<Icon name="info" class="w-3 h-3" />
			<span>Click <Icon name="eye" class="w-3 h-3 inline-block mx-1" /> to preview, <Icon name="rotate-ccw" class="w-3 h-3 inline-block mx-1" /> to restore</span>
		</div>
	</div>
</div>

<style>
.version-scroll {
	scrollbar-width: thin;
	scrollbar-color: var(--sand-8) var(--sand-4);
}

.version-scroll::-webkit-scrollbar {
	width: 8px;
}

.version-scroll::-webkit-scrollbar-track {
	background: var(--sand-4);
	border-radius: 4px;
}

.version-scroll::-webkit-scrollbar-thumb {
	background: var(--sand-8);
	border-radius: 4px;
}

.preview-scroll {
	scrollbar-width: thin;
	scrollbar-color: var(--sand-7) var(--sand-3);
}

.preview-scroll::-webkit-scrollbar {
	width: 6px;
}

.preview-scroll::-webkit-scrollbar-track {
	background: var(--sand-3);
}

.preview-scroll::-webkit-scrollbar-thumb {
	background: var(--sand-7);
	border-radius: 3px;
}

.version-item {
	position: relative;
}

.line-clamp-1 {
	overflow: hidden;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 1;
}
</style>
