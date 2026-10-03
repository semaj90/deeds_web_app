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
# $state
## See also
Tutorial
Basic Svelte
Reactivity
State
### On this page
$state
Deep state
Classes
Built-in classes
$state.raw
$state.snapshot
$state.eager
Passing state into functions
Passing state across modules
The
`$state`
rune allows you to create
reactive state
, which means that your UI
reacts
when it changes.
```
<script>
	let count = $state(0);
</script>

<button onclick={() => count++}>
	clicks: {count}
</button>
```
Unlike other frameworks you may have encountered, there is no API for interacting with state —
`count`
is just a number, rather than an object or a function, and you can update it like you would update any other variable.
### Deep state
If
`$state`
is used with an array or a simple object, the result is a deeply reactive
state proxy
.
Proxies
allow Svelte to run code when you read or write properties, including via methods like
`array.push(...)`
, triggering granular updates.
State is proxified recursively until Svelte finds something other than an array or simple object (like a class or an object created with
`Object.create`
). In a case like this...
```
let todoslet todos: {
    done: boolean;
    text: string;
}[] = $statefunction $state<{
    done: boolean;
    text: string;
}[]>(initial: {
    done: boolean;
    text: string;
}[]): {
    done: boolean;
    text: string;
}[] (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
([
	{
		done(property) done: boolean: false,
		text(property) text: string: 'add more todos'
	}
]);
```
...modifying an individual todo’s property will trigger updates to anything in your UI that depends on that specific property:
```
todosmodule todos
let todos: {
    done: boolean;
    text: string;
}[][0].done(property) done: boolean = !todosmodule todos
let todos: {
    done: boolean;
    text: string;
}[][0].done(property) done: boolean;
```
If you push a new object to the array, it will also be proxified:
```
todoslet todos: {
    done: boolean;
    text: string;
}[].push(method) Array<{ done: boolean; text: string; }>.push(...items: {
    done: boolean;
    text: string;
}[]): numberAppends new elements to the end of an array, and returns the new length of the array.
items New elements to add to the array.
({
	done(property) done: boolean: false,
	text(property) text: string: 'eat lunch'
});
```
When you update properties of proxies, the original object is
not
mutated. If you need to use your own proxy handlers in a state proxy,
you should wrap the object
after
wrapping it in
`$state`
.
Note that if you destructure a reactive value, the references are not reactive — as in normal JavaScript, they are evaluated at the point of destructuring:
```
let { donelet done: boolean, textlet text: string } = todosmodule todos
let todos: {
    done: boolean;
    text: string;
}[][0];
// this will not affect the value of `done`todosmodule todos
let todos: {
    done: boolean;
    text: string;
}[][0].done(property) done: boolean = !todosmodule todos
let todos: {
    done: boolean;
    text: string;
}[][0].done(property) done: boolean;
```
### Classes
Class instances are not proxied. Instead, you can use
`$state`
in class fields (whether public or private), or as the first assignment to a property immediately inside the
`constructor`
:
```
class Todoclass Todo {
	done(property) Todo.done: boolean = $statefunction $state<false>(initial: false): false (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
(false);

	constructor(text(parameter) text: any) {
		this.text(property) Todo.text: any = $statefunction $state<any>(initial: any): any (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
(text(parameter) text: any);
	}

	reset(method) Todo.reset(): void() {
		this.text(property) Todo.text: any = '';
		this.done(property) Todo.done: boolean = false;
	}
}
```
The compiler transforms
`done`
and
`text`
into
`get`
/
`set`
methods on the class prototype referencing private fields. This means the properties are not enumerable.
When calling methods in JavaScript, the value of
`this`
matters. This won’t work, because
`this`
inside the
`reset`
method will be the
`<button>`
rather than the
`Todo`
:
```
<button onclick={todo.reset}>
	reset
</button>
```
You can either use an inline function...
```
<button onclick={() => todo.reset()}>
	reset
</button>
```
...or use an arrow function in the class definition:
```
class Todoclass Todo {
	done(property) Todo.done: boolean = $statefunction $state<false>(initial: false): false (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
(false);

	constructor(text(parameter) text: any) {
		this.text(property) Todo.text: any = $statefunction $state<any>(initial: any): any (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
(text(parameter) text: any);
	}

	reset(property) Todo.reset: () => void = () => {
		this.text(property) Todo.text: any = '';
		this.done(property) Todo.done: boolean = false;
	}
}
```
### Built-in classes
Svelte provides reactive implementations of built-in classes like
`Set`
,
`Map`
,
`Date`
and
`URL`
that can be imported from
`svelte/reactivity`
.
## $state.raw
In cases where you don’t want objects and arrays to be deeply reactive you can use
`$state.raw`
.
State declared with
`$state.raw`
cannot be mutated; it can only be
reassigned
. In other words, rather than assigning to a property of an object, or using an array method like
`push`
, replace the object or array altogether if you’d like to update it:
```
let personlet person: {
    name: string;
    age: number;
} = $statenamespace $state
function $state<T>(initial: T): T (+1 overload)Declares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
.rawfunction $state.raw<{
    name: string;
    age: number;
}>(initial: {
    name: string;
    age: number;
}): {
    name: string;
    age: number;
} (+1 overload)Declares state that is not made deeply reactive — instead of mutating it,
you must reassign it.
Example:
<script>
  let items = $state.raw([0]);

  const addItem = () => {
    items = [...items, items.length];
  };
</script>

<button onclick={addItem}>
  {items.join(', ')}
</button>{@link https://svelte.dev/docs/svelte/$state#$state.raw Documentation}
initial The initial value
({
	name(property) name: string: 'Heraclitus',
	age(property) age: number: 49
});
// this will have no effectpersonlet person: {
    name: string;
    age: number;
}.age(property) age: number += 1;
// this will work, because we're creating a new personpersonlet person: {
    name: string;
    age: number;
} = {
	name(property) name: string: 'Heraclitus',
	age(property) age: number: 50
};
```
This can improve performance with large arrays and objects that you weren’t planning to mutate anyway, since it avoids the cost of making them reactive. Note that raw state can
contain
reactive state (for example, a raw array of reactive objects).
As with
`$state`
, you can declare class fields using
`$state.raw`
.
## $state.snapshot
To take a static snapshot of a deeply reactive
`$state`
proxy, use
`$state.snapshot`
:
```
<script>
	let counter = $state({ count: 0 });

	function onclick() {
		// Will log `{ count: ... }` rather than `Proxy { ... }`
		console.log($state.snapshot(counter));
	}
</script>
```
This is handy when you want to pass some state to an external library or API that doesn’t expect a proxy, such as
`structuredClone`
.
If a value has a
`toJSON`
method, the snapshot will clone the value returned from
`toJSON`
instead of the original object.
## $state.eager
When state changes, it may not be reflected in the UI immediately if it is used by an
`await`
expression, because
updates are synchronized
.
In some cases, you may want to update the UI as soon as the state changes. For example, you might want to update a navigation bar when the user clicks on a link, so that they get visual feedback while waiting for the new page to load. To do this, use
`$state.eager(value)`
:
```
<nav>
	<a href="/" aria-current={$state.eager(pathname) === '/' ? 'page' : null}>home</a>
	<a href="/about" aria-current={$state.eager(pathname) === '/about' ? 'page' : null}>about</a>
</nav>
```
Use this feature sparingly, and only to provide feedback in response to user action — in general, allowing Svelte to coordinate updates will provide a better user experience.
## Passing state into functions
JavaScript is a
pass-by-value
language — when you call a function, the arguments are the
values
rather than the
variables
. In other words:
index
```
/**
 * @param {number} a
 * @param {number} b
 */function addfunction add(a: number, b: number): numberab(a(parameter) a: numbera, b(parameter) b: numberb) {
	return a(parameter) a: numbera + b(parameter) b: numberb;
}

let alet a: number = 1;
let blet b: number = 2;
let totallet total: number = addfunction add(a: number, b: number): numberab(alet a: number, blet b: number);
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: number); // 3

alet a: number = 3;
blet b: number = 4;
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: number); // still 3!
```
```
function addfunction add(a: number, b: number): number(a(parameter) a: number: number, b(parameter) b: number: number) {
	return a(parameter) a: number + b(parameter) b: number;
}

let alet a: number = 1;
let blet b: number = 2;
let totallet total: number = addfunction add(a: number, b: number): number(alet a: number, blet b: number);
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: number); // 3

alet a: number = 3;
blet b: number = 4;
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: number); // still 3!
```
If
`add`
wanted to have access to the
current
values of
`a`
and
`b`
, and to return the current
`total`
value, you would need to use functions instead:
index
```
/**
 * @param {() => number} getA
 * @param {() => number} getB
 */function addfunction add(getA: () => number, getB: () => number): () => numbergetAgetB(getA(parameter) getA: () => numbergetA, getB(parameter) getB: () => numbergetB) {
	return () => getA(parameter) getA: () => numbergetA() + getB(parameter) getB: () => numbergetB();
}

let alet a: number = 1;
let blet b: number = 2;
let totallet total: () => number = addfunction add(getA: () => number, getB: () => number): () => numbergetAgetB(() => alet a: number, () => blet b: number);
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: () => number()); // 3

alet a: number = 3;
blet b: number = 4;
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: () => number()); // 7
```
```
function addfunction add(getA: () => number, getB: () => number): () => number(getA(parameter) getA: () => number: () => number, getB(parameter) getB: () => number: () => number) {
	return () => getA(parameter) getA: () => number() + getB(parameter) getB: () => number();
}

let alet a: number = 1;
let blet b: number = 2;
let totallet total: () => number = addfunction add(getA: () => number, getB: () => number): () => number(() => alet a: number, () => blet b: number);
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: () => number()); // 3

alet a: number = 3;
blet b: number = 4;
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: () => number()); // 7
```
State in Svelte is no different — when you reference something declared with the
`$state`
rune...
```
let alet a: number = $statefunction $state<1>(initial: 1): 1 (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
(1);
let blet b: number = $statefunction $state<2>(initial: 2): 2 (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
(2);
```
...you’re accessing its
current value
.
Note that ‘functions’ is broad — it encompasses properties of proxies and
`get`
/
`set`
properties...
index
```
/**
 * @param {{ a: number, b: number }} input
 */function addfunction add(input: {
    a: number;
    b: number;
}): {
    readonly value: number;
}input(input(parameter) input: {
    a: number;
    b: number;
}input) {
	return {
		get value(getter) value: number() {
			return input(parameter) input: {
    a: number;
    b: number;
}input.a(property) a: number + input(parameter) input: {
    a: number;
    b: number;
}input.b(property) b: number;
		}
	};
}

let inputmodule input
let input: {
    a: number;
    b: number;
} = $statefunction $state<{
    a: number;
    b: number;
}>(initial: {
    a: number;
    b: number;
}): {
    a: number;
    b: number;
} (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
({ a(property) a: number: 1, b(property) b: number: 2 });
let totallet total: {
    readonly value: number;
} = addfunction add(input: {
    a: number;
    b: number;
}): {
    readonly value: number;
}input(inputmodule input
let input: {
    a: number;
    b: number;
});
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: {
    readonly value: number;
}.value(property) value: number); // 3

inputmodule input
let input: {
    a: number;
    b: number;
}.a(property) a: number = 3;
inputmodule input
let input: {
    a: number;
    b: number;
}.b(property) b: number = 4;
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: {
    readonly value: number;
}.value(property) value: number); // 7
```
```
function addfunction add(input: {
    a: number;
    b: number;
}): {
    readonly value: number;
}(input(parameter) input: {
    a: number;
    b: number;
}: { a(property) a: number: number, b(property) b: number: number }) {
	return {
		get value(getter) value: number() {
			return input(parameter) input: {
    a: number;
    b: number;
}.a(property) a: number + input(parameter) input: {
    a: number;
    b: number;
}.b(property) b: number;
		}
	};
}

let inputlet input: {
    a: number;
    b: number;
} = $statefunction $state<{
    a: number;
    b: number;
}>(initial: {
    a: number;
    b: number;
}): {
    a: number;
    b: number;
} (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
({ a(property) a: number: 1, b(property) b: number: 2 });
let totallet total: {
    readonly value: number;
} = addfunction add(input: {
    a: number;
    b: number;
}): {
    readonly value: number;
}(inputlet input: {
    a: number;
    b: number;
});
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: {
    readonly value: number;
}.value(property) value: number); // 3

inputlet input: {
    a: number;
    b: number;
}.a(property) a: number = 3;
inputlet input: {
    a: number;
    b: number;
}.b(property) b: number = 4;
consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(totallet total: {
    readonly value: number;
}.value(property) value: number); // 7
```
...though if you find yourself writing code like that, consider using
classes
instead.
## Passing state across modules
You can declare state in
`.svelte.js`
and
`.svelte.ts`
files, but you can only
export
that state if it’s not directly reassigned. In other words you can’t do this:
state.svelte
```
export let countlet count: number = $statefunction $state<0>(initial: 0): 0 (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
(0);

export function incrementfunction increment(): void() {
	countlet count: number += 1;
}
```
That’s because every reference to
`count`
is transformed by the Svelte compiler — the code above is roughly equivalent to this:
state.svelte
```
export let countlet count: Signal<number> = $const $: Svelte.state(method) Svelte.state<number>(value?: number | undefined): Signal<number>(0);

export function incrementfunction increment(): void() {
	$const $: Svelte.set(method) Svelte.set<number>(source: Signal<number>, value: number): void(countlet count: Signal<number>, $const $: Svelte.get(method) Svelte.get<number>(source: Signal<number>): number(countlet count: Signal<number>) + 1);
}
```
You can see the code Svelte generates by clicking the ‘JS Output’ tab in the
playground
.
Since the compiler only operates on one file at a time, if another file imports
`count`
Svelte doesn’t know that it needs to wrap each reference in
`$.get`
and
`$.set`
:
```
import { count(alias) let count: number
import count } from './state.svelte.js';

consolenamespace console
var console: ConsoleThe console module provides a simple debugging console that is similar to the
JavaScript console mechanism provided by web browsers.
The module exports two specific components:

A Console class with methods such as console.log(), console.error() and console.warn() that can be used to write to any Node.js stream.
A global console instance configured to write to process.stdout and
process.stderr. The global console can be used without importing the node:console module.

Warning: The global console object's methods are neither consistently
synchronous like the browser APIs they resemble, nor are they consistently
asynchronous like all other Node.js streams. See the note on process I/O for
more information.
Example using the global console:
console.log('hello world');
// Prints: hello world, to stdout
console.log('hello %s', 'world');
// Prints: hello world, to stdout
console.error(new Error('Whoops, something bad happened'));
// Prints error message and stack trace to stderr:
//   Error: Whoops, something bad happened
//     at [eval]:5:15
//     at Script.runInThisContext (node:vm:132:18)
//     at Object.runInThisContext (node:vm:309:38)
//     at node:internal/process/execution:77:19
//     at [eval]-wrapper:6:22
//     at evalScript (node:internal/process/execution:76:60)
//     at node:internal/main/eval_string:23:3

const name = 'Will Robinson';
console.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to stderrExample using the Console class:
const out = getStreamSomehow();
const err = getStreamSomehow();
const myConsole = new console.Console(out, err);

myConsole.log('hello world');
// Prints: hello world, to out
myConsole.log('hello %s', 'world');
// Prints: hello world, to out
myConsole.error(new Error('Whoops, something bad happened'));
// Prints: [Error: Whoops, something bad happened], to err

const name = 'Will Robinson';
myConsole.warn(`Danger ${name}! Danger!`);
// Prints: Danger Will Robinson! Danger!, to errsource
.log(method) Console.log(message?: any, ...optionalParams: any[]): void (+1 overload)Prints to stdout with newline. Multiple arguments can be passed, with the
first used as the primary message and all additional used as substitution
values similar to printf(3)
(the arguments are all passed to util.format()).
const count = 5;
console.log('count: %d', count);
// Prints: count: 5, to stdout
console.log('count:', count);
// Prints: count: 5, to stdoutSee util.format() for more information.
v0.1.100
(typeof count(alias) let count: number
import count); // 'object', not 'number'
```
This leaves you with two options for sharing state between modules — either don’t reassign it...
```
// This is allowed — since we're updating
// `counter.count` rather than `counter`,
// Svelte doesn't wrap it in `$.state`
export const counterconst counter: {
    count: number;
} = $statefunction $state<{
    count: number;
}>(initial: {
    count: number;
}): {
    count: number;
} (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
({
	count(property) count: number: 0
});

export function incrementfunction increment(): void() {
	counterconst counter: {
    count: number;
}.count(property) count: number += 1;
}
```
...or don’t directly export it:
```
let countlet count: number = $statefunction $state<0>(initial: 0): 0 (+1 overload)
namespace $stateDeclares reactive state.
Example:
let count = $state(0);{@link https://svelte.dev/docs/svelte/$state Documentation}
initial The initial value
(0);

export function getCountfunction getCount(): number() {
	return countlet count: number;
}

export function incrementfunction increment(): void() {
	countlet count: number += 1;
}
```
Edit this page on GitHub
llms.txt
previous
next
What are runes?
$derived