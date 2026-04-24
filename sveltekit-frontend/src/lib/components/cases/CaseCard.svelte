<script lang="ts">
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { scale } from 'svelte/transition';

  interface CaseData { id: string, title: string;
    description?: string;
	status: 'active' | 'pending' | 'closed' | 'archived';
    priority: 'critical' | 'high' | 'medium' | 'low';
    created: Date | string;
    updated?: Date | string;
    assignee?: {
	name: string;
      avatar?: string };
    stats: { evidence: number, witnesses: number;
	documents: number };
    tags?: string[];
    progress?: number }

  interface Props {
    caseItem: CaseData;
    onView?: (id: string) => void;
    onEdit?: (id: string) => void;
    onBoard?: (id: string) => void;
    onArchive?: (id: string) => void;
    onDelete?: (id: string) => void }

  let {
    caseItem: caseData,
    onView = () => {},
	onEdit = () => {},
	onBoard = () => {},
	onArchive = () => {},
	onDelete = () => {}
  }: Props = $props();

  let open = $state(false);

  const statusConfig = { active: { label: 'Active', class: 'bg-accent/10 text-accent', icon: 'circle-check' },
	pending: {
	label: 'Pending', class: 'bg-warning/10 text-warning', icon: 'clock' },
	closed: {
	label: 'Closed', class: 'bg-info/10 text-info', icon: 'archive' },
	archived: {
	label: 'Archived', class: 'bg-sand/10 text-sand', icon: 'archive' }
  };

  const priorityConfig = { critical: { icon: '🔴', color: 'text-danger' },
	high: {
	icon: '🟠', color: 'text-warning' },
	medium: {
	icon: '🟡', color: 'text-warning' },
	low: {
	icon: '🟢', color: 'text-accent' }
  };

  let currentStatus = $derived(statusConfig[caseData.status] || statusConfig.active);
  let currentPriority = $derived(priorityConfig[caseData.priority] || priorityConfig.medium);

  function formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function daysAgo(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${diff} days ago`;
  }
</script>

<div class="group relative nier-panel p-4 hover:shadow-lg transition-all duration-300">
  <!-- Card Content -->
  <div class="relative">
    <!-- Header -->
    <div class="flex items-start justify-between mb-4">
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-mono text-nier-gray">
            {caseData.id}
          </span>
          <span class="{currentPriority.color} text-lg" title="{caseData.priority} priority">
            {currentPriority.icon}
          </span>
        </div>
        <h3 class="text-lg font-semibold nier-heading line-clamp-1 group-hover:text-harvard-crimson dark:group-hover:text-digital-green">
          {caseData.title}
        </h3>
        {#if caseData.description}
          <p class="text-sm text-nier-gray dark:text-nier-silver line-clamp-2">
            {caseData.description}
          </p>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <Badge variant="outline" class={currentStatus.class}>
          {#if currentStatus.icon}
            <Icon name={currentStatus.icon} class="w-3 h-3 mr-1" />
          {/if}
          {currentStatus.label}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          class="opacity-0 group-hover:opacity-100"
          aria-label="More options"
          onclick={() => open = !open}
        >
          <Icon name="ellipsis-vertical" class="w-5 h-5 text-nier-gray" />
        </Button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-3 gap-4 mb-4">
      <div class="text-center p-3 rounded-lg bg-nier-white/50">
        <div class="flex items-center justify-center gap-1">
          <Icon name="file-text" class="w-4 h-4 text-nier-gray" />
          <p class="text-xl font-bold text-harvard-crimson">
            {caseData.stats.documents}
          </p>
        </div>
        <p class="text-xs text-nier-gray">Documents</p>
      </div>

      <div class="text-center p-3 rounded-lg bg-nier-white/50">
        <div class="flex items-center justify-center gap-1">
          <Icon name="triangle-alert" class="w-4 h-4 text-nier-gray" />
          <p class="text-xl font-bold text-harvard-crimson">
            {caseData.stats.evidence}
          </p>
        </div>
        <p class="text-xs text-nier-gray">Evidence</p>
      </div>

      <div class="text-center p-3 rounded-lg bg-nier-white/50">
        <div class="flex items-center justify-center gap-1">
          <Icon name="users" class="w-4 h-4 text-nier-gray" />
          <p class="text-xl font-bold text-harvard-crimson">
            {caseData.stats.witnesses}
          </p>
        </div>
        <p class="text-xs text-nier-gray">Witnesses</p>
      </div>
    </div>

    <!-- Progress Bar -->
    {#if caseData.progress !== undefined}
      <div class="mb-4">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs text-nier-gray">Progress</span>
          <span class="text-xs">{caseData.progress}%</span>
        </div>
        <div class="h-2 bg-nier-white/50 dark:bg-nier-black/50 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-digital-green to-harvard-crimson transition-all duration-300"
            style="width: {caseData.progress}%"
          ></div>
        </div>
      </div>
    {/if}

    <!-- Tags -->
    {#if caseData.tags && caseData.tags.length > 0}
      <div class="flex flex-wrap gap-2 mb-4">
        {#each caseData.tags as tag}
          <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10 text-sand/80">#{tag}</span>
        {/each}
      </div>
    {/if}

    <!-- Footer -->
    <div class="flex items-center justify-between pt-4 border-t border-nier-light-gray">
      <div class="flex items-center gap-2">
        {#if caseData.assignee}
          <div class="flex items-center gap-2">
            {#if caseData.assignee.avatar}
              <img
                src={caseData.assignee.avatar}
                alt={caseData.assignee.name}
                class="w-6 h-6 rounded-full"
              />
            {:else}
              <div class="w-6 h-6 rounded-full bg-gradient-to-r from-harvard-crimson to-digital-green flex items-center justify-center">
                <span class="text-xs font-bold text-white">
                  {caseData.assignee.name.charAt(0).toUpperCase()}
                </span>
              </div>
            {/if}
            <span class="text-sm text-nier-gray">
              {caseData.assignee.name}
            </span>
          </div>
        {/if}
      </div>

      <div class="flex items-center gap-2 text-xs text-nier-gray">
        <Icon name="calendar" class="w-3 h-3" />
        <span title={formatDate(caseData.created)}>
          {daysAgo(caseData.created)}
        </span>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex gap-2 mt-4">
      <Button
        onclick={() => onView(caseData.id)}
        class="flex-1"
        size="sm"
      >
        <Icon name="eye" class="w-4 h-4 mr-1" />
        View Details
      </Button>
      <Button
        onclick={() => onBoard(caseData.id)}
        variant="ghost"
        size="sm"
        title="Open evidence board"
      >
        <Icon name="layout-grid" class="w-4 h-4" />
      </Button>
      <Button
        onclick={() => onEdit(caseData.id)}
        variant="ghost"
        size="sm"
      >
        <Icon name="pencil" class="w-4 h-4" />
      </Button>
    </div>
  </div>

  <!-- Hover Effect -->
  <div class="absolute inset-0 bg-gradient-to-br from-transparent to-digital-green/5 opacity-0 group-hover:opacity-100 pointer-events-none rounded-lg"></div>
</div>

<!-- Context Menu -->
{#if open}
  <div
    class="absolute right-0 top-full mt-1 nier-panel p-2 min-w-[200px] z-50 shadow-lg"
    transition:scale={{
	duration: 200, start: 0.95 }}
  >
    <Button
      onclick={() => { onView(caseData.id); open = false }}
      variant="ghost"
      class="w-full justify-start"
      size="sm"
    >
      <Icon name="eye" class="w-4 h-4 mr-2" />
      View Details
    </Button>
    <Button
      onclick={() => { onBoard(caseData.id); open = false }}
      variant="ghost"
      class="w-full justify-start"
      size="sm"
    >
      <Icon name="layout-grid" class="w-4 h-4 mr-2" />
      Open Board
    </Button>
    <Button
      onclick={() => { onEdit(caseData.id); open = false }}
      variant="ghost"
      class="w-full justify-start"
      size="sm"
    >
      <Icon name="pencil" class="w-4 h-4 mr-2" />
      Edit Case
    </Button>
    <div class="h-px bg-nier-light-gray dark:bg-nier-gray/30 my-1"></div>
    <Button
      onclick={() => { onArchive(caseData.id); open = false }}
      variant="ghost"
      class="w-full justify-start text-warning hover:bg-warning/5"
      size="sm"
    >
      <Icon name="archive" class="w-4 h-4 mr-2" />
      Archive
    </Button>
    <Button
      onclick={() => { onDelete(caseData.id); open = false }}
      variant="ghost"
      class="w-full justify-start text-danger hover:bg-danger/5"
      size="sm"
    >
      <Icon name="trash-2" class="w-4 h-4 mr-2" />
      Delete
    </Button>
  </div>
{/if}

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
	overflow: hidden;}
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
	overflow: hidden;}
</style>

