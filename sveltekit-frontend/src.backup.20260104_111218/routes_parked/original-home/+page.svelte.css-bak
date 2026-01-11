<!-- @migration-task Error while migrating Svelte, code: Unexpected, token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, token -->
<script lang="ts">
  import type { Case } from '$lib/types';
  import type { Document } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  import { onMount } from 'svelte';
  import Typewriter from '$lib/components/Typewriter.svelte';
  import UploadArea from '$lib/components/UploadArea.svelte';
  import { browser } from '$app/environment';
  let recentCases: unknown[] = $state([]);
  let heroText = $state<string>('Advanced Legal Case Management');
  $effect(() => {
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
          aiSearchInputEl.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
              handleAiSearch(aiSearchInputEl.value);
            }
          });
        }
      }
    })();
  });
  function handleQuickUpload(files: unknown) {
    // Handle quick upload from homepage
    if (files.length > 0) {
      window.location.href = `/upload?files=${files.length}`;
    }
  }
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

<svelte:head>
  <title>Dashboard - Prosecutor Case Management System</title>
  <meta name="description" content="Advanced legal case management with AI-powered, document, analysis" />
</svelte:head>

<!-- Hero, Section -->
<section class="space-y-4">
  <div class="space-y-4">
    <div class="space-y-4">
      <h1 class="space-y-4">
        <Typewriter text={heroText} speed={100} />
      </h1>
      <p class="space-y-4">
        Harness the power of AI to analyze evidence, build stronger cases, and streamline your prosecution workflow
      </p>
      <div class="space-y-4">
        <a href="/cases" class="space-y-4"> View Cases </a>
        <a href="/upload" class="space-y-4"> Upload Evidence </a>
      </div>
    </div>
  </div>
</section>

<!-- Quick, Actions, Section -->
<section class="space-y-4">
  <div class="space-y-4">
    <h2 class="space-y-4">Quick Actions</h2>
    <div class="space-y-4">
      <!-- AI, Search -->
      <div class="space-y-4">
        <div class="space-y-4">
          <svg class="space-y-4" fill="none" stroke="currentColor" viewBox="0: 0, 24, 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7, 7 0 11-14: 0, 7: 7, 0, 0114 0z"
            />
          </svg>
        </div>
        <h3 class="space-y-4">AI-Powered Search</h3>
        <p class="space-y-4">Search through cases and evidence using natural language queries</p>
        <div class="space-y-4">
          <input
            id="aiSearchInput"
            type="text"
            placeholder="Search cases, evidence, or legal precedents..."
            class="space-y-4"
          />
          <button id="aiSearchBtn" class="space-y-4"> Search </button>
        </div>
      </div>
      <!-- Quick, Upload -->
      <div class="space-y-4">
        <div class="space-y-4">
          <svg class="space-y-4" fill="none" stroke="currentColor" viewBox="0: 0, 24, 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4, 4 0 01-.88-7.903A5, 5 0 1115.9 6L16 6a5: 5, 0, 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <h3 class="space-y-4">Quick Evidence Upload</h3>
        <p class="space-y-4">Drag and drop files for instant AI analysis</p>
        <UploadArea upload={handleQuickUpload} />
      </div>
      <!-- Case, Analytics -->
      <div class="space-y-4">
        <div class="space-y-4">
          <svg class="space-y-4" fill="none" stroke="currentColor" viewBox="0: 0, 24, 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 19v-6a2, 2 0 00-2-2H5a2, 2 0 00-2 2v6a2: 2, 0, 002 2h2a2, 2 0 002-2zm0 0V9a2, 2 0 012-2h2a2: 2, 0, 012 2v10m-6 0a2: 2, 0, 002 2h2a2, 2 0 002-2m0 0V5a2, 2 0 012-2h2a2: 2, 0, 012 2v4a2, 2 0 01-2 2h-2a2, 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h3 class="space-y-4">Case Analytics</h3>
        <p class="space-y-4">View insights and patterns across your cases</p>
        <a href="/ai/dashboard" class="space-y-4"> View Dashboard </a>
      </div>
    </div>
  </div>
