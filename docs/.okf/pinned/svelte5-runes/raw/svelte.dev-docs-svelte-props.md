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
# $props
## See also
Tutorial
Basic Svelte
Props
Declaring props
### On this page
$props
Fallback values
Renaming props
Rest props
Updating props
Type safety
$props.id()
The inputs to a component are referred to as
props
, which is short for
properties
. You pass props to components just like you pass attributes to elements:
App
```
<script>
	import MyComponent from './MyComponent.svelte';
</script>

<MyComponent adjective="cool" />
```
```
<script lang="ts">
	import MyComponent from './MyComponent.svelte';
</script>

<MyComponent adjective="cool" />
```
On the other side, inside
`MyComponent.svelte`
, we can receive props with the
`$props`
rune...
MyComponent
```
<script>
	let props = $props();
</script>

<p>this component is {props.adjective}</p>
```
```
<script lang="ts">
	let props = $props();
</script>

<p>this component is {props.adjective}</p>
```
...though more commonly, you’ll
destructure
your props:
MyComponent
```
<script>
	let { adjective } = $props();
</script>

<p>this component is {adjective}</p>
```
```
<script lang="ts">
	let { adjective } = $props();
</script>

<p>this component is {adjective}</p>
```
## Fallback values
Destructuring allows us to declare fallback values, which are used if the parent component does not set a given prop (or the value is
`undefined`
):
```
let { let adjective: anyadjective = 'happy' } = 
function $props(): any
namespace $propsDeclares the props that a component accepts. Example:
let { optionalProp = 42, requiredProp, bindableProp = $bindable() }: { optionalProp?: number; requiredProps: string; bindableProp: boolean } = $props();@see{@link https://svelte.dev/docs/svelte/$props Documentation}$props();
```
Fallback values are not turned into reactive state proxies (see
Updating props
for more info)
## Renaming props
We can also use the destructuring assignment to rename props, which is necessary if they’re invalid identifiers, or a JavaScript keyword like
`super`
:
```
let { super: let trouper: anytrouper = 'lights are gonna find me' } = 
function $props(): any
namespace $propsDeclares the props that a component accepts. Example:
let { optionalProp = 42, requiredProp, bindableProp = $bindable() }: { optionalProp?: number; requiredProps: string; bindableProp: boolean } = $props();@see{@link https://svelte.dev/docs/svelte/$props Documentation}$props();
```
## Rest props
Finally, we can use a
rest property
to get, well, the rest of the props:
```
let { let a: anya, let b: anyb, let c: anyc, ...let others: anyothers } = 
function $props(): any
namespace $propsDeclares the props that a component accepts. Example:
let { optionalProp = 42, requiredProp, bindableProp = $bindable() }: { optionalProp?: number; requiredProps: string; bindableProp: boolean } = $props();@see{@link https://svelte.dev/docs/svelte/$props Documentation}$props();
```
## Updating props
References to a prop inside a component update when the prop itself updates — when
`count`
changes in
`App.svelte`
, it will also change inside
`Child.svelte`
. But the child component is able to temporarily override the prop value, which can be useful for unsaved ephemeral state:
App
Child
Open
in playground
```
<script>
	import Child from './Child.svelte';

	let count = $state(0);
</script>

<button onclick={() => (count += 1)}>
	clicks (parent): {count}
</button>

<Child {count} />
```
```
<script lang="ts">
	import Child from './Child.svelte';

	let count = $state(0);
</script>

<button onclick={() => (count += 1)}>
	clicks (parent): {count}
</button>

<Child {count} />
```
```
<script>
	let { count } = $props();
</script>

<button onclick={() => (count += 1)}>
	clicks (child): {count}
</button>
```
```
<script lang="ts">
	let { count } = $props();
</script>

<button onclick={() => (count += 1)}>
	clicks (child): {count}
</button>
```
While you can temporarily
reassign
props, you should not
mutate
props unless they are
bindable
.
If the prop is a regular object, the mutation will have no effect:
App
Child
Open
in playground
```
<script>
	import Child from './Child.svelte';
</script>

<Child object={{ count: 0 }} />
```
```
<script lang="ts">
	import Child from './Child.svelte';
</script>

<Child object={{ count: 0 }} />
```
```
<script>
	let { object } = $props();
</script>

<button onclick={() => {
	// has no effect
	object.count += 1
}}>
	clicks: {object.count}
</button>
```
```
<script lang="ts">
	let { object } = $props();
</script>

<button onclick={() => {
	// has no effect
	object.count += 1
}}>
	clicks: {object.count}
</button>
```
If the prop is a reactive state proxy, however, then mutations
will
have an effect but you will see an
`ownership_invalid_mutation`
warning, because the component is mutating state that does not ‘belong’ to it:
App
Child
Open
in playground
```
<script>
	import Child from './Child.svelte';

	let object = $state({count: 0});
</script>

<Child {object} />
```
```
<script lang="ts">
	import Child from './Child.svelte';

	let object = $state({count: 0});
</script>

<Child {object} />
```
```
<script>
	let { object } = $props();
</script>

<button onclick={() => {
	// will cause the count below to update,
	// but with a warning. Don't mutate
	// objects you don't own!
	object.count += 1
}}>
	clicks: {object.count}
</button>
```
```
<script lang="ts">
	let { object } = $props();
</script>

<button onclick={() => {
	// will cause the count below to update,
	// but with a warning. Don't mutate
	// objects you don't own!
	object.count += 1
}}>
	clicks: {object.count}
</button>
```
The fallback value of a prop not declared with
`$bindable`
is left untouched — it is not turned into a reactive state proxy — meaning mutations will not cause updates:
App
Child
Open
in playground
```
<script>
	import Child from './Child.svelte';
</script>

<Child />
```
```
<script lang="ts">
	import Child from './Child.svelte';
</script>

<Child />
```
```
<script>
	let { object = { count: 0 } } = $props();
</script>

<button onclick={() => {
	// has no effect if the fallback value is used
	object.count += 1
}}>
	clicks: {object.count}
</button>
```
```
<script lang="ts">
	let { object = { count: 0 } } = $props();
</script>

<button onclick={() => {
	// has no effect if the fallback value is used
	object.count += 1
}}>
	clicks: {object.count}
</button>
```
In summary: don’t mutate props. Either use callback props to communicate changes, or — if parent and child should share the same object — use the
`$bindable`
rune.
## Type safety
You can add type safety to your components by annotating your props, as you would with any other variable declaration. In TypeScript that might look like this...
```
<script lang="ts">
	let { adjective }: { adjective: string } = $props();
</script>
```
...while in JSDoc you can do this:
```
<script>
	/** @type {{ adjective: string }} */
	let { adjective } = $props();
</script>
```
You can, of course, separate the type declaration from the annotation:
```
<script lang="ts">
	interface Props {
		adjective: string;
	}

	let { adjective }: Props = $props();
</script>
```
Interfaces for native DOM elements are provided in the
`svelte/elements`
module (see
Typing wrapper components
)
If your component exposes
snippet
props like
`children`
, these should be typed using the
`Snippet`
interface imported from
`'svelte'`
— see
Typing snippets
for examples.
Adding types is recommended, as it ensures that people using your component can easily discover which props they should provide.
## $props.id()
This rune, added in version 5.20.0, generates an ID that is unique to the current component instance. When hydrating a server-rendered component, the value will be consistent between server and client.
This is useful for linking elements via attributes like
`for`
and
`aria-labelledby`
.
```
<script>
	const uid = $props.id();
</script>

<form>
	<label for="{uid}-firstname">First Name: </label>
	<input id="{uid}-firstname" type="text" />

	<label for="{uid}-lastname">Last Name: </label>
	<input id="{uid}-lastname" type="text" />
</form>
```
Edit this page on GitHub
llms.txt
previous
next
$effect
$bindable