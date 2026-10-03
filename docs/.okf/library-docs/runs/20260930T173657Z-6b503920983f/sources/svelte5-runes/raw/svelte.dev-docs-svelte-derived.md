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
# $derived
## See also
Tutorial
Basic Svelte
Reactivity
Derived state
### On this page
$derived
$derived.by
Understanding dependencies
Overriding derived values
Deriveds and reactivity
Destructuring
Update propagation
Derived state is declared with the
`$derived`
rune:
```
<script>
	let count = $state(0);
	let doubled = $derived(count * 2);
</script>

<button onclick={() => count++}>
	{doubled}
</button>

<p>{count} doubled is {doubled}</p>
```
The expression inside
`$derived(...)`
should be free of side-effects. Svelte will disallow state changes (e.g.
`count++`
) inside derived expressions.
As with
`$state`
, you can mark class fields as
`$derived`
.
Code in Svelte components is only executed once at creation. Without the
`$derived`
rune,
`doubled`
would maintain its original value even when
`count`
changes.
## $derived.by
Sometimes you need to create complex derivations that don’t fit inside a short expression. In these cases, you can use
`$derived.by`
which accepts a function as its argument.
```
<script>
	let numbers = $state([1, 2, 3]);
	let total = $derived.by(() => {
		let total = 0;
		for (const n of numbers) {
			total += n;
		}
		return total;
	});
</script>

<button onclick={() => numbers.push(numbers.length + 1)}>
	{numbers.join(' + ')} = {total}
</button>
```
In essence,
`$derived(expression)`
is equivalent to
`$derived.by(() => expression)`
.
## Understanding dependencies
Anything read synchronously inside the
`$derived`
expression (or
`$derived.by`
function body) is considered a
dependency
of the derived state. When the state changes, the derived will be marked as
dirty
and recalculated when it is next read.
In addition, if an expression contains an
`await`
, Svelte transforms it such that any state
after
the
`await`
is also tracked — in other words, in a case like this...
```
let totallet total: number = $derivedfunction $derived<number>(expression: number): number
namespace $derivedDeclares derived state, i.e. one that depends on other state variables.
The expression inside $derived(...) should be free of side-effects.
Example:
let double = $derived(count * 2);{@link https://svelte.dev/docs/svelte/$derived Documentation}
expression The derived state expression
(await alet a: Promise<number> + blet b: number);
```
...both
`a`
and
`b`
are tracked, even though
`b`
is only read once
`a`
has resolved, after the initial execution. (This does not apply to
`await`
in functions that are called by the expression, only the expression itself.)
To exempt a piece of state from being treated as a dependency, use
`untrack`
.
## Overriding derived values
Derived expressions are recalculated when their dependencies change, but you can temporarily override their values by reassigning them (unless they are declared with
`const`
). This can be useful for things like
optimistic UI
, where a value is derived from the ‘source of truth’ (such as data from your server) but you’d like to show immediate feedback to the user:
```
<script>
	let { post, like } = $props();

	let likes = $derived(post.likes);

	async function onclick() {
		// increment the `likes` count immediately...
		likes += 1;

		// and tell the server, which will eventually update `post`
		try {
			await like();
		} catch {
			// failed! roll back the change
			likes -= 1;
		}
	}
</script>

<button {onclick}>🧡 {likes}</button>
```
Prior to Svelte 5.25, deriveds were read-only.
## Deriveds and reactivity
Unlike
`$state`
, which converts objects and arrays to
deeply reactive proxies
,
`$derived`
values are left as-is. For example,
in a case like this
...
```
let itemslet items: any[] = $statefunction $state<never[]>(initial: never[]): never[] (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
([ /*...*/ ]);

let indexlet index: number = $statefunction $state<0>(initial: 0): 0 (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
(0);
let selectedlet selected: any = $derivedfunction $derived<any>(expression: any): any
namespace $derivedDeclares derived state, i.e. one that depends on other state variables.
The expression inside $derived(...) should be free of side-effects.
Example:
let double = $derived(count * 2);{@link https://svelte.dev/docs/svelte/$derived Documentation}
expression The derived state expression
(itemslet items: any[][indexlet index: number]);
```
...you can change (or
`bind:`
to) properties of
`selected`
and it will affect the underlying
`items`
array. If
`items`
was
not
deeply reactive, mutating
`selected`
would have no effect.
## Destructuring
If you use destructuring with a
`$derived`
declaration, the resulting variables will all be reactive — this...
```
let { alet a: number, blet b: number, clet c: number } = $derivedfunction $derived<{
    a: number;
    b: number;
    c: number;
}>(expression: {
    a: number;
    b: number;
    c: number;
}): {
    a: number;
    b: number;
    c: number;
}
namespace $derivedDeclares derived state, i.e. one that depends on other state variables.
The expression inside $derived(...) should be free of side-effects.
Example:
let double = $derived(count * 2);{@link https://svelte.dev/docs/svelte/$derived Documentation}
expression The derived state expression
(stufffunction stuff(): {
    a: number;
    b: number;
    c: number;
}());
```
...is roughly equivalent to this:
```
let _stufflet _stuff: {
    a: number;
    b: number;
    c: number;
} = $derivedfunction $derived<{
    a: number;
    b: number;
    c: number;
}>(expression: {
    a: number;
    b: number;
    c: number;
}): {
    a: number;
    b: number;
    c: number;
}
namespace $derivedDeclares derived state, i.e. one that depends on other state variables.
The expression inside $derived(...) should be free of side-effects.
Example:
let double = $derived(count * 2);{@link https://svelte.dev/docs/svelte/$derived Documentation}
expression The derived state expression
(stufffunction stuff(): {
    a: number;
    b: number;
    c: number;
}());
let alet a: number = $derivedfunction $derived<number>(expression: number): number
namespace $derivedDeclares derived state, i.e. one that depends on other state variables.
The expression inside $derived(...) should be free of side-effects.
Example:
let double = $derived(count * 2);{@link https://svelte.dev/docs/svelte/$derived Documentation}
expression The derived state expression
(_stufflet _stuff: {
    a: number;
    b: number;
    c: number;
}.a(property) a: number);
let blet b: number = $derivedfunction $derived<number>(expression: number): number
namespace $derivedDeclares derived state, i.e. one that depends on other state variables.
The expression inside $derived(...) should be free of side-effects.
Example:
let double = $derived(count * 2);{@link https://svelte.dev/docs/svelte/$derived Documentation}
expression The derived state expression
(_stufflet _stuff: {
    a: number;
    b: number;
    c: number;
}.b(property) b: number);
let clet c: number = $derivedfunction $derived<number>(expression: number): number
namespace $derivedDeclares derived state, i.e. one that depends on other state variables.
The expression inside $derived(...) should be free of side-effects.
Example:
let double = $derived(count * 2);{@link https://svelte.dev/docs/svelte/$derived Documentation}
expression The derived state expression
(_stufflet _stuff: {
    a: number;
    b: number;
    c: number;
}.c(property) c: number);
```
## Update propagation
Svelte uses something called
push-pull reactivity
— when state is updated, everything that depends on the state (whether directly or indirectly) is immediately notified of the change (the ‘push’), but derived values are not re-evaluated until they are actually read (the ‘pull’).
If the new value of a derived is referentially identical to its previous value, downstream updates will be skipped. In other words, Svelte will only update the text inside the button when
`large`
changes, not when
`count`
changes, even though
`large`
depends on
`count`
:
```
<script>
	let count = $state(0);
	let large = $derived(count > 10);
</script>

<button onclick={() => count++}>
	{large}
</button>
```
Edit this page on GitHub
llms.txt
previous
next
$state
$effect