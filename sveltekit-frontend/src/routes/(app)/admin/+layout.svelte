<!--
  Admin layout — singleton mount for the AI assistant.

  Every admin page inherits this layout, so the AI-analysis popup is
  mounted exactly ONCE. Any panel-level page can:

    - drop in `<SummarizeButton ... />` and the popup will render
    - call `adminChat.summarizePanel(...)` programmatically
    - call `adminChat.send(query, uiSnapshot)` from a keyboard shortcut

  The popup is hidden until `adminChat.activePanelId !== null`.

  TraceCopilotPanel is NOT mounted here — pages that want the floating
  chat (e.g. unified-indexing-studio) mount it inline in their own grid.
  The store (`adminChat`) is shared, so the chat state survives across
  routes regardless of which page mounts the panel.
-->
<script lang="ts">
  import AiAnalysisPopup from '$lib/components/admin/AiAnalysisPopup.svelte';
  import { adminChat } from '$lib/stores/admin-chat-assistant.svelte.js';
  import { onMount } from 'svelte';

  let { children } = $props();

  // Hydrate the chat session once per admin entry. Idempotent — safe across
  // route changes (the store keeps the session id between mounts).
  onMount(() => {
    if (!adminChat.hasSession) adminChat.loadSessions();
  });
</script>

{@render children()}

<!-- ── Layout-level singleton. Do NOT duplicate in child pages. ──────── -->
<AiAnalysisPopup />
