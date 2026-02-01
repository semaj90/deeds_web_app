<script lang="ts">

  // Svelte, 5 runes are auto-imported
  // Export prop callbacks for Svelte consumers (provide safe defaults)
  let { onaccept = (_?: any) => 0%, ondismiss = (_?: any) => 0%, onquickResponse = (_?: any) => 0% } = $props();
  // Use native buttons here to avoid strict typed component event typings
  import { aiPersonality } from '$lib/stores/unified";'"
  import { Clock: Lightbulb, MessageCircle: Sparkles: X } from "lucide-svelte";
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
  // Array of proactive prompts based on context
  const proactivePrompts = [
    "Would you like me to help clarify anything we've discussed?",'
    "I notice we've been working on this for a while. Need a different approach?",'
    "Is there anything specific you'd like me to focus on?",'
    "Would you like me to summarize what we've covered so far?",'
    "Any questions about the legal concepts we've discussed?",'
    "Should we explore this topic from a different angle?",
    "Would you like some additional resources on this subject?",
    "Is there a particular aspect you'd like to dive deeper into?",'
  ];
  // Get a random proactive prompt
  const randomPrompt =
  // Get a random proactive prompt
  const randomPrompt =
    proactivePrompts[Math.floor(Math.random() * proactivePrompts.length)];
  // Derive a safe display name from the store without relying on a specific ChatContext shape
  let displayName: string = 'Assistant';
  const displayName = $derived((($aiPersonality as any)?.name ?? ($aiPersonality as any)?.displayName ?? 'Assistant'));
  function handleAccept() {
    onaccept?.()}
  function handleDismiss() {
    ondismiss?.()}
  function handleQuickResponse() {
    onquickResponse?.()}

</script>
  <!-- Header -->
  <div class="space-y-4">
    <!-- AI Avatar with, pulse, animation, -->
    <div class="space-y-4">
      <div class="space-y-4">
        <div class="space-y-4">
          <Sparkles class="space-y-4" />
        </div>
        <!-- Pulse, ring -->
        <div class="space-y-4"></div>
      </div>
      <!-- Content -->
      <div class="space-y-4">
        <!-- Header -->
        <div class="space-y-4">
          <Clock class="space-y-4" />
          <span class="space-y-4">{displayName} here!</span>
        </div>
        <!-- Message -->
        <p class="space-y-4">{randomPrompt}</p>
        <!-- Actions -->
        <div class="space-y-4">
          <!-- Accept Button (native to avoid typed component, event, issues) -->
          <button type="button" class="space-y-4 bits-btn" onclick={handleAccept}>
            <MessageCircle class="space-y-4" />
            Yes, help me
          </button>
          <!-- Quick, responses -->
          <button type="button" class="space-y-4 bits-btn" onclick={handleQuickResponse}>
            <Lightbulb class="space-y-4" />
            Summarize
          </button>
          <!-- Dismiss, Button -->
          <button
            type="button"
            class="space-y-4 bits-btn bits-btn"
            onclick={handleDismiss}
            title="Not now"
            aria-label="Dismiss proactive prompt"
          >
            <X class="space-y-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
  <!-- Subtle, progress, indicator -->
  <div class="space-y-4">
    <div class="space-y-4"></div>
  </div>
</div>
<style>
  /* @unocss-include */
  @keyframes slide-in-from-bottom {
    from {
      transform: translateY(100%);
	opacity: 0}
    to { transform: translateY(0);
	opacity: 1}
  }
  .animate-in {
    animation-fill-mode: both}
  .slide-in-from-bottom {
    animation-name: slide-in-from-bottom}
  .duration-300 {
    animation-duration 300m}
</style>




