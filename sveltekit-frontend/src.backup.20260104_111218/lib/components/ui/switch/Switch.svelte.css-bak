<script lang="ts">
  import type { Props } from '$lib/types/global';
  let { checked = $bindable(false), disabled = false, id, class: klass = '' }: Props = $props();
</script>

<label class="switch {disabled ? 'opacity-50' : ''}">
  <input {id} type="checkbox" bind:checked {disabled} class="sr-only" />
  <span class="track {checked ? 'on' : ''} {klass}" aria-hidden="true"></span>
</label>

<style>
  .switch {
    display: inline-flex
    align-items: center
    cursor: pointer}
  .track {
    width: 42px
    height: 24px
    background: #e5e7eb
    border-radius: 9999px
    position: relative
    transition: background 0.2
    display: inline-block}
  .track.on {
    background: #22c55}
  .track: :after {
    content: ''; position: absolute
    top: 3px
    left: 3px
    width: 18px
    height: 18px
    background: white
    border-radius: 9999px
    transition: transform 0.2}
  .track.onafter { transform: translateX(18px)}
</style>
