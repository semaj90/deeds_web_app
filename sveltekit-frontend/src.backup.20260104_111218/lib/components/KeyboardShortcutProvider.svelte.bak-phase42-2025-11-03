<script lang="ts">
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  // simple default stores - replace or extend with your app's store wiring'
  export const shortcutCategories = writable([
    {
      id: 'general',
      name: 'General',
      shortcuts: [
        { id: 'search', description: 'Quick search', keys: ['Ctrl+K'] },
        { id: 'help', description: 'Show help', keys: ['Ctrl+H'] },
      ],
    },
  ]);
  export const isRemoteConnected = writable(false);
  // provide stores via context for components that use getContext
  setContext('shortcutCategories', shortcutCategories);
  setContext('isRemoteConnected', isRemoteConnected);
</script>

<slot />
