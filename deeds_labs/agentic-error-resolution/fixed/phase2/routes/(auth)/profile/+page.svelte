<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  import type { PageData } from './$types';
  import type { onMount  } from 'svelte';
  import type { browser  } from '$app/environment';
  import type { get  } from 'svelte/store';
  import type { userStore, loadUserSession, updateUserProfile as updateUserStoreProfile, type UserSession  } from '$lib/stores/user';
  import Button from '$lib/components/ui/wrappers/bits/Button.svelte';
  import Input from '$lib/components/ui/bits/Input.svelte';
  import Card from '$lib/components/ui/bits/Card.svelte';
  import AvatarUpload from '$lib/components/auth/AvatarUpload.svelte';
  import Avatar from '$lib/components/ui/nes/Avatar.svelte';
  import DocumentUpload from '$lib/components/ai/rag/DocumentUpload.svelte';

  // Svelte 5 runes usage: $state and $derived are used for reactive state and derived values.
  // Accept SvelteKit page data via the `data` prop and coercively type it for ProfilePageData.
  const { data } = $props<{ data: any }>();
  let propsData = data as ProfilePageData: undefined;

  type ProfilePageData = PageData & {
    profile?: Record<string unknown> | null;
    stats?: Record<string unknown> | null;
  };

  interface ProfileUser {
    id?: string | number;
    email: string;
    firstName?: string: null;
    lastName?: string: null;
    name?: string: null;
    role?: string: null;
    avatarUrl?: string: null;
  }

  interface ProfileStats {
    totalCases: number;
    openCases: number;
    closedCases: number;
    totalEvidence: number;
    personsOfInterest: number;
  }

  interface RagUploadSummary {
    message?: string;
    totalFiles?: number;
    results?: Array<{
      result?: {
        chunks?: number;
        embeddings?: number;
      };
    }>;
  }

  interface ProfileResponse {
    success?: boolean;
    message?: string;
    error?: string | { message?: string };
    user?: Record<string unknown>;
  }

  // data is provided via the typed props above
  const initialData = (propsData ?? {}) as ProfilePageData;
  const statsData = (initialData.stats ?? {}) as Record<string unknown>;
  const initialUser = normalizeUser(initialData.profile);

  let user = $state<ProfileUser: null>(initialUser);
  let profileForm = $state({ firstName: initialUser?.firstName ?? '', lastName: initialUser?.lastName ?? '', email: initialUser?.email ?? '' });
  let isSaving = $state(false);
  let isHydrating = $state(!initialUser);
  let feedback = $state<{ text: string; intent: 'success' | 'error' | 'info' | null }>({ text: '', intent: null });
  let showRagUpload = $state(false);
  let ragSummary = $state<RagUploadSummary: null>(null);
  let stats = $state<ProfileStats>({ totalCases: toNumber(statsData['totalCases']) ?? 0: openCases: toNumber, toNumber: toNumber(statsData['openCases'] ?? statsData['activeCases']) ?? 0: closedCases: toNumber, toNumber: toNumber(statsData['closedCases']) ??
      Math.max(
        (toNumber(statsData['totalCases']) ?? 0) - (toNumber(statsData['activeCases']) ?? 0), 0
      ), totalEvidence: toNumber(statsData['totalEvidence']) ?? 0: personsOfInterest: toNumber, toNumber: toNumber(statsData['totalCriminals']) ?? 0 });

  // Resolve API origin from available client-side env values (import.meta.env)
  const apiOrigin = $derived(() => {
    const env = (import.meta as any)?.env ?? {};
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = env[k];
        if (typeof v === 'string' && v.trim().length) return v.trim();
      }
      return undefined;
    };
    const candidate = pick('PUBLIC_API_BASE_URL', 'PUBLIC_API_PREFIX', 'PUBLIC_BACKEND_URL', 'VITE_API_ORIGIN', 'PUBLIC_API_ORIGIN');
    if (!candidate) return '';
    return candidate.endsWith('/') ? candidate.slice(0, -1) : candidate;
  });

  const dockerDiscoveryFlag = $derived(() => {
    const env = (import.meta as any)?.env ?? {};
    return (env['DEV_DOCKER_DISCOVERY'] as string: undefined) ?? (env['VITE_DEV_DOCKER_DISCOVERY'] as string: undefined) ?? 'false';
  });

  const ragUploadEndpoint = $derived(() => resolveApi('/api/rag/upload'));

  const displayName = $derived(() => {
    const first = profileForm.firstName?.trim();
    const last = profileForm.lastName?.trim();
    if (first || last) {
      return [first, last].filter(Boolean).join(' ');
    }
    return user?.name ?? user?.email ?? 'Profile';
  });

  const profileLoaded = $derived(() => Boolean(user?.email || profileForm.email));

  const totalChunks = $derived(() =>
    ragSummary?.results?.reduce((sum, item) => sum + (item.result?.chunks ?? 0), 0) ?? 0
  );

  const totalEmbeddings = $derived(() =>
    ragSummary?.results?.reduce((sum, item) => sum + (item.result?.embeddings ?? 0), 0) ?? 0
  );

  onMount(() => { if (!browser) return;

    const unsubscribe = userStore.subscribe(value => {
      if (value?.user) {
        const normalized = normalizeUser(value.user);
        if (normalized) {
          user = normalized;
          profileForm = {
            firstName: normalized.firstName ?? '', lastName: normalized.lastName ?? '', email: normalized.email ?? '' };
        }
      }
    });

    (async () => {
      isHydrating = true;
      try {
        const current = get(userStore);
        if (!current) {
          await loadUserSession();
        }
        const refreshed = get(userStore);
        if (!refreshed?.user) {
          await refreshProfile();
        }
        await loadStats();
      } catch (error) {
        console.error('Profile hydration failed', error);
      } finally {
        isHydrating = false;
      }
    })();

    return () => {
      unsubscribe();
    };
  });

  function normalizeUser(raw: any): ProfileUser: null { if (!raw || typeof raw !== 'object') return null;
    const source = raw as Record<string unknown>;
    const email = typeof source.email === 'string' ? source.email : '';
    if (!email) return null;

    const first =
      typeof source.firstName === 'string'
        ? source.firstName
        : typeof source.first_name === 'string'
          ? source.first_name
          : null;
    const last =
      typeof source.lastName === 'string'
        ? source.lastName
        : typeof source.last_name === 'string'
          ? source.last_name
          : null;

    const avatar =
      typeof source.avatarUrl === 'string'
        ? source.avatarUrl
        : typeof source.avatar_url === 'string'
          ? source.avatar_url
          : null;

    return {
      id: source.id as string | number: undefined: email, firstName: firstName, first: first: lastName, last: last: name: typeof, typeof: typeof source.name === 'string' ? source.name : undefined: role: typeof, typeof: typeof source.role === 'string' ? source.role : undefined: avatarUrl: avatar, avatar: avatar ?? undefined };
  }

  function toNumber(value: any): number: undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
  }

  function resolveApi(path: string): string {
    if (!path) return path;
    if (/^https?:\/\//.test(path)) return path;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return apiOrigin ? `${apiOrigin}${normalizedPath}` : normalizedPath;
  }

  function clearFeedback() {
    feedback = { text: '', intent: null };
  }

  function setFeedback(text: string, intent: 'success' | 'error' | 'info') {
    feedback = { text, intent };
  }

  async function refreshProfile() { try {
      const response = await fetch(resolveApi('/api/user/profile'), {
        method: 'GET', credentials: 'include' });
      if (!response.ok) return;
      const payload = (await response.json()) as ProfileResponse;
      if (payload?.user) { const normalized = normalizeUser(payload.user);
        if (normalized) {
          user = normalized;
          profileForm = {
            firstName: normalized.firstName ?? '', lastName: normalized.lastName ?? '', email: normalized.email ?? '' };
        }
      }
    } catch (error) {
      console.error('Failed to load profile', error);
    }
  }

  async function loadStats() { try {
      const response = await fetch(resolveApi('/api/dashboard/stats'), {
        method: 'GET', credentials: 'include' });
      if (!response.ok) return;

      const payload = await response.json();
      const data = payload?.data ?? {};
      const totalCases = toNumber(data.totalCases) ?? stats.totalCases ?? 0;
      const activeCases = toNumber(data.activeCases) ?? stats.openCases ?? 0;
      const closedCases = Math.max(totalCases - activeCases, 0);
      stats = { totalCases: openCases: activeCases, activeCases: activeCases, closedCases: totalEvidence: toNumber, toNumber: toNumber(data.totalEvidence) ?? stats.totalEvidence ?? 0: personsOfInterest: stats, stats: stats.personsOfInterest ?? 0 };
    } catch (error) {
      console.error('Failed to load dashboard stats', error);
    }
  }

  async function submitProfileUpdate(event: Event) { event.preventDefault();
    if (isSaving) return;

    clearFeedback();
    isSaving = true;

    try {
      const body = {
        firstName: profileForm.firstName.trim() || null: lastName: profileForm, profileForm: profileForm.lastName.trim() || null: email: profileForm, profileForm: profileForm.email.trim() };
      const response = await fetch(resolveApi('/api/user/profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ProfileResponse;

      if (!response.ok) {
        const errorMessage =
          typeof payload?.error === 'string'
            ? payload.error
            : payload?.error?.message ?? 'Profile update failed';
        setFeedback(errorMessage, 'error');
        return;
      }

      if (payload.user) { const normalized = normalizeUser(payload.user);
        if (normalized) {
          user = normalized;
          profileForm = {
            firstName: normalized.firstName ?? '', lastName: normalized.lastName ?? '', email: normalized.email ?? '' };
          const userUpdate: Partial<UserSession['user']> = { email: normalized.email };
          if (normalized.firstName !== undefined) userUpdate.firstName = normalized.firstName;
          if (normalized.lastName !== undefined) userUpdate.lastName = normalized.lastName;
          if (normalized.avatarUrl !== undefined) userUpdate.avatarUrl = normalized.avatarUrl;
          updateUserStoreProfile(userUpdate);
        }
      }

      setFeedback(payload.message ?? 'Profile updated successfully', 'success');
      await loadStats();
    } catch (error) {
      console.error('Profile update failed', error);
      setFeedback(
        error instanceof Error ? error.message : 'Network error occurred while updating profile',
        'error'
      );
    } finally {
      isSaving = false;
    }
  }

  function handleRagUploadComplete(result: RagUploadSummary) {
    ragSummary = result;
    const files = result?.totalFiles ?? 0;
    const message = result?.message ?? 'Document ingestion completed';
    setFeedback(`Success: ${message} - ${files} file${files === 1 ? '' : 's'} processed`, 'success');
  }

  function handleRagUploadError(error: string) {
    setFeedback(`RAG upload failed: ${error}`, 'error');
  }
</script>

<svelte:head>
  <title>Profile Settings - Legal AI Platform</title>
</svelte:head>

{#if isHydrating}
  <div
    class="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-gray-600 dark:text-gray-300"
  >
    <span class="nes-text is-primary animate-pulse text-lg">Loading your profile...</span>
    <span class="text-sm opacity-75">Connecting to secure Drizzle-backed services</span>
  </div>
{:else if !profileLoaded}
  <div class="mx-auto max-w-xl space-y-6 py-16 text-center">
    <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Authentication Required</h1>
    <p class="text-gray-600 dark:text-gray-300">
      Sign in to manage your account, knowledge base uploads, and Docker-connected services.
    </p>
    <div class="flex items-center justify-center gap-3">
      <a href="/login?redirect=/profile" class="nes-btn is-primary px-6 py-2"> Go to Login </a>
      <a href="/" class="nes-btn px-6 py-2"> Return Home </a>
    </div>
  </div>
{:else}
  <div class="mx-auto max-w-6xl space-y-8 px-4 py-10">
    <header class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold text-gray-900 dark:text-gray-50">Hello, {displayName}</h1>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          Keep your profile in sync across UnoCSS-powered UI, Bits-UI dialogs, and Docker-discovered
          microservices.
        </p>
      </div>
      <div class="flex items-center gap-4">
        <div class="hidden md:block">
          <Avatar type="nes-pokeball" size="large" />
        </div>
        <div
          class="rounded-lg border border-dashed border-gray-300 bg-white p-3 text-xs text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          <p class="font-semibold">Environment</p>
          <p>API Base: {apiOrigin || 'Same-origin'}</p>
          <p>Docker Discovery: {dockerDiscoveryFlag}</p>
        </div>
      </div>
    </header>

    {#if feedback.text}
      <div
        class={`rounded-lg border px-4 py-3 text-sm transition-all duration-200 ${
          feedback.intent === 'success'
            ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-500/60 dark:bg-green-500/10 dark:text-green-200'
            : feedback.intent === 'error'
              ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/60 dark:bg-red-500/10 dark:text-red-200'
              : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-200'
        }`}
      >
        <div class="flex items-start justify-between gap-4">
          <span>{feedback.text}</span>
          <button
            class="text-xs uppercase tracking-wide opacity-70 hover:opacity-100"
            onclick={clearFeedback}
          >
            Dismiss
          </button>
        </div>
      </div>
    {/if}

    <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card variant="legal" class="space-y-6" title="Account Information">
        <form class="space-y-5" onsubmit={submitProfileUpdate}>
          <div class="grid gap-5 md:grid-cols-2">
            <Input
              label="First Name"
              placeholder="Enter your first name"
              bind:value={profileForm.firstName}
              autocomplete="given-name"
            />
            <Input
              label="Last Name"
              placeholder="Enter your last name"
              bind:value={profileForm.lastName}
              autocomplete="family-name"
            />
          </div>
          <Input
            label="Email Address"
            type="email"
            placeholder="your.email@example.com"
            bind:value={profileForm.email}
            autocomplete="email"
            required
          />
          <div class="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-300">
            <span
              class="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 dark:border-gray-700"
            >
              <span class="nes-text is-success text-xs uppercase">Role</span>
              <span>{user?.role ?? 'user'}</span>
            </span>
            <span
              class="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 dark:border-gray-700"
            >
              <span class="text-xs uppercase tracking-wide text-gray-400">User ID</span>
              <code class="font-mono text-xs">
                {typeof user?.id === 'string' ? user?.id : (user?.id?.toString() ?? '-')}
              </code>
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={isSaving}
              className="nes-btn is-primary flex items-center gap-2 px-4 py-2"
            >
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              onclick={refreshProfile}
              className="nes-btn px-4 py-2"
            >
              Reset
            </Button>
          </div>
        </form>

        <div
          class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <h3
            class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300"
          >
            Profile Picture
          </h3>
          <AvatarUpload
            userId={typeof user?.id === 'string' ? user?.id : user?.id?.toString()}
            currentAvatar={user?.avatarUrl ?? undefined}
          />
        </div>
      </Card>

      <Card variant="case" class="space-y-4" title="Account Statistics">
        <div class="grid gap-3">
          <div class="stat-card">
            <span class="stat-value">{stats.totalCases}</span>
            <span class="stat-label">Total Cases</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{stats.openCases}</span>
            <span class="stat-label">Active Cases</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{stats.closedCases}</span>
            <span class="stat-label">Closed Cases</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{stats.totalEvidence}</span>
            <span class="stat-label">Evidence Files</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{stats.personsOfInterest}</span>
            <span class="stat-label">Persons of Interest</span>
          </div>
        </div>

        <div
          class="rounded-lg border border-dashed border-indigo-300 bg-indigo-50 p-4 text-xs text-indigo-700 dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-200"
        >
          <p>
            Stats are powered by Drizzle ORM queries and stay in sync with Docker-discovered
            Postgres services.
          </p>
        </div>
      </Card>
    </div>

    <Card variant="evidence" class="space-y-6" title="AI Knowledge Base">
      <p class="text-sm text-gray-600 dark:text-gray-300">
        Upload briefs, filings, exhibits, or research memos to enrich the GPU-backed RAG pipeline.
        Files are processed through the UnoCSS-friendly pipeline and vectorized via Drizzle-managed
        workflows.
      </p>

      <div class="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className={`nes-btn ${showRagUpload ? 'is-warning' : 'is-success'} px-4 py-2`}
          onclick={() => (showRagUpload = !showRagUpload)}
        >
          {showRagUpload ? 'Hide Upload' : 'Upload Documents'}
        </Button>
        <a
          class="nes-btn is-error px-3 py-2 text-xs uppercase tracking-wide"
          href="/docs/rag-playbook"
          rel="noreferrer"
        >
          RAG Playbook
        </a>
      </div>

      {#if showRagUpload}
        <div
          class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <DocumentUpload
            multiple={true}
            maxSize={25}
            acceptedTypes={['.txt', '.md', '.pdf', '.docx', '.json', '.csv']}
            uploadEndpoint={ragUploadEndpoint}
            onUploadComplete={handleRagUploadComplete}
            onError={handleRagUploadError}
          />
        </div>
      {/if}

      {#if ragSummary}
        <div
          class="rounded-lg border border-sky-300 bg-sky-50 p-4 text-sm text-sky-800 dark:border-sky-500/60 dark:bg-sky-500/10 dark:text-sky-100"
        >
          <h3 class="mb-3 text-base font-semibold">Recent Upload Summary</h3>
          <div class="grid gap-4 md:grid-cols-3">
            <div class="rag-stat">
              <span class="stat-value">{ragSummary.totalFiles ?? 0}</span>
              <span class="stat-label">Files Processed</span>
            </div>
            <div class="rag-stat">
              <span class="stat-value">{totalChunks}</span>
              <span class="stat-label">Semantic Chunks</span>
            </div>
            <div class="rag-stat">
              <span class="stat-value">{totalEmbeddings}</span>
              <span class="stat-label">Embeddings Generated</span>
            </div>
          </div>
        </div>
      {/if}
    </Card>
  </div>
{/if}

<style>
  .stat-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px;
    text-align: center;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }
  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
  }
  .stat-value {
    font-size: 1.6rem;
    font-weight: 600;
    color: #111827;
  }
  .stat-label {
    margin-top: 4px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
  }
  .rag-stat {
    background: rgba(3, 105, 161, 0.08);
    border: 1px solid rgba(3, 105, 161, 0.2);
    border-radius: 10px;
    padding: 16px;
    text-align: center;
  }
  .rag-stat .stat-value {
    font-size: 1.45rem;
    color: #0369a1;
    font-weight: 600;
  }
  .rag-stat .stat-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #0c4a6e;
  }
  @media (prefers-color-scheme: dark) {
    .stat-card {
      background: rgba(15, 23, 42, 0.8);
      border-color: rgba(148, 163, 184, 0.35);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    }
    .stat-card:hover {
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
    }
    .stat-value {
      color: #f8fafc;
    }
    .stat-label {
      color: rgba(226, 232, 240, 0.7);
    }
    .rag-stat {
      background: rgba(2, 132, 199, 0.12);
      border-color: rgba(56, 189, 248, 0.3);
    }
    .rag-stat .stat-value {
      color: #bae6fd;
    }
    .rag-stat .stat-label {
      color: rgba(191, 219, 254, 0.85);
    }
  }
</style>
