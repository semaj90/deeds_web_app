<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    era?: "8bit" | "16bit" | "32bit" | "64bit" | "modern";
    scanlines?: boolean;
    crtEffect?: boolean;
    children?: Snippet;
  }

  let {
    era = "16bit",
    scanlines = true,
    crtEffect = false,
    children,
  }: Props = $props();

  const eraConfig: Record<string, { palette: string[]; pixelSize: number; fontFamily: string; label: string }> = {
    "8bit": {
      palette: ["#000000", "#fcfcfc", "#f83800", "#7c7c7c"],
      pixelSize: 4,
      fontFamily: '"Press Start 2P", monospace',
      label: "NES / 8-Bit Era",
    },
    "16bit": {
      palette: ["#1a1a2e", "#e0e0ff", "#4040c0", "#40a040"],
      pixelSize: 2,
      fontFamily: '"Press Start 2P", monospace',
      label: "SNES / 16-Bit Era",
    },
    "32bit": {
      palette: ["#0d0d1a", "#c0c0d0", "#6060a0", "#a06060"],
      pixelSize: 1,
      fontFamily: '"Courier New", monospace',
      label: "PS1 / 32-Bit Era",
    },
    "64bit": {
      palette: ["#0a0a14", "#d0d0e0", "#3080c0", "#c08030"],
      pixelSize: 1,
      fontFamily: '"Segoe UI", sans-serif',
      label: "N64 / 64-Bit Era",
    },
    "modern": {
      palette: ["#0f0f1a", "#f0f0ff", "#6c63ff", "#00d4aa"],
      pixelSize: 1,
      fontFamily: '"Inter", sans-serif',
      label: "Modern Era",
    },
  };

  let config = $derived(eraConfig[era] ?? eraConfig["16bit"]);
</script>

<div
  class="gaming-provider"
  style="
    --gp-bg: {config.palette[0]};
    --gp-text: {config.palette[1]};
    --gp-accent: {config.palette[2]};
    --gp-secondary: {config.palette[3]};
    --gp-font: {config.fontFamily};
    --gp-pixel: {config.pixelSize}px;
  "
  class:scanlines
  class:crt={crtEffect}
>
  <div class="era-badge">
    {config.label}
  </div>
  <div class="provider-content">
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>

<style>
  .gaming-provider {
    background: var(--gp-bg);
    color: var(--gp-text);
    font-family: var(--gp-font);
    border: 2px solid var(--gp-accent);
    border-radius: 4px;
    padding: 1rem;
    position: relative;
    overflow: hidden;
  }

  .era-badge {
    position: absolute;
    top: 0;
    right: 0;
    background: var(--gp-accent);
    color: var(--gp-bg);
    font-size: 0.6rem;
    padding: 2px 8px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .provider-content {
    position: relative;
    z-index: 1;
  }

  .scanlines::after {
    content: "";
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.08) 2px,
      rgba(0, 0, 0, 0.08) 4px
    );
    pointer-events: none;
    z-index: 2;
  }

  .crt {
    border-radius: 12px;
    box-shadow:
      inset 0 0 60px rgba(0, 0, 0, 0.3),
      0 0 20px rgba(100, 100, 255, 0.1);
  }

  .crt::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse at center,
      transparent 50%,
      rgba(0, 0, 0, 0.4) 100%
    );
    pointer-events: none;
    z-index: 3;
  }
</style>
