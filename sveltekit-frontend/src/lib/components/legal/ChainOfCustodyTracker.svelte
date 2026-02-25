<!-- Chain of Custody Tracker — evidence transfer timeline with verification, condition tracking -->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { cn } from '$lib/utils';

  interface CustodyTransfer {
    id: string;
    timestamp: Date;
    fromPerson: string;
    toPerson: string;
    location: string;
    reason: string;
    condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
    photos?: string[];
    signature: string;
    witnessSignature?: string;
    notes?: string;
    verified: boolean;
  }

  interface EvidenceItem {
    id: string;
    itemNumber: string;
    description: string;
    category: 'physical' | 'digital' | 'document' | 'biological' | 'chemical' | 'other';
    collectedDate?: Date;
    collectedBy: string;
    currentCustodian: string;
    location: string;
    condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
    sealed: boolean;
    chainOfCustody: CustodyTransfer[];
    compromised: boolean;
    compromisedReason?: string;
  }

  interface ChainOfCustodyProps {
    evidence?: EvidenceItem;
    showFullHistory?: boolean;
    interactive?: boolean;
    onTransferEvidence?: (e: EvidenceItem) => void;
    onViewDetails?: (t: CustodyTransfer) => void;
    class?: string;
  }

  let {
    evidence,
    showFullHistory = true,
    interactive = true,
    onTransferEvidence,
    onViewDetails,
    class: className = ''
  }: ChainOfCustodyProps = $props();

  const categoryConfig: Record<string, { icon: string; color: string; bg: string }> = {
    physical: { icon: 'shield', color: 'text-info/80', bg: 'bg-info/10' },
    digital: { icon: 'hard-drive', color: 'text-accent', bg: 'bg-accent/10' },
    document: { icon: 'file-text', color: 'text-warning', bg: 'bg-warning/10' },
    biological: { icon: 'flask-conical', color: 'text-danger/80', bg: 'bg-danger/10' },
    chemical: { icon: 'beaker', color: 'text-info/80', bg: 'bg-info/10' },
    other: { icon: 'package', color: 'text-sand/40', bg: 'bg-sand/10' }
  };

  const conditionConfig: Record<string, { label: string; className: string }> = {
    excellent: { label: 'Excellent', className: 'bg-accent/20 text-accent' },
    good: { label: 'Good', className: 'bg-info/20 text-info/80' },
    fair: { label: 'Fair', className: 'bg-warning/20 text-warning' },
    poor: { label: 'Poor', className: 'bg-warning/20 text-warning' },
    damaged: { label: 'Damaged', className: 'bg-danger/20 text-danger/80' }
  };

  let sortedTransfers = $derived.by(() => {
    return [...(evidence?.chainOfCustody ?? [])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  });

  let displayTransfers = $derived(showFullHistory ? sortedTransfers : sortedTransfers.slice(0, 3));

  let catInfo = $derived(categoryConfig[evidence?.category ?? 'other'] ?? categoryConfig.other);
  let condInfo = $derived(conditionConfig[evidence?.condition ?? 'good'] ?? conditionConfig.good);

  function formatDateTime(date: Date | string): string {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function getTimeSince(date: Date | string): string {
    const diffMs = Date.now() - new Date(date).getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffDays > 0) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return 'Less than an hour ago';
  }
</script>

{#if evidence}
  <div class={cn('space-y-4', className)}>
    <!-- Evidence Header -->
    <div class={cn(
      'bg-yorha-bg-secondary border rounded-lg p-4',
      evidence.compromised ? 'border-danger/30 bg-danger/5' : 'border-yorha-border'
    )}>
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-3">
          <div class={cn('p-2 rounded-md', catInfo.bg)}>
            <Icon name={catInfo.icon} class={cn('w-5 h-5', catInfo.color)} />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-yorha-text-primary">
              Evidence #{evidence.itemNumber}
            </h3>
            <p class="text-sm text-yorha-text-secondary">{evidence.description}</p>
          </div>
        </div>

        <!-- Status Badges -->
        <div class="flex items-center gap-2">
          {#if evidence.sealed}
            <div class="flex items-center gap-1 px-2 py-1 bg-accent/10 text-accent text-xs font-mono rounded border border-accent/20">
              <Icon name="lock" class="w-3 h-3" />
              SEALED
            </div>
          {:else}
            <div class="flex items-center gap-1 px-2 py-1 bg-warning/10 text-warning text-xs font-mono rounded border border-warning/20">
              <Icon name="unlock" class="w-3 h-3" />
              UNSEALED
            </div>
          {/if}
          {#if evidence.compromised}
            <div class="flex items-center gap-1 px-2 py-1 bg-danger/10 text-danger/80 text-xs font-mono rounded border border-danger/20">
              <Icon name="alert-triangle" class="w-3 h-3" />
              COMPROMISED
            </div>
          {/if}
        </div>
      </div>

      <!-- Status Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
        <div>
          <span class="text-yorha-text-secondary text-xs">Current Custodian</span>
          <div class="text-yorha-text-primary font-medium">{evidence.currentCustodian}</div>
        </div>
        <div>
          <span class="text-yorha-text-secondary text-xs">Location</span>
          <div class="text-yorha-text-primary">{evidence.location}</div>
        </div>
        <div>
          <span class="text-yorha-text-secondary text-xs">Condition</span>
          <span class={cn('inline-block px-2 py-0.5 rounded text-xs mt-1', condInfo.className)}>
            {condInfo.label}
          </span>
        </div>
        <div>
          <span class="text-yorha-text-secondary text-xs">Category</span>
          <div class="text-yorha-text-primary capitalize">{evidence.category}</div>
        </div>
      </div>

      <!-- Compromised Warning -->
      {#if evidence.compromised}
        <div class="mt-3 p-3 bg-danger/10 border border-danger/20 rounded text-sm">
          <div class="flex items-center gap-2 text-danger/80 font-medium">
            <Icon name="alert-triangle" class="w-4 h-4" />
            Chain of Custody Compromised
          </div>
          <p class="text-danger/60 mt-1 text-xs">
            {evidence.compromisedReason ?? 'Reason not specified'}
          </p>
        </div>
      {/if}

      <!-- Transfer Action -->
      {#if interactive && onTransferEvidence}
        <div class="mt-3">
          <button
            onclick={() => onTransferEvidence?.(evidence)}
            class="px-4 py-2 text-sm font-mono bg-yorha-primary/10 text-yorha-primary border border-yorha-primary/20 rounded hover:bg-yorha-primary/20 transition-colors"
            type="button"
          >
            Transfer Custody
          </button>
        </div>
      {/if}
    </div>

    <!-- Chain of Custody History -->
    <div class="bg-yorha-bg-secondary border border-yorha-border rounded-lg p-4">
      <div class="flex items-center justify-between mb-4">
        <h4 class="text-base font-semibold text-yorha-text-primary">Chain of Custody History</h4>
        <span class="text-sm text-yorha-text-secondary">
          {evidence.chainOfCustody?.length ?? 0} transfer{(evidence.chainOfCustody?.length ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>

      {#if (evidence.chainOfCustody?.length ?? 0) === 0}
        <div class="text-center py-8 text-yorha-text-secondary">
          <Icon name="shield" class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No custody transfers recorded</p>
        </div>
      {:else}
        <div class="relative">
          <!-- Timeline Line -->
          <div class="absolute left-6 top-0 bottom-0 w-px bg-yorha-border"></div>

          <div class="space-y-4">
            {#each displayTransfers as transfer (transfer.id)}
              <button
                type="button"
                aria-label="View transfer details at {formatDateTime(transfer.timestamp)}"
                class={cn(
                  'relative flex items-start gap-4 w-full text-left',
                  interactive && onViewDetails && 'cursor-pointer group'
                )}
                onclick={() => interactive && onViewDetails?.(transfer)}
              >
                <!-- Timeline Node -->
                <div class={cn(
                  'relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 shrink-0',
                  transfer.verified ? 'bg-accent/10 border-accent/30' : 'bg-warning/10 border-warning/30',
                  interactive && 'group-hover:scale-110 transition-transform'
                )}>
                  <Icon
                    name={transfer.verified ? 'check-circle' : 'alert-circle'}
                    class={cn('w-5 h-5', transfer.verified ? 'text-accent' : 'text-warning')}
                  />
                </div>

                <!-- Transfer Content -->
                <div class="flex-1 min-w-0">
                  <div class={cn(
                    'bg-yorha-bg-tertiary border border-yorha-border rounded-lg p-4',
                    interactive && 'group-hover:border-yorha-primary/30 transition-colors'
                  )}>
                    <!-- Transfer Header -->
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <div class="flex items-center gap-2 text-sm">
                          <Icon name="user" class="w-4 h-4 text-yorha-text-secondary" />
                          <span class="text-yorha-text-primary">{transfer.fromPerson}</span>
                          <span class="text-yorha-text-secondary">&rarr;</span>
                          <span class="text-yorha-text-primary">{transfer.toPerson}</span>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-yorha-text-secondary font-mono mt-1">
                          <Icon name="calendar" class="w-3 h-3" />
                          {formatDateTime(transfer.timestamp)}
                          <span>&bull;</span>
                          <span>{getTimeSince(transfer.timestamp)}</span>
                        </div>
                      </div>
                      <span class={cn(
                        'px-2 py-1 text-xs font-mono rounded border shrink-0',
                        transfer.verified
                          ? 'bg-accent/20 text-accent border-accent/30'
                          : 'bg-warning/20 text-warning border-warning/30'
                      )}>
                        {transfer.verified ? 'VERIFIED' : 'UNVERIFIED'}
                      </span>
                    </div>

                    <!-- Transfer Details -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
                      <div>
                        <span class="text-yorha-text-secondary">Reason</span>
                        <div class="text-yorha-text-primary">{transfer.reason}</div>
                      </div>
                      <div>
                        <span class="text-yorha-text-secondary">Location</span>
                        <div class="flex items-center gap-1">
                          <Icon name="map-pin" class="w-3 h-3 text-yorha-text-secondary" />
                          <span class="text-yorha-text-primary">{transfer.location}</span>
                        </div>
                      </div>
                      <div>
                        <span class="text-yorha-text-secondary">Condition</span>
                        <span class={cn(
                          'inline-block px-1.5 py-0.5 rounded',
                          conditionConfig[transfer.condition ?? 'good']?.className
                        )}>
                          {conditionConfig[transfer.condition ?? 'good']?.label}
                        </span>
                      </div>
                      <div>
                        <span class="text-yorha-text-secondary">Signatures</span>
                        <div class="text-yorha-text-primary">
                          {transfer.signature}
                          {#if transfer.witnessSignature}
                            <br /><span class="text-yorha-text-secondary">Witness:</span> {transfer.witnessSignature}
                          {/if}
                        </div>
                      </div>
                    </div>

                    <!-- Notes -->
                    {#if transfer.notes}
                      <div class="mt-3 p-2 bg-yorha-bg-primary rounded text-xs">
                        <span class="text-yorha-text-secondary">Notes:</span>
                        <div class="text-yorha-text-primary mt-1">{transfer.notes}</div>
                      </div>
                    {/if}
                  </div>
                </div>
              </button>
            {/each}
          </div>

          <!-- Show More -->
          {#if !showFullHistory && sortedTransfers.length > 3}
            <div class="text-center mt-4">
              <button
                onclick={() => showFullHistory = true}
                class="text-sm font-mono text-yorha-primary hover:text-yorha-accent transition-colors"
                type="button"
              >
                Show {sortedTransfers.length - 3} more transfer{sortedTransfers.length - 3 !== 1 ? 's' : ''}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="text-center py-8 text-yorha-text-secondary">
    <Icon name="shield" class="w-12 h-12 mx-auto mb-4 opacity-50" />
    <p>No evidence item selected</p>
  </div>
{/if}
