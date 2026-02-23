<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    variant?: "primary" | "secondary" | "danger" | "success";
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
    onclick?: () => void;
    children?: Snippet;
  }

  let {
    variant = "primary",
    size = "md",
    disabled = false,
    onclick,
    children,
  }: Props = $props();

  const palettes: Record<string, { bg: string; border: string; text: string; shadow: string }> = {
    primary: { bg: "#4040c0", border: "#2020a0", text: "#e0e0ff", shadow: "#6060e0" },
    secondary: { bg: "#40a040", border: "#208020", text: "#e0ffe0", shadow: "#60c060" },
    danger: { bg: "#c04040", border: "#a02020", text: "#ffe0e0", shadow: "#e06060" },
    success: { bg: "#c0a020", border: "#a08010", text: "#ffffe0", shadow: "#e0c040" },
  };

  let palette = $derived(palettes[variant] ?? palettes.primary);

  let sizeClasses = $derived(
    size === "sm" ? "px-3 py-1 text-xs" :
    size === "lg" ? "px-6 py-3 text-base" :
    "px-4 py-2 text-sm"
  );

  let pressed = $state(false);
</script>

<button
  class="snes-btn {sizeClasses}"
  style="
    --snes-bg: {palette.bg};
    --snes-border: {palette.border};
    --snes-text: {palette.text};
    --snes-shadow: {palette.shadow};
  "
  {disabled}
  onclick={() => { if (!disabled && onclick) onclick(); }}
  onmousedown={() => (pressed = true)}
  onmouseup={() => (pressed = false)}
  onmouseleave={() => (pressed = false)}
  class:pressed
>
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .snes-btn {
    font-family: "Press Start 2P", "Courier New", monospace;
    background: var(--snes-bg);
    color: var(--snes-text);
    border: 3px solid var(--snes-border);
    border-radius: 0;
    cursor: pointer;
    image-rendering: pixelated;
    box-shadow:
      inset -2px -2px 0 var(--snes-border),
      inset 2px 2px 0 var(--snes-shadow),
      4px 4px 0 rgba(0, 0, 0, 0.4);
    transition: transform 0.05s, box-shadow 0.05s;
    text-transform: uppercase;
    letter-spacing: 1px;
    position: relative;
  }

  .snes-btn:hover:not(:disabled) {
    filter: brightness(1.15);
  }

  .snes-btn.pressed,
  .snes-btn:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow:
      inset -2px -2px 0 var(--snes-border),
      inset 2px 2px 0 var(--snes-shadow),
      1px 1px 0 rgba(0, 0, 0, 0.4);
  }

  .snes-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    filter: grayscale(0.6);
  }
</style>