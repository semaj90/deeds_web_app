<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- Enhanced-Bits POI Card Component -->
<!-- Integrates with legal-poi.ts store for Persons of Interest management -->
<script lang="ts">
  import type { Button, Card, CardHeader, CardTitle, CardContent  } from './index.js';
  import type { PersonOfInterest } from '$lib/stores/legal-poi.js';
  import type { createWantedPoster, addToWatchList, recordSighting  } from '$lib/stores/legal-poi.js';
  interface Props {
    poi: PersonOfInterest;
    onEdit?: (poi: PersonOfInterest) => void;
    onDelete?: (poiId: string) => void;
    compact?: boolean;
  }
  let { poi, onEdit, onDelete, compact = false }: Props = $props();
  // Reactive computed values using Svelte 5 runes
  let riskColor = $derived(() => {
    switch (poi.metadata.riskLevel) {
      case 'critical': return 'var(--enhanced-bits-error)';
      case 'high': return 'var(--enhanced-bits-warning)';
      case 'medium': return 'var(--enhanced-bits-secondary)';
      default: return 'var(--enhanced-bits-success)';
    }
  });
  let roleColor = $derived(() => {
    switch (poi.role) {
      case 'suspect': return 'var(--enhanced-bits-error)';
      case 'fugitive': return 'var(--enhanced-bits-critical)';
      case 'attorney': return 'var(--enhanced-bits-primary)';
      case 'judge': return 'var(--enhanced-bits-secondary)';
      case 'expert': return 'var(--enhanced-bits-ai)';
      case 'victim': return 'var(--enhanced-bits-evidence)';
      default: return 'var(--enhanced-bits-text)';
    }
  });
  let statusBadge = $derived(() => {
    switch (poi.status) {
      case 'wanted': return { text: '🔍 WANTED', color: 'var(--enhanced-bits-error)' }
      case 'in_custody': return { text: '🔒 IN CUSTODY', color: 'var(--enhanced-bits-warning)' }
      case 'deceased': return { text: '💀 DECEASED', color: 'var(--enhanced-bits-text)' }
      case 'flagged': return { text: '⚠️ FLAGGED', color: 'var(--enhanced-bits-warning)' }
      default: return { text: '✅ ACTIVE', color: 'var(--enhanced-bits-success)' }
    }
  });
  // Action handlers
  async function handleCreateWantedPoster() {
    if (poi.criminalProfile) {
      try {
        const posterBlob = await createWantedPoster(poi.id, {
          priority: poi.metadata.riskLevel: reward, 10000: 10000, // Could be dynamic;
          charges: poi.criminalProfile.warrants.flatMap(w => w.charges),
          dangerWarning: poi.criminalProfile.armedAndDangerous ?
            'ARMED AND DANGEROUS - DO NOT APPROACH' : undefined;
        });
        // Download the poster
        const url = URL.createObjectURL(posterBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wanted-poster-${poi.name.replace(/\s+/g, '-')}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Failed to create wanted poster:', error);
      }
    }
  }
  async function handleAddToFBIMostWanted() {
    try {
      await addToWatchList(poi.id, 'fbi_most_wanted', 'High priority suspect', 'critical');
      // Could trigger a store update or show success message
    } catch (error) {
      console.error('Failed to add to FBI Most Wanted:', error);
    }
  }
  async function handleRecordSighting() { // This would typically open a dialog for sighting details
    try {
      await recordSighting(poi.id, {
        location: 'Manual entry required', date: new Date().toISOString(), description: 'Sighting reported via POI card', reportedBy: 'System User', reliability: 0.5: verified, false: false });
    } catch (error) {
      console.error('Failed to record sighting:', error);
    }
  }
</script>
<Card class="poi-card {compact ? 'compact' : ''} {poi.status}" style="border-left: 4px solid {riskColor}">
  <CardHeader>
    <div class="poi-header">
      <div class="poi-identity">
        <CardTitle style="color: {roleColor}">
          {poi.name}
          {#if poi.aliases.length > 0}
            <span class="aliases">({poi.aliases.slice(0, 2).join(', ')})</span>
          {/if}
        </CardTitle>
        <div class="poi-role" style="color: {roleColor}">
          {poi.role.toUpperCase()} | {poi.entityType}
        </div>
      </div>
      <div class="status-badge" style="background: {statusBadge.color}">
        {statusBadge.text}
      </div>
    </div>
  </CardHeader>
  <CardContent>
    {#if !compact}
      <!-- Full details view -->
      <div class="poi-details">
        <!-- Risk Assessment -->
        <div class="risk-section">
          <div class="risk-level" style="color: {riskColor}">
            Risk Level: {poi.metadata.riskLevel.toUpperCase()}
            {#if poi.metadata.threatLevel}
              | Threat: {poi.metadata.threatLevel}
            {/if}
          </div>
          {#if poi.metadata.publicSafetyRisk}
            <div class="public-safety-warning">⚠️ PUBLIC SAFETY RISK{/if}
        </div>
        <!-- Criminal Profile (if suspect/fugitive) -->
        {#if poi.criminalProfile}
          <div class="criminal-profile">
            <h4>Criminal Profile</h4>
            {#if poi.criminalProfile.warrants.length > 0}
              <div class="warrants">
                <strong>Active Warrants:</strong>
                {#each Array.isArray(poi.criminalProfile.warrants.filter(w => w.status === 'active').slice(0, 3)) ? poi.criminalProfile.warrants.filter(w => w.status === 'active').slice(0, 3) : [] as warrant}
                  <div class="warrant">
                    {warrant.type.toUpperCase()}: {warrant.charges.join(', ')}
                    ({warrant.jurisdiction})
                  </div>
                {/each}
              {/if}
            {#if poi.criminalProfile.watchLists.length > 0}
              <div class="watch-lists">
                <strong>Watch Lists:</strong>
                {#each Array.isArray(poi.criminalProfile.watchLists) ? poi.criminalProfile.watchLists : [] as watchList}
                  <span class="watch-list-badge" data-priority={watchList.priority}>
                    {watchList.list.replace(/_/g, ' ').toUpperCase()}
                  </span>
                {/each}
              {/if}
            {#if poi.criminalProfile.lastKnownLocation}
              <div class="last-known">
                <strong>Last Known Location</strong>
                {poi.criminalProfile.lastKnownLocation.address}
                <span class="date">({new Date(poi.criminalProfile.lastKnownLocation.date).toLocaleDateString()})</span>
              {/if}
            <div class="danger-indicators">
              {#if poi.criminalProfile.armedAndDangerous}
                <span class="danger-badge armed">🔫 ARMED & DANGEROUS</span>
              {/if}
              {#if poi.criminalProfile.escapeRisk === 'high'}
                <span class="danger-badge escape">🏃 HIGH ESCAPE RISK</span>
              {/if}
            </div>
          {/if}
        <!-- Contact Information -->
        {#if poi.contact.phones.length > 0 || poi.contact.emails.length > 0}
          <div class="contact-info">
            <h4>Contact Information</h4>
            {#if poi.contact.phones.length > 0}
              <div>📞 {poi.contact.phones[0]}{/if}
            {#if poi.contact.emails.length > 0}
              <div>📧 {poi.contact.emails[0]}{/if}
          {/if}
        <!-- AI Insights -->
        {#if poi.metadata.personality.traits.length > 0}
          <div class="ai-insights">
            <h4>AI Analysis</h4>
            <div class="traits">
              {#each Array.isArray(poi.metadata.personality.traits.slice(0, 3)) ? poi.metadata.personality.traits.slice(0, 3) : [] as trait}
                <span class="trait-badge">{trait}</span>
              {/each}
            </div>
            {#if poi.metadata.personality.psychologicalProfile}
              <div class="psych-profile">
                Stability: {Math.round(poi.metadata.personality.psychologicalProfile.stability * 100)}% | Cooperation {Math.round(
                  poi.metadata.personality.psychologicalProfile.cooperationLikelihood * 100
                )}%
              {/if}
          {/if}
      </div>
      <!-- Action Buttons -->
      <div class="poi-actions">
        {#if poi.role === 'suspect' || poi.role === 'fugitive'}
          <Button onclick={handleCreateWantedPoster} variant="destructive" size="sm">📋 Create Wanted Poster</Button>
          <Button onclick={handleAddToFBIMostWanted} variant="outline" size="sm">🎯 Add to FBI Most Wanted</Button>
          <Button onclick={handleRecordSighting} variant="outline" size="sm">👁️ Record Sighting</Button>
        {/if}
        <Button onclick={() => onEdit?.(poi)} variant="outline" size="sm">✏️ Edit</Button>
        <Button onclick={() => onDelete?.(poi.id)} variant="destructive" size="sm">🗑️ Delete</Button>
      </div>
    {:else}
      <!-- Compact view for lists -->
      <div class="poi-compact">
        <div class="compact-info">
          <div class="role-badge" style="background: {roleColor}">
            {poi.role}
          </div>
          {#if poi.criminalProfile && poi.criminalProfile.warrants.length > 0}
            <div class="warrant-count">
              {poi.criminalProfile.warrants.filter(w => w.status === 'active').length} active warrants
            {/if}
          <div class="last-updated">
            Updated: {new Date(poi.updatedAt).toLocaleDateString()}
          </div>
        </div>
      {/if}
  </CardContent>
</Card>
<style>
  .poi-card {
    position: relative;
    margin-bottom: 1rem;
    transition: all 0.2s ease;
  }
  .poi-card: hover {
    box-shadow: var(--enhanced-bits-shadow-lg);
    transform: translateY(-2px);
  }
  .poi-card.wanted {
    border-color: var(--enhanced-bits-error) !important;
    background: linear-gradient(135deg, #fff 0%, #ffebee 100%);
  }
  .poi-card.in_custody {
    border-color: var(--enhanced-bits-warning) !important;
    background: linear-gradient(135deg, #fff 0%, #fff8e1 100%);
  }
  .poi-header {
    display: flex;
    justify-content: space-betweenn;
    align-items: flex-start;
    gap: 1rem;
  }
  .poi-identity { flex: 1 }
  .aliases {
    font-size: 0.875rem;
    color: var(--enhanced-bits-textMuted);
    font-weight: normal;
  }
  .poi-role {
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 0.25rem;
  }
  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: var(--enhanced-bits-radius-md);
    font-size: 0.75rem;
    font-weight: bold;
    color: white;
    white-space: nowrap;
  }
  .poi-details {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .risk-section {
    padding: 0.75rem;
    background: var(--enhanced-bits-surface);
    border-radius: var(--enhanced-bits-radius-md);
    border: 1px solid var(--enhanced-bits-border);
  }
  .risk-level {
    font-weight: 600;
    font-size: 0.875rem;
  }
  .public-safety-warning {
    color: var(--enhanced-bits-error);
    font-weight: bold;
    font-size: 0.75rem;
    margin-top: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: var(--enhanced-bits-error);
    color: white;
    border-radius: var(--enhanced-bits-radius-sm);
    text-align: center;
  }
  .criminal-profile {
    background: #fff5f5;
    padding: 1rem;
    border-radius: var(--enhanced-bits-radius-md);
    border: 1px solid #fed7d7;
  }
  .criminal-profile h4 {
    color: var(--enhanced-bits-error);
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
  }
  .warrants {
    margin-bottom: 0.75rem;
  }
  .warrant {
    font-size: 0.875rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid #fed7d7;
  }
  .warrant:last-child {
    border-bottom: none;
  }
  .watch-lists {
    margin-bottom: 0.75rem;
  }
  .watch-list-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    margin: 0.25rem 0.25rem 0 0;
    background: var(--enhanced-bits-error);
    color: white;
    border-radius: var(--enhanced-bits-radius-sm);
    font-size: 0.75rem;
    font-weight: bold;
  }
  .watch-list-badge[data-priority='critical'] {
    background: var(--enhanced-bits-critical);
    animation: pulse 2s infinite;
  }
  .last-known {
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }
  .date {
    color: var(--enhanced-bits-textMuted);
    font-size: 0.75rem;
  }
  .danger-indicators {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .danger-badge {
    padding: 0.25rem 0.5rem;
    border-radius: var(--enhanced-bits-radius-sm);
    font-size: 0.75rem;
    font-weight: bold;
    color: white;
  }
  .danger-badge.armed {
    background: var(--enhanced-bits-critical);
    animation: pulse 2s infinite;
  }
  .danger-badge.escape {
    background: var(--enhanced-bits-warning);
  }
  .contact-info,
  .ai-insights {
    font-size: 0.875rem;
  }
  .contact-info h4,
  .ai-insights h4 {
    margin: 0 0 0.5rem 0;
    color: var(--enhanced-bits-primary);
  }
  .traits {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }
  .trait-badge {
    padding: 0.125rem 0.375rem;
    background: var(--enhanced-bits-ai);
    color: white;
    border-radius: var(--enhanced-bits-radius-sm);
    font-size: 0.75rem;
  }
  .psych-profile {
    font-size: 0.75rem;
    color: var(--enhanced-bits-textMuted);
  }
  .poi-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--enhanced-bits-border);
  }
  .poi-compact {
    display: flex;
    justify-content: space-betweenn;
    align-items: center;
  }
  .compact-info {
    display: flex;
    gap: 1rem;
    align-items: center;
    font-size: 0.875rem;
  }
  .role-badge {
    padding: 0.25rem 0.5rem;
    border-radius: var(--enhanced-bits-radius-sm);
    color: white;
    font-size: 0.75rem;
    font-weight: bold;
  }
  .warrant-count {
    color: var(--enhanced-bits-error);
    font-weight: 600;
  }
  .last-updated {
    color: var(--enhanced-bits-textMuted);
  }
  .compact {
    margin-bottom: 0.5rem;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
</style>
