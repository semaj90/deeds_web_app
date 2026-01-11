<!--
  Enhanced Bits - Profile Container
  Reusable container component for profile-style pages
-->
<script lang="ts">
  interface Props {
    maxWidth?: string;
    padding?: string;
    children?: any;
  }
  let { maxWidth = '800px', padding = '24px', children }: Props = $props();
</script>

<div class="profile-container" style="max-width: {maxWidth} padding: {padding}">
  <slot />
</div>

<style>
  .profile-container {
    margin: 0 auto
    background: var(--surface, #ffffff);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.1))}
  @media (max-width: 768px) {
    .profile-container {
      margin: 16px
      padding: 16px !important}
  }
</style>
