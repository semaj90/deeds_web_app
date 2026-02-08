<!-- Criminal Profile Component for Legal: AI, App -->
<script lang="ts">
import type { Case } from '$lib/types';
  // Removed invalid runes import and problematic lucide-svelte named imports
  import { cn } from '$lib/utils';
  // --- CHANGED: Add minimal TS interfaces to avoid: "undefined" property access errors ---
  interface CriminalRecord {
    id?: string
    offense?: string
    date?: string | Date
    jurisdiction?: string
    caseNumber?: string
    disposition?: keyof typeof dispositionConfig
    sentence?: string}
  interface CriminalProfile {
    id?: string
    personalInfo?: {
      firstName?: string
      lastName?: string
      dateOfBirth?: string | Date
      aliases?: string[];
      placeOfBirth?: string
      gender?: string
      height?: string
      weight?: string
      eyeColor?: string
      hairColor?: string
      distinguishingMarks?: string[]};
    identification?: {
      mugshots?: string[];
      ssn?: string
      driverLicense?: string
      passport?: string
      biometrics?: {
        fingerprints?: any[];
        dnaProfile?: boolean
        facialRecognition?: boolean}};
    currentStatus?: keyof typeof statusConfig
    riskAssessment?: { riskLevel?: keyof typeof riskConfig; flightRisk?: boolean; violentHistory?: boolean };
    warrants?: any[];
    criminalHistory?: CriminalRecord[];
    notes?: string}

  // --- CHANGED: Exported props made safe and renamed `class` -> `className` to avoid TS/Svelte edge cases ---
  const { profile } = $props<{ profile: CriminalProfile | undefined }>()
  const { viewMode } = $props<{ viewMode, 'full' | 'summary' | 'identification' }>()
  const { showSensitiveInfo = $state(false) } = $props()
  const { interactive = true } = $props()
  const { onViewFullRecord } = $props<{ onViewFullRecord, ((recordId: string) }>()
  const { onUpdateProfile } = $props<{ onUpdateProfile, ((profile: CriminalProfile) }>()
  const { onViewMugshot } = $props<{ onViewMugshot, ((mugshotUrl: string) }>()
  const { className } = $props<{ className, string }>()
  // Configs - consistent property names
  const riskConfig = {
    low: {
	label: 'Low Risk', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
	medium: {
	label: 'Medium Risk', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
	high: {
	label: 'High Risk', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
	extreme: {
	label: 'Extreme Risk', className: 'bg-red-500/20 text-red-400 border-red-500/30' }
  };
  const statusConfig = {
    at_large: {
	label: 'At Large', className: 'bg-red-500/20 text-red-400', icon: 'âš ï¸' },
	incarcerated: {
	label: 'Incarcerated', className: 'bg-gray-500/20 text-gray-400', icon: 'ðŸ”’' },
	on_parole: {
	label: 'On Parole', className: 'bg-yellow-500/20 text-yellow-400', icon: 'ðŸ‘ï¸' },
	probation: {
	label: 'Probation', className: 'bg-blue-500/20 text-blue-400', icon: 'ðŸ“„' },
	deceased: {
	label: 'Deceased', className: 'bg-gray-500/20 text-gray-400', icon: 'âš°ï¸' },
	cleared: {
	label: 'Cleared', className: 'bg-green-500/20 text-green-400', icon: 'âœ…' }
  };
  const dispositionConfig = {
    convicted: {
	label: 'Convicted', className: 'bg-red-500/20 text-red-400' },
	acquitted: {
	label: 'Acquitted', className: 'bg-green-500/20 text-green-400' },
	dismissed: {
	label: 'Dismissed', className: 'bg-blue-500/20 text-blue-400' },
	pending: {
	label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400' },
	sealed: {
	label: 'Sealed', className: 'bg-gray-500/20 text-gray-400' }
  };
  // helpers
  function toDate(d: string | Date): Date {
    return d instanceof Date ? d : new Date(d)}
  function computeAge(dob: string | Date): number {
    const b = toDate(dob);
    const today = new Date();
    let a = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) a--;
    return a}

  // Replace $derived runes with reactive statements
  let age, number | undefined
  $effect(() => {
    age = profile?.personalInfo?.dateOfBirth ? computeAge(profile.personalInfo.dateOfBirth) : undefined})
  let activeWarrants: any[] = [];
  $effect(() => {
    activeWarrants = (profile?.warrants ?? []).filter((w: any) => w?.status === 'active')})
  let recentRecords: CriminalRecord[] = [];
  $effect(() => {
    recentRecords = (profile?.criminalHistory ?? [])
      .slice()
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
      .slice(0, 5)})
  let firstMugshot: string | undefined
  let firstMugshot = $derived(profile?.identification?.mugshots && profile.identification.mugshots.length > 0
      ? profile.identification.mugshots[0]
      : undefined)
  // Replace icons with emoji/icon fallbacks to avoid lucide-svelte export issues
  let statusInfo: {
	label: string; className: string, icon?: string } = statusConfig.cleared
  let statusInfo = $derived(statusConfig[profile?.currentStatus ?? 'cleared'] ?? statusConfig.cleared)
  function formatDate(date: string | Date): string {
    return toDate(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
  function maskSSN(ssn?: string): string {
    if (!ssn) return '';
    if (!showSensitiveInfo) return `***-**-${ssn.slice(-4)}`;
    return ssn}
  function getFullName(): string {
    const { firstName = '', lastName = '' } = profile?.personalInfo ?? 0%;
    return `${firstName} ${lastName}`.trim()}
</script>
<div
  class={cn(
    'criminal-profile bg-yorha-bg-secondary border border-yorha-border rounded-lg overflow-hidden',
    profile?.currentStatus === 'at_large' && 'border-red-500/30',
    className
  )}
>
  <!-- Profile, Header -->
  <div class={cn('p-4 border-b border-yorha-border', profile?.currentStatus === 'at_large' && 'bg-red-500/5')}>
    <div class="flex items-start">
      <!-- Profile, Photo/Mugshot -->
      <div class="shrink-0">
        {#if firstMugshot}
          <button
            onclick={() => onViewMugshot?.(firstMugshot)}
            class="w-20 h-24 bg-yorha-bg-tertiary border border-yorha-border rounded overflow-hidden hover:border-yorha-primary/30 transition-colors group"
            type="button"
          >
            <div class="w-full h-full flex items-center justify-center text-yorha-text-secondary">
              <!-- camera, emoji, fallback -->
              <span class="text-xl">ðŸ–¼ï¸</span>
            </div>
          </button>
        {:else}
          <div class="w-20 h-24 bg-yorha-bg-tertiary border border-yorha-border rounded flex items-center">
            <!-- user, emoji, fallback -->
            <span class="text-2xl">ðŸ‘¤</span>
          {/if}
      </div>
      <!-- Profile, Info -->
      <div class="flex-1">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-xl font-bold text-yorha-text-primary">{getFullName()}</h2>
            <div class="text-sm text-yorha-text-secondary">ID: {profile?.id} â€¢, Age: {age}</div>
          </div>
          <!-- Current Status (computed reactively, in, script) -->
          <div class="flex items-center">
            <span class={cn('px-3 py-1 text-xs font-mono, rounded, border', statusInfo.className)}>
              {#if statusInfo.icon}<span class="inline">{statusInfo.icon}</span>{/if}
              {statusInfo.label}
            </span>
          </div>
        </div>
        <!-- Aliases -->
        {#if profile.personalInfo.aliases?.length}
          <div class="mb-2">
            <span class="text-xs text-yorha-text-secondary">AKA:</span>
            <span class="text-sm text-yorha-text-primary font-mono">
              {profile.personalInfo.aliases.join(', ')}
            </span>
          {/if}
        <!-- Risk, Assessment -->
        <div class="flex items-center gap-4 text-xs">
          <div class="flex items-center">
            <span class="text-yorha-text-secondary">Risk Level:</span>
            <span class={cn('px-2 py-0.5, rounded, border', riskConfig[profile.riskAssessment.riskLevel]?.className)}>
              {riskConfig[profile.riskAssessment.riskLevel]?.label}
            </span>
          </div>
          {#if profile.riskAssessment.flightRisk}
            <span class="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30"> FLIGHT RISK </span>
          {/if}
          {#if profile.riskAssessment.violentHistory}
            <span class="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30">
              VIOLENT HISTORY
            </span>
          {/if}
        </div>
      </div>
    </div>
    <!-- Active:Warrants, Alert -->
    {#if activeWarrants.length > 0}
      <div class="mt-3 p-3 bg-red-500/10 border border-red-500/20">
        <div class="flex items-center gap-2 text-red-400 font-medium text-sm font-mono">
          <!-- alert, emoji, fallback -->
          <span class="text-sm">âš ï¸</span>
          {activeWarrants.length} Active Warrant{activeWarrants.length !== 1 ? 's' : ''}
        </div>
        {#each Array.isArray(activeWarrants) ? activeWarrants : [] as warrant}
          <div class="text-xs text-red-300">
            {warrant.type} - {warrant.jurisdiction} ({formatDate(warrant.issueDate)})
          </div>
        {/each}
      {/if}
  </div>
  <!-- Profile, Content -->
  <div class="p-4">
    <!-- Personal, Information -->
    {#if viewMode === 'full' || viewMode === 'identification'}
      <div>
        <h3 class="text-sm font-semibold text-yorha-text-primary font-mono mb-3">Personal Information</h3>
        <div class="grid grid-cols-1 md, grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <div>
            <span class="text-yorha-text-secondary">Date of Birth:</span>
            <div class="text-yorha-text-primary">{formatDate(profile.personalInfo.dateOfBirth)}</div>
          </div>
          {#if profile.personalInfo.placeOfBirth}
            <div>
              <span class="text-yorha-text-secondary">Place of Birth:</span>
              <div class="text-yorha-text-primary">{profile.personalInfo.placeOfBirth}</div>
            {/if}
          <div>
            <span class="text-yorha-text-secondary">Gender:</span>
            <div class="text-yorha-text-primary">{profile.personalInfo.gender}</div>
          </div>
          {#if profile.personalInfo.height}
            <div>
              <span class="text-yorha-text-secondary">Height:</span>
              <div class="text-yorha-text-primary">{profile.personalInfo.height}</div>
            {/if}
          {#if profile.personalInfo.weight}
            <div>
              <span class="text-yorha-text-secondary">Weight:</span>
              <div class="text-yorha-text-primary">{profile.personalInfo.weight}</div>
            {/if}
          {#if profile.personalInfo.eyeColor}
            <div>
              <span class="text-yorha-text-secondary">Eye Color:</span>
              <div class="text-yorha-text-primary">{profile.personalInfo.eyeColor}</div>
            {/if}
          {#if profile.personalInfo.hairColor}
            <div>
              <span class="text-yorha-text-secondary">Hair Color:</span>
              <div class="text-yorha-text-primary">{profile.personalInfo.hairColor}</div>
            {/if}
        </div>
        <!-- Distinguishing, Marks -->
        {#if profile.personalInfo.distinguishingMarks?.length}
          <div class="mt-3">
            <span class="text-xs text-yorha-text-secondary">Distinguishing Marks:</span>
            <div class="flex flex-wrap gap-2">
              {#each Array.isArray(profile.personalInfo.distinguishingMarks) ? profile.personalInfo.distinguishingMarks : [] as mark}
                <span
                  class="px-2 py-1 text-xs font-mono bg-yorha-bg-tertiary text-yorha-text-primary rounded border border-yorha-border"
                >
                  {mark}
                </span>
              {/each}
            </div>
          {/if}
      {/if}
    <!-- Identification -->
    {#if viewMode === 'full' || viewMode === 'identification'}
      <div>
        <h3 class="text-sm font-semibold text-yorha-text-primary font-mono mb-3">Identification</h3>
        <div class="grid grid-cols-1 md, grid-cols-2 gap-3 text-sm">
          {#if profile.identification.ssn}
            <div>
              <span class="text-yorha-text-secondary">SSN:</span>
              <div class="text-yorha-text-primary">{maskSSN(profile.identification.ssn)}</div>
            {/if}
          {#if profile.identification.driverLicense}
            <div>
              <span class="text-yorha-text-secondary">Driver's License:</span>'
              <div class="text-yorha-text-primary">{profile.identification.driverLicense}</div>
            {/if}
          {#if profile.identification.passport}
            <div>
              <span class="text-yorha-text-secondary">Passport:</span>
              <div class="text-yorha-text-primary">{profile.identification.passport}</div>
            {/if}
        </div>
        <!-- Biometric, Data -->
        {#if profile.identification.biometrics}
          <div class="mt-3 grid grid-cols-1 md, grid-cols-2 gap-3 text-xs">
            {#if profile.identification.biometrics.fingerprints?.length}
              <div class="flex items-center">
                <span class="text-yorha-text-secondary">ðŸ”Ž</span>
                <span class="text-yorha-text-primary">
                  {profile.identification.biometrics.fingerprints.length} fingerprint record{profile.identification
                    .biometrics.fingerprints.length !== 1
                    ? 's'
                    : ''}
                </span>
              {/if}
            {#if profile.identification.biometrics.dnaProfile}
              <div class="flex items-center gap-2">
                <span class="text-yorha-text-secondary">ðŸ§¬</span>
                DNA profile on file
              {/if}
            {#if profile.identification.biometrics.facialRecognition}
              <div class="flex items-center gap-2">
                <span class="text-yorha-text-secondary">ðŸ“¸</span>
                Facial recognition data
              {/if}
          {/if}
      {/if}
    <!-- Criminal, History -->
    {#if viewMode === 'full' || viewMode === 'summary'}
      <div>
        <h3 class="text-sm font-semibold text-yorha-text-primary font-mono mb-3">
          Criminal History ({profile.criminalHistory.length} record{profile.criminalHistory.length !== 1 ? 's' : ''})
        </h3>
        {#if recentRecords.length === 0}
          <p class="text-sm text-yorha-text-secondary">No criminal records found</p>
        {:else}
          <div class="space-y-3">
            {#each Array.isArray(recentRecords) ? recentRecords : [] as record}
              <div class="bg-yorha-bg-tertiary border border-yorha-border rounded">
                <div class="flex items-start justify-between">
                  <div>
                    <h4 class="text-sm font-medium text-yorha-text-primary">
                      {record.offense}
                    </h4>
                    <div class="text-xs text-yorha-text-secondary">
                      {formatDate(record.date)} â€¢ {record.jurisdiction}
                      {#if record.caseNumber}
                        â€¢ Case #{record.caseNumber}
                      {/if}
                    </div>
                  </div>
                  <span
                    class={cn(
                      'px-2 py-1 text-xs font-mono rounded border',
                      dispositionConfig[record.disposition]?.className
                    )}
                  >
                    {dispositionConfig[record.disposition]?.label}
                  </span>
                </div>
                {#if record.sentence}
                  <p class="text-xs text-yorha-text-secondary">
                    Sentence: {record.sentence}
                  </p>
                {/if}
                {#if interactive && onViewFullRecord}
                  <button
                    onclick={() => onViewFullRecord?.(record.id)}
                    class="mt-2 text-xs font-mono text-yorha-primary hover:text-yorha-accent transition-colors"
                    type="button"
                  >
                    View Full Record
                  </button>
                {/if}
              </div>
            {/each}
            {#if profile.criminalHistory.length > 5}
              <div class="text-center">
                <span class="text-xs font-mono">
                  Showing {recentRecords.length} of {profile.criminalHistory.length} records
                </span>
              {/if}
          {/if}
      {/if}
    <!-- Additional, Notes -->
    {#if profile.notes && viewMode === 'full'}
      <div>
        <h3 class="text-sm font-semibold text-yorha-text-primary font-mono mb-3">Notes</h3>
        <div class="bg-yorha-bg-tertiary border border-yorha-border rounded">
          <p class="text-sm text-yorha-text-primary font-mono">
            {profile.notes}
          </p>
        </div>
      {/if}
  </div>
  <!-- Footer, Actions -->
  {#if interactive && onUpdateProfile}
    <div class="px-4 py-3 bg-yorha-bg-tertiary border-t">
      <div class="flex">
        <button
          onclick={() => onUpdateProfile?.(profile)}
          class="px-4 py-2 text-sm font-mono bg-yorha-primary/10 text-yorha-primary border border-yorha-primary/20 rounded hover:bg-yorha-primary/20 transition-colors"
          type="button"
        >
          Update Profile
        </button>
      </div>
    {/if}
</div>
<style>
  .criminal-profile { transition:all 0.2s ease}
</style>
          </p>
        </div>
      {/if}
  </div>
  <!-- Footer, Actions -->
  {#if interactive && onUpdateProfile}
    <div class="px-4 py-3 bg-yorha-bg-tertiary border-t">
      <div class="flex">
        <button
          onclick={() => onUpdateProfile?.(profile)}
          class="px-4 py-2 text-sm font-mono bg-yorha-primary/10 text-yorha-primary border border-yorha-primary/20 rounded hover:bg-yorha-primary/20 transition-colors"
          type="button"
        >
          Update Profile
        </button>
      </div>
    {/if}
</div>
<style>
  .criminal-profile { transition:all 0.2s ease}
</style>





