### Introduction
Overview
Getting started
.svelte files
.svelte.js and .svelte.ts files
### Runes
What are runes?
$state
$derived
$effect
$props
$bindable
$inspect
$host
### Template syntax
Basic markup
{#if ...}
{#each ...}
{#key ...}
{#await ...}
{#snippet ...}
{@render ...}
{@html ...}
{@attach ...}
{@const ...}
{@debug ...}
{let/const ...}
bind:
use:
transition:
in: and out:
animate:
style:
class
await
### Styling
Scoped styles
Global styles
Custom properties
Nested <style> elements
### Special elements
<svelte:boundary>
<svelte:window>
<svelte:document>
<svelte:body>
<svelte:head>
<svelte:element>
<svelte:options>
### Runtime
Stores
Context
Lifecycle hooks
Imperative component API
Hydratable data
### Misc
Best practices
Testing
TypeScript
Custom elements
Browser support
Svelte 4 migration guide
Svelte 5 migration guide
Frequently asked questions
### Reference
svelte
svelte/action
svelte/animate
svelte/attachments
svelte/compiler
svelte/easing
svelte/events
svelte/legacy
svelte/motion
svelte/reactivity/window
svelte/reactivity
svelte/server
svelte/store
svelte/transition
Compiler errors
Compiler warnings
Runtime errors
Runtime warnings
### Legacy APIs
Overview
Reactive let/var declarations
Reactive $: statements
export let
$$props and $$restProps
on:
<slot>
$$slots
<svelte:fragment>
<svelte:component>
<svelte:self>
Imperative component API
Svelte
Runes
# $effect
## See also
Tutorial
Basic Svelte
Reactivity
Effects
### On this page
$effect
Understanding lifecycle
Understanding dependencies
$effect.pre
$effect.tracking
$effect.pending
$effect.root
When not to use $effect
Effects are functions that run when state updates, and can be used for things like calling third-party libraries, drawing on
`<canvas>`
elements, or making network requests. They only run in the browser, not during server-side rendering.
Generally speaking, you should
not
update state inside effects, as it will make code more convoluted and will often lead to never-ending update cycles. If you find yourself doing so, see
when not to use
`$effect`
to learn about alternative approaches.
You can create an effect with the
`$effect`
rune (
demo
):
```
<script>
	let size = $state(50);
	let color = $state('#ff3e00');

	let canvas;

	$effect(() => {
		const context = canvas.getContext('2d');
		context.clearRect(0, 0, canvas.width, canvas.height);

		// this will re-run whenever `color` or `size` change
		context.fillStyle = color;
		context.fillRect(0, 0, size, size);
	});
</script>

<canvas bind:this={canvas} width="100" height="100"></canvas>
```
When Svelte runs an effect function, it tracks which pieces of state (and derived state) are accessed (unless accessed inside
`untrack`
), and re-runs the function when that state later changes.
If you’re having difficulty understanding why your
`$effect`
is rerunning or is not running see
understanding dependencies
. Effects are triggered differently than the
`$:`
blocks you may be used to if coming from Svelte 4.
### Understanding lifecycle
Your effects run after the component has been mounted to the DOM, and in a
microtask
after state changes. Re-runs are batched (i.e. changing
`color`
and
`size`
in the same moment won’t cause two separate runs), and happen after any DOM updates have been applied.
You can use
`$effect`
anywhere, not just at the top level of a component, as long as it is called while a parent effect is running.
Svelte uses effects internally to represent logic and expressions in your template — this is how
`<h1>hello {name}!</h1>`
updates when
`name`
changes.
An effect can return a
teardown function
which will run immediately before the effect re-runs:
App
Open
in playground
```
<script>
	let count = $state(0);
	let milliseconds = $state(1000);

	$effect(() => {
		// This will be recreated whenever `milliseconds` changes
		const interval = setInterval(() => {
			count += 1;
		}, milliseconds);

		return () => {
			// if a teardown function is provided, it will run
			// a) immediately before the effect re-runs
			// b) when the component is destroyed
			clearInterval(interval);
		};
	});
</script>

<h1>{count}</h1>

<button onclick={() => (milliseconds *= 2)}>slower</button>
<button onclick={() => (milliseconds /= 2)}>faster</button>
```
```
<script lang="ts">
	let count = $state(0);
	let milliseconds = $state(1000);

	$effect(() => {
		// This will be recreated whenever `milliseconds` changes
		const interval = setInterval(() => {
			count += 1;
		}, milliseconds);

		return () => {
			// if a teardown function is provided, it will run
			// a) immediately before the effect re-runs
			// b) when the component is destroyed
			clearInterval(interval);
		};
	});
</script>

<h1>{count}</h1>

<button onclick={() => (milliseconds *= 2)}>slower</button>
<button onclick={() => (milliseconds /= 2)}>faster</button>
```
Teardown functions also run when the effect is destroyed, which happens when its parent is destroyed (for example, a component is unmounted) or the parent effect re-runs.
### Understanding dependencies
`$effect`
automatically picks up any reactive values (
`$state`
,
`$derived`
,
`$props`
) that are
synchronously
read inside its function body (including indirectly, via function calls) and registers them as dependencies. When those dependencies change, the
`$effect`
schedules a re-run.
If
`$state`
and
`$derived`
are used directly inside the
`$effect`
(for example, during creation of a
reactive class
), those values will
not
be treated as dependencies.
Values that are read
asynchronously
— after an
`await`
or inside a
`setTimeout`
, for example — will not be tracked. Here, the canvas will be repainted when
`color`
changes, but not when
`size`
changes (
demo
):
```
function $effect(fn: () => void | (() => void)): void
namespace $effectRuns code when a component is mounted to the DOM, and then whenever its dependencies change, i.e. $state or $derived values.
The timing of the execution is after the DOM has been updated.
Example:
$effect(() => console.log('The count is now ' + count));If you return a function from the effect, it will be called right before the effect is run again, or when the component is unmounted.
Does not run during server-side rendering.
@see{@link https://svelte.dev/docs/svelte/$effect Documentation}@paramfn The function to execute$effect(() => {
	const const context: CanvasRenderingContext2Dcontext = 
let canvas: {
    width: number;
    height: number;
    getContext(type: "2d", options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D;
}canvas.function getContext(type: "2d", options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2DgetContext('2d');
	const context: CanvasRenderingContext2Dcontext.CanvasRect.clearRect(x: number, y: number, w: number, h: number): voidMDN Reference
clearRect(0, 0, 
let canvas: {
    width: number;
    height: number;
    getContext(type: "2d", options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D;
}canvas.width: numberwidth, 
let canvas: {
    width: number;
    height: number;
    getContext(type: "2d", options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D;
}canvas.height: numberheight);

	// this will re-run whenever `color` changes...
	const context: CanvasRenderingContext2Dcontext.CanvasFillStrokeStyles.fillStyle: string | CanvasGradient | CanvasPatternMDN Reference
fillStyle = let color: stringcolor;

	function setTimeout<[]>(callback: () => void, delay?: number): NodeJS.Timeout (+2 overloads)Schedules execution of a one-time callback after delay milliseconds.
The callback will likely not be invoked in precisely delay milliseconds.
Node.js makes no guarantees about the exact timing of when callbacks will fire,
nor of their ordering. The callback will be called as close as possible to the
time specified.
When delay is larger than 2147483647 or less than 1 or NaN, the delay
will be set to 1. Non-integer delays are truncated to an integer.
If callback is not a function, a TypeError will be thrown.
This method has a custom variant for promises that is available using
timersPromises.setTimeout().
@sincev0.0.1@paramcallback The function to call when the timer elapses.@paramdelay The number of milliseconds to wait before calling the
callback. Default: 1.@paramargs Optional arguments to pass when the callback is called.@returnsfor use with clearTimeout()setTimeout(() => {
		// ...but not when `size` changes
		const context: CanvasRenderingContext2Dcontext.CanvasRect.fillRect(x: number, y: number, w: number, h: number): voidMDN Reference
fillRect(0, 0, let size: numbersize, let size: numbersize);
	}, 0);
});
```
An effect only reruns when the object it reads changes, not when a property inside it changes. (If you want to observe changes
inside
an object at dev time, you can use
`$inspect`
.)
```
<script>
	let state = $state({ value: 0 });
	let derived = $derived({ value: state.value * 2 });

	// this will run once, because `state` is never reassigned (only mutated)
	$effect(() => {
		state;
	});

	// this will run whenever `state.value` changes...
	$effect(() => {
		state.value;
	});

	// ...and so will this, because `derived` is a new object each time
	$effect(() => {
		derived;
	});
</script>

<button onclick={() => (state.value += 1)}>
	{state.value}
</button>

<p>{state.value} doubled is {derived.value}</p>
```
An effect only depends on the values that it read the last time it ran. This has interesting implications for effects that have conditional code.
For instance, if
`condition`
is
`true`
in the code snippet below, the code inside the
`if`
block will run and
`color`
will be evaluated. This means that changes to either
`condition`
or
`color`
will cause the effect to re-run
.
Conversely, if
`condition`
is
`false`
,
`color`
will not be evaluated, and the effect will
only
re-run again when
`condition`
changes.
```
import function confetti(opts?: ConfettiOptions): voidconfetti from 'canvas-confetti';

let let condition: booleancondition = 
function $state<true>(initial: true): true (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);@see{@link https://svelte.dev/docs/svelte/$state Documentation}@paraminitial The initial value$state(true);
let let color: stringcolor = 
function $state<"#ff3e00">(initial: "#ff3e00"): "#ff3e00" (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);@see{@link https://svelte.dev/docs/svelte/$state Documentation}@paraminitial The initial value$state('#ff3e00');

function $effect(fn: () => void | (() => void)): void
namespace $effectRuns code when a component is mounted to the DOM, and then whenever its dependencies change, i.e. $state or $derived values.
The timing of the execution is after the DOM has been updated.
Example:
$effect(() => console.log('The count is now ' + count));If you return a function from the effect, it will be called right before the effect is run again, or when the component is unmounted.
Does not run during server-side rendering.
@see{@link https://svelte.dev/docs/svelte/$effect Documentation}@paramfn The function to execute$effect(() => {
	if (let condition: truecondition) {
		function confetti(opts?: ConfettiOptions): voidconfetti({ ConfettiOptions.colors: string[]colors: [let color: stringcolor] });
	} else {
		function confetti(opts?: ConfettiOptions): voidconfetti();
	}
});
```
## $effect.pre
In rare cases, you may need to run code
before
the DOM updates. For this we can use the
`$effect.pre`
rune:
```
<script>
	import { tick } from 'svelte';

	let div = $state();
	let messages = $state([]);

	// ...

	$effect.pre(() => {
		if (!div) return; // not yet mounted

		// reference `messages` array length so that this code re-runs whenever it changes
		messages.length;

		// autoscroll when new messages are added
		if (div.offsetHeight + div.scrollTop > div.scrollHeight - 20) {
			tick().then(() => {
				div.scrollTo(0, div.scrollHeight);
			});
		}
	});
</script>

<div bind:this={div}>
	{#each messages as message}
		<p>{message}</p>
	{/each}
</div>
```
`$effect.pre`
runs before DOM updates that are scheduled after it, not before every DOM mutation in the flush - DOM of parent components may already be updated. When using
await expressions
, block updates like
`{#if ...}`
and
`{#each ...}`
in the same component also run before
`$effect.pre`
.
Apart from the timing,
`$effect.pre`
works exactly like
`$effect`
.
## $effect.tracking
The
`$effect.tracking`
rune is an advanced feature that tells you whether or not the code is running inside a tracking context, such as an effect or inside your template:
App
Open
in playground
```
<script>
	console.log('in component setup:', $effect.tracking()); // false

	$effect(() => {
		console.log('in effect:', $effect.tracking()); // true
	});
</script>

<p>in template: {$effect.tracking()}</p> <!-- true -->
```
```
<script lang="ts">
	console.log('in component setup:', $effect.tracking()); // false

	$effect(() => {
		console.log('in effect:', $effect.tracking()); // true
	});
</script>

<p>in template: {$effect.tracking()}</p> <!-- true -->
```
It is used to implement abstractions like
`createSubscriber`
, which will create listeners to update reactive values but
only
if those values are being tracked (rather than, for example, read inside an event handler).
## $effect.pending
When using
`await`
in components, the
`$effect.pending()`
rune tells you how many promises are pending in the current
boundary
, not including child boundaries:
App
Open
in playground
```
<script>
	let a = $state(1);
	let b = $state(2);

	async function add(a, b) {
		await new Promise((f) => setTimeout(f, 500)); // artificial delay
		return a + b;
	}
</script>

<button onclick={() => a++}>a++</button>
<button onclick={() => b++}>b++</button>

<p>{a} + {b} = {await add(a, b)}</p>

{#if $effect.pending()}
	<p>pending promises: {$effect.pending()}</p>
{/if}
```
```
<script lang="ts">
	let a = $state(1);
	let b = $state(2);

	async function add(a, b) {
		await new Promise((f) => setTimeout(f, 500)); // artificial delay
		return a + b;
	}
</script>

<button onclick={() => a++}>a++</button>
<button onclick={() => b++}>b++</button>

<p>{a} + {b} = {await add(a, b)}</p>

{#if $effect.pending()}
	<p>pending promises: {$effect.pending()}</p>
{/if}
```
## $effect.root
The
`$effect.root`
rune is an advanced feature that creates a non-tracked scope that doesn’t auto-cleanup. This is useful for nested effects that you want to manually control. This rune also allows for the creation of effects outside of the component initialisation phase.
```
const const destroy: () => voiddestroy = 
namespace $effect
function $effect(fn: () => void | (() => void)): voidRuns code when a component is mounted to the DOM, and then whenever its dependencies change, i.e. $state or $derived values.
The timing of the execution is after the DOM has been updated.
Example:
$effect(() => console.log('The count is now ' + count));If you return a function from the effect, it will be called right before the effect is run again, or when the component is unmounted.
Does not run during server-side rendering.
@see{@link https://svelte.dev/docs/svelte/$effect Documentation}@paramfn The function to execute$effect.function $effect.root(fn: () => void | (() => void)): () => voidThe $effect.root rune is an advanced feature that creates a non-tracked scope that doesn’t auto-cleanup. This is useful for
nested effects that you want to manually control. This rune also allows for creation of effects outside of the component
initialisation phase.
Example:
<script>
  
let count = $state(0);

  
const cleanup = $effect.root(() => {
	
$effect(() => {
	  
console.log(count);
	
})

	
return () => {
	  
console.log('effect root cleanup');
	
}
  
});
</script>

<button onclick={() => cleanup()}>cleanup</button>@see{@link https://svelte.dev/docs/svelte/$effect#$effect.root Documentation}root(() => {
	
function $effect(fn: () => void | (() => void)): void
namespace $effectRuns code when a component is mounted to the DOM, and then whenever its dependencies change, i.e. $state or $derived values.
The timing of the execution is after the DOM has been updated.
Example:
$effect(() => console.log('The count is now ' + count));If you return a function from the effect, it will be called right before the effect is run again, or when the component is unmounted.
Does not run during server-side rendering.
@see{@link https://svelte.dev/docs/svelte/$effect Documentation}@paramfn The function to execute$effect(() => {
		// setup
	});

	return () => {
		// cleanup
	};
});

// later...
const destroy: () => voiddestroy();
```
## When not to use $effect
In general,
`$effect`
is best considered something of an escape hatch — useful for things like analytics and direct DOM manipulation — rather than a tool you should use frequently. In particular, avoid using it to synchronise state. Instead of this...
```
<script>
	let count = $state(0);
	let doubled = $state();

	// don't do this!
	$effect(() => {
		doubled = count * 2;
	});
</script>
```
...do this:
```
<script>
	let count = $state(0);
	let doubled = $derived(count * 2);
</script>
```
For things that are more complicated than a simple expression like
`count * 2`
, you can also use
`$derived.by`
.
If you’re using an effect because you want to be able to reassign the derived value (to build an optimistic UI, for example) note that
deriveds can be directly overridden
as of Svelte 5.25.
You might be tempted to do something convoluted with effects to link one value to another. The following example shows two inputs for “money spent” and “money left” that are connected to each other. If you update one, the other should update accordingly. Instead of using effects for this...
App
Open
in playground
```
<script>
	const total = 100;
	let spent = $state(0);
	let left = $state(total);

	$effect(() => {
		left = total - spent;
	});

	$effect(() => {
		spent = total - left;
	});
</script>

<label>
	<input type="range" bind:value={spent} max={total} />
	{spent}/{total} spent
</label>

<label>
	<input type="range" bind:value={left} max={total} />
	{left}/{total} left
</label>

<style>
	label {
		display: flex;
		gap: 0.5em;
	}
</style>
```
```
<script lang="ts">
	const total = 100;
	let spent = $state(0);
	let left = $state(total);

	$effect(() => {
		left = total - spent;
	});

	$effect(() => {
		spent = total - left;
	});
</script>

<label>
	<input type="range" bind:value={spent} max={total} />
	{spent}/{total} spent
</label>

<label>
	<input type="range" bind:value={left} max={total} />
	{left}/{total} left
</label>

<style>
	label {
		display: flex;
		gap: 0.5em;
	}
</style>
```
...use
`oninput`
callbacks or — better still —
function bindings
where possible:
App
Open
in playground
```
<script>
	const total = 100;
	let spent = $state(0);
	let left = $derived(total - spent);

	function updateLeft(left) {
		spent = total - left;
	}
</script>

<label>
	<input type="range" bind:value={spent} max={total} />
	{spent}/{total} spent
</label>

<label>
	<input type="range" bind:value={() => left, updateLeft} max={total} />
	{left}/{total} left
</label>

<style>
	label {
		display: flex;
		gap: 0.5em;
	}
</style>
```
```
<script lang="ts">
	const total = 100;
	let spent = $state(0);
	let left = $derived(total - spent);

	function updateLeft(left) {
		spent = total - left;
	}
</script>

<label>
	<input type="range" bind:value={spent} max={total} />
	{spent}/{total} spent
</label>

<label>
	<input type="range" bind:value={() => left, updateLeft} max={total} />
	{left}/{total} left
</label>

<style>
	label {
		display: flex;
		gap: 0.5em;
	}
</style>
```
If you absolutely have to update
`$state`
within an effect and run into an infinite loop because you read and write to the same
`$state`
, use
untrack
.
Edit this page on GitHub
llms.txt
previous
next
$derived
$props