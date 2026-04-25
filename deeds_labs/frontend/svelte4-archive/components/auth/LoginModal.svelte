<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import Button from '$lib/components/ui/Button.svelte';
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import X from '@lucide/svelte/icons/x';
  import { goto } from '$app/navigation';
  import { superForm } from 'sveltekit-superforms/client';
  import { zod4 as zod } from 'sveltekit-superforms/adapters';
  import { loginSchema } from '$lib/schemas/auth';

  interface Props {
    open?: boolean;
    onlogin?: () => void;
  }

  let { open = $bindable(false), onlogin }: Props = $props();

  const { form, errors, enhance, submitting, message } = superForm(
    { email: '', password: '', rememberMe: false },
    {
      validators: zod(loginSchema),
      onUpdate({ form: f }) {
        if (f.valid) {
          console.log('Signed in successfully!');
          onlogin?.();
          open = false;
          setTimeout(() => {
            goto('/dashboard').catch(err => console.error('Navigation error:', err));
          }, 500);
        }
      }
    }
  );

  function closeModal() {
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title>Sign In</Dialog.Title>
      <Dialog.Description>Enter your email and password to sign in.</Dialog.Description>
      <Dialog.Close class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X class="h-4 w-4" />
        <span class="sr-only">Close</span>
      </Dialog.Close>
    </Dialog.Header>

    {#if $message}
      <div class="mb-4 p-3 bg-danger/5 border border-danger/20 rounded text-danger text-sm">
        {$message}
      </div>
    {/if}

    <form method="POST" action="/api/auth/login" use:enhance class="grid gap-4 py-4">
      <div class="grid gap-2">
        <Label for="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          bind:value={$form.email}
          class={$errors.email ? 'border-danger' : ''}
          placeholder="name@example.com"
        />
        {#if $errors.email}
          <p class="text-xs text-danger">{$errors.email}</p>
        {/if}
      </div>

      <div class="grid gap-2">
        <Label for="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          bind:value={$form.password}
          class={$errors.password ? 'border-danger' : ''}
        />
        {#if $errors.password}
          <p class="text-xs text-danger">{$errors.password}</p>
        {/if}
      </div>

      <div class="flex items-center space-x-2">
        <Checkbox
          id="rememberMe"
          name="rememberMe"
          class=""
          bind:checked={$form.rememberMe}
        />
        <Label for="rememberMe" class="text-sm font-normal">Remember me</Label>
        <div class="flex-1 text-right">
             <a href="/forgot-password" class="text-xs text-primary hover:underline">Forgot password?</a>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <Button type="button" variant="ghost" onclick={closeModal}>Cancel</Button>
        <Button type="submit" disabled={$submitting}>
          {#if $submitting} Signing in... {:else} Sign In {/if}
        </Button>
      </div>
    </form>

    <div class="mt-2 text-center text-sm">
        Don't have an account? <button type="button" onclick={() => { open = false; goto('/register'); }} class="text-primary hover:underline">Create one</button>
    </div>
  </Dialog.Content>
</Dialog.Root>
