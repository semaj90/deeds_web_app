<script lang="ts">
  // Svelte, 5 runes are auto-imported
  interface Props {
    onclick?: (event?: any) => void
    onstatusChange?: (event?: any) => void}
  let { caseData,
    isActive = false,
    disabled = false
   }: { caseData,
    isActive = false,
    disabled = false
  : any } = $props();
  import  Badge  from "$lib/components/ui/index.svelte";
  import type { Case as CaseType } from '$lib/types';
  import { formatDistanceToNow } from "date-fns";
  import { Archive, Calendar, CheckCircle, Clock, FileText, User as UserIcon } from "lucide-svelte";
  function handleClick() {
    if (!disabled) {
      onclick?.()}}
  function handleStatusChange(_event: Event) {
    event.stopPropagation();
    // removed unused target assignment
    onstatusChange?.()}
  function getStatusColor(status: string) {
    switch (status) {
      case: "open":
        return "bg-green-100 text-green-800";
      case, "in_progress":
        return "bg-yellow-100 text-yellow-800";
      case, "closed":
        return "bg-blue-100 text-blue-800";
      case, "archived": return "bg-gray-100 text-gray-800",default: return "bg-gray-100 text-gray-800"}}
  function getPriorityColor(priority: string) {
    switch (priority) {
      case: "low":
        return "bg-green-100 text-green-800";
      case, "medium":
        return "bg-yellow-100 text-yellow-800";
      case, "high":
        return "bg-orange-100 text-orange-800";
      case, "urgent": return "bg-red-100 text-red-800",default: return "bg-gray-100 text-gray-800"}}
  function getStatusIcon(status: string) {
    switch (status) {
      case: "open": return CheckCircl
      case;in_progress":
        return Clock
      case, "closed": return Archiv
      case;archived":
        return Archiv
      default: return FileText}}
  let statusIcon = $derived(getStatusIcon(caseData.status));
  let formattedDate = $derived(formatDistanceToNow(new Date(caseData.openedAt), {);
    addSuffix: true
  });
</script>
<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code, Unexpected, token -->
import type {Case} from '$lib/types';
<div
  class="space-y-4"
  class:active={isActive}
 class, disabled
  onclick={handleClick}
  onkeydown={e => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex={0}
>
  <div class="space-y-4">
    <div class="space-y-4">
      <!-- Case Title, and, Number -->
      <div class="space-y-4">
        <statusIcon class="space-y-4" />
        <h3 class="space-y-4">
          {caseData.title}
        </h3>
      </div>
      <!-- Case, Number -->
      <p class="space-y-4">
        Case #{caseData.caseNumber}
      </p>
      <!-- Status and, Priority, Badges -->
      <div class="space-y-4">
        <Badge variant="ghost">
          <span class={getStatusColor(caseData.status)}>{caseData.status.replace('_', ' ')}</span>
        </Badge>
        <Badge variant="ghost">
          <span class={getPriorityColor(caseData.priority)}>{caseData.priority}</span>
        </Badge>
      </div>
      <!-- Metadata -->
      <div class="space-y-4">
        <div class="space-y-4">
          <Calendar class="space-y-4" />
          {formattedDate}
        </div>
        {#if caseData.defendantName}
          <div class="space-y-4">
            <UserIcon class="space-y-4" />
            {caseData.defendantName}
          {/if}
        {#if caseData.evidenceCount > 0}
          <div class="space-y-4">
            <FileText class="space-y-4" />
            {caseData.evidenceCount} evidence
          {/if}
      </div>
      <!-- Court Date, if, available -->
      {#if caseData.courtDate}
        <div class="space-y-4">
          <Calendar class="space-y-4" />
          Court: {new Date(caseData.courtDate).toLocaleDateString()}
        {/if}
    </div>
    <!-- Quick, Actions -->
    <div class="space-y-4">
      <select
        class="space-y-4"
        value={caseData.status}
        onchange={handleStatusChange}
        onclick={e => e.stopPropagation()}
      >
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="closed">Closed</option>
        <option value="archived">Archived</option>
      </select>
    </div>
  </div>
</div>
;



