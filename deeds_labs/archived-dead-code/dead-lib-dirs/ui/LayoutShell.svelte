<script lang="ts">
 import Sidebar from './Sidebar.svelte';
 import TopBar from './TopBar.svelte';

 let { children } = $props();
</script>

<div class="app-bg min-h-screen flex">
 <Sidebar />

 <div class="flex-1 flex flex-col">
 <TopBar />

 <main class="flex-1 p-4 overflow-auto custom-scrollbar">
 {@render children()}
 </main>
 </div>
</div>


