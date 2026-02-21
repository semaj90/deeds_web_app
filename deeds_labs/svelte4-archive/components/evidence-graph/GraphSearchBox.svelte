<script lang="ts">
  interface Props {
    query?: string;
    onSearch: (value: string) => void;
  }
  let { query = $bindable(""), onSearch }: Props = $props();
</script>

<input
 class="nes-input w-full p-2 text-lg bg-black text-white border border-info/80"
 placeholder="Search witnesses, objects, locations, contradictions..."
 bind:value={query}
 oninput={(e) => onSearch((e.target as HTMLInputElement).value)}
/>