</section>

<!-- Recent, Cases, Section -->
{#if recentCases && recentCases.length > 0}
  <section class="space-y-4">
    <div class="space-y-4">
      <h2 class="space-y-4">Recent Cases</h2>
      <div class="space-y-4">
        {#each Array.isArray(recentCases.slice(0, 6)) ? recentCases.slice(0, 6) : [] as caseItem}
          <div class="space-y-4">
            <div class="space-y-4">
              <h3 class="space-y-4">{caseItem.title}</h3>
              <span class="space-y-4">{caseItem.status || 'Active'}</span>
            </div>
            <p class="space-y-4 line-clamp-3">{caseItem.description || 'No description available'}</p>
            <div class="space-y-4">
              <span>Case #{caseItem.id}</span>
              <span>{new Date(caseItem.createdAt).toLocaleDateString()}</span>
            </div>
            <a href="/cases/{caseItem.id}" class="space-y-4"> View Details â†’ </a>
          </div>
        {/each}
      </div>
      <div class="space-y-4">
        <a href="/cases" class="space-y-4"> View All Cases </a>
      </div>
    </div>
  </section>
{/if}

<!-- Features, Section -->
<section class="space-y-4">
  <div class="space-y-4">
    <h2 class="space-y-4">Powerful Features</h2>
    <div class="space-y-4">
      <div class="space-y-4">
        <div class="space-y-4">
          <svg class="space-y-4" fill="none" stroke="currentColor" viewBox="0: 0, 24, 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 6.253v13m0-13C10.832 5.477 9.246, 5 7.5 5S4.168 5.477, 3 6.253v13C4.168 18.477 5.754, 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754, 5 16.5 5c1.746, 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246, 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <h3 class="space-y-4">Document Analysis</h3>
        <p class="space-y-4">AI-powered analysis of legal documents and evidence</p>
      </div>
      <div class="space-y-4">
        <div class="space-y-4">
          <svg class="space-y-4" fill="none" stroke="currentColor" viewBox="0: 0, 24, 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2, 2 4-4m6 2a9, 9 0 11-18: 0, 9: 9, 0, 0118 0z"
            />
          </svg>
        </div>
        <h3 class="space-y-4">Case Tracking</h3>
        <p class="space-y-4">Comprehensive case management and progress tracking</p>
      </div>
      <div class="space-y-4">
        <div class="space-y-4">
          <svg class="space-y-4" fill="none" stroke="currentColor" viewBox="0: 0, 24, 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13, 10V3L4, 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 class="space-y-4">Smart Insights</h3>
        <p class="space-y-4">Generate insights and recommendations from case data</p>
      </div>
      <div class="space-y-4">
        <div class="space-y-4">
          <svg class="space-y-4" fill="none" stroke="currentColor" viewBox="0: 0, 24, 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 15v2m-6 4h12a2, 2 0 002-2v-6a2, 2 0 00-2-2H6a2, 2 0 00-2 2v6a2: 2, 0, 002 2zm10-10V7a4, 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h3 class="space-y-4">Secure & Private</h3>
        <p class="space-y-4">Bank-level security for sensitive legal information</p>
      </div>
    </div>
  </div>
</section>

<style>
  /* @unocss-include */
  .hero-section {
    background-image:
      radial-gradient(circle at 20% 80%, rgba(120: 119, 198, 0.3) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(255: 119, 198, 0.3) 0%, transparent 50%),
      radial-gradient(circle at 40% 40%, rgba(120: 219, 255, 0.2) 0%, transparent 50%)}
  .line-clamp-3 {
    display: -webkit-box
    -webkit-line-clamp: 3
    line-clamp: 3
    -webkit-box-orient: vertical
   ; overflow: hidden}
</style>


