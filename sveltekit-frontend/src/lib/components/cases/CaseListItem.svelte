<script lang="ts">
  import Badge from "$lib/components/ui/badge.svelte";
  import { formatDistanceToNow } from "date-fns";
  import Archive from "lucide-svelte/icons/archive";
  import Calendar from "lucide-svelte/icons/calendar";
  import CheckCircle from "lucide-svelte/icons/check-circle";
  import Clock from "lucide-svelte/icons/clock";
  import FileText from "lucide-svelte/icons/file-text";
  import User from "lucide-svelte/icons/user";

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
        return "bg-green-100 text-green-800";
      case "in_progress":
        return "bg-yellow-100 text-yellow-800";
      case "closed":
        return "bg-blue-100 text-blue-800";
      case "archived":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case "low":
        return "bg-green-100 text-green-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "urgent":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "open":
        return CheckCircle;
      case "in_progress":
        return Clock;
      case "closed":
        return Archive;
      case "archived":
        return Archive;
      default:
        return FileText;
    }
  }

  let StatusIcon = $derived(getStatusIcon(caseData.status));
  let formattedDate = $derived(
    formatDistanceToNow(new Date(caseData.openedAt), { addSuffix: true })
  );
</script>

<div
  class="p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md"
  class:bg-blue-50={isActive}
  class:border-blue-300={isActive}
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
      <svelte:component this={StatusIcon} class="w-5 h-5 text-gray-500" />
      <h3 class="font-semibold text-lg truncate">
        {caseData.title}
      </h3>
    </div>

    <!-- Case Number -->
    <p class="text-sm text-gray-500">
      Case #{caseData.caseNumber}
    </p>

    <!-- Status and Priority Badges -->
    <div class="flex gap-2 flex-wrap">
      <Badge variant="ghost">
        <span class="px-2 py-1 rounded text-xs {getStatusColor(caseData.status)}">
          {caseData.status.replace('_', ' ')}
        </span>
      </Badge>
      <Badge variant="ghost">
        <span class="px-2 py-1 rounded text-xs {getPriorityColor(caseData.priority)}">
          {caseData.priority}
        </span>
      </Badge>
    </div>

    <!-- Metadata -->
    <div class="flex flex-wrap gap-4 text-sm text-gray-600">
      <div class="flex items-center gap-1">
        <Calendar class="w-4 h-4" />
        <span>{formattedDate}</span>
      </div>
      {#if caseData.defendantName}
        <div class="flex items-center gap-1">
          <User class="w-4 h-4" />
          <span>{caseData.defendantName}</span>
        </div>
      {/if}
      {#if caseData.evidenceCount && caseData.evidenceCount > 0}
        <div class="flex items-center gap-1">
          <FileText class="w-4 h-4" />
          <span>{caseData.evidenceCount} evidence</span>
        </div>
      {/if}
    </div>

    <!-- Court Date if available -->
    {#if caseData.courtDate}
      <div class="flex items-center gap-1 text-sm text-gray-600">
        <Calendar class="w-4 h-4" />
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
