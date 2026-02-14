<script lang="ts">
  import type { Case } from '$lib/types/api';

  interface Props {
    cases: Case[];
  }

  let { cases = [] }: Props = $props();

  let stats = $derived({
    total: cases.length,
    active: cases.filter(c => c.status === 'ACTIVE').length,
    pending: cases.filter(c => c.status === 'PENDING').length,
    closed: cases.filter(c => c.status === 'CLOSED').length,
    recentlyUpdated: cases.filter(c => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return c.updatedAt && new Date(c.updatedAt) > weekAgo;
    }).length
  });
</script>

<div class="case-stats container mx-auto">
  <div class="stat-card">
    <div class="stat-value">{stats.total}</div>
    <div class="stat-label">Total Cases</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{stats.active}</div>
    <div class="stat-label">Active</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{stats.pending}</div>
    <div class="stat-label">Pending</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{stats.closed}</div>
    <div class="stat-label">Closed</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{stats.recentlyUpdated}</div>
    <div class="stat-label">Recently Updated</div>
  </div>
</div>

<style>
  .case-stats {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .stat-card {
    flex: 1;
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 8px;
    text-align: center;
    border: 1px solid #e9ecef;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #495057;
  }

  .stat-label {
    font-size: 0.875rem;
    color: #6c757d;
    margin-top: 0.25rem;
  }
</style>