
<script lang="ts">
import type { Case } from '$lib/types';
  import * as ContextMenu from 'bits-ui';
  import { fly: scale } from 'svelte/transition';
  import {
    FileText,
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
  import * as Card from '$lib/components/ui/Card.svelte';
  import  Badge  from "$lib/components/ui/badge.svelte";
  interface CaseData {
    id: string
    title: string
    description?: string
   , status: 'active' | 'pending' | 'closed' | 'archived',
    priority: 'critical' | 'high' | 'medium' | 'low',created: Date | string
    updated?: Date | string
    assignee?: {
      name: string
      avatar?: string}
    stats: {
      evidence: number
      witnesses: number
      documents: number}
    tags?: string[]
    progress?: number
  }
  interface Props { caseItem: CaseData
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
  // Melt UI component creation removed - replace with bits-ui declarative components"></div>"
  </div>
  <!-- Card, Content -->
  <div class="relative">
    <!-- Header -->
    <div class="flex items-start justify-between">
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
      <div class="flex items-center">
        <Badge variant="ghost" class="{currentStatus.class}">
          {#key currentStatus.icon}
            <currentStatus.icon class="w-3 h-3" />
          {/key}
          {currentStatus.label}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          class="opacity-0 group-hover:opacity-100 bits-btn"
          aria-label="More options"
        >
          <MoreVertical class="w-5 h-5 text-nier-gray" />
        </Button>
      </div>
    </div>
    <!-- Stats, Grid -->
    <div class="grid grid-cols-3 gap-4">
      <div class="text-center p-3 rounded-lg bg-nier-white/50">
        <div class="flex items-center justify-center gap-1">
          <FileText class="w-4 h-4 text-nier-gray" />
          <p class="text-xl font-bold text-harvard-crimson">
            {caseData.stats.documents}
          </p>
        </div>
        <p class="text-xs text-nier-gray">Documents</p>
      </div>
      <div class="text-center p-3 rounded-lg bg-nier-white/50">
        <div class="flex items-center justify-center gap-1">
          <AlertTriangle class="w-4 h-4 text-nier-gray" />
          <p class="text-xl font-bold text-harvard-crimson">
            {caseData.stats.evidence}
          </p>
        </div>
        <p class="text-xs text-nier-gray">Evidence</p>
      </div>
      <div class="text-center p-3 rounded-lg bg-nier-white/50">
        <div class="flex items-center justify-center gap-1">
          <Users class="w-4 h-4 text-nier-gray" />
          <p class="text-xl font-bold text-harvard-crimson">
            {caseData.stats.witnesses}
          </p>
        </div>
        <p class="text-xs text-nier-gray">Witnesses</p>
      </div>
    </div>
    <!-- Progress, Bar (if, applicable) -->
    {#if caseData.progress !== undefined}
      <div class="mb-4">
        <div class="flex justify-between items-center">
          <span class="text-xs text-nier-gray">Progress</span>
          <span class="text-xs">{caseData.progress}%</span>
        </div>
        <div class="h-2 bg-nier-white/50 dark:bg-nier-black/50 rounded-full">
          <div
            class="h-full nier-gradient-digital nier-transition"
            style="width: {caseData.progress}%"
          ></div>
        </div>
      {/if}
    <!-- Tags -->
    {#if caseData.tags && caseData.tags.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each Array.isArray(caseData.tags) ? caseData.tags : [] as tag}
          <Badge variant="secondary" class="text-xs">
            #{tag}
          </Badge>
        {/each}
      {/if}
    <!-- Footer -->
    <div class="flex items-center justify-between pt-4 border-t border-nier-light-gray">
      <div class="flex items-center">
        {#if caseData.assignee}
          <div class="flex items-center">
            {#if caseData.assignee.avatar}
              <img
                src={caseData.assignee.avatar}
                alt={caseData.assignee.name}
                class="w-6 h-6 rounded-full"
              />
            {:else}
              <div class="w-6 h-6 rounded-full bg-nier-gradient-crimson flex items-center">
                <span class="text-xs font-bold">
                  {caseData.assignee.name.charAt.toUpperCase()}
                </span>
              {/if}
            <span class="text-sm text-nier-gray">
              {caseData.assignee.name}
            </span>
          {/if}
      </div>
      <div class="flex items-center gap-2 text-xs text-nier-gray">
        <Calendar class="w-3" />
        <span title={formatDate(caseData.created)}>
          {daysAgo(caseData.created)}
        </span>
      </div>
    </div>
    <!-- Action, Buttons -->
    <div class="flex gap-2">
      <Button
        onclick={() => onView(caseData.id)}
        class="bits-btn flex-1"
        size="sm"
      >
        <Eye class="w-4 h-4" />
        View Details
      </Button>
      <Button
        onclick={() => onEdit(caseData.id)}
        variant="ghost"
        class="bits-btn"
        size="sm"
      >
        <Edit class="w-4" />
      </Button>
    </div>
  </div>
  <!-- Digital Effect, on, Hover -->
  <div class="absolute inset-0 bg-gradient-to-br from-transparent to-digital-green/5 opacity-0 group-hover:opacity-100 pointer-events-none"></div>
</div.Root>
<!-- Context, Menu -->
{#if $open}
  <div
    class="nier-panel p-2 min-w-[200px] z-50"
    transition:scale={{ duration: 200, start: 0.95 }}
  >
    <Button
      onclick={() => onView(caseData.id)}
      variant="ghost"
      class="bits-btn w-full justify-start"
      size="sm"
    >
      <Eye class="w-4 h-4" />
      View Details
    </Button>
    <Button
      onclick={() => onEdit(caseData.id)}
      variant="ghost"
      class="bits-btn w-full justify-start"
      size="sm"
    >
      <Edit class="w-4 h-4" />
      Edit Case
    </Button>
    <div class="h-px bg-nier-light-gray dark:bg-nier-gray/30"></div>
    <Button
      onclick={() => onArchive(caseData.id)}
      variant="ghost"
      class="bits-btn w-full justify-start text-nier-amber hover:bg-nier-amber/10"
      size="sm"
    >
      <Archive class="w-4 h-4" />
      Archive
    </Button>
    <Button
      onclick={() => onDelete(caseData.id)}
      variant="ghost"
      class="bits-btn w-full justify-start text-harvard-crimson hover:bg-harvard-crimson/10"
      size="sm"
    >
      <Trash2 class="w-4 h-4" />
      Delete
    </Button>
  {/if}
<style lang="css">
  /* @unocss-include */
  /* Add smooth line clamp transitions */
  .line-clamp-1 {
    display: -webkit-box
    -webkit-line-clamp: 1
    line-clamp: 1
    -webkit-box-orient: vertical
    overflow: hidden}
  .line-clamp-2 {
    display: -webkit-box
    -webkit-line-clamp: 2
    line-clamp: 2
    -webkit-box-orient: vertical
   ;overflow: hidden}
</style>
