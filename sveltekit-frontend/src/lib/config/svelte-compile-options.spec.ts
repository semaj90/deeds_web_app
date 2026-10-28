// @vitest-environment node
// Regression: SvelteKit's own Svelte 5 components must be compiled in runes mode.
// svelte.config.js forces `runes: false` for node_modules packages that still use Svelte 4 syntax (e.g. lucide-svelte). That override must not
// reach @sveltejs/kit: its default layout (svelte-5/layout.svelte) uses `$props()`, and legacy mode turns `$props` into a store lookup,
// throwing "props is not defined" on any route whose layout level has a +layout.ts but no +layout.svelte (e.g. /demos/*).
import { describe, expect, it } from 'vitest';
import config from '../../../svelte.config.js';

type DynamicCompileOptions = (input: { filename: string }) => { runes?: boolean } | undefined;
const dynamicCompileOptions = (config as { vitePlugin: { dynamicCompileOptions: DynamicCompileOptions } }).vitePlugin.dynamicCompileOptions;
const NM = 'C:/repo/sveltekit-frontend/node_modules';

describe('svelte.config.js dynamicCompileOptions', () => {
  it('does not force legacy mode on the SvelteKit default layout', () => {
    expect(dynamicCompileOptions({ filename: `${NM}/@sveltejs/kit/src/runtime/components/svelte-5/layout.svelte` })).toBeUndefined();
  });
  it('does not force legacy mode on svelte-sonner or bits-ui', () => {
    expect(dynamicCompileOptions({ filename: `${NM}/svelte-sonner/dist/Toaster.svelte` })).toBeUndefined();
    expect(dynamicCompileOptions({ filename: `${NM}/bits-ui/dist/bits/dialog/components/dialog.svelte` })).toBeUndefined();
  });
  it('still forces legacy mode on other node_modules Svelte 4 packages', () => {
    expect(dynamicCompileOptions({ filename: `${NM}/lucide-svelte/dist/Icon.svelte` })).toEqual({ runes: false });
  });
  it('leaves first-party files alone', () => {
    expect(dynamicCompileOptions({ filename: 'C:/repo/sveltekit-frontend/src/lib/components/ui/Icon.svelte' })).toBeUndefined();
  });
});
