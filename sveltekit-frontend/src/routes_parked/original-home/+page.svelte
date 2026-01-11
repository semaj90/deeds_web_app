<script lang="ts">
 import type { browser } from '$app/environment';
 let recentCases: unknown[] = $state ([]);
 $effect (() => {
 (async () => {
 // Load recent cases
 try {
 const casesRes = await fetch('/api/cases/recent');
 if (casesRes.ok) {
 recentCases = await casesRes.json();
 }
 } catch (error) {
 console.error('Failed to load dashboard data:', error);
 }

 // Setup AI search functionality
 if (browser) {
 const aiSearchBtn = document.getElementById('aiSearchBtn');
 const aiSearchInputEl = document.getElementById('aiSearchInput') as HTMLInputElement;
 if (aiSearchBtn && aiSearchInputEl) {
 aiSearchBtn.addEventListener('click', () => handleAiSearch(aiSearchInputEl.value));
 aiSearchInputEl.addEventListener('keypress', (e) => {
 if (e.key === 'Enter') {
 handleAiSearch(aiSearchInputEl.value);
 }
 });
 }
 }
 })();
 });
 async function handleAiSearch(query: string): Promise<any> {
 if (!query.trim()) return;
 try {
 // Navigate to AI search results page
 window.location.href = `/ai/search?q=${encodeURIComponent(query)}`;
 } catch (error) {
 console.error('AI search failed:', error);
 }
 }
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 /* @unocss-include */
 /*
 .hero-section {
 background-image:
 radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
 radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%),
 radial-gradient(circle at 40% 40%, rgba(120, 219, 255, 0.2) 0%, transparent 50%);
 }
 .line-clamp-3 {
 display: -webkit-box;
 -webkit-line-clamp: 3;
 line-clamp: 3;
 -webkit-box-orient: vertical; overflow: hidden;
 }
 */
</style>

