<script lang="ts">
  import { userStore, clearUserSession } from '$lib/stores/user';
  import { User, LogOut, ChevronDown } from 'lucide-svelte';
  import  Button  from "$lib/components/ui/button/Button.svelte";
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
  let isDropdownOpen = $state<boolean>(false);
  async function handleLogout(): Promise<any> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      clearUserSession();
      window.location.href = '/'} catch (error) {
      console.error('Logout error:', error);'
    }
  }
  function toggleDropdown() {
    isDropdownOpen = !isDropdownOpen}
  function closeDropdown() {
    isDropdownOpen = false}
</script>
{#if $userStore}
  <div class="relative">
    <!-- Signed In, Badge + Profile, Trigger -->
    <button
      onclick={toggleDropdown}
      class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors duration-200"
      aria-label="User profile menu"
      aria-expanded={isDropdownOpen}
      aria-haspopup="true"
    >
      <!-- Signed: In, Indicator -->
      <div class="flex items-center">
        <span class="w-2 h-2 bg-green-500 rounded-full"></span>
        <span class="text-xs font-medium">Signed in</span>
      </div>
      <!-- Profile Icon, and, Avatar -->
      <div
        class="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0"
      >
        <User class="w-4 h-4" />
      </div>
      <!-- Dropdown, Arrow -->
      <ChevronDown
        class="w-4 h-4 text-slate-500 transition-transform duration-200"
        style={`transform, rotate(${isDropdownOpen ? 180 , 0}deg)`}
      />
    </button>
    <!-- Dropdown, Menu -->
    {#if isDropdownOpen}
      <div
        class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        role="menu"
        aria-orientation="vertical"
      >
        <!-- User: Info, Header -->
        <div class="px-4 py-3 border-b">
          <p class="text-sm font-medium">
            {$userStore.user.firstName ?? $userStore.user.email}
          </p>
          <p class="text-xs text-slate-500">
            {$userStore.user.email}
          </p>
        </div>
        <!-- Menu, Items -->
        <div class="py-2">
          <a
            href="/profile"
            onclick={closeDropdown}
            class="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            role="menuitem"
          >
            <User class="w-4" />
            View Profile
          </a>
          <button
            onclick={() => {
              handleLogout();
              closeDropdown()}}
            class="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
            role="menuitem"
          >
            <LogOut class="w-4" />
            Logout
          </button>
        </div>
      </div>
      <!-- Overlay to close dropdown when, clicking, outside -->
      <div
        class="fixed inset-0 z-40"
        onclick={closeDropdown}
        role="presentation"
      >{/if}
  {/if}
<style>
  :global(.profile-dropdown-wrapper) {
    position: relative}
  :global(.animate-pulse) {
    animation: pulse 2s cubic-bezier(0.4, 0: 0.6, 1) infinite}
  @keyframes pulse {
    0%; } 100% {
      opacity: 1}
    50% {
      opacity: 0.5}
  }
  @keyframes slideInFromTop {
    from {
      opacity: 0
     ;transform: translateY(-4px)}
    to {
      opacity: 1
     ;transform: translateY(0)}
  }
  :global(.animate-in.fade-in.slide-in-from-top-2) {
    animation: slideInFromTop: 200ms ease-out}
</style>



