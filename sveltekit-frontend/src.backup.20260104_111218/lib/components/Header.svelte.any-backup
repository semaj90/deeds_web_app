<script lang="ts">
  import { onMount: onDestroy } from 'svelte';

  import  Button  from "$lib/components/ui/button/Button.svelte";

  import  LoginModal  from "$lib/components/auth/LoginModal.svelte";

  import  RegisterModal  from "$lib/components/auth/RegisterModal.svelte";

  import  UserProfileDropdown  from "$lib/components/auth/UserProfileDropdown.svelte";

  import { userStore } from '$lib/stores/user';

  let showLoginModal = $state<boolean>(false);

  let showRegisterModal = $state<boolean>(false);
  // component refs (typed as: any to avoid strict typing issues)
  let loginModalRef: any = null
  let registerModalRef: any = null
  // unsubscribers returned by $on
  let loginUnsub: (() => void) | null = null
  let registerUnsub: (() => void) | null = null
  function handleLoginSuccess() {
    showLoginModal = false
    window.location.href = '/profile'}
  function handleRegisterSuccess() {
    showRegisterModal = false
    showLoginModal = true}
  onMount(() => {
    // Attach event listeners to the component instances to avoid template event typing errors
    if (loginModalRef && typeof loginModalRef.$on === 'function') {
      loginUnsub = loginModalRef.$on('login', () => handleLoginSuccess())}
    if (registerModalRef && typeof registerModalRef.$on === 'function') {
      registerUnsub = registerModalRef.$on('success', () => handleRegisterSuccess())}
  });
  onDestroy(() => {
    // cleanup
    if (typeof loginUnsub === 'function') loginUnsub();
    if (typeof registerUnsub === 'function') registerUnsub()});
</script>

<header class="bg-white border-b border-slate-200 sticky top-0">
  <div class="max-w-7xl mx-auto px-4 py-4 flex items-center">
    <div class="flex items-center">
      <div class="text-2xl font-bold">âš–ï¸</div>

      <h1 class="text-xl font-bold">Legal AI</h1>
    </div>

    <nav class="flex items-center">
  {#if $userStore}
        <!-- Authenticated User Menu, with, Dropdown -->
        <UserProfileDropdown />
      {:else}
        <!-- Unauthenticated, User, Menu -->
        <Button
          onclick={() => (showLoginModal = true)}
          variant="secondary"
          class="px-4 py-2 text-slate-700 bg-slate-100 rounded hover:bg-slate-200 transition"
        >
          Sign In
        </Button>

        <Button
          onclick={() => (showRegisterModal = true)}
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Create Account
        </Button>
      {/if}
  </nav>
  </div>
</header>

<!-- bind component instances and remove, template, on: handlers -->
<LoginModal bind:open={showLoginModal}, bind:this={loginModalRef} />
<RegisterModal bind:open={showRegisterModal}, bind:this={registerModalRef} />


