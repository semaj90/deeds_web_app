<script lang="ts">
  import { Dialog } from "bits-ui";
  import Button from '$lib/components/ui/Button.svelte';

  let open = $state(false);
  let selectedValue = $state('apple');

  const fruits = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'orange', label: 'Orange' }
  ];
</script>

<div class="min-h-screen bg-[#0e0d0b] px-4 py-6 sm:px-6 lg:px-8 text-sand">
  <div class="mx-auto max-w-6xl space-y-6">
    <header class="rounded-2xl border border-sand/10 bg-panel/80 p-6 shadow-[0_18px_48px_rgba(0,0,0,0.25)] backdrop-blur">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="mb-2 text-[0.72rem] uppercase tracking-[0.18em] text-sand/50">Dev Surface</p>
          <h1 class="text-3xl font-semibold text-sand sm:text-4xl">
            bits-ui + UnoCSS Demo
          </h1>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-sand/70">
            Headless UI components with Svelte 5 runes, laid out like a real product surface instead of a centered modal.
          </p>
        </div>
        <div class="inline-flex items-center rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent">
          Svelte 5 runes · bits-ui v2
        </div>
      </div>
    </header>

    <section class="rounded-2xl border border-sand/10 bg-panel/80 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
      <h2 class="mb-4 text-lg font-medium text-sand">Dev Demo Links</h2>
      <div class="flex flex-wrap gap-3">
        <a
          class="rounded-full border border-accent/20 bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          href="/rune-reactivity"
          data-sveltekit-preload-code="hover"
          data-sveltekit-preload-data="hover"
        >
          Rune Reactivity Smoke
        </a>
        <a
          class="rounded-full border border-sand/10 bg-sand/5 px-4 py-2 text-sm font-medium text-sand/80 transition-colors hover:bg-sand/10 hover:text-sand"
          href="/intent-chat"
          data-sveltekit-preload-code="hover"
          data-sveltekit-preload-data="hover"
        >
          Intent Chat Demo
        </a>
        <a
          class="rounded-full border border-sand/10 bg-sand/5 px-4 py-2 text-sm font-medium text-sand/80 transition-colors hover:bg-sand/10 hover:text-sand"
          href="/voice-chat-demo"
          data-sveltekit-preload-code="hover"
          data-sveltekit-preload-data="hover"
        >
          Voice Chat Demo
        </a>
        <a
          class="rounded-full border border-sand/10 bg-sand/5 px-4 py-2 text-sm font-medium text-sand/80 transition-colors hover:bg-sand/10 hover:text-sand"
          href="/cache-demo"
          data-sveltekit-preload-code="hover"
          data-sveltekit-preload-data="hover"
        >
          Cache Demo
        </a>
      </div>
    </section>

    <!-- Dialog Example -->
    <section class="rounded-2xl border border-sand/10 bg-panel/80 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
      <h2 class="mb-4 text-lg font-medium text-sand">Dialog Component</h2>

      <Button
        class="rounded-lg bg-accent px-6 py-3 font-medium text-panel transition-colors hover:bg-accent/90"
        onclick={() => open = true}
      >
        Open Dialog
      </Button>

      <Dialog.Root bind:open>
        <Dialog.Portal>
          <Dialog.Overlay class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
          <Dialog.Content
            class="fixed left-1/2 top-[42%] z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sand/10 bg-panel p-6 shadow-2xl"
          >
            <Dialog.Title class="mb-2 text-2xl font-semibold text-sand">
              Welcome to bits-ui!
            </Dialog.Title>
            <Dialog.Description class="mb-6 text-sm leading-6 text-sand/70">
              This is a fully accessible dialog built with bits-ui headless components
              and styled with UnoCSS utility classes.
            </Dialog.Description>

            <hr class="my-4 h-px border-0 bg-sand/10" />

            <div class="space-y-3 mb-6">
              <div class="rounded-xl border border-accent/15 bg-accent/8 p-3">
                <div class="flex items-center gap-2 text-accent">
                  <div class="i-carbon-checkmark-filled text-xl"></div>
                  <span>Svelte 5 Runes Compatible</span>
                </div>
              </div>
              <div class="rounded-xl border border-accent/15 bg-accent/8 p-3">
                <div class="flex items-center gap-2 text-accent">
                  <div class="i-carbon-checkmark-filled text-xl"></div>
                  <span>Fully Accessible (ARIA)</span>
                </div>
              </div>
              <div class="rounded-xl border border-accent/15 bg-accent/8 p-3">
                <div class="flex items-center gap-2 text-accent">
                  <div class="i-carbon-checkmark-filled text-xl"></div>
                  <span>UnoCSS Utility Styling</span>
                </div>
              </div>
            </div>

            <div class="flex gap-3">
              <Button
                class="flex-1 rounded-lg border border-sand/10 bg-sand/5 px-4 py-2 text-sand/80 transition-colors hover:bg-sand/10 hover:text-sand"
                onclick={() => open = false}
              >
                Cancel
              </Button>
              <Button
                class="flex-1 rounded-lg bg-accent px-4 py-2 font-medium text-panel transition-colors hover:bg-accent/90"
                onclick={() => {
                  open = false;
                  alert('Confirmed!');
                }}
              >
                Confirm
              </Button>
            </div>

            <Dialog.Close class="absolute right-4 top-4 rounded-lg p-2 transition-colors hover:bg-sand/10">
              <div class="i-carbon-close text-xl text-sand/50"></div>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>

    <!-- Select Example -->
    <section class="rounded-2xl border border-sand/10 bg-panel/80 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
      <h2 class="mb-4 text-lg font-medium text-sand">Select Component</h2>

      <div class="max-w-xs space-y-3">
        <label class="mb-2 block text-sm font-medium text-sand/70">
          Choose a fruit
        </label>
        <div class="flex flex-wrap gap-2">
          {#each fruits as fruit}
            <button
              type="button"
              class="rounded-lg border border-sand/10 bg-sand/5 px-3 py-2 text-sm capitalize text-sand/80 transition-colors hover:bg-sand/10 hover:text-sand"
              onclick={() => selectedValue = fruit.value}
            >
              {fruit.label}
            </button>
          {/each}
        </div>
        <div class="rounded-lg border border-sand/10 bg-sand/5 px-4 py-3 text-sm text-sand/80">
          Selected: <span class="capitalize text-sand">{selectedValue}</span>
        </div>
      </div>
    </section>

    <!-- Button Examples -->
    <section class="rounded-2xl border border-sand/10 bg-panel/80 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
      <h2 class="mb-4 text-lg font-medium text-sand">Button Variants</h2>

      <div class="flex flex-wrap gap-3">
        <Button
          class="rounded-lg bg-accent px-6 py-3 font-medium text-panel transition-colors hover:bg-accent/90"
        >
          Primary Button
        </Button>

        <Button
          class="rounded-lg border border-sand/15 bg-transparent px-6 py-3 font-medium text-sand/80 transition-colors hover:bg-sand/10 hover:text-sand"
        >
          Outline Button
        </Button>

        <Button
          class="rounded-lg border border-sand/10 bg-sand/5 px-6 py-3 font-medium text-sand/80 transition-colors hover:bg-sand/10 hover:text-sand"
        >
          Secondary Button
        </Button>

        <Button
          class="rounded-lg bg-red-500 px-6 py-3 font-medium text-panel transition-colors hover:bg-red-400"
        >
          Danger Button
        </Button>
      </div>
    </section>

    <!-- Separator Examples -->
    <section class="rounded-2xl border border-sand/10 bg-panel/80 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
      <h2 class="mb-4 text-lg font-medium text-sand">Separators</h2>

      <div class="space-y-4 rounded-xl border border-sand/10 bg-sand/5 p-6">
        <div class="text-sand/70">Section 1</div>
        <hr class="h-px border-0 bg-sand/10" />
        <div class="text-sand/70">Section 2</div>
        <hr class="h-px border-0 bg-accent/60" />
        <div class="text-sand/70">Section 3</div>
      </div>
    </section>

    <!-- UnoCSS Features -->
    <section class="rounded-2xl border border-sand/10 bg-panel/80 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
      <h2 class="mb-4 text-lg font-medium text-sand">UnoCSS Features</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="rounded-xl border border-sand/10 bg-sand/5 p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="i-carbon-data-view-alt text-2xl text-accent"></div>
            <h3 class="text-lg font-semibold text-sand">Utility-First</h3>
          </div>
          <p class="text-sand/70 text-sm">
            Compose designs directly in your markup using utility classes.
          </p>
        </div>

        <div class="rounded-xl border border-sand/10 bg-sand/5 p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="i-carbon-flash text-2xl text-accent"></div>
            <h3 class="text-lg font-semibold text-sand">Lightning Fast</h3>
          </div>
          <p class="text-sand/70 text-sm">
            On-demand atomic CSS generation with zero runtime.
          </p>
        </div>

        <div class="rounded-xl border border-sand/10 bg-sand/5 p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="i-carbon-code text-2xl text-accent"></div>
            <h3 class="text-lg font-semibold text-sand">Icon System</h3>
          </div>
          <p class="text-sand/70 text-sm">
            Use icons as classes with the `i-` prefix (Carbon, Lucide, etc.).
          </p>
        </div>

        <div class="rounded-xl border border-sand/10 bg-sand/5 p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="i-carbon-accessibility text-2xl text-accent"></div>
            <h3 class="text-lg font-semibold text-sand">Accessible</h3>
          </div>
          <p class="text-sand/70 text-sm">
            bits-ui handles ARIA attributes and keyboard navigation automatically.
          </p>
        </div>
      </div>
    </section>

    <!-- Code Example -->
    <section class="rounded-2xl border border-sand/10 bg-panel/80 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
      <h2 class="mb-4 text-lg font-medium text-sand">Usage Example</h2>

      <pre class="overflow-x-auto rounded-xl border border-sand/10 bg-[#11100e] p-6 text-sm text-sand/80">
        <code>{`<script lang="ts">
  import { Dialog } from "bits-ui";
  import Button from '$lib/components/ui/Button.svelte';
  let open = $state(false);
<` + `/script>

<Button
  class="px-6 py-3 bg-purple-600 hover:bg-purple-700
         text-black rounded-lg transition-colors"
  onclick={() => open = true}
>
  Open Dialog
</Button>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/50" />
    <Dialog.Content class="fixed left-1/2 top-1/2
                           -translate-x-1/2 -translate-y-1/2
                           bg-sand/10 rounded-xl p-6">
      <Dialog.Title class="text-2xl font-bold text-sand">
        Title
      </Dialog.Title>
      <Dialog.Description class="text-sand/70">
        Description
      </Dialog.Description>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>`}</code>
      </pre>
    </section>
  </div>
</div>
