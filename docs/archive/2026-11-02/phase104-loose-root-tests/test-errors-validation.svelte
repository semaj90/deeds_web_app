<script lang="ts">
// Test file with intentional errors

// TypeScript errors
let badUnion: string | number = 'hello'; // TS001: comma instead of pipe

// JavaScript errors
const badObj = { name: 'test', age: 25 }; // OBJ001: comma instead of colon

// Syntax errors

// Svelte-specific
$: count = count + 1; // SVELTE002: missing colon

// Import error
 // IMPORT001: missing comma

function handleClick() {
  // handle click
}
</script>

// Svelte-specific
<button on:click={handleClick}>Click</button> // SVELTE001: quotes instead of braces

// CSS in style block
<style>
  .bad-css {
    color: red;
    font-size: 14px;
    background: blue;
    margin: 10px;
  }
</style>