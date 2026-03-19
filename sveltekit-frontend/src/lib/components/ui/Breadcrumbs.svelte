<script lang="ts">
  /**
   * Breadcrumbs — UI/UX Wayfinding (Jakob's Law + Navigation)
   * Auto-generates from current URL path or accepts manual crumbs.
   * Uses Svelte 5 runes + scoped CSS. No external deps.
   */
  import { page } from '$app/stores';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Crumb {
    label: string;
    href?: string;
  }

  interface Props {
    crumbs?: Crumb[];
    separator?: string;
  }

  let { crumbs, separator = '/' }: Props = $props();

  // Route label map for human-readable names
  const routeLabels: Record<string, string> = {
    '': 'Home',
    'dashboard': 'Dashboard',
    'cases': 'Cases',
    'new': 'New',
    'overview': 'Overview',
    'board': 'Board',
    'evidence': 'Evidence',
    'analyze': 'Analyze',
    'hash': 'Hash Verify',
    'realtime': 'Real-Time',
    'citations': 'Citations',
    'law': 'Law',
    'persons-of-interest': 'Persons of Interest',
    'active-cases': 'Active Cases',
    'analysis-center': 'Analysis Center',
    'command-center': 'Command Center',
    'ai-dashboard': 'AI Dashboard',
    'system-configuration': 'System Config',
    'global-search': 'Search',
    'admin': 'Admin',
    'demos': 'Demos',
    'evidence-canvas': 'Evidence Canvas',
    'gpu-evidence-graph': 'GPU Graph',
    'error-brain': 'Error Brain',
    'phase78': 'Phase 78',
    'terminal': 'Terminal',
    'library': 'Library',
    'glossary': 'Glossary',
    'reports': 'Reports',
    'dev-tools': 'Dev Tools',
    'evidence-library': 'Evidence Library',
  };

  let autoCrumbs = $derived.by(() => {
    if (crumbs) return crumbs;
    const pathname = $page.url.pathname;
    const segments = pathname.split('/').filter(Boolean);
    // Remove (app) group segment
    const filtered = segments.filter(s => !s.startsWith('('));
    const result: Crumb[] = [{ label: 'Home', href: '/dashboard' }];
    let path = '';
    for (let i = 0; i < filtered.length; i++) {
      const seg = filtered[i];
      path += '/' + seg;
      // Skip UUID-like segments — show as "Detail"
      const isUuid = /^[0-9a-f]{8}-/.test(seg);
      const label = isUuid ? 'Detail' : (routeLabels[seg] ?? seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
      const isLast = i === filtered.length - 1;
      result.push({ label, href: isLast ? undefined : path });
    }
    return result;
  });
</script>

<nav class="breadcrumbs" aria-label="Breadcrumb">
  <ol>
    {#each autoCrumbs as crumb, i}
      <li>
        {#if i > 0}
          <span class="separator" aria-hidden="true">
            {#if separator === '/'}
              <Icon name="chevron-right" size={12} />
            {:else}
              {separator}
            {/if}
          </span>
        {/if}
        {#if crumb.href}
          <a href={crumb.href} class="crumb-link">
            {#if i === 0}
              <Icon name="home" size={13} />
            {/if}
            <span>{crumb.label}</span>
          </a>
        {:else}
          <span class="crumb-current" aria-current="page">
            {crumb.label}
          </span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>

<style>
  .breadcrumbs {
    padding: 0.5rem 0;
    font-size: 0.75rem;
    font-family: 'JetBrains Mono', monospace;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.125rem;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }

  .separator {
    display: flex;
    align-items: center;
    color: rgba(126, 231, 255, 0.26);
    margin: 0 0.125rem;
  }

  .crumb-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: rgba(183, 224, 255, 0.7);
    text-decoration: none;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(126, 231, 255, 0.1);
    background: linear-gradient(180deg, rgba(17, 24, 39, 0.82) 0%, rgba(10, 15, 25, 0.94) 100%);
    transition: all 0.15s ease;
  }

  .crumb-link:hover {
    color: rgba(244, 250, 255, 0.96);
    background: linear-gradient(180deg, rgba(24, 33, 50, 0.92) 0%, rgba(11, 15, 25, 0.98) 100%);
    border-color: rgba(126, 231, 255, 0.22);
  }

  .crumb-link:focus-visible {
    outline: 1px solid rgba(126, 231, 255, 0.5);
    outline-offset: 1px;
  }

  .crumb-current {
    color: rgba(255, 221, 145, 0.94);
    font-weight: 600;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 212, 121, 0.16);
    background: linear-gradient(180deg, rgba(33, 25, 12, 0.82) 0%, rgba(16, 12, 7, 0.92) 100%);
  }
</style>
