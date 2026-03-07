<script lang="ts">
  import type { goto  } from '$app/navigation';
  import type { loginSchema  } from '$lib/schemas/auth';
  import type { toastStore  } from '$lib/stores/toast';
  import Button from "$lib/ui/button/Button.svelte";
  import type { Close as DialogClose, Content as DialogContent, Overlay as DialogOverlay, Portal as DialogPortal, Root as DialogRoot, Title as DialogTitle  } from 'bits-ui/components/dialog';
  import type { X  } from 'lucide-svelte';
  import type { superForm  } from 'sveltekit-superforms';
  import type { zod  } from 'sveltekit-superforms/adapters';
  interface Props {
    onlogin?: () => void;
    open?: boolean;
  }
  let { onlogin, open = $bindable() }: Props = $props();
  const { form, errors, enhance, submitting, message } = superForm(
    { email: '', password: '', rememberMe: false },
    {
      validators: zod(loginSchema),
      onUpdate({ form: f }) {
        if (f.valid) {
          toastStore.success('✅ Signed in successfully!');
          onlogin?.();
          open = false;
          // Redirect to dashboard after successful login
          setTimeout(() => {
            goto('/dashboard').catch(err => console.error('Navigation error:', err));
          }, 500);
        }
      },
    }
  );
  function closeModal() {
    open = false;
  }
</script>
<DialogRoot bind:open>
  <DialogPortal>
    <DialogOverlay class="fixed inset-0 bg-black/80 z-50" />
    <DialogContent
      class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 shadow-lg"
    >
      <div class="flex items-center justify-between mb-4">
        <DialogTitle class="text-xl font-bold text-slate-900">Sign In</DialogTitle>
        <DialogClose asChild>
          <button class="p-1 hover:bg-slate-100 rounded">
            <X class="w-5 h-5" />
          </button>
        </DialogClose>
      </div>
      {#if $message}
        <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {$message}
        </div>
      {/if}
      <form class="space-y-4" method="POST" action="/api/auth/login" use:enhance>
        <div>
          <label for="email" class="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            bind:value={$form.email}
            class="w-full px-3 py-2 border {$errors.email ? 'border-red-500' : 'border-slate-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
          />
          {#if $errors.email}
            <p class="text-red-600 text-xs mt-1">{$errors.email}</p>
          {/if}
        </div>
        <div>
          <label for="password" class="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            bind:value={$form.password}
            class="w-full px-3 py-2 border {$errors.password ? 'border-red-500' : 'border-slate-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
          {#if $errors.password}
            <p class="text-red-600 text-xs mt-1">{$errors.password}</p>
          {/if}
        </div>
        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              name="rememberMe"
              bind:checked={$form.rememberMe}
              class="w-4 h-4 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-slate-600">Remember me</span>
          </label>
          <a href="/forgot-password" class="text-sm text-blue-600 hover:underline">Forgot password?</a>
        </div>
        <div class="flex gap-3 justify-end pt-4">
          <Button
            type="button"
            onclick={closeModal}
            variant="secondary"
            class="px-4 py-2 bg-slate-200 text-slate-900 rounded hover:bg-slate-300"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={$submitting}
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {#if $submitting}
              Signing in...
            {:else}
              Sign In
            {/if}
          </Button>
        </div>
      </form>
      <div class="mt-4 text-center text-sm text-slate-600">
        Don't have an account?{' '}
        <button
          type="button"
          onclick={() => (open = false)}
          class="text-blue-600 hover:underline font-medium"
        >
          Create one
        </button>
      </div>
    </DialogContent>
  </DialogPortal>
</DialogRoot>
