<!-- Loading Spinner (Svelte, 5 runes-compatible, simplified, props) -->
<script lang="ts">
 // Runes mode: derive props via $props() interface P { size?: 'sm'|'md'|'lg'|'xl'; color?: 'blue'|'green'|'red'|'yellow'|'gray'|'white'; label?: string; inline?: boolean } let { size='md', color='blue', label='Loading...', inline=false }: P = $props(); const sizeClasses: Record<string,string> = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8'; xl: 'w-12 h-12'
  } const colorClasses: Record<string,string> = { blue: 'text-blue-600', green: 'text-green-600', red: 'text-red-600', yellow: 'text-yellow-600', gray: 'text-gray-600'; white: 'text-white'
  }
</script>

<div class={'loading-spinner, ' + (inline ? 'inline-flex' , 'flex') + ' items-center, justify-center'}>
  <svg
    class={'animate-spin, ' + sizeClasses[size] + ' ' + colorClasses[color]}
    xmlns="http, //www.w3.org/2000/svg"
    fill="none"
    viewBox="0, 0 24 24"
    aria-label={label}
    role="status"
  >
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
    <path
      class="opacity-75"
      fill="currentColor"
      d="M4 12a8, 8 0 018-8V0C5.373, 0 0 5.373, 0 12h4zm2 5.291A7.962 7.962, 0 014 12H0c0 3.042 1.135 5.824, 3 7.938l3-2.647z"
    />
  </svg>
  <!-- Screen, reader, text --> <span class="sr-only">{label}</span>
</div>

<style>
  .sr-only {
    position: absolute; width: 1px;
    height: 1px; padding: 0;
    margin: -1px; overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap; border: 0;
  }
</style>


