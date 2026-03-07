<script lang="ts">
  import YoRHaHarvardButton from '$lib/components/ui/enhanced-bits/YoRHaHarvardButton.svelte';
  import YoRHaHarvardCard from '$lib/components/ui/enhanced-bits/YoRHaHarvardCard.svelte';
</script>

<svelte:head>
  <title>Grey Balance Test - YoRHa Harvard Components</title>
</svelte:head>

<main class="p-8 bg-enhanced-bg-primary min-h-screen">
  <div class="max-w-6xl mx-auto space-y-8">
    <!-- Page Header -->
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-enhanced-text-primary mb-4 yorha-harvard-title">
        Grey Balance Test
      </h1>
      <p class="text-enhanced-text-secondary text-lg">
        Testing NES-style grey balance with Harvard crimson components
      </p>
    </div>

    <!-- Button Variants Section -->
    <section class="space-y-6">
      <h2 class="text-2xl font-bold text-harvard-crimson mb-4">Button Variants</h2>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Original Variants -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-enhanced-text-primary">Original Colors</h3>
          <YoRHaHarvardButton variant="primary">Primary Harvard</YoRHaHarvardButton>
          <YoRHaHarvardButton variant="secondary">Secondary</YoRHaHarvardButton>
          <YoRHaHarvardButton variant="gaming">Gaming</YoRHaHarvardButton>
        </div>

        <!-- Grey Variants -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-enhanced-text-primary">Grey Balance</h3>
          <YoRHaHarvardButton variant="grey">Pure Grey</YoRHaHarvardButton>
          <YoRHaHarvardButton variant="crimson-grey">Crimson Grey</YoRHaHarvardButton>
          <YoRHaHarvardButton variant="terminal">Terminal</YoRHaHarvardButton>
        </div>

        <!-- Size Variations -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-enhanced-text-primary">Size & Effects</h3>
          <YoRHaHarvardButton variant="grey" size="sm">Small Grey</YoRHaHarvardButton>
          <YoRHaHarvardButton variant="crimson-grey" size="md" glowing>Glowing</YoRHaHarvardButton>
          <YoRHaHarvardButton variant="grey" size="lg" pixelated>Large Pixelated</YoRHaHarvardButton
          >
        </div>
      </div>
    </section>

    <!-- Card Variants Section -->
    <section class="space-y-6">
      <h2 class="text-2xl font-bold text-harvard-crimson mb-4">Card Variants</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Original Cards -->
        <YoRHaHarvardCard
          variant="default"
          title="Default Harvard"
          subtitle="Classic crimson styling"
        >
          <p class="text-enhanced-text-secondary">
            Traditional Harvard crimson card with academic styling.
          </p>
        </YoRHaHarvardCard>

        <YoRHaHarvardCard
          variant="gaming"
          title="Gaming Card"
          subtitle="YoRHa gaming theme"
          glowing
        >
          <p class="text-enhanced-text-secondary">
            Gaming-themed card with scan lines and effects.
          </p>
        </YoRHaHarvardCard>

        <YoRHaHarvardCard
          variant="legal"
          title="Legal Card"
          subtitle="Professional styling"
          bordered
        >
          <p class="text-enhanced-text-secondary">
            Professional legal document styling with borders.
          </p>
        </YoRHaHarvardCard>

        <!-- Grey Balance Cards -->
        <YoRHaHarvardCard variant="grey" title="Pure Grey" subtitle="NES-style neutral">
          <p class="text-enhanced-text-secondary">Pure grey card following NES color patterns.</p>
        </YoRHaHarvardCard>

        <YoRHaHarvardCard
          variant="crimson-grey"
          title="Crimson Grey Balance"
          subtitle="Balanced approach"
          glowing
        >
          <p class="text-enhanced-text-secondary">
            Balanced card combining Harvard crimson with grey tones.
          </p>
        </YoRHaHarvardCard>

        <YoRHaHarvardCard
          variant="terminal"
          title="Terminal Grey"
          subtitle="Monospace styling"
          scanLines
        >
          <p class="text-enhanced-text-secondary font-mono">
            Terminal-style card with monospace text and scan lines.
          </p>
        </YoRHaHarvardCard>
      </div>
    </section>

    <!-- Color Palette Reference -->
    <section class="space-y-6">
      <h2 class="text-2xl font-bold text-harvard-crimson mb-4">Color Palette Reference</h2>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-harvard-crimson p-4 rounded text-white text-center">
          <div class="font-bold">Harvard Crimson</div>
          <div class="text-sm opacity-90">#c41e3a</div>
        </div>

        <div class="bg-harvard-gold p-4 rounded text-black text-center">
          <div class="font-bold">Harvard Gold</div>
          <div class="text-sm opacity-70">#ffd700</div>
        </div>

        <div class="bg-nes-grey p-4 rounded text-white text-center">
          <div class="font-bold">NES Grey</div>
          <div class="text-sm opacity-90">#6a6a6a</div>
        </div>

        <div
          class="bg-enhanced-bg-secondary p-4 rounded text-enhanced-text-primary text-center border border-enhanced-border"
        >
          <div class="font-bold">Enhanced Secondary</div>
          <div class="text-sm opacity-70">#1a1a1a</div>
        </div>
      </div>
    </section>

    <!-- Comparison Section -->
    <section class="space-y-6">
      <h2 class="text-2xl font-bold text-harvard-crimson mb-4">Before vs After Comparison</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-enhanced-text-primary">Before: Crimson Heavy</h3>
          <div
            class="p-6 bg-gradient-to-br from-red-900/20 to-red-800/10 rounded-lg border border-red-700/30"
          >
            <div class="mb-4">
              <YoRHaHarvardButton variant="primary">Primary Action</YoRHaHarvardButton>
            </div>
            <YoRHaHarvardCard
              variant="default"
              title="Heavy Crimson"
              subtitle="Overwhelming red tones"
            >
              <p class="text-enhanced-text-secondary">
                Too much crimson can be overwhelming and doesn't match NES aesthetics.
              </p>
            </YoRHaHarvardCard>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-enhanced-text-primary">After: Grey Balance</h3>
          <div
            class="p-6 bg-gradient-to-br from-gray-800/20 to-red-900/5 rounded-lg border border-gray-600/30"
          >
            <div class="mb-4">
              <YoRHaHarvardButton variant="crimson-grey">Balanced Action</YoRHaHarvardButton>
            </div>
            <YoRHaHarvardCard
              variant="crimson-grey"
              title="Balanced Design"
              subtitle="Grey with crimson accents"
            >
              <p class="text-enhanced-text-secondary">
                Perfect balance of grey neutrals with Harvard crimson highlights.
              </p>
            </YoRHaHarvardCard>
          </div>
        </div>
      </div>
    </section>

    <!-- Interactive Demo -->
    <section class="space-y-6">
      <h2 class="text-2xl font-bold text-harvard-crimson mb-4">Interactive Demo</h2>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <YoRHaHarvardCard
          variant="grey"
          title="Click Me"
          subtitle="Pure grey interaction"
          onclick={() => alert('Pure grey card clicked!')}
        >
          <YoRHaHarvardButton variant="grey" onclick={() => alert('Grey button clicked!')}>
            Grey Action
          </YoRHaHarvardButton>
        </YoRHaHarvardCard>

        <YoRHaHarvardCard
          variant="crimson-grey"
          title="Balanced Click"
          subtitle="Crimson-grey balance"
          onclick={() => alert('Balanced card clicked!')}
          glowing
        >
          <YoRHaHarvardButton
            variant="crimson-grey"
            onclick={() => alert('Balanced button clicked!')}
          >
            Balanced Action
          </YoRHaHarvardButton>
        </YoRHaHarvardCard>

        <YoRHaHarvardCard
          variant="terminal"
          title="Terminal Interface"
          subtitle="Monospace grey theme"
          onclick={() => alert('Terminal card clicked!')}
          scanLines
        >
          <YoRHaHarvardButton
            variant="grey"
            pixelated
            onclick={() => alert('Terminal button clicked!')}
          >
            Execute Command
          </YoRHaHarvardButton>
        </YoRHaHarvardCard>
      </div>
    </section>
  </div>
</main>

<style>
  .yorha-harvard-title {
    text-shadow: 0 0 10px rgba(196, 30, 58, 0.3);
    background: linear-gradient(
      135deg,
      var(--enhanced-text-primary) 0%,
      var(--enhanced-accent) 50%,
      var(--enhanced-accent-grey) 100%
    );
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
</style>
