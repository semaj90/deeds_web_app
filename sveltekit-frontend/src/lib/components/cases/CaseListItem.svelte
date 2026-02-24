<script lang="ts">
  import Badge from "$lib/components/ui/Badge.svelte";
  import { formatDistanceToNow } from "date-fns";
  import Icon from '$lib/components/ui/Icon.svelte';

  interface CaseData {
    id: string;
	title: string;
    caseNumber: string;
	status: 'open' | 'in_progress' | 'closed' | 'archived';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    openedAt: string | Date;
    defendantName?: string;
    evidenceCount?: number;
    courtDate?: string | Date;
  }

  interface Props {
    caseData: CaseData;
    isActive?: boolean;
    disabled?: boolean;
    onclick?: () => void;
    onstatusChange?: (status: string) => void;
  }

  let {
    caseData,
    isActive = false,
    disabled = false,
    onclick,
    onstatusChange
  }: Props = $props();

  function handleClick() {
    if (!disabled) {
      onclick?.();
    }
  }

  function handleStatusChange(event: Event) {
    event.stopPropagation();
    const target = event.target as HTMLSelectElement;
    onstatusChange?.(target.value);
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "open":
        return "bg-accent/10 text-accent";
      case "in_progress":
        return "bg-warning/10 text-warning";
      case "closed":
        return "bg-info/10 text-info";
      case "archived":
        return "bg-sand/10 text-sand";
      default:return "bg-sand/10 text-sand";
    }
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case "low":
        return "bg-accent/10 text-accent";
      case "medium":
        return "bg-warning/10 text-warning";
      case "high":
        return "bg-warning/10 text-warning";
      case "urgent":
        return "bg-danger/10 text-danger";
      default:return "bg-sand/10 text-sand";
    }
  }

  function getStatusIconName(status: string): string {
    switch (status) {
      case "open":
        return 'check-circle';
      case "in_progress":
        return 'clock';
      case "closed":
        return 'archive';
      case "archived":
        return 'archive';
      default:return 'file-text';
    }
  }

  let statusIconName = $derived(getStatusIconName(caseData.status));
  let formattedDate = $derived(
    formatDistanceToNow(new Date(caseData.openedAt), { addSuffix: true })
  );
</script>

<div
  class="p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md {isActive ? 'bg-info/5 border-info/40' : ''}"
  class:opacity-50={disabled}
  class:cursor-not-allowed={disabled}
  onclick={handleClick}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex={disabled ? -1 : 0}
>
  <div class="space-y-3">
    <!-- Case Title and Number -->
    <div class="flex items-center gap-2">
      <Icon name={statusIconName} class="w-5 h-5 text-sand/60" />
      <h3 class="font-semibold text-lg truncate">
        {caseData.title}
      </h3>
    </div>

    <!-- Case Number -->
    <p class="text-sm text-sand/60">
      Case #{caseData.caseNumber}
    </p>

    <!-- Status and Priority Badges -->
    <div class="flex gap-2 flex-wrap">
      <Badge variant="outline">
        <span class="px-2 py-1 rounded text-xs {getStatusColor(caseData.status)}">
          {caseData.status.replace('_', ' ')}
        </span>
      </Badge>
      <Badge variant="outline">
        <span class="px-2 py-1 rounded text-xs {getPriorityColor(caseData.priority)}">
          {caseData.priority}
        </span>
      </Badge>
    </div>

    <!-- Metadata -->
    <div class="flex flex-wrap gap-4 text-sm text-sand/60">
      <div class="flex items-center gap-1">
        <Icon name="calendar" class="w-4 h-4" />
        <span>{formattedDate}</span>
      </div>
      {#if caseData.defendantName}
        <div class="flex items-center gap-1">
          <Icon name="user" class="w-4 h-4" />
          <span>{caseData.defendantName}</span>
        </div>
      {/if}
      {#if caseData.evidenceCount && caseData.evidenceCount > 0}
        <div class="flex items-center gap-1">
          <Icon name="file-text" class="w-4 h-4" />
          <span>{caseData.evidenceCount} evidence</span>
        </div>
      {/if}
    </div>

    <!-- Court Date if available -->
    {#if caseData.courtDate}
      <div class="flex items-center gap-1 text-sm text-sand/60">
        <Icon name="calendar" class="w-4 h-4" />
        <span>Court: {new Date(caseData.courtDate).toLocaleDateString()}</span>
      </div>
    {/if}

    <!-- Quick Actions -->
    <div class="pt-2 border-t">
      <select
        class="text-sm border rounded px-2 py-1 bg-white"
        value={caseData.status}
        onchange={handleStatusChange}
        onclick={(e) => e.stopPropagation()}
      >
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="closed">Closed</option>
        <option value="archived">Archived</option>
      </select>
    </div>
  </div>
</div>

