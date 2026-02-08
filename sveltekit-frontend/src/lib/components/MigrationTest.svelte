<script lang="ts">
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
  import { Button } from '$lib/components/ui/enhanced-bits';
  import { AsyncStore, GenericStore } from '$lib/stores/generic.svelte';

  // 1. Generic Store Example
  const counterStore = new GenericStore<number>(0);

  // 2. Async Store Example
  interface UserData { id: number; name: string }
  const userStore = new AsyncStore<UserData>();

  async function fetchUser() {
    await userStore.run(async () => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Randomly fail to demonstrate error handling
      if (Math.random() > 0.7) throw new Error('Random network error');

      return { id: 1, name: 'Svelte 5 User' };
    });
  }
</script>

<div class="space-y-8 p-4">
  <!-- Generic Store Demo -->
  <Card>
    <CardHeader>
      <CardTitle>GenericStore Demo</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="text-2xl font-bold">Count: {counterStore.value}</div>
      <div class="flex gap-2">
        <Button class="bits-btn" onclick={() => counterStore.update(n => n + 1)}>Increment</Button>
        <Button class="bits-btn" variant="outline" onclick={() => counterStore.reset()}>Reset</Button>
      </div>
    </CardContent>
  </Card>

  <!-- Async Store Demo -->
  <Card>
    <CardHeader>
      <CardTitle>AsyncStore Demo</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex items-center gap-4">
        <Button class="bits-btn" onclick={fetchUser} disabled={userStore.isLoading}>
          {userStore.isLoading ? 'Loading...' : 'Fetch User'}
        </Button>

        {#if userStore.isLoading}
          <span class="text-muted-foreground">Fetching data...</span>
        {:else if userStore.error}
          <span class="text-destructive">Error: {userStore.error}</span>
        {:else if userStore.data}
          <span class="text-green-600 font-medium">
            Loaded: {userStore.data.name} (ID: {userStore.data.id})
          </span>
        {:else}
          <span class="text-muted-foreground">No data loaded</span>
        {/if}
      </div>

      <div class="text-xs text-muted-foreground">
        Status: {userStore.status}
      </div>
    </CardContent>
  </Card>
</div>



