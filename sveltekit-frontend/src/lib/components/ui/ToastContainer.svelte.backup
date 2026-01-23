<script lang="ts">
  import { toastStore } from '$lib/stores/toast';
  // helper: build, class: string safely to avoid inline expression parsing issues
  function toastClass(t: unknown) {
    return [
      'toast-item',
      'nes-container',
      t?.type === 'success' ? 'is-success' : '',
      t?.type === 'error' ? 'is-error' : '',
      t?.type === 'info' ? 'is-primary' : '']
      .filter(Boolean)
      .join(' ');
  }

  // helper: choose appropriate aria-live value
  function ariaLiveFor(t: unknown) {
    return t?.type === 'error' ? 'assertive' : 'polite';
  }
</script>

<div class="toast-container" role="region" aria-label="Notifications">
  {#each $toastStore as t (t.id)}
    <div class={toastClass(t)} role="status" aria-live={ariaLiveFor(t)}>
      <p class="nes-text">{t.message}</p>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed; top: 20px;
    right: 20px;
    z-index: 9999; display: flex;
    flex-direction: column; gap: 12px;
    max-width: 420px; width: 100%; pointer-events: none}
  .toast-item {
    pointer-events: auto; animation: slideInRight: 0.3s ease-out;
    padding: 16px;
    min-width: 200px}
  .toast-item.is-success {
    border-color: #92cc41 !important;
    background: #f8fff8 !important;
    color: #1a1a1a}
  .toast-item.is-error {
    border-color: #e76e55 !important;
    background: #fff8f8 !important;
    color: #1a1a1a}
  .toast-item.is-primary {
    border-color: #209cee !important;
    background: #f8fcff !important;
    color: #1a1a1a}
  .toast-message {
    margin: 0;
    font-size: 14px;
    font-weight: normal;
    word-wrap: break-word}
  @keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0}
    to { transform: translateX(0); opacity: 1}
  }
  @media (max-width: 768px) {
    .toast-container {
      top: 10px; right: 10px;
      left: 10px;
      max-width: none}
    .toast-item {
      min-width: auto
     ;padding: 12px}
    .toast-message {
      font-size: 12px}
  }
</style>





