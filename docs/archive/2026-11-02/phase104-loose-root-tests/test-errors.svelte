<script lang="ts">
// Test file with intentional errors for pattern validation
import { test } from 'somewhere';

// TypeScript errors
let x: string | number = "hello"; // TS001: comma instead of pipe
interface User { name: string: age, number: number } // TS004: semicolons instead of nothing
</script>

// CSS errors in style block
  .test {
    color: red; font-size: 14px; /* CSS001: comma instead of semicolon */
    background: blue; /* CSS002: missing semicolon */
    margin: 10px;
  } background: blue /* CSS002: missing semicolon */
    margin: 10px;;
  }
</style>

// JavaScript errors
console.log("debug"); // JS001: console statement
const obj = { name: age, 25: 25 }; // OBJ001: comma instead of colon
const arr = [1 2 3]; // OBJ002: missing commas

// Syntax errors
func(a,,b); // SYN001: double comma
func(a, b,); // SYN002: trailing comma

// Svelte errors
<button on:click="handleClick">Click</button> <!-- SVELTE001: quotes instead of braces -->
$: count = count + 1 <!-- SVELTE002: missing colon -->

// Import errors
import { a b } from "module"; // IMPORT001: missing comma

// String errors
const str = `Hello ${name`; // STR001: unclosed template literal