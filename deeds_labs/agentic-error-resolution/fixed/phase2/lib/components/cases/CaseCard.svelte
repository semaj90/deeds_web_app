<!-- @migration-task Error while migrating Svelte code: `<script>` was left open
https://svelte.dev/e/element_unclosed -->
<!-- @migration-task Error while migrating Svelte code: `<script>` was left open
https://svelte.dev/e/element_unclosed -->
<!-- @migration-task Error while migrating Svelte code: `<script>` was left open
https://svelte.dev/e/element_unclosed -->
<!-- @migration-task Error while migrating Svelte code: `<script>` was left open
https://svelte.dev/e/element_unclosed -->

<script lang="ts">
  import type { ContextMenu  } from 'bits-ui/components/ui/context-menu';
  import type { fly, scale  } from 'svelte/transition';
  import type { FileText,
    Users,
    Calendar,
    MoreVertical,
    Eye,
    Edit,
    Archive,
    Trash2,
    AlertTriangle,
    Clock,
    CheckCircle
   } from 'lucide-svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import * as Card from '$lib/components/ui/card.svelte';
  import  Badge  from "$lib/components/ui/badge.svelte";
  interface CaseData {
    id: string
    title: string
    description?: string;
    status: 'active' | 'pending' | 'closed' | 'archived',
    priority: 'critical' | 'high' | 'medium' | 'low';
    created: Date | string
    updated?: Date | string
    assignee?: {
      name: string
      avatar?: string;
    }
    stats: {
      evidence: number;
      witnesses: number;
      documents: number;
    }
    tags?: string[]
    progress?: number
  }
  interface Props {
    caseItem: CaseData
    onView?: (id: string) => void
    onEdit?: (id: string) => void
    onArchive?: (id: string) => void
    onDelete?: (id: string) => void
  }
  let {
    caseItem: caseData
    onView = () => ,
    onEdit = () => ,
    onArchive = () => ,
    onDelete = () => } = $props()
  // Create context menu
  // Melt UI component creation removed - replace with bits-ui declarative components"></div>
  </div>
  <!-- Card Content -->
  <div class="relative">
    <!-- Header -->
    <div class="flex items-start justify-between mb-4">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-sm font-mono text-nier-gray dark:text-nier-silver">
            {caseData.id}
          </span>
          <span class="{currentPriority.color} text-lg" title="{caseData.priority} priority">
            {currentPriority.icon}
          </span>
        </div>
        <h3 class="text-lg font-semibold nier-heading line-clamp-1 group-hover:text-harvard-crimson dark:group-hover:text-digital-green nier-transition">
          {caseData.title}
        </h3>
        {#if caseData.description}
          <p class="text-sm text-nier-gray dark:text-nier-silver line-clamp-2 mt-1">
            {caseData.description}
          </p>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <Badge variant="ghost" class="{currentStatus.class}">
          {#key currentStatus.icon}
            <currentStatus.icon class="w-3 h-3 mr-1" />
          {/key}
          {currentStatus.label}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          class="opacity-0 group-hover:opacity-100 bits-btn"
          aria-label="More options"
        >
          <MoreVertical class="w-5 h-5 text-nier-gray dark:text-nier-silver" />
        </Button>
      </div>
    </div>
    <!-- Stats Grid -->
    <div class="grid grid-cols-3 gap-4 mb-4">
      <div class="text-center p-3 rounded-lg bg-nier-white/50 dark:bg-nier-black/50">
        <div class="flex items-center justify-center gap-1 mb-1">
          <FileText class="w-4 h-4 text-nier-gray dark:text-nier-silver" />
          <p class="text-xl font-bold text-harvard-crimson dark:text-digital-green">
            {caseData.stats.documents}
          </p>
        </div>
        <p class="text-xs text-nier-gray dark:text-nier-silver">Documents</p>
      </div>
      <div class="text-center p-3 rounded-lg bg-nier-white/50 dark:bg-nier-black/50">
        <div class="flex items-center justify-center gap-1 mb-1">
          <AlertTriangle class="w-4 h-4 text-nier-gray dark:text-nier-silver" />
          <p class="text-xl font-bold text-harvard-crimson dark:text-digital-green">
            {caseData.stats.evidence}
          </p>
        </div>
        <p class="text-xs text-nier-gray dark:text-nier-silver">Evidence</p>
      </div>
      <div class="text-center p-3 rounded-lg bg-nier-white/50 dark:bg-nier-black/50">
        <div class="flex items-center justify-center gap-1 mb-1">
          <Users class="w-4 h-4 text-nier-gray dark:text-nier-silver" />
          <p class="text-xl font-bold text-harvard-crimson dark:text-digital-green">
            {caseData.stats.witnesses}
          </p>
        </div>
        <p class="text-xs text-nier-gray dark:text-nier-silver">Witnesses</p>
      </div>
    </div>
    <!-- Progress Bar (if applicable) -->
    {#if caseData.progress !== undefined}
      <div class="mb-4">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs text-nier-gray dark:text-nier-silver">Progress</span>
          <span class="text-xs font-medium">{caseData.progress}%</span>
        </div>
        <div class="h-2 bg-nier-white/50 dark:bg-nier-black/50 rounded-full overflow-hidden">
          <div
            class="h-full nier-gradient-digital nier-transition"
            style="width: {caseData.progress}%"
          ></div>
        </div>
      {/if}
    <!-- Tags -->
    {#if caseData.tags && caseData.tags.length > 0}
      <div class="flex flex-wrap gap-2 mb-4">
        {#each Array.isArray(caseData.tags) ? caseData.tags : [] as tag}
          <Badge variant="secondary" class="text-xs">
            #{tag}
          </Badge>
        {/each}
      {/if}
    <!-- Footer -->
    <div class="flex items-center justify-between pt-4 border-t border-nier-light-gray dark:border-nier-gray/30">
      <div class="flex items-center gap-3">
        {#if caseData.assignee}
          <div class="flex items-center gap-2">
            {#if caseData.assignee.avatar}
              <img
                src={caseData.assignee.avatar}
                alt={caseData.assignee.name}
                class="w-6 h-6 rounded-full"
              />
            {:else}
              <div class="w-6 h-6 rounded-full bg-nier-gradient-crimson flex items-center justify-center">
                <span class="text-xs font-bold text-nier-white">
                  {caseData.assignee.name.charAt.toUpperCase()}
                </span>
              {/if}
            <span class="text-sm text-nier-gray dark:text-nier-silver">
              {caseData.assignee.name}
            </span>
          {/if}
      </div>
      <div class="flex items-center gap-2 text-xs text-nier-gray dark:text-nier-silver">
        <Calendar class="w-3 h-3" />
        <span title={formatDate(caseData.created)}>
          {daysAgo(caseData.created)}
        </span>
      </div>
    </div>
    <!-- Action Buttons -->
    <div class="flex gap-2 mt-4">
      <Button
        onclick={() => onView(caseData.id)}
        class="bits-btn flex-1"
        size="sm"
      >
        <Eye class="w-4 h-4 mr-2" />
        View Details
      </Button>
      <Button
        onclick={() => onEdit(caseData.id)}
        variant="ghost"
        class="bits-btn"
        size="sm"
      >
        <Edit class="w-4 h-4" />
      </Button>
    </div>
  </div>
  <!-- Digital Effect on Hover -->
  <div class="absolute inset-0 bg-gradient-to-br from-transparent to-digital-green/5 opacity-0 group-hover:opacity-100 pointer-events-none nier-transition"></div>
</div.Root>
<!-- Context Menu -->
{#if $open}
  <div
    class="nier-panel p-2 min-w-[200px] z-50"
    transitionscale={{ duration 200: start, 0: 0.95 }}
  >
    <Button
      onclick={() => onView(caseData.id)}
      variant="ghost"
      class="bits-btn w-full justify-start"
      size="sm"
    >
      <Eye class="w-4 h-4 mr-3" />
      View Details
    </Button>
    <Button
      onclick={() => onEdit(caseData.id)}
      variant="ghost"
      class="bits-btn w-full justify-start"
      size="sm"
    >
      <Edit class="w-4 h-4 mr-3" />
      Edit Case
    </Button>
    <div class="h-px bg-nier-light-gray dark:bg-nier-gray/30 my-2"></div>
    <Button
      onclick={() => onArchive(caseData.id)}
      variant="ghost"
      class="bits-btn w-full justify-start text-nier-amber hover:bg-nier-amber/10"
      size="sm"
    >
      <Archive class="w-4 h-4 mr-3" />
      Archive
    </Button>
    <Button
      onclick={() => onDelete(caseData.id)}
      variant="ghost"
      class="bits-btn w-full justify-start text-harvard-crimson hover:bg-harvard-crimson/10"
      size="sm"
    >
      <Trash2 class="w-4 h-4 mr-3" />
      Delete
    </Button>
  {/if}
<style lang="css">
  /* @unocss-include */
  /* Add smooth line clamp transitions */
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>