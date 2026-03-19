<!-- Criminal Profile Component — status tracking, risk assessment, warrants, criminal history -->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { cn } from '$lib/utils';

  interface CriminalRecord {
    id?: string;
    offense?: string;
    date?: string | Date;
    jurisdiction?: string;
    caseNumber?: string;
    disposition?: keyof typeof dispositionConfig;
    sentence?: string;
  }

  interface CriminalProfileData {
    id?: string;
    personalInfo?: {
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string | Date;
      aliases?: string[];
      placeOfBirth?: string;
      gender?: string;
      height?: string;
      weight?: string;
      eyeColor?: string;
      hairColor?: string;
      distinguishingMarks?: string[];
    };
    identification?: {
      mugshots?: string[];
      ssn?: string;
      driverLicense?: string;
      passport?: string;
      biometrics?: {
        fingerprints?: any[];
        dnaProfile?: boolean;
        facialRecognition?: boolean;
      };
    };
    currentStatus?: keyof typeof statusConfig;
    riskAssessment?: {
      riskLevel?: keyof typeof riskConfig;
      flightRisk?: boolean;
      violentHistory?: boolean;
    };
    warrants?: any[];
    criminalHistory?: CriminalRecord[];
    notes?: string;
  }

  interface CriminalProfileProps {
    profile?: CriminalProfileData;
    viewMode?: 'full' | 'summary' | 'identification';
    showSensitiveInfo?: boolean;
    interactive?: boolean;
    onViewFullRecord?: (recordId: string) => void;
    onUpdateProfile?: (profile: CriminalProfileData) => void;
    onViewMugshot?: (mugshotUrl: string) => void;
    class?: string;
  }

  let {
    profile,
    viewMode = 'full',
    showSensitiveInfo = false,
    interactive = true,
    onViewFullRecord,
    onUpdateProfile,
    onViewMugshot,
    class: className = ''
  }: CriminalProfileProps = $props();

  const riskConfig = {
    low: { label: 'Low Risk', className: 'bg-accent/20 text-accent border-accent/30' },
    medium: { label: 'Medium Risk', className: 'bg-warning/20 text-warning border-warning/30' },
    high: { label: 'High Risk', className: 'bg-warning/20 text-warning border-warning/30' },
    extreme: { label: 'Extreme Risk', className: 'bg-danger/20 text-danger/80 border-danger/30' }
  };

  const statusConfig = {
    at_large: { label: 'At Large', className: 'bg-danger/20 text-danger/80', icon: 'triangle-alert' },
    incarcerated: { label: 'Incarcerated', className: 'bg-sand/20 text-sand/40', icon: 'lock' },
    on_parole: { label: 'On Parole', className: 'bg-warning/20 text-warning', icon: 'eye' },
    probation: { label: 'Probation', className: 'bg-info/20 text-info/80', icon: 'refresh-cw' },
    deceased: { label: 'Deceased', className: 'bg-sand/20 text-sand/40', icon: 'minus-circle' },
    cleared: { label: 'Cleared', className: 'bg-accent/20 text-accent', icon: 'circle-check' }
  };

  const dispositionConfig = {
    convicted: { label: 'Convicted', className: 'bg-danger/20 text-danger/80' },
    acquitted: { label: 'Acquitted', className: 'bg-accent/20 text-accent' },
    dismissed: { label: 'Dismissed', className: 'bg-info/20 text-info/80' },
    pending: { label: 'Pending', className: 'bg-warning/20 text-warning' },
    sealed: { label: 'Sealed', className: 'bg-sand/20 text-sand/40' }
  };

  function toDate(d: string | Date | undefined): Date {
    if (!d) return new Date();
    return d instanceof Date ? d : new Date(d);
  }

  function computeAge(dob: string | Date): number {
    const b = toDate(dob);
    const today = new Date();
    let a = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) a--;
    return a;
  }

  let age = $derived.by(() => {
    return profile?.personalInfo?.dateOfBirth ? computeAge(profile.personalInfo.dateOfBirth) : undefined;
  });

  let activeWarrants = $derived.by(() => {
    return (profile?.warrants ?? []).filter((w: any) => w?.status === 'active');
  });

  let recentRecords = $derived.by(() => {
    return (profile?.criminalHistory ?? [])
      .slice()
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
      .slice(0, 5);
  });

  let firstMugshot = $derived(
    profile?.identification?.mugshots?.length ? profile.identification.mugshots[0] : undefined
  );

  let statusInfo = $derived(
    statusConfig[profile?.currentStatus ?? 'cleared'] ?? statusConfig.cleared
  );

  function formatDate(date: string | Date | undefined): string {
    return toDate(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function maskSSN(ssn?: string): string {
    if (!ssn) return '';
    if (!showSensitiveInfo) return `***-**-${ssn.slice(-4)}`;
    return ssn;
  }

  function getFullName(): string {
    const { firstName = '', lastName = '' } = profile?.personalInfo ?? {};
    return `${firstName} ${lastName}`.trim();
  }
</script>

<div
  class={cn(
    'criminal-profile bg-yorha-bg-secondary border border-yorha-border rounded-lg overflow-hidden',
    profile?.currentStatus === 'at_large' && 'border-danger/30',
    className
  )}
>
  <!-- Profile Header -->
  <div class={cn('p-4 border-b border-yorha-border', profile?.currentStatus === 'at_large' && 'bg-danger/5')}>
    <div class="flex items-start">
      <!-- Mugshot -->
      <div class="shrink-0">
        {#if firstMugshot}
          <button
            onclick={() => onViewMugshot?.(firstMugshot!)}
            class="w-20 h-24 bg-yorha-bg-tertiary border border-yorha-border rounded overflow-hidden hover:border-yorha-primary/30 transition-colors group"
            type="button"
          >
            <div class="w-full h-full flex items-center justify-center text-yorha-text-secondary">
              <Icon name="image" class="w-6 h-6" />
            </div>
          </button>
        {:else}
          <div class="w-20 h-24 bg-yorha-bg-tertiary border border-yorha-border rounded flex items-center justify-center">
            <Icon name="user" class="w-6 h-6 text-yorha-text-secondary" />
          </div>
        {/if}
      </div>
      <!-- Profile Info -->
      <div class="flex-1 ml-4">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-xl font-bold text-yorha-text-primary">{getFullName() || 'Unknown'}</h2>
            <div class="text-sm text-yorha-text-secondary">
              {#if profile?.id}ID: {profile.id}{/if}
              {#if age !== undefined} &bull; Age: {age}{/if}
            </div>
          </div>
          <!-- Status Badge -->
          <div class="flex items-center">
            <span class={cn('px-3 py-1 text-xs font-mono rounded border inline-flex items-center gap-1', statusInfo.className)}>
              <Icon name={statusInfo.icon} class="w-3 h-3" />
              {statusInfo.label}
            </span>
          </div>
        </div>
        <!-- Aliases -->
        {#if profile?.personalInfo?.aliases?.length}
          <div class="mb-2 mt-1">
            <span class="text-xs text-yorha-text-secondary">AKA:</span>
            <span class="text-sm text-yorha-text-primary font-mono ml-1">
              {profile.personalInfo.aliases.join(', ')}
            </span>
          </div>
        {/if}
        <!-- Risk Assessment -->
        {#if profile?.riskAssessment}
          <div class="flex items-center gap-4 text-xs mt-1">
            {#if profile.riskAssessment.riskLevel}
              <div class="flex items-center gap-1">
                <span class="text-yorha-text-secondary">Risk Level:</span>
                <span class={cn('px-2 py-0.5 rounded border', riskConfig[profile.riskAssessment.riskLevel]?.className)}>
                  {riskConfig[profile.riskAssessment.riskLevel]?.label}
                </span>
              </div>
            {/if}
            {#if profile.riskAssessment.flightRisk}
              <span class="px-2 py-0.5 bg-danger/20 text-danger/80 border border-danger/30 rounded">FLIGHT RISK</span>
            {/if}
            {#if profile.riskAssessment.violentHistory}
              <span class="px-2 py-0.5 bg-danger/20 text-danger/80 border border-danger/30 rounded">VIOLENT HISTORY</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
    <!-- Active Warrants Alert -->
    {#if activeWarrants.length > 0}
      <div class="mt-3 p-3 bg-danger/10 border border-danger/20 rounded">
        <div class="flex items-center gap-2 text-danger/80 font-medium text-sm font-mono">
          <Icon name="triangle-alert" class="w-4 h-4" />
          {activeWarrants.length} Active Warrant{activeWarrants.length !== 1 ? 's' : ''}
        </div>
        {#each activeWarrants as warrant}
          <div class="text-xs text-danger/60 mt-1">
            {warrant.type} - {warrant.jurisdiction} ({formatDate(warrant.issueDate)})
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Profile Content -->
  <div class="p-4">
    <!-- Personal Information -->
    {#if viewMode === 'full' || viewMode === 'identification'}
      {#if profile?.personalInfo}
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-yorha-text-primary font-mono mb-3">Personal Information</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {#if profile.personalInfo.dateOfBirth}
              <div>
                <span class="text-yorha-text-secondary">Date of Birth:</span>
                <div class="text-yorha-text-primary">{formatDate(profile.personalInfo.dateOfBirth)}</div>
              </div>
            {/if}
            {#if profile.personalInfo.placeOfBirth}
              <div>
                <span class="text-yorha-text-secondary">Place of Birth:</span>
                <div class="text-yorha-text-primary">{profile.personalInfo.placeOfBirth}</div>
              </div>
            {/if}
            {#if profile.personalInfo.gender}
              <div>
                <span class="text-yorha-text-secondary">Gender:</span>
                <div class="text-yorha-text-primary">{profile.personalInfo.gender}</div>
              </div>
            {/if}
            {#if profile.personalInfo.height}
              <div>
                <span class="text-yorha-text-secondary">Height:</span>
                <div class="text-yorha-text-primary">{profile.personalInfo.height}</div>
              </div>
            {/if}
            {#if profile.personalInfo.weight}
              <div>
                <span class="text-yorha-text-secondary">Weight:</span>
                <div class="text-yorha-text-primary">{profile.personalInfo.weight}</div>
              </div>
            {/if}
            {#if profile.personalInfo.eyeColor}
              <div>
                <span class="text-yorha-text-secondary">Eye Color:</span>
                <div class="text-yorha-text-primary">{profile.personalInfo.eyeColor}</div>
              </div>
            {/if}
            {#if profile.personalInfo.hairColor}
              <div>
                <span class="text-yorha-text-secondary">Hair Color:</span>
                <div class="text-yorha-text-primary">{profile.personalInfo.hairColor}</div>
              </div>
            {/if}
          </div>
          <!-- Distinguishing Marks -->
          {#if profile.personalInfo.distinguishingMarks?.length}
            <div class="mt-3">
              <span class="text-xs text-yorha-text-secondary">Distinguishing Marks:</span>
              <div class="flex flex-wrap gap-2 mt-1">
                {#each profile.personalInfo.distinguishingMarks as mark}
                  <span class="px-2 py-1 text-xs font-mono bg-yorha-bg-tertiary text-yorha-text-primary rounded border border-yorha-border">
                    {mark}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    {/if}

    <!-- Identification -->
    {#if viewMode === 'full' || viewMode === 'identification'}
      {#if profile?.identification}
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-yorha-text-primary font-mono mb-3">Identification</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {#if profile.identification.ssn}
              <div>
                <span class="text-yorha-text-secondary">SSN:</span>
                <div class="text-yorha-text-primary font-mono">{maskSSN(profile.identification.ssn)}</div>
              </div>
            {/if}
            {#if profile.identification.driverLicense}
              <div>
                <span class="text-yorha-text-secondary">Driver's License:</span>
                <div class="text-yorha-text-primary">{profile.identification.driverLicense}</div>
              </div>
            {/if}
            {#if profile.identification.passport}
              <div>
                <span class="text-yorha-text-secondary">Passport:</span>
                <div class="text-yorha-text-primary">{profile.identification.passport}</div>
              </div>
            {/if}
          </div>
          <!-- Biometrics -->
          {#if profile.identification.biometrics}
            <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {#if profile.identification.biometrics.fingerprints?.length}
                <div class="flex items-center gap-2">
                  <Icon name="fingerprint-pattern" class="w-4 h-4 text-yorha-text-secondary" />
                  <span class="text-yorha-text-primary">
                    {profile.identification.biometrics.fingerprints.length} fingerprint record{profile.identification.biometrics.fingerprints.length !== 1 ? 's' : ''}
                  </span>
                </div>
              {/if}
              {#if profile.identification.biometrics.dnaProfile}
                <div class="flex items-center gap-2">
                  <Icon name="dna" class="w-4 h-4 text-yorha-text-secondary" />
                  <span class="text-yorha-text-primary">DNA profile on file</span>
                </div>
              {/if}
              {#if profile.identification.biometrics.facialRecognition}
                <div class="flex items-center gap-2">
                  <Icon name="scan-face" class="w-4 h-4 text-yorha-text-secondary" />
                  <span class="text-yorha-text-primary">Facial recognition data</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    {/if}

    <!-- Criminal History -->
    {#if viewMode === 'full' || viewMode === 'summary'}
      <div class="mb-6">
        <h3 class="text-sm font-semibold text-yorha-text-primary font-mono mb-3">
          Criminal History ({profile?.criminalHistory?.length ?? 0} record{(profile?.criminalHistory?.length ?? 0) !== 1 ? 's' : ''})
        </h3>
        {#if recentRecords.length === 0}
          <p class="text-sm text-yorha-text-secondary">No criminal records found</p>
        {:else}
          <div class="space-y-3">
            {#each recentRecords as record}
              <div class="bg-yorha-bg-tertiary border border-yorha-border rounded p-3">
                <div class="flex items-start justify-between">
                  <div>
                    <h4 class="text-sm font-medium text-yorha-text-primary">{record.offense}</h4>
                    <div class="text-xs text-yorha-text-secondary mt-1">
                      {formatDate(record.date)} &bull; {record.jurisdiction}
                      {#if record.caseNumber}
                        &bull; Case #{record.caseNumber}
                      {/if}
                    </div>
                  </div>
                  {#if record.disposition}
                    <span class={cn('px-2 py-1 text-xs font-mono rounded border', dispositionConfig[record.disposition]?.className)}>
                      {dispositionConfig[record.disposition]?.label}
                    </span>
                  {/if}
                </div>
                {#if record.sentence}
                  <p class="text-xs text-yorha-text-secondary mt-2">Sentence: {record.sentence}</p>
                {/if}
                {#if interactive && onViewFullRecord && record.id}
                  <button
                    onclick={() => onViewFullRecord?.(record.id!)}
                    class="mt-2 text-xs font-mono text-yorha-primary hover:text-yorha-accent transition-colors"
                    type="button"
                  >
                    View Full Record
                  </button>
                {/if}
              </div>
            {/each}
            {#if (profile?.criminalHistory?.length ?? 0) > 5}
              <div class="text-center">
                <span class="text-xs font-mono text-yorha-text-secondary">
                  Showing {recentRecords.length} of {profile?.criminalHistory?.length} records
                </span>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Notes -->
    {#if profile?.notes && viewMode === 'full'}
      <div class="mb-6">
        <h3 class="text-sm font-semibold text-yorha-text-primary font-mono mb-3">Notes</h3>
        <div class="bg-yorha-bg-tertiary border border-yorha-border rounded p-3">
          <p class="text-sm text-yorha-text-primary font-mono">{profile.notes}</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Footer Actions -->
  {#if interactive && onUpdateProfile && profile}
    <div class="px-4 py-3 bg-yorha-bg-tertiary border-t border-yorha-border">
      <div class="flex">
        <button
          onclick={() => onUpdateProfile?.(profile!)}
          class="px-4 py-2 text-sm font-mono bg-yorha-primary/10 text-yorha-primary border border-yorha-primary/20 rounded hover:bg-yorha-primary/20 transition-colors"
          type="button"
        >
          Update Profile
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .criminal-profile {
    transition: all 0.2s ease;
  }
</style>
