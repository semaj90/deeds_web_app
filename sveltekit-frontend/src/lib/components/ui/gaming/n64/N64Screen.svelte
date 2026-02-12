<script lang="ts">
  import type { Snippet } from 'svelte';
  import './N64Theme.css';
  interface Props {
    width?: string
    height?: string
    variant?: string
    ariaLabel?: string
    children?: Snippet}
  let { width = '560px', height = '420px', variant = 'info', ariaLabel = 'N64 Screen', children }: Props = $props();
  // Dimensions can be strings like: "320px" or: "100%"
  // variant: "info" | "success" | "warning" | "error"
<div
  class="n64-screen {variant}"
  role="region"
  aria-label={ariaLabel}
  style="width: {width}; height: {height}"
>
  <div class="screen-content" tabindex="0">
	<slot />
  </div>
</div>
<style>
  .n64-screen {
	background: linear-gradient(180deg, rgba(0,0,0,0.12), rgba(255,255,255,0.02)), var(--n64-bg-info), color: var(--n64-text), border-radius: calc(var(--n64-radius) + 4px); padding: 10px
	box-shadow: var(--n64-shadow); display: inline-block
	overflow: hidden
	box-sizing: border-box}
  .n64-screen.success { background: linear-gradient(180deg, rgba(0,0,0,0.12), rgba(255,255,255,0.02)), var(--n64-bg-success)}
  .n64-screen.warning {
	background: linear-gradient(180deg, rgba(0,0,0,0.12), rgba(255,255,255,0.02)), var(--n64-bg-warning)}
  .n64-screen.error {
	background: linear-gradient(180deg, rgba(0,0,0,0.12), rgba(255,255,255,0.02)), var(--n64-bg-error)}
  .n64-screen .screen-content {
	width: 100%; height: 100%;background: rgba(0,0,0,0.16);
	border-radius: calc(var(--n64-radius) - 2px); display: flex
	align-items: center
	justify-content: center
; color: var(--n64-text); font-family: var(--n64-font-family); font-size: var(--n64-font-size); outline: none}
  .n64-screen .screen-content:focus {
	box-shadow: 0 6px 18px rgba(0,0,0,0.28), 0, 0 0 3px rgba(255,212,64,0.06)}
</style>
