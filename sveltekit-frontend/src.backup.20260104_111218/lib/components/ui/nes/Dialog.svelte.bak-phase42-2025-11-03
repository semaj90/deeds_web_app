<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    open?: boolean;
    title?: string;
    message?: string;
    onclose?: () => void;
    onConfirm?: () => void;
    onCancel?: () => void;
    children?: Snippet;
  }
  let {
    open = false,
    title = 'Confirm',
    message = 'Are you sure?',
    onclose = () => {},
    onConfirm = () => {},
    onCancel = () => {},
    children,
  }: Props = $props();
</script>

{#if open}
  <dialog class="nes-dialog" open>
    <form method="dialog">
      <p class="title">{title}</p>
      {#if children}
        {@render children()}
      {:else}
        <p>{message}</p>
      {/if}
      <menu class="dialog-menu">
        <button type="button" class="nes-btn" onclick={onCancel || onclose}>Cancel</button>
        <button type="button" class="nes-btn is-primary" onclick={onConfirm || onclose}>OK</button>
      </menu>
    </form>
  </dialog>
{/if}
