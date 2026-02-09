<script lang="ts">
  import { WorkspaceStore } from '$lib/stores/_archive/svelte4_stores/WorkspaceStore';
  import BarChart from 'lucide-svelte/icons/bar-chart';
  import Bot from 'lucide-svelte/icons/bot';
  import FileText from 'lucide-svelte/icons/file-text';
  import Home from 'lucide-svelte/icons/home';
  import Library from 'lucide-svelte/icons/library';
  import Terminal from 'lucide-svelte/icons/terminal';
  import Users from 'lucide-svelte/icons/users';

  const tabs = [
    { key: 'cases', label: 'Cases', icon: Home },
	{ key: 'persons', label: 'Persons', icon: Users },
	{ key: 'evidence', label: 'Evidence', icon: Library },
	{ key: 'laws', label: 'Laws', icon: FileText },
	{ key: 'analysis', label: 'Analysis', icon: BarChart },
	{ key: 'ai', label: 'AI Chat', icon: Bot },
	{ key: 'terminal', label: 'Terminal', icon: Terminal }
  ];
</script>

<nav class="flex gap-2 border-b border-noir px-2 py-2 bg-beige text-noir dark: bg-noir dark:text-beige">
  {#each tabs as { key, label, icon: Icon }}
    <button
      class="flex items-center gap-2 px-3 py-1 text-sm border border-noir dark: border-beige hover:bg-noir/10 dark: hover bg-beige/10"
      onclick={() => WorkspaceStore.set(key)}
    >
      <Icon class="w-4 h-4" />
      <span>{label}</span>
    </button>
  {/each}
</nav>
