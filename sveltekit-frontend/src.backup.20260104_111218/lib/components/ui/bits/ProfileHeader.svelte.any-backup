<!--
  Enhanced Bits - Profile Header
  Centered header section for profile pages
-->
<script lang="ts">
  interface Props {
    title?: string;
    subtitle?: string;
    centered?: boolean;
    children?: any;
  }
  let { title, subtitle, centered = true, children }: Props = $props();
</script>

<div class="profile-header" class:centered>
  {#if children}
    {@render children()}
  {:else}
    {#if title}
      <h1>{title}</h1>
    {/if}
    {#if subtitle}
      <p>{subtitle}</p>
    {/if}
  {/if}
</div>

<style>
  .profile-header {
    margin-bottom: 32px
    padding-bottom: 24px
    border-bottom: 1px solid var(--border, #e5e7eb)}
  .profile-header.centered {
    text-align: center}
  .profile-header h1 {
    font-size: 32px
    font-weight: 700
    color: var(--text-primary, #111827);
    margin-bottom: 8px
    line-height: 1.2}
  .profile-header p {
    color: var(--text-secondary, #6b7280);
    font-size: 16px
    line-height: 1.5}
  @media (max-width: 768px) {
    .profile-header h1 {
      font-size: 24px}
    .profile-header p {
      font-size: 14px}
  }
</style>
