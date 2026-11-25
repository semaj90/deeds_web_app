<SYSTEM>This is the developer documentation for SvelteKit.</SYSTEM>


# Introduction

## Before we begin

> [!NOTE] If you're new to Svelte or SvelteKit we recommend checking out the [interactive tutorial](/tutorial/kit).
>
> If you get stuck, reach out for help in the [Discord chatroom](/chat).

## What is SvelteKit?

SvelteKit is a framework for rapidly developing robust, performant web applications using [Svelte](../svelte). If you're coming from React, SvelteKit is similar to Next. If you're coming from Vue, SvelteKit is similar to Nuxt.

To learn more about the kinds of applications you can build with SvelteKit, see the [documentation regarding project types](project-types).

## What is Svelte?

In short, Svelte is a way of writing user interface components — like a navigation bar, comment section, or contact form — that users see and interact with in their browsers. The Svelte compiler converts your components to JavaScript that can be run to render the HTML for the page and to CSS that styles the page. You don't need to know Svelte to understand the rest of this guide, but it will help. If you'd like to learn more, check out [the Svelte tutorial](/tutorial).

## SvelteKit vs Svelte

Svelte renders UI components. You can compose these components and render an entire page with just Svelte, but you need more than just Svelte to write an entire app.

SvelteKit helps you build web apps while following modern best practices and providing solutions to common development challenges. It offers everything from basic functionalities — like a [router](glossary#Routing) that updates your UI when a link is clicked — to more advanced capabilities. Its extensive list of features includes [build optimizations](https://vitejs.dev/guide/features.html#build-optimizations) to load only the minimal required code; [offline support](service-workers); [preloading](link-options#data-sveltekit-preload-data) pages before user navigation; [configurable rendering](page-options) to handle different parts of your app on the server via [SSR](glossary#SSR), in the browser through [client-side rendering](glossary#CSR), or at build-time with [prerendering](glossary#Prerendering); [image optimization](images); and much more. Building an app with all the modern best practices is fiendishly complicated, but SvelteKit does all the boring stuff for you so that you can get on with the creative part.

It reflects changes to your code in the browser instantly to provide a lightning-fast and feature-rich development experience by leveraging [Vite](https://vitejs.dev/) with a [Svelte plugin](https://github.com/sveltejs/vite-plugin-svelte) to do [Hot Module Replacement (HMR)](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/config.md#hot).

# Creating a project

The easiest way to start building a SvelteKit app is to run `npx sv create`:

```sh
npx sv create my-app
cd my-app
npm run dev
```

The first command will scaffold a new project in the `my-app` directory asking if you'd like to set up some basic tooling such as TypeScript. See [the CLI docs](/docs/cli/overview) for information about these options and [the integrations page](./integrations) for pointers on setting up additional tooling. `npm run dev` will then start the development server on [localhost:5173](http://localhost:5173) - make sure you install dependencies before running this if you didn't do so during project creation.

There are two basic concepts:

- Each page of your app is a [Svelte](../svelte) component
- You create pages by adding files to the `src/routes` directory of your project. These will be server-rendered so that a user's first visit to your app is as fast as possible, then a client-side app takes over

Try editing the files to get a feel for how everything works.

## Editor setup

We recommend using [Visual Studio Code (aka VS Code)](https://code.visualstudio.com/download) with [the Svelte extension](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode), but [support also exists for numerous other editors](https://sveltesociety.dev/collection/editor-support-c85c080efc292a34).

# Project types

SvelteKit offers configurable rendering, which allows you to build and deploy your project in several different ways. You can build all of the below types of applications and more with SvelteKit. Rendering settings are not mutually exclusive and you may choose the optimal manner with which to render different parts of your application.

If you don't have a particular way you'd like to build your application in mind, don't worry! The way your application is built, deployed, and rendered is controlled by which adapter you've chosen and a small amount of configuration and these can always be changed later. The [project structure](project-structure) and [routing](glossary#Routing) will be the same regardless of the project type that you choose.

## Default rendering

By default, when a user visits a site, SvelteKit will render the first page with [server-side rendering (SSR)](glossary#SSR) and subsequent pages with [client-side rendering (CSR)](glossary#CSR). Using SSR for the initial render improves SEO and perceived performance of the initial page load. Client-side rendering then takes over and updates the page without having to rerender common components, which is typically faster and eliminates a flash when navigating between pages. Apps built with this hybrid rendering approach have also been called [transitional apps](https://2021.jamstackconf.com/talk/c17544108e71/transitional-apps/).

## Static site generation

You can use SvelteKit as a [static site generator (SSG)](glossary#SSG) that fully [prerenders](glossary#Prerendering) your site with static rendering using [`adapter-static`](adapter-static). You may also use [the prerender option](page-options#prerender) to prerender only some pages and then choose a different adapter with which to dynamically server-render other pages.

Tools built solely to do static site generation may scale the prerendering process more efficiently during build when rendering a very large number of pages. When working with very large statically generated sites, you can avoid long build times with [Incremental Static Regeneration (ISR) if using `adapter-vercel`](adapter-vercel#Incremental-Static-Regeneration). And in contrast to purpose-built SSGs, SvelteKit allows for nicely mixing and matching different rendering types on different pages.

## Single-page app

[Single-page apps (SPAs)](glossary#SPA) exclusively use [client-side rendering (CSR)](glossary#CSR). You can [build single-page apps (SPAs)](single-page-apps) with SvelteKit. As with all types of SvelteKit applications, you can write your backend in SvelteKit or [another language or framework](#Separate-backend). If you are building an application with no backend or a [separate backend](#Separate-backend), you can simply skip over and ignore the parts of the docs talking about `server` files.

## Multi-page app

SvelteKit isn't typically used to build [traditional multi-page apps](glossary#MPA). However, you can use [`data-sveltekit-reload`](link-options#data-sveltekit-reload) to render all links on the server with `<body data-sveltekit-reload>` or specific links by placing it somewhere more specific. This does not remove the client-side router, but if you don't need JavaScript on a page you can remove all JavaScript on the page with [`csr = false`](page-options#csr), which will also render any links on the server when clicked.

## Separate backend

If your backend is written in another language such as Go, Java, PHP, Ruby, Rust, or C#, there are a couple of ways that you can deploy your application. The most recommended way would be to deploy your SvelteKit frontend separately from your backend utilizing `adapter-node` or a serverless adapter. Some users prefer not to have a separate process to manage and decide to deploy their application as a [single-page app (SPA)](single-page-apps) served by their backend server, but note that single-page apps have worse SEO and performance characteristics.

If you are using an external backend, you can simply skip over and ignore the parts of the docs talking about `server` files. You may also want to reference [the FAQ about how to make calls to a separate backend](faq#How-do-I-use-a-different-backend-API-server).

## Serverless app

SvelteKit apps are simple to run on serverless platforms. [The default zero config adapter](adapter-auto) will automatically run your app on a number of supported platforms or you can use [`adapter-vercel`](adapter-vercel), [`adapter-netlify`](adapter-netlify), or [`adapter-cloudflare`](adapter-cloudflare) to provide platform-specific configuration. And [community adapters](/packages#sveltekit-adapters) allow you to deploy your application to almost any serverless environment. Some of these adapters such as [`adapter-vercel`](adapter-vercel) and [`adapter-netlify`](adapter-netlify) offer an `edge` option, to support [edge rendering](glossary#Edge) for improved latency.

## Your own server

You can deploy to your own server or VPS using [`adapter-node`](adapter-node).

## Container

You can use [`adapter-node`](adapter-node) to run a SvelteKit app within a container such as Docker or LXC.

## Library

You can create a library to be used by other Svelte apps with the [`@sveltejs/package`](packaging) add-on to SvelteKit by choosing the library option when running [`sv create`](/docs/cli/sv-create).

## Offline app

SvelteKit has full support for [service workers](service-workers) allowing you to build many types of applications such as offline apps and [progressive web apps](glossary#PWA).

## Mobile app

You can turn a [SvelteKit SPA](single-page-apps) into a mobile app with [Tauri](https://v2.tauri.app/start/frontend/sveltekit/) or [Capacitor](https://capacitorjs.com/solution/svelte). Mobile features like the camera, geolocation, and push notifications are available via plugins for both platforms.

These mobile development platforms work by starting a local web server and then serving your application like a static host on your phone. You may find [`bundleStrategy: 'single'`](@sveltejs-kit-vite#output) to be a helpful option to limit the number of requests made. E.g. at the time of writing, the Capacitor local server uses HTTP/1, which limits the number of concurrent connections.

## Desktop app

You can turn a [SvelteKit SPA](single-page-apps) into a desktop app with [Tauri](https://v2.tauri.app/start/frontend/sveltekit/), [Wails](https://wails.io/docs/guides/sveltekit/), or [Electron](https://www.electronjs.org/).

## Browser extension

You can build browser extensions using either [`adapter-static`](adapter-static) or [community adapters](/packages#sveltekit-adapters) specifically tailored towards browser extensions.

## Embedded device

Because of its efficient rendering, Svelte can be run on low power devices. Embedded devices like microcontrollers and TVs may limit the number of concurrent connections. In order to reduce the number of concurrent requests, you may find [`bundleStrategy: 'single'`](@sveltejs-kit-vite#output) to be a helpful option in this deployment configuration.

# Project structure

A typical SvelteKit project looks like this:

```tree
my-project/
├ src/
│ ├ lib/
│ │ └ [your lib files]
│ ├ routes/
│ │ └ [your routes]
│ ├ service-worker/
│ │ ├ index.js
│ │ └ tsconfig.json
│ ├ app.html
│ ├ error.html
│ ├ hooks.client.js
│ ├ hooks.server.js
│ ├ instrumentation.server.js
│ └ params.js
├ static/
│ └ [your static assets]
├ tests/
│ └ [your tests]
├ package.json
├ tsconfig.json
└ vite.config.js
```

You'll also find common files like `.gitignore` and `.npmrc` (and `.prettierrc` and `eslint.config.js` and so on, if you chose those options when running `npx sv create`).

## Project files

### src

The `src` directory contains the meat of your project. Everything except `src/routes` and `src/app.html` is optional.

- `lib` contains your library code (utilities and components), which can be imported via the [`#lib`]($lib) alias, or packaged up for distribution using [`svelte-package`](packaging)
 - directories named `server`, at any depth, mark any code within as [server only](server-only-modules). SvelteKit will prevent you from importing these in client code.
- `routes` contains the [routes](routing) of your application. You can also colocate other components that are only used within a single route here
- `service-worker` contains your [service worker](service-workers)
- `app.html` is your page template — an HTML document containing the following placeholders:
 - `%sveltekit.head%` — `<link>` and `<script>` elements needed by the app, plus any `<svelte:head>` content
 - `%sveltekit.body%` — the markup for a rendered page. This should live inside a `<div>` or other element, rather than directly inside `<body>`, to prevent bugs caused by browser extensions injecting elements that are then destroyed by the hydration process. SvelteKit will warn you in development if this is not the case
 - `%sveltekit.assets%` — either [`paths.assets`](@sveltejs-kit-vite#paths), if specified, or a relative path to [`paths.base`](@sveltejs-kit-vite#paths)
 - `%sveltekit.nonce%` — a [CSP](@sveltejs-kit-vite#csp) nonce for manually included links and scripts, if used
 - `%sveltekit.env.[NAME]%` - this will be replaced at render time with the `[NAME]` environment variable, which must be defined as a public variable in `src/env`. It will fallback to `''` if not matched.
 - `%sveltekit.version%` — the app version, which can be specified with the [`version`](@sveltejs-kit-vite#version) configuration
- `error.html` is the page that is rendered when everything else fails. It can contain the following placeholders:
 - `%sveltekit.status%` — the HTTP status
 - `%sveltekit.error.message%` — the error message
- `hooks.client.js` contains your client [hooks](hooks)
- `hooks.server.js` contains your server [hooks](hooks)
- `params.js` contains any [param matchers](advanced-routing#Matching) your app needs
- `instrumentation.server.js` contains your [observability](observability) setup and instrumentation code
 - Requires adapter support. If your adapter supports it, it is guaranteed to run prior to loading and running your application code.

(Whether the project contains `.js` or `.ts` files depends on whether you opt to use TypeScript when you create your project.)

If you added [Vitest](https://vitest.dev) when you set up your project, your unit tests will live in the `src` directory with a `.test.js` extension.

### static

Any static assets that should be served without any alteration to the name — such as `robots.txt` — go in here. It's generally preferable to minimize the number of assets in `static/` and instead `import` them. Using an `import` allows [Vite's built-in handling](images#Vite's-built-in-handling) to give a unique name to an asset based on a hash of its contents so that it can be cached.

### tests

If you added [Playwright](https://playwright.dev/) for browser testing when you set up your project, the tests will live in this directory.

### package.json

Your `package.json` file must include `@sveltejs/kit`, `svelte` and `vite` as `devDependencies`.

When you create a project with `npx sv create`, you'll also notice that `package.json` includes `"type": "module"`. This means that `.js` files are interpreted as native JavaScript modules with `import` and `export` keywords. Legacy CommonJS files need a `.cjs` file extension.

### vite.config.js

A SvelteKit project is really just a [Vite](https://vitejs.dev) project that uses the [`@sveltejs/kit/vite`](@sveltejs-kit-vite) plugin, along with any other [Vite configuration](https://vitejs.dev/config/). The plugin accepts your Svelte and SvelteKit [configuration](@sveltejs-kit-vite).

### tsconfig.json

This file (or `jsconfig.json`, if you prefer type-checked `.js` files over `.ts` files) configures TypeScript, if you added typechecking during `npx sv create`. Since SvelteKit relies on certain configuration being set a specific way, it generates a [TypeScript configuration module]($app-tsconfig) which your own config `extends`.

## Other files

### .svelte-kit

As you develop and build your project, SvelteKit will generate files in a `.svelte-kit` directory (configurable as [`outDir`](@sveltejs-kit-vite#outDir)). You can ignore its contents, and delete them at any time (they will be regenerated when you next `dev` or `build`).

# Web standards

Throughout this documentation, you'll see references to the standard [Web APIs](https://developer.mozilla.org/en-US/docs/Web/API) that SvelteKit builds on top of. Rather than reinventing the wheel, we _use the platform_, which means your existing web development skills are applicable to SvelteKit. Conversely, time spent learning SvelteKit will help you be a better web developer elsewhere.

These APIs are available in all modern browsers and in many non-browser environments like Cloudflare Workers, Deno, and Vercel Functions. In particular, you'll get comfortable with the following:

## Fetch APIs

SvelteKit uses [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/fetch) for getting data from the network. It's available in [hooks](hooks) and [server routes](routing#server) as well as in the browser.

> [!NOTE] A special version of `fetch` is available in [`load`](load) functions, [server hooks](hooks), [API routes](routing#server) and [remote functions](remote-functions) for invoking endpoints directly during server-side rendering, without making an HTTP call, while preserving credentials. (To make credentialled fetches in server-side code outside `load`, you must explicitly pass `cookie` and/or `authorization` headers.) It also allows you to make relative requests, whereas server-side `fetch` normally requires a fully qualified URL.

Besides `fetch` itself, the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) includes the following interfaces:

### Request

An instance of [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) is accessible in [hooks](hooks) and [server routes](routing#server) as `event.request`. It contains useful methods like `request.json()` and `request.formData()` for getting data that was posted to an endpoint.

### Response

An instance of [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) is returned from `await fetch(...)` and handlers in `+server.js` files. Fundamentally, a SvelteKit app is a machine for turning a `Request` into a `Response`.

### Headers

The [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers) interface allows you to read incoming `request.headers` and set outgoing `response.headers`. For example, you can get the `request.headers` as shown below, and use [`Response.json`](https://developer.mozilla.org/en-US/docs/Web/API/Response/json_static) to send modified `response.headers`:

```js
// @errors: 2461
/// file: src/routes/what-is-my-user-agent/+server.js
/** @type {import('./$types').RequestHandler} */
export function GET({ request }) {
	// log all headers
	console.log(...request.headers);

	// create a JSON Response using a header we received
	return Response.json({
		// retrieve a specific header
		userAgent: request.headers.get('user-agent')
	}, {
		// set a header on the response
		headers: { 'x-custom-header': 'potato' }
	});
}
```

## FormData

When dealing with HTML native form submissions you'll be working with [`FormData`](https://developer.mozilla.org/en-US/docs/Web/API/FormData) objects.

```js
// @errors: 2461
/// file: src/routes/hello/+server.js
/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	const body = await event.request.formData();

	// log all fields
	console.log([...body]);

	return Response.json({
		// get a specific field's value
		name: body.get('name') ?? 'world'
	});
}
```

## Stream APIs

Most of the time, your endpoints will return complete data, as in the `userAgent` example above. Sometimes, you may need to return a response that's too large to fit in memory in one go, or is delivered in chunks, and for this the platform provides [streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) — [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream), [WritableStream](https://developer.mozilla.org/en-US/docs/Web/API/WritableStream) and [TransformStream](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream).

## URL APIs

URLs are represented by the [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) interface, which includes useful properties like `origin` and `pathname` (and, in the browser, `hash`). This interface shows up in various places — `event.url` in [hooks](hooks) and [server routes](routing#server), [`page.url`]($app-state) in [pages](routing#page), `from` and `to` in [`beforeNavigate` and `afterNavigate`]($app-navigation) and so on.

### URLSearchParams

Wherever you encounter a URL, you can access query parameters via `url.searchParams`, which is an instance of [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams):

```js
// @filename: ambient.d.ts
declare global {
	const url: URL;
}

export {};

// @filename: index.js
// ---cut---
const foo = url.searchParams.get('foo');
```

## Web Crypto

The [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) is made available via the `crypto` global. It's used internally for [Content Security Policy](@sveltejs-kit-vite#csp) headers, but you can also use it for things like generating UUIDs:

```js
const uuid = crypto.randomUUID();
```

# Routing

At the heart of SvelteKit is a _filesystem-based router_. The routes of your app — i.e. the URL paths that users can access — are defined by the directories in your codebase:

- `src/routes` is the root route
- `src/routes/about` creates an `/about` route
- `src/routes/blog/[slug]` creates a route with a _parameter_, `slug`, that can be used to load data dynamically when a user requests a page like `/blog/hello-world`

> [!NOTE] You can change `src/routes` to a different directory by editing the [project config](@sveltejs-kit-vite).

Each route directory contains one or more _route files_, which can be identified by their `+` prefix.

We'll introduce these files in a moment in more detail, but here are a few simple rules to help you remember how SvelteKit's routing works:

* All files can run on the server
* All files run on the client except `+server` files
* `+layout` and `+error` files apply to subdirectories as well as the directory they live in

> [!NOTE] When navigating from page A to B, SvelteKit preserves the components that are common to both of them — [see here](state-management#Component-and-page-state-is-preserved) for more detail.

## +page

### +page.svelte

A `+page.svelte` component defines a page of your app. By default, pages are rendered both on the server ([SSR](glossary#SSR)) for the initial request and in the browser ([CSR](glossary#CSR)) for subsequent navigation.

```svelte
<!--- file: src/routes/+page.svelte --->
<h1>Hello and welcome to my site!</h1>
<a href="/about">About my site</a>
```

```svelte
<!--- file: src/routes/about/+page.svelte --->
<h1>About this site</h1>
<p>TODO...</p>
<a href="/">Home</a>
```

> [!NOTE] SvelteKit uses `<a>` elements to navigate between routes, rather than a framework-specific `<Link>` component.

Pages can receive data from `load` functions via the `data` prop.

```svelte
<!--- file: src/routes/blog/[slug]/+page.svelte --->
<script>
	/** @type {import('./$types').PageProps} */
	let { data } = $props();
</script>

<h1>{data.title}</h1>
<div>{@html data.content}</div>
```

As of 2.24, pages also receive a `params` prop which is typed based on the route parameters. This is particularly useful alongside [remote functions](remote-functions):

```svelte
<!--- file: src/routes/blog/[slug]/+page.svelte --->
<script>
	import { getPost } from '../blog.remote';

	/** @type {import('./$types').PageProps} */
	let { params } = $props();

	const post = $derived(await getPost(params.slug));
</script>

<h1>{post.title}</h1>
<div>{@html post.content}</div>
```

> [!LEGACY]
> `PageProps` was added in 2.16.0. In earlier versions, you had to type the `data` property manually with `PageData` instead, see [$types](#\$types).
>
> In Svelte 4, you'd use `export let data` instead.

### +page.js

Often, a page will need to load some data before it can be rendered. For this, we add a `+page.js` module that exports a `load` function:

```js
/// file: src/routes/blog/[slug]/+page.js
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export function load({ params }) {
	if (params.slug === 'hello-world') {
		return {
			title: 'Hello world!',
			content: 'Welcome to our blog. Lorem ipsum dolor sit amet...'
		};
	}

	error(404, 'Not found');
}
```

This function runs alongside `+page.svelte`, which means it runs on the server during server-side rendering and in the browser during client-side navigation. See [`load`](load) for full details of the API.

As well as `load`, `+page.js` can export values that configure the page's behaviour:

- `export const prerender = true` or `false` or `'auto'`
- `export const ssr = true` or `false`
- `export const csr = true` or `false`

You can find more information about these in [page options](page-options).

### +page.server.js

If your `load` function can only run on the server — for example, if it needs to fetch data from a database or you need to access private [environment variables](environment-variables) like API keys — then you can rename `+page.js` to `+page.server.js` and change the `PageLoad` type to `PageServerLoad`.

```js
/// file: src/routes/blog/[slug]/+page.server.js

// @filename: ambient.d.ts
declare global {
	const getPostFromDatabase: (slug: string) => {
		title: string;
		content: string;
	}
}

export {};

// @filename: index.js
// ---cut---
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const post = await getPostFromDatabase(params.slug);

	if (post) {
		return post;
	}

	error(404, 'Not found');
}
```

During client-side navigation, SvelteKit will load this data from the server, which means that the returned value must be serializable using [devalue](https://github.com/rich-harris/devalue). See [`load`](load) for full details of the API.

Like `+page.js`, `+page.server.js` can export [page options](page-options) — `prerender`, `ssr` and `csr`.

A `+page.server.js` file can also export _actions_. If `load` lets you read data from the server, `actions` let you write data _to_ the server using the `<form>` element. To learn how to use them, see the [form actions](form-actions) section.

## +error

If an error occurs during `load`, SvelteKit will render a default error page. You can customise this error page on a per-route basis by adding an `+error.svelte` file:

```svelte
<!--- file: src/routes/blog/[slug]/+error.svelte --->
<script>
	import { page } from '$app/state';
</script>

<h1>{page.status}: {page.error.message}</h1>
```

SvelteKit will 'walk up the tree' looking for the closest error boundary — if the file above didn't exist it would try `src/routes/blog/+error.svelte` and then `src/routes/+error.svelte` before rendering the default error page. If _that_ fails (or if the error was thrown from the `load` function of the root `+layout`, which sits 'above' the root `+error`), SvelteKit will bail out and render a static fallback error page, which you can customise by creating a `src/error.html` file.

If the error occurs inside a `load` function in `+layout(.server).js`, the closest error boundary in the tree is an `+error.svelte` file _above_ that layout (not next to it).

If no route can be found (404), `src/routes/+error.svelte` (or the default error page, if that file does not exist) will be used.

> [!NOTE] `+error.svelte` is _not_ used when an error occurs inside [`handle`](hooks#handle) or a [+server.js](#server) request handler.

You can read more about error handling [here](errors).

## +layout

So far, we've treated pages as entirely standalone components — upon navigation, the existing `+page.svelte` component will be destroyed, and a new one will take its place.

But in many apps, there are elements that should be visible on _every_ page, such as top-level navigation or a footer. Instead of repeating them in every `+page.svelte`, we can put them in _layouts_.

### +layout.svelte

To create a layout that applies to every page, make a file called `src/routes/+layout.svelte`. The default layout (the one that SvelteKit uses if you don't bring your own) looks like this...

```svelte
<script>
	let { children } = $props();
</script>

{@render children()}
```

...but we can add whatever markup, styles and behaviour we want. The only requirement is that the component includes a `@render` tag for the page content. For example, let's add a nav bar:

```svelte
<!--- file: src/routes/+layout.svelte --->
<script>
	let { children } = $props();
</script>

<nav>
	<a href="/">Home</a>
	<a href="/about">About</a>
	<a href="/settings">Settings</a>
</nav>

{@render children()}
```

If we create pages for `/`, `/about` and `/settings`...

```html
/// file: src/routes/+page.svelte
<h1>Home</h1>
```

```html
/// file: src/routes/about/+page.svelte
<h1>About</h1>
```

```html
/// file: src/routes/settings/+page.svelte
<h1>Settings</h1>
```

...the nav will always be visible, and clicking between the three pages will only result in the `<h1>` being replaced.

Layouts can be _nested_. Suppose we don't just have a single `/settings` page, but instead have nested pages like `/settings/profile` and `/settings/notifications` with a shared submenu (for a real-life example, see [github.com/settings](https://github.com/settings)).

We can create a layout that only applies to pages below `/settings` (while inheriting the root layout with the top-level nav):

```svelte
<!--- file: src/routes/settings/+layout.svelte --->
<script>
	/** @type {import('./$types').LayoutProps} */
	let { data, children } = $props();
</script>

<h1>Settings</h1>

<div class="submenu">
	{#each data.sections as section}
		<a href="/settings/{section.slug}">{section.title}</a>
	{/each}
</div>

{@render children()}
```

> [!LEGACY]
> `LayoutProps` was added in 2.16.0. In earlier versions, you had to [type the properties manually instead](#\$types).

You can see how `data` is populated by looking at the `+layout.js` example in the next section just below.

By default, each layout inherits the layout above it. Sometimes that isn't what you want - in this case, [advanced layouts](advanced-routing#Advanced-layouts) can help you.

### +layout.js

Just like `+page.svelte` loading data from `+page.js`, your `+layout.svelte` component can get data from a [`load`](load) function in `+layout.js`.

```js
/// file: src/routes/settings/+layout.js
/** @type {import('./$types').LayoutLoad} */
export function load() {
	return {
		sections: [
			{ slug: 'profile', title: 'Profile' },
			{ slug: 'notifications', title: 'Notifications' }
		]
	};
}
```

If a `+layout.js` exports [page options](page-options) — `prerender`, `ssr` and `csr` — they will be used as defaults for child pages.

Data returned from a layout's `load` function is also available to all its child pages:

```svelte
<!--- file: src/routes/settings/profile/+page.svelte --->
<script>
	/** @type {import('./$types').PageProps} */
	let { data } = $props();

	console.log(data.sections); // [{ slug: 'profile', title: 'Profile' }, ...]
</script>
```

> [!NOTE] Often, layout data is unchanged when navigating between pages. SvelteKit will intelligently rerun [`load`](load) functions when necessary.

### +layout.server.js

To run your layout's `load` function on the server, move it to `+layout.server.js`, and change the `LayoutLoad` type to `LayoutServerLoad`.

Like `+layout.js`, `+layout.server.js` can export [page options](page-options) — `prerender`, `ssr` and `csr`.

## +server

As well as pages, you can define routes with a `+server.js` file (sometimes referred to as an 'API route' or an 'endpoint'), which gives you full control over the response. Your `+server.js` file exports functions corresponding to HTTP verbs like `GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `OPTIONS`, `HEAD`, and `QUERY` that take a [`RequestEvent`](@sveltejs-kit#RequestEvent) argument and return a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) object.

For example we could create an `/api/random-number` route with a `GET` handler:

```js
/// file: src/routes/api/random-number/+server.js
import { error } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export function GET({ url }) {
	const min = Number(url.searchParams.get('min') ?? '0');
	const max = Number(url.searchParams.get('max') ?? '1');

	const d = max - min;

	if (isNaN(d) || d < 0) {
		error(400, 'min and max must be numbers, and min must be less than max');
	}

	const random = min + Math.random() * d;

	return new Response(String(random));
}
```

The first argument to `Response` can be a [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream), making it possible to stream large amounts of data or create server-sent events (unless deploying to platforms that buffer responses, like AWS Lambda).

You can use the [`error`](@sveltejs-kit#error) and [`redirect`](@sveltejs-kit#redirect) methods from `@sveltejs/kit` for convenience (but you don't have to).

If an error is thrown (either `error(...)` or an unexpected error), the response will be a JSON representation of the error or a fallback error page — which can be customised via `src/error.html` — depending on the `Accept` header. The [`+error.svelte`](#error) component will _not_ be rendered in this case. You can read more about error handling [here](errors).

> [!NOTE] When creating an `OPTIONS` handler, note that Vite will inject `Access-Control-Allow-Origin` and `Access-Control-Allow-Methods` headers — these will not be present in production unless you add them.

> [!NOTE] `+layout` files have no effect on `+server.js` files. If you want to run some logic before each request, add it to the server [`handle`](hooks#handle) hook.

### Receiving data

By exporting `POST`/`PUT`/`PATCH`/`DELETE`/`OPTIONS`/`HEAD`/`QUERY` handlers, `+server.js` files can be used to create a complete API:

```svelte
<!--- file: src/routes/add/+page.svelte --->
<script>
	let a = $state(0);
	let b = $state(0);
	let total = $state(0);

	async function add() {
		const response = await fetch('/api/add', {
			method: 'POST',
			body: JSON.stringify({ a, b }),
			headers: {
				'content-type': 'application/json'
			}
		});

		total = await response.json();
	}
</script>

<input type="number" bind:value={a}> +
<input type="number" bind:value={b}> =
{total}

<button onclick={add}>Calculate</button>
```

```js
/// file: src/routes/api/add/+server.js
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	const { a, b } = await request.json();
	return Response.json(a + b);
}
```

> [!NOTE] In general, [form actions](form-actions) are a better way to submit data from the browser to the server.

> [!NOTE] If a `GET` handler is exported, a `HEAD` request will return the `content-length` of the `GET` handler's response body.

### Fallback method handler

Exporting the `fallback` handler will match any unhandled request methods, including methods like `MOVE` which have no dedicated export from `+server.js`.

```js
/// file: src/routes/api/add/+server.js
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	const { a, b } = await request.json();
	return Response.json(a + b);
}

// This handler will respond to PUT, PATCH, DELETE, etc.
/** @type {import('./$types').RequestHandler} */
export async function fallback({ request }) {
	return new Response(`I caught your ${request.method} request!`);
}
```

> [!NOTE] For `HEAD` requests, the `GET` handler takes precedence over the `fallback` handler.

### Content negotiation

`+server.js` files can be placed in the same directory as `+page` files, allowing the same route to be either a page or an API endpoint. To determine which, SvelteKit applies the following rules:

- `PUT`/`PATCH`/`DELETE`/`OPTIONS`/`QUERY` requests are always handled by `+server.js` since they do not apply to pages
- `GET`/`POST`/`HEAD` requests are treated as page requests if the `accept` header prioritises `text/html` (in other words, it's a browser page request), else they are handled by `+server.js`.
- Responses to `GET` requests will include a `Vary: Accept` header, so that proxies and browsers cache HTML and JSON responses separately.

## $types

Throughout the examples above, we've been importing types from a `$types.d.ts` file. This is a file SvelteKit creates for you in a hidden directory if you're using TypeScript (or JavaScript with JSDoc type annotations) to give you type safety when working with your root files.

For example, annotating `let { data } = $props()` with `PageProps` (or `LayoutProps`, for a `+layout.svelte` file) tells TypeScript that the type of `data` is whatever was returned from `load`:

```svelte
<!--- file: src/routes/blog/[slug]/+page.svelte --->
<script>
	/** @type {import('./$types').PageProps} */
	let { data } = $props();
</script>
```

> [!NOTE]
> The `PageProps` and `LayoutProps` types, added in 2.16.0, are a shortcut for typing the `data` prop as `PageData` or `LayoutData`, as well as other props, such as `form` for pages, or `children` for layouts. In earlier versions, you had to type these properties manually. For example, for a page:
>
> ```js
> /// file: +page.svelte
> /** @type {{ data: import('./$types').PageData, form: import('./$types').ActionData }} */
> let { data, form } = $props();
> ```
>
> Or, for a layout:
>
> ```js
> /// file: +layout.svelte
> /** @type {{ data: import('./$types').LayoutData, children: Snippet }} */
> let { data, children } = $props();
> ```

In turn, annotating the `load` function with `PageLoad`, `PageServerLoad`, `LayoutLoad` or `LayoutServerLoad` (for `+page.js`, `+page.server.js`, `+layout.js` and `+layout.server.js` respectively) ensures that `params` and the return value are correctly typed.

If you're using VS Code or any IDE that supports the language server protocol and TypeScript plugins then you can omit these types _entirely_! Svelte's IDE tooling will insert the correct types for you, so you'll get type checking without writing them yourself. It also works with our command line tool `svelte-check`.

You can read more about omitting `$types` in our [blog post](/blog/zero-config-type-safety) about it.

## Other files

Any other files inside a route directory are ignored by SvelteKit. This means you can colocate components and utility modules with the routes that need them.

Files such as +page.test.js, +server.spec.ts and +page.stories.svelte are also ignored, allowing tests and stories to be colocated with route files.

If components and modules are needed by multiple routes, it's a good idea to put them in [`#lib`]($lib).

## Further reading

- [Tutorial: Routing](/tutorial/kit/pages)
- [Tutorial: API routes](/tutorial/kit/get-handlers)
- [Docs: Advanced routing](advanced-routing)

# Loading data

Before a [`+page.svelte`](routing#page-page.svelte) component (and its containing [`+layout.svelte`](routing#layout-layout.svelte) components) can be rendered, we often need to get some data. This is done by defining `load` functions.

## Page data

A `+page.svelte` file can have a sibling `+page.js` that exports a `load` function, the return value of which is available to the page via the `data` prop:

```js
/// file: src/routes/blog/[slug]/+page.js
/** @type {import('./$types').PageLoad} */
export function load({ params }) {
	return {
		post: {
			title: `Title for ${params.slug} goes here`,
			content: `Content for ${params.slug} goes here`
		}
	};
}
```

```svelte
<!--- file: src/routes/blog/[slug]/+page.svelte --->
<script>
	/** @type {import('./$types').PageProps} */
	let { data } = $props();
</script>

<h1>{data.post.title}</h1>
<div>{@html data.post.content}</div>
```

> [!LEGACY]
> Before version 2.16.0, the props of a page and layout had to be typed individually:
> ```js
> /// file: +page.svelte
> /** @type {{ data: import('./$types').PageData }} */
> let { data } = $props();
> ```
>
> In Svelte 4, you'd use `export let data` instead.

Thanks to the generated `$types` module, we get full type safety.

A `load` function in a `+page.js` file runs both on the server and in the browser (unless combined with `export const ssr = false`, in which case it will [only run in the browser](page-options#ssr)). If your `load` function should _always_ run on the server (because it uses private environment variables, for example, or accesses a database) then it would go in a `+page.server.js` instead.

A more realistic version of your blog post's `load` function, that only runs on the server and pulls data from a database, might look like this:

```js
/// file: src/routes/blog/[slug]/+page.server.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function getPost(slug: string): Promise<{ title: string, content: string }>
}

// @filename: index.js
// ---cut---
import * as db from '#lib/server/database.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	return {
		post: await db.getPost(params.slug)
	};
}
```

Notice that the type changed from `PageLoad` to `PageServerLoad`, because server `load` functions can access additional arguments. To understand when to use `+page.js` and when to use `+page.server.js`, see [Universal vs server](load#Universal-vs-server).

## Layout data

Your `+layout.svelte` files can also load data, via `+layout.js` or `+layout.server.js`.

```js
/// file: src/routes/blog/[slug]/+layout.server.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function getPostSummaries(): Promise<Array<{ title: string, slug: string }>>
}

// @filename: index.js
// ---cut---
import * as db from '#lib/server/database.js';

/** @type {import('./$types').LayoutServerLoad} */
export async function load() {
	return {
		posts: await db.getPostSummaries()
	};
}
```

```svelte
<!--- file: src/routes/blog/[slug]/+layout.svelte --->
<script>
	/** @type {import('./$types').LayoutProps} */
	let { data, children } = $props();
</script>

<main>
	<!-- +page.svelte is `@render`ed here -->
	{@render children()}
</main>

<aside>
	<h2>More posts</h2>
	<ul>
		{#each data.posts as post}
			<li>
				<a href="/blog/{post.slug}">
					{post.title}
				</a>
			</li>
		{/each}
	</ul>
</aside>
```

> [!LEGACY]
> `LayoutProps` was added in 2.16.0. In earlier versions, properties had to be typed individually:
> ```js
> /// file: +layout.svelte
> /** @type {{ data: import('./$types').LayoutData, children: Snippet }} */
> let { data, children } = $props();
> ```

Data returned from layout `load` functions is available to child `+layout.svelte` components and the `+page.svelte` component as well as the layout that it 'belongs' to.

```svelte
/// file: src/routes/blog/[slug]/+page.svelte
<script>
	+++import { page } from '$app/state';+++

	/** @type {import('./$types').PageProps} */
	let { data } = $props();

+++	// we can access `data.posts` because it's returned from
	// the parent layout `load` function
	let index = $derived(data.posts.findIndex(post => post.slug === page.params.slug));
	let next = $derived(data.posts[index + 1]);+++
</script>

<h1>{data.post.title}</h1>
<div>{@html data.post.content}</div>

+++{#if next}
	<p>Next post: <a href="/blog/{next.slug}">{next.title}</a></p>
{/if}+++
```

> [!NOTE] If multiple `load` functions return data with the same key, the last one 'wins' — the result of a layout `load` returning `{ a: 1, b: 2 }` and a page `load` returning `{ b: 3, c: 4 }` would be `{ a: 1, b: 3, c: 4 }`.

## page.data

The `+page.svelte` component, and each `+layout.svelte` component above it, has access to its own data plus all the data from its parents.

In some cases, we might need the opposite — a parent layout might need to access page data or data from a child layout. For example, the root layout might want to access a `title` property returned from a `load` function in `+page.js` or `+page.server.js`. This can be done with `page.data`:

```svelte
<!--- file: src/routes/+layout.svelte --->
<script>
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.data.title}</title>
</svelte:head>
```

Type information for `page.data` is provided by `App.PageData`.

## Universal vs server

As we've seen, there are two types of `load` function:

* `+page.js` and `+layout.js` files export _universal_ `load` functions that run both on the server and in the browser
* `+page.server.js` and `+layout.server.js` files export _server_ `load` functions that only run server-side

Conceptually, they're the same thing, but there are some important differences to be aware of.

### When does which load function run?

Server `load` functions _always_ run on the server.

By default, universal `load` functions run on the server during SSR when the user first visits your page. They will then run again during hydration, reusing any responses from [fetch requests](#Making-fetch-requests). All subsequent invocations of universal `load` functions happen in the browser. You can customize the behavior through [page options](page-options). If you disable [server-side rendering](page-options#ssr), you'll get an SPA and universal `load` functions _always_ run on the client.

If a route contains both universal and server `load` functions, the server `load` runs first.

A `load` function is invoked at runtime, unless you [prerender](page-options#prerender) the page — in that case, it's invoked at build time.

### Input

Both universal and server `load` functions have access to properties describing the request (`params`, `route` and `url`) and various functions (`fetch`, `setHeaders`, `parent`, `depends` and `untrack`). These are described in the following sections.

Server `load` functions are called with a `ServerLoadEvent`, which inherits `cookies`, `getClientAddress`, `locals`, `platform` and `request` from `RequestEvent`.

Universal `load` functions are called with a `LoadEvent`, which has a `data` property. If you have `load` functions in both `+page.js` and `+page.server.js` (or `+layout.js` and `+layout.server.js`), the return value of the server `load` function is the `data` property of the universal `load` function's argument.

### Output

A universal `load` function can return an object containing any values, including things like custom classes and component constructors.

A server `load` function must return data that can be serialized with [devalue](https://github.com/rich-harris/devalue) — anything that can be represented as JSON plus things like `BigInt`, `Date`, `Map`, `Set` and `RegExp`, or repeated/cyclical references — so that it can be transported over the network. Your data can include [promises](#Streaming-with-promises), in which case it will be streamed to browsers. If you need to serialize/deserialize custom types, use [transport hooks](hooks#transport).

### When to use which

Server `load` functions are convenient when you need to access data directly from a database or filesystem, or need to use private environment variables.

Universal `load` functions are useful when you need to `fetch` data from an external API and don't need private credentials, since SvelteKit can get the data directly from the API rather than going via your server. They are also useful when you need to return something that can't be serialized, such as a Svelte component constructor.

In rare cases, you might need to use both together — for example, you might need to return an instance of a custom class that was initialised with data from your server. When using both, the server `load` return value is _not_ passed directly to the page, but to the universal `load` function (as the `data` property):

```js
/// file: src/routes/+page.server.js
/** @type {import('./$types').PageServerLoad} */
export async function load() {
	return {
		serverMessage: 'hello from server load function'
	};
}
```

```js
/// file: src/routes/+page.js
// @errors: 18047
/** @type {import('./$types').PageLoad} */
export async function load({ data }) {
	return {
		serverMessage: data.serverMessage,
		universalMessage: 'hello from universal load function'
	};
}
```

## Using URL data

Often the `load` function depends on the URL in one way or another. For this, the `load` function provides you with `url`, `route` and `params`.

### url

An instance of [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL), containing properties like the `origin`, `hostname`, `pathname` and `searchParams` (which contains the parsed query string as a [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) object). `url.hash` cannot be accessed during `load`, since it is unavailable on the server.

> [!NOTE] In some environments this is derived from request headers during server-side rendering. If you're using [adapter-node](adapter-node), for example, you may need to configure the adapter in order for the URL to be correct.

### route

Contains the name of the current route directory, relative to `src/routes`:

```js
/// file: src/routes/a/[b]/[...c]/+page.js
/** @type {import('./$types').PageLoad} */
export function load({ route }) {
	console.log(route.id); // '/a/[b]/[...c]'
}
```

### params

`params` is derived from `url.pathname` and `route.id`.

Given a `route.id` of `/a/[b]/[...c]` and a `url.pathname` of `/a/x/y/z`, the `params` object would look like this:

```json
{
	"b": "x",
	"c": "y/z"
}
```

## Making fetch requests

To get data from an external API or a `+server.js` handler, you can use the provided `fetch` function, which behaves identically to the [native `fetch` web API](https://developer.mozilla.org/en-US/docs/Web/API/fetch) with a few additional features:

- It can be used to make credentialed requests on the server, as it inherits the `cookie` and `authorization` headers for the page request.
- It can make relative requests on the server (ordinarily, `fetch` requires a URL with an origin when used in a server context).
- Internal requests (e.g. for `+server.js` routes) go directly to the handler function when running on the server, without the overhead of an HTTP call.
- During server-side rendering, the response will be captured and inlined into the rendered HTML by hooking into the `text`, `json` and `arrayBuffer` methods of the `Response` object. Note that headers will _not_ be serialized, unless explicitly included via [`filterSerializedResponseHeaders`](hooks#handle).
- During hydration, the response will be read from the HTML, guaranteeing consistency and preventing an additional network request - if you received a warning in your browser console when using the browser `fetch` instead of the `load` `fetch`, this is why.

```js
/// file: src/routes/items/[id]/+page.js
/** @type {import('./$types').PageLoad} */
export async function load({ fetch, params }) {
	const res = await fetch(`/api/items/${params.id}`);
	const item = await res.json();

	return { item };
}
```

## Cookies

A server `load` function can get [`cookies`](@sveltejs-kit#Cookies) as shown below. When setting cookies, SvelteKit provides default values for `httpOnly`, `secure`, and `path` — as described in [the API documentation](@sveltejs-kit#Cookies) — in order to improve security and developer experience.

```js
/// file: src/routes/+layout.server.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function getUser(sessionid: string | undefined): Promise<{ name: string, avatar: string }>
}

// @filename: index.js
// ---cut---
import * as db from '#lib/server/database.js';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ cookies }) {
	const sessionid = cookies.get('sessionid');

	return {
		user: await db.getUser(sessionid)
	};
}
```

Cookies will only be passed through the provided `fetch` function if the target host is the same as the SvelteKit application or a more specific subdomain of it.

For example, if SvelteKit is serving my.domain.com:
- domain.com WILL NOT receive cookies
- my.domain.com WILL receive cookies
- api.domain.com WILL NOT receive cookies
- sub.my.domain.com WILL receive cookies

Other cookies will not be passed when `credentials: 'include'` is set, because SvelteKit does not know which domain which cookie belongs to (the browser does not pass this information along), so it's not safe to forward any of them. Use the [handleFetch hook](hooks#handleFetch) to work around it.

## Headers

Both server and universal `load` functions have access to a `setHeaders` function that, when running on the server, can set headers for the response. (When running in the browser, `setHeaders` has no effect.) This is useful if you want the page to be cached, for example:

```js
// @errors: 2322 1360
/// file: src/routes/products/+page.js
/** @type {import('./$types').PageLoad} */
export async function load({ fetch, setHeaders }) {
	const url = `https://cms.example.com/products.json`;
	const response = await fetch(url);

	// Headers are only set during SSR, caching the page's HTML
	// for the same length of time as the underlying data.
	setHeaders({
		age: response.headers.get('age'),
		'cache-control': response.headers.get('cache-control')
	});

	return response.json();
}
```

Setting the same header multiple times (even in separate `load` functions) is an error. You can only set a given header once using the `setHeaders` function. You cannot add a `set-cookie` header with `setHeaders` — use `cookies.set(name, value, options)` instead.

## Using parent data

Occasionally it's useful for a `load` function to access data from a parent `load` function, which can be done with `await parent()`:

```js
/// file: src/routes/+layout.js
/** @type {import('./$types').LayoutLoad} */
export function load() {
	return { a: 1 };
}
```

```js
/// file: src/routes/abc/+layout.js
/** @type {import('./$types').LayoutLoad} */
export async function load({ parent }) {
	const { a } = await parent();
	return { b: a + 1 };
}
```

```js
/// file: src/routes/abc/+page.js
/** @type {import('./$types').PageLoad} */
export async function load({ parent }) {
	const { a, b } = await parent();
	return { c: a + b };
}
```

```svelte
<!--- file: src/routes/abc/+page.svelte --->
<script>
	/** @type {import('./$types').PageProps} */
	let { data } = $props();
</script>

<!-- renders `1 + 2 = 3` -->
<p>{data.a} + {data.b} = {data.c}</p>
```

> [!NOTE] Notice that the `load` function in `+page.js` receives the merged data from both layout `load` functions, not just the immediate parent.

Inside `+page.server.js` and `+layout.server.js`, `parent` returns data from parent `+layout.server.js` files.

In `+page.js` or `+layout.js` it will return data from parent `+layout.js` files. However, a missing `+layout.js` is treated as a `({ data }) => data` function, meaning that it will also return data from parent `+layout.server.js` files that are not 'shadowed' by a `+layout.js` file

Take care not to introduce waterfalls when using `await parent()`. Here, for example, `getData(params)` does not depend on the result of calling `parent()`, so we should call it first to avoid a delayed render.

```js
/// file: +page.js
// @filename: ambient.d.ts
declare function getData(params: Record<string, string>): Promise<{ meta: any }>

// @filename: index.js
// ---cut---
/** @type {import('./$types').PageLoad} */
export async function load({ params, parent }) {
	---const parentData = await parent();---
	const data = await getData(params);
	+++const parentData = await parent();+++

	return {
		...data,
		meta: { ...parentData.meta, ...data.meta }
	};
}
```

## Errors

If an error is thrown during `load`, the nearest [`+error.svelte`](routing#error) will be rendered. For [app errors](errors#App-errors), use the `error` helper from `@sveltejs/kit` to specify the HTTP status code and an optional message:

```js
/// file: src/routes/admin/+layout.server.js
// @filename: ambient.d.ts
declare namespace App {
	interface Locals {
		user?: {
			name: string;
			isAdmin: boolean;
		}
	}
}

// @filename: index.js
// ---cut---
import { error } from '@sveltejs/kit';

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
	if (!locals.user) {
		error(401, 'not logged in');
	}

	if (!locals.user.isAdmin) {
		error(403, 'not an admin');
	}
}
```

Calling `error(...)` will throw an exception, making it easy to stop execution from inside helper functions.

Every error is passed to the [`handleError`](hooks#handleError) hook. An [unknown error](errors#Unknown-errors) is treated as a 500 Internal Error unless the hook says otherwise.

> [!NOTE] [In SvelteKit 1.x](migrating-to-sveltekit-2#redirect-and-error-are-no-longer-thrown-by-you) you had to `throw` the error yourself

## Redirects

To redirect users, use the `redirect` helper from `@sveltejs/kit` to specify the location to which they should be redirected alongside a `3xx` status code. Like `error(...)`, calling `redirect(...)` will throw an exception, making it easy to stop execution from inside helper functions.

```js
/// file: src/routes/user/+layout.server.js
// @filename: ambient.d.ts
declare namespace App {
	interface Locals {
		user?: {
			name: string;
		}
	}
}

// @filename: index.js
// ---cut---
import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
	if (!locals.user) {
		redirect(307, '/login');
	}
}
```

> [!NOTE] Don't use `redirect()` inside a `try {...}` block, as the redirect will immediately trigger the catch statement.

In the browser, you can also navigate programmatically outside of a `load` function using [`goto`]($app-navigation#goto) from [`$app.navigation`]($app-navigation).

> [!NOTE] [In SvelteKit 1.x](migrating-to-sveltekit-2#redirect-and-error-are-no-longer-thrown-by-you) you had to `throw` the `redirect` yourself

## Streaming with promises

When using a server `load`, promises will be streamed to the browser as they resolve. This is useful if you have slow, non-essential data, since you can start rendering the page before all the data is available:

```js
/// file: src/routes/blog/[slug]/+page.server.js
// @filename: ambient.d.ts
declare global {
	const loadPost: (slug: string) => Promise<{ title: string, content: string }>;
	const loadComments: (slug: string) => Promise<{ content: string }>;
}

export {};

// @filename: index.js
// ---cut---
/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	return {
		// make sure the `await` happens at the end, otherwise we
		// can't start loading comments until we've loaded the post
		comments: loadComments(params.slug),
		post: await loadPost(params.slug)
	};
}
```

This is useful for creating skeleton loading states, for example:

```svelte
<!--- file: src/routes/blog/[slug]/+page.svelte --->
<script>
	/** @type {import('./$types').PageProps} */
	let { data } = $props();
</script>

<h1>{data.post.title}</h1>
<div>{@html data.post.content}</div>

{#await data.comments}
	Loading comments...
{:then comments}
	{#each comments as comment}
		<p>{comment.content}</p>
	{/each}
{:catch error}
	<p>error loading comments: {error.message}</p>
{/await}
```

When streaming data, be careful to handle promise rejections correctly. More specifically, the server could crash with an "unhandled promise rejection" error if a lazy-loaded promise fails before rendering starts (at which point it's caught) and isn't handling the error in some way. When using SvelteKit's `fetch` directly in the `load` function, SvelteKit will handle this case for you. For other promises, it is enough to attach a noop-`catch` to the promise to mark it as handled.

```js
/// file: src/routes/+page.server.js
/** @type {import('./$types').PageServerLoad} */
export function load({ fetch }) {
	const ok_manual = Promise.reject();
	ok_manual.catch(() => {});

	return {
		ok_manual,
		ok_fetch: fetch('/fetch/that/could/fail'),
		dangerous_unhandled: Promise.reject()
	};
}
```

> [!NOTE] On platforms that do not support streaming, such as AWS Lambda or Firebase, responses will be buffered. This means the page will only render once all promises resolve. If you are using a proxy (e.g. NGINX), make sure it does not buffer responses from the proxied server.

> [!NOTE] Streaming data will only work when JavaScript is enabled. You should avoid returning promises from a universal `load` function if the page is server rendered, as these are _not_ streamed — instead, the promise is recreated when the function reruns in the browser.

> [!NOTE] The headers and status code of a response cannot be changed once the response has started streaming, therefore you cannot `setHeaders` or throw redirects inside a streamed promise.

> [!NOTE] [In SvelteKit 1.x](migrating-to-sveltekit-2#Top-level-promises-are-no-longer-awaited) top-level promises were automatically awaited, only nested promises were streamed.

## Parallel loading

When rendering (or navigating to) a page, SvelteKit runs all `load` functions concurrently, avoiding a waterfall of requests. During client-side navigation, the result of calling multiple server `load` functions are grouped into a single response. Once all `load` functions have returned, the page is rendered.

## Rerunning load functions

SvelteKit tracks the dependencies of each `load` function to avoid rerunning it unnecessarily during navigation.

For example, given a pair of `load` functions like these...

```js
/// file: src/routes/blog/[slug]/+page.server.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function getPost(slug: string): Promise<{ title: string, content: string }>
}

// @filename: index.js
// ---cut---
import * as db from '#lib/server/database.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	return {
		post: await db.getPost(params.slug)
	};
}
```

```js
/// file: src/routes/blog/[slug]/+layout.server.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function getPostSummaries(): Promise<Array<{ title: string, slug: string }>>
}

// @filename: index.js
// ---cut---
import * as db from '#lib/server/database.js';

/** @type {import('./$types').LayoutServerLoad} */
export async function load() {
	return {
		posts: await db.getPostSummaries()
	};
}
```

...the one in `+page.server.js` will rerun if we navigate from `/blog/trying-the-raw-meat-diet` to `/blog/i-regret-my-choices` because `params.slug` has changed. The one in `+layout.server.js` will not, because the data is still valid. In other words, we won't call `db.getPostSummaries()` a second time.

A `load` function that calls `await parent()` will also rerun if a parent `load` function is rerun.

Dependency tracking does not apply _after_ the `load` function has returned — for example, accessing `params.x` inside a nested [promise](#Streaming-with-promises) will not cause the function to rerun when `params.x` changes. (Don't worry, you'll get a warning in development if you accidentally do this.) Instead, access the parameter in the main body of your `load` function.

Search parameters are tracked independently from the rest of the url. For example, accessing `event.url.searchParams.get("x")` inside a `load` function will make that `load` function re-run when navigating from `?x=1` to `?x=2`, but not when navigating from `?x=1&y=1` to `?x=1&y=2`.

### Untracking dependencies

In rare cases, you may wish to exclude something from the dependency tracking mechanism. You can do this with the provided `untrack` function:

```js
/// file: src/routes/+page.js
/** @type {import('./$types').PageLoad} */
export async function load({ untrack, url }) {
	// Untrack url.pathname so that path changes don't trigger a rerun
	if (untrack(() => url.pathname === '/')) {
		return { message: 'Welcome!' };
	}
}
```

### Manual invalidation

You can also rerun `load` functions that apply to the current page using [`invalidate(url)`]($app-navigation#invalidate), which reruns all `load` functions that depend on `url`, and [`refreshAll()`]($app-navigation#refreshAll), which reruns every `load` function and all active queries. Server load functions will never automatically depend on a fetched `url` to avoid leaking secrets to the client.

> [!NOTE] `refreshAll` does _not_ reset `page.state`, unlike its deprecated predecessor `invalidateAll`.

A `load` function depends on `url` if it calls `fetch(url)` or `depends(url)`. Note that `url` can be a custom identifier that starts with `[a-z]:`:

```js
/// file: src/routes/random-number/+page.js
/** @type {import('./$types').PageLoad} */
export async function load({ fetch, depends }) {
	// load reruns when `invalidate('https://api.example.com/random-number')` is called...
	const response = await fetch('https://api.example.com/random-number');

	// ...or when `invalidate('app:random')` is called
	depends('app:random');

	return {
		number: await response.json()
	};
}
```

```svelte
<!--- file: src/routes/random-number/+page.svelte --->
<script>
	import { invalidate, refreshAll } from '$app/navigation';

	/** @type {import('./$types').PageProps} */
	let { data } = $props();

	function rerunLoadFunction() {
		// any of these will cause the `load` function to rerun
		invalidate('app:random');
		invalidate('https://api.example.com/random-number');
		invalidate(url => url.href.includes('random-number'));
		refreshAll();
	}
</script>

<p>random number: {data.number}</p>
<button onclick={rerunLoadFunction}>Update random number</button>
```

### When do load functions rerun?

To summarize, a `load` function will rerun in the following situations:

- It references a property of `params` whose value has changed
- It references a property of `url` (such as `url.pathname` or `url.search`) whose value has changed. Properties in `request.url` are _not_ tracked
- It calls `url.searchParams.get(...)`, `url.searchParams.getAll(...)` or `url.searchParams.has(...)` and the parameter in question changes. Accessing other properties of `url.searchParams` will have the same effect as accessing `url.search`.
- It calls `await parent()` and a parent `load` function reran
- A child server `load` function calls `await parent()` and is rerunning, and the parent is also a server `load` function. A universal `load` function that calls `await parent()` reuses the parent's existing data instead
- It declared a dependency on a specific URL via [`fetch`](#Making-fetch-requests) (universal load only) or [`depends`](@sveltejs-kit#LoadEvent), and that URL was marked invalid with [`invalidate(url)`]($app-navigation#invalidate)
- All active `load` functions were forcibly rerun with [`refreshAll()`]($app-navigation#refreshAll)

`params` and `url` can change in response to a `<a href="..">` link click, a [`<form>` interaction](form-actions#GET-vs-POST), a [`goto`]($app-navigation#goto) invocation, or a [`redirect`](@sveltejs-kit#redirect).

Note that rerunning a `load` function will update the `data` prop inside the corresponding `+layout.svelte` or `+page.svelte`; it does _not_ cause the component to be recreated. As a result, internal state is preserved. If this isn't what you want, you can reset whatever you need to reset inside an [`afterNavigate`]($app-navigation#afterNavigate) callback, and/or wrap your component in a [`{#key ...}`](../svelte/key) block.

## Implications for authentication

A couple features of loading data have important implications for auth checks:
- Layout `load` functions do not run on every request, such as during client side navigation between child routes. [(When do load functions rerun?)](load#Rerunning-load-functions-When-do-load-functions-rerun)
- Layout and page `load` functions run concurrently unless `await parent()` is called. If a layout `load` throws, the page `load` function runs, but the client will not receive the returned data.

There are a few possible strategies to ensure an auth check occurs before protected code.

To prevent data waterfalls and preserve layout `load` caches:
- Use the [`handle`](auth#Integration-points-Protecting-multiple-routes) hook to protect multiple routes, before any `load` functions run
- Use auth guards directly in `+page.server.js` `load` functions for route specific protection

Putting an auth guard in `+layout.server.js` requires all child pages to call `await parent()` before protected code. Unless every child page depends on returned data from `await parent()`, the other options will be more performant.

## Using `getRequestEvent`

When running server `load` functions, the `event` object passed to the function as an argument can also be retrieved with [`getRequestEvent`]($app-server#getRequestEvent). This allows shared logic (such as authentication guards) to access information about the current request without it needing to be passed around.

For example, you might have a function that requires users to be logged in, and redirects them to `/login` if not:

```js
/// file: src/lib/server/auth.js
// @filename: ambient.d.ts
interface User {
	name: string;
}

declare namespace App {
	interface Locals {
		user?: User;
	}
}

// @filename: index.ts
// ---cut---
import { redirect } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';

export function requireLogin() {
	const { locals, url } = getRequestEvent();

	// assume `locals.user` is populated in `handle`
	if (!locals.user) {
		const redirectTo = url.pathname + url.search;
		const params = new URLSearchParams({ redirectTo });

		redirect(303, `/login?${params}`);
	}

	return locals.user;
}
```

Now, you can call `requireLogin` in any `load` function (or [form action](form-actions), for example) to guarantee that the user is logged in:

```js
/// file: +page.server.js
// @filename: ambient.d.ts

declare module '#lib/server/auth.js' {
	interface User {
		name: string;
	}

	export function requireLogin(): User;
}

// @filename: index.ts
// ---cut---
import { requireLogin } from '#lib/server/auth.js';

export function load() {
	const user = requireLogin();

	// `user` is guaranteed to be a user object here, because otherwise
	// `requireLogin` would throw a redirect and we wouldn't get here
	return {
		message: `hello ${user.name}!`
	};
}
```

## Further reading

- [Tutorial: Loading data](/tutorial/kit/page-data)
- [Tutorial: Errors and redirects](/tutorial/kit/error-basics)
- [Tutorial: Advanced loading](/tutorial/kit/await-parent)

# Form actions

A `+page.server.js` file can export _actions_, which allow you to `POST` data to the server using the `<form>` element.

When using `<form>`, client-side JavaScript is optional, but you can easily _progressively enhance_ your form interactions with JavaScript to provide the best user experience.

> [!NOTE] The experimental [`form` remote function](remote-functions#form) covers the same use cases as form actions, adding type safety and [single-flight mutations](remote-functions#Single-flight-mutations). Form actions are feature-complete and will continue to work, but new development is focused on remote functions, which are intended to become the recommended way to communicate with the server. Consider remote functions for new projects, keeping in mind that the API may change while the feature is experimental.

## Default actions

In the simplest case, a page declares a `default` action:

```js
/// file: src/routes/login/+page.server.js
/** @satisfies {import('./$types').Actions} */
export const actions = {
	default: async (event) => {
		// TODO log the user in
	}
};
```

To invoke this action from the `/login` page, just add a `<form>` — no JavaScript needed:

```svelte
<!--- file: src/routes/login/+page.svelte --->
<form method="POST">
	<label>
		Email
		<input name="email" type="email">
	</label>
	<label>
		Password
		<input name="password" type="password">
	</label>
	<button>Log in</button>
</form>
```

If someone were to click the button, the browser would send the form data via `POST` request to the server, running the default action.

> [!NOTE] Actions always use `POST` requests, since `GET` requests should never have side-effects.

We can also invoke the action from other pages (for example if there's a login widget in the nav in the root layout) by adding the `action` attribute, pointing to the page:

```html
/// file: src/routes/+layout.svelte
<form method="POST" action="/login">
	<!-- content -->
</form>
```

Submitting this form takes you to `/login`, whether the action succeeds or fails — that's what the browser does, and [`use:enhance`](#Progressive-enhancement-use:enhance) emulates it. If you'd rather stay where you are and handle the result in place, there's a recipe for that in the [progressive enhancement](#Progressive-enhancement-use:enhance) section.

## Named actions

Instead of one `default` action, a page can have as many named actions as it needs:

```js
/// file: src/routes/login/+page.server.js
/** @satisfies {import('./$types').Actions} */
export const actions = {
---	default: async (event) => {---
+++	login: async (event) => {+++
		// TODO log the user in
	},
+++	register: async (event) => {
		// TODO register the user
	}+++
};
```

To invoke a named action, add a query parameter with the name prefixed by a `/` character:

```svelte
<!--- file: src/routes/login/+page.svelte --->
<form method="POST" action="?/register">
```

```svelte
<!--- file: src/routes/+layout.svelte --->
<form method="POST" action="/login?/register">
```

As well as the `action` attribute, we can use the `formaction` attribute on a button to `POST` the same form data to a different action than the parent `<form>`:

```svelte
/// file: src/routes/login/+page.svelte
<form method="POST" +++action="?/login"+++>
	<label>
		Email
		<input name="email" type="email">
	</label>
	<label>
		Password
		<input name="password" type="password">
	</label>
	<button>Log in</button>
	+++<button formaction="?/register">Register</button>+++
</form>
```

> [!NOTE] We can't have default actions next to named actions, because if you POST to a named action without a redirect, the query parameter is persisted in the URL, which means the next default POST would go through the named action from before.

## Anatomy of an action

Each action receives a `RequestEvent` object, allowing you to read the data with `request.formData()`. After processing the request (for example, logging the user in by setting a cookie), the action can respond with data that will be available through the `form` property on the corresponding page and through `page.form` app-wide until the next update.

```js
/// file: src/routes/login/+page.server.js
// @filename: ambient.d.ts
declare module '#lib/server/db.js';

// @filename: index.js
// ---cut---
import * as db from '#lib/server/db.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ cookies }) {
	const user = await db.getUserFromSession(cookies.get('sessionid'));
	return { user };
}

/** @satisfies {import('./$types').Actions} */
export const actions = {
	login: async ({ cookies, request }) => {
		const data = await request.formData();
		const email = data.get('email');
		const password = data.get('password');

		const user = await db.getUser(email);
		cookies.set('sessionid', await db.createSession(user));

		return { success: true };
	},
	register: async (event) => {
		// TODO register the user
	}
};
```

```svelte
<!--- file: src/routes/login/+page.svelte --->
<script>
	/** @type {import('./$types').PageProps} */
	let { data, form } = $props();
</script>

{#if form?.success}
	<!-- this message is ephemeral; it exists because the page was rendered in
	       response to a form submission. it will vanish if the user reloads -->
	<p>Successfully logged in! Welcome back, {data.user.name}</p>
{/if}
```

> [!LEGACY]
> `PageProps` was added in 2.16.0. In earlier versions, you had to type the `data` and `form` properties individually:
> ```js
> /// file: +page.svelte
> /** @type {{ data: import('./$types').PageData, form: import('./$types').ActionData }} */
> let { data, form } = $props();
> ```
>
> In Svelte 4, you'd use `export let data` and `export let form` instead to declare properties.

### Validation errors

If the request couldn't be processed because of invalid data, you can return validation errors — along with the previously submitted form values — back to the user so that they can try again. The `fail` function lets you return an HTTP status code (typically 400 or 422, in the case of validation errors) along with the data. The status code is available through `page.status` and the data through `form`:

When using `use:enhance` (or making a `fetch` request with the `accept: application/json` header), the HTTP response status code will match the status code passed to `fail`. When an action returns data, the response will have status 200, and when it returns nothing (i.e. `undefined`), the response will have status 204. This makes it easier to track form submission outcomes using observability tools.

```js
/// file: src/routes/login/+page.server.js
// @filename: ambient.d.ts
declare module '#lib/server/db.js';

// @filename: index.js
// ---cut---
+++import { fail } from '@sveltejs/kit';+++
import * as db from '#lib/server/db.js';

/** @satisfies {import('./$types').Actions} */
export const actions = {
	login: async ({ cookies, request }) => {
		const data = await request.formData();
		const email = data.get('email');
		const password = data.get('password');

+++		if (!email) {
			return fail(400, { email, missing: true });
		}+++

		const user = await db.getUser(email);

+++		if (!user || user.password !== db.hash(password)) {
			return fail(400, { email, incorrect: true });
		}+++

		cookies.set('sessionid', await db.createSession(user));

		return { success: true };
	},
	register: async (event) => {
		// TODO register the user
	}
};
```

> [!NOTE] Note that as a precaution, we only return the email back to the page — not the password.

```svelte
/// file: src/routes/login/+page.svelte
<form method="POST" action="?/login">
+++	{#if form?.missing}<p class="error">The email field is required</p>{/if}
	{#if form?.incorrect}<p class="error">Invalid credentials!</p>{/if}+++
	<label>
		Email
		<input name="email" type="email" +++value={form?.email ?? ''}+++>
	</label>
	<label>
		Password
		<input name="password" type="password">
	</label>
	<button>Log in</button>
	<button formaction="?/register">Register</button>
</form>
```

The returned data must be serializable as JSON. Beyond that, the structure is entirely up to you. For example, if you had multiple forms on the page, you could distinguish which `<form>` the returned `form` data referred to with an `id` property or similar.

### Redirects

Redirects (and errors) work exactly the same as in [`load`](load#Redirects):

```js
// @errors: 2345
/// file: src/routes/login/+page.server.js
// @filename: ambient.d.ts
declare module '#lib/server/db.js';

// @filename: index.js
// ---cut---
import { fail, +++redirect+++ } from '@sveltejs/kit';
import * as db from '#lib/server/db.js';

/** @satisfies {import('./$types').Actions} */
export const actions = {
	login: async ({ cookies, request, +++url+++ }) => {
		const data = await request.formData();
		const email = data.get('email');
		const password = data.get('password');

		const user = await db.getUser(email);
		if (!user) {
			return fail(400, { email, missing: true });
		}

		if (user.password !== db.hash(password)) {
			return fail(400, { email, incorrect: true });
		}

		cookies.set('sessionid', await db.createSession(user));

+++		if (url.searchParams.has('redirectTo')) {
			redirect(303, url.searchParams.get('redirectTo'));
		}+++

		return { success: true };
	},
	register: async (event) => {
		// TODO register the user
	}
};
```

## Loading data

After an action runs, the page will be re-rendered (unless a redirect or an unexpected error occurs), with the action's return value available to the page as the `form` prop. This means that your page's `load` functions will run after the action completes.

Note that `handle` runs before the action is invoked, and does not rerun before the `load` functions. This means that if, for example, you use `handle` to populate `event.locals` based on a cookie, you must update `event.locals` when you set or delete the cookie in an action:

```js
/// file: src/hooks.server.js
// @filename: ambient.d.ts
declare namespace App {
	interface Locals {
		user: {
			name: string;
		} | null
	}
}

// @filename: global.d.ts
declare global {
	function getUser(sessionid: string | undefined): {
		name: string;
	};
}

export {};

// @filename: index.js
// ---cut---
/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle({ event, resolve }) {
	event.locals.user = await getUser(event.cookies.get('sessionid'));
	return resolve(event);
}
```

```js
/// file: src/routes/account/+page.server.js
// @filename: ambient.d.ts
declare namespace App {
	interface Locals {
		user: {
			name: string;
		} | null
	}
}

// @filename: index.js
// ---cut---
/** @type {import('./$types').PageServerLoad} */
export function load(event) {
	return {
		user: event.locals.user
	};
}

/** @satisfies {import('./$types').Actions} */
export const actions = {
	logout: async (event) => {
		event.cookies.delete('sessionid');
		event.locals.user = null;
	}
};
```

## Progressive enhancement

In the preceding sections we built a `/login` action that [works without client-side JavaScript](https://kryogenix.org/code/browser/everyonehasjs.html) — not a `fetch` in sight. That's great, but when JavaScript _is_ available we can progressively enhance our form interactions to provide a better user experience.

### use:enhance

The easiest way to progressively enhance a form is to add the `use:enhance` action:

```svelte
/// file: src/routes/login/+page.svelte
<script>
	+++import { enhance } from '$app/forms';+++

	/** @type {import('./$types').PageProps} */
	let { form } = $props();
</script>

<form method="POST" +++use:enhance+++>
```

> [!NOTE] `use:enhance` can only be used with forms that have `method="POST"` and point to actions defined in a `+page.server.js` file. It will not work with `method="GET"`, which is the default for forms without a specified method. Attempting to use `use:enhance` on forms without `method="POST"` or posting to a `+server.js` endpoint will result in an error.

> [!NOTE] Yes, it's a little confusing that the `enhance` action and `<form action>` are both called 'action'. These docs are action-packed. Sorry.

Without an argument, `use:enhance` will emulate the browser-native behaviour, just without the full-page reloads. It will:

- if the action is on the page you're submitting from, emulate a reload of the current page — updating the `form` property, `page.form` and `page.status` on a successful or invalid response
- if the action is on a different page (for example `<form action="/somewhere/else" ..>`), navigate to the action's URL on a successful _or_ invalid response, populating that page's `form` property and `page.status`, just as a native submission would. A new history entry is pushed
- reset the `<form>` element
- refresh all data using `refreshAll` on a successful response
- call `goto` on a redirect response
- render the nearest `+error` boundary if an unexpected error occurs — the boundary nearest the _action's_ route, if the action is on a different page
- [reset focus](accessibility#Focus-management) to the appropriate element

> [!NOTE] Two details are worth knowing about the URL:
>
> Where a submission lands is `result.location` — the form's `action` with the `?/actionName` parameter removed, since that parameter has done its job once the action has run. `action="/login?/do-login"` lands on `/login`, and any other query parameters are kept, so `action="/login?redirectTo=/dashboard&/do-login"` lands on `/login?redirectTo=/dashboard`. The destination's `load` functions see that URL via `url.search`.
>
> Two consequences worth knowing:
>
> - A _relative_ action replaces the entire query string as a side effect of URL resolution — `action="?/delete"` on `/items?page=2` resolves to `/items?/delete`, so both enhanced and native submissions drop `page=2`. Write `action="?page=2&/delete"` to preserve it.
> - Without JavaScript the browser can't strip anything, so an unenhanced submission leaves you on the raw action URL (`/login?/do-login`). Reloading that URL is a plain `GET`, which doesn't re-run the action and renders the page normally, so the difference is cosmetic — but a `load` function can observe a different `url.search` depending on whether JavaScript is available.

If you don't want a cross-page submission to navigate — a common need for login or newsletter widgets that live in a layout and post to another page's action — pass `navigate: false` to `update`, which gives you the same behaviour as SvelteKit 2:

```svelte
<form
	method="POST"
	action="/other/page?/subscribe"
	use:enhance={() => async ({ update }) => {
		await update({ navigate: false });
	}}
>
```

The result is applied to the page you're on: `form`, `page.form` and `page.status` are updated, and error results render the current route's nearest `+error` boundary.

### Customising use:enhance

To customise the behaviour, you can provide a `SubmitFunction` that runs immediately before the form is submitted, and (optionally) returns a callback that runs with the `ActionResult`.

```svelte
<form
	method="POST"
	use:enhance={({ formElement, formData, action, cancel, submitter }) => {
		// `formElement` is this `<form>` element
		// `formData` is its `FormData` object that's about to be submitted
		// `action` is the URL to which the form is posted
		// calling `cancel()` will prevent the submission
		// `submitter` is the `HTMLElement` that caused the form to be submitted

		return async ({ result, update }) => {
			// `result` is an `ActionResult` object
			// `update` is a function which triggers the default logic that would be triggered if this callback wasn't set
		};
	}}
>
```

You can use these functions to show and hide loading UI, and so on.

If you return a callback, you override the default post-submission behavior. To get it back, call `update`, which accepts `navigate`, `refreshAll` and `reset` parameters, or use `applyAction` on the result:

```svelte
/// file: src/routes/login/+page.svelte
<script>
	import { enhance, +++applyAction+++ } from '$app/forms';

	/** @type {import('./$types').PageProps} */
	let { form } = $props();
</script>

<form
	method="POST"
	use:enhance={({ formElement, formData, action, cancel }) => {
		return async ({ result }) => {
			// `result` is an `ActionResult` object
+++			if (result.type === 'redirect') {
				goto(result.location);
			} else {
				await applyAction(result);
			}+++
		};
	}}
>
```

> [!NOTE] `update` accepts these options:
>
> - `reset: false` if you don't want the `<form>` values to be reset after a successful submission
> - `refreshAll` controls whether all data is refreshed after submission. It defaults to `true` for successful results and `false` for failures. When the submission navigates to another page, setting it to `false` does _not_ prevent the destination's own `load` functions from running — it only allows shared layout data to be reused. `invalidateAll` is a deprecated alias for `refreshAll`
> - `navigate: false` applies a non-redirect result to the current page instead of navigating to `result.location`. Redirects are always followed

The behaviour of `applyAction(result)` depends on `result.type`:

- `success`, `failure` — sets `page.status` to `result.status` and updates `form` and `page.form` to `result.data`
- `redirect` — calls `goto(result.location, { refreshAll: true })`
- `error` — renders the current route's nearest `+error` boundary with `result.error`

In all cases, [focus will be reset](accessibility#Focus-management). `applyAction` does not navigate to the `location` of a non-redirect result or refresh data. Use `update` to get the complete default enhanced behavior, including carrying form data and status into a cross-page navigation. When implementing enhancement manually, inspect `result.location` and use [`goto`]($app-navigation#goto) or [`refreshAll`]($app-navigation#refreshAll) as appropriate.

### Custom event listener

We can also implement progressive enhancement ourselves, without `use:enhance`, with a normal event listener on the `<form>`:

```svelte
<!--- file: src/routes/login/+page.svelte --->
<script>
	import { refreshAll, goto } from '$app/navigation';
	import { applyAction, deserialize } from '$app/forms';

	/** @type {import('./$types').PageProps} */
	let { form } = $props();

	/** @param {SubmitEvent & { currentTarget: EventTarget & HTMLFormElement}} event */
	async function handleSubmit(event) {
		event.preventDefault();
		const data = new FormData(event.currentTarget, event.submitter);

		const response = await fetch(event.currentTarget.action, {
			method: 'POST',
			body: data
		});

		/** @type {import('$app/forms').ActionResult} */
		const result = deserialize(await response.text());

		if (result.type !== 'redirect' && result.location !== undefined) {
			if (result.location === location.pathname + location.search) {
				if (result.type === 'success') await refreshAll();
			} else {
				await goto(result.location, { refreshAll: result.type === 'success' });
			}
		}

		await applyAction(result);
	}
</script>

<form method="POST" onsubmit={handleSubmit}>
	<!-- content -->
</form>
```

Note that you need to `deserialize` the response before processing it further using the corresponding method from `$app/forms`. `JSON.parse()` isn't enough because form actions - like `load` functions - also support returning `Date` or `BigInt` objects.

If you have a `+server.js` alongside your `+page.server.js`, `fetch` requests will be routed there by default. To `POST` to an action in `+page.server.js` instead, use the custom `x-sveltekit-action` header:

```js
// @errors: 2532 2304
const response = await fetch(this.action, {
	method: 'POST',
	body: data,
+++	headers: {
		'x-sveltekit-action': 'true'
	}+++
});
```

## Alternatives

Form actions are the preferred way to send data to the server, since they can be progressively enhanced, but you can also use [`+server.js`](routing#server) files to expose (for example) a JSON API. Here's how such an interaction could look like:

```svelte
<!--- file: src/routes/send-message/+page.svelte --->
<script>
	function rerun() {
		fetch('/api/ci', {
			method: 'POST'
		});
	}
</script>

<button onclick={rerun}>Rerun CI</button>
```

```js
// @errors: 2355 1360 2322
/// file: src/routes/api/ci/+server.js
/** @type {import('./$types').RequestHandler} */
export function POST() {
	// do something
}
```

## GET vs POST

As we've seen, to invoke a form action you must use `method="POST"`.

Some forms don't need to `POST` data to the server — search inputs, for example. For these you can use `method="GET"` (or, equivalently, no `method` at all), and SvelteKit will treat them like `<a>` elements, using the client-side router instead of a full page navigation:

```html
<form action="/search">
	<label>
		Search
		<input name="q">
	</label>
</form>
```

Submitting this form will navigate to `/search?q=...` and invoke your load function but will not invoke an action. As with `<a>` elements, you can set the [`data-sveltekit-reload`](link-options#data-sveltekit-reload), [`data-sveltekit-replacestate`](link-options#data-sveltekit-replacestate) and [`data-sveltekit-reset`](link-options#data-sveltekit-reset) attributes on the `<form>` to control the router's behaviour.

## Further reading

- [Tutorial: Forms](/tutorial/kit/the-form-element)

# Page options

By default, SvelteKit will render (or [prerender](glossary#Prerendering)) any component first on the server and send it to the client as HTML. It will then render the component again in the browser to make it interactive in a process called [_hydration_](glossary#Hydration). For this reason, you need to ensure that components can run in both places. SvelteKit will then initialize a [_router_](routing) that takes over subsequent navigations.

You can control each of these on a page-by-page basis by exporting options from [`+page.js`](routing#page-page.js) or [`+page.server.js`](routing#page-page.server.js), or for groups of pages using a shared [`+layout.js`](routing#layout-layout.js) or [`+layout.server.js`](routing#layout-layout.server.js). To define an option for the whole app, export it from the root layout. Child layouts and pages override values set in parent layouts, so — for example — you can enable prerendering for your entire app then disable it for pages that need to be dynamically rendered.

You can mix and match these options in different areas of your app. For example, you could prerender your marketing page for maximum speed, server-render your dynamic pages for SEO and accessibility and turn your admin section into an SPA by rendering it on the client only. This makes SvelteKit very versatile.

## prerender

It's likely that at least some routes of your app can be represented as a simple HTML file generated at build time. These routes can be [_prerendered_](glossary#Prerendering).

```js
/// file: +page.js/+page.server.js/+server.js
export const prerender = true;
```

Alternatively, you can set `export const prerender = true` in your root `+layout.js` or `+layout.server.js` and prerender everything except pages that are explicitly marked as _not_ prerenderable:

```js
/// file: +page.js/+page.server.js/+server.js
export const prerender = false;
```

Routes with `prerender = true` will be excluded from manifests used for dynamic SSR, making your server (or serverless/edge functions) smaller. In some cases you might want to prerender a route but also include it in the manifest (for example, with a route like `/blog/[slug]` where you want to prerender your most recent/popular content but server-render the long tail) — for these cases, there's a third option, 'auto':

```js
/// file: +page.js/+page.server.js/+server.js
export const prerender = 'auto';
```

> [!NOTE] If your entire app is suitable for prerendering, you can use [`adapter-static`](adapter-static), which will output files suitable for use with any static webserver.

The prerenderer will start at the root of your app and generate files for any prerenderable pages or `+server.js` routes it finds. Each page is scanned for `<a>` elements that point to other pages that are candidates for prerendering — because of this, you generally don't need to specify which pages should be accessed. If you _do_ need to specify which pages should be accessed by the prerenderer, you can do so with [`config.prerender.entries`](@sveltejs-kit-vite#prerender), or by exporting an [`entries`](#entries) function from your dynamic route.

While prerendering, the value of `building` imported from [`$app/env`]($app-env) will be `true`.

### Prerendering server routes

Unlike the other page options, `prerender` also applies to `+server.js` files. These files are _not_ affected by layouts, but will inherit default values from the pages that fetch data from them, if any. For example if a `+page.js` contains this `load` function...

```js
/// file: +page.js
export const prerender = true;

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
	const res = await fetch('/my-server-route.json');
	return await res.json();
}
```

...then `src/routes/my-server-route.json/+server.js` will be treated as prerenderable if it doesn't contain its own `export const prerender = false`.

### When not to prerender

The basic rule is this: for a page to be prerenderable, any two users hitting it directly must get the same content from the server.

> [!NOTE] Not all pages are suitable for prerendering. Any content that is prerendered will be seen by all users. You can of course fetch personalized data in `onMount` in a prerendered page, but this may result in a poorer user experience since it will involve blank initial content or loading indicators.

Note that you can still prerender pages that load data based on the page's parameters, such as a `src/routes/blog/[slug]/+page.svelte` route.

Accessing [`url.searchParams`](load#Using-URL-data-url) during prerendering is forbidden. If you need to use it, ensure you are only doing so in the browser (for example in `onMount`).

Pages with [actions](form-actions) cannot be prerendered, because a server must be able to handle the action `POST` requests.

### Route conflicts

Because prerendering writes to the filesystem, it isn't possible to have two endpoints that would cause a directory and a file to have the same name. For example, `src/routes/foo/+server.js` and `src/routes/foo/bar/+server.js` would try to create `foo` and `foo/bar`, which is impossible.

For that reason among others, it's recommended that you always include a file extension — `src/routes/foo.json/+server.js` and `src/routes/foo/bar.json/+server.js` would result in `foo.json` and `foo/bar.json` files living harmoniously side-by-side.

For _pages_, we skirt around this problem by writing `foo/index.html` instead of `foo`.

### Troubleshooting

If you encounter an error like 'The following routes were marked as prerenderable, but were not prerendered' it's because the route in question (or a parent layout, if it's a page) has `export const prerender = true` but the page wasn't reached by the prerendering crawler and thus wasn't prerendered.

Since these routes cannot be dynamically server-rendered, this will cause errors when people try to access the route in question. There are a few ways to fix it:

* Ensure that SvelteKit can find the route by following links from [`config.prerender.entries`](@sveltejs-kit-vite#prerender) or the [`entries`](#entries) page option. Add links to dynamic routes (i.e. pages with `[parameters]` ) to this option if they are not found through crawling the other entry points, else they are not prerendered because SvelteKit doesn't know what value the parameters should have. Pages not marked as prerenderable will be ignored and their links to other pages will not be crawled, even if some of them would be prerenderable.
* Ensure that SvelteKit can find the route by discovering a link to it from one of your other prerendered pages that have server-side rendering enabled.
* Change `export const prerender = true` to `export const prerender = 'auto'`. Routes with `'auto'` can be dynamically server rendered

## entries

SvelteKit will discover pages to prerender automatically, by starting at _entry points_ and crawling them. By default, all your non-dynamic routes are considered entry points — for example, if you have these routes...

```sh
/             # non-dynamic
/blog         # non-dynamic
/blog/[slug]  # dynamic, because of `[slug]`
```

...SvelteKit will prerender `/` and `/blog`, and in the process discover links like `<a href="/blog/hello-world">` which give it new pages to prerender.

Most of the time, that's enough. In some situations, links to pages like `/blog/hello-world` might not exist (or might not exist on prerendered pages), in which case we need to tell SvelteKit about their existence.

This can be done with [`config.prerender.entries`](@sveltejs-kit-vite#prerender), or by exporting an `entries` function from a `+page.js`, a `+page.server.js` or a `+server.js` belonging to a dynamic route:

```js
/// file: src/routes/blog/[slug]/+page.server.js
/** @type {import('./$types').EntryGenerator} */
export function entries() {
	return [
		{ slug: 'hello-world' },
		{ slug: 'another-blog-post' }
	];
}

export const prerender = true;
```

`entries` can be an `async` function, allowing you to (for example) retrieve a list of posts from a CMS or database, in the example above.

## ssr

Normally, SvelteKit renders your page on the server before sending that HTML to the client where it's [hydrated](glossary#Hydration). This is also required for prerendering to save the full contents of a page.

If you set `ssr` to `false`, it renders an empty 'shell' page instead. This is useful if your page is unable to be rendered on the server (because you use browser-only globals like `document` for example), but in most situations it's not recommended ([see appendix](glossary#SSR)).

```js
/// file: +page.js
export const ssr = false;
// If both `ssr` and `csr` are `false`, nothing will be rendered!
```

If you add `export const ssr = false` to your root `+layout.js`, your entire app will only be rendered on the client — which essentially means you turn your app into an [SPA](glossary#SPA). You should not do this if your goal is to build a [statically generated site](glossary#SSG).

> [!NOTE] If all your page options are boolean or string literal values, SvelteKit will evaluate them statically. If not, it will import your `+page.js` or `+layout.js` file on the server (both at build time, and at runtime if your app isn't fully static) so it can evaluate the options. In the second case, browser-only code must not run when the module is loaded. In practice, this means you should import browser-only code in your `+page.svelte` or `+layout.svelte` file instead.

## csr

Ordinarily, SvelteKit [hydrates](glossary#Hydration) your server-rendered HTML into an interactive client-side-rendered (CSR) page. Some pages don't require JavaScript at all — many blog posts and 'about' pages fall into this category. In these cases you can disable CSR:

```js
/// file: +page.js
export const csr = false;
// If both `csr` and `ssr` are `false`, nothing will be rendered!
```

Disabling CSR does not ship any JavaScript to the client. This means:

* The webpage should work with HTML and CSS only.
* `<script>` tags inside all Svelte components are removed.
* `<form>` elements cannot be [progressively enhanced](form-actions#Progressive-enhancement).
* Links are handled by the browser with a full-page navigation.
* Hot Module Replacement (HMR) will be disabled.

You can enable `csr` during development (for example to take advantage of HMR) like so:

```js
/// file: +page.js
import { dev } from '$app/env';

export const csr = dev;
```

## trailingSlash

By default, SvelteKit will remove trailing slashes from URLs — if you visit `/about/`, it will respond with a redirect to `/about`. You can change this behaviour with the `trailingSlash` option, which can be one of `'never'` (the default), `'always'`, or `'ignore'`.

As with other page options, you can export this value from a `+layout.js` or a `+layout.server.js` and it will apply to all child pages. You can also export the configuration from `+server.js` files.

```js
/// file: src/routes/+layout.js
export const trailingSlash = 'always';
```

This option also affects [prerendering](#prerender). If `trailingSlash` is `always`, a route like `/about` will result in an `about/index.html` file, otherwise it will create `about.html`, mirroring static webserver conventions.

> [!NOTE] Ignoring trailing slashes is not recommended — the semantics of relative paths differ between the two cases (`./y` from `/x` is `/y`, but from `/x/` is `/x/y`), and `/x` and `/x/` are treated as separate URLs which is harmful to SEO.

## config

With the concept of [adapters](adapters), SvelteKit is able to run on a variety of platforms. Each of these might have specific configuration to further tweak the deployment — for example on Vercel you could choose to deploy some parts of your app on the edge and others on serverless environments.

`config` is an object with key-value pairs at the top level. Beyond that, the concrete shape is dependent on the adapter you're using. Every adapter should provide a `Config` interface to import for type safety. Consult the documentation of your adapter for more information.

```js
// @filename: ambient.d.ts
declare module 'some-adapter' {
	export interface Config { runtime: string }
}

// @filename: index.js
// ---cut---
/// file: src/routes/+page.js
/** @type {import('some-adapter').Config} */
export const config = {
	runtime: 'edge'
};
```

`config` objects are merged at the top level (but _not_ deeper levels). This means you don't need to repeat all the values in a `+page.js` if you want to only override some of the values in the upper `+layout.js`. For example this layout configuration...

```js
/// file: src/routes/+layout.js
export const config = {
	runtime: 'edge',
	regions: 'all',
	foo: {
		bar: true
	}
}
```

...is overridden by this page configuration...

```js
/// file: src/routes/+page.js
export const config = {
	regions: ['us1', 'us2'],
	foo: {
		baz: true
	}
}
```

...which results in the config value `{ runtime: 'edge', regions: ['us1', 'us2'], foo: { baz: true } }` for that page.

## Further reading

- [Tutorial: Page options](/tutorial/kit/page-options)

# State management

If you're used to building client-only apps, state management in an app that spans server and client might seem intimidating. This section provides tips for avoiding some common gotchas.

## Avoid shared state on the server

Browsers are _stateful_ — state is stored in memory as the user interacts with the application. Servers, on the other hand, are _stateless_ — the content of the response is determined entirely by the content of the request.

Conceptually, that is. In reality, servers are often long-lived and shared by multiple users. For that reason it's important not to store data in shared variables. For example, consider this code:

```js
// @errors: 7034 7005
/// file: +page.server.js
let user;

/** @type {import('./$types').PageServerLoad} */
export function load() {
	return { user };
}

/** @satisfies {import('./$types').Actions} */
export const actions = {
	default: async ({ request }) => {
		const data = await request.formData();

		// NEVER DO THIS!
		user = {
			name: data.get('name'),
			embarrassingSecret: data.get('secret')
		};
	}
}
```

The `user` variable is shared by everyone who connects to this server. If Alice submitted an embarrassing secret, and Bob visited the page after her, Bob would know Alice's secret. In addition, when Alice returns to the site later in the day, the server may have restarted, losing her data.

Instead, you should _authenticate_ the user using [`cookies`](load#Cookies) and persist the data to a database.

## No side-effects in load

For the same reason, your `load` functions should be _pure_ — no side-effects (except maybe the occasional `console.log(...)`). For example, you might be tempted to write to a store or global state inside a `load` function so that you can use the value in your components:

```js
/// file: +page.js
// @filename: ambient.d.ts
declare module '#lib/user.js' {
	export const user: { set: (value: any) => void };
}

// @filename: index.js
// ---cut---
import { user } from '#lib/user.js';

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
	const response = await fetch('/api/user');

	// NEVER DO THIS!
	user.set(await response.json());
}
```

As with the previous example, this puts one user's information in a place that is shared by _all_ users. Instead, just return the data...

```js
/// file: +page.js
/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
	const response = await fetch('/api/user');

+++	return {
		user: await response.json()
	};+++
}
```

...and pass it around to the components that need it, or use [`page.data`](load#page.data).

If you're not using SSR, then there's no risk of accidentally exposing one user's data to another. But you should still avoid side-effects in your `load` functions — your application will be much easier to reason about without them.

## Using state and stores with context

You might wonder how we're able to use `page.data` and other [app state]($app-state) if we can't use global state. The answer is that app state and app stores on the server use Svelte's [context API](/tutorial/svelte/context-api) — the state (or store) is attached to the component tree with `setContext`, and when you subscribe you retrieve it with `getContext`. We can do the same thing with our own state:

```svelte
<!--- file: src/routes/+layout.svelte --->
<script>
	import { setContext } from 'svelte';

	/** @type {import('./$types').LayoutProps} */
	let { data } = $props();

	// Pass a function referencing our state
	// to the context for child components to access
	setContext('user', () => data.user);
</script>
```

```svelte
<!--- file: src/routes/user/+page.svelte --->
<script>
	import { getContext } from 'svelte';

	// Retrieve user store from context
	const user = getContext('user');
</script>

<p>Welcome {user().name}</p>
```

> [!NOTE] We're passing a function into `setContext` to keep reactivity across boundaries. Read more about it [here](/docs/svelte/$state#Passing-state-into-functions)

> [!LEGACY]
> You also use stores from `svelte/store` for this, but when using Svelte 5 it is recommended to make use of universal reactivity instead.

Updating the value of context-based state in deeper-level pages or components while the page is being rendered via SSR will not affect the value in the parent component because it has already been rendered by the time the state value is updated. In contrast, on the client (when CSR is enabled, which is the default) the value will be propagated and components, pages, and layouts higher in the hierarchy will react to the new value. Therefore, to avoid values 'flashing' during state updates during hydration, it is generally recommended to pass state down into components rather than up.

If you're not using SSR (and can guarantee that you won't need to use SSR in future) then you can safely keep state in a shared module, without using the context API.

## Component and page state is preserved

When you navigate around your application, SvelteKit reuses existing layout and page components. For example, if you have a route like this...

```svelte
<!--- file: src/routes/blog/[slug]/+page.svelte --->
<script>
	/** @type {import('./$types').PageProps} */
	let { data } = $props();

	// THIS CODE IS BUGGY!
	const wordCount = data.content.split(' ').length;
	const estimatedReadingTime = wordCount / 250;
</script>

<header>
	<h1>{data.title}</h1>
	<p>Reading time: {Math.round(estimatedReadingTime)} minutes</p>
</header>

<div>{@html data.content}</div>
```

...then navigating from `/blog/my-short-post` to `/blog/my-long-post` won't cause the layout, page and any other components within to be destroyed and recreated. Instead the `data` prop (and by extension `data.title` and `data.content`) will update (as it would with any other Svelte component) and, because the code isn't rerunning, lifecycle methods like `onMount` and `onDestroy` won't rerun and `estimatedReadingTime` won't be recalculated.

Instead, we need to make the value [_reactive_](/tutorial/svelte/state):

```svelte
/// file: src/routes/blog/[slug]/+page.svelte
<script>
	/** @type {import('./$types').PageProps} */
	let { data } = $props();

+++	let wordCount = $derived(data.content.split(' ').length);
	let estimatedReadingTime = $derived(wordCount / 250);+++
</script>
```

> [!NOTE] If your code in `onMount` and `onDestroy` has to run again after navigation you can use [afterNavigate]($app-navigation#afterNavigate) and [beforeNavigate]($app-navigation#beforeNavigate) respectively.

Reusing components like this means that things like sidebar scroll state are preserved, and you can easily animate between changing values. In the case that you do need to completely destroy and remount a component on navigation, you can use this pattern:

```svelte
<script>
	import { page } from '$app/state';
</script>

{#key page.url.pathname}
	<BlogPost title={data.title} content={data.title} />
{/key}
```

## Storing state in the URL

If you have state that should survive a reload and/or affect SSR, such as filters or sorting rules on a table, URL search parameters (like `?sort=price&order=ascending`) are a good place to put them. You can put them in `<a href="...">` or `<form action="...">` attributes, or set them programmatically via `goto('?key=value')`. They can be accessed inside `load` functions via the `url` parameter, and inside components via `page.url.searchParams`.

## Storing ephemeral state in snapshots

Some UI state, such as 'is the accordion open?', is disposable — if the user navigates away or refreshes the page, it doesn't matter if the state is lost. In some cases, you _do_ want the data to persist if the user navigates to a different page and comes back, but storing the state in the URL or in a database would be overkill. For this, SvelteKit provides [snapshots](snapshots), which let you associate component state with a history entry.

# Remote functions

<blockquote class="since note">
 <p>Available since 2.27</p>
</blockquote>

Remote functions are a tool for type-safe communication between client and server. They can be _called_ anywhere in your app, but always _run_ on the server, meaning they can safely access [server-only modules](server-only-modules) containing things like environment variables and database clients.

Combined with Svelte's experimental support for [`await`](/docs/svelte/await-expressions), it allows you to load and manipulate data directly inside your components.

This feature is currently experimental, meaning it is likely to contain bugs and is subject to change without notice. You must opt in by adding the `compilerOptions.experimental.async` and `experimental.remoteFunctions` options to the SvelteKit plugin in your `vite.config.js`:

```js
/// file: vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			experimental: {
				+++remoteFunctions: true+++
			},
			compilerOptions: {
				experimental: {
					+++async: true+++
				}
			}
		})
	],
});
```

## Overview

Remote functions are exported from a _remote module_, which is a file whose name includes a `remote` segment (e.g. `remote.ts` or `data.remote.ts`). They come in four flavours: `query`, `form`, `command` and `prerender`. On the client, the exported functions are transformed to `fetch` wrappers that invoke their counterparts on the server via a generated HTTP endpoint. Remote modules can be placed anywhere in your `src` directory (except inside a `server` directory — files here [cannot be imported into client-side code](server-only-modules)), and third-party libraries that list `@sveltejs/kit` in their `peerDependencies` can provide them too.

## query

The `query` function allows you to read dynamic data from the server.

> [!NOTE] For _static_ data, consider using [`prerender`](#prerender) functions instead. Queries cannot be used when the entire page is prerendered (meaning [`export const prerender = true`](page-options#prerender) is applied to the page or a parent layout), such as when using [`adapter-static`](adapter-static).

```js
/// file: src/routes/blog/data.remote.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]>;
}
// @filename: index.js
// ---cut---
import { query } from '$app/server';
import * as db from '#lib/server/database.js';

export const getPosts = query(async () => {
	const posts = await db.sql`
		SELECT title, slug
		FROM post
		ORDER BY published_at
		DESC
	`;

	return posts;
});
```

> [!NOTE] Throughout this page, you'll see imports from fictional modules like `#lib/server/database.js` and `#lib/server/auth.js`. These are purely for illustrative purposes — you can use whatever database client and auth setup you like.
>
> The `db.sql` function above is a [tagged template function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) that escapes any interpolated values.

The query returned from `getPosts` works as a [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) that resolves to `posts`:

```svelte
<!--- file: src/routes/blog/+page.svelte --->
<script>
	import { getPosts } from './data.remote';
</script>

<h1>Recent posts</h1>

<ul>
	{#each await getPosts() as { title, slug } (slug)}
		<li><a href="/blog/{slug}">{title}</a></li>
	{/each}
</ul>
```

Until the promise resolves — and if it errors — the nearest [`<svelte:boundary>`](../svelte/svelte-boundary) will be invoked.

While using `await` is recommended, as an alternative the query also has `loading`, `error` and `current` properties:

```svelte
<!--- file: src/routes/blog/+page.svelte --->
<script>
	import { getPosts } from './data.remote';

	const query = getPosts();
</script>

<h1>Recent posts</h1>

{#if query.error}
	<p>oops!</p>
{:else if query.loading}
	<p>loading...</p>
{:else}
	<ul>
		{#each query.current as { title, slug } (slug)}
			<li><a href="/blog/{slug}">{title}</a></li>
		{/each}
	</ul>
{/if}
```

> [!NOTE] For the rest of this document, we'll use the `await` form.

### Query arguments

Query functions can accept an argument, such as the `slug` of an individual post:

```svelte
<!--- file: src/routes/blog/[slug]/+page.svelte --->
<script>
	import { getPost } from '../data.remote';

	let { params } = $props();

	const post = $derived(await getPost(params.slug));
</script>

<h1>{post.title}</h1>
<div>{@html post.content}</div>
```

Since `getPost` exposes an HTTP endpoint, it's important to validate this argument to be sure that it's the correct type. For this, we can use any [Standard Schema](https://standardschema.dev/) validation library such as [Zod](https://zod.dev/) or [Valibot](https://valibot.dev/):

```js
/// file: src/routes/blog/data.remote.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]>;
}
// @filename: index.js
// ---cut---
import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { query } from '$app/server';
import * as db from '#lib/server/database.js';

export const getPosts = query(async () => { /* ... */ });

export const getPost = query(v.string(), async (slug) => {
	const [post] = await db.sql`
		SELECT * FROM post
		WHERE slug = ${slug}
	`;

	if (!post) error(404, 'Not found');
	return post;
});
```

Both the argument and the return value are serialized with [devalue](https://github.com/sveltejs/devalue), which handles types like `Date` and `Map` (and custom types defined in your [transport hook](hooks#transport)) in addition to JSON.

> [!NOTE] For `query` and `prerender` arguments (but not return values), objects, maps, and sets are sorted so that instances with the same members result in the same cache key. For example, `getPosts({ limit: 10, offset: 10 })` and `getPosts({ offset: 10, limit: 10 })` will result in the same cache key. If order is important to you, you'll have to use an array.

### Deduplication

When you call a query function, SvelteKit serializes the argument you call it with and uses it as a cache key. On the server, this is used to create a request-scoped cache so that multiple invocations of the same query only result in the work happening once. On the client, SvelteKit does something similar: Multiple identical invocations of a query all point to the same instance.

You can `await` a query in any context — components, event handlers, universal `load` functions, async callbacks — and SvelteKit will dedupe with whatever other consumers are using the same query. For example:

```svelte
<script>
	import { getData } from './data.remote.js';

  // awaited inside the component template — populates the cache
  const data = getData();
</script>

<p>{await data}</p>

<!-- this dedupes with the component-level use above; no extra request -->
<button onclick={async () => console.log(await getData())}>
	click me!
</button>
```

The cache is shared as long as the query is in active use — rendered in a component, currently being awaited, or otherwise referenced. Once nothing is using it, the cached value is released.

### Refreshing queries

Any query can be re-fetched via its `refresh` method, which retrieves the latest value from the server:

```svelte
<button onclick={() => getPosts().refresh()}>
	Check for new posts
</button>
```

> [!NOTE] Queries are cached while they're on the page, meaning `getPosts() === getPosts()`. This means you don't need a reference like `const posts = getPosts()` in order to update the query.

## query.batch

`query.batch` works like `query` except that it batches requests that happen within the same macrotask. This solves the so-called n+1 problem: rather than each query resulting in a separate database call (for example), simultaneous queries are grouped together.

On the server, the callback receives an array of the arguments the function was called with. It must return a function of the form `(input: Input, index: number) => Output`. SvelteKit will then call this with each of the input arguments to resolve the individual calls with their results.

```js
/// file: weather.remote.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]>;
}
// @filename: index.js
// ---cut---
import * as v from 'valibot';
import { query } from '$app/server';
import * as db from '#lib/server/database.js';

export const getWeather = query.batch(v.string(), async (cityIds) => {
	const weather = await db.sql`
		SELECT * FROM weather
		WHERE city_id = ANY(${cityIds})
	`;
	const lookup = new Map(weather.map(w => [w.city_id, w]));

	return (cityId) => lookup.get(cityId);
});
```

```svelte
<!--- file: Weather.svelte --->
<script>
	import CityWeather from './CityWeather.svelte';
	import { getWeather } from './weather.remote';

	let { cities } = $props();
	let limit = $state(5);
</script>

<h2>Weather</h2>

{#each cities.slice(0, limit) as city (city.id)}
	<h3>{city.name}</h3>
	<CityWeather weather={await getWeather(city.id)} />
{/each}

{#if cities.length > limit}
	<button onclick={() => limit += 5}>
		Load more
	</button>
{/if}
```

## query.live

`query.live` is for accessing real-time data from the server. It behaves similarly to `query`, but the callback — typically an async [generator function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/function*) — returns an `AsyncIterable`:

```js
import { query } from '$app/server';

export const getTime = query.live(async function* () {
	while (true) {
		yield new Date();
		await new Promise((f) => setTimeout(f, 1000));
	}
});
```

During server-side rendering, `await getTime()` returns the first yielded value then closes the iterator. This initial value is serialized and reused during hydration.

On the client, the query stays connected while it's actively used in a component. Multiple instances share a connection. When there are no active uses left, the stream disconnects and server-side iteration is stopped.

Live queries expose a `connected` property and `reconnect()` method:

```svelte
<script>
	import { getTime } from './time.remote.js';

	const time = getTime();
</script>

<p>{await time}</p>
<p>connected: {time.connected}</p>
<button onclick={() => time.reconnect()}>Reconnect</button>
```

If the connection drops, `connected` becomes `false`. SvelteKit will attempt to reconnect passively, with exponential backoff, and actively if `navigator.onLine` goes from `false` to `true`.

Unlike `query`, live queries do not have a `refresh()` method, as they are self-updating.

If you need direct, imperative access to the underlying stream of values (rather than the reactive `current` property), live query instances are themselves [async-iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of). You can `for await` over the instance directly:

```js
// @filename: time.remote.ts
import type { RemoteLiveQueryFunction } from '$app/server';
export declare const getTime: RemoteLiveQueryFunction<undefined, Date>;
// @errors: 2304
// @filename: index.js
import { getTime } from './time.remote.js';
// ---cut---
async function logTimes() {
	for await (const value of getTime()) {
		console.log(value);
		if (someCondition) break;
	}
}
```

Multiple consumers of the same live query (whether reactive — via `await` or `current` — or imperative `for await` loops) share a single underlying connection. The first value yielded to a `for await` iterator is the most-recently-received value, if one is already available, mirroring the semantics of awaiting the resource directly. Subsequent yields fire whenever a new value arrives from the server. If values arrive faster than the consumer drains the iterator, only the latest pending value is kept — live streams are not event logs.

On the server, `for await` likewise joins a per-request shared iteration of the underlying generator, so concurrent consumers within the same request don't run the user-defined generator multiple times.

> [!NOTE] It's essential that you don't cache live query responses in a service worker, since the cloned response will continue streaming long after the page is closed. Make sure that your caching logic excludes any responses with a `Cache-Control` header that includes `no-store`.

## form

The `form` function makes it easy to write data to the server. It takes a callback that receives `data` constructed from the submitted [`FormData`](https://developer.mozilla.org/en-US/docs/Web/API/FormData)...

```ts
/// file: src/routes/blog/data.remote.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]>;
}

declare module '#lib/server/auth.js' {
	interface User {
		name: string;
	}

	/**
	 * Gets a user's info from their cookies, using `getRequestEvent`
	 */
	export function getUser(): Promise<User | null>;
}
// @filename: index.js
// ---cut---
import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { query, form } from '$app/server';
import * as db from '#lib/server/database.js';
import * as auth from '#lib/server/auth.js';

export const getPosts = query(async () => { /* ... */ });

export const getPost = query(v.string(), async (slug) => { /* ... */ });

export const createPost = form(
	v.object({
		title: v.pipe(v.string(), v.nonEmpty()),
		content:v.pipe(v.string(), v.nonEmpty())
	}),
	async ({ title, content }) => {
		// Check the user is logged in
		const user = await auth.getUser();
		if (!user) error(401, 'Unauthorized');

		const slug = title.toLowerCase().replace(/ /g, '-');

		// Insert into the database
		await db.sql`
			INSERT INTO post (slug, title, content)
			VALUES (${slug}, ${title}, ${content})
		`;

		// Redirect to the newly created page
		redirect(303, `/blog/${slug}`);
	}
);
```

...and returns an object that can be spread onto a `<form>` element. The callback is called whenever the form is submitted.

```svelte
<!--- file: src/routes/blog/new/+page.svelte --->
<script>
	import { createPost } from '../data.remote';
</script>

<h1>Create a new post</h1>

<form {...createPost}>
	<!-- form content goes here -->

	<button>Publish!</button>
</form>
```

The form object contains `method` and `action` properties that allow it to work without JavaScript (i.e. it submits data and reloads the page). It also has an [attachment](/docs/svelte/@attach) that progressively enhances the form when JavaScript is available, submitting data *without* reloading the entire page.

As with `query`, if the callback uses the submitted `data`, it should be [validated](#query-Query-arguments) by passing a [Standard Schema](https://standardschema.dev) as the first argument to `form`.

### Fields

A form is composed of a set of _fields_, which are defined by the schema. In the case of `createPost`, we have two fields, `title` and `content`, which are both strings. To get the attributes for a field, call its `.as(...)` method, specifying which [input type](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input#input_types) to use. For most input types, you can also pass a second argument — `.as(type, value)` — to control the rendered value:

```svelte
<form {...createPost}>
	<label>
		<h2>Title</h2>
		+++<input {...createPost.fields.title.as('text')} />+++
	</label>

	<label>
		<h2>Write your post</h2>
		+++<textarea {...createPost.fields.content.as('text')}></textarea>+++
	</label>

	<button>Publish!</button>
</form>
```

These attributes allow SvelteKit to set the correct input type, set a `name` that is used to construct the `data` passed to the handler, populate the `value` of the form (for example following a failed submission, to save the user having to re-enter everything), and set the [`aria-invalid`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-invalid) state.

Passing a second argument to `.as(...)` is useful when rendering a form from existing data, such as an edit form or multiple instances created with [`for(...)`](#form-Multiple-instances-of-a-form). As well as setting the value of the element when it is rendered, it controls the value of the element when the form is reset. `radio`, `submit` and `hidden` inputs always need this value, and `checkbox` inputs need it when they represent one option in an array field. For these `radio` and `checkbox` inputs the second argument identifies the option, so whether it is currently checked goes in a third argument, e.g. `.as('radio', option, settings.visibility === option)` or `.as('checkbox', tag, settings.tags.includes(tag))`. `file` inputs cannot be populated this way.

> [!NOTE] The generated `name` attribute uses JS object notation (e.g. `nested.array[0].value`). String keys that require quotes such as `object['nested-array'][0].value` are not supported. Under the hood, boolean checkbox and number field names are prefixed with `b:` and `n:`, respectively, to signal SvelteKit to coerce the values from strings prior to validation.

Fields can be nested in objects and arrays, and their values can be strings, numbers, booleans or `File` objects. For example, if your schema looked like this...

```js
/// file: data.remote.js
import * as v from 'valibot';
import { form } from '$app/server';
// ---cut---
const datingProfile = v.object({
	name: v.string(),
	photo: v.file(),
	info: v.object({
		height: v.number(),
		likesDogs: v.optional(v.boolean(), false)
	}),
	attributes: v.array(v.string())
});

export const createProfile = form(datingProfile, (data) => { /* ... */ });
```

...your form could look like this:

```svelte
<script>
	import { createProfile } from './data.remote';

	const { name, photo, info, attributes } = createProfile.fields;
</script>

<form {...createProfile} enctype="multipart/form-data">
	<label>
		<input {...name.as('text')} /> Name
	</label>

	<label>
		<input {...photo.as('file')} /> Photo
	</label>

	<label>
		<input {...info.height.as('number')} /> Height (cm)
	</label>

	<label>
		<input {...info.likesDogs.as('checkbox')} /> I like dogs
	</label>

	<h2>My best attributes</h2>
	<input {...attributes[0].as('text')} />
	<input {...attributes[1].as('text')} />
	<input {...attributes[2].as('text')} />

	<button>submit</button>
</form>
```

Because our form contains a `file` input, we've added an `enctype="multipart/form-data"` attribute. The values for `info.height` and `info.likesDogs` are coerced to a number and a boolean respectively.

> [!NOTE] If a `checkbox` input is unchecked, the value is not included in the [`FormData`](https://developer.mozilla.org/en-US/docs/Web/API/FormData) object that SvelteKit constructs the data from. As such, we have to give the value a default of `false` in our schema, rather than merely marking it optional. In Valibot that means using `v.optional(v.boolean(), false)` instead of just `v.boolean()`, whereas in Zod it means using `z.boolean().default(false)` instead of just `z.boolean()`.

For a checkbox that must be checked, such as agreeing to terms of service, use `z.literal(true)` in Zod or `v.pipe(v.optional(v.boolean(), false), v.literal(true))` in Valibot. An unchecked checkbox will then fail validation.

In the case of `radio` and `checkbox` inputs that all belong to the same field, the `value` must be specified as a second argument to `.as(...)`:

```js
/// file: constants.js
export const operatingSystems = /** @type {const} */ (['windows', 'mac', 'linux']);
export const languages = /** @type {const} */ (['html', 'css', 'js']);
```

```js
/// file: data.remote.js
// @filename: constants.js
export const operatingSystems = /** @type {const} */ (['windows', 'mac', 'linux']);
export const languages = /** @type {const} */ (['html', 'css', 'js']);
// @filename: index.js
import * as v from 'valibot';
import { form } from '$app/server';
// ---cut---
import { operatingSystems, languages } from './constants';

export const survey = form(
	v.object({
		operatingSystem: v.picklist(operatingSystems),
		languages: v.optional(v.array(v.picklist(languages)), []),
	}),
	(data) => { /* ... */ },
);
```

```svelte
<form {...survey}>
	<h2>Which operating system do you use?</h2>

	{#each operatingSystems as os}
		<label>
			<input {...survey.fields.operatingSystem.as('radio', os)}>
			{os}
		</label>
	{/each}

	<h2>Which languages do you write code in?</h2>

	{#each languages as language}
		<label>
			<input {...survey.fields.languages.as('checkbox', language)}>
			{language}
		</label>
	{/each}

	<button>submit</button>
</form>
```

Alternatively, you could use `select` and `select multiple`:

```svelte
<form {...survey}>
	<h2>Which operating system do you use?</h2>

	<select {...survey.fields.operatingSystem.as('select')}>
		{#each operatingSystems as os}
			<option>{os}</option>
		{/each}
	</select>

	<h2>Which languages do you write code in?</h2>

	<select {...survey.fields.languages.as('select multiple')}>
		{#each languages as language}
			<option>{language}</option>
		{/each}
	</select>

	<button>submit</button>
</form>
```

> [!NOTE] As with unchecked `checkbox` inputs, if no selections are made then the data will be `undefined`. For this reason, the `languages` field uses `v.optional(v.array(...), [])` rather than just `v.array(...)`.

### Programmatic validation

In addition to declarative schema validation, you can programmatically mark fields as invalid inside the form handler using the `invalid` helper from `@sveltejs/kit`. This is useful for cases where you can't know if something is valid until you try to perform some action.

- It throws just like `redirect` or `error`
- It accepts multiple arguments that can be strings (for issues relating to the form as a whole — these will only show up in `fields.allIssues()`) or standard-schema-compliant issues (for those relating to a specific field). Use the `issue` parameter for type-safe creation of such issues:

```js
// @errors: 18046
/// file: src/routes/shop/data.remote.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function buy(qty: number): Promise<void>
}
// @filename: index.js
// ---cut---
import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import { form } from '$app/server';
import * as db from '#lib/server/database.js';

export const buyHotcakes = form(
	v.object({
		qty: v.pipe(
			v.number(),
			v.minValue(1, 'you must buy at least one hotcake')
		)
	}),
	async (data, issue) => {
		try {
			await db.buy(data.qty);
		} catch (e) {
			if (e.code === 'OUT_OF_STOCK') {
				invalid(
					issue.qty(`we don't have enough hotcakes`)
				);
			}
		}
	}
);
```

### Validation

If the submitted data doesn't pass the schema, the callback will not run. Instead, each invalid field's `issues()` method will return an array of `{ message: string }` objects, and the `aria-invalid` attribute (returned from `as(...)`) will be set to `true`:

```svelte
<form {...createPost}>
	<label>
		<h2>Title</h2>

+++		{#each createPost.fields.title.issues() as issue}
			<p class="issue">{issue.message}</p>
		{/each}+++

		<input {...createPost.fields.title.as('text')} />
	</label>

	<label>
		<h2>Write your post</h2>

+++		{#each createPost.fields.content.issues() as issue}
			<p class="issue">{issue.message}</p>
		{/each}+++

		<textarea {...createPost.fields.content.as('text')}></textarea>
	</label>

	<button>Publish!</button>
</form>
```

If the `title` is valid, or has not yet been validated, `createPost.fields.title.issues()` will return `undefined`.

You don't need to wait until the form is submitted to validate the data — you can call `validate()` programmatically, for example in an `oninput` callback (which will validate the data on every keystroke) or an `onchange` callback:

```svelte
<form {...createPost} oninput={() => createPost.validate()}>
	<!-- -->
</form>
```

By default, issues will be ignored if they belong to form controls that haven't yet been interacted with. To validate _all_ inputs, call `validate({ all: true })`.

For client-side validation, you can specify a _preflight_ schema which will populate `issues()` and prevent data being sent to the server if the data doesn't validate:

```svelte
<script>
	import * as v from 'valibot';
	import { createPost } from '../data.remote';

	const schema = v.object({
		title: v.pipe(v.string(), v.nonEmpty()),
		content: v.pipe(v.string(), v.nonEmpty())
	});
</script>

<h1>Create a new post</h1>

<form {...+++createPost.preflight(schema)+++}>
	<!-- -->
</form>
```

> [!NOTE] The preflight schema can be the same object as your server-side schema, if appropriate, though it won't be able to do server-side checks like 'this value already exists in the database'. Note that you cannot export a schema from a `.remote.ts` or `.remote.js` file, so the schema must either be exported from a shared module, or from a `<script module>` block in the component containing the `<form>`.

To get a list of _all_ issues, rather than just those belonging to a single field, you can use the `fields.allIssues()` method:

```svelte
{#each createPost.fields.allIssues() as issue}
	<p>{issue.message}</p>
{/each}
```

As with individual fields, `createPost.fields.allIssues()` will return `undefined` if the form as a whole is valid (or has not yet been validated).

### Getting/setting inputs

Each field has a `value()` method that reflects its current value. As the user interacts with the form, it is automatically updated:

```svelte
<form {...createPost}>
	<!-- -->
</form>

<div class="preview">
	<h2>{createPost.fields.title.value()}</h2>
	<div>{@html render(createPost.fields.content.value())}</div>
</div>
```

Alternatively, `createPost.fields.value()` would return a `{ title, content }` object.

The `value()` of a field does _not_ reflect defaults provided as a second argument to `as` (as in `fields.title.as('text', '...')`) until it is edited or submitted. You can programmatically update a field (or a collection of fields) via the `set(...)` method:

```svelte
<script>
	import { createPost } from '../data.remote';

	// this...
	createPost.fields.set({
		title: 'My new blog post',
		content: 'Lorem ipsum dolor sit amet...'
	});

	// ...is equivalent to this:
	createPost.fields.title.set('My new blog post');
	createPost.fields.content.set('Lorem ipsum dolor sit amet');
</script>
```

### Handling sensitive data

In the case of a non-progressively-enhanced form submission (i.e. where JavaScript is unavailable, for whatever reason) `value()` is also populated if the submitted data is invalid, so that the user does not need to fill the entire form out from scratch.

You can prevent sensitive data (such as passwords and credit card numbers) from being sent back to the user by using a name with a leading underscore:

```svelte
<form {...register}>
	<label>
		Username
		<input {...register.fields.username.as('text')} />
	</label>

	<label>
		Password
		<input +++{...register.fields._password.as('password')}+++ />
	</label>

	<button>Sign up!</button>
</form>
```

In this example, if the data does not validate, only the first `<input>` will be populated when the page reloads.

### Returns and redirects

The example above uses [`redirect(...)`](@sveltejs-kit#redirect), which sends the user to the newly created page. Alternatively, the callback could return data, in which case it would be available as `createPost.result`:

```ts
/// file: src/routes/blog/data.remote.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]>;
}

declare module '#lib/server/auth.js' {
	interface User {
		name: string;
	}

	/**
	 * Gets a user's info from their cookies, using `getRequestEvent`
	 */
	export function getUser(): Promise<User | null>;
}
// @filename: index.js
import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { query, form } from '$app/server';
import * as db from '#lib/server/database.js';
import * as auth from '#lib/server/auth.js';

export const getPosts = query(async () => { /* ... */ });

export const getPost = query(v.string(), async (slug) => { /* ... */ });

// ---cut---
export const createPost = form(
	v.object({/* ... */}),
	async (data) => {
		// ...

		return { success: true };
	}
);
```

```svelte
<!--- file: src/routes/blog/new/+page.svelte --->
<script>
	import { createPost } from '../data.remote';
</script>

<h1>Create a new post</h1>

<form {...createPost}>
	<!-- -->
</form>

{#if createPost.result?.success}
	<p>Successfully published!</p>
{/if}
```

This value is _ephemeral_ — it will vanish if you resubmit, navigate away, or reload the page.

> [!NOTE] The `result` value need not indicate success — it can also contain validation errors, along with any data that should repopulate the form on page reload.

If an error occurs during submission, the nearest `+error.svelte` page will be rendered.

### enhance

We can customize what happens when the form is submitted with the `enhance` method:

```svelte
<!--- file: src/routes/blog/new/+page.svelte --->
<script>
	import { createPost } from '../data.remote';
	import { showToast } from '#lib/toast.js';
</script>

<h1>Create a new post</h1>

<form {...createPost.enhance(async (form) => {
	try {
		if (await form.submit()) {
			form.element.reset();

			showToast('Successfully published!');
		} else {
			showToast('Invalid data!');
		}
	} catch (error) {
		showToast('Oh no! Something went wrong');
	}
})}>
	<!-- -->
</form>
```

> [!NOTE] When using `enhance`, the `<form>` is not automatically reset — you must call `form.element.reset()` if you want to clear the inputs.

The callback receives a copy of the form instance. It has all the same properties and methods except `enhance`, and `form.submit()` performs the submission directly without re-running the enhance callback. Inside the callback, `form.element` is always defined.

### Multiple instances of a form

Some forms may be repeated as part of a list. In this case you can create separate instances of a form function via `for(id)` to achieve isolation.

When each instance should render different values, pass them as the second argument to `.as(...)`:

```svelte
<!--- file: src/routes/todos/+page.svelte --->
<script>
	import { getTodos, modifyTodo } from '../data.remote';
</script>

<h1>Todos</h1>

{#each await getTodos() as todo (todo.id)}
	{const modify = modifyTodo.for(todo.id)}
	<form {...modify}>
		<input {...modify.fields.description.as('text', todo.description)} />
		<button disabled={!!modify.pending}>save changes</button>
	</form>
{/each}
```

### Multiple submit buttons

It's possible for a `<form>` to have multiple submit buttons. For example, you might have a single form that allows you to log in or register depending on which button was clicked.

To accomplish this, add a field to your schema for the button value, and use `as('submit', value)` to bind it:

```svelte
<!--- file: src/routes/login/+page.svelte --->
<script>
	import { loginOrRegister } from '#lib/auth';
</script>

<form {...loginOrRegister}>
	<label>
		Your username
		<input {...loginOrRegister.fields.username.as('text')} />
	</label>

	<label>
		Your password
		<input {...loginOrRegister.fields._password.as('password')} />
	</label>

	<button {...loginOrRegister.fields.action.as('submit', 'login')}>login</button>
	<button {...loginOrRegister.fields.action.as('submit', 'register')}>register</button>
</form>
```

In your form handler, you can check which button was clicked:

```js
/// file: #lib/auth.js
import * as v from 'valibot';
import { form } from '$app/server';

export const loginOrRegister = form(
	v.object({
		username: v.string(),
		_password: v.string(),
		action: v.picklist(['login', 'register'])
	}),
	async ({ username, _password, action }) => {
		if (action === 'login') {
			// handle login
		} else {
			// handle registration
		}
	}
);
```

## command

The `command` function, like `form`, allows you to write data to the server. Unlike `form`, it's not specific to an element and can be called from anywhere.

> [!NOTE] Prefer `form` where possible, since it gracefully degrades if JavaScript is disabled or fails to load.

As with `query` and `form`, if the function accepts an argument, it should be [validated](#query-Query-arguments) by passing a [Standard Schema](https://standardschema.dev) as the first argument to `command`.

```ts
/// file: likes.remote.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]>;
}
// @filename: index.js
// ---cut---
import * as v from 'valibot';
import { query, command } from '$app/server';
import * as db from '#lib/server/database.js';

export const getLikes = query(v.string(), async (id) => {
	const [row] = await db.sql`
		SELECT likes
		FROM item
		WHERE id = ${id}
	`;

	return row.likes;
});

export const addLike = command(v.string(), async (id) => {
	await db.sql`
		UPDATE item
		SET likes = likes + 1
		WHERE id = ${id}
	`;
});
```

Now simply call `addLike`, from (for example) an event handler:

```svelte
<!--- file: +page.svelte --->
<script>
	import { getLikes, addLike } from './likes.remote';
	import { showToast } from '#lib/toast.js';

	let { item } = $props();
</script>

<button
	onclick={async () => {
		try {
			await addLike(item.id);
		} catch (error) {
			showToast('Something went wrong!');
		}
	}}
>
	add like
</button>

<p>likes: {await getLikes(item.id)}</p>
```

> [!NOTE] Commands cannot be called during render.

## Single-flight mutations

The purpose of both [`form`](#form) and [`command`](#command) is *mutating data*. In many cases, mutating data invalidates other data. By default, `form` deals with this by automatically invalidating all queries and load functions following a successful submission, to emulate what would happen with a traditional full-page reload. `command`, on the other hand, does nothing. Typically, neither of these options is going to be the ideal solution — invalidating everything is likely wasteful, as it's unlikely a form submission changed *everything* being displayed on your webpage. In the case of `command`, doing nothing likely *under*-invalidates your app, leaving stale data displayed. In both cases, it's common to have to perform two round-trips to the server: One to run the mutation, and another after that completes to re-request the data from any queries you need to refresh.

SvelteKit solves both of these problems with *single-flight mutations*: Your `form` submission or `command` invocation can refresh queries and pass their results back to the client in a single request.

### Server-driven refreshes

In most circumstances, the server handler knows what client data needs to be updated based on its arguments:

```js
import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { query, form } from '$app/server';
const slug = '';
const post = { id: '' };
/** @type {any} */
const externalApi = '';
// ---cut---
export const getPosts = query(async () => { /* ... */ });

export const getPost = query(v.string(), async (slug) => { /* ... */ });

export const createPost = form(
	v.object({/* ... */}),
	async (data) => {
		// form logic goes here...

		// Refresh `getPosts()` on the server, and send
		// the data back with the result of `createPost`
		// it's safe to throw away the promise from `refresh`,
		// as the framework awaits it for us before serving the response
		+++void getPosts().refresh();+++

		// Redirect to the newly created page
		redirect(303, `/blog/${slug}`);
	}
);

export const updatePost = form(
	v.object({ id: v.string() }),
	async (post) => {
		// form logic goes here...
		const result = externalApi.update(post);

		// The API already gives us the updated post,
		// no need to refresh it, we can set it directly
		+++getPost(post.id).set(result);+++
	}
);
```

Because queries are keyed based on their arguments, `getPost(post.id).set(result)` on the server knows to look up the matching `getPost(id)` on the client to update it. The same goes for `getPosts().refresh()` -- it knows to look up `getPosts()` with no argument on the client.

Calling `refresh()`, `set()` or `reconnect()` anywhere in a `form` handler replaces the default invalidation of all queries and load functions for that submission, so only the queries you refreshed will update.

### Reconnecting live queries in mutations

Single-flight mutations can also reconnect `query.live` instances. In a `form`/`command` handler, call `.reconnect()` on the live query resource you want to reconnect:

```js
import * as v from 'valibot';
import { form, query } from '$app/server';

export const getNotifications = query.live(v.string(), async function* (userId) {
	while (true) {
		yield await db.notifications(userId);
		await wait(1000);
	}
});

export const markAllRead = form(v.object({ userId: v.string() }), async ({ userId }) => {
	// mutation logic...
	+++getNotifications(userId).reconnect();+++
});
```

This schedules a reconnect for the matching active client instances and applies it as part of the mutation response (i.e. in the same flight as the form/command result). You might need this if, for example, the command modifies a cookie that the live query needs to restart in order to capture.

### Client-requested refreshes

Unfortunately, life isn't always as simple as the preceding example. The server always knows which query _functions_ to update, but it may not know which specific query _instances_ to update. For example, if `getPosts({ filter: 'author:santa' })` is rendered on the client, calling `getPosts().refresh()` in the server handler won't update it. You'd need to call `getPosts({ filter: 'author:santa' }).refresh()` instead — but how could you know which specific combinations of filters are currently rendered on the client, especially if your query argument is more complicated than an object with just one key?

SvelteKit makes this easy by allowing the client to _request_ that the server updates specific data using `submit().updates` (for `form`) or `myCommand().updates` (for `command`):

```ts
import type { RemoteQueryUpdate, RemoteQuery } from '$app/server';
interface Post {}
declare function submit(): Promise<any> & {
	updates(...updates: RemoteQueryUpdate[]): Promise<any>;
}

declare function getPosts(args: { filter: string }): RemoteQuery<Post[]>;
declare const newPost: Post;
// ---cut---
await submit().updates(
	// to request all active instances of getPosts
	getPosts,
	// to request a specific instance
	getPosts({ filter: 'author:santa' }),
	// to request a specific instance with an optimistic override
	getPosts({ filter: 'author:santa' }).withOverride((posts) => [newPost, ...posts])
);
```

It's not enough to just request the updates from the client -- you need to accept them from the server as well:

```js
import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
const slug = '';
const post = { id: '' };
/** @type {any} */
const externalApi = '';
// ---cut---
import { query, form, requested } from '$app/server';

export const getPosts = query(v.object({ filter: v.string() }), async ({ filter }) => { /* ... */ });

export const createPost = form(
	v.object({/* ... */}),
	async (data) => {
		// form logic goes here...

		+++for (const { query } of requested(getPosts, 1)) {+++
		+++	void query.refresh();+++
		+++}+++

		// Redirect to the newly created page
		redirect(303, `/blog/${slug}`);
	}
);
```

`requested` gives you access to the queries the client requested to refresh. Each entry is an `{ arg, query, ignore }` object: `arg` is the value the query's implementation function received — i.e. the argument *after* the schema has validated and (where applicable) transformed it — and `query` is a `RemoteQuery` already bound to the client's original cache key, so calling `query.refresh()` / `query.set(...)` updates the correct client instance. Call `ignore()` if you intentionally do not want to update a particular instance:

```js
import { requested, query } from '$app/server';

export const getPosts = query('unchecked', ({ filter }) => {
	return ['foo', 'bar'];
});
// ---cut---
for (const { arg, query, ignore } of requested(getPosts, 10)) {
	if (arg.filter === 'author:santa') {
		void query.refresh();
	} else {
		ignore();
	}
}
```

Every requested update must be refreshed, set, reconnected (for a live query), or explicitly ignored. Otherwise, the corresponding query will enter an error state on the client. If parsing or validating an argument fails, that query will also error, but the entire command will not fail.

`requested`'s second parameter, `limit`, is the maximum number of items it will return. Any refresh requests beyond this limit will fail on the client.

> [!NOTE] `limit` is required because the list of refresh requests is controlled by the client — each entry causes the server to validate an argument and usually re-fetch data, so an unbounded list is a denial-of-service risk. Choose a limit that reflects the worst case you're willing to handle per request. You _can_ pass `Infinity` if you have explicitly decided to accept any number of refreshes, but it is not recommended.

Additionally, `requested` allows a simple shorthand when all you want to do is refresh the requested query instances:

```ts
import { requested } from '$app/server';
import type { RemoteQueryFunction } from '$app/server';
declare const getPosts: RemoteQueryFunction<any, any>;
// ---cut---
// this is the same as looping over the result and calling `void query.refresh()`.
await requested(getPosts, 1).refreshAll();
```

If you want to intentionally ignore every selected update, use `ignoreAll`:

```js
import { requested, query } from '$app/server';

export const getPosts = query('unchecked', ({ filter }) => {
	return ['foo', 'bar'];
});

// ---cut---
await requested(getPosts, 10).ignoreAll();
```

`ignoreAll` only ignores entries within the specified `limit`. Any excess entries still fail on the client.

> [!NOTE] Why does the command have to name every query it's willing to refresh? Two reasons:
>
> - **Bundle size.** If a command could implicitly refresh *any* query in your app, SvelteKit would have to include every query's code in the command's server bundle, because it can't know ahead of time which ones will be called.
> - **Denial-of-service.** Any malicious user can inspect their network tab to discover which queries your app uses, then POST a command with a client-supplied list of thousands of refreshes. The only defence is for the server handler to declare which queries it is willing to refresh — and in what quantity (hence the required `limit`).

## prerender

The `prerender` function is similar to `query`, except that it will be invoked at build time to prerender the result. Use this for data that changes at most once per redeployment.

```js
/// file: src/routes/blog/data.remote.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]>;
}
// @filename: index.js
// ---cut---
import { prerender } from '$app/server';
import * as db from '#lib/server/database.js';

export const getPosts = prerender(async () => {
	const posts = await db.sql`
		SELECT title, slug
		FROM post
		ORDER BY published_at
		DESC
	`;

	return posts;
});
```

You can use `prerender` functions on pages that are otherwise dynamic, allowing for partial prerendering of your data. This results in very fast navigation, since prerendered data can live on a CDN along with your other static assets.

In the browser, prerendered data is saved using the [`Cache`](https://developer.mozilla.org/en-US/docs/Web/API/Cache) API. This cache survives page reloads, and will be cleared when the user first visits a new deployment of your app.

> [!NOTE] `prerender` functions should not be used for private data, as they run at build time, and their results are served publicly as static files.

### Prerender arguments

As with queries, prerender functions can accept an argument, which should be [validated](#query-Query-arguments) with a [Standard Schema](https://standardschema.dev/):

```js
/// file: src/routes/blog/data.remote.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]>;
}
// @filename: index.js
// ---cut---
import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { prerender } from '$app/server';
import * as db from '#lib/server/database.js';

export const getPosts = prerender(async () => { /* ... */ });

export const getPost = prerender(v.string(), async (slug) => {
	const [post] = await db.sql`
		SELECT * FROM post
		WHERE slug = ${slug}
	`;

	if (!post) error(404, 'Not found');
	return post;
});
```

Any calls to `getPost(...)` found by SvelteKit's crawler while [prerendering pages](page-options#prerender) will be saved automatically, but you can also specify which values it should be called with using the `inputs` option:

```js
/// file: src/routes/blog/data.remote.js
import * as v from 'valibot';
import { prerender } from '$app/server';
// ---cut---

export const getPost = prerender(
	v.string(),
	async (slug) => { /* ... */ },
	{
		inputs: () => [
			'first-post',
			'second-post',
			'third-post'
		]
	}
);
```

By default, prerender functions are excluded from your server bundle, which means that you cannot call them with any arguments that were _not_ prerendered. You can set `dynamic: true` to change this behaviour:

```js
/// file: src/routes/blog/data.remote.js
import * as v from 'valibot';
import { prerender } from '$app/server';
// ---cut---

export const getPost = prerender(
	v.string(),
	async (slug) => { /* ... */ },
	{
		+++dynamic: true+++,
		inputs: () => [
			'first-post',
			'second-post',
			'third-post'
		]
	}
);
```

## Handling validation errors

As long as _you're_ not passing invalid data to your remote functions, there are only two reasons why the argument passed to a `command`, `query` or `prerender` function would fail validation:

- the function signature changed between deployments, and some users are currently on an older version of your app
- someone is trying to attack your site by poking your exposed endpoints with bad data

In the second case, we don't want to give the attacker any help, so SvelteKit will generate a generic [400 Bad Request](https://http.dog/400) response. Validation failures pass through the server [`handleError`](hooks#handleError) hook with `kind: 'validation'`, an `error` object containing `{ status, message }`, and the validation `issues`. You can use the issues to log the failure or customise the response:

```js
/// file: src/hooks.server.js
/** @type {import('@sveltejs/kit/hooks').HandleServerError} */
export function handleError({ kind, issues }) {
	if (kind === 'validation') {
		console.error(issues);
		return {
			message: 'Nice try, hacker!'
		};
	}
}
```

Be thoughtful about exposing validation issues, as they may give an attacker useful information. Returning `error` unchanged is safe — unlike `issues`, it only contains the generic status and message.

If you know what you're doing and want to opt out of validation, you can pass the string `'unchecked'` in place of a schema:

```ts
/// file: data.remote.ts
import { query } from '$app/server';

export const getStuff = query('unchecked', async ({ id }: { id: string }) => {
	// the shape might not actually be what TypeScript thinks
	// since bad actors might call this function with other arguments
});
```

## Using `getRequestEvent`

Inside `query`, `form` and `command` you can use [`getRequestEvent`]($app-server#getRequestEvent) to get the current [`RequestEvent`](@sveltejs-kit#RequestEvent) object. This makes it easy to build abstractions for interacting with cookies, for example:

```ts
/// file: user.remote.js
// @filename: ambient.d.ts
interface User {
	name: string;
	avatar: string;
}

declare module '#lib/server/database.js' {
	export function findUser(sessionId: string | undefined): Promise<User | null>;
}

// @filename: index.js
// ---cut---
import { getRequestEvent, query } from '$app/server';
import { findUser } from '#lib/server/database.js';

export const getProfile = query(async () => {
	const user = await getUser();

	return user && {
		name: user.name,
		avatar: user.avatar
	};
});

// this query could be called from multiple places, but
// the function will only run once per request
const getUser = query(async () => {
	const { cookies } = getRequestEvent();

	return await findUser(cookies.get('session_id'));
});
```

Note that some properties of `RequestEvent` are different inside remote functions:

- you cannot set headers (other than writing cookies, and then only inside `form` and `command` functions)
- inside `query` functions (including `query.batch` and `query.live`), accessing `route`, `params` or `url` throws an error. Queries are cached by their arguments and are not re-run when the user navigates, so results depending on these values would go stale without the cache noticing. Pass values from the page as arguments to the query instead. You can still derive trusted context from cookies or headers in the [`handle`](hooks#handle) hook and put it on `locals`, but note that for query requests `handle` sees the URL of the remote endpoint, not of the page
- in `form` and `command` functions, `route`, `params` and `url` relate to the page the remote function was called from, _not_ the URL of the endpoint SvelteKit creates for the remote function. Never use them to determine whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated

## Implications for authentication

Since a remote function call can come from any page, the request event URL may be manipulated by the client. Therefore, you _must_ run your authentication checks directly inside your remote functions that need it. This check can be created as a shared helper:

```js
/// file: src/lib/server/auth.js
// @filename: ambient.d.ts
interface User {
	id: string;
	name: string;
}

declare namespace App {
	interface Locals {
		user: User | null;
	}
}

// @filename: index.js
// ---cut---
import { redirect } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';

export function requireLogin() {
	const { locals } = getRequestEvent();

	if (!locals.user) redirect(303, '/login');

	return locals.user;
}
```

Now you can use it in whichever remote functions require authentication:

```js
/// file: src/lib/projects.remote.js
// @filename: ambient.d.ts
declare module '#lib/server/auth.js' {
	export function requireLogin(): { id: string; name: string };
}

declare module '#lib/server/database.js' {
	export function getProjects(
		userId: string
	): Promise<Array<{ id: string; name: string }>>;
}

// @filename: index.js
// ---cut---
import { query } from '$app/server';
import { requireLogin } from '#lib/server/auth.js';
import { getProjects } from '#lib/server/database.js';

export const getMyProjects = query(async () => {
	const user = requireLogin();

	return await getProjects(user.id);
});
```

> [!NOTE] `redirect` can't be used inside `command` functions, so commands should use [`error(401)`](@sveltejs-kit#error) instead.

Now, any component that calls `getMyProjects` will only be rendered if the user is logged in, regardless of which page uses it:

```svelte
<!--- file: src/lib/ProjectList.svelte --->
<script>
	import { getMyProjects } from '#lib/projects.remote.js';
</script>

<ul>
	{#each await getMyProjects() as project (project.id)}
		<li><a href="/projects/{project.id}">{project.name}</a></li>
	{/each}
</ul>
```

## Redirects

Inside `query`, `form` and `prerender` functions it is possible to use the [`redirect(...)`](@sveltejs-kit#redirect) function. It is *not* possible inside `command` functions, as you should avoid redirecting here. (If you absolutely have to, you can return a `{ redirect: location }` object and deal with it in the client.)

# Environment variables

Environment variables are values your app needs that exist separately from the app's source code. They allow you to use sensitive information like API keys and database credentials without storing them in version control.

During development, and at build time, variables defined in a `.env` or `.env.local` file will be added to the environment:

```env
/// file: .env.local
API_KEY=19f401ba-e8b0-48c4-8c77-b0ebb26d97fe
```

After following the setup below, they can be imported via the following modules:

- [`$app/env/private`]($app-env-private)
- [`$app/env/public`]($app-env-public)

> [!LEGACY]
> The `$env/*` modules, along with `$app/environment` were deprecated in SvelteKit 3 (and will be removed in SvelteKit 4) in favour of explicit environment variables that were added in SvelteKit 2.62 as an experimental option.

## Setup

Add a `src/env.ts` (or `src/env.js`) file that exports a `variables` object:

```ts
/// file: src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	// ...
});
```

Each value in the object passed to [`defineEnvVars`](@sveltejs-kit-env#defineEnvVars) is an [`EnvVarConfig`](@sveltejs-kit-env#EnvVarConfig) object that configures the environment variable.

> [!NOTE] `defineEnvVars` returns its argument unaltered — it exists purely to help with type safety.

## Private variables

By default, all variables are considered private. For example, you don't want to reveal your `API_KEY`:

```ts
/// file: src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	+++API_KEY: {}+++
});
```

> [!NOTE] Since no configuration is needed for this variable, we can use an empty object (`{}`).

Now that `API_KEY` is defined, it can be imported into app code via `$app/env/private`:

```js
import { API_KEY } from '$app/env/private';
```

The `$app/env/private` module cannot be imported into code that runs in the browser, so that you can't accidentally reveal your secrets in a JavaScript bundle.

## Public variables

Some variables are perfectly safe — necessary, even — to expose to the browser. For these, we can specify `public: true`:

```ts
/// file: src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	GOOGLE_ANALYTICS_ID: {
		+++public: true+++
	}
});
```

`GOOGLE_ANALYTICS_ID` can now be imported from `$app/env/public`, or used in your `app.html` template as `%sveltekit.env.GOOGLE_ANALYTICS_ID%`:

```html
<!--- file: src/app.html --->
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<link rel="icon" href="%sveltekit.assets%/favicon.png" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		%sveltekit.head%

		<script
			async
			src="https://www.googletagmanager.com/gtag/js?id=+++%sveltekit.env.GOOGLE_ANALYTICS_ID%+++"
		></script>

		<script>
			window.dataLayer ??= [];
			function gtag(){dataLayer.push(arguments)}
			gtag('js', new Date());
			gtag('config', +++'%sveltekit.env.GOOGLE_ANALYTICS_ID%'+++);
		</script>
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

## Validation

You can specify a [Standard Schema](https://standardschema.dev/) validator such as [Zod](https://zod.dev/) or [Valibot](https://valibot.dev/) to check that an environment variable value is correct:

```ts
/// file: src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';
+++import * as v from 'valibot';+++

export const variables = defineEnvVars({
	GOOGLE_ANALYTICS_ID: {
		public: true,
		+++schema: v.pipe(v.string(), v.regex(/G-[A-Z0-9]+/))+++
	}
});
```

If you don't want to bring in a schema library, you can pass a function that returns the (possibly transformed) value, or throws an error explaining the problem:

```ts
/// file: src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	GOOGLE_ANALYTICS_ID: {
		public: true,
		schema: (value) => {
			if (!value?.startsWith('G-')) throw new Error('expected a Google Analytics ID');
			return value;
		}
	}
});
```

If a value is invalid, the app will fail to start (or build). To opt out of one or the other, use [`building`]($app-env#building) from `$app/env` along with a validator that accepts an optional value:

```ts
/// file: src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';
+++import { building } from '$app/env'+++
import * as v from 'valibot';

export const variables = defineEnvVars({
	SECRET: {
		// optional when building but required when starting the app
		+++schema: building ? v.optional(v.string()) : v.string()+++
	}
});
```

You can use validators to make values optional, or transform them (such as turning a string into a boolean, or parsing JSON) — see your validation library's documentation to learn how.

## Static variables

By default, variables are dynamic. If a variable is configured with `static: true`, it will be inlined into your application code, enabling optimisations like dead-code elimination:

```ts
/// file: src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

export const variables = defineEnvVars({
	SHOW_DEBUG_OVERLAY: {
		public: true,
		+++static: true,+++

		// coerce to true/false
		schema: v.pipe(
			v.optional(v.string(), ''),
			v.transform((str) => str !== '')
		)
	}
});
```

Because this variable is `static`, the `<DebugOverlay>` component shown here will be excluded from the JavaScript bundle unless `SHOW_DEBUG_OVERLAY` is truthy:

```svelte
<script>
	import { SHOW_DEBUG_OVERLAY } from '$app/env/public';
	import DebugOverlay from '#lib/components/DebugOverlay.svelte';
</script>

{#if SHOW_DEBUG_OVERLAY}
	<DebugOverlay />
{/if}
```

But if the variable is set before building the app...

```bash
SHOW_DEBUG_OVERLAY=true npm run build
```

...then the component will be included and shown.

## Documenting variables

You can document the purpose of an environment variable by adding a `description`:

```ts
/// file: src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	CACHE_TTL_SECONDS: {
		description: 'How long to cache responses, in seconds'
	}
});
```

Hovering over `CACHE_TTL_SECONDS` in your app code will show the description.

# Building your app

Building a SvelteKit app happens in two stages, which both happen when you run `vite build` (usually via `npm run build`).

Firstly, Vite creates an optimized production build of your server code, your browser code, and your service worker (if you have one). [Prerendering](page-options#prerender) is executed at this stage, if appropriate.

Secondly, an _adapter_ takes this production build and tunes it for your target environment — more on this on the following pages.

## During the build

SvelteKit will load your `+page/layout(.server).js` files (and all files they import) for analysis during the build. Any code that should _not_ be executed at this stage must check that `building` from [`$app/env`]($app-env) is `false`:

```js
+++import { building } from '$app/env';+++
import { initialiseDatabase } from '#lib/server/database.js';

+++if (!building) {+++
	initialiseDatabase();
+++}+++

export function load() {
	// ...
}
```

## Preview your app

After building, you can view your production build locally with `vite preview` (via `npm run preview`). Note that this will run the app in Node, and so is not a perfect reproduction of your deployed app — adapter-specific adjustments like the [`platform` object](adapters#Platform-specific-context) do not apply to previews.

# Adapters

Before you can deploy your SvelteKit app, you need to _adapt_ it for your deployment target. Adapters are small plugins that take the built app as input and generate output for deployment.

Official adapters exist for a variety of platforms — these are documented on the following pages:

- [`@sveltejs/adapter-cloudflare`](adapter-cloudflare) for Cloudflare Workers
- [`@sveltejs/adapter-netlify`](adapter-netlify) for Netlify
- [`@sveltejs/adapter-node`](adapter-node) for Node servers
- [`@sveltejs/adapter-bun`](adapter-bun) for Bun servers
- [`@sveltejs/adapter-static`](adapter-static) for static site generation (SSG)
- [`@sveltejs/adapter-vercel`](adapter-vercel) for Vercel

Additional [community-provided adapters](/packages#sveltekit-adapters) exist for other platforms.

## Using adapters

Run [`npx sv add sveltekit-adapter`](/docs/cli/sveltekit-adapter) to install an adapter and add it to your config.

Your adapter is specified in `vite.config.js`:

```js
/// file: vite.config.js
// @filename: ambient.d.ts
declare module 'svelte-adapter-foo' {
	const adapter: (opts?: any) => import('@sveltejs/kit').Adapter;
	export default adapter;
}

// @errors: 2554
// @filename: index.js
// ---cut---
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
+++import adapter from 'svelte-adapter-foo';+++

export default defineConfig({
	plugins: [
		sveltekit({
			+++adapter: adapter()+++
		})
	]
});
```

## Platform-specific context

Some adapters may have access to additional information about the request. For example, Cloudflare Workers can access an `env` object containing KV namespaces etc. This can be passed to the `RequestEvent` used in [hooks](hooks) and [server routes](routing#server) as the `platform` property — consult each adapter's documentation to learn more.

# Zero-config deployments

When you create a new SvelteKit project with `npx sv create`, it installs [`adapter-auto`](https://github.com/sveltejs/kit/tree/main/packages/adapter-auto) by default. This adapter automatically installs and uses the correct adapter for supported environments when you deploy:

- [`@sveltejs/adapter-cloudflare`](adapter-cloudflare) for [Cloudflare Workers](https://www.cloudflare.com/products/workers/)
- [`@sveltejs/adapter-netlify`](adapter-netlify) for [Netlify](https://netlify.com/)
- [`@sveltejs/adapter-vercel`](adapter-vercel) for [Vercel](https://vercel.com/)
- [`svelte-adapter-azure-swa`](https://github.com/geoffrich/svelte-adapter-azure-swa) for [Azure Static Web Apps](https://docs.microsoft.com/en-us/azure/static-web-apps/)
- [`svelte-kit-sst`](https://github.com/sst/v2/tree/master/packages/svelte-kit-sst) for [AWS via SST](https://sst.dev/docs/start/aws/svelte)
- [`@sveltejs/adapter-node`](adapter-node) for [Google Cloud Run](https://cloud.google.com/run)
- [`@sveltejs/adapter-node`](adapter-node) for [Render](https://render.com)

It's recommended to install the appropriate adapter to your `devDependencies` once you've settled on a target environment, since this will add the adapter to your lockfile and slightly improve install times on CI.

## Environment-specific configuration

To add configuration options, such as `{ edge: true }` in [`adapter-vercel`](adapter-vercel) and [`adapter-netlify`](adapter-netlify), you must install the underlying adapter — `adapter-auto` does not take any options.

## Adding community adapters

You can add zero-config support for additional adapters by editing [adapters.js](https://github.com/sveltejs/kit/blob/main/packages/adapter-auto/adapters.js) and opening a pull request.

# Node servers

To generate a standalone Node server, use [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node).

A quick way to get started is by deploying a project using SvelteKit's [official Railway template](https://railway.com/deploy/svelte-kit).

## Usage

Run [`npx sv add sveltekit-adapter="adapter:node"`](/docs/cli/sveltekit-adapter), or install with `npm i -D @sveltejs/adapter-node` and add the adapter to your `vite.config.js`:

```js
// @errors: 2307 2554
/// file: vite.config.js
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter()
		})
	]
});
```

## Deploying

First, build your app with `npm run build`. This will create the production server in the output directory specified in the adapter options, defaulting to `build`.

You will need the output directory, the project's `package.json`, and the production dependencies in `node_modules` to run the application. Production dependencies can be generated by copying the `package.json` and `package-lock.json` and then running `npm ci --omit dev` (you can skip this step if your app doesn't have any dependencies). You can then start your app with this command:

```sh
node build
```

Development dependencies will be bundled into your app using [Rolldown](https://rolldown.rs/). To control whether a given package is bundled or externalised, place it in `devDependencies` or `dependencies` respectively in your `package.json`.

Client assets and prerendered output are served from a list of files recorded during the build.

### Compressing responses

You will typically want to compress responses coming from the server. If you're already deploying your server behind a reverse proxy for SSL or load balancing, it typically results in better performance to also handle compression at that layer since Node.js is single-threaded.

However, if you're building a [custom server](#Custom-server) and do want to add a compression middleware there, note that we would recommend using [`@polka/compression`](https://www.npmjs.com/package/@polka/compression) since SvelteKit streams responses and the more popular `compression` package does not support streaming and may cause errors when used.

## Environment variables

In `dev` and `preview`, SvelteKit will read environment variables from your `.env` file (or `.env.local`, or `.env.[mode]`, [as determined by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files).)

In production, `.env` files are _not_ automatically loaded. To do so, use the [`--env-file`](https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs) flag when running the built app:

```sh
node +++--env-file=.env+++ build
```

### `PORT`, `HOST` and `SOCKET_PATH`

By default, the server will accept connections on `0.0.0.0` using port 3000. These can be customised with the `PORT` and `HOST` environment variables:

```sh
HOST=127.0.0.1 PORT=4000 node build
```

Alternatively, the server can be configured to accept connections on a specified socket path. When this is done using the `SOCKET_PATH` environment variable, the `HOST` and `PORT` environment variables will be disregarded.

```sh
SOCKET_PATH=/tmp/socket node build
```

### `PROTOCOL_HEADER`, `HOST_HEADER`, and `PORT_HEADER`

HTTP doesn't give SvelteKit a reliable way to know the URL that is currently being requested. By default, SvelteKit will derive the origin from the request's `host` header (and the `https` protocol, if no `PROTOCOL_HEADER` is set).

If your app is served from an origin that isn't known at request time — for example because it's behind a reverse proxy that doesn't pass the `host` header, or because you want to use a canonical origin for CSRF checks that differs from the request's host — you can set the [`paths.origin`](@sveltejs-kit-vite#paths) option in your `vite.config.js`:

```js
// @errors: 2307
/// file: vite.config.js
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
			paths: {
				origin: 'https://my.site'
			}
		})
	]
});
```

When `paths.origin` is not set (the default), `adapter-node` uses a set `ORIGIN` environment variable at runtime:

```sh
ORIGIN=https://my.site node build
```

Otherwise, it derives the origin from the request — using the `host` header (and `PROTOCOL_HEADER`/`PORT_HEADER` if set) — and sets `request.url` accordingly. Otherwise, the configured value is used as the trusted self-origin for CSRF checks on form submissions and remote function calls, and as the value of `url.origin` during prerendering.

Alternatively, you can specify headers that tell SvelteKit about the request protocol and host, from which it can construct the origin URL:

```sh
PROTOCOL_HEADER=x-forwarded-proto HOST_HEADER=x-forwarded-host node build
```

> [!NOTE] [`x-forwarded-proto`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto) and [`x-forwarded-host`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host) are de facto standard headers that forward the original protocol and host if you're using a reverse proxy (think load balancers and CDNs). You should only set these variables if your server is behind a trusted reverse proxy; otherwise, it'd be possible for clients to spoof these headers.
>
> If you're hosting your proxy on a non-standard port and your reverse proxy supports `x-forwarded-port`, you can also set `PORT_HEADER=x-forwarded-port`.

If `adapter-node` can't correctly determine the URL of your deployment, you may experience this error when using [form actions](form-actions):

> Cross-site POST form submissions are forbidden

### `ADDRESS_HEADER` and `XFF_DEPTH`

The [`RequestEvent`](@sveltejs-kit#RequestEvent) object passed to hooks and endpoints includes an `event.getClientAddress()` function that returns the client's IP address. By default this is the connecting `remoteAddress`. If your server is behind one or more proxies (such as a load balancer), this value will contain the innermost proxy's IP address rather than the client's, so we need to specify an `ADDRESS_HEADER` to read the address from:

```sh
ADDRESS_HEADER=True-Client-IP node build
```

> [!NOTE] Headers can easily be spoofed. As with `PROTOCOL_HEADER` and `HOST_HEADER`, you should [know what you're doing](https://adam-p.ca/blog/2022/03/x-forwarded-for/) before setting these.

If the `ADDRESS_HEADER` is `X-Forwarded-For`, the header value will contain a comma-separated list of IP addresses. The `XFF_DEPTH` environment variable should specify how many trusted proxies sit in front of your server. E.g. if there are three trusted proxies, proxy 3 will forward the addresses of the original connection and the first two proxies:

```
<client address>, <proxy 1 address>, <proxy 2 address>
```

Some guides will tell you to read the left-most address, but this leaves you [vulnerable to spoofing](https://adam-p.ca/blog/2022/03/x-forwarded-for/):

```
<spoofed address>, <client address>, <proxy 1 address>, <proxy 2 address>
```

We instead read from the _right_, accounting for the number of trusted proxies. In this case, we would use `XFF_DEPTH=3`.

> [!NOTE] If you need to read the left-most address instead (and don't care about spoofing) — for example, to offer a geolocation service, where it's more important for the IP address to be _real_ than _trusted_, you can do so by inspecting the `x-forwarded-for` header within your app.

### `BODY_SIZE_LIMIT`

The maximum request body size to accept in bytes including while streaming. The body size can also be specified with a unit suffix for kilobytes (`K`), megabytes (`M`), or gigabytes (`G`). For example, `512K` or `1M`. Defaults to 512kb. You can disable this option with a value of `Infinity` (0 in older versions of the adapter) and implement a custom check in [`handle`](hooks#handle) if you need something more advanced.

### `SHUTDOWN_TIMEOUT`

The number of seconds to wait before forcefully closing any remaining connections after receiving a `SIGTERM` or `SIGINT` signal. Defaults to `30`. Internally the adapter calls [`closeAllConnections`](https://nodejs.org/api/http.html#servercloseallconnections). See [Graceful shutdown](#Graceful-shutdown) for more details.

### `IDLE_TIMEOUT`

When using systemd socket activation, `IDLE_TIMEOUT` specifies the number of seconds after which the app is automatically put to sleep when receiving no requests. If not set, the app runs continuously. See [Socket activation](#Socket-activation) for more details.

### `KEEP_ALIVE_TIMEOUT` and `HEADERS_TIMEOUT`

The number of seconds for [`keepAliveTimeout`](https://nodejs.org/api/http.html#serverkeepalivetimeout) and [`headersTimeout`](https://nodejs.org/api/http.html#serverheaderstimeout).

## Options

The adapter can be configured with various options:

```js
// @errors: 2307 2554
/// file: vite.config.js
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				// default options are shown
				out: 'build',
				precompress: true,
				envPrefix: ''
			})
		})
	]
});
```

### out

The directory to build the server to. It defaults to `build` — i.e. `node build` would start the server locally after it has been created.

### precompress

Generates `.br` and `.gz` variants of client and prerendered assets during the build. The server negotiates `Accept-Encoding` per request, preferring brotli over gzip, and each variant carries its own ETag. It defaults to `true`.

### envPrefix

If you need to change the name of the environment variables used to configure the deployment (for example, to deconflict with environment variables you don't control), you can specify a prefix:

```js
envPrefix: 'MY_CUSTOM_';
```

```sh
MY_CUSTOM_HOST=127.0.0.1 \
MY_CUSTOM_PORT=4000 \
node build
```

## Graceful shutdown

By default `adapter-node` gracefully shuts down the HTTP server when a `SIGTERM` or `SIGINT` signal is received. It will:

1. reject new requests ([`server.close`](https://nodejs.org/api/http.html#serverclosecallback))
2. wait for requests that have already been made but not received a response yet to finish and close connections once they become idle ([`server.closeIdleConnections`](https://nodejs.org/api/http.html#servercloseidleconnections))
3. and finally, close any remaining connections that are still active after [`SHUTDOWN_TIMEOUT`](#Environment-variables-SHUTDOWN_TIMEOUT) seconds. ([`server.closeAllConnections`](https://nodejs.org/api/http.html#servercloseallconnections))

> [!NOTE] If you want to customize this behaviour you can use a [custom server](#Custom-server).

You can listen to the `sveltekit:shutdown` event which is emitted after the HTTP server has closed all connections. Unlike Node's `exit` event, the `sveltekit:shutdown` event supports asynchronous operations and is always emitted when all connections are closed even if the server has dangling work such as open database connections.

```js
// @errors: 2304
process.on('sveltekit:shutdown', async (reason) => {
	await jobs.stop();
	await db.close();
});
```

The parameter `reason` has one of the following values:

- `SIGINT` - shutdown was triggered by a `SIGINT` signal
- `SIGTERM` - shutdown was triggered by a `SIGTERM` signal
- `IDLE` - shutdown was triggered by [`IDLE_TIMEOUT`](#Environment-variables-IDLE_TIMEOUT)

## Socket activation

Most Linux operating systems today use a modern process manager called systemd to start the server and run and manage services. You can configure your server to allocate a socket and start and scale your app on demand. This is called [socket activation](https://0pointer.de/blog/projects/socket-activated-containers.html). In this case, the OS will pass two environment variables to your app — `LISTEN_PID` and `LISTEN_FDS`. The adapter will then listen on file descriptor 3 which refers to a systemd socket unit that you will have to create.

> [!NOTE] You can still use [`envPrefix`](#Options-envPrefix) with systemd socket activation. `LISTEN_PID` and `LISTEN_FDS` are always read without a prefix.

To take advantage of socket activation follow these steps.

1. Run your app as a [systemd service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html). It can either run directly on the host system or inside a container (using Docker or a systemd portable service for example). If you additionally pass an [`IDLE_TIMEOUT`](#Environment-variables-IDLE_TIMEOUT) environment variable to your app it will gracefully shutdown if there are no requests for `IDLE_TIMEOUT` seconds. systemd will automatically start your app again when new requests are coming in.

```ini
/// file: /etc/systemd/system/myapp.service
[Service]
Environment=NODE_ENV=production IDLE_TIMEOUT=60
ExecStart=/usr/bin/node /usr/bin/myapp/build
```

2. Create an accompanying [socket unit](https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html). The adapter only accepts a single socket.

```ini
/// file: /etc/systemd/system/myapp.socket
[Socket]
ListenStream=3000

[Install]
WantedBy=sockets.target
```

3. Make sure systemd has recognised both units by running `sudo systemctl daemon-reload`. Then enable the socket on boot and start it immediately using `sudo systemctl enable --now myapp.socket`. The app will then automatically start once the first request is made to `localhost:3000`.

## Custom server

The build directory contains two entry points, `index.js` and `handler.js`. Running `index.js` — e.g. `node build`, if you use the default build directory — will start a server on the configured port.

Alternatively, you can import the `handler.js` file, which exports a handler suitable for use with [Express](https://github.com/expressjs/express), [Connect](https://github.com/senchalabs/connect) or [Polka](https://github.com/lukeed/polka) (or even just the built-in [`http.createServer`](https://nodejs.org/dist/latest/docs/api/http.html#httpcreateserveroptions-requestlistener)) and set up your own server:

```js
// @errors: 2307 7006
/// file: my-server.js
import { handler } from './build/handler.js';
import express from 'express';

const app = express();

// add a route that lives separately from the SvelteKit app
app.get('/healthcheck', (req, res) => {
	res.end('ok');
});

// let SvelteKit handle everything else, including serving prerendered pages and static assets
app.use(handler);

app.listen(3000, () => {
	console.log('listening on port 3000');
});
```

> [!NOTE] When you use `handler.js` in a custom server, only the environment variables read by the handler itself take effect: `PROTOCOL_HEADER`, `HOST_HEADER`, `PORT_HEADER`, `ADDRESS_HEADER`, `XFF_DEPTH`, and `BODY_SIZE_LIMIT`.
>
> The server-lifecycle variables (`PORT`, `HOST`, `SOCKET_PATH`, `SHUTDOWN_TIMEOUT`, `IDLE_TIMEOUT`, `KEEP_ALIVE_TIMEOUT`, `HEADERS_TIMEOUT`, `LISTEN_PID`, `LISTEN_FDS`) are only honored by the default `node build` server. Implement them yourself in a custom server if you need the same behavior — for example, the snippet above listens on a hardcoded `3000` regardless of `PORT`.

# Bun servers

[`adapter-bun`](https://github.com/sveltejs/kit/tree/main/packages/adapter-bun) builds a SvelteKit application into a standalone [Bun](https://bun.com/) server. The generated server uses `Bun.serve` for requests and `Bun.file` responses for client assets, prerendered output, and files read with [`read`](https://svelte.dev/docs/kit/$app-server#read) from `$app/server`.

> [!NOTE] Bun 1.4 or newer is required.

## Usage

Run `npx sv add sveltekit-adapter="adapter:bun"`, or install with `npm i -D @sveltejs/adapter-bun` and add the adapter to your `vite.config.js`:

```js
// @errors: 2307 2554
/// file: vite.config.js
import adapter from '@sveltejs/adapter-bun';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter()
		})
	]
});
```

The adapter calls Bun's build API, so the production build itself must run in Bun. The `--bun` flag overrides Vite's Node.js shebang:

```sh
bun run --bun build
```

The default build is written to `build`. Start it with:

```sh
bun ./build
```

You will need the output directory, the project's `package.json`, and the production dependencies in `node_modules` to run the application. Production dependencies can be generated by copying the `package.json` and `bun.lock` and then running `bun install --production --frozen-lockfile` (you can skip this step if your app doesn't have any dependencies). Development dependencies are bundled into your app. To control whether a given package is bundled or externalised, place it in `devDependencies` or `dependencies` respectively in your `package.json`.

Client assets and prerendered output are served before a request reaches SvelteKit. Only `GET` and `HEAD` requests are served this way; other methods continue to SvelteKit. Every asset carries an ETag computed during the build, so conditional requests revalidate with an empty `304` response. Bun supplies MIME types, byte ranges for filesystem-backed files, and streaming without buffering every asset in memory. Files below SvelteKit's `immutable` directory receive `Cache-Control: public,max-age=31536000,immutable`.

## Options

```js
// @errors: 2307 2554
/// file: vite.config.js
import adapter from '@sveltejs/adapter-bun';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				out: 'build',
				envPrefix: '',
				serverOptions: {
					idleTimeout: 30
				}
			})
		})
	]
});
```

### out

The output directory. It defaults to `build`.

### precompress

Set `precompress: true` to generate `.br` and `.gz` variants of client and prerendered assets during the build. The server negotiates `Accept-Encoding` per request, preferring brotli over gzip, and each variant carries its own ETag. The option is ignored when `buildOptions.compile` is set, because embedded assets are imported by identity path.

### envPrefix

A prefix for every deployment environment variable documented below. This is useful when the unprefixed names conflict with variables managed by your host:

```js
// @errors: 2307
import adapter from '@sveltejs/adapter-bun';
// ---cut---
adapter({ envPrefix: 'MY_APP_' });
```

```sh
MY_APP_HOST=127.0.0.1 MY_APP_PORT=4000 bun ./build
```

When a prefix is configured, the server fails at startup if it finds an unknown environment variable with that prefix. This catches collisions and misspellings.

### serverOptions

JSON-serializable defaults passed to `Bun.serve`. The supported properties are:

- `hostname`
- `port`
- `unix`
- `reusePort`
- `ipv6Only`
- `idleTimeout`
- `maxRequestBodySize`
- `development`

Environment variables take precedence over these defaults. A configured Unix socket takes precedence over `hostname`, `port`, `reusePort`, and `ipv6Only`.

The generated server owns `fetch` and `routes`. It does not expose `websocket`, `error`, TLS, HTTP/3, or HTTP/1 configuration through `serverOptions`. Use a custom Bun integration if your application requires those `Bun.serve` options.

### buildOptions

`buildOptions` configures the `Bun.build` call that turns the server into an executable, so it only applies when `compile` is set. The adapter accepts `sourcemap`, `minify`, `bytecode`, `banner`, `footer`, `drop`, `features`, `optimizeImports`, `external`, and `compile`. The entrypoint, output directory, top-level `target`, and module `format` are reserved. Source maps default to `external`; set `sourcemap: 'none'` to disable them.

#### Compiled executables

Set `compile: true` to generate a single executable at `<out>/server`:

```js
// @errors: 2307
import adapter from '@sveltejs/adapter-bun';
// ---cut---
adapter({
	buildOptions: {
		compile: true
	}
});
```

Build and run it without a separately installed Bun runtime:

```sh
bun run --bun build
./build/server
```

The executable embeds the server code, client assets, prerendered output, and Bun runtime. `compile` can also be a Bun target string, which keeps the default `server` filename, or an options object. To change the executable name or cross-compile, provide an options object:

```js
// @errors: 2307
import adapter from '@sveltejs/adapter-bun';
// ---cut---
adapter({
	out: 'dist',
	buildOptions: {
		compile: {
			outfile: 'application',
			target: 'bun-linux-x64'
		},
		minify: true,
		bytecode: true,
		sourcemap: 'linked'
	}
});
```

The result in this example is `dist/application`. Platform targets, native dependencies, and other limitations follow [Bun's executable compilation rules](https://bun.com/docs/compiler/executables).

Executables bundle production dependencies, since there is no `node_modules` to resolve them from. To resolve a package from `node_modules` at runtime instead, list it in `external` and set `compile: { autoloadPackageJson: true }`. Packages that read files relative to their own location, such as `jsdom`, only work this way.

## Environment variables

Bun loads `.env` files automatically. If `envPrefix` is set, add that prefix to each name in this section.

### Listener

`HOST` and `PORT` configure the TCP listener. Without either value or a `serverOptions` default, the server listens on port `3000`.

```sh
HOST=127.0.0.1 PORT=4000 bun ./build
```

`SOCKET_PATH` selects a Unix domain socket instead. When it is present, TCP-only options are ignored:

```sh
SOCKET_PATH=/tmp/sveltekit.sock bun ./build
```

`REUSE_PORT` enables Bun's `reusePort` option and `IPV6_ONLY` enables `ipv6Only`. Boolean variables accept `1`, `true`, `yes`, and `on`, or `0`, `false`, `no`, and `off`, without regard to letter case.

### Request limits and diagnostics

`BODY_SIZE_LIMIT` controls `Bun.serve`'s `maxRequestBodySize`. It defaults to `512K`. The value must resolve to a whole number of bytes and may use a case-insensitive binary `K`, `M`, or `G` suffix, such as `768K` or `1.5M`. `Infinity` disables the limit.

`CONNECTION_IDLE_TIMEOUT` sets Bun's per-request inactivity timeout in seconds. It must be an integer from `0` through `255`; `0` disables the timeout. The generated handler disables the timeout for responses whose content type starts with `text/event-stream` and also adds `X-Accel-Buffering: no`. It is deliberately not called `IDLE_TIMEOUT`, which on adapter-node means something different (shut the server down after N seconds without requests).

`DEVELOPMENT` enables Bun's development-mode error pages. It defaults to `false` for the generated server.

### Public origin behind a proxy

If [`paths.origin`](@sveltejs-kit-vite#paths) is configured, or the `ORIGIN` environment variable is set at runtime, that value is the trusted origin for every request. Otherwise, the adapter derives the host from the `Host` header and assumes the scheme is `https`, since production deployments usually terminate TLS upstream. Configure `paths.origin`, `ORIGIN` or `PROTOCOL_HEADER` if that assumption is wrong, for example when serving plain HTTP directly.

Behind a trusted reverse proxy, `PROTOCOL_HEADER`, `HOST_HEADER`, and `PORT_HEADER` name headers that contain the public scheme, host, and port:

```sh
PROTOCOL_HEADER=x-forwarded-proto \
HOST_HEADER=x-forwarded-host \
PORT_HEADER=x-forwarded-port \
bun ./build
```

The protocol header must contain `http` or `https`, without a colon. The port header must contain a number. Invalid values produce a `400 Bad Request` response. A header that is present but empty is ignored in favour of the fallback.

> [!CAUTION] Only trust forwarded headers when requests can reach the server through a proxy you control. A direct client can spoof these headers.

### Client addresses behind a proxy

[`event.getClientAddress()`](https://svelte.dev/docs/kit/@sveltejs-kit#RequestEvent) uses `server.requestIP(request).address` by default. Set `ADDRESS_HEADER` to the name of a trusted proxy header when the direct peer is a proxy:

```sh
ADDRESS_HEADER=true-client-ip bun ./build
```

For `x-forwarded-for`, also set `XFF_DEPTH` to the number of trusted proxies. The default depth is `1`, and the adapter selects from the right side of the comma-separated list so client-supplied entries to the left cannot change the trusted result:

```sh
ADDRESS_HEADER=x-forwarded-for XFF_DEPTH=2 bun ./build
```

`XFF_DEPTH` must be an integer of at least `1`. `getClientAddress()` throws if the configured header is absent or contains fewer addresses than the configured depth.

## Platform API

The request event's `platform` property exposes the Bun server instance:

```js
/** @type {import('./$types').RequestHandler} */
export function GET({ getClientAddress, platform }) {
	return Response.json({
		address: getClientAddress(),
		serverId: platform.server.id,
		pendingRequests: platform.server.pendingRequests,
		pendingWebSockets: platform.server.pendingWebSockets
	});
}
```

## Graceful shutdown

On `SIGINT` or `SIGTERM`, the generated server calls `server.stop()`. Bun stops accepting new connections and the adapter waits for pending requests before emitting a `sveltekit:shutdown` process event with the signal name:

```js
process.on('sveltekit:shutdown', async (reason) => {
	await jobs.stop();
	await db.close();
});
```

Connections that are still open after `SHUTDOWN_TIMEOUT` seconds are closed forcefully, so idle connections such as open event streams cannot delay the shutdown indefinitely. The value must be a non-negative integer and defaults to `30`.

Sending a second shutdown signal forces the process to exit with status `1`.

# Static site generation

To use SvelteKit as a static site generator (SSG), use [`adapter-static`](https://github.com/sveltejs/kit/tree/main/packages/adapter-static).

This will prerender your entire site as a collection of static files. If you'd like to prerender only some pages and dynamically server-render others, you will need to use a different adapter together with [the `prerender` option](page-options#prerender).

## Usage

Run [`npx sv add sveltekit-adapter="adapter:static"`](/docs/cli/sveltekit-adapter), or install with `npm i -D @sveltejs/adapter-static` and add the adapter to your `vite.config.js`:

```js
// @errors: 2307
/// file: vite.config.js
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				// default options are shown. On some platforms
				// these options are set automatically — see below
				pages: 'build',
				assets: 'build',
				fallback: undefined,
				precompress: false,
				strict: true
			})
		})
	]
});
```

...and add the [`prerender`](page-options#prerender) option to your root layout:

```js
/// file: src/routes/+layout.js
// If you're using a fallback (i.e. SPA mode) you don't need to prerender all
// pages by setting this here, but should prerender as many as possible to
// avoid large performance and SEO impacts
export const prerender = true;
```

> [!NOTE] You must ensure SvelteKit's [`trailingSlash`](page-options#trailingSlash) option is set appropriately for your environment. If your host does not render `/a.html` upon receiving a request for `/a` then you will need to set `trailingSlash: 'always'` in your root layout to create `/a/index.html` instead.

> [!NOTE] You must ensure SvelteKit's [`ssr`](page-options#ssr) option isn't set to `false`. Otherwise, prerendering will save an empty 'shell' page instead of the fully rendered content.

## Zero-config support

Some platforms have zero-config support (more to come in future):

- [Vercel](https://vercel.com)

On these platforms, you should omit the adapter options so that `adapter-static` can provide the optimal configuration:

```js
// @errors: 2307
/// file: vite.config.js
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(---{...}---)
		})
	]
});
```

## Options

### pages

The directory to write prerendered pages to. It defaults to `build`.

### assets

The directory to write static assets (the contents of `static`, plus client-side JS and CSS generated by SvelteKit) to. Ordinarily this should be the same as `pages`, and it will default to whatever the value of `pages` is, but in rare circumstances you might need to output pages and assets to separate locations.

### fallback

To create a [single page app (SPA)](single-page-apps) you must specify the name of the fallback page to be generated by SvelteKit, which is used as the entry point for URLs that have not been prerendered. This is commonly `200.html`, but can vary depending on your deployment platform. You should avoid `index.html` where possible to avoid conflicting with a prerendered homepage.

> [!NOTE] This option has large negative performance and SEO impacts. It is only recommended in certain circumstances such as wrapping the site in a mobile app. See the [single page apps](single-page-apps) documentation for more details and alternatives.

### precompress

If `true`, precompresses files with brotli and gzip. This will generate `.br` and `.gz` files.

### strict

By default, `adapter-static` checks that either all pages and endpoints (if any) of your app were prerendered, or you have the `fallback` option set. This check exists to prevent you from accidentally publishing an app where some parts of it are not accessible, because they are not contained in the final output. If you know this is ok (for example when a certain page only exists conditionally), you can set `strict` to `false` to turn off this check.

## GitHub Pages

When building for [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages), if your repo name is not equivalent to `your-username.github.io`, make sure to update [`config.paths.base`](@sveltejs-kit-vite#paths) to match your repo name. This is because the site will be served from `https://your-username.github.io/your-repo-name` rather than from the root.

You'll also want to generate a fallback `404.html` page to replace the default 404 page shown by GitHub Pages.

A config for GitHub Pages might look like the following:

```js
// @errors: 2307 2322
/// file: vite.config.js
import process from 'node:process';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				fallback: '404.html'
			}),
			paths: {
				base: process.argv.includes('dev') ? '' : process.env.BASE_PATH
			},
		})
	]
});
```

You can use GitHub actions to automatically deploy your site to GitHub Pages when you make a change. Here's an example workflow:

```yaml
### file: .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: 'main'

permissions:
  contents: read
  pages: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build_site:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      # If you're using pnpm, add this step then change the commands and cache key below to use `pnpm`
      # - name: Install pnpm
      #   uses: pnpm/action-setup@v6

      - name: Install Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm i

      - name: Configure Pages
        id: pages
        uses: actions/configure-pages@v6

      - name: build
        env:
          BASE_PATH: ${{ steps.pages.outputs.base_path }}
        run: |
          npm run build

      - name: Upload Artifacts
        uses: actions/upload-pages-artifact@v5
        with:
          # this should match the `pages` option in your adapter-static options
          path: 'build/'
          # keep dotfiles such as `static/.well-known`
          include-hidden-files: true

  deploy:
    needs: build_site
    runs-on: ubuntu-latest

    permissions:
      pages: write
      id-token: write

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v5
```

If you're not using GitHub actions to deploy your site (for example, you're pushing the built site to its own repo), add an empty `.nojekyll` file in your `static` directory to prevent Jekyll from interfering.

# Single-page apps

You can turn a SvelteKit app into a fully client-rendered single-page app (SPA) by specifying a _fallback page_. This page will be served for any URLs that can't be served by other means such as returning a prerendered page.

> [!NOTE] SPA mode has a large negative performance impact by forcing multiple network round trips (for the blank HTML document, then for the JavaScript, and then for any data needed for the page) before content can be shown. Unless you are serving the app from a local network (e.g. a mobile app that wraps a locally-served SPA) this will delay startup, especially when considering the latency of mobile devices. It also harms SEO by often causing sites to be downranked for performance (SPAs are much more likely to fail [Core Web Vitals](https://web.dev/explore/learn-core-web-vitals)), excluding search engines that don't render JS, and causing your site to receive less frequent updates from those that do. And finally, it makes your app inaccessible to users if JavaScript fails or is disabled (which happens [more often than you probably think](https://kryogenix.org/code/browser/everyonehasjs.html)).
>
> You can avoid these drawbacks by [prerendering](#Prerendering-individual-pages) as many pages as possible when using SPA mode (especially your homepage). If you can prerender all pages, you can simply use [static site generation](adapter-static) rather than a SPA. Otherwise, you should strongly consider using an adapter which supports server side rendering. SvelteKit has officially supported adapters for various providers with generous free tiers.

## Usage

First, disable SSR for the pages you don't want to prerender. These pages will be served via the fallback page; for example, to serve all pages via the fallback by default, you can update the root layout as shown below. You should [opt back into prerendering individual pages and directories](#Prerendering-individual-pages) where possible.
```js
/// file: src/routes/+layout.js
export const ssr = false;
```

If you don't have any server-side logic (i.e. `+page.server.js`, `+layout.server.js` or `+server.js` files) you can use [`adapter-static`](adapter-static) to create your SPA. Install `adapter-static` with `npm i -D @sveltejs/adapter-static` and add it to your `vite.config.js` with the `fallback` option:

```js
// @errors: 2307
/// file: vite.config.js
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				fallback: '200.html' // may differ from host to host
			})
		})
	]
});
```

The `fallback` page is an HTML page created by SvelteKit from your page template (e.g. `app.html`) that loads your app and navigates to the correct route. For example [Surge](https://surge.sh/help/adding-a-200-page-for-client-side-routing), a static web host, lets you add a `200.html` file that will handle any requests that don't correspond to static assets or prerendered pages.

On some hosts it may be something else entirely — consult your platform's documentation. We recommend avoiding `index.html` if possible as it may conflict with prerendering.

> [!NOTE] Note that the fallback page will always contain absolute asset paths (i.e. beginning with `/` rather than `.`) regardless of the value of [`paths.relative`](@sveltejs-kit-vite#paths), since it is used to respond to requests for arbitrary paths.

## Prerendering individual pages

If you want certain pages to be prerendered, you can re-enable `ssr` alongside `prerender` for just those parts of your app:

```js
/// file: src/routes/my-prerendered-page/+page.js
export const prerender = true;
export const ssr = true;
```

You won't need a Node server or server capable of running JavaScript to deploy this page. It will only server render your page while building your project for the purposes of outputting an `.html` page that can be served from any static web host.

## Apache

To run an SPA on [Apache](https://httpd.apache.org/), you should add a `static/.htaccess` file to route requests to the fallback page:

```
<IfModule mod_rewrite.c>
	RewriteEngine On
	RewriteBase /
	RewriteRule ^200\.html$ - [L]
	RewriteCond %{REQUEST_FILENAME} !-f
	RewriteCond %{REQUEST_FILENAME} !-d
	RewriteRule . /200.html [L]
</IfModule>
```

# Cloudflare

To deploy to [Cloudflare Workers](https://workers.cloudflare.com/), use [`adapter-cloudflare`](https://github.com/sveltejs/kit/tree/main/packages/adapter-cloudflare).

This adapter will be installed by default when you use [`adapter-auto`](adapter-auto). If you plan on staying with Cloudflare, you can switch from [`adapter-auto`](adapter-auto) to using this adapter directly so that `cloudflare:workers` is emulated during local development, type declarations are automatically applied, and the ability to set Cloudflare-specific options is provided.

## Comparisons

- `adapter-cloudflare` – supports all SvelteKit features; builds for Cloudflare Workers Static Assets
- `adapter-cloudflare-workers` – deprecated. Supports all SvelteKit features; builds for Cloudflare Workers Sites
- `adapter-static` – only produces client-side static assets; compatible with Cloudflare Workers Static Assets and Cloudflare Pages

## Usage

Run [`npx sv add sveltekit-adapter="adapter:cloudflare"`](/docs/cli/sveltekit-adapter), or install with `npm i -D @sveltejs/adapter-cloudflare` and add the adapter to your `vite.config.js`:

```js
// @errors: 2307
/// file: vite.config.js
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				// See below for an explanation of these options
				config: undefined,
				platformProxy: {
					configPath: undefined,
					environment: undefined,
					persist: undefined
				},
				worker: true
			})
		})
	]
});
```

## Options

### config

Path to your [Wrangler configuration file](https://developers.cloudflare.com/workers/wrangler/configuration/). If you would like to use a Wrangler configuration filename other than `wrangler.jsonc`, `wrangler.json`, or `wrangler.toml` you can specify it using this option.

### platformProxy

Preferences for the emulated `env` local bindings. See the [getPlatformProxy](https://developers.cloudflare.com/workers/wrangler/api/#parameters-1) Wrangler API documentation for a full list of options.

### worker

Whether to build a Worker. It defaults to `true`. Set this to `false` if you only want to deploy static assets. In that case, [`assets.not_found_handling`](https://developers.cloudflare.com/workers/static-assets/#routing-behavior) is set to `"404-page"`, if not already set.

## Deployment

You can use the Wrangler CLI to deploy your application by running `npx wrangler deploy` or use the [Cloudflare Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/) to enable automatic builds and deployments on push.

## Runtime APIs

The [`env`](https://developers.cloudflare.com/workers/runtime-apis/fetch-event#parameters) object contains your project's [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/), which consist of KV/DO namespaces, etc. It is available on the [`cloudflare:workers`](https://developers.cloudflare.com/workers/runtime-apis/bindings/#importing-env-as-a-global) module.

```js
/// file: +server.js
// @filename: ambient.d.ts
declare module 'cloudflare:workers' {
	export const env: {
		YOUR_DURABLE_OBJECT_NAMESPACE: import('@cloudflare/workers-types').DurableObjectNamespace;
	};
}
// @filename: +server.js
// ---cut---
// @errors: 2355 2322
import { env } from 'cloudflare:workers';

/** @type {import('./$types').RequestHandler} */
export async function POST() {
	const x = env.YOUR_DURABLE_OBJECT_NAMESPACE.idFromName('x');
}
```

> [!NOTE] SvelteKit's built-in [`$app/env/*` modules](environment-variables) should be preferred for environment variables.

To make these types available to your app, install [`wrangler`](https://www.npmjs.com/package/wrangler) and run [`wrangler types`](https://developers.cloudflare.com/workers/languages/typescript/).

### Testing locally

Cloudflare specific values are emulated during dev and preview modes. Local [bindings](https://developers.cloudflare.com/workers/wrangler/configuration/#bindings) are created based on your [Wrangler configuration file](https://developers.cloudflare.com/workers/wrangler/) and are used to populate `env` during development and preview. Use the adapter config [`platformProxy` option](#Options-platformProxy) to change your preferences for the bindings.

> [!NOTE] [Durable Objects](https://developers.cloudflare.com/durable-objects/) and [Workflows](https://developers.cloudflare.com/workflows/), which require custom classes to be exported from your worker, are not currently supported. 

For testing the build, you should use [Wrangler](https://developers.cloudflare.com/workers/wrangler/) version 4. Once you have built your site, run `wrangler dev`.

## Headers and redirects

The [`_headers`](https://developers.cloudflare.com/workers/static-assets/headers/) and [`_redirects`](https://developers.cloudflare.com/workers/static-assets/redirects/) files, specific to Cloudflare, can be used for static asset responses (like images) by putting them into the project root folder.

However, they will have no effect on responses dynamically rendered by SvelteKit, which should return custom headers or redirect responses from [server endpoints](routing#server) or with the [`handle`](hooks#handle) hook.

## Troubleshooting

### Worker size limits

Deploying your application will fail if your Worker files exceed [the size limits](https://developers.cloudflare.com/workers/platform/limits/#worker-size) after minification. You're unlikely to hit this limit usually, but some large libraries can cause this to happen. In that case, you can try to reduce the size of your worker by only importing such libraries on the client side. See [the FAQ](./faq#How-do-I-use-a-client-side-library-accessing-document-or-window) for more information.

### Accessing the file system

You can't use `fs` in Cloudflare Workers.

Instead, use the [`read`]($app-server#read) function from `$app/server` to access your files. It works by fetching the file from the deployed public assets location.

Alternatively, you can [prerender](page-options#prerender) the routes in question.

## Migrating from Workers Sites

Cloudflare no longer recommends using [Workers Sites](https://developers.cloudflare.com/workers/configuration/sites/configuration/) and instead recommends using [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/). To migrate, replace `@sveltejs/adapter-cloudflare-workers` with `@sveltejs/adapter-cloudflare` and remove `main` and all `site` configuration settings from your Wrangler configuration file.

```js
// @errors: 2307
/// file: vite.config.js
+++import adapter from '@sveltejs/adapter-cloudflare';+++
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			+++adapter: adapter()+++
		})
	]
});
```

### wrangler.toml

```toml
/// file: wrangler.toml
---site.bucket = ".cloudflare/public"---
```

### wrangler.jsonc

```jsonc
/// file: wrangler.jsonc
{
---	"site": {
		"bucket": ".cloudflare/public"
	}---
}
```

## Migrating from Cloudflare Pages

To migrate to Cloudflare Workers:

1. Remove `pages_build_output_dir` from your Wrangler configuration.
2. Remove the adapter's `routes` option and any `_routes.json` files.
3. Replace `wrangler pages dev` and `wrangler pages deploy` with `wrangler dev` and `wrangler deploy`. For automatic deployments, use [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) instead of the Pages Git integration.

See Cloudflare's [Workers and Pages compatibility matrix](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/#compatibility-matrix) for a comparison of supported features.

# Cloudflare Workers

> [!NOTE] `adapter-cloudflare-workers` has been deprecated in favour of [`adapter-cloudflare`](adapter-cloudflare). We recommend using `adapter-cloudflare` to deploy to Cloudflare Workers with [Static Assets](https://developers.cloudflare.com/workers/static-assets/) since Cloudflare Workers Sites will be deprecated in favour of it.

To deploy to [Cloudflare Workers](https://workers.cloudflare.com/) with [Workers Sites](https://developers.cloudflare.com/workers/configuration/sites/), use `adapter-cloudflare-workers`.

## Usage

Install with `npm i -D @sveltejs/adapter-cloudflare-workers`, then add the adapter to your `vite.config.js`:

```js
// @errors: 2307
/// file: vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import adapter from '@sveltejs/adapter-cloudflare-workers';

export default defineConfig({
	plugins: [
		sveltekit({
+++			adapter: adapter({
				// see below for options that can be set here
			})+++
		})
	]
});
```

## Options

### config

Path to your [Wrangler configuration file](https://developers.cloudflare.com/workers/wrangler/configuration/). If you would like to use a Wrangler configuration filename other than `wrangler.jsonc`, `wrangler.json`, or `wrangler.toml` you can specify it using this option.

### platformProxy

Preferences for the emulated `platform.env` local bindings. See the [getPlatformProxy](https://developers.cloudflare.com/workers/wrangler/api/#parameters-1) Wrangler API documentation for a full list of options.

## Basic Configuration

This adapter expects to find a [Wrangler configuration file](https://developers.cloudflare.com/workers/configuration/sites/configuration/) in the project root. It should look something like this:

```jsonc
/// file: wrangler.jsonc
{
	"name": "<your-service-name>",
	"account_id": "<your-account-id>",
	"main": "./.cloudflare/worker.js",
	"site": {
		"bucket": "./.cloudflare/public"
	},
	"build": {
		"command": "npm run build"
	},
	"compatibility_date": "2021-11-12"
}
```

`<your-service-name>` can be anything. `<your-account-id>` can be found by running `wrangler whoami` using the Wrangler CLI tool or by logging into your [Cloudflare dashboard](https://dash.cloudflare.com) and grabbing it from the end of the URL:

```
https://dash.cloudflare.com/<your-account-id>/home
```

> [!NOTE] You should add the `.cloudflare` directory (or whichever directories you specified for `main` and `site.bucket`) and the `.wrangler` directory to your `.gitignore`.

You will need to install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) and log in, if you haven't already:

```sh
npm i -D wrangler
wrangler login
```

Then, you can build your app and deploy it:

```sh
wrangler deploy
```

## Runtime APIs

The [`env`](https://developers.cloudflare.com/workers/runtime-apis/fetch-event#parameters) object contains your project's [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/), which consist of KV/DO namespaces, etc. It is passed to SvelteKit via the `platform` property, along with [`ctx`](https://developers.cloudflare.com/workers/runtime-apis/context/), [`caches`](https://developers.cloudflare.com/workers/runtime-apis/cache/), and [`cf`](https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties), meaning that you can access it in hooks and endpoints:

```js
// @filename: ambient.d.ts
import { DurableObjectNamespace } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Platform {
			env: {
				YOUR_DURABLE_OBJECT_NAMESPACE: DurableObjectNamespace;
			};
		}
	}
}
// @filename: +server.js
// ---cut---
// @errors: 2355 2322
/// file: +server.js
/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform }) {
	const x = platform?.env.YOUR_DURABLE_OBJECT_NAMESPACE.idFromName('x');
}
```

> [!NOTE] SvelteKit's built-in [`$app/env/*` modules](environment-variables) should be preferred for environment variables.

To make these types available to your app, install [`@cloudflare/workers-types`](https://www.npmjs.com/package/@cloudflare/workers-types) and reference them in your `src/app.d.ts`:

```ts
/// file: src/app.d.ts
+++import { KVNamespace, DurableObjectNamespace } from '@cloudflare/workers-types';+++

declare global {
	namespace App {
		interface Platform {
+++			env?: {
				YOUR_KV_NAMESPACE: KVNamespace;
				YOUR_DURABLE_OBJECT_NAMESPACE: DurableObjectNamespace;
			};+++
		}
	}
}

export {};
```

### Testing Locally

Cloudflare Workers specific values in the `platform` property are emulated during dev and preview modes. Local [bindings](https://developers.cloudflare.com/workers/wrangler/configuration/#bindings) are created based on your [Wrangler configuration file](https://developers.cloudflare.com/workers/wrangler/) and are used to populate `platform.env` during development and preview. Use the adapter config [`platformProxy` option](#Options-platformProxy) to change your preferences for the bindings.

For testing the build, you should use [Wrangler](https://developers.cloudflare.com/workers/wrangler/) version 4. Once you have built your site, run `wrangler dev`.

## Troubleshooting

### Node.js compatibility

If you would like to enable [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), you can add the `nodejs_compat` compatibility flag to your Wrangler configuration file:

```jsonc
/// file: wrangler.jsonc
{
	"compatibility_flags": ["nodejs_compat"]
}
```

### Worker size limits

When deploying your application, the server generated by SvelteKit is bundled into a single file. Wrangler will fail to publish your worker if it exceeds [the size limits](https://developers.cloudflare.com/workers/platform/limits/#worker-size) after minification. You're unlikely to hit this limit usually, but some large libraries can cause this to happen. In that case, you can try to reduce the size of your worker by only importing such libraries on the client side. See [the FAQ](./faq#How-do-I-use-a-client-side-library-accessing-document-or-window) for more information.

### Accessing the file system

You can't use `fs` in Cloudflare Workers — you must [prerender](page-options#prerender) the routes in question.

# Netlify

To deploy to Netlify, use [`adapter-netlify`](https://github.com/sveltejs/kit/tree/main/packages/adapter-netlify).

This adapter will be installed by default when you use [`adapter-auto`](adapter-auto), but adding it to your project allows you to specify Netlify-specific options.

## Usage

Run [`npx sv add sveltekit-adapter="adapter:netlify"`](/docs/cli/sveltekit-adapter), or install with `npm i -D @sveltejs/adapter-netlify` and add the adapter to your `vite.config.js`:

```js
// @errors: 2307
/// file: vite.config.js
import adapter from '@sveltejs/adapter-netlify';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				// See below for an explanation of these options
				edge: false,
				split: false,
				publish: 'build'
			})
		})
	]
});
```

## Options

### `edge`

If `true`, your app will be deployed as a [Netlify Edge Function](https://docs.netlify.com/build/edge-functions/overview/) rather than the standard Node-based function.

### `split`

If `true`, your app will be split into multiple functions instead of a single one for the entire app.

### `publish`

The directory to write prerendered pages and static assets (the contents of `static`, plus client-side JS and CSS generated by SvelteKit) to. It defaults to `build`.

## Netlify alternatives to SvelteKit functionality

You may build your app using functionality provided directly by SvelteKit without relying on any Netlify functionality. Using the SvelteKit versions of these features will allow them to be used in dev mode, tested with integration tests, and to work with other adapters should you ever decide to switch away from Netlify. However, in some scenarios you may find it beneficial to use the Netlify versions of these features. One example would be if you're migrating an app that's already hosted on Netlify to SvelteKit.

### `_headers` and `_redirects`

The [`_headers`](https://docs.netlify.com/routing/headers/#syntax-for-the-headers-file) and [`_redirects`](https://docs.netlify.com/routing/redirects/redirect-options/) files specific to Netlify can be used for static asset responses (like images) by putting them into the project root folder. You can also use [`[[redirects]]`](https://docs.netlify.com/routing/redirects/#syntax-for-the-netlify-configuration-file) in your `netlify.toml`.

### Netlify Forms

1. Create your Netlify HTML form as described [here](https://docs.netlify.com/forms/setup/#html-forms), e.g. as `/routes/contact/+page.svelte`. (Don't forget to add the hidden `form-name` input element!)
2. Netlify's build bot parses your HTML files at deploy time, which means your form must be [prerendered](page-options#prerender) as HTML. You can either add `export const prerender = true` to your `contact.svelte` to prerender just that page or set the `prerender.force: true` option to prerender all pages.
3. If your Netlify form has a [custom success message](https://docs.netlify.com/forms/setup/#success-messages) like `<form netlify ... action="/success">` then ensure the corresponding `/routes/success/+page.svelte` exists and is prerendered.

### Netlify Functions

With this adapter, SvelteKit endpoints are hosted as [Netlify Functions](https://docs.netlify.com/functions/overview/). Netlify function handlers have additional context, including [Netlify Identity](https://docs.netlify.com/visitor-access/identity/) information. You can access this context via the `event.platform.context` field inside your hooks and `+page.server` or `+layout.server` endpoints. These are [serverless functions](https://docs.netlify.com/functions/overview/) when the `edge` property is `false` in the adapter config or [edge functions](https://docs.netlify.com/edge-functions/overview/#app) when it is `true`.

```js
// @errors: 2339
// @filename: ambient.d.ts
/// <reference types="@sveltejs/adapter-netlify" />
// @filename: +page.server.js
// ---cut---
/// file: +page.server.js
/** @type {import('./$types').PageServerLoad} */
export const load = async (event) => {
	const context = event.platform?.context;
	console.log(context); // shows up in your functions log in the Netlify app
};
```

Additionally, you can add your own Netlify functions by creating a directory for them and adding the configuration to your `netlify.toml` file. For example:

```toml
[build]
	command = "npm run build"
	publish = "build"

[functions]
	directory = "functions"
```

## Troubleshooting

### Accessing the file system

You can't use `fs` in edge deployments.

You _can_ use it in serverless deployments, but it won't work as expected, since files are not copied from your project into your deployment. Instead, use the [`read`]($app-server#read) function from `$app/server` to access your files. It also works inside edge deployments by fetching the file from the deployed public assets location.

Alternatively, you can [prerender](page-options#prerender) the routes in question.

# Vercel

To deploy to Vercel, use [`adapter-vercel`](https://github.com/sveltejs/kit/tree/main/packages/adapter-vercel).

This adapter will be installed by default when you use [`adapter-auto`](adapter-auto), but adding it to your project allows you to specify Vercel-specific options.

If you'd like to try out SvelteKit on Vercel, you can start from one of the [Vercel SvelteKit templates](https://vercel.com/templates/svelte?search=SvelteKit).

## Usage

Run [`npx sv add sveltekit-adapter="adapter:vercel"`](/docs/cli/sveltekit-adapter), or install with `npm i -D @sveltejs/adapter-vercel` and add the adapter to your `vite.config.js`:

```js
// @errors: 2554
/// file: vite.config.js
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				// see below for options that can be set here
			})
		})
	]
});
```

## Deployment configuration

To control how your routes are deployed to Vercel as functions, you can specify deployment configuration, either through the option shown above or with [`export const config`](page-options#config) inside `+server.js`, `+page(.server).js` and `+layout(.server).js` files.

For example you could deploy one specific route as an individual serverless function, separate from the rest of your app:

```js
/// file: about/+page.js
/** @type {import('@sveltejs/adapter-vercel').Config} */
export const config = {
	split: true
};
```

You can set the following options:

- `runtime`: Node versions (for example `'nodejs22.x'`, `'nodejs24.x'`, `'nodejs26.x'`), `bun1.x` or `bun1.4.x`. By default, the adapter will select the runtime used for the build, which corresponds to the Node version your project is configured to use on the Vercel dashboard unless you [build the app with Bun](https://bun.com/docs/guides/ecosystem/vite)
- `regions`: an array of [edge network regions](https://vercel.com/docs/concepts/edge-network/regions) (defaulting to `["iad1"]`). Note that multiple regions for serverless functions are only supported on Enterprise plans
- `split`: if `true`, causes a route to be deployed as an individual function. If `split` is set to `true` at the adapter level, all routes will be deployed as individual functions
- `memory`: the amount of memory available to the function. Defaults to `1024` Mb, and can be decreased to `128` Mb or [increased](https://vercel.com/docs/concepts/limits/overview#serverless-function-memory) in 64Mb increments up to `3008` Mb on Pro or Enterprise accounts
- `maxDuration`: [maximum execution duration](https://vercel.com/docs/functions/runtimes#max-duration) of the function. Defaults to `10` seconds for Hobby accounts, `15` for Pro and `900` for Enterprise
- `isr`: configuration Incremental Static Regeneration, described below

Configuration set in a layout applies to all the routes beneath that layout, unless overridden at a more granular level.

If your functions need to access data in a specific region, it's recommended that they be deployed in the same region (or close to it) for optimal performance.

## Image Optimization

You may set the `images` config to control how Vercel builds your images. See the [image configuration reference](https://vercel.com/docs/build-output-api/v3/configuration#images) for full details. As an example, you may set:

```js
// @errors: 2554
/// file: vite.config.js
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				images: {
					sizes: [640, 828, 1200, 1920, 3840],
					formats: ['image/avif', 'image/webp'],
					minimumCacheTTL: 300,
					domains: ['example-app.vercel.app'],
				}
			})
		})
	]
});
```

## Incremental Static Regeneration

Vercel supports [Incremental Static Regeneration](https://vercel.com/docs/incremental-static-regeneration) (ISR), which provides the performance and cost advantages of prerendered content with the flexibility of dynamically rendered content.

> [!NOTE] Use ISR only on routes where every visitor should see the same content (much like when you prerender). If there's anything user-specific happening (like session cookies), they should happen on the client via JavaScript only to not leak sensitive information across visits

To add ISR to a route, include the `isr` property in your `config` object:

```js
// @filename: env.d.ts
declare module '$app/env/private' {
	export const BYPASS_TOKEN: string;
}
// @filename: +page.server.js
// ---cut---
import { BYPASS_TOKEN } from '$app/env/private';

/** @type {import('@sveltejs/adapter-vercel').Config} */
export const config = {
	isr: {
		expiration: 60,
		bypassToken: BYPASS_TOKEN,
		allowQuery: ['search']
	}
};
```

> [!NOTE] Using ISR on a route with `export const prerender = true` will have no effect, since the route is prerendered at build time

The `expiration` property is required; all others are optional. The properties are discussed in more detail below.

### expiration

The expiration time (in seconds) before the cached asset will be re-generated by invoking the Serverless Function. Setting the value to `false` means it will never expire. In that case, you likely want to define a bypass token to re-generate on demand.

### bypassToken

A random token that can be used for two things:

- Draft mode, which bypasses the cache so that you can, for example, view live content from your CMS as you edit it. Send the token in a `__prerender_bypass=<token>` cookie to render the route at request time. See [Vercel's Draft Mode documentation](https://vercel.com/docs/draft-mode?framework=sveltekit) for more details.
- Revalidation, which empties the route's ISR cache and repopulates it for future visitors. To do so, send a `GET` or `HEAD` request with a `x-prerender-revalidate: <token>` header.

The `BYPASS_TOKEN` is saved at build time; setting or changing it after the application has been built requires a new deployment.

Note that the `BYPASS_TOKEN` string must be at least 32 characters long. You could generate one using the JavaScript console like so:

```js
crypto.randomUUID();
```

Set this string as an environment variable on Vercel by logging in and going to your project then Settings > Environment Variables. For "Key" put `BYPASS_TOKEN` and for "value" use the string generated above, then hit "Save".

To get this key known about for local development, you can use the [Vercel CLI](https://vercel.com/docs/cli/env) by running the `vercel env pull` command locally like so:

```sh
vercel env pull .env.development.local
```

### allowQuery

A list of valid query parameters that contribute to the cache key. Other parameters (such as utm tracking codes) will be ignored, ensuring that they do not result in content being re-generated unnecessarily. By default, query parameters are ignored.

> [!NOTE] Pages that are [prerendered](page-options#prerender) will ignore ISR configuration.

## Environment variables

Vercel makes a set of [deployment-specific environment variables](https://vercel.com/docs/concepts/projects/environment-variables#system-environment-variables) available. Like other environment variables, these are accessible from `$app/env/private` if explicitly defined in `src/env.ts`. To access one of these variables from the client:

```js
/// file: +layout.server.js
// @filename: env.d.ts
declare module '$app/env/private' {
	export const VERCEL_COMMIT_REF: string;
}
// @filename: +layout.server.js
// ---cut---
import { VERCEL_COMMIT_REF } from '$app/env/private';

/** @type {import('./$types').LayoutServerLoad} */
export function load() {
	return {
		deploymentGitBranch: VERCEL_COMMIT_REF
	};
}
```

```svelte
<!--- file: +layout.svelte --->
<script>
	/** @type {import('./$types').LayoutProps} */
	let { data } = $props();
</script>

<p>This staging environment was deployed from {data.deploymentGitBranch}.</p>
```

Since all of these variables are unchanged between build time and run time when building on Vercel, we recommend configuring the variable with `static: true` — which will statically replace the variables, enabling optimisations like dead code elimination.

## Skew protection

When a new version of your app is deployed, assets belonging to the previous version may no longer be accessible. If a user is actively using your app when this happens, it can cause errors when they navigate — this is known as _version skew_. SvelteKit mitigates this by detecting errors resulting from version skew and causing a hard reload to get the latest version of the app, but this will cause any client-side state to be lost. (You can also proactively mitigate it by observing [`updated.current`]($app-state#updated) from `$app/state`, which tells clients when a new version has been deployed.)

[Skew protection](https://vercel.com/docs/deployments/skew-protection) is a Vercel feature that routes client requests to their original deployment. When a user visits your app, a cookie is set with the deployment ID, and any subsequent requests will be routed to that deployment for as long as skew protection is active. When they reload the page, they will get the newest deployment. (`updated.current` is exempted from this behaviour, and so will continue to report new deployments.) To enable it, visit the Advanced section of your project settings on Vercel.

Cookie-based skew protection comes with one caveat: if a user has multiple versions of your app open in multiple tabs, requests from older versions will be routed to the newer one, meaning they will fall back to SvelteKit's built-in skew protection.

## Notes

### Vercel utilities

If you need Vercel-specific utilities like `waitUntil`, use the package [`@vercel/functions`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package).

### Vercel functions

If you have Vercel functions contained in the `api` directory at the project's root, any requests for `/api/*` will _not_ be handled by SvelteKit. You should implement these as [API routes](routing#server) in your SvelteKit app instead, unless you need to use a non-JavaScript language in which case you will need to ensure that you don't have any `/api/*` routes in your SvelteKit app.

### Node version

Projects created before a certain date may default to using an older Node version than what SvelteKit currently requires. You can [change the Node version in your project settings](https://vercel.com/docs/concepts/functions/serverless-functions/runtimes/node-js#node.js-version).

### More information

You can find more information on how to use SvelteKit on Vercel [in the Vercel documentation](https://vercel.com/docs/frameworks/full-stack/sveltekit).

## Troubleshooting

### Accessing the file system

Using `node:fs` directly in serverless functions most likely won't work as you expect, since files are not copied from your project into your deployment. Instead, use the [`read`]($app-server#read) function from `$app/server` to access your files.

Alternatively, you can [prerender](page-options#prerender) the routes in question.

# Writing adapters

If an adapter for your preferred environment doesn't yet exist, you can build your own. We recommend [looking at the source for an adapter](https://github.com/sveltejs/kit/tree/main/packages) to a platform similar to yours and copying it as a starting point.

Adapter packages implement the following API, which creates an `Adapter`:

```js
// @errors: 2322
// @filename: ambient.d.ts
type AdapterSpecificOptions = any;

// @filename: index.js
// ---cut---
import { getRequest, setResponse } from '@sveltejs/kit/node';

/** @param {AdapterSpecificOptions} options */
export default function (options) {
	/** @type {import('@sveltejs/kit').Adapter} */
	const adapter = {
		name: 'adapter-package-name',
		async adapt(builder) {
			// adapter implementation
		},
		supports: {
			read: ({ config, route }) => {
				// Return `true` if the route with the given `config` can use `read`
				// from `$app/server` in production, return `false` if it can't.
				// Or throw a descriptive error describing how to configure the deployment
			},
			instrumentation: () => {
				// Return `true` if this adapter supports loading `instrumentation.server.js`.
				// Return `false if it can't, or throw a descriptive error.
			}
		},
		vite: {
			// set this to `true` to disable the default Node server during `vite preview`
			customPreview: false,
			getRequest(options) {
				const request = getRequest(options);
				// modify the Request object here if needed
				return request;
			},
			setResponse(res, response) {
				// handle WebSockets here, for example
				setResponse(res, response);
			},
			plugins: {
				// add plugins here to integrate with Vite
				pre: [],
				post: []
			}
		}
	};

	return adapter;
}
```

Of these, `name` and `adapt` are required. `vite` and `supports` are optional.

Within the `adapt` method, there are a number of things that an adapter should do:

- Clear out the build directory
- Write SvelteKit output with `builder.writeClient`, `builder.writeServer`, and `builder.writePrerendered`
- Output code that:
 - Imports a `server` instance generated by `${builder.generateServerInstance()}`
 - Runs `await server.init({ env, read })`
 - Listens for requests from the platform, converts them to a standard [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) if necessary, calls the `server.respond(request, { getClientAddress })` function to generate a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) and responds with it
 - expose any platform-specific information to SvelteKit via the `platform` option passed to `server.respond`
- Bundle the output to avoid needing to install dependencies on the target platform, if necessary
- Put the user's static files and the generated JS/CSS in the correct location for the target platform

Where possible, we recommend putting the adapter output under the `build/` directory with any intermediate output placed under `.svelte-kit/[adapter-name]`.

# Advanced routing

## Rest parameters

If the number of route segments is unknown, you can use rest syntax — for example you might implement GitHub's file viewer like so...

```sh
/[org]/[repo]/tree/[branch]/[...file]
```

...in which case a request for `/sveltejs/kit/tree/main/documentation/docs/04-advanced-routing.md` would result in the following parameters being available to the page:

```js
// @noErrors
{
	org: 'sveltejs',
	repo: 'kit',
	branch: 'main',
	file: 'documentation/docs/04-advanced-routing.md'
}
```

> [!NOTE] `src/routes/a/[...rest]/z/+page.svelte` will match `/a/z` (i.e. there's no parameter at all) as well as `/a/b/z` and `/a/b/c/z` and so on. Make sure you check that the value of the rest parameter is valid, for example using a [matcher](#Matching).

### 404 pages

Rest parameters also allow you to render custom 404s. Given these routes...

```tree
src/routes/
├ marx-brothers/
│ ├ chico/
│ ├ harpo/
│ ├ groucho/
│ └ +error.svelte
└ +error.svelte
```

...the `marx-brothers/+error.svelte` file will _not_ be rendered if you visit `/marx-brothers/karl`, because no route was matched. If you want to render the nested error page, you should create a route that matches any `/marx-brothers/*` request, and return a 404 from it:

```tree
src/routes/
├ marx-brothers/
+++| ├ [...path]/+++
│ ├ chico/
│ ├ harpo/
│ ├ groucho/
│ └ +error.svelte
└ +error.svelte
```

```js
/// file: src/routes/marx-brothers/[...path]/+page.js
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export function load(event) {
	error(404, 'Not Found');
}
```

> [!NOTE] If you don't handle 404 cases, they will appear in [`handleError`](hooks#handleError) as [framework errors](errors#Framework-errors), with `kind: 'framework'`. Otherwise, they will appear with `kind: 'app'`.

## Optional parameters

A route like `[lang]/home` contains a parameter named `lang` which is required. Sometimes it's beneficial to make these parameters optional, so that in this example both `home` and `en/home` point to the same page. You can do that by wrapping the parameter in another bracket pair: `[[lang]]/home`

Note that an optional route parameter cannot follow a rest parameter (`[...rest]/[[optional]]`), since parameters are matched 'greedily' and the optional parameter would always be unused.

## Matching

A route like `src/routes/fruits/[page]` would match `/fruits/apple`, but it would also match `/fruits/rocketship`. We don't want that. You can ensure that route parameters are well-formed by adding a _matcher_ to your `src/params.js` file (or `src/params.ts`)...

```js
/// file: src/params.js
import { defineParams } from '@sveltejs/kit/params';

export const params = defineParams({
	fruit: (param) => {
		if (param !== 'apple' && param !== 'orange') return;
		return param;
	}
});
```

...and augmenting your routes:

```
src/routes/fruits/[page+++=fruit+++]
```

If the pathname doesn't match, SvelteKit will try to match other routes (using the sort order specified below), before eventually returning a 404. If it does match, the returned value is passed as the param value.

You can also use a [Standard Schema](https://standardschema.dev) — for example with [Valibot](https://valibot.dev):

```js
/// file: src/params.js
import { defineParams } from '@sveltejs/kit/params';
import * as v from 'valibot';

export const params = defineParams({
	number: v.pipe(v.string(), v.toNumber())
});
```

If validation fails, the route does not match. If it succeeds, the param is typed with the output type of the schema, which must extend `string`, `boolean`, `number` (as in the example above) or `bigint`:

```js
/// file: src/routes/items/[id=number]/+page.js
/** @type {import('./$types').PageLoad} */
export function load({ params }) {
	console.log(typeof params.id); // 'number'
}
```

Transformations should be _symmetrical_ — if converting to a number, then calling `toString()` on that number should return the original string. This allows the [`resolve`]($app-paths#resolve) function to construct a pathname correctly:

```js
import { resolve } from '$app/paths';

resolve('/blog/[id=number]', { id: 1 });
```

> [!NOTE] Matchers run both on the server and in the browser.

> [!NOTE] Prior to SvelteKit 3, you had to define each param matcher in a separate file, all listed under a `params` folder (for example `src/params/foo.js` with `export const match = (param) => param === 'foo';`), and matching was determined by whether or not the matcher returns a truthy value (which means no value transformation took place).

## Sorting

It's possible for multiple routes to match a given path. For example each of these routes would match `/foo-abc`:

```sh
src/routes/[...catchall]/+page.svelte
src/routes/[[a=x]]/+page.svelte
src/routes/[b]/+page.svelte
src/routes/foo-[c]/+page.svelte
src/routes/foo-abc/+page.svelte
```

SvelteKit needs to know which route is being requested. To do so, it sorts them according to the following rules...

- More specific routes are higher priority (e.g. a route with no parameters is more specific than a route with one dynamic parameter, and so on)
- Parameters with [matchers](#Matching) (`[name=type]`) are higher priority than those without (`[name]`)
- `[[optional]]` and `[...rest]` parameters are ignored unless they are the final part of the route, in which case they are treated with lowest priority. In other words `x/[[y]]/z` is treated equivalently to `x/z` for the purposes of sorting
- Ties are resolved alphabetically

...resulting in this ordering, meaning that `/foo-abc` will invoke `src/routes/foo-abc/+page.svelte`, and `/foo-def` will invoke `src/routes/foo-[c]/+page.svelte` rather than less specific routes:

```sh
src/routes/foo-abc/+page.svelte
src/routes/foo-[c]/+page.svelte
src/routes/[[a=x]]/+page.svelte
src/routes/[b]/+page.svelte
src/routes/[...catchall]/+page.svelte
```

## Encoding

Some characters can't be used on the filesystem — `/` on Linux and Mac, `\ / : * ? " < > |` on Windows. The `#` and `%` characters have special meaning in URLs, and the `[ ] ( )` characters have special meaning to SvelteKit, so these also can't be used directly as part of your route.

To use these characters in your routes, you can use hexadecimal escape sequences, which have the format `[x+nn]` where `nn` is a hexadecimal character code:

- `\` — `[x+5c]`
- `/` — `[x+2f]`
- `:` — `[x+3a]`
- `*` — `[x+2a]`
- `?` — `[x+3f]`
- `"` — `[x+22]`
- `<` — `[x+3c]`
- `>` — `[x+3e]`
- `|` — `[x+7c]`
- `#` — `[x+23]`
- `%` — `[x+25]`
- `[` — `[x+5b]`
- `]` — `[x+5d]`
- `(` — `[x+28]`
- `)` — `[x+29]`

For example, to create a `/smileys/:-)` route, you would create a `src/routes/smileys/[x+3a]-[x+29]/+page.svelte` file.

You can determine the hexadecimal code for a character with JavaScript:

```js
':'.charCodeAt(0).toString(16); // '3a', hence '[x+3a]'
```

You can also use Unicode escape sequences. Generally you won't need to as you can use the unencoded character directly, but if — for some reason — you can't have a filename with an emoji in it, for example, then you can use the escaped characters. In other words, these are equivalent:

```
src/routes/[u+d83e][u+dd2a]/+page.svelte
src/routes/🤪/+page.svelte
```

The format for a Unicode escape sequence is `[u+nnnn]` where `nnnn` is a valid value between `0000` and `10ffff`. (Unlike JavaScript string escaping, there's no need to use surrogate pairs to represent code points above `ffff`.) To learn more about Unicode encodings, consult [Programming with Unicode](https://unicodebook.readthedocs.io/unicode_encodings.html).

> [!NOTE] Since TypeScript [struggles](https://github.com/microsoft/TypeScript/issues/13399) with directories with a leading `.` character, you may find it useful to encode these characters when creating e.g. [`.well-known`](https://en.wikipedia.org/wiki/Well-known_URI) routes: `src/routes/[x+2e]well-known/...`

## Advanced layouts

By default, the _layout hierarchy_ mirrors the _route hierarchy_. In some cases, that might not be what you want.

### (group)

Perhaps you have some routes that are 'app' routes that should have one layout (e.g. `/dashboard` or `/item`), and others that are 'marketing' routes that should have a different layout (`/about` or `/testimonials`). We can group these routes with a directory whose name is wrapped in parentheses — unlike normal directories, `(app)` and `(marketing)` do not affect the URL pathname of the routes inside them:

```tree
src/routes/
+++│ (app)/+++
│ ├ dashboard/
│ ├ item/
│ └ +layout.svelte
+++│ (marketing)/+++
│ ├ about/
│ ├ testimonials/
│ └ +layout.svelte
├ admin/
└ +layout.svelte
```

You can also put a `+page` directly inside a `(group)`, for example if `/` should be an `(app)` or a `(marketing)` page.

### Breaking out of layouts

The root layout applies to every page of your app — if omitted, it defaults to `{@render children()}`. If you want some pages to have a different layout hierarchy than the rest, then you can put your entire app inside one or more groups _except_ the routes that should not inherit the common layouts.

In the example above, the `/admin` route does not inherit either the `(app)` or `(marketing)` layouts.

### +page@

Pages can break out of the current layout hierarchy on a route-by-route basis. Suppose we have an `/item/[id]/embed` route inside the `(app)` group from the previous example:

```tree
src/routes/
├ (app)/
│ ├ item/
│ │ ├ [id]/
│ │ │ ├ embed/
+++│ │ │ │ └ +page.svelte+++
│ │ │ └ +layout.svelte
│ │ └ +layout.svelte
│ └ +layout.svelte
└ +layout.svelte
```

Ordinarily, this would inherit the root layout, the `(app)` layout, the `item` layout and the `[id]` layout. We can reset to one of those layouts by appending `@` followed by the segment name — or, for the root layout, the empty string. In this example, we can choose from the following options:

- `+page@[id].svelte` - inherits from `src/routes/(app)/item/[id]/+layout.svelte`
- `+page@item.svelte` - inherits from `src/routes/(app)/item/+layout.svelte`
- `+page@(app).svelte` - inherits from `src/routes/(app)/+layout.svelte`
- `+page@.svelte` - inherits from `src/routes/+layout.svelte`

```tree
src/routes/
├ (app)/
│ ├ item/
│ │ ├ [id]/
│ │ │ ├ embed/
+++│ │ │ │ └ +page@(app).svelte+++
│ │ │ └ +layout.svelte
│ │ └ +layout.svelte
│ └ +layout.svelte
└ +layout.svelte
```

### +layout@

Like pages, layouts can _themselves_ break out of their parent layout hierarchy, using the same technique. For example, a `+layout@.svelte` component would reset the hierarchy for all its child routes.

```
src/routes/
├ (app)/
│ ├ item/
│ │ ├ [id]/
│ │ │ ├ embed/
│ │ │ │ └ +page.svelte  // uses (app)/item/[id]/+layout.svelte
│ │ │ ├ +layout.svelte  // inherits from (app)/item/+layout@.svelte
│ │ │ └ +page.svelte    // uses (app)/item/+layout@.svelte
│ │ └ +layout@.svelte   // inherits from root layout, skipping (app)/+layout.svelte
│ └ +layout.svelte
└ +layout.svelte
```

### When to use layout groups

Not all use cases are suited for layout grouping, nor should you feel compelled to use them. It might be that your use case would result in complex `(group)` nesting, or that you don't want to introduce a `(group)` for a single outlier. It's perfectly fine to use other means such as composition (reusable `load` functions or Svelte components) or if-statements to achieve what you want. The following example shows a layout that rewinds to the root layout and reuses components and functions that other layouts can also use:

```svelte
<!--- file: src/routes/nested/route/+layout@.svelte --->
<script>
	import ReusableLayout from '#lib/ReusableLayout.svelte';
	let { data, children } = $props();
</script>

<ReusableLayout {data}>
	{@render children()}
</ReusableLayout>
```

```js
/// file: src/routes/nested/route/+layout.js
// @filename: ambient.d.ts
declare module "#lib/reusable-load-function.js" {
	export function reusableLoad(event: import('@sveltejs/kit').LoadEvent): Promise<Record<string, any>>;
}
// @filename: index.js
// ---cut---
import { reusableLoad } from '#lib/reusable-load-function.js';

/** @type {import('./$types').PageLoad} */
export function load(event) {
	// Add additional logic here, if needed
	return reusableLoad(event);
}
```

## Further reading

- [Tutorial: Advanced Routing](/tutorial/kit/optional-params)

# Hooks

'Hooks' are app-wide functions you declare that SvelteKit will call in response to specific events, giving you fine-grained control over the framework's behaviour.

There are three hooks files, all optional:

- `src/hooks.server.js` — your app's server hooks
- `src/hooks.client.js` — your app's client hooks
- `src/hooks.js` — your app's hooks that run on both the client and server

Code in these modules will run when the application starts up, making them useful for initializing database clients and so on.

## handle

> [!NOTE] Can be added to `src/hooks.server.js`

This function runs every time the SvelteKit server receives a [request](web-standards#Fetch-APIs-Request) — whether that happens while the app is running, or during [prerendering](page-options#prerender) — and determines the [response](web-standards#Fetch-APIs-Response). It receives an `event` object representing the request and a function called `resolve`, which renders the route and generates a `Response`. This allows you to modify response headers or bodies, or implement a middleware (for rejecting rate-limited requests, for example).

```js
/// file: src/hooks.server.js
// @filename: ambient.d.ts
declare module '#lib/server/rate-limit.js' {
	export function isRateLimited(key: string): Promise<boolean>;
}

// @filename: index.js
// ---cut---
import { building } from '$app/env';
import { isRateLimited } from '#lib/server/rate-limit.js';

/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle({ event, resolve }) {
	if (!building && (await isRateLimited(event.getClientAddress()))) {
		return new Response('Too many requests', { status: 429 });
	}

	const response = await resolve(event);
	return response;
}
```

> [!NOTE] Requests for static assets — which includes pages that were already prerendered — are _not_ handled by SvelteKit.

If the `handle` hook runs as part of a remote function request initiated by the client, `route`, `params` and `url` relate to the page the remote function was called from, _not_ the URL of the endpoint SvelteKit creates for the remote function. Never use them to determine whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated. Queries are also not re-run when the user navigates (unless the argument to the query changes as a result of navigation), and so you should be mindful of how you use these values.

If unimplemented, defaults to `({ event, resolve }) => resolve(event)`.

During prerendering, SvelteKit crawls your pages for links and renders each route it finds. Rendering the route invokes the `handle` function (and all other route dependencies, like `load`). If you need to exclude some code from running during this phase, check that the app is not [`building`]($app-env#building) beforehand.

You can define multiple `handle` functions and execute them with the [`sequence`](@sveltejs-kit-hooks) helper function.

`resolve` also supports a second, optional parameter that gives you more control over how the response will be rendered. That parameter is an object that can have the following fields:

- `transformPageChunk(opts: { html: string, done: boolean }): MaybePromise<string | undefined>` — applies custom transforms to HTML. If `done` is true, it's the final chunk. Chunks are not guaranteed to be well-formed HTML (they could include an element's opening tag but not its closing tag, for example) but they will always be split at sensible boundaries such as `%sveltekit.head%` or layout/page components.
- `filterSerializedResponseHeaders(name: string, value: string): boolean` — determines which headers should be included in serialized responses when a `load` function loads a resource with `fetch`. By default, none will be included.
- `preload(input: { type: 'js' | 'css' | 'asset', path: string } | { type: 'font', path: string, filename: string }): boolean` — determines which files should be preloaded. Files are preloaded via `<link>` tags added to the `<head>` tag; if [`output.linkHeaderPreload`](@sveltejs-kit-vite#output) is enabled, dynamically rendered pages use the [`Link` response header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Link) instead. The method is called with each file that was found at build time while constructing the code chunks — so if you for example have `import './styles.css` in your `+page.svelte`, `preload` will be called with the resolved path to that CSS file when visiting that page. Note that in dev mode `preload` is _not_ called, since it depends on analysis that happens at build time. Preloading can improve performance by downloading assets sooner, but it can also hurt if too much is downloaded unnecessarily. By default, `js` and `css` files will be preloaded. `asset` files are not preloaded at all currently, but we may add this later after evaluating feedback. For `font` files, `input` also has a `filename` property, the source file's pathname relative to the project root, so that a filter can match on it instead of the hashed path.

```js
/// file: src/hooks.server.js
/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle({ event, resolve }) {
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('old', 'new'),
		filterSerializedResponseHeaders: (name) => name.startsWith('x-'),
		preload: ({ type, path }) => type === 'js' || path.includes('/important/')
	});

	return response;
}
```

Note that `resolve(...)` will never throw an error, it will always return a `Promise<Response>` with the appropriate status code. If an error is thrown elsewhere during `handle`, it is treated as fatal, and SvelteKit will respond with a JSON representation of the error or a fallback error page — which can be customised via `src/error.html` — depending on the `Accept` header. You can read more about error handling [here](errors).

### locals

To add custom data to the request, which is passed to handlers in `+server.js` and server `load` functions, populate the `event.locals` object, as shown below.

```js
/// file: src/hooks.server.js
// @filename: ambient.d.ts
type User = {
	name: string;
}

declare namespace App {
	interface Locals {
		user: User;
	}
}

const getUserInformation: (cookie: string | void) => Promise<User>;

// @filename: index.js
// ---cut---
/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle({ event, resolve }) {
	event.locals.user = await getUserInformation(event.cookies.get('sessionid'));

	const response = await resolve(event);

	// Note that modifying response headers isn't always safe.
	// Response objects can have immutable headers
	// (e.g. Response.redirect() returned from an endpoint).
	// Modifying immutable headers throws a TypeError.
	// In that case, clone the response or avoid creating a
	// response object with immutable headers.
	response.headers.set('x-custom-header', 'potato');

	return response;
}
```

## handleFetch

> [!NOTE] Can be added to `src/hooks.server.js`

This function allows you to modify (or replace) the result of an [`event.fetch`](load#Making-fetch-requests) call that runs on the server (or during prerendering) inside an endpoint, `load`, `action`, `handle`, `handleError` or `reroute`.

For example, your `load` function might make a request to a public URL like `https://api.yourapp.com` when the user performs a client-side navigation to the respective page, but during SSR it might make sense to hit the API directly (bypassing whatever proxies and load balancers sit between it and the public internet).

```js
/// file: src/hooks.server.js
/** @type {import('@sveltejs/kit/hooks').HandleFetch} */
export async function handleFetch({ request, fetch }) {
	if (request.url.startsWith('https://api.yourapp.com/')) {
		// clone the original request, but change the URL
		request = new Request(
			request.url.replace('https://api.yourapp.com/', 'http://localhost:9999/'),
			request
		);
	}

	return fetch(request);
}
```

Requests made with `event.fetch` follow the browser's credentials model — for same-origin requests, `cookie` and `authorization` headers are forwarded unless the `credentials` option is set to `"omit"`. For cross-origin requests, `cookie` will be included if the request URL belongs to a subdomain of the app — for example if your app is on `my-domain.com`, and your API is on `api.my-domain.com`, cookies will be included in the request.

There is one caveat: if your app and your API are on sibling subdomains — `www.my-domain.com` and `api.my-domain.com` for example — then a cookie belonging to a common parent domain like `my-domain.com` will _not_ be included, because SvelteKit has no way to know which domain the cookie belongs to. In these cases you will need to manually include the cookie using `handleFetch`:

```js
/// file: src/hooks.server.js
// @errors: 2345
/** @type {import('@sveltejs/kit/hooks').HandleFetch} */
export async function handleFetch({ event, request, fetch }) {
	if (request.url.startsWith('https://api.my-domain.com/')) {
		request.headers.set('cookie', event.request.headers.get('cookie'));
	}

	return fetch(request);
}
```



## handleError

> [!NOTE] Can be added to `src/hooks.server.js` and `src/hooks.client.js`

This function is called for every error thrown while loading, rendering, or responding to a request. This allows for two things:

- you can log the error
- you can generate a custom representation of the error that is safe to show to users, omitting sensitive details like messages and stack traces

Alongside the `event`, the hook receives a `kind` discriminant that tells you where the error came from, and the `error` itself:

- `'app'` — the error came from your app via [`error(...)`](@sveltejs-kit#error)
 - `error` is the error body, which matches [`App.Error`](types#Error)
 - defaults to the error body itself
- `'framework'` — the error came from SvelteKit, such as a 404, 405 or 413
 - `error` is `{ status, message }`, where `message` is safe text like `Not Found`
 - defaults to that same `{ status, message }`
- `'validation'` (server only) — the error came from validating a remote function argument against its [Standard Schema](https://standardschema.dev/)
 - `error` is `{ status: 400, message: 'Bad Request' }`, and `issues` contains the validation issues
 - defaults to the `error` object; the issues are not exposed unless you explicitly return them
 - to access validation-library-specific issue properties, parameterise `HandleServerError` with the issue type, for example `HandleServerError<CustomIssue>`
- `'unknown'` — we don't know what went wrong; the error was thrown by your code, or code it calls
 - `error` is the thrown value, which may contain information unsafe to expose
 - defaults to `{ status: 500, message: 'Internal Error' }`

The next section, [Errors](errors), explains the other categories in more detail. Redirects are not errors, and never reach the hook.

The hook returns an object matching [`App.Error`](types#Error), in which `status` and `message` are optional — return them only to override the defaults in the list above.

> [!NOTE] If you augment `App.Error` with additional _required_ properties, the hook must return them.

To add more information to the `page.error` object in a type-safe way, augment the existing `App.Error` interface with your additional properties. The built-in `status` and `message` properties are already present and do not need to be redeclared. For example, you can add a tracking ID for users to quote when contacting support:

```ts
/// file: src/app.d.ts
declare global {
	namespace App {
		interface Error {
			errorId: string;
		}
	}
}

export {};
```

```js
/// file: src/hooks.server.js
// @errors: 2322 2353
// @filename: ambient.d.ts
declare module '@sentry/sveltekit' {
	export const init: (opts: any) => void;
	export const captureException: (error: any, opts: any) => void;
}

// @filename: index.js
// ---cut---
import * as Sentry from '@sentry/sveltekit';

Sentry.init({/*...*/})

/** @type {import('@sveltejs/kit/hooks').HandleServerError} */
export async function handleError({ kind, error, event }) {
	if (kind === 'app') {
		// you created this error with `error(...)`, so it already
		// matches `App.Error` — pass it through unchanged
		return error;
	}

	const errorId = crypto.randomUUID();

	if (kind === 'framework') {
		// a 404 (or similar) — `error.status` and `error.message` are safe to
		// expose, so we keep them and just add our own property
		return { ...error, errorId };
	}

	// example integration with https://sentry.io/
	Sentry.captureException(error, {
		extra: { event, errorId }
	});

	// `status` and `message` are optional — we only override `message`,
	// so the status stays at its default of 500
	return {
		message: 'Whoops!',
		errorId
	};
}
```

```js
/// file: src/hooks.client.js
// @errors: 2322 2353
// @filename: ambient.d.ts
declare module '@sentry/sveltekit' {
	export const init: (opts: any) => void;
	export const captureException: (error: any, opts: any) => void;
}

// @filename: index.js
// ---cut---
import * as Sentry from '@sentry/sveltekit';

Sentry.init({/*...*/})

/** @type {import('@sveltejs/kit/hooks').HandleClientError} */
export async function handleError({ kind, error, event }) {
	if (kind === 'app') {
		return error;
	}

	const errorId = crypto.randomUUID();

	if (kind === 'framework') {
		return { ...error, errorId };
	}

	// example integration with https://sentry.io/
	Sentry.captureException(error, {
		extra: { event, errorId }
	});

	return {
		message: 'Whoops!',
		errorId
	};
}
```

> [!NOTE] In `src/hooks.client.js`, the type of `handleError` is `HandleClientError` instead of `HandleServerError`, and `event` is a `NavigationEvent` rather than a `RequestEvent`.

Errors that were already transformed by the server-side hook are not passed to the client-side hook a second time.

During development, if an error occurs because of a syntax error in your Svelte code, the passed in error has a `frame` property appended highlighting the location of the error.

> [!NOTE] Make sure that `handleError` _never_ throws an error

## init

> [!NOTE] Can be added to `src/hooks.server.js` and `src/hooks.client.js`

This function runs once, when the server is created or the app starts in the browser, and is a useful place to do asynchronous work such as initializing a database connection.

> [!NOTE] If your environment supports top-level await, the `init` function is really no different from writing your initialisation logic at the top level of the module, but some environments — most notably, Safari — don't.

```js
// @errors: 2307
/// file: src/hooks.server.js
import * as db from '#lib/server/database.js';

/** @type {import('@sveltejs/kit/hooks').ServerInit} */
export async function init() {
	await db.connect();
}
```

> [!NOTE]
> In the browser, asynchronous work in `init` will delay hydration, so be mindful of what you put in there.

## reroute

> [!NOTE] Can be added to `src/hooks.js`; it runs on both server and client

This function runs before `handle` and allows you to change how URLs are translated into routes. The returned pathname (which defaults to `url.pathname`) is used to select the route and its parameters.

For example, you might have a `src/routes/[[lang]]/about/+page.svelte` page, which should be accessible as `/en/about` or `/de/ueber-uns` or `/fr/a-propos`. You could implement this with `reroute`:

```js
// @errors: 2345 2304
/// file: src/hooks.js

/** @type {Record<string, string>} */
const translated = {
	'/en/about': '/en/about',
	'/de/ueber-uns': '/de/about',
	'/fr/a-propos': '/fr/about',
};

/** @type {import('@sveltejs/kit/hooks').Reroute} */
export function reroute({ url }) {
	if (url.pathname in translated) {
		return translated[url.pathname];
	}
}
```

The `lang` parameter will be correctly derived from the returned pathname.

Using `reroute` will _not_ change the contents of the browser's address bar, or the value of `event.url`.

Since version 2.18, the `reroute` hook can be asynchronous, allowing it to (for example) fetch data from your backend to decide where to reroute to. Use this carefully and make sure it's fast, as it will delay navigation otherwise. If you need to fetch data, use the `fetch` provided as an argument. It has the [same benefits](load#Making-fetch-requests) as the `fetch` provided to `load` functions, with the caveat that `params` and `id` are unavailable to [`handleFetch`](#handleFetch) because the route is not yet known.

```js
// @errors: 2345 2304
/// file: src/hooks.js

/** @type {import('@sveltejs/kit/hooks').Reroute} */
export async function reroute({ url, fetch }) {
	// Ask a special endpoint within your app about the destination
	if (url.pathname === '/api/reroute') return;

	const api = new URL('/api/reroute', url);
	api.searchParams.set('pathname', url.pathname);

	const result = await fetch(api).then(r => r.json());
	return result.pathname;
}
```


> [!NOTE] `reroute` is considered a pure, idempotent function. As such, it must always return the same output for the same input and not have side effects. Under these assumptions, SvelteKit caches the result of `reroute` on the client so it is only called once per unique URL.

## transport

> [!NOTE] Can be added to `src/hooks.js`; it runs on both server and client

This is a collection of _transporters_, which allow you to pass custom types — returned from `load` and form actions — across the server/client boundary. Each transporter contains an `encode` function, which encodes values on the server (or returns a falsy value for anything that isn't an instance of the type) and a corresponding `decode` function:

```js
// @errors: 2307
/// file: src/hooks.js
import { Vector } from '#lib/math.js';

/** @type {import('@sveltejs/kit/hooks').Transport} */
export const transport = {
	Vector: {
		encode: (value) => value instanceof Vector && [value.x, value.y],
		decode: ([x, y]) => new Vector(x, y)
	}
};
```


## Further reading

- [Tutorial: Hooks](/tutorial/kit/handle)

# Errors

Errors are an inevitable fact of software development. SvelteKit handles errors differently depending on where they occur, what kind of errors they are, and the nature of the incoming request.

## Error objects

Every error passes through the [`handleError`](hooks#handleError) hook — which can log it and customise it — before it is rendered. The hook's `kind` property identifies where the error came from: your app (`'app'`), SvelteKit (`'framework'`), validation of a [remote function](remote-functions) argument (`'validation'`) or an unknown source (`'unknown'`). By default, all are represented as simple `{ status: number, message: string }` objects.

You can add additional properties, like a `code` or a tracking `id`, as shown in the examples below. (When using TypeScript this requires you to redefine the `Error` type as described in [Type safety](errors#Type-safety) below).

## App errors

An app error is one thrown from your app code using the [`error`](@sveltejs-kit#error) function imported from `@sveltejs/kit`:

```js
/// file: src/routes/blog/[slug]/+page.server.js
// @filename: ambient.d.ts
declare module '#lib/server/database.js' {
	export function getPost(slug: string): Promise<{ title: string, content: string } | undefined>
}

// @filename: index.js
// ---cut---
import { error } from '@sveltejs/kit';
import * as db from '#lib/server/database.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const post = await db.getPost(params.slug);

	if (!post) {
		error(404, 'Not found');
	}

	return { post };
}
```

This throws an exception that SvelteKit catches, causing it to set the response status code to 404 and render an [`+error.svelte`](routing#error) component, where the `error` is an `App.Error` object with the provided `status` and `message`.

On its way there, the error passes through the [`handleError`](hooks#handleError) hook with `kind: 'app'`. Since the shape of the error is determined by your app, it is considered safe to expose, and the hook can pass it through unchanged.

```svelte
<!--- file: src/routes/+error.svelte --->
<script>
	let { error } = $props();
</script>

<h1>{error.message}</h1>
```

You can add extra properties to the error object if needed:

```js
// @filename: ambient.d.ts
declare global {
	namespace App {
		interface Error {
			message: string;
			code: string;
		}
	}
}
export {}

// @filename: index.js
import { error } from '@sveltejs/kit';
// ---cut---
error(404, 'Not found', {
	+++code: 'NOT_FOUND'+++
});
```

> [!NOTE] [In SvelteKit 1.x](migrating-to-sveltekit-2#redirect-and-error-are-no-longer-thrown-by-you) you had to `throw` the `error` yourself

## Framework errors

Some errors are generated by SvelteKit itself rather than by your code — a request that doesn't match any route (404), a `POST` request to a page without actions (405), a request body that exceeds the size limit (413), and so on.

These also go through `handleError`, with `kind: 'framework'`. The `error` you receive is a `{ status, message }` object whose `message` is a terse but safe description of what went wrong, such as `'Not Found'`, so it can be exposed to users as-is.

If you log errors inside `handleError`, remember that framework errors such as 404s are routine — you will generally want to avoid logging them.

## Validation errors

Validation errors occur when a [remote function](remote-functions) is called with invalid data. When these are passed to `handleError`, they are accompanied by an array of `issues`. See [Handling validation errors](remote-functions#Handling-validation-errors) for more details.

## Unknown errors

An _unknown_ error is any other exception that occurs while handling a request. Since these can contain sensitive information, unknown error messages and stack traces are not exposed to users.

By default, unknown errors are printed to the console (or, in production, your server logs), while the error that is exposed to the user has a generic shape:

```json
{ "status": 500, "message": "Internal Error" }
```

Unknown errors go through the [`handleError`](hooks#handleError) hook with `kind: 'unknown'`, because SvelteKit does not know what went wrong. There you can add your own error handling, for example sending errors to a reporting service, or returning a custom error object which becomes the `error` prop passed to `+error.svelte`. The value you receive is the raw thrown value, and nothing about it is exposed unless you choose to expose it.

Anything you return overrides the defaults, so you can — for example — use the type of the thrown error to determine the HTTP status code used in the response:

```js
/// file: src/hooks.server.js
// Assuming you have this ...
class NotFound extends Error {}

/** @type {import('@sveltejs/kit/hooks').HandleServerError} */
export function handleError({ kind, error, event }) {
	if (kind === 'unknown') {
		// ... you can do this
		if (error instanceof NotFound) {
			return {
				status: 404,
				message: 'Not found'
			};
		}

		return { message: 'Something went wrong' };
	}

	// app and framework errors are already safe to expose
	return error;
}
```



## Error boundaries

Errors that occur during `load` or rendering (for example inside a component's `<script>` block or template) bubble up to the nearest `+error.svelte` component. To handle errors at a more granular level, you can use a [`<svelte:boundary>`](../svelte/svelte-boundary):

```svelte
<svelte:boundary>
	...
	{#snippet failed(error: App.Error)}
		<!-- error went through the `handleError` hook and is of type `App.Error` -->
		{error.message}
	{/snippet}
</svelte:boundary>
```

## Responses

If an error occurs inside `handle` or inside a [`+server.js`](routing#server) request handler, SvelteKit will respond with either a fallback error page or a JSON representation of the error object, depending on the request's `Accept` headers.

You can customise the fallback error page by adding a `src/error.html` file:

```html
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>%sveltekit.error.message%</title>
	</head>
	<body>
		<h1>My custom error page</h1>
		<p>Status: %sveltekit.status%</p>
		<p>Message: %sveltekit.error.message%</p>
	</body>
</html>
```

SvelteKit will replace `%sveltekit.status%` and `%sveltekit.error.message%` with their corresponding values.

If the error instead occurs inside a `load` function while rendering a page, SvelteKit will render the [`+error.svelte`](routing#error) component nearest to where the error occurred. If the error occurs inside a `load` function in `+layout(.server).js`, the closest error boundary in the tree is an `+error.svelte` file _above_ that layout (not next to it).

The exception is when the error occurs inside the root `+layout.js` or `+layout.server.js`, since the root layout would ordinarily _contain_ the `+error.svelte` component. In this case, SvelteKit uses the fallback error page.

## Type safety

If you're using TypeScript and need to customize the shape of errors, you can do so by declaring an `App.Error` interface in your app (by convention, in `src/app.d.ts`, though it can live anywhere that TypeScript can 'see'):

```ts
/// file: src/app.d.ts
declare global {
	namespace App {
		interface Error {
+++			code: string;
			id: string;+++
		}
	}
}

export {};
```

This interface always includes `status: number` and `message: string` properties.

## Further reading

- [Tutorial: Errors and redirects](/tutorial/kit/error-basics)
- [Tutorial: Hooks](/tutorial/kit/handle)

# Link options

In SvelteKit, `<a>` elements (rather than framework-specific `<Link>` components) are used to navigate between the routes of your app. If the user clicks on a link whose `href` is 'owned' by the app (as opposed to, say, a link to an external site) then SvelteKit will navigate to the new page by importing its code and then calling any `load` functions it needs to fetch data.

You can customise the behaviour of links with `data-sveltekit-*` attributes. These can be applied to the `<a>` itself, or to a parent element.

These options also apply to `<form>` elements with [`method="GET"`](form-actions#GET-vs-POST).

## data-sveltekit-preload-data

Before the browser registers that the user has clicked on a link, we can detect that they've hovered the mouse over it (on desktop) or that a `touchstart` or `mousedown` event was triggered. In both cases, we can make an educated guess that a `click` event is coming.

SvelteKit can use this information to get a head start on importing the code and fetching the page's data, which can give us an extra couple of hundred milliseconds — the difference between a user interface that feels laggy and one that feels snappy.

We can control this behaviour with the `data-sveltekit-preload-data` attribute, which can have one of two values:

- `"hover"` means that preloading will start if the mouse comes to a rest over a link. On mobile, preloading begins on `touchstart`
- `"tap"` means that preloading will start as soon as a `touchstart` or `mousedown` event is registered

The default project template has a `data-sveltekit-preload-data="hover"` attribute applied to the `<body>` element in `src/app.html`, meaning that every link is preloaded on hover by default:

```html
<body data-sveltekit-preload-data="hover">
	<div style="display: contents">%sveltekit.body%</div>
</body>
```

Sometimes, calling `load` when the user hovers over a link might be undesirable, either because it's likely to result in false positives (a click needn't follow a hover) or because data is updating very quickly and a delay could mean staleness.

In these cases, you can specify the `"tap"` value, which causes SvelteKit to call `load` only when the user taps or clicks on a link:

```html
<a data-sveltekit-preload-data="tap" href="/stonks">
	Get current stonk values
</a>
```

> [!NOTE] You can also programmatically invoke `preloadData` from `$app/navigation`.

Data will never be preloaded if the user has chosen reduced data usage, meaning [`navigator.connection.saveData`](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData) is `true`.

## data-sveltekit-preload-code

Even in cases where you don't want to preload _data_ for a link, it can be beneficial to preload the _code_. The `data-sveltekit-preload-code` attribute works similarly to `data-sveltekit-preload-data`, except that it can take one of four values, in decreasing 'eagerness':

- `"eager"` means that links will be preloaded straight away
- `"viewport"` means that links will be preloaded once they enter the viewport
- `"hover"` - as above, except that only code is preloaded
- `"tap"` - as above, except that only code is preloaded

Note that `viewport` and `eager` only apply to links that are present in the DOM immediately following navigation — if a link is added later (in an `{#if ...}` block, for example) it will not be preloaded until triggered by `hover` or `tap`. This is to avoid performance pitfalls resulting from aggressively observing the DOM for changes.

> [!NOTE] Since preloading code is a prerequisite for preloading data, this attribute will only have an effect if it specifies a more eager value than any `data-sveltekit-preload-data` attribute that is present.

As with `data-sveltekit-preload-data`, this attribute will be ignored if the user has chosen reduced data usage.

## data-sveltekit-reload

Occasionally, we need to tell SvelteKit not to handle a link, but allow the browser to handle it. Adding a `data-sveltekit-reload` attribute to a link...

```html
<a data-sveltekit-reload href="/path">Path</a>
```

...will cause a full-page navigation when the link is clicked.

Links with a `rel="external"` attribute will receive the same treatment. In addition, they will be ignored during [prerendering](page-options#prerender).

## data-sveltekit-replacestate

Sometimes you don't want navigation to create a new entry in the browser's session history. Adding a `data-sveltekit-replacestate` attribute to a link...

```html
<a data-sveltekit-replacestate href="/path">Path</a>
```

...will replace the current `history` entry rather than creating a new one with `pushState` when the link is clicked.

## data-sveltekit-reset

When navigating to internal links, SvelteKit mirrors the browser's default navigation behaviour: it will change the scroll position to 0,0 so that the user is at the very top left of the page (unless the link includes a `#hash`, in which case it will scroll to the element with a matching ID), and [reset focus](accessibility#Focus-management).

In certain cases, you may wish to disable this behaviour. Adding a `data-sveltekit-reset="false"` attribute to a link...

```html
<a href="path" data-sveltekit-reset="false">Path</a>
```

...will preserve the current scroll position and focused element after the link is clicked.

The attribute can also be used on a `<form method="GET">` — for example a search form that submits as the user is typing, where you want to keep focus on the text input:

```html
<form data-sveltekit-reset="false">
	<input type="text" name="query">
</form>
```

In general, avoid preserving focus on links, since the focused element would be the `<a>` tag (and not a previously focused element) and screen reader and other assistive technology users often expect focus to be moved after a navigation. You should also only use this attribute on elements that still exist after navigation. If the element no longer exists, the user's focus will be lost, making for a confusing experience for assistive technology users.

## Disabling options

To disable any of these options inside an element where they have been enabled, use the `"false"` value:

```html
<div data-sveltekit-preload-data>
	<!-- these links will be preloaded -->
	<a href="/a">a</a>
	<a href="/b">b</a>
	<a href="/c">c</a>

	<div data-sveltekit-preload-data="false">
		<!-- these links will NOT be preloaded -->
		<a href="/d">d</a>
		<a href="/e">e</a>
		<a href="/f">f</a>
	</div>
</div>
```

To apply an attribute to an element conditionally, do this:

```svelte
<div data-sveltekit-preload-data={condition ? 'hover' : false}>
```

# Service workers

Service workers act as proxy servers that handle network requests inside your app. This makes it possible to make your app work offline, but even if you don't need offline support (or can't realistically implement it because of the type of app you're building), it's often worth using service workers to speed up navigation by precaching your built JS and CSS.

In SvelteKit, if you have a `src/service-worker/index.ts` file it will be bundled and automatically registered.

> [!NOTE] `src/service-worker.ts` or `.js` is also valid, but see the section on [type safety](#Type-safety) below

## Inside the service worker

For the service worker to do anything useful, you will likely need to import some stuff:

- [`$app/service-worker`]($app-service-worker) exports `self` which is just `globalThis` typed as [`ServiceWorkerGlobalScope`](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope) (provided you follow [these steps](#Type-safety)), so that your `fetch` events are typed correctly
- [`$app/env`]($app-env) exports `version`, which is useful for creating deployment-scoped caches
- [`$app/manifest`]($app-manifest) exports `immutable` build files, your `assets`, and any `prerendered` content, allowing you to populate your caches

A typical service worker might look like this:

```js
/// file: src/service-worker.js
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// ---cut---
import { self } from '$app/service-worker';
import { version } from '$app/env';
import { immutable, assets } from '$app/manifest';
import { resolve } from '$app/paths';

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

// `immutable`/`assets` paths from `$app/manifest` are relative to the
// base path, so resolve them to absolute pathnames that can be matched
// against `url.pathname` in the `fetch` handler
const ASSETS = [
	...immutable.map((asset) => resolve(asset.path)), // the Vite output
	...assets.map((asset) => resolve(asset.path))  // everything in `static`
];

self.addEventListener('install', (event) => {
	// Create a new cache and add all files to it
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}

	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	// Remove previous cached data from disk
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}

	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
	// ignore POST requests etc
	if (event.request.method !== 'GET') return;

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);

		// `immutable`/`assets` can always be served from the cache
		if (ASSETS.includes(url.pathname)) {
			const response = await cache.match(url.pathname);

			if (response) {
				return response;
			}
		}

		// for everything else, try the network first...
		try {
			const response = await fetch(event.request);

			if (response.status === 200 && !response.headers.get('cache-control')?.includes('no-store')) {
				// ...and cache responses in the background for next time....
				void cache.put(event.request, response.clone());
			}

			return response;
		} catch (error) {
			// ...otherwise fall back to previously cached data if it exists...
			const response = await cache.match(event.request);

			if (response) {
				return response;
			}

			// ...or throw the error
			throw error;
		}
	}

	event.respondWith(respond());
});
```

> [!NOTE] Be careful when caching! In some cases, stale data might be worse than data that's unavailable while offline. Since browsers will empty caches if they get too full, you should also be careful about caching large assets like video files.

## Type safety

Service workers run in a different context to the rest of your app. As such, they need different types. You should ensure that your project's root `tsconfig.json` excludes your service worker code...

```json
/// file: tsconfig.json
{
	"extends": "$app/tsconfig",
	"include": ["src", "test"],
	"exclude": ["src/service-worker"]
}
```

...and that your `src/service-worker/index.ts` file sits alongside a separate `tsconfig.json`, which should set up the correct types by extending [`$app/tsconfig/service-worker`]($app-tsconfig-service-worker):

```json
/// file: src/service-worker/tsconfig.json
{
	"extends": "$app/tsconfig/service-worker"
}
```

## Manual registration

You can [disable automatic registration](@sveltejs-kit-vite#serviceWorker) if you need to register the service worker with your own logic. The default registration, which is injected into server-rendered HTML, looks something like this:

```js
if ('serviceWorker' in navigator) {
	const script_url = './service-worker.js';
	const policy = globalThis?.window?.trustedTypes?.createPolicy(
		'sveltekit-trusted-url',
		{ createScriptURL(url) { return url; } }
	);
	const sanitised = policy?.createScriptURL(script_url) ?? script_url;
	addEventListener('load', function () {
		navigator.serviceWorker.register(sanitised, { type: 'module' });
	});
}
```

> [!NOTE] The service worker is bundled for production, but not during development.

## Updating the service worker

Browsers check for an updated service worker when a full-page navigation happens within its scope, and after functional events such as `push` and `sync`. Client-side navigations are neither, so navigating around your app will not by itself cause a new deployment's service worker to be picked up.

SvelteKit calls [`registration.update()`](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update) only as part of error recovery — if a route module fails to load or a navigation results in an error status, and [version polling](@sveltejs-kit-vite#version) detects that the app has been redeployed, the service worker is updated before SvelteKit falls back to a full-page navigation.

If you want new deployments to be picked up more eagerly, you can trigger an update check yourself — for example on every client-side navigation, in your root layout:

```js
import { afterNavigate } from '$app/navigation';

afterNavigate(async () => {
	if ('serviceWorker' in navigator) {
		const registration = await navigator.serviceWorker.getRegistration();
		await registration?.update();
	}
});
```

This will not cause the new service worker (if there is one) to take over the existing page immediately — instead, it will be installed in the background and take over as soon as the number of tabs managed by the existing service worker drops to zero.

## Other solutions

SvelteKit's service worker implementation is designed to be easy to work with and is probably a good solution for most users. However, outside of SvelteKit, many PWA applications leverage the [Workbox](https://web.dev/learn/pwa/workbox) library. If you're used to using Workbox you may prefer [Vite PWA plugin](https://vite-pwa-org.netlify.app/frameworks/sveltekit.html).

## References

For more general information on service workers, we recommend [the MDN web docs](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

# Server-only modules

Like a good friend, SvelteKit keeps your secrets. When writing your backend and frontend in the same repository, it can be easy to accidentally import sensitive data into your front-end code (environment variables containing API keys, for example). SvelteKit provides a way to prevent this entirely: server-only modules.

## Private environment variables

The [`$app/env/private`](environment-variables) module can only be imported into modules that only run on the server, such as [`hooks.server.js`](hooks) or [`+page.server.js`](routing#page-page.server.js).

## Server-only utilities

The [`$app/server`]($app-server) module, which contains a [`read`]($app-server#read) function for reading assets from the filesystem, can likewise only be imported by code that runs on the server.

## Your modules

You can make a module server-only in two ways:

- Add a `server` segment to the filename, e.g. `server.js` or `secrets.server.ts`. This works for any file in the project directory.
- Place it in a `server` directory anywhere in your project except inside `src/routes` or the `static` directory, e.g `src/lib/server/config.js` or `src/lib/data/server/user/profile.js`.

> [!LEGACY]
> In SvelteKit 2, `server` directories were only recognised in the `src/lib` folder.

> [!NOTE] Modules outside your working directory and those inside `node_modules` (e.g. packages from npm) are _not_ subject to these rules. If you want to publish a package with a server-only module, add `import '$app/server'` to the top of that file.

## How it works

Any time you have public-facing code that imports server-only code (whether directly or indirectly)...

```js
// @errors: 7005
/// file: #lib/server/secrets.js
export const atlantisCoordinates = [/* redacted */];
```

```js
// @errors: 2307 7006 7005
/// file: src/routes/utils.js
export { atlantisCoordinates } from '#lib/server/secrets.js';

export const add = (a, b) => a + b;
```

```html
/// file: src/routes/+page.svelte
<script>
	import { add } from './utils.js';
</script>
```

...SvelteKit will error:

```
Cannot import #lib/server/secrets.ts into code that runs in the browser, as this could leak sensitive information.

 src/routes/+page.svelte imports
  src/routes/utils.js imports
   #lib/server/secrets.ts

If you're only using the import as a type, change it to `import type`.
```

Even though the public-facing code — `src/routes/+page.svelte` — only uses the `add` export and not the secret `atlantisCoordinates` export, the secret code could end up in JavaScript that the browser downloads, and so the import chain is considered unsafe.

This feature also works with dynamic imports, even interpolated ones like ``await import(`./${foo}.js`)``.

> [!NOTE] Unit testing frameworks like Vitest do not distinguish between server-only and public-facing code. For this reason, illegal import detection is disabled when running tests, as determined by `process.env.TEST === 'true'`.

## Further reading

- [Tutorial: Environment variables](/tutorial/kit/env-static-private)

# Snapshots

Ephemeral DOM state — like scroll positions on sidebars, the content of `<input>` elements and so on — is discarded when you navigate from one page to another.

For example, if the user fills out a form but navigates away and then back before submitting, or if the user refreshes the page, the values they filled in will be lost. In cases where it's valuable to preserve that input, you can take a _snapshot_ of DOM state, which can then be restored if the user navigates back.

To do this, call `snapshot` from `$app/navigation` during component initialization:

```svelte
<!--- file: +page.svelte --->
<script>
	import { snapshot } from '$app/navigation';

	let comment = $state('');

	snapshot({
		capture: () => comment,
		restore: (value) => (comment = value)
	});
</script>

<form method="POST">
	<label for="comment">Comment</label>
	<textarea id="comment" bind:value={comment} />
	<button>Post comment</button>
</form>
```

When you navigate away from this page — including via [shallow routing](shallow-routing) — the `capture` function is called immediately before the page updates, and the returned value is associated with the current entry in the browser's history stack. If you navigate back, the `restore` function is called with the stored value as soon as the page is updated.

Snapshots must have a unique ID in order to survive across component remounts and page reloads. By default, this is generated from the stack trace when `snapshot(...)` is called, but you can also explicitly provide an `id` to (for example) keep snapshots stable across deployments, even if the stack trace differs because of changes to the source code, or to distinguish snapshots created via a shared wrapper function or in multiple instances of the same component:

```js
import { snapshot } from '$app/navigation';

let comment = '';

// ---cut---
snapshot({
	+++id: 'comment',+++
	capture: () => comment,
	restore: (value) => (comment = value)
});
```

The optional `reset` callback runs on navigations where there is no captured value to restore, such as when a new history entry is created.

Captured values are serialized with [devalue](https://github.com/sveltejs/devalue), which handles JSON, objects such as `Date` and `Map`, and custom types specified in your [`transport`](hooks#transport) hook. The serialized data is persisted to `sessionStorage`, which allows the state to be restored when the page is reloaded, or when the user navigates back from a different site.

> [!NOTE] Avoid returning very large objects from `capture` — once captured, objects will be retained in memory for the duration of the session, and in extreme cases may be too large to persist to `sessionStorage`.

## export const snapshot

> [!LEGACY]
> Previously, snapshots were created by exporting a `snapshot` object with `capture` and `restore` methods from a `+page.svelte` or `+layout.svelte`. This form is deprecated in favour of the `snapshot` helper, which can be called from any component.

```svelte
<!--- file: +page.svelte --->
<script>
	let comment = $state('');

	/** @type {import('./$types').Snapshot<string>} */
	export const snapshot = {
		capture: () => comment,
		restore: (value) => comment = value
	};
</script>
```

Values captured this way are serialized as JSON, and shallow navigations do not capture them.

# Page state & shallow routing

As you navigate around a SvelteKit app, you create _history entries_. Clicking the back and forward buttons traverses through this list of entries, re-running any `load` functions, replacing page components, and updating the scroll position and focused element as necessary.

Sometimes, it's useful to create history entries _without_ performing a full navigation. We call this _shallow routing_.

For example, you might want to show a modal dialog that the user can dismiss by navigating back. This is particularly valuable on mobile devices, where swipe gestures are often more natural than interacting directly with the UI. In these cases, a modal that is _not_ associated with a history entry can be a source of frustration, as a user may swipe backwards in an attempt to dismiss it and find themselves on the wrong page.

SvelteKit makes this possible with the [`goto`]($app-navigation#goto) function, which allows you to associate state with a history entry without navigating with the `shallow: true` option:

```svelte
<!--- file: +page.svelte --->
<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Modal from './Modal.svelte';

	function showModal() {
		goto('', {
			state: { showModal: true },
			shallow: true
		});
	}
</script>

<button onclick={showModal}>open</button>

{#if page.state.showModal}
	<Modal close={() => history.back()} />
{/if}
```

State is globally accessible via the [page object]($app-state#page) as `page.state`. You can make page state type-safe by declaring an [`App.PageState`](types#PageState) interface (usually in `src/app.d.ts`).

The modal can be dismissed by navigating back (unsetting `page.state.showModal`) or by interacting with it in a way that causes the `close` callback to run, which will navigate back programmatically.

You can also update the contents of the browser's URL bar during a shallow navigation:

```js
import { goto } from '$app/navigation';
const state = { active: true };
// ---cut---
goto('/another/page', {
	state,
	shallow: true
});
```

> [!NOTE] If the user reloads, they will land on `/another/page`, _not_ the currently rendered page — see [Caveats](#Caveats).

Regardless of whether you choose to update the visible URL or not, [`beforeNavigate`]($app-navigation#beforeNavigate), [`onNavigate`]($app-navigation#onNavigate) and [`afterNavigate`]($app-navigation#afterNavigate) will run with `navigation.type === 'goto'` and `navigation.shallow === true`.

Once shallow routing is active, `page.shallow` becomes a `{ url, params, route }` object describing the page that _would_ be rendered if the user were to navigate there (which would happen if, for example, they reloaded the page). `page.url`, `page.params` and `page.route` continue to describe the page that is currently rendered.

```svelte
<!--- file: +page.svelte --->
<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
</script>

<p>The user-visible URL is {page.shallow?.url.href ?? page.url.href}</p>
<p>The actual page you're on is {page.url.href}</p>

<button onclick={() => goto('/shallow', { shallow: true })}>enter shallow route</button>
```

A regular `goto` call without `shallow: true`, or a standard link click, exits shallow routing.

Navigating back or forward to a shallow entry restores its `page.state` and `page.shallow`. The rendered page, and therefore `page.url`, is still the one the user was on when `goto` was called. To navigate to the visible URL, call `goto(page.shallow.url)` without `shallow: true`.

> [!LEGACY]
> In SvelteKit 2 this functionality was achieved using `pushState` and `replaceState`, which are now deprecated. Use `goto` with `shallow: true` instead, and use the `replace` option when replacing the current history entry.

## Routing options

By default, the above examples create a new navigation entry in the history stack. If you don't want that, you can replace the existing navigation entry instead:

```js
import { goto } from '$app/navigation';
const url = new URL('https://example.com');
const state = { showModal: true };
// ---cut---
goto(url, {
	state,
	replace: true
});
```

By default, state set with `goto` is not restored after a reload. To change that, use `persistState`:

```js
import { goto } from '$app/navigation';
const url = new URL('https://example.com');
const state = { showModal: true };
// ---cut---
goto(url, {
	state,
	persistState: true
});
```

Shallow navigations preserve the current scroll position and focused element by default. You can opt out of this behavior with `reset: true`:

```js
import { goto } from '$app/navigation';
const url = new URL('https://example.com');
// ---cut---
goto(url, {
	shallow: true,
	reset: true
});
```

> [!NOTE]
> `page.state` is only populated after JavaScript loads, which can cause flickering UI. Use it carefully.

## Loading data for a route

When shallow routing, you may want to render another `+page.svelte` inside the current page. For example, clicking on a photo thumbnail could pop up the detail view without navigating to the photo page.

For this to work, you need to load the data that the `+page.svelte` expects. A convenient way to do this is to use [`preloadData`]($app-navigation#preloadData) inside the `click` handler of an `<a>` element. If the element (or a parent) uses [`data-sveltekit-preload-data`](link-options#data-sveltekit-preload-data), the data will have already been requested, and `preloadData` will reuse that request.

```svelte
<!--- file: src/routes/photos/+page.svelte --->
<script>
	import { preloadData, goto } from '$app/navigation';
	import { page } from '$app/state';
	import Modal from './Modal.svelte';
	import PhotoPage from './[id]/+page.svelte';

	let { data } = $props();
</script>

{#each data.thumbnails as thumbnail}
	<a
		href="/photos/{thumbnail.id}"
		onclick={async (e) => {
			if (innerWidth < 640        // bail if the screen is too small
				|| e.shiftKey             // or the link is opened in a new window
				|| e.metaKey || e.ctrlKey // or a new tab (mac: metaKey, win/linux: ctrlKey)
				// should also consider clicking with a mouse scroll wheel
			) return;

			// prevent navigation
			e.preventDefault();

			const { href } = e.currentTarget;

			// run `load` functions (or rather, get the result of the `load` functions
			// that are already running because of `data-sveltekit-preload-data`)
			const result = await preloadData(href);

			if (result.type === 'loaded' && result.status === 200) {
				goto(href, { shallow: true, state: { selected: result.data } });
			} else {
				// something bad happened! try navigating
				goto(href);
			}
		}}
	>
		<img alt={thumbnail.alt} src={thumbnail.src} />
	</a>
{/each}

{#if page.state.selected}
	<Modal onclose={() => history.back()}>
		<!-- pass page data to the +page.svelte component,
		     just like SvelteKit would on navigation -->
		<PhotoPage data={page.state.selected} />
	</Modal>
{/if}
```

## Caveats

Shallow routing requires JavaScript. Be mindful when using it and try to think of sensible fallback behaviour in case JavaScript isn't available.

The server has no awareness of history state. As such, `page.state` is an empty object during SSR, and a reload will navigate directly to the prior `page.shallow.url` if it exists. In other words, if `page.shallow.url.pathname` is `/photos/123` before the reload, after the reload `page.url.pathname` will be `/photos/123` and `page.shallow` will be `null`, regardless of the `persistState` option. (This only applies to the initial page load, to avoid a flickering UI when the client app starts.)

# Observability

<blockquote class="since note">
 <p>Available since 2.31</p>
</blockquote>

Sometimes, you may need to observe how your application is behaving in order to improve performance or find the root cause of a pesky bug. To help with this, SvelteKit can emit server-side [OpenTelemetry](https://opentelemetry.io) spans for the following:

- The [`handle`](hooks#handle) hook and `handle` functions running in a [`sequence`](@sveltejs-kit-hooks#sequence) (these will show up as children of each other and the root `handle` hook)
- Server [`load`](load) functions and universal `load` functions when they're run on the server
- [Form actions](form-actions)
- [`+server`](routing#server) handlers
- [Remote functions](remote-functions)

Just telling SvelteKit to emit spans won't get you far, though — you need to actually collect them somewhere to be able to view them. SvelteKit provides `src/instrumentation.server.ts` as a place to write your tracing setup and instrumentation code. If this file exists, it is loaded before your application code (provided your deployment platform supports it and your adapter is aware of it).

To enable SvelteKit's built-in span emission, set the `tracing.server` option of the SvelteKit plugin in your `vite.config.js` to `true`:

```js
/// file: vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			+++tracing: {
				server: true
			}+++
		})
	]
});
```

> [!NOTE] Tracing — and more significantly, observability instrumentation — can have a nontrivial overhead. Before you go all-in on tracing, consider whether or not you really need it, or if it might be more appropriate to turn it on in development and preview environments only.

## Augmenting the built-in tracing

SvelteKit provides access to the `root` span and the `current` span on the request event. The root span is the one associated with your root `handle` function, and the current span could be associated with `handle`, `load`, a form action, a `+server` handler, or a remote function, depending on the context. You can annotate these spans with any attributes you wish to record:

```js
/// file: #lib/authenticate.ts

// @filename: ambient.d.ts
declare module '#lib/auth-core.js' {
	export function getAuthenticatedUser(): Promise<{ id: string }>
}

// @filename: index.js
// ---cut---
import { getRequestEvent } from '$app/server';
import { getAuthenticatedUser } from '#lib/auth-core.js';

async function authenticate() {
	const user = await getAuthenticatedUser();
	const event = getRequestEvent();
	event.tracing.root.setAttribute('userId', user.id);
}
```

## Development quickstart

To view your first trace, you'll need to set up a local collector. We'll use [Jaeger](https://www.jaegertracing.io/docs/getting-started/) in this example, as they provide an easy-to-use quickstart command. Once your collector is running locally:

- Enable tracing as described earlier in your `vite.config.js` file, and create `src/instrumentation.server.js` (which SvelteKit will load automatically)
- Use your package manager to install the dependencies you'll need:
 ```sh
 npm i @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-proto import-in-the-middle
 ```
- Create `src/instrumentation.server.js` with the following:

```js
// @errors: 2307
/// file: src/instrumentation.server.js
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { register } from 'import-in-the-middle/register-hooks.mjs';

register();

const sdk = new NodeSDK({
	serviceName: 'test-sveltekit-tracing',
	traceExporter: new OTLPTraceExporter(),
	instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();
```

Now, server-side requests will begin generating traces, which you can view in Jaeger's web console at [localhost:16686](http://localhost:16686).

> [!NOTE] `import-in-the-middle/register-hooks.mjs` registers the loader via [`module.registerHooks()`](https://nodejs.org/api/module.html#moduleregisterhooksoptions), which runs the hooks synchronously on the application thread. This avoids the inter-thread message channel that the older `module.register()`-based setup required.
>
> The synchronous loader needs Node.js 22.22.3+, 24.11.1+, 25.1.0+, or 26.0.0+. `register()` will throw on older Node.js versions. If you need to support them, fall back to the asynchronous loader:
>
> ```js
> // @errors: 2307
> /// file: src/instrumentation.server.js
> import { NodeSDK } from '@opentelemetry/sdk-node';
> import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
> import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
> import { register, supportsSyncHooks } from 'import-in-the-middle/register-hooks.mjs';
> import { createAddHookMessageChannel } from 'import-in-the-middle';
> import { register as registerAsync } from 'node:module';
>
> if (supportsSyncHooks()) {
> register();
> } else {
> const { registerOptions } = createAddHookMessageChannel();
> registerAsync('import-in-the-middle/hook.mjs', import.meta.url, registerOptions);
> }
>
> const sdk = new NodeSDK({
> serviceName: 'test-sveltekit-tracing',
> traceExporter: new OTLPTraceExporter(),
> instrumentations: [getNodeAutoInstrumentations()]
> });
>
> sdk.start();
> ```
>
> The asynchronous `module.register()` API was deprecated in Node.js 25.9.0 and emits a runtime deprecation warning from 26.0.0, so prefer the synchronous path whenever your Node.js version supports it.

## `@opentelemetry/api`

SvelteKit uses `@opentelemetry/api` to generate its spans. This is declared as an optional peer dependency so that users not needing traces see no impact on install size or runtime performance. In most cases, if you're configuring your application to collect SvelteKit's spans, you'll end up installing a library like `@opentelemetry/sdk-node` or `@vercel/otel`, which in turn depend on `@opentelemetry/api`, which will satisfy SvelteKit's dependency as well. If you see an error from SvelteKit telling you it can't find `@opentelemetry/api`, it may just be because you haven't set up your trace collection yet. If you _have_ done that and are still seeing the error, you can install `@opentelemetry/api` yourself.

## Bundling caveats

OpenTelemetry auto-instrumentation generally works by intercepting imports and replacing or wrapping a module's exports with instrumented versions. This is what `import-in-the-middle` does in the example above. Because ESM module exports are immutable, the interceptor must be installed before the module being instrumented is evaluated. This is why `instrumentation.server.js` is a special entry point: SvelteKit arranges for it to run before it dynamically imports your application code. The intended order is:

1. `instrumentation.server.js` registers an interceptor for `my-database-library`
2. Your application imports `my-database-library`
3. The interceptor observes the import and returns the instrumented exports

Bundling can disrupt this in two ways.

First, a bundler may place code imported by `instrumentation.server.js` and application code in the same shared chunk. Importing that chunk to initialize instrumentation can then evaluate application code before the interceptor has been installed. By the time the application is dynamically imported, the module is already in the ESM module cache and it is too late to instrument it.

There is also an unavoidable chicken-and-egg limitation: importing [`$app/env/*` modules](environment-variables) evaluates your `src/env.js` module and its dependencies. Because of this, instrumentation cannot intercept a module imported by `src/env`, because that imported module must run before `instrumentation.server.js` can start. Therefore, you should avoid importing anything from `src/env.js` that you need to instrument.

Second, a bundler may inline or transform the module you want to instrument. For example, it could replace this:

```js
// @errors: 2307 example library
import { query } from 'my-database-library';
```

with code embedded directly in an application chunk, or with an import such as `import { query } from './chunks/abc.js'`. At runtime there is no longer an import of `my-database-library` for the interceptor to observe. Tree-shaking and export rewriting can also change the shape of the module in ways that its OpenTelemetry instrumentation does not recognize.

SvelteKit automatically externalizes `@opentelemetry/api` so that its runtime and your instrumentation share the same module instance. If another library is not being instrumented as expected, tell Vite to leave that library out of the server bundle:

```js
/// file: vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		external: ['my-database-library']
	}
});
```

Externalization preserves the bare `my-database-library` import in the server output. Node.js then loads the package at runtime, after `instrumentation.server.js` has registered the interceptor, giving the instrumentation an opportunity to wrap it. Externalize the package being instrumented and any packages whose imports must remain visible to its instrumentation. Do not externalize application source files, and avoid externalizing dependencies indiscriminately, since doing so can change how they are resolved and deployed.

Dependencies needed at runtime must be listed in `dependencies`, rather than `devDependencies`, so that they are available in the deployed application. `adapter-node` also uses this distinction when it bundles the Vite output: it automatically keeps packages listed in `dependencies`, including their deep imports, external from that final bundle. You may still need `ssr.external` to prevent Vite from bundling a package during the earlier SSR build.

The other official adapters do not apply the same `dependencies`-based externalization rule themselves. Some adapters or deployment platforms perform their own tracing or bundling step, while others do not support runtime package imports at all. In those environments, Vite's `ssr.external` setting may not be sufficient or supported. Consult the adapter or platform documentation to verify that the dependency can remain external.

# Packaging

You can use SvelteKit to build apps as well as component libraries, using the `@sveltejs/package` package (`npx sv create` has an option to set this up for you).

When you're creating an app, the contents of `src/routes` is the public-facing stuff; [`src/lib`]($lib) contains your app's internal library.

A component library has the exact same structure as a SvelteKit app, except that `src/lib` is the public-facing bit, and your root `package.json` is used to publish the package. `src/routes` might be a documentation or demo site that accompanies the library, or it might just be a sandbox you use during development.

Running the `svelte-package` command from `@sveltejs/package` will take the contents of `src/lib` and generate a `dist` directory (which can be [configured](#Options)) containing the following:

- All the files in `src/lib`. Svelte components will be preprocessed, TypeScript files will be transpiled to JavaScript.
- Type definitions (`d.ts` files) which are generated for Svelte, JavaScript and TypeScript files. You need to install `typescript >= 4.0.0` for this. Type definitions are placed next to their implementation, hand-written `d.ts` files are copied over as is. You can [disable generation](#Options), but we strongly recommend against it — people using your library might use TypeScript, for which they require these type definition files.

> [!NOTE] `@sveltejs/package` version 1 generated a `package.json`. This is no longer the case and it will now use the `package.json` from your project and validate that it is correct instead. If you're still on version 1, see [this PR](https://github.com/sveltejs/kit/pull/8922) for migration instructions.

## Anatomy of a package.json

Since you're now building a library for public use, the contents of your `package.json` will become more important. Through it, you configure the entry points of your package, which files are published to npm, and which dependencies your library has. Let's go through the most important fields one by one.

### name

This is the name of your package. It will be available for others to install using that name, and visible on `https://npmjs.com/package/<name>`.

```json
{
	"name": "your-library"
}
```

Read more about it [here](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#name).

### license

Every package should have a license field so people know how they are allowed to use it. A very popular license which is also very permissive in terms of distribution and reuse without warranty is `MIT`.

```json
{
	"license": "MIT"
}
```

Read more about it [here](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#license). Note that you should also include a `LICENSE` file in your package.

### files

This tells npm which files it will pack up and upload to npm. It should contain your output folder (`dist` by default). Your `package.json` and `README` and `LICENSE` will always be included, so you don't need to specify them.

```json
{
	"files": ["dist"]
}
```

To exclude unnecessary files (such as unit tests, or modules that are only imported from `src/routes` etc) you can add them to an `.npmignore` file. This will result in smaller packages that are faster to install.

Read more about it [here](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#files).

### exports

The `"exports"` field contains the package's entry points. If you set up a new library project through `npx sv create`, it's set to a single export, the package root:

```json
{
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"svelte": "./dist/index.js"
		}
	}
}
```

This tells bundlers and tooling that your package only has one entry point, the root, and everything should be imported through that, like this:

```js
// @errors: 2307
import { Something } from 'your-library';
```

The `types` and `svelte` keys are [export conditions](https://nodejs.org/api/packages.html#conditional-exports). They tell tooling what file to import when they look up the `your-library` import:

- TypeScript sees the `types` condition and looks up the type definition file. If you don't publish type definitions, omit this condition.
- Svelte-aware tooling sees the `svelte` condition and knows this is a Svelte component library. If you publish a library that does not export any Svelte components and that could also work in non-Svelte projects (for example a Svelte store library), you can replace this condition with `default`.

> [!NOTE] Previous versions of `@sveltejs/package` also added a `package.json` export. This is no longer part of the template because all tooling can now deal with a `package.json` not being explicitly exported.

You can adjust `exports` to your liking and provide more entry points. For example, if instead of a `src/lib/index.js` file that re-exported components you wanted to expose a `src/lib/Foo.svelte` component directly, you could create the following export map...

```json
{
	"exports": {
		"./Foo.svelte": {
			"types": "./dist/Foo.svelte.d.ts",
			"svelte": "./dist/Foo.svelte"
		}
	}
}
```

...and a consumer of your library could import the component like so:

```js
// @filename: ambient.d.ts
declare module 'your-library/Foo.svelte';

// @filename: index.js
// ---cut---
import Foo from 'your-library/Foo.svelte';
```

> [!NOTE] Beware that doing this will need additional care if you provide type definitions. Read more about the caveat [here](#TypeScript)

In general, each key of the exports map is the path the user will have to use to import something from your package, and the value is the path to the file that will be imported or a map of export conditions which in turn contains these file paths.

Read more about `exports` [here](https://nodejs.org/docs/latest-v18.x/api/packages.html#package-entry-points).

### svelte

This is a legacy field that enabled tooling to recognise Svelte component libraries. It's no longer necessary when using the `svelte` [export condition](#Anatomy-of-a-package.json-exports), but for backwards compatibility with outdated tooling that doesn't yet know about export conditions it's good to keep it around. It should point towards your root entry point.

```json
{
	"svelte": "./dist/index.js"
}
```

### sideEffects

The `sideEffects` field in `package.json` is used by bundlers to determine if a module may contain code that has side effects. A module is considered to have side effects if it makes changes that are observable from other scripts outside the module when it's imported. For example, side effects include modifying global variables or the prototype of built-in JavaScript objects. Because a side effect could potentially affect the behavior of other parts of the application, these files/modules will be included in the final bundle regardless of whether their exports are used in the application. It is a best practice to avoid side effects in your code.

Setting the `sideEffects` field in `package.json` can help the bundler to be more aggressive in eliminating unused exports from the final bundle, a process known as tree-shaking. This results in smaller and more efficient bundles. Different bundlers handle `sideEffects` in various manners. While not necessary for Vite, we recommend that libraries state that all CSS files have side effects so that your library will be [compatible with webpack](https://webpack.js.org/guides/tree-shaking/#mark-the-file-as-side-effect-free). This is the configuration that comes with newly created projects:

```json
/// file: package.json
{
	"sideEffects": ["**/*.css"]
}
```

> [!NOTE] If the scripts in your library have side effects, ensure that you update the `sideEffects` field. All scripts are marked as side effect free by default in newly created projects. If a file with side effects is incorrectly marked as having no side effects, it can result in broken functionality.

If your package has files with side effects, you can specify them in an array:

```json
/// file: package.json
{
	"sideEffects": [
		"**/*.css",
		"./dist/sideEffectfulFile.js"
	]
}
```

This will treat only the specified files as having side effects.

## TypeScript

You should ship type definitions for your library even if you don't use TypeScript yourself so that people who do get proper intellisense when using your library. `@sveltejs/package` makes the process of generating types mostly opaque to you. By default, when packaging your library, type definitions are auto-generated for JavaScript, TypeScript and Svelte files. All you need to ensure is that the `types` condition in the [exports](#Anatomy-of-a-package.json-exports) map points to the correct files. When initialising a library project through `npx sv create`, this is automatically set up for the root export.

If you have something else than a root export however — for example providing a `your-library/foo` import — you need to take additional care for providing type definitions. Unfortunately, TypeScript by default will _not_ resolve the `types` condition for an export like `{ "./foo": { "types": "./dist/foo.d.ts", ... }}`. Instead, it will search for a `foo.d.ts` relative to the root of your library (i.e. `your-library/foo.d.ts` instead of `your-library/dist/foo.d.ts`). To fix this, you have two options:

The first option is to require people using your library to set the `moduleResolution` option in their `tsconfig.json` (or `jsconfig.json`) to `bundler` (available since TypeScript 5, the best and recommended option in the future), `node16` or `nodenext`. This opts TypeScript into actually looking at the exports map and resolving the types correctly.

The second option is to (ab)use the `typesVersions` feature from TypeScript to wire up the types. This is a field inside `package.json` TypeScript uses to check for different type definitions depending on the TypeScript version, and also contains a path mapping feature for that. We leverage that path mapping feature to get what we want. For the mentioned `foo` export above, the corresponding `typesVersions` looks like this:

```json
{
	"exports": {
		"./foo": {
			"types": "./dist/foo.d.ts",
			"svelte": "./dist/foo.js"
		}
	},
	"typesVersions": {
		">4.0": {
			"foo": ["./dist/foo.d.ts"]
		}
	}
}
```

`>4.0` tells TypeScript to check the inner map if the used TypeScript version is greater than 4 (which should in practice always be true). The inner map tells TypeScript that the typings for `your-library/foo` are found within `./dist/foo.d.ts`, which essentially replicates the `exports` condition. You also have `*` as a wildcard at your disposal to make many type definitions at once available without repeating yourself. Note that if you opt into `typesVersions` you have to declare all type imports through it, including the root import (which is defined as `"index.d.ts": [..]`).

You can read more about that feature [here](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html#version-selection-with-typesversions).

## Best practices

You should avoid using SvelteKit-specific modules like `$app/env` in your packages unless you intend for them to only be consumable by other SvelteKit projects. E.g. rather than using `import { browser } from '$app/env'` you could use `import { BROWSER } from 'esm-env'` ([see esm-env docs](https://github.com/benmccann/esm-env)). You may also wish to pass in things like the current URL or a navigation action as a prop rather than relying directly on `$app/state`, `$app/navigation`, etc. Writing your app in this more generic fashion will also make it easier to set up tools for testing, UI demos and so on.

Use [subpath imports](https://nodejs.org/api/packages.html#subpath-imports) for aliases in library code. `svelte-package` rewrites `#`-prefixed imports from your package.json `imports` field to relative paths when packaging.

You should think carefully about whether or not the changes you make to your package are a bug fix, a new feature, or a breaking change, and update the package version accordingly. Note that if you remove any paths from `exports` or any `export` conditions inside them from your existing library, that should be regarded as a breaking change.

```json
{
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
// changing `svelte` to `default` is a breaking change:
---			"svelte": "./dist/index.js"---
+++			"default": "./dist/index.js"+++
		},
// removing this is a breaking change:
---		"./foo": {
			"types": "./dist/foo.d.ts",
			"svelte": "./dist/foo.js",
			"default": "./dist/foo.js"
		},---
// adding this is ok:
+++		"./bar": {
			"types": "./dist/bar.d.ts",
			"svelte": "./dist/bar.js",
			"default": "./dist/bar.js"
		}+++
	}
}
```

## Source maps

You can create so-called declaration maps (`d.ts.map` files) by setting `"declarationMap": true` in your `tsconfig.json`. This will allow editors such as VS Code to go to the original `.ts` or `.svelte` file when using features like _Go to Definition_. This means you also need to publish your source files alongside your dist folder in a way that the relative path inside the declaration files leads to a file on disk. Assuming that you have all your library code inside `src/lib` as suggested by Svelte's CLI, this is as simple as adding `src/lib` to `files` in your `package.json`:

```json
{
	"files": [
		"dist",
		"!dist/**/*.test.*",
		"!dist/**/*.spec.*",
		+++"src/lib",
		"!src/lib/**/*.test.*",
		"!src/lib/**/*.spec.*"+++
	]
}
```

## Options

`svelte-package` accepts the following options:

- `-w`/`--watch` — watch files in `src/lib` for changes and rebuild the package
- `-i`/`--input` — the input directory which contains all the files of the package. Defaults to `src/lib`
- `-o`/`--output` — the output directory where the processed files are written to. Your `package.json`'s `exports` should point to files inside there, and the `files` array should include that folder. Defaults to `dist`
- `-p`/`--preserve-output` — prevent deletion of the output directory before packaging. Defaults to `false`, which means that the output directory will be emptied first
- `-t`/`--types` — whether or not to create type definitions (`d.ts` files). We strongly recommend doing this as it fosters ecosystem library quality. Defaults to `true`
- `--tsconfig` - the path to a tsconfig or jsconfig. When not provided, searches for the next upper tsconfig/jsconfig in the workspace path.

## Publishing

To publish the generated package:

```sh
npm publish
```

## Caveats

All relative file imports need to be fully specified, adhering to Node's ESM algorithm. This means that for a file like `src/lib/something/index.js`, you must include the filename with the extension:

```js
// @errors: 2307
import { something } from './something+++/index.js+++';
```

If you are using TypeScript, you need to import `.ts` files the same way, but using a `.js` file ending, _not_ a `.ts` file ending. (This is a TypeScript design decision outside our control.) Setting `"moduleResolution": "NodeNext"` in your `tsconfig.json` or `jsconfig.json` will help you with this.

All files except Svelte files (preprocessed) and TypeScript files (transpiled to JavaScript) are copied across as-is.

# Auth

Auth refers to authentication and authorization, which are common needs when building a web application. Authentication means verifying that the user is who they say they are based on their provided credentials. Authorization means determining which actions they are allowed to take.

## Sessions vs tokens

After the user has provided their credentials such as a username and password, we want to allow them to use the application without needing to provide their credentials again for future requests. Users are commonly authenticated on subsequent requests with either a session identifier or signed token such as a JSON Web Token (JWT).

Session IDs are most commonly stored in a database. They can be immediately revoked, but require a database query to be made on each request.

In contrast, JWT generally are not checked against a datastore, which means they cannot be immediately revoked. The advantage of this method is improved latency and reduced load on your datastore.

## Integration points

Auth [cookies](@sveltejs-kit#Cookies) can be checked inside the [`handle`](hooks#handle) hook. If a user is found matching the provided credentials, the user information can be stored in [`locals`](hooks#handle-locals):

```js
/// file: src/hooks.server.js
// @filename: ambient.d.ts
type User = {
	name: string;
};

declare namespace App {
	interface Locals {
		user: User | null;
	}
}

const getUserInformation: (cookie: string | void) => Promise<User | null>;

// @filename: index.js
// ---cut---
/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle({ event, resolve }) {
	event.locals.user = await getUserInformation(event.cookies.get('sessionid'));

	return resolve(event);
}
```

You can then use [`getRequestEvent`]($app-server#getRequestEvent) to read `locals.user` and check if the user is authenticated. This check can live in a shared helper, then reused in each load function, as shown in [this example](load#Using-getRequestEvent).

> [!NOTE] Always prefer checks in `+page.server.js` over `+layout.server.js` — see [implications for authentication](load#Implications-for-authentication)

### Protecting multiple routes

To protect your private routes, add an authentication guard that checks against a whitelist of public routes in your `handle` hook:

```js
/// file: src/hooks.server.js
// @filename: ambient.d.ts
type User = {
	name: string;
};

declare namespace App {
	interface Locals {
		user: User | null;
	}
}

const getUserInformation: (cookie: string | void) => Promise<User | null>;

// @filename: index.js
// ---cut---
import { redirect } from '@sveltejs/kit';

const PUBLIC_ROUTES = new Set(['/', '/login', '/signup']);

/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle({ event, resolve }) {
	event.locals.user = await getUserInformation(event.cookies.get('sessionid'));

	if (!event.locals.user && !PUBLIC_ROUTES.has(event.route.id ?? '')) {
		redirect(303, '/login');
	}

	return resolve(event);
}
```

Whenever possible, you should match on `event.route.id` rather than `event.url.pathname` because `event.route.id` is the actual route the SvelteKit router has matched, and therefore represents the content that will be served if the request is allowed to progress. Simple string checks against the URL's pathname can run into all sorts of issues — for example, the URL pathname can be [encoded](advanced-routing#Encoding), so a check such as `event.url.pathname.startsWith('/admin')` can be bypassed with the encoded equivalent `/%61dmin`. If you absolutely must match on any raw part of the URL, ensure you use proper decoding and write thorough tests.

> [!NOTE] Prerendered pages and static assets are served without invoking `handle`, so they can't be protected this way.

### Remote functions

If you're using [remote functions](remote-functions), you _must_ run the authentication check directly inside the function — see [implications for authentication](remote-functions#Implications-for-authentication).

## Libraries

The [Svelte CLI](/docs/cli) gives the option to [set up Better Auth](/docs/cli/better-auth) with a new project or add it to an existing project.

## Guides

If you'd like to implement your own auth system, [Pilcrow's Auth Book](https://auth.pilcrowonpaper.com/) provides a reference for session-based web app auth . There's also a [simple example](https://github.com/lucia-auth/lucia/blob/main/code/auth_session.ts) of how to implement this generally.

# Performance

Out of the box, SvelteKit does a lot of work to make your applications as performant as possible:

- Code-splitting, so that only the code you need for the current page is loaded
- Asset preloading, so that 'waterfalls' (of files requesting other files) are prevented
- File hashing, so that your assets can be cached forever
- Request coalescing, so that data fetched from separate server `load` functions is grouped into a single HTTP request
- Parallel loading, so that separate universal `load` functions fetch data simultaneously
- Data inlining, so that requests made with `fetch` during server rendering can be replayed in the browser without issuing a new request
- Conservative invalidation, so that `load` functions are only re-run when necessary
- Prerendering (configurable on a per-route basis, if necessary) so that pages without dynamic data can be served instantaneously
- Link preloading, so that data and code requirements for a client-side navigation are eagerly anticipated

Nevertheless, we can't (yet) eliminate all sources of slowness. To eke out maximum performance, you should be mindful of the following tips.

## Diagnosing issues

Google's [PageSpeed Insights](https://pagespeed.web.dev/) and (for more advanced analysis) [WebPageTest](https://www.webpagetest.org/) are excellent ways to understand the performance characteristics of a site that is already deployed to the internet.

Your browser also includes useful developer tools for analysing your site, whether deployed or running locally:

* Chrome - [Lighthouse](https://developer.chrome.com/docs/lighthouse/overview#devtools), [Network](https://developer.chrome.com/docs/devtools/network), and [Performance](https://developer.chrome.com/docs/devtools/performance) devtools
* Edge - [Lighthouse](https://learn.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium/lighthouse/lighthouse-tool), [Network](https://learn.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium/network/), and [Performance](https://learn.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium/evaluate-performance/) devtools
* Firefox - [Network](https://firefox-source-docs.mozilla.org/devtools-user/network_monitor/) and [Performance](https://hacks.mozilla.org/2022/03/performance-tool-in-firefox-devtools-reloaded/) devtools
* Safari - [enhancing the performance of your webpage](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/Web_Inspector_Tutorial/EnhancingyourWebpagesPerformance/EnhancingyourWebpagesPerformance.html)

Note that your site running locally in `dev` mode will exhibit different behaviour than your production app, so you should do performance testing in [preview](building-your-app#Preview-your-app) mode after building.

### Instrumenting

If you see in the network tab of your browser that an API call is taking a long time and you'd like to understand why, you may consider instrumenting your backend with a tool like [OpenTelemetry](https://opentelemetry.io/) or [Server-Timing headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing).

## Optimizing assets

### Images

Reducing the size of image files is often one of the most impactful changes you can make to a site's performance. Svelte provides the `@sveltejs/enhanced-img` package, detailed on the [images](images) page, for making this easier. Additionally, Lighthouse is useful for identifying the worst offenders.

### Videos

Video files can be very large, so extra care should be taken to ensure that they're optimized:

- Compress videos with tools such as [Handbrake](https://handbrake.fr/). Consider converting the videos to web-friendly formats such as `.webm` or `.mp4`.
- You can [lazy-load videos](https://web.dev/articles/lazy-loading-video) located below the fold with `preload="none"` (though note that this will slow down playback when the user _does_ initiate it).
- Strip the audio track out of muted videos using a tool like [FFmpeg](https://ffmpeg.org/).

### Fonts

SvelteKit automatically preloads critical `.js` and `.css` files when the user visits a page, but it does _not_ preload fonts by default, since this may cause unnecessary files (such as font weights that are referenced by your CSS but not actually used on the current page) to be downloaded. Having said that, preloading fonts correctly can make a big difference to how fast your site feels. In your [`handle`](hooks#handle) hook, you can call `resolve` with a `preload` filter that includes your fonts:

```js
/// file: src/hooks.server.js
/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle({ event, resolve }) {
	return resolve(event, {
		preload: (asset) => {
			if (asset.type === 'font') {
				return asset.filename === 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2';
			}

			return true;
		}
	});
}
```

`filename` is the source filename relative to the project root, and is only available when `asset.type === 'font'` since JS and CSS assets are bundled by Vite.

You can reduce the size of font files by [subsetting](https://web.dev/learn/performance/optimize-web-fonts#subset_your_web_fonts) your fonts.

## Reducing code size

### Svelte version

We recommend running the latest version of Svelte. Svelte 5 is smaller and faster than Svelte 4, which is smaller and faster than Svelte 3.

### Packages

[`rollup-plugin-visualizer`](https://www.npmjs.com/package/rollup-plugin-visualizer) can be helpful for identifying which packages are contributing the most to the size of your site. You may also find opportunities to remove code by manually inspecting the build output (use `build: { minify: false }` in your [Vite config](https://vitejs.dev/config/build-options.html#build-minify) to make the output readable, but remember to undo that before deploying your app), or via the network tab of your browser's devtools.

### External scripts

Try to minimize the number of third-party scripts running in the browser. For example, instead of using JavaScript-based analytics consider using server-side implementations, such as those offered by many platforms with SvelteKit adapters including [Cloudflare](https://www.cloudflare.com/web-analytics/), [Netlify](https://docs.netlify.com/monitor-sites/site-analytics/), and [Vercel](https://vercel.com/docs/analytics).

To run third party scripts in a web worker (which avoids blocking the main thread), use [Partytown's SvelteKit integration](https://partytown.qwik.dev/sveltekit/).

### Selective loading

Code imported with static `import` declarations will be automatically bundled with the rest of your page. If there is a piece of code you need only when some condition is met, use the dynamic `import(...)` form to selectively lazy-load the component.

## Navigation

### Preloading

You can speed up client-side navigations by eagerly preloading the necessary code and data, using [link options](link-options). This is configured by default on the `<body>` element when you create a new SvelteKit app.

### Non-essential data

For slow-loading data that isn't needed immediately, the object returned from your `load` function can contain promises rather than the data itself. For server `load` functions, this will cause the data to [stream](load#Streaming-with-promises) in after the navigation (or initial page load).

### Preventing waterfalls

One of the biggest performance killers is what is referred to as a _waterfall_, which is a series of requests that is made sequentially. This can happen on the server or in the browser, but is especially costly when dealing with data that has to travel further or across slower networks, such as a mobile user making a call to a distant server.

In the browser, waterfalls can occur when your HTML kicks off request chains such as requesting JS which requests CSS which requests a background image and web font. SvelteKit will largely solve this class of problems for you by adding [`modulepreload`](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/modulepreload) tags or headers, but you should view [the network tab in your devtools](#Diagnosing-issues) to check whether additional resources need to be preloaded.
- Pay special attention to this if you use [web fonts](#Optimizing-assets-Fonts) since they need to be handled manually.
- Enabling [single page app (SPA) mode](single-page-apps) will cause such waterfalls. With SPA mode, an empty page is generated, which fetches JavaScript, which ultimately loads and renders the page. This results in extra network round trips before a single pixel can be displayed.

Waterfalls can also occur on calls to the backend whether made from the browser or server. E.g. if a universal `load` function makes an API call to fetch the current user, then uses the details from that response to fetch a list of saved items, and then uses _that_ response to fetch the details for each item, the browser will end up making multiple sequential requests. This is deadly for performance, especially for users that are physically located far from your backend.
- Avoid this issue by using [server `load` functions](load#Universal-vs-server) to make requests to backend services that are dependencies from the server rather than from the browser. Note, however, that server `load` functions are also not immune to waterfalls (though they are much less costly since they rarely involve round trips with high latency). For example, if you query a database to get the current user and then use that data to make a second query for a list of saved items, it will typically be more performant to issue a single query with a database join.

## Hosting

Your frontend should be located in the same data center as your backend to minimize latency. For sites with no central backend, many SvelteKit adapters support deploying to the _edge_, which means handling each user's requests from a nearby server. This can reduce load times significantly. Some adapters even support [configuring deployment on a per-route basis](page-options#config). You should also consider serving images from a CDN (which are typically edge networks) — the hosts for many SvelteKit adapters will do this automatically.

Ensure your host uses HTTP/2 or newer. Vite's code splitting creates numerous small files for improved cacheability, which results in excellent performance, but this does assume that your files can be loaded in parallel with HTTP/2.

## Further reading

For the most part, building a performant SvelteKit app is the same as building any performant web app. You should be able to apply information from general performance resources such as [Core Web Vitals](https://web.dev/explore/learn-core-web-vitals) to any web experience you build.

# Icons

## CSS

A great way to use icons is to define them purely via CSS. Iconify offers support for [many popular icon sets](https://icon-sets.iconify.design/) that [can be included via CSS](https://iconify.design/docs/usage/css/). This method can also be used with popular CSS frameworks by leveraging the Iconify [Tailwind CSS plugin](https://iconify.design/docs/usage/css/tailwind/) or [UnoCSS plugin](https://iconify.design/docs/usage/css/unocss/). As opposed to libraries based on Svelte components, it doesn't require each icon to be imported into your `.svelte` file.

## Svelte

There are many [icon libraries for Svelte](/packages#icons). When choosing an icon library, it is recommended to avoid those that provide a `.svelte` file per icon, as these libraries can have thousands of `.svelte` files which really slow down [Vite's dependency optimization](https://vite.dev/guide/dep-pre-bundling.html). This can become especially pathological if the icons are imported both via an umbrella import and subpath import [as described in the `vite-plugin-svelte` FAQ](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/faq.md#what-is-going-on-with-vite-and-pre-bundling-dependencies).

# Images

Images can have a big impact on your app's performance. For best results, you should optimize them by doing the following:

- generate optimal formats like `.avif` and `.webp`
- create different sizes for different screens
- ensure that assets can be cached effectively

Doing this manually is tedious. There are a variety of techniques you can use, depending on your needs and preferences.

## Vite's built-in handling

[Vite will automatically process imported assets](https://vitejs.dev/guide/assets.html) for improved performance. This includes assets referenced via the CSS `url()` function. Hashes will be added to the filenames so that they can be cached, and assets smaller than `assetsInlineLimit` will be inlined. Vite's asset handling is most often used for images, but is also useful for video, audio, etc.

```svelte
<script>
	import logo from '#lib/assets/logo.png';
</script>

<img alt="The project logo" src={logo} />
```

## @sveltejs/enhanced-img

`@sveltejs/enhanced-img` is a plugin offered on top of Vite's built-in asset handling. It provides plug and play image processing that serves smaller file formats like `avif` or `webp`, automatically sets the intrinsic `width` and `height` of the image to avoid layout shift, creates images of multiple sizes for various devices, and strips EXIF data for privacy. It will work in any Vite-based project including, but not limited to, SvelteKit projects.

> [!NOTE] As a build plugin, `@sveltejs/enhanced-img` can only optimize files located on your machine during the build process. If you have an image located elsewhere (such as a path served from your database, CMS, or backend), please read about [loading images dynamically from a CDN](#Loading-images-dynamically-from-a-CDN).

### Setup

Install:

```sh
npm i -D @sveltejs/enhanced-img
```

Adjust `vite.config.js`:

```js
/// file: vite.config.js
+++import { enhancedImages } from '@sveltejs/enhanced-img';+++
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		+++enhancedImages(), // must come before the SvelteKit plugin+++
		sveltekit({/* ... */})
	]
});
```

Building will take longer on the first build due to the computational expense of transforming images. However, the build output will be cached in `./node_modules/.cache/imagetools` so that subsequent builds will be fast.

### Basic usage

Use in your `.svelte` components by using `<enhanced:img>` rather than `<img>` and referencing the image file with a [Vite asset import](https://vitejs.dev/guide/assets.html#static-asset-handling) path:

```svelte
<enhanced:img src="./path/to/your/image.jpg" alt="An alt text" />
```

At build time, your `<enhanced:img>` tag will be replaced with an `<img>` wrapped by a `<picture>` providing multiple image types and sizes. It's only possible to downscale images without losing quality, which means that you should provide the highest resolution image that you need — smaller versions will be generated for the various device types that may request an image.

You should provide your image at 2x resolution for HiDPI displays (a.k.a. retina displays). `<enhanced:img>` will automatically take care of serving smaller versions to smaller devices.

> [!NOTE] if you wish to use a [tag name CSS selector](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Basic_selectors#type_selectors) in your `<style>` block you will need to write `enhanced\:img` to escape the colon in the tag name.

### Dynamically choosing an image

You can also manually import an image asset and pass it to an `<enhanced:img>`. This is useful when you have a collection of static images and would like to dynamically choose one or [iterate over them](https://github.com/sveltejs/kit/blob/0ab1733e394b6310895a1d3bf0f126ce34531170/sites/kit.svelte.dev/src/routes/home/Showcase.svelte). In this case you will need to update both the `import` statement and `<img>` element as shown below to indicate you'd like process them.

```svelte
<script>
	import MyImage from './path/to/your/image.jpg?enhanced';
</script>

<enhanced:img src={MyImage} alt="some alt text" />
```

You can also use [Vite's `import.meta.glob`](https://vitejs.dev/guide/features.html#glob-import). Note that you will have to specify `enhanced` via a [custom query](https://vitejs.dev/guide/features.html#custom-queries):

```svelte
<script>
	const imageModules = import.meta.glob(
		'/path/to/assets/*.{avif,AVIF,gif,GIF,heif,HEIF,jpeg,JPEG,jpg,JPG,png,PNG,tiff,TIFF,webp,WEBP}',
		{
			eager: true,
			query: {
				enhanced: true
			}
		}
	)
</script>

{#each Object.entries(imageModules) as [_path, module]}
	<enhanced:img src={module.default} alt="some alt text" />
{/each}
```

> [!NOTE] svg images are currently only supported statically

### Intrinsic Dimensions

`width` and `height` are optional as they can be inferred from the source image and will be automatically added when the `<enhanced:img>` tag is preprocessed. With these attributes, the browser can reserve the correct amount of space, preventing [layout shift](https://web.dev/articles/cls). If you'd like to use a different `width` and `height` you can style the image with CSS. Because the preprocessor adds a `width` and `height` for you, if you'd like one of the dimensions to be automatically calculated then you will need to specify that:

```svelte
<style>
	.hero-image img {
		width: var(--size);
		height: auto;
	}
</style>
```

### `srcset` and `sizes`

If you have a large image, such as a hero image taking the width of the design, you should specify `sizes` so that smaller versions are requested on smaller devices. E.g. if you have a 1280px image you may want to specify something like:

```svelte
<enhanced:img src="./image.png" sizes="min(1280px, 100vw)"/>
```

If `sizes` is specified, `<enhanced:img>` will generate small images for smaller devices and populate the `srcset` attribute.

The smallest picture generated automatically will have a width of 540px. If you'd like smaller images or would otherwise like to specify custom widths, you can do that with the `w` query parameter:

```svelte
<enhanced:img
	src="./image.png?w=1280;640;400"
	sizes="(min-width:1920px) 1280px, (min-width:1080px) 640px, (min-width:768px) 400px"
/>
```

If `sizes` is not provided, then a HiDPI/Retina image and a standard resolution image will be generated. The image you provide should be 2x the resolution you wish to display so that the browser can display that image on devices with a high [device pixel ratio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio).

### Per-image transforms

By default, enhanced images will be transformed to more efficient formats. However, you may wish to apply other transforms such as a blur, quality, flatten, or rotate operation. You can run per-image transforms by appending a query string:

```svelte
<enhanced:img src="./path/to/your/image.jpg?blur=15" alt="An alt text" />
```

[See the imagetools repo for the full list of directives](https://github.com/JonasKruckenberg/imagetools/blob/main/docs/directives.md).

## Loading images dynamically from a CDN

In some cases, the images may not be accessible at build time — e.g. they may live inside a content management system or elsewhere.

Using a content delivery network (CDN) can allow you to optimize these images dynamically, and provides more flexibility with regards to sizes, but it may involve some setup overhead and usage costs. Depending on caching strategy, the browser may not be able to use a cached copy of the asset until a [304 response](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/304) is received from the CDN. Building HTML to target CDNs allows using an `<img>` tag since the CDN can serve the appropriate format based on the `User-Agent` header, whereas build-time optimizations must produce `<picture>` tags with multiple sources. Finally, some CDNs may generate images lazily, which could have a negative performance impact for sites with low traffic and frequently changing images.

CDNs can generally be used without any need for a library. However, there are a number of libraries with Svelte support that make it easier. [`@unpic/svelte`](https://unpic.pics/img/svelte/) is a CDN-agnostic library with support for a large number of providers. You may also find that specific CDNs like [Cloudinary](https://svelte.cloudinary.dev/) have Svelte support. Finally, some content management systems (CMS) which support Svelte (such as [Contentful](https://www.contentful.com/sveltekit-starter-guide/), [Storyblok](https://www.storyblok.com/docs/guides/svelte), and [Contentstack](https://www.contentstack.com/docs/headless-cms/sveltekit)) have built-in support for image handling.

## Best practices

- For each image type, use the appropriate solution from those discussed above. You can mix and match all three solutions in one project. For example, you may use Vite's built-in handling to provide images for `<meta>` tags, display images on your homepage with `@sveltejs/enhanced-img`, and display user-submitted content with a dynamic approach.
- Consider serving all images via CDN regardless of the image optimization types you use. CDNs reduce latency by distributing copies of static assets globally.
- Your original images should have a good quality/resolution and should have 2x the width it will be displayed at to serve HiDPI devices. Image processing can size images down to save bandwidth when serving smaller screens, but it would be a waste of bandwidth to invent pixels to size images up.
- For images which are much larger than the width of a mobile device (roughly 400px), such as a hero image taking the width of the page design, specify `sizes` so that smaller images can be served on smaller devices.
- For important images, such as the [largest contentful paint (LCP)](https://web.dev/articles/lcp) image, set `fetchpriority="high"` and avoid `loading="lazy"` to prioritize loading as early as possible.
- Give the image a container or styling so that it is constrained and does not jump around while the page is loading affecting your [cumulative layout shift (CLS)](https://web.dev/articles/cls). `width` and `height` help the browser to reserve space while the image is still loading, so `@sveltejs/enhanced-img` will add a `width` and `height` for you.
- Always provide a good `alt` text. The Svelte compiler will warn you if you don't do this.
- Do not use `em` or `rem` in `sizes` and change the default size of these measures. When used in `sizes` or `@media` queries, `em` and `rem` are both defined to mean the user's default `font-size`. For a `sizes` declaration like `sizes="(min-width: 768px) min(100vw, 108rem), 64rem"`, the actual `em` or `rem` that controls how the image is laid out on the page can be different if changed by CSS. For example, do not do something like `html { font-size: 62.5%; }` as the slot reserved by the browser preloader will now end up being larger than the actual slot of the CSS object model once it has been created.

# Accessibility

SvelteKit strives to provide an accessible platform for your app by default. Svelte's [compile-time accessibility checks](../svelte/compiler-warnings) will also apply to any SvelteKit application you build.

Here's how SvelteKit's built-in accessibility features work and what you need to do to help these features to work as well as possible. Keep in mind that while SvelteKit provides an accessible foundation, you are still responsible for making sure your application code is accessible. If you're new to accessibility, see the ["further reading"](accessibility#Further-reading) section of this guide for additional resources.

We recognize that accessibility can be hard to get right. If you want to suggest improvements to how SvelteKit handles accessibility, please [open a GitHub issue](https://github.com/sveltejs/kit/issues).

## Route announcements

In traditional server-rendered applications, every navigation (e.g. clicking on an `<a>` tag) triggers a full page reload. When this happens, screen readers and other assistive technology will read out the new page's title so that users understand that the page has changed.

Since navigation between pages in SvelteKit happens without reloading the page (known as [client-side routing](glossary#Routing)), SvelteKit injects a [live region](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions) onto the page that will read out the new page name after each navigation. This determines the page name to announce by inspecting the `<title>` element.

Because of this behavior, every page in your app should have a unique, descriptive title. In SvelteKit, you can do this by placing a `<svelte:head>` element on each page:

```svelte
<!--- file: src/routes/+page.svelte --->
<svelte:head>
	<title>Todo List</title>
</svelte:head>
```

This will allow screen readers and other assistive technology to identify the new page after a navigation occurs. Providing a descriptive title is also important for [SEO](seo#Manual-setup-title-and-meta).

## Focus management

In traditional server-rendered applications, every navigation will reset focus to the top of the page. This ensures that people browsing the web with a keyboard or screen reader will start interacting with the page from the beginning.

To simulate this behavior during client-side routing, SvelteKit focuses the `<body>` element after each navigation and [enhanced form submission](form-actions#Progressive-enhancement). There is one exception - if an element with the [`autofocus`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/autofocus) attribute is present, SvelteKit will focus that element instead. Make sure to [consider the implications for assistive technology](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/autofocus#accessibility_considerations) when using that attribute.

If you want to customize SvelteKit's focus management, you can use the `afterNavigate` hook:

```js
/// <reference types="@sveltejs/kit" />
// ---cut---
import { afterNavigate } from '$app/navigation';

afterNavigate(() => {
	/** @type {HTMLElement | null} */
	const to_focus = document.querySelector('.focus-me');
	to_focus?.focus();
});
```

You can also programmatically navigate to a different page using the [`goto`]($app-navigation#goto) function. By default, this will have the same client-side routing behavior as clicking on a link. However, `goto` also accepts a `reset: false` option that will preserve the current scroll position and the currently-focused element instead of resetting them. If you use this option, make sure the currently-focused element still exists on the page after navigation. If the element no longer exists, the user's focus will be lost, making for a confusing experience for assistive technology users.

## The "lang" attribute

By default, SvelteKit's page template sets the default language of the document to English. If your content is not in English, you should update the `<html>` element in `src/app.html` to have the correct [`lang`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang#accessibility) attribute. This will ensure that any assistive technology reading the document uses the correct pronunciation. For example, if your content is in German, you should update `app.html` to the following:

```html
/// file: src/app.html
<html lang="de">
```

If your content is available in multiple languages, you should set the `lang` attribute based on the language of the current page. You can do this with SvelteKit's [handle hook](hooks#handle):

```html
/// file: src/app.html
<html lang="%lang%">
```

```js
/// file: src/hooks.server.js
// @filename: utils.ts
export function get_lang(event: import('@sveltejs/kit').RequestEvent) {
	return 'en';
}

// @filename: hooks.server.js
import { get_lang } from './utils';
// ---cut---
/** @type {import('@sveltejs/kit/hooks').Handle} */
export function handle({ event, resolve }) {
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', get_lang(event))
	});
}
```

## Further reading

For the most part, building an accessible SvelteKit app is the same as building an accessible web app. You should be able to apply information from the following general accessibility resources to any web experience you build:

- [MDN Web Docs: Accessibility](https://developer.mozilla.org/en-US/docs/Learn/Accessibility)
- [The A11y Project](https://www.a11yproject.com/)
- [How to Meet WCAG (Quick Reference)](https://www.w3.org/WAI/WCAG21/quickref/)

# SEO

The most important aspect of SEO is to create high-quality content that is widely linked to from around the web. However, there are a few technical considerations for building sites that rank well.

## Out of the box

### SSR

While search engines have got better in recent years at indexing content that was rendered with client-side JavaScript, server-side rendered content is indexed more frequently and reliably. SvelteKit employs SSR by default, and while you can disable it in [`handle`](hooks#handle), you should leave it on unless you have a good reason not to.

> [!NOTE] SvelteKit's rendering is highly configurable and you can implement [dynamic rendering](https://developers.google.com/search/docs/advanced/javascript/dynamic-rendering) if necessary. It's not generally recommended, since SSR has other benefits beyond SEO.

### Performance

Signals such as [Core Web Vitals](https://web.dev/vitals/#core-web-vitals) impact search engine ranking. Because Svelte and SvelteKit introduce minimal overhead, they make it easier to build high performance sites. You can test your site's performance using Google's [PageSpeed Insights](https://pagespeed.web.dev/) or [Lighthouse](https://developers.google.com/web/tools/lighthouse). With just a few key actions like using SvelteKit's default [hybrid rendering](glossary#Hybrid-app) mode and [optimizing your images](images), you can greatly improve your site's speed. Read [the performance page](performance) for more details.

### Normalized URLs

SvelteKit redirects pathnames with trailing slashes to ones without (or vice versa depending on your [configuration](page-options#trailingSlash)), as duplicate URLs are bad for SEO.

## Manual setup

### &lt;title&gt; and &lt;meta&gt;

Every page should have well-written and unique `<title>` and `<meta name="description">` elements inside a [`<svelte:head>`](../svelte/svelte-head). Guidance on how to write descriptive titles and descriptions, along with other suggestions on making content understandable by search engines, can be found on Google's [Lighthouse SEO audits](https://web.dev/lighthouse-seo/) documentation.

> [!NOTE] A common pattern is to return SEO-related `data` from page [`load`](load) functions, then use it (as [`page.data`]($app-state)) in a `<svelte:head>` in your root [layout](routing#layout).

### Sitemaps

[Sitemaps](https://developers.google.com/search/docs/advanced/sitemaps/build-sitemap) help search engines prioritize pages within your site, particularly when you have a large amount of content. You can create a sitemap dynamically using an endpoint:

```js
/// file: src/routes/sitemap.xml/+server.js
export async function GET() {
	return new Response(
		`
		<?xml version="1.0" encoding="UTF-8" ?>
		<urlset
			xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
			xmlns:xhtml="http://www.w3.org/1999/xhtml"
			xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0"
			xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
			xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
			xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
		>
			<!-- <url> elements go here -->
		</urlset>`.trim(),
		{
			headers: {
				'Content-Type': 'application/xml'
			}
		}
	);
}
```

# Frequently asked questions

## Other resources

Please see [the Svelte FAQ](../svelte/faq) and [`vite-plugin-svelte` FAQ](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/faq.md) as well for the answers to questions deriving from those libraries.

## What can I make with SvelteKit?

See [the documentation regarding project types](project-types) for more details.

## Which browsers does SvelteKit support?

SvelteKit's client runtime targets the same browsers as [Vite's default `build.target`](https://vite.dev/config/build-options#build-target), `'baseline-widely-available'`. With Vite 8 this means Chrome 111, Edge 111, Firefox 114 and Safari 16.4 or later. 

The client runtime is not polyfilled. Setting a lower `build.target` only changes how syntax is transformed — it does not add missing APIs — so if you need to support older browsers you will need to add polyfills yourself, for example with [`@vitejs/plugin-legacy`](https://github.com/vitejs/vite/tree/main/packages/plugin-legacy).

[Service workers](service-workers) are registered with `type: 'module'`, so browsers without support for module service workers will not register them.

## How do I include details from package.json in my application?

If you'd like to include your application's version number or other information from `package.json` in your application, you can load JSON like so:

```ts
// @errors: 2732
/// file: vite.config.js
import pkg from './package.json' with { type: 'json' };
```

## How do I fix the error I'm getting trying to include a package?

Most issues related to including a library are due to incorrect packaging. You can check if a library's packaging is compatible with Node.js by entering it into [the publint website](https://publint.dev/).

Here are a few things to keep in mind when checking if a library is packaged correctly:

- `exports` takes precedence over the other entry point fields such as `main` and `module`. Adding an `exports` field may not be backwards-compatible as it prevents deep imports.
- ESM files should end with `.mjs` unless `"type": "module"` is set in which any case CommonJS files should end with `.cjs`.
- `main` should be defined if `exports` is not. It should be either a CommonJS or ESM file and adhere to the previous bullet. If a `module` field is defined, it should refer to an ESM file.
- Svelte components should be distributed as uncompiled `.svelte` files with any JS in the package written as ESM only. Custom script and style languages, like TypeScript and SCSS, should be preprocessed as vanilla JS and CSS respectively. We recommend using [`svelte-package`](./packaging) for packaging Svelte libraries, which will do this for you.

Libraries work best in the browser with Vite when they distribute an ESM version, especially if they are dependencies of a Svelte component library. You may wish to suggest to library authors that they provide an ESM version. However, CommonJS (CJS) dependencies should work as well since, by default, [`vite-plugin-svelte` will ask Vite to pre-bundle them](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/faq.md#what-is-going-on-with-vite-and-pre-bundling-dependencies) using `rolldown` to convert them to ESM.

If you are still encountering issues we recommend searching both [the Vite issue tracker](https://github.com/vitejs/vite/issues) and the issue tracker of the library in question. Sometimes issues can be worked around by fiddling with the [`optimizeDeps`](https://vitejs.dev/config/#dep-optimization-options) or [`ssr`](https://vitejs.dev/config/#ssr-options) config values though we recommend this as only a short-term workaround in favor of fixing the library in question.

## How do I use the view transitions API?

While SvelteKit does not have any specific integration with [view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/), you can call `document.startViewTransition` in [`onNavigate`]($app-navigation#onNavigate) to trigger a view transition on every client-side navigation.

```js
// @errors: 2339 2810
import { onNavigate } from '$app/navigation';

onNavigate((navigation) => {
	if (!document.startViewTransition) return;

	return new Promise((resolve) => {
		document.startViewTransition(async () => {
			resolve();
			await navigation.complete;
		});
	});
});
```

For more, see ["Unlocking view transitions"](/blog/view-transitions) on the Svelte blog.

## How do I set up a database?

Put the code to query your database in a [server route](./routing#server) - don't query the database in .svelte files. You can create a `db.js` or similar that sets up a connection immediately and makes the client accessible throughout the app as a singleton. You can execute any one-time setup code in `hooks.server.js` and import your database helpers into any endpoint that needs them.

You can use [the Svelte CLI](/docs/cli/overview) to automatically set up database integrations.

## How do I use a client-side library accessing `document` or `window`?

If you need access to the `document` or `window` variables or otherwise need code to run only on the client-side you can wrap it in a `browser` check:

```js
/// <reference types="@sveltejs/kit" />
// ---cut---
import { browser } from '$app/env';

if (browser) {
	// client-only code here
}
```

You can also run code in `onMount` if you'd like to run it after the component has been first rendered to the DOM:

```js
// @filename: ambient.d.ts
// @lib: ES2015
declare module 'some-browser-only-library';

// @filename: index.js
// ---cut---
import { onMount } from 'svelte';

onMount(async () => {
	const { method } = await import('some-browser-only-library');
	method('hello world');
});
```

If the library you'd like to use is side-effect free you can also statically import it and it will be tree-shaken out in the server-side build where `onMount` will be automatically replaced with a no-op:

```js
// @filename: ambient.d.ts
// @lib: ES2015
declare module 'some-browser-only-library';

// @filename: index.js
// ---cut---
import { onMount } from 'svelte';
import { method } from 'some-browser-only-library';

onMount(() => {
	method('hello world');
});
```

Finally, you may also consider using an `{#await}` block:
```svelte
<!--- file: index.svelte --->
<script>
	import { browser } from '$app/env';

	const promise = browser
		? import('./BrowserComponent.svelte')
		: import('./ServerComponent.svelte');
</script>

{#await promise}
	<p>Loading...</p>
{:then module}
	<module.default />
{:catch error}
	<p>Something went wrong: {error.message}</p>
{/await}
```

## How do I use a different backend API server?

You can use [`event.fetch`](./load#Making-fetch-requests) to request data from an external API server, but be aware that you would need to deal with [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS), which will result in complications such as generally requiring requests to be preflighted resulting in higher latency. Requests to a separate subdomain may also increase latency due to an additional DNS lookup, TLS setup, etc. If you wish to use this method, you may find [`handleFetch`](./hooks#handleFetch) helpful.

Another approach is to set up a proxy to bypass CORS headaches. In production, you would rewrite a path like `/api` to the API server; for local development, use Vite's [`server.proxy`](https://vitejs.dev/config/server-options.html#server-proxy) option.

How to set up rewrites in production will depend on your deployment platform. If rewrites aren't an option, you could alternatively add an [API route](./routing#server):

```js
/// file: src/routes/api/[...path]/+server.js
/** @type {import('./$types').RequestHandler} */
export function GET({ params, url }) {
	return fetch(`https://example.com/${params.path + url.search}`);
}
```

(Note that you may also need to proxy `POST`/`PATCH` etc requests, and forward `request.headers`, depending on your needs.)

## How do I use middleware?

`@sveltejs/adapter-node` builds a middleware that you can use with your own server for production mode. In dev, you can add middleware to Vite by using a Vite plugin. For example:

```js
// @errors: 2307
/// file: vite.config.js
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

+++/** @type {import('vite').Plugin} */
const myPlugin = {
	name: 'log-request-middleware',
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			console.log(`Got request ${req.url}`);
			next();
		});
	}
};+++

export default defineConfig({
	plugins: [
		+++myPlugin,+++
		sveltekit({
			adapter: adapter()
		})
	]
});
```

See [Vite's `configureServer` docs](https://vitejs.dev/guide/api-plugin.html#configureserver) for more details including how to control ordering.

## How do I use Yarn?

### Does it work with Yarn 2?

Sort of. The Plug'n'Play feature, aka 'pnp', is broken (it deviates from the Node module resolution algorithm, and [doesn't yet work with native JavaScript modules](https://github.com/yarnpkg/berry/issues/638) which SvelteKit — along with an [increasing number of packages](https://github.com/wooorm/npm-esm-vs-cjs) — uses). You can use `nodeLinker: 'node-modules'` in your [`.yarnrc.yml`](https://yarnpkg.com/configuration/yarnrc#nodeLinker) file to disable pnp, but it's probably easier to just use npm or [pnpm](https://pnpm.io/), which is similarly fast and efficient but without the compatibility headaches.

### How do I use with Yarn 3?

Currently ESM Support within the latest Yarn (version 3) is considered [experimental](https://github.com/yarnpkg/berry/pull/2161).

The below seems to work although your results may vary. First create a new application:

```sh
yarn create svelte myapp
cd myapp
```

And enable Yarn Berry:

```sh
yarn set version berry
yarn install
```

One of the more interesting features of Yarn Berry is the ability to have a single global cache for packages, instead of having multiple copies for each project on the disk. However, setting `enableGlobalCache` to true causes building to fail, so it is recommended to add the following to the `.yarnrc.yml` file:

```yaml
nodeLinker: node-modules
```

This will cause packages to be downloaded into a local node_modules directory but avoids the above problem and is your best bet for using version 3 of Yarn at this point in time.

# Integrations

## `vitePreprocess`

[`vitePreprocess`](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/preprocess.md) preprocesses `<style>` and `<script>` tags in `.svelte` files.

```js
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess({
				style: true,      // default value
				script: false     // default value
			})
		})
	]
});
```

### `style`

Use `vitePreprocess()` to enable CSS preprocessors in `<style>` tags: PostCSS, SCSS, Less, Stylus, and SugarSS.

### `script`

Use `vitePreprocess({ script: true })` if:
- your project is before Svelte 5
- you are using advanced TypeScript features that emit code _(check [`vitePreprocess`](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/preprocess.md) documentation)_

> [!NOTE]
TypeScript is supported natively in Svelte 5, so if you are using Svelte 5 and you don't need to use advanced TypeScript features that emit code, you probably don't need to use `vitePreprocess`.

## Add-ons

Run [`npx sv add`](/docs/cli/sv-add) to set up many different complex integrations with a single command including:
- prettier (formatting)
- eslint (linting)
- vitest (unit testing)
- playwright (e2e testing)
- better-auth (auth)
- tailwind (CSS)
- drizzle (DB)
- paraglide (i18n)
- mdsvex (markdown)
- storybook (frontend workshop)
- adapters (hosting)
- mcp (LLM tooling)

## Packages

Check out [the packages page](/packages) for a curated set of high quality Svelte packages. You can also see [sveltesociety.dev](https://sveltesociety.dev/) for additional libraries, templates, and resources.

## Additional integrations

### `svelte-preprocess`

`svelte-preprocess` has some additional functionality not found in `vitePreprocess` such as support for Pug, Babel, and global styles. However, `vitePreprocess` may be faster and require less configuration, so it is used by default. Note that CoffeeScript is [not supported](https://github.com/sveltejs/kit/issues/2920#issuecomment-996469815) by SvelteKit.

You will need to install `svelte-preprocess` with `npm i -D svelte-preprocess` and [add it to your `vite.config.js`](https://github.com/sveltejs/svelte-preprocess/blob/main/docs/usage.md#with-svelte-config). After that, you will often need to [install the corresponding library](https://github.com/sveltejs/svelte-preprocess/blob/main/docs/getting-started.md) such as `npm i -D sass` or `npm i -D less`.

## Vite plugins

Since SvelteKit projects are built with Vite, you can use Vite plugins to enhance your project. See a list of available plugins at [`vitejs/awesome-vite`](https://github.com/vitejs/awesome-vite?tab=readme-ov-file#plugins).

## Integration FAQs

[The SvelteKit FAQ](./faq) answers many questions about how to do X with SvelteKit, which may be helpful if you still have questions.

# Breakpoint Debugging

In addition to the [`@debug`](../svelte/@debug) tag, you can also debug Svelte and SvelteKit projects using breakpoints within various tools and development environments. This includes both frontend and backend code.

The following guides assume your JavaScript runtime environment is Node.js.

## Visual Studio Code

With the built-in debug terminal, you can set up breakpoints in source files within VSCode.

1. Open the command palette: `CMD/Ctrl` + `Shift` + `P`.
2. Find and launch "Debug: JavaScript Debug Terminal".
3. Start your project using the debug terminal. For example: `npm run dev`.
4. Set some breakpoints in your client or server-side source code.
5. Trigger the breakpoint.

### Launch via debug pane

You may alternatively set up a `.vscode/launch.json` in your project. To set one up automatically:

1. Go to the "Run and Debug" pane.
2. In the "Run" select menu, choose "Node.js...".
3. Select the "run script" that corresponds to your project, such as "Run script: dev".
4. Press the "Start debugging" play button, or hit `F5` to begin breakpoint debugging.

Here's an example `launch.json`:

```json
{
	"version": "0.2.0",
	"configurations": [
		{
			"command": "npm run dev",
			"name": "Run development server",
			"request": "launch",
			"type": "node-terminal"
		}
	]
}
```

Further reading: <https://code.visualstudio.com/docs/editor/debugging>.

## Other Editors

If you use a different editor, these community guides might be useful for you:

- [WebStorm Svelte: Debug Your Application](https://www.jetbrains.com/help/webstorm/svelte.html#ws_svelte_debug)
- [Debugging JavaScript Frameworks in Neovim](https://theosteiner.de/debugging-javascript-frameworks-in-neovim)

## Google Chrome and Microsoft Edge Developer Tools

It's possible to debug Node.js applications using a browser-based debugger.

> [!NOTE] Note this only works with debugging client-side SvelteKit source maps.

1. Run the `--inspect` flag when starting the Vite server with Node.js. For instance: `NODE_OPTIONS="--inspect" npm run dev`
2. Open your site in a new tab. Typically at `localhost:5173`.
3. Open your browser's dev tools, and click on the "Open dedicated DevTools for Node.js" icon near the top-left. It should display the Node.js logo.
4. Set up breakpoints and debug your application.

You may alternatively open the debugger devtools by navigating to `chrome://inspect` in Google Chrome, or `edge://inspect` in Microsoft Edge.

## References

- [Debugging Node.js](https://nodejs.org/en/learn/getting-started/debugging)

# Migrating to SvelteKit v2

Upgrading from SvelteKit version 1 to version 2 should be mostly seamless. There are a few breaking changes to note, which are listed here. You can use `npx sv migrate sveltekit-2` to migrate some of these changes automatically.

We highly recommend upgrading to the most recent 1.x version before upgrading to 2.0, so that you can take advantage of targeted deprecation warnings. We also recommend [updating to Svelte 4](../svelte/v4-migration-guide) first: Later versions of SvelteKit 1.x support it, and SvelteKit 2.0 requires it.

## `redirect` and `error` are no longer thrown by you

Previously, you had to `throw` the values returned from `error(...)` and `redirect(...)` yourself. In SvelteKit 2 this is no longer the case — calling the functions is sufficient.

```js
import { error } from '@sveltejs/kit'

// ...
---throw error(500, 'something went wrong');---
+++error(500, 'something went wrong');+++
```

`svelte-migrate` will do these changes automatically for you.

If the error or redirect is thrown inside a `try {...}` block (hint: don't do this!), you can distinguish them from unexpected errors using [`isHttpError`](@sveltejs-kit#isHttpError) and [`isRedirect`](@sveltejs-kit#isRedirect) imported from `@sveltejs/kit`.

## path is required when setting cookies

When receiving a `Set-Cookie` header that doesn't specify a `path`, browsers will [set the cookie path](https://www.rfc-editor.org/rfc/rfc6265#section-5.1.4) to the parent of the resource in question. This behaviour isn't particularly helpful or intuitive, and frequently results in bugs because the developer expected the cookie to apply to the domain as a whole.

As of SvelteKit 2.0, you need to set a `path` when calling `cookies.set(...)`, `cookies.delete(...)` or `cookies.serialize(...)` so that there's no ambiguity. Most of the time, you probably want to use `path: '/'`, but you can set it to whatever you like, including relative paths — `''` means 'the current path', `'.'` means 'the current directory'.

```js
/** @type {import('./$types').PageServerLoad} */
export function load({ cookies }) {
	cookies.set(name, value, +++{ path: '/' }+++);
	return { response }
}
```

`svelte-migrate` will add comments highlighting the locations that need to be adjusted.

## Top-level promises are no longer awaited

In SvelteKit version 1, if the top-level properties of the object returned from a `load` function were promises, they were automatically awaited. With the introduction of [streaming](/blog/streaming-snapshots-sveltekit) this behavior became a bit awkward as it forces you to nest your streamed data one level deep.

As of version 2, SvelteKit no longer differentiates between top-level and non-top-level promises. To get back the blocking behavior, use `await` (with `Promise.all` to prevent waterfalls, where appropriate):

```js
// @filename: ambient.d.ts
declare const url: string;

// @filename: index.js
// ---cut---
// If you have a single promise
/** @type {import('./$types').PageServerLoad} */
export +++async+++ function load({ fetch }) {
	const response = +++await+++ fetch(url).then(r => r.json());
	return { response }
}
```

```js
// @filename: ambient.d.ts
declare const url1: string;
declare const url2: string;

// @filename: index.js
// ---cut---
// If you have multiple promises
/** @type {import('./$types').PageServerLoad} */
export +++async+++ function load({ fetch }) {
---	const a = fetch(url1).then(r => r.json());---
---	const b = fetch(url2).then(r => r.json());---
+++	const [a, b] = await Promise.all([
		fetch(url1).then(r => r.json()),
		fetch(url2).then(r => r.json()),
	]);+++
	return { a, b };
}
```

## goto(...) changes

`goto(...)` no longer accepts external URLs. To navigate to an external URL, use `window.location.href = url`. The `state` object now determines `$page.state` and must adhere to the `App.PageState` interface, if declared. See [shallow routing](shallow-routing) for more details.

## paths are now relative by default

In SvelteKit 1, `%sveltekit.assets%` in your `app.html` was replaced with a relative path by default (i.e. `.` or `..` or `../..` etc, depending on the path being rendered) during server-side rendering unless the [`paths.relative`](@sveltejs-kit-vite#paths) config option was explicitly set to `false`. The same was true for `base` and `assets` imported from `$app/paths`, but only if the `paths.relative` option was explicitly set to `true`.

This inconsistency is fixed in version 2. Paths are either always relative or always absolute, depending on the value of [`paths.relative`](@sveltejs-kit-vite#paths). It defaults to `true` as this results in more portable apps: if the `base` is something other than the app expected (as is the case when viewed on the [Internet Archive](https://archive.org/), for example) or unknown at build time (as is the case when deploying to [IPFS](https://ipfs.tech/) and so on), fewer things are likely to break.

## Server fetches are not trackable anymore

Previously it was possible to track URLs from `fetch`es on the server in order to rerun load functions. This poses a possible security risk (private URLs leaking), and for this reason it was behind the `dangerZone.trackServerFetches` setting, which is now removed.

## `preloadCode` arguments must be prefixed with `base`

SvelteKit exposes two functions, [`preloadCode`]($app-navigation#preloadCode) and [`preloadData`]($app-navigation#preloadData), for programmatically loading the code and data associated with a particular path. In version 1, there was a subtle inconsistency — the path passed to `preloadCode` did not need to be prefixed with the `base` path (if set), while the path passed to `preloadData` did.

This is fixed in SvelteKit 2 — in both cases, the path should be prefixed with `base` if it is set.

Additionally, `preloadCode` now takes a single argument rather than _n_ arguments.

## `resolvePath` has been removed

SvelteKit 1 included a function called `resolvePath` which allows you to resolve a route ID (like `/blog/[slug]`) and a set of parameters (like `{ slug: 'hello' }`) to a pathname. Unfortunately the return value didn't include the `base` path, limiting its usefulness in cases where `base` was set.

For this reason, SvelteKit 2 replaces `resolvePath` with a (slightly better named) function called `resolveRoute`, which is imported from `$app/paths` and which takes `base` into account.

```js
---import { resolvePath } from '@sveltejs/kit';
import { base } from '$app/paths';---
+++import { resolveRoute } from '$app/paths';+++

---const path = base + resolvePath('/blog/[slug]', { slug });---
+++const path = resolveRoute('/blog/[slug]', { slug });+++
```

`svelte-migrate` will do the method replacement for you, though if you later prepend the result with `base`, you need to remove that yourself.

## Improved error handling

Errors are handled inconsistently in SvelteKit 1. Some errors trigger the `handleError` hook but there is no good way to discern their status (for example, the only way to tell a 404 from a 500 is by seeing if `event.route.id` is `null`), while others (such as 405 errors for `POST` requests to pages without actions) don't trigger `handleError` at all, but should. In the latter case, the resulting `$page.error` will deviate from the [`App.Error`](types#Error) type, if it is specified.

SvelteKit 2 cleans this up by calling `handleError` hooks with two new properties: `status` and `message`. For errors thrown from your code (or library code called by your code) the status will be `500` and the message will be `Internal Error`. While `error.message` may contain sensitive information that should not be exposed to users, `message` is safe.

## Dynamic environment variables cannot be used during prerendering

The `$env/dynamic/public` and `$env/dynamic/private` modules provide access to _run time_ environment variables, as opposed to the _build time_ environment variables exposed by `$env/static/public` and `$env/static/private`.

During prerendering in SvelteKit 1, they are one and the same. This means that prerendered pages that make use of 'dynamic' environment variables are really 'baking in' build time values, which is incorrect. Worse, `$env/dynamic/public` is populated in the browser with these stale values if the user happens to land on a prerendered page before navigating to dynamically-rendered pages.

Because of this, dynamic environment variables can no longer be read during prerendering in SvelteKit 2 — you should use the `static` modules instead. If the user lands on a prerendered page, SvelteKit will request up-to-date values for `$env/dynamic/public` from the server (by default from a module called `/_app/env.js`) instead of reading them from the server-rendered HTML.

## `form` and `data` have been removed from `use:enhance` callbacks

If you provide a callback to [`use:enhance`](form-actions#Progressive-enhancement-use:enhance), it will be called with an object containing various useful properties.

In SvelteKit 1, those properties included `form` and `data`. These were deprecated some time ago in favour of `formElement` and `formData`, and have been removed altogether in SvelteKit 2.

## Forms containing file inputs must use `multipart/form-data`

If a form contains an `<input type="file">` but does not have an `enctype="multipart/form-data"` attribute, non-JS submissions will omit the file. SvelteKit 2 will throw an error if it encounters a form like this during a `use:enhance` submission to ensure that your forms work correctly when JavaScript is not present.

## Generated `tsconfig.json` is more strict

Previously, the generated `tsconfig.json` was trying its best to still produce a somewhat valid config when your `tsconfig.json` included `paths` or `baseUrl`. In SvelteKit 2, the validation is more strict and will warn when you use either `paths` or `baseUrl` in your `tsconfig.json`. These settings are used to generate path aliases and you should use [the `alias` config](@sveltejs-kit-vite#alias) option of the SvelteKit plugin in your `vite.config.js` instead, to also create a corresponding alias for the bundler.

## `getRequest` no longer throws errors

The `@sveltejs/kit/node` module exports helper functions for use in Node environments, including `getRequest` which turns a Node [`ClientRequest`](https://nodejs.org/api/http.html#class-httpclientrequest) into a standard [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object.

In SvelteKit 1, `getRequest` could throw if the `Content-Length` header exceeded the specified size limit. In SvelteKit 2, the error will not be thrown until later, when the request body (if any) is being read. This enables better diagnostics and simpler code.

## `vitePreprocess` is no longer exported from `@sveltejs/kit/vite`

Since `@sveltejs/vite-plugin-svelte` is now a peer dependency, SvelteKit 2 no longer re-exports `vitePreprocess`. You should import it directly from `@sveltejs/vite-plugin-svelte`.

## Updated dependency requirements

SvelteKit 2 requires Node `18.13` or higher, and the following minimum dependency versions:

- `svelte@4`
- `vite@5`
- `typescript@5`
- `@sveltejs/vite-plugin-svelte@3` (this is now required as a `peerDependency` of SvelteKit — previously it was directly depended upon)
- `@sveltejs/adapter-cloudflare@3` (if you're using these adapters)
- `@sveltejs/adapter-cloudflare-workers@2`
- `@sveltejs/adapter-netlify@3`
- `@sveltejs/adapter-node@2`
- `@sveltejs/adapter-static@3`
- `@sveltejs/adapter-vercel@4`

`svelte-migrate` will update your `package.json` for you.

As part of the TypeScript upgrade, the generated `tsconfig.json` (the one your `tsconfig.json` extends from) now uses `"moduleResolution": "bundler"` (which is recommended by the TypeScript team, as it properly resolves types from packages with an `exports` map in package.json) and `verbatimModuleSyntax` (which replaces the existing `importsNotUsedAsValues ` and `preserveValueImports` flags — if you have those in your `tsconfig.json`, remove them. `svelte-migrate` will do this for you).

## SvelteKit 2.12: $app/stores deprecated

SvelteKit 2.12 introduced `$app/state` based on the [Svelte 5 runes API](/docs/svelte/what-are-runes). `$app/state` provides everything that `$app/stores` provides but with more flexibility as to where and how you use it. Most importantly, the `page` object is now fine-grained, e.g. updates to `page.state` will not invalidate `page.data` and vice-versa.

As a consequence, `$app/stores` is deprecated and subject to be removed in SvelteKit 3. We recommend [upgrading to Svelte 5](/docs/svelte/v5-migration-guide), if you haven't already, and then migrate away from `$app/stores`. Most of the replacements should be pretty simple: Replace the `$app/stores` import with `$app/state` and remove the `$` prefixes from the usage sites.

```svelte
<script>
	---import { page } from '$app/stores';---
	+++import { page } from '$app/state';+++
</script>

---{$page.data}---
+++{page.data}+++
```

Use `npx sv migrate app-state` to auto-migrate most of your `$app/stores` usages inside `.svelte` components.

# Migrating to SvelteKit v3

SvelteKit 3 removes some legacy features, moves configuration out of `svelte.config.js` into the Vite plugin, and raises the minimum version of certain dependencies. For many of these breaking changes, you can automatically migrate:

```bash
npx sv migrate sveltekit-3
```

We recommend upgrading to the most recent 2.x version before upgrading to 3.0 so that you can take advantage of targeted deprecation warnings.

## Updated dependencies

SvelteKit 3 requires the following minimum versions:

- Node v22.17
- TypeScript v6
- Svelte v5.57.1
- Vite v8.0.12 (the first Vite 8 release bundling stable `rolldown` v1)
- `@sveltejs/vite-plugin-svelte` v7

Update the versions in your `package.json` and run your package manager's install command.

## Configuration

### svelte.config.js is no longer supported

Instead of declaring project configuration in `svelte.config.js`, it must now be passed to the `sveltekit` Vite plugin in `vite.config.js`. Options that previously lived under `config.kit.*` are now top-level plugin options, alongside things like `compilerOptions`:

```js
// @errors: 2307 ignore adapter auto types missing
/// file: vite.config.js
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-auto';

export default defineConfig({
	plugins: [
+++		sveltekit({
			compilerOptions: { experimental: { async: true }},
			adapter: adapter()
		})+++
	]
});
```

See the [configuration docs](@sveltejs-kit-vite) for further examples.

### Removed options

The following options are obsolete and should be removed from your `vite.config.js`:

- `files.lib` ([details](#$lib-is-now-lib))
- `experimental.handleRenderingErrors` is no longer required ([details](#Error-handling-Rendering-errors-are-now-handled))
- `experimental.instrumentation` is no longer required ([details](#Observability))
- `experimental.tracing` is now a top level `tracing` option ([details](#Observability))
- `vitePlugin` is removed — pass `vite-plugin-svelte` options like `inspector` directly to the plugin instead
- `preloadStrategy` is removed — `modulepreload` is now supported everywhere and so is always used
- `prerender.origin` is removed in favour of `paths.origin`
- `csrf.checkOrigin` is removed in favour of `csrf.trustedOrigins`

### Added options

- `output.linkHeaderPreload` determines whether to use `Link` HTTP headers to preload resources like `.js` and `.css` files rather than injecting `<link>` elements in the rendered HTML. This can cause issues when the headers grow too large, so SvelteKit 3 uses `<link>` elements by default instead.
- `csrf.trustedOrigins` allows you to specify external origins that are allowed to make form submissions.
- `paths.origin` replaces `prerender.origin`, and should reflect your app's public-facing origin if it can't reliably be derived from request headers (for example because it's behind a reverse proxy). It will be used for CSRF checks on form submissions and remote function calls. If using `adapter-node`, this takes precedence over the `ORIGIN` environment variable.

### Changed options

- `version.pollInterval` now defaults to one hour, meaning SvelteKit will periodically check for new deployments and set [`updated.current`]($app-state#updated) to `true` accordingly. Previously, no polling occurred by default.

## `$lib` is now `#lib`

The `$lib` alias is no longer generated automatically by SvelteKit. It is replaced by a `#lib` alias that you declare in the [`imports`](https://nodejs.org/api/packages.html#subpath-imports) field of your `package.json`, leveraging Node's built-in subpath imports (which Vite and TypeScript resolve natively). Add this to your `package.json`...

```json
/// file: package.json
{
	"imports": {
		"#lib": "./src/lib/index.js",
		"#lib/*": "./src/lib/*"
	}
}
```

...and replace `$lib` with `#lib` across your codebase. Note that you will also have to add the module extensions (e.g. `.js` or `.ts`) to these imports.

```js
// @errors: 2307 imported module has no types
---import { foo } from '$lib/foo';---
+++import { foo } from '#lib/foo.js';+++
```

## `$app/environment` (renamed)

The `$app/environment` module has been renamed to [`$app/env`]($app-env). It can now be imported inside your service worker, where previously if you needed to access `version` you would use the now-removed [`$service-worker`](<#$service-worker-(removed)>) module.

## `$app/forms`

Forms with [`use:enhance`]($app-forms#enhance) that specify an `action` on a different page will navigate to that page upon submission, rather than staying on the current page. This ensures that the enhanced behaviour more closely matches the native, non-enhanced behaviour.

## `$app/manifest`

A new [`$app/manifest`]($app-manifest) module gives you access to metadata about your app. You can import this anywhere in your app, including in service workers for offline caching purposes, for which you would previously use the now-removed [`$service-worker`](<#$service-worker-(removed)>) module.

## `$app/navigation`

### Changes to shallow routing

For [shallow routing](shallow-routing), `pushState/replaceState` are deprecated in favor of [`goto`]($app-navigation#goto):

```js
const state = {};
import { goto } from '$app/navigation';
// ---cut---
// instead of this...
---pushState('/foo', state);---
---replaceState('/bar', state);---

// ...do this:
+++goto('/foo', { shallow: true, state });+++
+++goto('/bar', { shallow: true, replace: true, state });+++
```

A new `persistState: true` option will cause `page.state` to be reapplied following a page reload.

Shallow routing now triggers navigation hooks ([`beforeNavigate`]($app-navigation#beforeNavigate), [`onNavigate`]($app-navigation#onNavigate) and [`afterNavigate`]($app-navigation#afterNavigate)). You can filter them out by checking the `shallow` property of the object passed to those navigation hooks.

### `invalidateAll` is deprecated in favour of `refreshAll`

`invalidateAll` is deprecated in favour of [`refreshAll`]($app-navigation#refreshAll). The difference is that `refreshAll` does _not_ reset `page.state` to an empty object, which is usually what you want when using [shallow routing](shallow-routing).

Additionally, calling `invalidateAll()` or `invalidate(...)` during an in-flight navigation no longer aborts that navigation.

### `goto` options are updated

In addition to the new `shallow` option described [above](#$app-navigation-Changes-to-shallow-routing), various [`goto`]($app-navigation#goto) options have changed:

- `invalidateAll` is now `refreshAll`, to mirror the [above change](#$app-navigation-invalidateAll-is-deprecated-in-favour-of-refreshAll)
- `keepFocus: true` and `noScroll: true` have been combined as `reset: false`
- `replaceState` is now `replace`

### `goto` rejects for URLs that don't resolve to a route

`goto(...)` now rejects when called with a URL that does not resolve to a route within the app, matching the existing behaviour for external URLs. To navigate to an external URL, use `window.location.href = url`.

### `delta` only exists for `popstate` navigations

The `delta` property on navigation events ([`beforeNavigate`]($app-navigation#beforeNavigate), [`onNavigate`]($app-navigation#onNavigate) and [`afterNavigate`]($app-navigation#afterNavigate)) now only exists for `popstate` navigations (back/forward). It is `undefined` for all other navigation types.

### `preloadData` can return an `error` result

`preloadData(...)` now returns `{ type: 'error', status, error }` when the target page fails to load, instead of returning `{ type: 'loaded' }` with a 200 status. The `'redirect'` result now also includes the correct `status`. Add an `error` branch to any code that consumes the result:

```js
import { preloadData } from '$app/navigation';
const url = '/somewhere';
// ---cut---
const result = await preloadData(url);

if (result.type === 'loaded') {
	// ...
+++} else if (result.type === 'error') {
	// do something in case of an error
}+++
```

## `$app/paths`

### `base`, `assets`, and `resolveRoute` removed

The deprecated `base`, `assets`, and `resolveRoute` exports have been removed from [`$app/paths`]($app-paths). Use [`asset`]($app-paths#asset) and [`resolve`]($app-paths#resolve) instead:

```js
let base = '';
let assets = '';
let slug = '';
import { asset, resolve } from '$app/paths';
// ---cut---
// instead of this...
---const pathname = base + resolveRoute('/blog/[slug]', { slug });---
---const file = assets + '/foo.png';---

// ...do this:
+++const pathname = resolve('/blog/[slug]', { slug });+++
+++const file = asset('foo.png');+++
```

The `Pathname` and `Asset` types have also been renamed to `Path` and `AssetPath`, and the leading `/` has been removed from those types — so `asset('/foo.png')` should now be `asset('foo.png')`, and pathnames passed to `resolve` no longer start with `/` (e.g. `resolve('blog/hello-world')`). Only route IDs start with `/` now.

### Service workers can now import `$app/paths`

Previously, you needed to import `base` from the now-removed [`$service-worker`](<#$service-worker-(removed)>) module. You can now use [`asset(...)`]($app-paths#asset) and [`resolve(...)`]($app-paths#resolve) from `$app/paths`.

## `$app/service-worker`

A new [`$app/service-worker`]($app-service-worker) provides type-safe access to the service worker execution context in your `src/service-worker/index.ts`, provided you have a `src/service-worker/tsconfig.json` that extends [`$app/tsconfig/service-worker`](#$app-tsconfig-service-worker).

## `$app/state`

### `page.url` is now readonly

`page.url` is now typed as a `ReadonlyURL` with `ReadonlyURLSearchParams`, so mutating it — e.g. `page.url.searchParams.set(...)` or assigning to `page.url.pathname` — is now a type error. If you need a mutable URL, copy it first:

```js
const url = +++new URL(page.url.href);+++
url.searchParams.set('q', 'svelte');
```

### `updated` updates automatically

The `updated.current` property becomes `true` when SvelteKit detects that a new version of the app has been deployed. Previously, this would only happen following a manual `updated.check()`, or after a failed navigation. In SvelteKit 3 it happens more frequently:

- on any navigation that results in data being fetched from the server
- on any remote function call
- when the window becomes visible or focused (e.g. when switching back from another tab)
- after a polling interval (which now defaults to one hour)

Note that if you use a feature like Vercel's [skew protection](adapter-vercel#Skew-protection), passive detection on navigation and remote functions may report false negatives, since the request will be handled by the earlier deployment. Polling and event-based checks will still work, since they bypass skew protection.

## `$app/stores` (removed)

The `$app/stores` module (which exports the `$page`, `$navigating`, and `$updated` stores) has been removed. Use [`$app/state`]($app-state) instead, which provides fine-grained Svelte 5 [state](../svelte/$state), and remove the `$` prefix when reading values (i.e. `page` rather than `$page`):

```svelte
<script>
	import { page } from +++'$app/state'+++;
</script>

<p>current pathname: {page.url.pathname}</p>
```

## `$app/tsconfig`

Your project's `tsconfig.json` should now extend `$app/tsconfig` rather than `./.svelte-kit/tsconfig.json`. It should also specify `include` and `exclude` arrays, as `$app/tsconfig` does not specify these:

```json
/// file: tsconfig.json
{
	"extends": "$app/tsconfig",
	"include": ["src", "test", "*"],
	"exclude": ["src/service-worker"]
}
```

Some essential `compilerOptions` (`isolatedModules` and `verbatimModuleSyntax`) are included in `$app/tsconfig`, alongside various options that are strongly recommend but which can be overridden in your own config.

## `$app/tsconfig/service-worker`

Your service worker needs to be part of a separate TypeScript project, otherwise the types for things like `fetch` events will be incorrect. To do this, exclude the service worker from your project's root `tsconfig.json`, and add a `src/service-worker/tsconfig.json` that extends `$app/tsconfig/service-worker`:

```json
/// file: src/service-worker/tsconfig.json
{
	"extends": "$app/tsconfig/service-worker"
}
```

## `$env/...` (deprecated)

The various `$env/...` modules have been deprecated in favour of `$app/env/private` and `$app/env/public` — see [Environment variables](environment-variables) for more details.

## `$service-worker` (removed)

The `$service-worker` module has been removed. Import `version` from [`$app/env`]($app-env), `assets`, `immutable` and `prerendered` from [`$app/manifest`]($app-manifest), and `resolved` from [`$app/paths`]($app-paths) instead.

## `@sveltejs/kit`

### `error`, `isHttpError`, `redirect`, and `isRedirect` refer to public types

`error`, `isHttpError`, `redirect`, and `isRedirect` now refer to the public types rather than the internal classes. If you were importing the internal `HttpError`/`Redirect` classes from `@sveltejs/kit/internal`, or doing `instanceof` checks against them, use `isHttpError`/`isRedirect` from `@sveltejs/kit` instead.

### `json` and `text` are deprecated

The `json(...)` and `text(...)` helpers for generating responses are deprecated. Use `Response.json(...)` and `new Response(text)` instead.

### `defineParams` moved to `@sveltejs/kit/params`

The `defineParams` function for creating [param matchers](advanced-routing#Matching), along with the associated types, now live in [`@sveltejs/kit/params`](@sveltejs-kit-params).

### Env-related types moved to `@sveltejs/kit/env`

Types like `EnvVarConfig`, used with [`defineEnvVars`](@sveltejs-kit-env#defineEnvVars) hook, now live in `@sveltejs/kit/env`.

### Hooks-related types moved to `@sveltejs/kit/hooks`

Types like `Handle`, which defines the type of your [`handle`](hooks#handle) hook, now live in `@sveltejs/kit/hooks`.

### Remote function types moved to `$app/server`

Types describing remote functions, such as `RemoteQuery`, `RemoteForm` and `RemoteCommand`, now live in `$app/server` alongside the functions themselves.

## `@sveltejs/kit/hooks`

The `defineEnvVars` function has moved from `@sveltejs/kit/hooks` to `@sveltejs/kit/env`.

## `@sveltejs/kit/node`

The [`getRequest`](@sveltejs-kit-node#getRequest) and [`setResponse`](@sveltejs-kit-node#setResponse) helpers are now synchronous and no longer return Promises. Remove `await` from calls in custom Node servers or adapters.

## `@sveltejs/kit/node/polyfills` (removed)

The `@sveltejs/kit/node/polyfills` module (and the Node global shims in `adapter-node` and `adapter-netlify`) applied to Node versions that are no longer supported. Remove any `import '@sveltejs/kit/node/polyfills'` statements from your custom server code.

## Security

### `csrf.checkOrigin` replaced by `csrf.trustedOrigins`

The deprecated `csrf.checkOrigin` option has been removed. CSRF protection is always on; instead of disabling it with `checkOrigin: false`, allow trusted cross-origin hosts with `csrf.trustedOrigins`.

```js
/// file: vite.config.js
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
// ---cut---
export default defineConfig({
	plugins: [
		sveltekit({
			csrf: {
				---checkOrigin: false---
				+++trustedOrigins: ['https://trusted-site.com']+++
			}
		})
	]
});
```

### Cross-origin form submissions require a `Content-Type` header

Cross-origin mutative requests that omit a `Content-Type` header are now rejected as CSRF. Ensure cross-origin form submissions include a `Content-Type` header, or add the origin to `csrf.trustedOrigins`.

### CORS for static assets in development is handled by Vite

SvelteKit no longer sets `access-control-allow-origin: *` on every static asset request in development. CORS is now delegated to Vite's built-in middleware. If you rely on cross-origin access to static assets in dev, configure it in your Vite config:

```js
/// file: vite.config.js
import { defineConfig } from 'vite';
// ---cut---
export default defineConfig({
	server: {
+++		cors: { origin: '*' }+++
	}
});
```

## Cookies

### Updated to `cookie` v2

SvelteKit now uses [`cookie`](https://npmx.dev/package/cookie) v2, which involves certain changes:

- cookie names can only contain ASCII characters. Non-ASCII characters (including Latin-1 Supplement characters like `á`) are rejected
- the `CookieSerializeOptions` type has been renamed to `SerializeOptions`
- the `CookieParseOptions` type has been renamed to `ParseOptions`

### Paths default to `'/'`

When setting a cookie without an explicit `path` (which was previously forbidden), the path defaults to `'/'` rather than the current request path, meaning the cookie applies to the entire site. This matches what most developers expect. You can pass an explicit `path` if necessary:

```ts
declare const cookies: import('@sveltejs/kit').Cookies;
declare const name: string;
declare const value: string;
// ---cut---
cookies.set(name, value, +++{ path: '/some/path' }+++);
```

## Error handling

### `App.Error` always includes `status`

An `App.Error` object, such as the `error` prop of an `+error.svelte` component, has a `status` property reflecting the HTTP status of the error that caused it (e.g. 404 for a Not Found error, or 500 for a generic internal error), in addition to `message` and whatever properties you define in your [`app.d.ts`](types#app.d.ts) file.

### `error(...)` arguments changed

Previously, the second argument to [`error(...)`](@sveltejs-kit#error) could be either the `message` as a `string`, or an object containing `message` alongside any additional properties defined in `app.d.ts` (such as a tracking `code`).

Now, the second argument must always be a `string`. If there are additional properties, they must be passed as a third argument.

### `handleValidationError` is removed

Validation errors are now passed to [`handleError`](hooks#handleError) with `kind: 'validation'`. The generic `{ status, message }` `error` object is safe to return, while the validation `issues` are provided separately for logging or custom handling.

### `handleError` receives all errors

In SvelteKit 2, `handleError` was not called in the case of _expected_ errors, which is to say those created with the [`error(...)`](@sveltejs-kit#error) helper. In SvelteKit 3, _all_ errors are passed to `handleError`. See the [docs](hooks#handleError) for more information.

### `handleError` can influence the status code

If you need to control the HTTP status code used to render a page in the case of an error, you can do so by returning a `status` property from `handleError` alongside any other required properties of `App.Error`.

### Rendering errors are now handled

Errors thrown during rendering are now always routed through `handleError` and then passed to the nearest [error boundary](../svelte/svelte-boundary). Error boundaries are automatically created for each of your `+error.svelte` components.

If you have an async `handleError` hook in `hooks.client.ts`, enable `compilerOptions.experimental.async` in the `sveltekit(...)` plugin options of your Vite config so it can be awaited during rendering.

### Form action responses use the `fail` status code

Enhanced form action responses now use the HTTP status code passed to `fail(...)` instead of always returning `200`. If you inspect status codes on enhanced form submissions (for example in a `use:enhance` callback or in tests), they now reflect the value passed to `fail`.

### Sourcemaps are applied

Sourcemaps are generated by default, and applied to stack traces when errors occur. For this to work in production (as opposed to `vite preview`), adapters need to avoid any destructive changes (such as rebundling without generating additional — and correct — sourcemaps). For first-party adapters this is a work in progress.

## Params

[Param matchers](advanced-routing#Matching) are no longer files inside the `src/params` directory. Declare all matchers in a single `src/params.ts` (or `src/params.js`) file using the `defineParams` helper. A matcher can be a function that returns a parsed value (or `undefined`, if the param does not match), or a [Standard Schema](https://standardschema.dev).

```js
/// file: src/params.js
import { defineParams } from '@sveltejs/kit/params';
import * as v from 'valibot';

export const params = defineParams({
	// schema variant
	integer: v.pipe(v.string(), v.toNumber()),

	// function variant
	fruit: (param) => {
		if (param === 'apple' || param === 'orange') {
			return param;
		}
	}
});
```

## Observability

Server-side [instrumentation](observability) now happens automatically if a `src/instrumentation.server.js` file exists.

To opt into [OpenTelemetry](https://opentelemetry.io/) tracing, add `tracing.server` configuration:

```js
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
/// file: vite.config.js
// ---cut---
export default defineConfig({
	plugins: [
		sveltekit({
			+++tracing: { server: true }+++
		})
	]
});
```

## Adapters

All first-party adapters now require SvelteKit 3, alongside these adapter-specific changes:

### `adapter-cloudflare`

Cloudflare-specific APIs are no longer available on `platform`. Instead, find them where you would expect on a Cloudflare worker:

- `env`, `ctx.waitUntil`, and other `ctx` properties should be imported from `cloudflare:workers`:
```js
// @filename: ambient.d.ts
declare module 'cloudflare:workers' {
	export const env: { KV: { get(): Promise<unknown> } };
	export function waitUntil(promise: Promise<any>): void;
}
// ---cut---
import { env, waitUntil } from 'cloudflare:workers';

const value = await env.KV.get('key');
```
- `cf` is now a property of the `Request` object:
```js
/// file: src/routes/cf/+server.js
// @filename: ambient.d.ts
interface Request {
  cf: import('@cloudflare/workers-types').IncomingRequestCfProperties;
}
// @filename: index.js
// @errors: 7031
// ---cut---
export async function GET({ request }) {
	const { country } = request.cf;
}
```
- `caches` is now a global variable:
```js
/// file: src/routes/cache/+server.js
let request = new Request('');
// ---cut---
const myCache = await caches.open('foo');
await myCache.match(request);
```

- To make these types available to your app, install [`wrangler`](https://www.npmjs.com/package/wrangler) and run [`wrangler types`](https://developers.cloudflare.com/workers/languages/typescript/).

- minimum `wrangler` is now `^4.67.0`
- `@cloudflare/workers-types` upgraded

### `adapter-node`

- bundling now happens with `rolldown`
- static assets are served from a list recorded at build time; files added to the output directory afterwards are not served, and replaced ones keep their old size and `ETag` (use environment variables for runtime configuration)
- `ETag`s for static assets are content hashes, and `Last-Modified` is no longer sent
- only `GET` and `HEAD` requests are served static assets; other methods result in a 405 response

### `adapter-netlify`

- output now conforms to the stable [Netlify Frameworks API](https://docs.netlify.com/build/frameworks/frameworks-api/)
- deploying/previewing with the Netlify CLI requires `v17.31.0` or later (`npm i -g netlify-cli@latest`)
- edge function build target is `es2022`
- the publish directory is now an adapter option rather than being read from the `netlify.toml` file

### `adapter-vercel`

- the `edge` runtime is no longer supported

### Adapter API changes

For adapter authors, there are some additional changes:

- adapters can augment the Vite config with additional plugins
- `builder.config.kit` no longer exists — the configuration now lives at the top level
- `builder.createEntries` has been removed — use `builder.writeClient`, `builder.writeServer` and `builder.writePrerendered` directly
- `builder.compress` returns a list of compressed files
- `builder.mkdirp` and `builder.rimraf` are deprecated in favour of `node:fs` methods
- `builder.generateManifest` has been removed — use `builder.generateServerInstance` to replace it, and `builder.manifest` to access the manifest
- the `Server` class exported from the server output is deprecated — use the `server` object written by `builder.generateServerInstance`

#### Server instrumentation

Adapters that use `builder.instrument` must now generate an environment initializer before any
bundling step, include the returned module as an entrypoint in that step, and pass its final path to
`builder.instrument`:

```js
// @filename: ambient.d.ts
import { Builder } from '@sveltejs/kit';

declare global {
	const builder: Builder;
	const temporary_directory: string;
	const entrypoint: string;
	const instrumentation: string;
}

export {};

// @filename: index.js
// ---cut---
const initializer = builder.createInstrumentationInitializer({ outputDirectory: temporary_directory });

// Include `initializer` in any bundling or file tracing here

builder.instrument({
	entrypoint,
	instrumentation,
	initializer
});
```

For runtimes that do not expose environment variables through `process.env`, pass the contents of
a module whose default export is the platform environment:

```js
// @filename: ambient.d.ts
import { Builder } from '@sveltejs/kit';

declare global {
	const builder: Builder;
	const temporary_directory: string;
}

export {};

// @filename: index.js
// ---cut---
const initializer = builder.createInstrumentationInitializer({
	outputDirectory: temporary_directory,
	environment: `import { env } from 'cloudflare:workers';\nexport default env;`
});
```

## Responses

### 204 responses return no content

Returning a `204` (or any empty `2xx`) response from a `+server.js` handler now results in a response with no body, per the HTTP spec, rather than a SvelteKit envelope. Code that consumed the body of such responses needs to handle the empty body.

### `resolve` always returns a `Promise`

The `resolve` function passed to [`handle`](hooks#handle) is now typed to always return a `Promise<Response>` rather than `MaybePromise<Response>`.

## Server-only modules

### Files

Server-only modules are now designated by a filename with a `server` segment, rather than a `.server.` infix — in other words, `stuff.server.ts`, `stuff.server.test.ts` and `server.ts` are all treated as server-only modules, whereas `server.ts` previously was not.

### Directories

Previously, any module inside `src/lib/server` was treated as server-only. This treatment now applies to _any_ `server` directory in the project with the exception of `src/routes` and your `static` directory.

## Remote functions

Remote functions are still considered experimental — opt in via the `experimental.remoteFunctions` flag alongside `compilerOptions.experimental.async`:

```js
/// file: vite.config.js
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
// ---cut---
export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				experimental: {
					+++async: true+++
				}
			},
			experimental: {
				+++remoteFunctions: true+++
			}
		})
	]
});
```

### Remote module filenames

As with server-only modules, a `remote` segment in a filename designates a remote module — `stuff.remote.ts`, `stuff.remote.test.ts` and `remote.ts` are all remote modules.

If `experimental.remoteFunctions` is not enabled, the existence of these files will cause an error.

### `event.url`, `event.params`, and `event.route` cannot be accessed inside queries

Accessing `event.url`, `event.params`, or `event.route` inside a remote `query` function now throws an error. These properties are not meaningful in the context of a remote function (which can be called from anywhere). Pass any values you need explicitly as arguments to the function.

### Errors are typed as `App.Error | undefined`

The `error` property on remote function resources (queries, live queries, forms, prerender functions) is now typed as `App.Error | undefined` rather than `any`, as the error is always transformed by `handleError`.

### Form submissions require `field.as(...)`

A form control must use attributes from a field associated with the current `form` object:

```svelte
<input {...myform.fields.message.as('text')}>
```

Manually specifying a name (`<input name="message">`) will cause the submission to be rejected.

## Miscellaneous

### Links to the current page cause a refresh

If the user clicks a link that points to the current location, SvelteKit will `refreshAll()` instead of doing nothing.

### `data-sveltekit-*` uses `false` instead of `'off'`

The `'off'` value for `data-sveltekit-*` link attributes has been removed in favour of `false`.

```svelte
---<a href="..." data-sveltekit-preload-data="off">---
+++<a href="..." data-sveltekit-preload-data="false">+++
```

### External redirects must be opted into

To [`redirect`](@sveltejs-kit#redirect) to an external URL you must now pass an `external` option — either `true` to allow any external URL (except `javascript:` URLs, which remain blocked), or an array of allowed origins (which _can_ include `javascript:` URLs).

```js
import { redirect } from '@sveltejs/kit';
// ---cut---
redirect(307, 'https://example.com', +++{ external: true }+++);
```

### Universal `config` takes precedence over server `config`

Route `config` exported from a universal `+page.js` or `+layout.js` now takes precedence over `config` exported from the corresponding `+page.server.js` or `+layout.server.js`, matching how other page options are resolved. If you export `config` from both, move the canonical export to the universal file or consolidate them.

### Service worker registrations use `type: 'module'`

Module service workers are now widely supported. As such, SvelteKit will bundle and register your service worker as a module, rather than as a script.

# Additional resources

## FAQs

Please see the [SvelteKit FAQ](faq) for solutions to common issues and helpful tips and tricks.

The [Svelte FAQ](../svelte/faq) and [`vite-plugin-svelte` FAQ](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/faq.md) may also be helpful for questions deriving from those libraries.

## Examples

We've written and published a few different SvelteKit sites as examples:

- [`sveltejs/realworld`](https://github.com/sveltejs/realworld) contains an example blog site
- [A HackerNews clone](https://github.com/sveltejs/sites/tree/master/sites/hn.svelte.dev)
- [`svelte.dev`](https://github.com/sveltejs/svelte.dev)

SvelteKit users have also published plenty of examples on GitHub, under the [#sveltekit](https://github.com/topics/sveltekit) and [#sveltekit-template](https://github.com/topics/sveltekit-template) topics, as well as on [the Svelte Society site](https://sveltesociety.dev/recipe/sveltekit-templates-and-examples-e789ed397e7f38fc). Note that these have not been vetted by the maintainers and may not be up to date.

## Support

You can ask for help on [Discord](/chat) and [StackOverflow](https://stackoverflow.com/questions/tagged/sveltekit). Please first search for information related to your issue in the FAQ, Google or another search engine, issue tracker, and Discord chat history in order to be respectful of others' time. There are many more people asking questions than answering them, so this will help in allowing the community to grow in a scalable fashion.

# Glossary

The core of SvelteKit provides a highly configurable rendering engine. This section describes some of the terms used when discussing rendering. A reference for setting these options is provided in the documentation above.

## CSR

Client-side rendering (CSR) is the generation of the page contents in the web browser using JavaScript.

In SvelteKit, client-side rendering will be used by default, but you can turn off JavaScript with [the `csr = false` page option](page-options#csr).

## Edge

Rendering on the edge refers to rendering an application in a content delivery network (CDN) near the user. Edge rendering allows the request and response for a page to travel a shorter distance thus improving latency.

## Hybrid app

SvelteKit uses a hybrid rendering mode by default where it loads the initial HTML from the server (SSR), and then updates the page contents on subsequent navigations via client-side rendering (CSR).

## Hydration

Svelte components store some state and update the DOM when the state is updated. When fetching data during SSR, by default SvelteKit will store this data and transmit it to the client along with the server-rendered HTML. The components can then be initialized on the client with that data without having to call the same API endpoints again. Svelte will then check that the DOM is in the expected state and attach event listeners in a process called hydration. Once the components are fully hydrated, they can react to changes to their properties just like any newly created Svelte component.

In SvelteKit, pages will be hydrated by default, but you can turn off JavaScript with [the `csr = false` page option](page-options#csr).

## ISR

Incremental static regeneration (ISR) allows you to generate static pages on your site as visitors request those pages without redeploying. This may reduces build times compared to [SSG](#SSG) sites with a large number of pages. You can do [ISR with `adapter-vercel`](adapter-vercel#Incremental-Static-Regeneration).

## MPA

Traditional applications that render each page view on the server — such as those written in languages other than JavaScript — are often referred to as multi-page apps (MPA).

## Prerendering

Prerendering means computing the contents of a page at build time and saving the HTML for display. This approach has the same benefits as traditional server-rendered pages, but avoids recomputing the page for each visitor and so scales nearly for free as the number of visitors increases. The tradeoff is that the build process is more expensive and prerendered content can only be updated by building and deploying a new version of the application.

For content to be prerenderable, any two users hitting it directly must get the same content from the server, and the page must not contain [actions](form-actions). Note that you can still prerender content that is loaded based on the page's parameters as long as all users will be seeing the same prerendered content. Prerendering all of your pages is also known as [Static Site Generation](#SSG).

Pre-rendered pages are not limited to static content. You can build personalized pages if user-specific data is fetched and rendered client-side. This is subject to the caveat that you will experience the downsides of not doing SSR for that content as discussed above.

In SvelteKit, you can control prerendering with [the `prerender` page option](page-options#prerender) and [`prerender` config](@sveltejs-kit-vite#prerender) of the SvelteKit plugin in `vite.config.js`.


## PWA

A progressive web app (PWA) is an app that's built using web APIs and technologies, but functions like a mobile or desktop app. Sites served as [PWAs can be installed](https://web.dev/learn/pwa/installation), allowing you to add a shortcut to the application on your launcher, home screen, or start menu. Many PWAs will utilize [service workers](service-workers) to build offline capabilities.

## Routing

By default, when you navigate to a new page (by clicking on a link or using the browser's forward or back buttons), SvelteKit will intercept the attempted navigation and handle it instead of allowing the browser to send a request to the server for the destination page. SvelteKit will then update the displayed contents on the client by rendering the component for the new page, which in turn can make calls to the necessary API endpoints. This process of updating the page on the client in response to attempted navigation is called client-side routing.

In SvelteKit, client-side routing will be used by default, but you can skip it with [`data-sveltekit-reload`](link-options#data-sveltekit-reload).

## SPA

A single-page app (SPA) is an application in which all requests to the server load a single HTML file which then does client-side rendering based on the requested URL. All navigation is handled on the client-side in a process called client-side routing with per-page contents being updated and common layout elements remaining largely unchanged. Throughout this site, when we refer to a SPA, we use this definition where a SPA simply serves an empty shell on the initial request. It should not be confused with a [hybrid app](#Hybrid-app), which serves HTML on the initial request. It has a large performance impact by forcing two network round trips before rendering can begin. Because SPA mode has large negative performance and SEO impacts, it is recommended only in very limited circumstances such as when being wrapped in a mobile app.

In SvelteKit, you can [build SPAs with `adapter-static`](single-page-apps).

## SSG

Static Site Generation (SSG) is a term that refers to a site where every page is prerendered. One benefit of fully prerendering a site is that you do not need to maintain or pay for servers to perform SSR. Once generated, the site can be served from CDNs, leading to great “time to first byte” performance. This delivery model is often referred to as JAMstack.

In SvelteKit, you can do static site generation by using [`adapter-static`](adapter-static) or by configuring every page to be [prerendered](#Prerendering) using [the `prerender` page option](page-options#prerender) or [`prerender` config](@sveltejs-kit-vite#prerender) of the SvelteKit plugin in `vite.config.js`.

## SSR

Server-side rendering (SSR) is the generation of the page contents on the server. Returning the page contents from the server via SSR or prerendering is highly preferred for performance and SEO. It significantly improves performance by avoiding the introduction of extra round trips necessary in a SPA, and makes your app accessible to users if JavaScript fails or is disabled (which happens [more often than you probably think](https://kryogenix.org/code/browser/everyonehasjs.html)). While some search engines can index content that is dynamically generated on the client-side, it is likely to take longer even in these cases.

In SvelteKit, pages are server-side rendered by default. You can disable SSR with [the `ssr` page option](page-options#ssr).

# @sveltejs/kit

```js
// @noErrors
import {
	VERSION,
	error,
	fail,
	invalid,
	isActionFailure,
	isHttpError,
	isRedirect,
	isValidationError,
	json,
	normalizeUrl,
	redirect,
	text
} from '@sveltejs/kit';
```

## VERSION

<div class="ts-block">

```dts
const VERSION: string;
```

</div>



## error

Throws an error with a HTTP status code and an optional message.
When called during request handling, this will cause SvelteKit to
return an error response; the error will be passed to `handleError` as an _expected_ error.
Make sure you're not catching the thrown error, which would prevent SvelteKit from handling it.

<div class="ts-block">

```dts
function error(
	status: {
		status: number;
		message: string;
	} extends App.Error
		? number
		: never,
	message?: string | undefined
): never;
```

</div>

<div class="ts-block">

```dts
function error(
	status: number,
	message: string,
	properties: keyof Omit<
		App.Error,
		'status' | 'message'
	> extends never
		? never
		: Omit<App.Error, 'status' | 'message'>
): never;
```

</div>

<div class="ts-block">

```dts
function error(
	status: number,
	properties: Omit<App.Error, 'status'> & {
		status?: App.Error['status'];
	}
): never;
```

</div>



## fail

Create an `ActionFailure` object. Call when form submission fails.

<div class="ts-block">

```dts
function fail(status: number): ActionFailure<undefined>;
```

</div>

<div class="ts-block">

```dts
function fail<T = undefined>(
	status: number,
	data: T
): ActionFailure<T>;
```

</div>



## invalid

<blockquote class="since note">

Available since 2.47.3

</blockquote>

Use this to throw a validation error to imperatively fail form validation.
Can be used in combination with `issue` passed to form actions to create field-specific issues.

```ts
import { invalid } from '@sveltejs/kit';
import { form } from '$app/server';
import { tryLogin } from '#lib/server/auth';
import * as v from 'valibot';

export const login = form(
	v.object({ name: v.string(), _password: v.string() }),
	async ({ name, _password }) => {
		const success = tryLogin(name, _password);
		if (!success) {
			invalid('Incorrect username or password');
		}

		// ...
	}
);
```

<div class="ts-block">

```dts
function invalid(
	...issues: (StandardSchemaV1.Issue | string)[]
): never;
```

</div>



## isActionFailure

Checks whether this is an action failure thrown by `fail`.

<div class="ts-block">

```dts
function isActionFailure(
	e: unknown
): e is ActionFailure<undefined>;
```

</div>



## isHttpError

Checks whether this is an error thrown by `error`.

<div class="ts-block">

```dts
function isHttpError<T extends number>(
	e: unknown,
	status?: T
): e is HttpError & {
	status: T extends undefined ? never : T;
};
```

</div>



## isRedirect

Checks whether this is a redirect thrown by `redirect`.

<div class="ts-block">

```dts
function isRedirect(e: unknown): e is Redirect;
```

</div>



## isValidationError

<blockquote class="since note">

Available since 2.47.3

</blockquote>

Checks whether this is a validation error thrown by `invalid`.

<div class="ts-block">

```dts
function isValidationError(
	e: unknown
): e is ValidationError;
```

</div>



## json

<blockquote class="tag deprecated note">

use `Response.json`

</blockquote>

Create a JSON `Response` object from the supplied data.

<div class="ts-block">

```dts
function json(data: any, init?: ResponseInit): Response;
```

</div>



## normalizeUrl

<blockquote class="since note">

Available since 2.18.0

</blockquote>

Strips possible SvelteKit-internal suffixes and trailing slashes from the URL pathname.
Returns the normalized URL as well as a method for adding the potential suffix back
based on a new pathname (possibly including search) or URL.
```js
// @errors: 7031
import { normalizeUrl } from '@sveltejs/kit';

const { url, denormalize } = normalizeUrl('/blog/post/__data.json');
console.log(url.pathname); // /blog/post
console.log(denormalize('/blog/post/a')); // /blog/post/a/__data.json
```

<div class="ts-block">

```dts
function normalizeUrl(url: URL | string): {
	url: URL;
	wasNormalized: boolean;
	denormalize: (url?: string | URL) => URL;
};
```

</div>



## redirect

Redirect a request. When called during request handling, SvelteKit will return a redirect response.
Make sure you're not catching the thrown redirect, which would prevent SvelteKit from handling it.

Most common status codes:
 * `303 See Other`: redirect as a GET request (often used after a form POST request)
 * `307 Temporary Redirect`: redirect will keep the request method
 * `308 Permanent Redirect`: redirect will keep the request method, SEO will be transferred to the new page

[See all redirect status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status#redirection_messages)

<div class="ts-block">

```dts
function redirect(
	status:
		| 300
		| 301
		| 302
		| 303
		| 304
		| 305
		| 306
		| 307
		| 308
		| ({} & number),
	location: string | URL,
	options?: {
		external?: boolean | string[];
	}
): never;
```

</div>



## text

<blockquote class="tag deprecated note">

use `new Response`

</blockquote>

Create a `Response` object from the supplied body.

<div class="ts-block">

```dts
function text(body: string, init?: ResponseInit): Response;
```

</div>



## Action

Shape of a form action method that is part of `export const actions = {...}` in `+page.server.js`.
See [form actions](/docs/kit/form-actions) for more information.

<div class="ts-block">

```dts
type Action<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	OutputData extends Record<string, any> | void = Record<
		string,
		any
	> | void,
	RouteId extends AppRouteId | null = AppRouteId | null
> = (
	event: RequestEvent<Params, RouteId>
) => MaybePromise<OutputData>;
```

</div>

## ActionFailure

<div class="ts-block">

```dts
interface ActionFailure<T = undefined> {/*…*/}
```

<div class="ts-block-property">

```dts
status: number;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
data: T;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
[uniqueSymbol]: true;
```

<div class="ts-block-property-details"></div>
</div></div>

## Actions

Shape of the `export const actions = {...}` object in `+page.server.js`.
See [form actions](/docs/kit/form-actions) for more information.

<div class="ts-block">

```dts
type Actions<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	OutputData extends Record<string, any> | void = Record<
		string,
		any
	> | void,
	RouteId extends AppRouteId | null = AppRouteId | null
> = Record<string, Action<Params, OutputData, RouteId>>;
```

</div>

## Adapter

[Adapters](/docs/kit/adapters) are responsible for taking the production build and turning it into something that can be deployed to a platform of your choosing.

<div class="ts-block">

```dts
interface Adapter {/*…*/}
```

<div class="ts-block-property">

```dts
name: string;
```

<div class="ts-block-property-details">

The name of the adapter, using for logging. Will typically correspond to the package name.

</div>
</div>

<div class="ts-block-property">

```dts
adapt: (builder: Builder) => MaybePromise<void>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `builder` An object provided by SvelteKit that contains methods for adapting the app

</div>

This function is called after SvelteKit has built your app.

</div>
</div>

<div class="ts-block-property">

```dts
supports?: {/*…*/};
```

<div class="ts-block-property-details">

Checks called during dev and build to determine whether specific features will work in production with this adapter.

<div class="ts-block-property-children"><div class="ts-block-property">

```dts
read?: (details: { config: Record<string, any>; route: { id: string } }) => boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `details.config` The merged adapter-specific route config exported from the route with `export const config`

</div>

Test support for `read` from `$app/server`.

</div>
</div>
<div class="ts-block-property">

```dts
instrumentation?: () => boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v2.31.0

</div>

Test support for `instrumentation.server.js`. To pass, the adapter must support running `instrumentation.server.js` prior to the application code.

</div>
</div></div>

</div>
</div>

<div class="ts-block-property">

```dts
emulate?: () => MaybePromise<Emulator>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> This will be removed in the next major version

</div>

Creates an `Emulator`, which allows the adapter to influence the environment
during dev, build and prerendering.

</div>
</div>

<div class="ts-block-property">

```dts
vite?: AdapterViteConfig | ((ctx: { config: ValidatedConfig }) => AdapterViteConfig);
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v3.0.0

</div>

Options for configuring and interacting with Vite

</div>
</div></div>

## AdapterViteConfig

<div class="ts-block">

```dts
interface AdapterViteConfig {/*…*/}
```

<div class="ts-block-property">

```dts
customPreview?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`
- <span class="tag since">available since</span> v3.4.0

</div>

By default, SvelteKit creates a Node preview server to serve the build
output during `vite preview`. Set this option to `true` when the adapter
provides a Vite plugin with a `configurePreviewServer` hook that handles
previewing the build output on its own.

</div>
</div>

<div class="ts-block-property">

```dts
getRequest?: typeof getRequest;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v3.0.0

</div>

This function overrides the default behavior during Vite's dev and preview modes
to convert an `http.IncomingMessage` to a `Request` object.
To call the original `setRequest` function, import it from `@sveltejs/kit/node`.

</div>
</div>

<div class="ts-block-property">

```dts
setResponse?: typeof setResponse;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v3.0.0

</div>

This function overrides the default behavior in Vite's dev and preview modes
to write a `Response` object to a `http.ServerResponse`.
To call the original `setResponse` function, import it from `@sveltejs/kit/node`.

</div>
</div>

<div class="ts-block-property">

```dts
plugins?:
	| Plugin[]
	| {/*…*/};
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v3.0.0

</div>

Vite plugins injected by the adapter. By default,
they are placed before SvelteKit's plugins.

<div class="ts-block-property-children"><div class="ts-block-property">

```dts
pre?: Plugin[];
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v3.0.0

</div>

Vite plugins placed before any of SvelteKit's own plugins.

</div>
</div>
<div class="ts-block-property">

```dts
post?: Plugin[];
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v3.0.0

</div>

Vite plugins placed after any of SvelteKit's own plugins.

</div>
</div></div>

</div>
</div></div>

## AwaitedActions

<div class="ts-block">

```dts
type AwaitedActions<
	T extends Record<string, (...args: any) => any>
> = OptionalUnion<
	{
		[Key in keyof T]: UnpackValidationError<
			Awaited<ReturnType<T[Key]>>
		>;
	}[keyof T]
>;
```

</div>

## Builder

This object is passed to the `adapt` function of adapters.
It contains various methods and properties that are useful for adapting the app.

<div class="ts-block">

```dts
interface Builder {/*…*/}
```

<div class="ts-block-property">

```dts
log: Logger;
```

<div class="ts-block-property-details">

Print messages to the console. `log.info` and `log.minor` are silent unless Vite's `logLevel` is `info`.

</div>
</div>

<div class="ts-block-property">

```dts
rimraf: (dir: string) => void;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> Use `fs.rmSync(dir, { force: true, recursive: true })` instead

</div>

Remove `dir` and all its contents.

</div>
</div>

<div class="ts-block-property">

```dts
mkdirp: (dir: string) => void;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> Use `fs.mkdirSync(dir, { recursive: true })` instead

</div>

Create `dir` and any required parent directories.

</div>
</div>

<div class="ts-block-property">

```dts
config: ValidatedConfig;
```

<div class="ts-block-property-details">

The fully resolved SvelteKit config.

</div>
</div>

<div class="ts-block-property">

```dts
prerendered: Prerendered;
```

<div class="ts-block-property-details">

Information about prerendered pages and assets, if any.

</div>
</div>

<div class="ts-block-property">

```dts
routes: RouteDefinition[];
```

<div class="ts-block-property-details">

An array of all routes (including prerendered)

</div>
</div>

<div class="ts-block-property">

```dts
manifest: typeof import('$app/manifest');
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v3.0.0

</div>

The value of the `$app/manifest` module.
The only difference is `manifest.assets` also includes the service worker, if it exists.

</div>
</div>

<div class="ts-block-property">

```dts
mimeTypes: Record<string, string>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v3.0.0

</div>

A record of file extensions to MIME types

</div>
</div>

<div class="ts-block-property">

```dts
createEntries?: (fn: (route: RouteDefinition) => AdapterEntry) => Promise<void>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `fn` A function that groups a set of routes into an entry point
- <span class="tag deprecated">deprecated</span> removed in 3.0. Use `builder.routes` instead

</div>

Create separate functions that map to one or more routes of your app.

</div>
</div>

<div class="ts-block-property">

```dts
findServerAssets: (routes: RouteDefinition[]) => string[];
```

<div class="ts-block-property-details">

Find all the assets imported by server files belonging to `routes`

</div>
</div>

<div class="ts-block-property">

```dts
generateFallback: (dest: string) => Promise<void>;
```

<div class="ts-block-property-details">

Generate a fallback page for a static webserver to use when no route is matched. Useful for single-page apps.

</div>
</div>

<div class="ts-block-property">

```dts
generateEnvModule: () => void;
```

<div class="ts-block-property-details">

Generate a module exposing public environment variables as `$app/env/public` if the app uses it.

</div>
</div>

<div class="ts-block-property">

```dts
generateManifest?: (opts: { relativePath: string; routes?: RouteDefinition[] }) => string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `opts.relativePath` A relative path to the base directory of the server build output
- <span class="tag deprecated">deprecated</span> removed in 3.0. Use `builder.generateServerInstance` or `builder.manifest` instead

</div>

Generate a server-side manifest to initialise the SvelteKit [server](/docs/kit/@sveltejs-kit#Server) with.

</div>
</div>

<div class="ts-block-property">

```dts
getBuildDirectory: (name: string) => string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `name` path to the file, relative to the build directory

</div>

Resolve a path to the `name` directory inside `outDir`, e.g. `/path/to/.svelte-kit/my-adapter`.

</div>
</div>

<div class="ts-block-property">

```dts
getClientDirectory: () => string;
```

<div class="ts-block-property-details">

Get the fully resolved path to the directory containing client-side assets, including the contents of your `static` directory.

</div>
</div>

<div class="ts-block-property">

```dts
getServerDirectory: () => string;
```

<div class="ts-block-property-details">

Get the fully resolved path to the directory containing server-side code.

</div>
</div>

<div class="ts-block-property">

```dts
getAppPath: () => string;
```

<div class="ts-block-property-details">

Get the application path including any configured `base` path, e.g. `my-base-path/_app`.

</div>
</div>

<div class="ts-block-property">

```dts
generateServerInstance: (
	dest: string,
	opts?: {
		routes?: RouteDefinition[];
		serverDirectory?: string;
	}
) => void;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `opts.routes` A subset of the routes to include in the server's manifest
- `opts.serverDirectory` The directory containing the server code. Defaults to `getServerDirectory()`.
- <span class="tag since">available since</span> v3.0.0

</div>

Generates a module exposing a SvelteKit [Server](/docs/kit/@sveltejs-kit#Server) instance.

</div>
</div>

<div class="ts-block-property">

```dts
writeClient: (dest: string) => string[];
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `dest` the destination folder
- <span class="tag">returns</span> an array of files written to `dest`

</div>

Write client assets to `dest`.

</div>
</div>

<div class="ts-block-property">

```dts
writePrerendered: (dest: string) => string[];
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `dest` the destination folder
- <span class="tag">returns</span> an array of files written to `dest`

</div>

Write prerendered files to `dest`.

</div>
</div>

<div class="ts-block-property">

```dts
writeServer: (dest: string) => string[];
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `dest` the destination folder
- <span class="tag">returns</span> an array of files written to `dest`

</div>

Write server-side code to `dest`.

</div>
</div>

<div class="ts-block-property">

```dts
createInstrumentationInitializer: (options: {
	outputDirectory: string;
	environment?: string;
	serverDirectory?: string;
}) => string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `options` an object containing the following properties:
- `options.outputDirectory` the directory in which to create the initializer.
- `options.environment` the contents of a module whose default export contains the platform's environment variables. If omitted, `process.env` is used.
- `options.serverDirectory` the directory containing the server build output. Defaults to `getServerDirectory()`.
- <span class="tag">returns</span> the filesystem path to the generated initializer.
- <span class="tag since">available since</span> v3.0.0

</div>

Generate an initializer that populates `$env/dynamic/private` before server instrumentation
runs. Include the returned module in any subsequent bundling or tracing step.

</div>
</div>

<div class="ts-block-property">

```dts
copy: (
	from: string,
	to: string,
	opts?: {
		filter?(basename: string): boolean;
		replace?: Record<string, string>;
	}
) => string[];
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `from` the source file or directory
- `to` the destination file or directory
- `opts.filter` a function to determine whether a file or directory should be copied
- `opts.replace` a map of strings to replace
- <span class="tag">returns</span> an array of files that were copied

</div>

Copy a file or directory.

</div>
</div>

<div class="ts-block-property">

```dts
hasServerInstrumentationFile: () => boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">returns</span> true if the server instrumentation file exists, false otherwise
- <span class="tag since">available since</span> v2.31.0

</div>

Check if the server instrumentation file exists.

</div>
</div>

<div class="ts-block-property">

```dts
instrument: (args: {
	entrypoint: string;
	instrumentation: string;
	start?: string;
	initializer: string;
	module?:
		| {
				exports: string[];
		  }
		| {
				generateText: (args: {
					instrumentation: string;
					start: string;
					initializer: string;
				}) => string;
		  };
}) => void;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `options` an object containing the following properties:
- `options.entrypoint` the path to the entrypoint to trace.
- `options.instrumentation` the path to the instrumentation file.
- `options.start` the name of the start file. This is what `entrypoint` will be renamed to.
- `options.initializer` the filesystem path to the bundled or copied instrumentation initializer.
- `options.module` configuration for the resulting entrypoint module.
- `options.module.generateText` a function that receives the relative paths to the initializer, instrumentation and start files, and generates the text of the module to be traced. It must import `initializer` before `instrumentation`, and dynamically import `start` after instrumentation has run. If not provided, the default implementation will be used, which uses top-level await.
- <span class="tag since">available since</span> v3.0.0

</div>

Instrument `entrypoint` with `instrumentation`.

Renames `entrypoint` to `start` and creates a new module at
`entrypoint` which imports `instrumentation` and then dynamically imports `start`. This allows
the module hooks necessary for instrumentation libraries to be loaded prior to any application code.

`initializer` is a module generated by `createInstrumentationInitializer`. It must be included
in any bundling or tracing step before calling this method.

Caveats:
- "Live exports" will not work. If your adapter uses live exports, your users will need to manually import the server instrumentation on startup.
- If `tla` is `false`, OTEL auto-instrumentation may not work properly. Use it if your environment supports it.
- Use `hasServerInstrumentationFile` to check if the user has a server instrumentation file; if they don't, you shouldn't do this.

</div>
</div>

<div class="ts-block-property">

```dts
compress: (directory: string) => Promise<string[]>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `directory` The directory containing the files to be compressed
- <span class="tag">returns</span> an array of the files in `directory` that were compressed

</div>

Compress files in `directory` with gzip and brotli, where appropriate. Generates `.gz` and `.br` files alongside the originals.

</div>
</div></div>

## Cookies

<div class="ts-block">

```dts
interface Cookies {/*…*/}
```

<div class="ts-block-property">

```dts
get: (name: string, opts?: import('cookie').ParseOptions) => string | undefined;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `name` the name of the cookie
- `opts` the options, passed directly to `cookie.parseCookie`. See documentation [here](https://github.com/jshttp/cookie?tab=readme-ov-file#cookieparsecookiestr-options)

</div>

Gets a cookie that was previously set with `cookies.set`, or from the request headers.

</div>
</div>

<div class="ts-block-property">

```dts
getAll: (opts?: import('cookie').ParseOptions) => Array<{ name: string; value: string }>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `opts` the options, passed directly to `cookie.parseCookie`. See documentation [here](https://github.com/jshttp/cookie?tab=readme-ov-file#cookieparsecookiestr-options)

</div>

Gets all cookies that were previously set with `cookies.set`, or from the request headers.

</div>
</div>

<div class="ts-block-property">

```dts
set: (name: string, value: string, opts?: import('cookie').SerializeOptions) => void;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `name` the name of the cookie
- `value` the cookie value
- `opts` the options passed to `cookie.stringifySetCookie` with the SvelteKit defaults described above. See documentation [here](https://github.com/jshttp/cookie?tab=readme-ov-file#cookiestringifysetcookiesetcookieobj-options)

</div>

Sets a cookie. This will add a `set-cookie` header to the response, but also make the cookie available via `cookies.get` or `cookies.getAll` during the current request.

The `httpOnly` is `true` by default, as is `secure`, except during development, when it defaults to `false`. These must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP.

The `path` option is `'/'` by default. You can use relative paths, or set `path: ''` to make the cookie only available on the current path and its children.

</div>
</div>

<div class="ts-block-property">

```dts
delete: (name: string, opts?: import('cookie').SerializeOptions) => void;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `name` the name of the cookie
- `opts` the options passed to `cookie.stringifySetCookie` with the SvelteKit defaults described above. See documentation [here](https://github.com/jshttp/cookie?tab=readme-ov-file#cookiestringifysetcookiesetcookieobj-options)

</div>

Deletes a cookie by setting its value to an empty string and setting the expiry date in the past.

The `httpOnly` is `true` by default, as is `secure`, except during development, when it defaults to `false`. These must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP.

The `path` option is `'/'` by default. You can use relative paths, or set `path: ''` to make the cookie only available on the current path and its children.

</div>
</div>

<div class="ts-block-property">

```dts
parse: typeof import('cookie').parseSetCookie;
```

<div class="ts-block-property-details">

Parses a single `Set-Cookie` header. This allows you to apply cookies received from an external source:

```js
// @errors: 7031
import { getRequestEvent } from '$app/server';

export async function GET() {
	const { cookies } = getRequestEvent();

	const response = await fetch('...');

	for (const str of response.headers.getSetCookie()) {
		const { name, value, ...options } = cookies.parse(str);
		cookies.set(name, value, options);
	}

	// ...
}
```

Note the use of `headers.getSetCookie()`, which returns an array of cookie headers, _not_ `headers.get('set-cookie')` which returns a single comma-separated string.

</div>
</div>

<div class="ts-block-property">

```dts
serialize: (name: string, value: string, opts?: import('cookie').SerializeOptions) => string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `name` the name of the cookie
- `value` the cookie value
- `opts` the options passed to `cookie.stringifySetCookie` with the SvelteKit defaults described above. See documentation [here](https://github.com/jshttp/cookie?tab=readme-ov-file#cookiestringifysetcookiesetcookieobj-options)

</div>

Serialize a cookie name-value pair into a `Set-Cookie` header string, but don't apply it to the response.

The `httpOnly` is `true` by default, as is `secure`, except during development, when it defaults to `false`. These must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP.

The `path` option is `'/'` by default. You can use relative paths, or set `path: ''` to make the cookie only available on the current path and its children.

</div>
</div></div>

## Emulator

<blockquote class="tag deprecated note">

This will be removed in the next major version

</blockquote>

A collection of functions that influence the environment during dev, build and prerendering

<div class="ts-block">

```dts
interface Emulator {/*…*/}
```

<div class="ts-block-property">

```dts
platform?(details: { config: any; prerender: PrerenderOption }): MaybePromise<App.Platform>;
```

<div class="ts-block-property-details">

A function that is called with the current route `config` and `prerender` option
and returns an `App.Platform` object

</div>
</div></div>

## HttpError

The object returned by the [`error`](/docs/kit/@sveltejs-kit#error) function.

<div class="ts-block">

```dts
interface HttpError {/*…*/}
```

<div class="ts-block-property">

```dts
status: number;
```

<div class="ts-block-property-details">

The [HTTP status code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status#client_error_responses), in the range 400-599.

</div>
</div>

<div class="ts-block-property">

```dts
body: App.Error;
```

<div class="ts-block-property-details">

The content of the error.

</div>
</div></div>

## Load

The generic form of `PageLoad` and `LayoutLoad`. You should import those from `./$types` (see [generated types](/docs/kit/types#Generated-types))
rather than using `Load` directly.

<div class="ts-block">

```dts
type Load<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	InputData extends Record<string, unknown> | null = Record<
		string,
		any
	> | null,
	ParentData extends Record<string, unknown> = Record<
		string,
		any
	>,
	OutputData extends Record<string, unknown> | void =
		Record<string, any> | void,
	RouteId extends AppRouteId | null = AppRouteId | null
> = (
	event: LoadEvent<Params, InputData, ParentData, RouteId>
) => MaybePromise<OutputData>;
```

</div>

## LoadEvent

The generic form of `PageLoadEvent` and `LayoutLoadEvent`. You should import those from `./$types` (see [generated types](/docs/kit/types#Generated-types))
rather than using `LoadEvent` directly.

<div class="ts-block">

```dts
interface LoadEvent<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	Data extends Record<string, unknown> | null = Record<
		string,
		any
	> | null,
	ParentData extends Record<string, unknown> = Record<
		string,
		any
	>,
	RouteId extends AppRouteId | null = AppRouteId | null
> extends NavigationEvent<Params, RouteId> {/*…*/}
```

<div class="ts-block-property">

```dts
fetch: typeof fetch;
```

<div class="ts-block-property-details">

`fetch` is equivalent to the [native `fetch` web API](https://developer.mozilla.org/en-US/docs/Web/API/fetch), with a few additional features:

- It can be used to make credentialed requests on the server, as it inherits the `cookie` and `authorization` headers for the page request.
- It can make relative requests on the server (ordinarily, `fetch` requires a URL with an origin when used in a server context).
- Internal requests (e.g. for `+server.js` routes) go directly to the handler function when running on the server, without the overhead of an HTTP call.
- During server-side rendering, the response will be captured and inlined into the rendered HTML by hooking into the `text` and `json` methods of the `Response` object. Note that headers will _not_ be serialized, unless explicitly included via [`filterSerializedResponseHeaders`](/docs/kit/hooks#handle)
- During hydration, the response will be read from the HTML, guaranteeing consistency and preventing an additional network request.

You can learn more about making credentialed requests with cookies [here](/docs/kit/load#Cookies)

</div>
</div>

<div class="ts-block-property">

```dts
data: Data;
```

<div class="ts-block-property-details">

Contains the data returned by the route's server `load` function (in `+layout.server.js` or `+page.server.js`), if any.

</div>
</div>

<div class="ts-block-property">

```dts
setHeaders: (headers: Record<string, string>) => void;
```

<div class="ts-block-property-details">

If you need to set headers for the response, you can do so using the this method. This is useful if you want the page to be cached, for example:

```js
// @errors: 7031
/// file: src/routes/blog/+page.js
export async function load({ fetch, setHeaders }) {
	const url = `https://cms.example.com/articles.json`;
	const response = await fetch(url);

	setHeaders({
		age: response.headers.get('age'),
		'cache-control': response.headers.get('cache-control')
	});

	return response.json();
}
```

Setting the same header multiple times (even in separate `load` functions) is an error — you can only set a given header once.

You cannot add a `set-cookie` header with `setHeaders` — use the [`cookies`](/docs/kit/@sveltejs-kit#Cookies) API in a server-only `load` function instead.

`setHeaders` has no effect when a `load` function runs in the browser.

</div>
</div>

<div class="ts-block-property">

```dts
parent: () => Promise<ParentData>;
```

<div class="ts-block-property-details">

`await parent()` returns data from parent `+layout.js` `load` functions.
Implicitly, a missing `+layout.js` is treated as a `({ data }) => data` function, meaning that it will return and forward data from parent `+layout.server.js` files.

Be careful not to introduce accidental waterfalls when using `await parent()`. If for example you only want to merge parent data into the returned output, call it _after_ fetching your other data.

</div>
</div>

<div class="ts-block-property">

```dts
depends: (...deps: Array<`${string}:${string}`>) => void;
```

<div class="ts-block-property-details">

This function declares that the `load` function has a _dependency_ on one or more URLs or custom identifiers, which can subsequently be used with [`invalidate()`](/docs/kit/$app-navigation#invalidate) to cause `load` to rerun.

Most of the time you won't need this, as `fetch` calls `depends` on your behalf — it's only necessary if you're using a custom API client that bypasses `fetch`.

URLs can be absolute or relative to the page being loaded, and must be [encoded](https://developer.mozilla.org/en-US/docs/Glossary/percent-encoding).

Custom identifiers have to be prefixed with one or more lowercase letters followed by a colon to conform to the [URI specification](https://www.rfc-editor.org/rfc/rfc3986.html).

The following example shows how to use `depends` to register a dependency on a custom identifier, which is `invalidate`d after a button click, making the `load` function rerun.

```js
// @errors: 7031
/// file: src/routes/+page.js
let count = 0;
export async function load({ depends }) {
	depends('increase:count');

	return { count: count++ };
}
```

```html
/// file: src/routes/+page.svelte
<script>
	import { invalidate } from '$app/navigation';

	let { data } = $props();

	const increase = async () => {
		await invalidate('increase:count');
	}
</script>

<p>{data.count}<p>
<button on:click={increase}>Increase Count</button>
```

</div>
</div>

<div class="ts-block-property">

```dts
untrack: <T>(fn: () => T) => T;
```

<div class="ts-block-property-details">

Use this function to opt out of dependency tracking for everything that is synchronously called within the callback. Example:

```js
// @errors: 7031
/// file: src/routes/+page.server.js
export async function load({ untrack, url }) {
	// Untrack url.pathname so that path changes don't trigger a rerun
	if (untrack(() => url.pathname === '/')) {
		return { message: 'Welcome!' };
	}
}
```

</div>
</div>

<div class="ts-block-property">

```dts
tracing: {/*…*/};
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v2.31.0

</div>

Access to spans for tracing. If tracing is not enabled or the function is being run in the browser, these spans will do nothing.

<div class="ts-block-property-children"><div class="ts-block-property">

```dts
enabled: boolean;
```

<div class="ts-block-property-details">

Whether tracing is enabled.

</div>
</div>
<div class="ts-block-property">

```dts
root: Span;
```

<div class="ts-block-property-details">

The root span for the request. This span is named `sveltekit.handle.root`.

</div>
</div>
<div class="ts-block-property">

```dts
current: Span;
```

<div class="ts-block-property-details">

The span associated with the current `load` function.

</div>
</div></div>

</div>
</div></div>

## LoadProperties

<div class="ts-block">

```dts
type LoadProperties<
	input extends Record<string, any> | void
> = input extends void
	? undefined // needs to be undefined, because void will break intellisense
	: input extends Record<string, any>
		? input
		: unknown;
```

</div>

## NavigationEvent

<div class="ts-block">

```dts
interface NavigationEvent<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	RouteId extends AppRouteId | null = AppRouteId | null
> {/*…*/}
```

<div class="ts-block-property">

```dts
params: Params;
```

<div class="ts-block-property-details">

The parameters of the current page - e.g. for a route like `/blog/[slug]`, a `{ slug: string }` object

</div>
</div>

<div class="ts-block-property">

```dts
route: {/*…*/};
```

<div class="ts-block-property-details">

Info about the current route

<div class="ts-block-property-children"><div class="ts-block-property">

```dts
id: RouteId;
```

<div class="ts-block-property-details">

The ID of the current route - e.g. for `src/routes/blog/[slug]`, it would be `/blog/[slug]`. It is `null` when no route is matched.

</div>
</div></div>

</div>
</div>

<div class="ts-block-property">

```dts
url: URL;
```

<div class="ts-block-property-details">

The URL of the current page

</div>
</div></div>

## PrerenderOption

<div class="ts-block">

```dts
type PrerenderOption = boolean | 'auto';
```

</div>

## Redirect

The object returned by the [`redirect`](/docs/kit/@sveltejs-kit#redirect) function.

<div class="ts-block">

```dts
interface Redirect {/*…*/}
```

<div class="ts-block-property">

```dts
status: 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308;
```

<div class="ts-block-property-details">

The [HTTP status code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status#redirection_messages), in the range 300-308.

</div>
</div>

<div class="ts-block-property">

```dts
location: string;
```

<div class="ts-block-property-details">

The location to redirect to.

</div>
</div></div>

## RequestEvent

<div class="ts-block">

```dts
interface RequestEvent<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	RouteId extends AppRouteId | null = AppRouteId | null
> {/*…*/}
```

<div class="ts-block-property">

```dts
readonly cookies: Cookies;
```

<div class="ts-block-property-details">

Get or set cookies related to the current request

</div>
</div>

<div class="ts-block-property">

```dts
readonly fetch: typeof fetch;
```

<div class="ts-block-property-details">

`fetch` is equivalent to the [native `fetch` web API](https://developer.mozilla.org/en-US/docs/Web/API/fetch), with a few additional features:

- It can be used to make credentialed requests on the server, as it inherits the `cookie` and `authorization` headers for the page request.
- It can make relative requests on the server (ordinarily, `fetch` requires a URL with an origin when used in a server context).
- Internal requests (e.g. for `+server.js` routes) go directly to the handler function when running on the server, without the overhead of an HTTP call.
- During server-side rendering, the response will be captured and inlined into the rendered HTML by hooking into the `text` and `json` methods of the `Response` object. Note that headers will _not_ be serialized, unless explicitly included via [`filterSerializedResponseHeaders`](/docs/kit/hooks#handle)
- During hydration, the response will be read from the HTML, guaranteeing consistency and preventing an additional network request.

You can learn more about making credentialed requests with cookies [here](/docs/kit/load#Cookies).

</div>
</div>

<div class="ts-block-property">

```dts
readonly getClientAddress: () => string;
```

<div class="ts-block-property-details">

The client's IP address, set by the adapter.

</div>
</div>

<div class="ts-block-property">

```dts
readonly locals: App.Locals;
```

<div class="ts-block-property-details">

Contains custom data that was added to the request within the [`server handle hook`](/docs/kit/hooks#handle).

</div>
</div>

<div class="ts-block-property">

```dts
readonly params: Params;
```

<div class="ts-block-property-details">

The parameters of the current route - e.g. for a route like `/blog/[slug]`, a `{ slug: string }` object.

Inside `query` functions (including `query.batch` and `query.live`), accessing this property throws an error.
Pass values from the page as arguments to the query instead. Inside `form` and `command` functions it relates to the page
the remote function was called from, _not_ the URL of the endpoint SvelteKit creates for the remote function. Never use it
to determine whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.

</div>
</div>

<div class="ts-block-property">

```dts
readonly platform: Readonly<App.Platform> | undefined;
```

<div class="ts-block-property-details">

Additional data made available through the adapter.

</div>
</div>

<div class="ts-block-property">

```dts
readonly request: Request;
```

<div class="ts-block-property-details">

The original request object.

</div>
</div>

<div class="ts-block-property">

```dts
readonly route: {/*…*/};
```

<div class="ts-block-property-details">

Info about the current route.

<div class="ts-block-property-children"><div class="ts-block-property">

```dts
id: RouteId;
```

<div class="ts-block-property-details">

The ID of the current route - e.g. for `src/routes/blog/[slug]`, it would be `/blog/[slug]`. It is `null` when no route is matched.

Inside `query` functions (including `query.batch` and `query.live`), accessing this property throws an error.
Pass values from the page as arguments to the query instead. Inside `form` and `command` functions it relates to the page
the remote function was called from, _not_ the URL of the endpoint SvelteKit creates for the remote function. Never use it
to determine whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.

</div>
</div></div>

</div>
</div>

<div class="ts-block-property">

```dts
readonly setHeaders: (headers: Record<string, string>) => void;
```

<div class="ts-block-property-details">

If you need to set headers for the response, you can do so using the this method. This is useful if you want the page to be cached, for example:

```js
// @errors: 7031
/// file: src/routes/blog/+page.js
export async function load({ fetch, setHeaders }) {
	const url = `https://cms.example.com/articles.json`;
	const response = await fetch(url);

	setHeaders({
		age: response.headers.get('age'),
		'cache-control': response.headers.get('cache-control')
	});

	return response.json();
}
```

Setting the same header multiple times (even in separate `load` functions) is an error — you can only set a given header once.

You cannot add a `set-cookie` header with `setHeaders` — use the [`cookies`](/docs/kit/@sveltejs-kit#Cookies) API instead.

</div>
</div>

<div class="ts-block-property">

```dts
readonly url: URL;
```

<div class="ts-block-property-details">

The requested URL.

Inside `query` functions (including `query.batch` and `query.live`), accessing this property throws an error.
Pass values from the page as arguments to the query instead. Inside `form` and `command` functions it relates to the page
the remote function was called from, _not_ the URL of the endpoint SvelteKit creates for the remote function. Never use it
to determine whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.

</div>
</div>

<div class="ts-block-property">

```dts
readonly isDataRequest: boolean;
```

<div class="ts-block-property-details">

`true` if the request comes from the client asking for `+page/layout.server.js` data. The `url` property will be stripped of the internal information
related to the data request in this case. Use this property instead if the distinction is important to you.

</div>
</div>

<div class="ts-block-property">

```dts
readonly isSubRequest: boolean;
```

<div class="ts-block-property-details">

`true` for `+server.js` calls coming from SvelteKit without the overhead of actually making an HTTP request. This happens when you make same-origin `fetch` requests on the server.

</div>
</div>

<div class="ts-block-property">

```dts
readonly tracing: {/*…*/};
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v2.31.0

</div>

Access to spans for tracing. If tracing is not enabled, these spans will do nothing.

<div class="ts-block-property-children"><div class="ts-block-property">

```dts
enabled: boolean;
```

<div class="ts-block-property-details">

Whether tracing is enabled.

</div>
</div>
<div class="ts-block-property">

```dts
root: Span;
```

<div class="ts-block-property-details">

The root span for the request. This span is named `sveltekit.handle.root`.

</div>
</div>
<div class="ts-block-property">

```dts
current: Span;
```

<div class="ts-block-property-details">

The span associated with the current `handle` hook, `load` function, form action, or `+server` handler.

</div>
</div></div>

</div>
</div>

<div class="ts-block-property">

```dts
readonly isRemoteRequest: boolean;
```

<div class="ts-block-property-details">

`true` if the request comes from the client via a remote function. The `url` property will be stripped of the internal information
related to the data request in this case. Use this property instead if the distinction is important to you.

</div>
</div></div>

## RequestHandler

A `(event: RequestEvent) => Response` function exported from a `+server.js` file that corresponds to an HTTP verb (`GET`, `PUT`, `PATCH`, etc) and handles requests with that method.

It receives `Params` as the first generic argument, which you can skip by using [generated types](/docs/kit/types#Generated-types) instead.

<div class="ts-block">

```dts
type RequestHandler<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	RouteId extends AppRouteId | null = AppRouteId | null
> = (
	event: RequestEvent<Params, RouteId>
) => MaybePromise<Response>;
```

</div>

## RouteDefinition

<div class="ts-block">

```dts
interface RouteDefinition<Config = any> {/*…*/}
```

<div class="ts-block-property">

```dts
id: string;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
api: {
	methods: Array<HttpMethod | '*'>;
};
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
page: {
	methods: Array<Extract<HttpMethod, 'GET' | 'POST'>>;
};
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
pattern: RegExp;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
prerender: PrerenderOption;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
segments: RouteSegment[];
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
methods: Array<HttpMethod | '*'>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
config: Config;
```

<div class="ts-block-property-details"></div>
</div></div>

## Server

<div class="ts-block">

```dts
interface Server {/*…*/}
```

<div class="ts-block-property">

```dts
init(options: ServerInitOptions): Promise<void>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
respond(request: Request, options: RequestOptions): Promise<Response>;
```

<div class="ts-block-property-details"></div>
</div></div>

## ServerInitOptions

<div class="ts-block">

```dts
interface ServerInitOptions {/*…*/}
```

<div class="ts-block-property">

```dts
env: Record<string, string | undefined>;
```

<div class="ts-block-property-details">

A map of environment variables.

</div>
</div>

<div class="ts-block-property">

```dts
read?: (file: string) => MaybePromise<ReadableStream | null>;
```

<div class="ts-block-property-details">

A function that turns an asset filename into a `ReadableStream`. Required for the `read` export from `$app/server` to work.

</div>
</div></div>

## ServerLoad

The generic form of `PageServerLoad` and `LayoutServerLoad`. You should import those from `./$types` (see [generated types](/docs/kit/types#Generated-types))
rather than using `ServerLoad` directly.

<div class="ts-block">

```dts
type ServerLoad<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	ParentData extends Record<string, any> = Record<
		string,
		any
	>,
	OutputData extends Record<string, any> | void = Record<
		string,
		any
	> | void,
	RouteId extends AppRouteId | null = AppRouteId | null
> = (
	event: ServerLoadEvent<Params, ParentData, RouteId>
) => MaybePromise<OutputData>;
```

</div>

## ServerLoadEvent

<div class="ts-block">

```dts
interface ServerLoadEvent<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	ParentData extends Record<string, any> = Record<
		string,
		any
	>,
	RouteId extends AppRouteId | null = AppRouteId | null
> extends RequestEvent<Params, RouteId> {/*…*/}
```

<div class="ts-block-property">

```dts
parent: () => Promise<ParentData>;
```

<div class="ts-block-property-details">

`await parent()` returns data from parent `+layout.server.js` `load` functions.

Be careful not to introduce accidental waterfalls when using `await parent()`. If for example you only want to merge parent data into the returned output, call it _after_ fetching your other data.

</div>
</div>

<div class="ts-block-property">

```dts
depends: (...deps: string[]) => void;
```

<div class="ts-block-property-details">

This function declares that the `load` function has a _dependency_ on one or more URLs or custom identifiers, which can subsequently be used with [`invalidate()`](/docs/kit/$app-navigation#invalidate) to cause `load` to rerun.

Most of the time you won't need this, as `fetch` calls `depends` on your behalf — it's only necessary if you're using a custom API client that bypasses `fetch`.

URLs can be absolute or relative to the page being loaded, and must be [encoded](https://developer.mozilla.org/en-US/docs/Glossary/percent-encoding).

Custom identifiers have to be prefixed with one or more lowercase letters followed by a colon to conform to the [URI specification](https://www.rfc-editor.org/rfc/rfc3986.html).

The following example shows how to use `depends` to register a dependency on a custom identifier, which is `invalidate`d after a button click, making the `load` function rerun.

```js
// @errors: 7031
/// file: src/routes/+page.js
let count = 0;
export async function load({ depends }) {
	depends('increase:count');

	return { count: count++ };
}
```

```html
/// file: src/routes/+page.svelte
<script>
	import { invalidate } from '$app/navigation';

	let { data } = $props();

	const increase = async () => {
		await invalidate('increase:count');
	}
</script>

<p>{data.count}<p>
<button on:click={increase}>Increase Count</button>
```

</div>
</div>

<div class="ts-block-property">

```dts
untrack: <T>(fn: () => T) => T;
```

<div class="ts-block-property-details">

Use this function to opt out of dependency tracking for everything that is synchronously called within the callback. Example:

```js
// @errors: 7031
/// file: src/routes/+page.js
export async function load({ untrack, url }) {
	// Untrack url.pathname so that path changes don't trigger a rerun
	if (untrack(() => url.pathname === '/')) {
		return { message: 'Welcome!' };
	}
}
```

</div>
</div>

<div class="ts-block-property">

```dts
tracing: {/*…*/};
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v2.31.0

</div>

Access to spans for tracing. If tracing is not enabled, these spans will do nothing.

<div class="ts-block-property-children"><div class="ts-block-property">

```dts
enabled: boolean;
```

<div class="ts-block-property-details">

Whether tracing is enabled.

</div>
</div>
<div class="ts-block-property">

```dts
root: Span;
```

<div class="ts-block-property-details">

The root span for the request. This span is named `sveltekit.handle.root`.

</div>
</div>
<div class="ts-block-property">

```dts
current: Span;
```

<div class="ts-block-property-details">

The span associated with the current server `load` function.

</div>
</div></div>

</div>
</div></div>

## Snapshot

<blockquote class="tag deprecated note">

Use the [`snapshot`](/docs/kit/$app-navigation#snapshot) helper from `$app/navigation` instead.

</blockquote>

The type of `export const snapshot` exported from a page or layout component.

<div class="ts-block">

```dts
interface Snapshot<T = any> {/*…*/}
```

<div class="ts-block-property">

```dts
capture: () => T;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
restore: (snapshot: T) => void;
```

<div class="ts-block-property-details"></div>
</div></div>

## ValidationError

A validation error thrown by `invalid`.

<div class="ts-block">

```dts
interface ValidationError {/*…*/}
```

<div class="ts-block-property">

```dts
issues: StandardSchemaV1.Issue[];
```

<div class="ts-block-property-details">

The validation issues

</div>
</div>

<div class="ts-block-property">

```dts
remote?: {
	name?: string;
	file?: string;
};
```

<div class="ts-block-property-details">

Information about the remote function that failed validation

</div>
</div></div>



## Private types

The following are referenced by the public types documented above, but cannot be imported directly:

### AdapterEntry

<div class="ts-block">

```dts
interface AdapterEntry {/*…*/}
```

<div class="ts-block-property">

```dts
id: string;
```

<div class="ts-block-property-details">

A string that uniquely identifies an HTTP service (e.g. serverless function) and is used for deduplication.
For example, `/foo/a-[b]` and `/foo/[c]` are different routes, but would both
be represented in a Netlify _redirects file as `/foo/:param`, so they share an ID

</div>
</div>

<div class="ts-block-property">

```dts
filter(route: RouteDefinition): boolean;
```

<div class="ts-block-property-details">

A function that compares the candidate route with the current route to determine
if it should be grouped with the current route.

Use cases:
- Fallback pages: `/foo/[c]` is a fallback for `/foo/a-[b]`, and `/[...catchall]` is a fallback for all routes
- Grouping routes that share a common `config`: `/foo` should be deployed to the edge, `/bar` and `/baz` should be deployed to a serverless function

</div>
</div>

<div class="ts-block-property">

```dts
complete(entry: { generateManifest(opts: { relativePath: string }): string }): MaybePromise<void>;
```

<div class="ts-block-property-details">

A function that is invoked once the entry has been created. This is where you
should write the function to the filesystem and generate redirect manifests.

</div>
</div></div>

### Csp

<div class="ts-block">

```dts
namespace Csp {
	type ActionSource =
		| 'strict-dynamic'
		| 'report-sample'
		| 'report-sha256'
		| 'report-sha384'
		| 'report-sha512';
	type BaseSource =
		| 'self'
		| 'unsafe-eval'
		| 'unsafe-hashes'
		| 'unsafe-inline'
		| 'unsafe-allow-redirects'
		| 'unsafe-webtransport-hashes'
		| 'wasm-unsafe-eval'
		| 'trusted-types-eval'
		| 'none';
	type CryptoSource =
		`${'nonce' | 'sha256' | 'sha384' | 'sha512'}-${string}`;
	type FrameSource =
		HostSource | SchemeSource | 'self' | 'none';
	type HostNameScheme = `${string}.${string}` | 'localhost';
	type HostSource =
		`${HostProtocolSchemes}${HostNameScheme}${PortScheme}`;
	type HostProtocolSchemes = `${string}://` | '';
	type HttpDelineator = '/' | '?' | '#' | '\\';
	type PortScheme = `:${number}` | '' | ':*';
	type SchemeSource =
		| 'http:'
		| 'https:'
		| 'ws:'
		| 'wss:'
		| 'data:'
		| 'mediastream:'
		| 'blob:'
		| 'filesystem:'
		| (`${string}:` & {});
	type Source =
		HostSource | SchemeSource | CryptoSource | BaseSource;
	type Sources = Source[];
}
```

</div>

### CspDirectives

<div class="ts-block">

```dts
interface CspDirectives {/*…*/}
```

<div class="ts-block-property">

```dts
'child-src'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'default-src'?: Array<Csp.Source | Csp.ActionSource>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'frame-src'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'worker-src'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'connect-src'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'font-src'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'img-src'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'manifest-src'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'media-src'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'object-src'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'prefetch-src'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'script-src'?: Array<Csp.Source | Csp.ActionSource>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'script-src-elem'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'script-src-attr'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'style-src'?: Array<Csp.Source | Csp.ActionSource>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'style-src-elem'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'style-src-attr'?: Csp.Sources;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'base-uri'?: Array<Csp.Source | Csp.ActionSource>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
sandbox?: Array<
| 'allow-downloads-without-user-activation'
| 'allow-forms'
| 'allow-modals'
| 'allow-orientation-lock'
| 'allow-pointer-lock'
| 'allow-popups'
| 'allow-popups-to-escape-sandbox'
| 'allow-presentation'
| 'allow-same-origin'
| 'allow-scripts'
| 'allow-storage-access-by-user-activation'
| 'allow-top-navigation'
| 'allow-top-navigation-by-user-activation'
>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'form-action'?: Array<Csp.Source | Csp.ActionSource>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'frame-ancestors'?: Array<Csp.HostSource | Csp.SchemeSource | Csp.FrameSource>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'navigate-to'?: Array<Csp.Source | Csp.ActionSource>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'report-uri'?: string[];
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'report-to'?: string[];
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'require-trusted-types-for'?: Array<'script'>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'trusted-types'?: Array<'none' | 'allow-duplicates' | '*' | string>;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'upgrade-insecure-requests'?: boolean;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
'require-sri-for'?: Array<'script' | 'style' | 'script style'>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> 

</div>

</div>
</div>

<div class="ts-block-property">

```dts
'block-all-mixed-content'?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> 

</div>

</div>
</div>

<div class="ts-block-property">

```dts
'plugin-types'?: Array<`${string}/${string}` | 'none'>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> 

</div>

</div>
</div>

<div class="ts-block-property">

```dts
referrer?: Array<
| 'no-referrer'
| 'no-referrer-when-downgrade'
| 'origin'
| 'origin-when-cross-origin'
| 'same-origin'
| 'strict-origin'
| 'strict-origin-when-cross-origin'
| 'unsafe-url'
| 'none'
>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> 

</div>

</div>
</div></div>

### DeepPartial

<div class="ts-block">

```dts
type DeepPartial<T> = T extends
	Record<PropertyKey, unknown> | unknown[]
	? {
			[K in keyof T]?: T[K] extends
				Record<PropertyKey, unknown> | unknown[]
				? DeepPartial<T[K]>
				: T[K];
		}
	: T | undefined;
```

</div>

### HasNonOptionalBoolean

<div class="ts-block">

```dts
type HasNonOptionalBoolean<T> =
	IsAny<T> extends true
		? never
		: [T] extends [boolean]
			? true
			: T extends Array<infer U>
				? HasNonOptionalBoolean<U>
				: T extends Record<string, any>
					? {
							[K in keyof T]: [T[K]] extends [true]
								? never
								: HasNonOptionalBoolean<T[K]>;
						}[keyof T]
					: never;
```

</div>

### HttpMethod

<div class="ts-block">

```dts
type HttpMethod =
	| 'GET'
	| 'HEAD'
	| 'POST'
	| 'PUT'
	| 'DELETE'
	| 'PATCH'
	| 'OPTIONS'
	| 'QUERY';
```

</div>

### IsAny

<div class="ts-block">

```dts
type IsAny<T> = 0 extends 1 & T ? true : false;
```

</div>

### Logger

<div class="ts-block">

```dts
interface Logger {/*…*/}
```

<div class="ts-block-property">

```dts
(msg: string): void;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
success(msg: string): void;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
error(msg: string): void;
```

<div class="ts-block-property-details">

Print a bold red message to stderr

</div>
</div>

<div class="ts-block-property">

```dts
warn(msg: string): void;
```

<div class="ts-block-property-details">

Print a bold yellow message to stderr

</div>
</div>

<div class="ts-block-property">

```dts
minor(msg: string): void;
```

<div class="ts-block-property-details">

Print faded text to stdout if `verbose === true`

</div>
</div>

<div class="ts-block-property">

```dts
info(msg: string): void;
```

<div class="ts-block-property-details">

Print to stdout if `verbose === true`

</div>
</div>

<div class="ts-block-property">

```dts
err(msg: string): void;
```

<div class="ts-block-property-details">

Print to stderr without formatting

</div>
</div>

<div class="ts-block-property">

```dts
prettyError(error: unknown, caller?: string): void;
```

<div class="ts-block-property-details">

Print a bold red message, followed by a stack trace for each error (following `.cause` chains)

</div>
</div></div>

### MaybePromise

<div class="ts-block">

```dts
type MaybePromise<T> = T | Promise<T>;
```

</div>

### PrerenderEntryGeneratorMismatchHandler

<div class="ts-block">

```dts
interface PrerenderEntryGeneratorMismatchHandler {/*…*/}
```

<div class="ts-block-property">

```dts
(details: { generatedFromId: string; entry: string; matchedId: string; message: string }): void;
```

<div class="ts-block-property-details"></div>
</div></div>

### PrerenderEntryGeneratorMismatchHandlerValue

<div class="ts-block">

```dts
type PrerenderEntryGeneratorMismatchHandlerValue =
	| 'fail'
	| 'warn'
	| 'ignore'
	| PrerenderEntryGeneratorMismatchHandler;
```

</div>

### PrerenderHttpErrorHandler

<div class="ts-block">

```dts
interface PrerenderHttpErrorHandler {/*…*/}
```

<div class="ts-block-property">

```dts
(details: {
status: number;
path: string;
referrer: string | null;
referenceType: 'linked' | 'fetched';
message: string;
}): void;
```

<div class="ts-block-property-details"></div>
</div></div>

### PrerenderHttpErrorHandlerValue

<div class="ts-block">

```dts
type PrerenderHttpErrorHandlerValue =
	'fail' | 'warn' | 'ignore' | PrerenderHttpErrorHandler;
```

</div>

### PrerenderInvalidUrlHandler

<div class="ts-block">

```dts
interface PrerenderInvalidUrlHandler {/*…*/}
```

<div class="ts-block-property">

```dts
(details: { href: string; referrer: string | null; message: string }): void;
```

<div class="ts-block-property-details"></div>
</div></div>

### PrerenderInvalidUrlHandlerValue

<div class="ts-block">

```dts
type PrerenderInvalidUrlHandlerValue =
	'fail' | 'warn' | 'ignore' | PrerenderInvalidUrlHandler;
```

</div>

### PrerenderMap

<div class="ts-block">

```dts
type PrerenderMap = Map<string, PrerenderOption>;
```

</div>

### PrerenderMissingIdHandler

<div class="ts-block">

```dts
interface PrerenderMissingIdHandler {/*…*/}
```

<div class="ts-block-property">

```dts
(details: { path: string; id: string; referrers: string[]; message: string }): void;
```

<div class="ts-block-property-details"></div>
</div></div>

### PrerenderMissingIdHandlerValue

<div class="ts-block">

```dts
type PrerenderMissingIdHandlerValue =
	'fail' | 'warn' | 'ignore' | PrerenderMissingIdHandler;
```

</div>

### PrerenderOption

<div class="ts-block">

```dts
type PrerenderOption = boolean | 'auto';
```

</div>

### PrerenderUnseenRoutesHandler

<div class="ts-block">

```dts
interface PrerenderUnseenRoutesHandler {/*…*/}
```

<div class="ts-block-property">

```dts
(details: { routes: string[]; message: string }): void;
```

<div class="ts-block-property-details"></div>
</div></div>

### PrerenderUnseenRoutesHandlerValue

<div class="ts-block">

```dts
type PrerenderUnseenRoutesHandlerValue =
	'fail' | 'warn' | 'ignore' | PrerenderUnseenRoutesHandler;
```

</div>

### Prerendered

<div class="ts-block">

```dts
interface Prerendered {/*…*/}
```

<div class="ts-block-property">

```dts
pages: Map<
string,
{
	/** The location of the .html file relative to the output directory */
	file: string;
}
>;
```

<div class="ts-block-property-details">

A map of `path` to `{ file }` objects, where a path like `/foo` corresponds to `foo.html` and a path like `/bar/` corresponds to `bar/index.html`.

</div>
</div>

<div class="ts-block-property">

```dts
assets: Map<
string,
{
	/** The MIME type of the asset */
	type: string;
}
>;
```

<div class="ts-block-property-details">

A map of `path` to `{ type }` objects.

</div>
</div>

<div class="ts-block-property">

```dts
redirects: Map<
string,
{
	status: number;
	location: string;
}
>;
```

<div class="ts-block-property-details">

A map of redirects encountered during prerendering.

</div>
</div>

<div class="ts-block-property">

```dts
paths: string[];
```

<div class="ts-block-property-details">

An array of prerendered paths (without trailing slashes, regardless of the trailingSlash config)

</div>
</div></div>

### RequestOptions

<div class="ts-block">

```dts
interface RequestOptions {/*…*/}
```

<div class="ts-block-property">

```dts
getClientAddress(): string;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
platform?: App.Platform;
```

<div class="ts-block-property-details"></div>
</div></div>

### RouteSegment

<div class="ts-block">

```dts
interface RouteSegment {/*…*/}
```

<div class="ts-block-property">

```dts
content: string;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
dynamic: boolean;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
rest: boolean;
```

<div class="ts-block-property-details"></div>
</div></div>

### TrailingSlash

<div class="ts-block">

```dts
type TrailingSlash = 'never' | 'always' | 'ignore';
```

</div>

# @sveltejs/kit/adapter

```js
// @noErrors
import { applyReroute } from '@sveltejs/kit/adapter';
```

## applyReroute

<blockquote class="since note">

Available since 3.0.0

</blockquote>

Helps a catch-all request handler pass the request to a different handler if
the `reroute` hook has returned a URL pathname that's different from the
incoming request.

If your adapter is capable of deploying multiple serverless functions, it's a
good idea to also deploy a "catch-all" one to handle uncaught requests.
Running this in that function allows the app's `reroute` hook to rewrite
the request URL and invoke the next appropriate serverless function, if any.

<div class="ts-block">

```dts
function applyReroute(
	response: Response,
	next: (url: URL) => Response | Promise<Response>
): Response | Promise<Response>;
```

</div>

# @sveltejs/kit/env

```js
// @noErrors
import { defineEnvVars } from '@sveltejs/kit/env';
```

## defineEnvVars

Utility for defining [environment variables](/docs/kit/environment-variables),
which are made available via `$app/env/public` and `$app/env/private`.

```js
// @errors: 7031
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

export const variables = defineEnvVars({
	API_URL: {
		schema: v.pipe(v.string(), v.url())
	},
	PORT: {
		schema: (value) => {
			if (value === undefined) return 3000;
			const port = Number(value);
			if (!Number.isInteger(port)) throw new Error('PORT must be an integer');
			return port;
		}
	}
});
```

<div class="ts-block">

```dts
function defineEnvVars<
	T extends Record<string, EnvVarConfig<any>>
>(variables: T): DefinedEnvVars<T>;
```

</div>



## DefinedEnvVars

The return type of [`defineEnvVars`](/docs/kit/@sveltejs-kit-env#defineEnvVars).

<div class="ts-block">

```dts
type DefinedEnvVars<
	T extends Record<string, EnvVarConfig<any>>
> = {
	readonly [K in keyof T]: EnvVarEntry<T[K]>;
};
```

</div>

## EnvVarConfig

[Environment variables](/docs/kit/environment-variables) can be configured by exporting
a `variables` object from `src/env.ts`, using [`defineEnvVars`](/docs/kit/@sveltejs-kit-env#defineEnvVars).

<div class="ts-block">

```dts
interface EnvVarConfig<T> {/*…*/}
```

<div class="ts-block-property">

```dts
public?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`

</div>

Whether the environment variable can be accessed by client-side code.
- if `true`, it can be imported from `$app/env/public`
- if `false`, it can be imported from `$app/env/private`, which is a [server-only module](/docs/kit/server-only-modules)

</div>
</div>

<div class="ts-block-property">

```dts
static?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`

</div>

Whether the value is determined at build time or when the app runs.
- if `true`, the build time value is inlined into the bundle. This enables optimisations like dead-code elimination
- if `false`, the value is read from the environment when the app starts

</div>
</div>

<div class="ts-block-property">

```dts
schema?: StandardSchemaV1<string | undefined, T> | ((value: string | undefined) => T | undefined);
```

<div class="ts-block-property-details">

A [Standard Schema](https://standardschema.dev/) validator that is applied to the value when the app starts.
Alternatively, a function that returns the (possibly transformed) value, or throws an error explaining
the problem. Returning `undefined` is valid, so a function can describe an optional variable.
The validator can output any value — not necessarily a string — but public, non-static values must be
serializable by [devalue](https://github.com/sveltejs/devalue) so that they can be sent to the browser.

If omitted, the value must be set, but may be an empty string.

</div>
</div>

<div class="ts-block-property">

```dts
description?: string;
```

<div class="ts-block-property-details">

A description of the variable that will be used for inline documentation on hover.

</div>
</div></div>

# @sveltejs/kit/hooks

```js
// @noErrors
import { sequence } from '@sveltejs/kit/hooks';
```

## sequence

A helper function for sequencing multiple `handle` calls in a middleware-like manner.
The behavior for the `handle` options is as follows:
- `transformPageChunk` is applied in reverse order and merged
- `preload` is applied in forward order, the first option "wins" and no `preload` options after it are called
- `filterSerializedResponseHeaders` behaves the same as `preload`

```js
// @errors: 7031
/// file: src/hooks.server.js
import { sequence } from '@sveltejs/kit/hooks';

/** @type {import('@sveltejs/kit/hooks').Handle} */
async function first({ event, resolve }) {
	console.log('first pre-processing');
	const result = await resolve(event, {
		transformPageChunk: ({ html }) => {
			// transforms are applied in reverse order
			console.log('first transform');
			return html;
		},
		preload: () => {
			// this one wins as it's the first defined in the chain
			console.log('first preload');
			return true;
		}
	});
	console.log('first post-processing');
	return result;
}

/** @type {import('@sveltejs/kit/hooks').Handle} */
async function second({ event, resolve }) {
	console.log('second pre-processing');
	const result = await resolve(event, {
		transformPageChunk: ({ html }) => {
			console.log('second transform');
			return html;
		},
		preload: () => {
			console.log('second preload');
			return true;
		},
		filterSerializedResponseHeaders: () => {
			// this one wins as it's the first defined in the chain
			console.log('second filterSerializedResponseHeaders');
			return true;
		}
	});
	console.log('second post-processing');
	return result;
}

export const handle = sequence(first, second);
```

The example above would print:

```
first pre-processing
first preload
second pre-processing
second filterSerializedResponseHeaders
second transform
first transform
second post-processing
first post-processing
```

Calling `resolve` invokes the next handler in the sequence (or SvelteKit itself, if it is the last one). To pass data between handlers, use `event.locals`.

<div class="ts-block">

```dts
function sequence(...handlers: Handle[]): Handle;
```

</div>



## CaughtError

The error passed to the [`handleError`](/docs/kit/hooks#handleError) hooks.
Use the `kind` discriminant to distinguish errors from your app (thrown with the
[`error`](/docs/kit/errors#App-errors) helper), errors generated by
SvelteKit itself (such as 404s), validation errors, and unknown errors (thrown by your code,
or code it calls).

<div class="ts-block">

```dts
type CaughtError<
	Issue extends StandardSchemaV1.Issue =
		StandardSchemaV1.Issue
> =
	| {
			[Kind in keyof CaughtErrorMap]: {
				/** Identifies the category and origin of the error */
				kind: Kind;
				/** The caught error. Its type depends on `kind` */
				error: CaughtErrorMap[Kind];
				/** Only present for validation errors */
				issues?: undefined;
				/** Only present for validation errors */
				remote?: undefined;
			};
	  }[keyof CaughtErrorMap]
	| ValidationCaughtError<Issue>;
```

</div>

## ClientCaughtError

The error passed to the client-side `handleError` hook.

<div class="ts-block">

```dts
type ClientCaughtError = Exclude<
	CaughtError,
	{ kind: 'validation' }
>;
```

</div>

## ClientInit

<blockquote class="since note">

Available since 2.10.0

</blockquote>

The [`init`](/docs/kit/hooks#init) will be invoked once the app starts in the browser

<div class="ts-block">

```dts
type ClientInit = () => MaybePromise<void>;
```

</div>

## Handle

The [`handle`](/docs/kit/hooks#handle) hook runs every time the SvelteKit server receives a [request](/docs/kit/web-standards#Fetch-APIs-Request) and
determines the [response](/docs/kit/web-standards#Fetch-APIs-Response).
It receives an `event` object representing the request and a function called `resolve`, which renders the route and generates a `Response`.
This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing routes programmatically, for example).

<div class="ts-block">

```dts
type Handle = (input: {
	event: RequestEvent;
	resolve: (
		event: RequestEvent,
		opts?: ResolveOptions
	) => Promise<Response>;
}) => MaybePromise<Response>;
```

</div>

## HandleClientError

The client-side [`handleError`](/docs/kit/hooks#handleError) hook runs for every error thrown while navigating, except redirects.
Errors that were already transformed by the server-side hook are not passed to it a second time.

The `kind` property discriminates between _app_ errors (thrown with the [`error`](/docs/kit/errors#App-errors) helper),
_framework_ errors (generated by SvelteKit itself, such as 404s) and _unknown_ errors (thrown by your code, or code it calls).

The hook returns an object matching `App.Error`, in which `status` and `message` are optional — return them only to
override the defaults. Omitted properties are inherited from the caught error: the body passed to `error(...)` for app errors,
the status and safe message for framework errors, and `500`/`'Internal Error'` for unknown errors. Return nothing to
keep the defaults entirely (if you augment `App.Error` with required properties, you must return those).

Make sure that this function _never_ throws an error.

<div class="ts-block">

```dts
type HandleClientError = (
	input: ClientCaughtError & { event: NavigationEvent }
) => MaybePromise<
	| AppErrorWithOptionalDefaults
	| VoidIfNoRequiredAppErrorProperties
>;
```

</div>

## HandleFetch

The [`handleFetch`](/docs/kit/hooks#handleFetch) hook allows you to modify (or replace) the result of an [`event.fetch`](/docs/kit/load#Making-fetch-requests) call that runs on the server (or during prerendering) inside an endpoint, `load`, `action`, `handle`, `handleError` or `reroute`.

<div class="ts-block">

```dts
type HandleFetch = (input: {
	event: RequestEvent;
	request: Request;
	fetch: typeof fetch;
}) => MaybePromise<Response>;
```

</div>

## HandleServerError

The server-side [`handleError`](/docs/kit/hooks#handleError) hook runs for every error thrown while responding to a request, except redirects.

The `kind` property discriminates between _app_ errors (thrown with the [`error`](/docs/kit/errors#App-errors) helper),
_framework_ errors (generated by SvelteKit itself, such as 404s), _validation_ errors (caused by invalid remote function arguments)
and _unknown_ errors (thrown by your code, or code it calls).

The hook returns an object matching `App.Error`, in which `status` and `message` are optional — return them only to
override the defaults. Omitted properties are inherited from the caught error: the body passed to `error(...)` for app errors,
the status and safe message for framework and validation errors, and `500`/`'Internal Error'` for unknown errors. Return nothing to
keep the defaults entirely (if you augment `App.Error` with required properties, you must return those).

Make sure that this function _never_ throws an error.

<div class="ts-block">

```dts
type HandleServerError<
	Issue extends StandardSchemaV1.Issue =
		StandardSchemaV1.Issue
> = (
	input: CaughtError<Issue> & { event: RequestEvent }
) => MaybePromise<
	| AppErrorWithOptionalDefaults
	| VoidIfNoRequiredAppErrorProperties
>;
```

</div>

## Reroute

<blockquote class="since note">

Available since 2.3.0

</blockquote>

The [`reroute`](/docs/kit/hooks#reroute) hook allows you to modify the URL before it is used to determine which route to render.

<div class="ts-block">

```dts
type Reroute = (event: {
	url: URL;
	fetch: typeof fetch;
}) => MaybePromise<void | string>;
```

</div>

## ResolveOptions

<div class="ts-block">

```dts
interface ResolveOptions {/*…*/}
```

<div class="ts-block-property">

```dts
transformPageChunk?: (input: { html: string; done: boolean }) => MaybePromise<string | undefined>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `input` the html chunk and the info if this is the last chunk

</div>

Applies custom transforms to HTML. If `done` is true, it's the final chunk. Chunks are not guaranteed to be well-formed HTML
(they could include an element's opening tag but not its closing tag, for example)
but they will always be split at sensible boundaries such as `%sveltekit.head%` or layout/page components.

</div>
</div>

<div class="ts-block-property">

```dts
filterSerializedResponseHeaders?: (name: string, value: string) => boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `name` header name
- `value` header value

</div>

Determines which headers should be included in serialized responses when a `load` function loads a resource with `fetch`.
By default, none will be included.

</div>
</div>

<div class="ts-block-property">

```dts
preload?: (
	input:
		| { type: 'css' | 'js' | 'asset'; path: string }
		| { type: 'font'; path: string; filename: string }
) => boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- `input` the type of the file and its path

</div>

Determines which files should be preloaded. Files are preloaded via `<link>` tags added to the
`<head>` tag; if `output.linkHeaderPreload` is enabled, dynamically rendered pages use the
[`Link` response header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Link) instead.
By default, `js` and `css` files will be preloaded.

For `font` files, `input` also has a `filename` property, the source file's pathname relative
to the project root, so that a filter can match on it instead of the hashed path. `js` and
`css` files are bundled and have no single source file name.

</div>
</div></div>

## ServerInit

<blockquote class="since note">

Available since 2.10.0

</blockquote>

The [`init`](/docs/kit/hooks#init) will be invoked before the server responds to its first request

<div class="ts-block">

```dts
type ServerInit = () => MaybePromise<void>;
```

</div>

## Transport

<blockquote class="since note">

Available since 2.11.0

</blockquote>

The [`transport`](/docs/kit/hooks#transport) hook allows you to transport custom types across the server/client boundary.

Each transporter has a pair of `encode` and `decode` functions. On the server, `encode` determines whether a value is an instance of the custom type and, if so, returns a non-falsy encoding of the value which can be an object or an array (or `false` otherwise).

In the browser, `decode` turns the encoding back into an instance of the custom type.

```ts
import type { Transport } from '@sveltejs/kit/hooks';

declare class MyCustomType {
	data: any
}

// hooks.js
export const transport: Transport = {
	MyCustomType: {
		encode: (value) => value instanceof MyCustomType && [value.data],
		decode: ([data]) => new MyCustomType(data)
	}
};
```

<div class="ts-block">

```dts
type Transport = Record<string, Transporter>;
```

</div>

## Transporter

A member of the [`transport`](/docs/kit/hooks#transport) hook.

<div class="ts-block">

```dts
interface Transporter<
	T = any,
	U =
		any /* minus falsy values, but we can't properly express that */
> {/*…*/}
```

<div class="ts-block-property">

```dts
encode: (value: T) => false | U;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
decode: (data: U) => T;
```

<div class="ts-block-property-details"></div>
</div></div>

# @sveltejs/kit/node

```js
// @noErrors
import {
	createReadableStream,
	getRequest,
	setResponse
} from '@sveltejs/kit/node';
```

## createReadableStream

<blockquote class="since note">

Available since 2.4.0

</blockquote>

Converts a file on disk to a readable stream

<div class="ts-block">

```dts
function createReadableStream(file: string): ReadableStream;
```

</div>



## getRequest

<div class="ts-block">

```dts
function getRequest({
	request,
	response,
	base,
	bodySizeLimit
}: {
	request: import('http').IncomingMessage;
	response?: import('http').ServerResponse;
	base: string;
	bodySizeLimit?: number;
}): Request;
```

</div>



## setResponse

<div class="ts-block">

```dts
function setResponse(
	res: import('http').ServerResponse,
	response: Response
): void;
```

</div>

# @sveltejs/kit/params

```js
// @noErrors
import { defineParams } from '@sveltejs/kit/params';
```

## defineParams

Define [parameter matchers](/docs/kit/advanced-routing#Matching) for your app.

<div class="ts-block">

```dts
function defineParams<
	T extends Record<string, ParamDefinition>
>(definitions: T): DefinedParams<T>;
```

</div>



## DefinedParams

The return type of [`defineParams`](/docs/kit/@sveltejs-kit-params#defineParams).

<div class="ts-block">

```dts
type DefinedParams<
	T extends Record<string, ParamDefinition>
> = {
	readonly [K in keyof T]: ParamEntry<T[K]>;
};
```

</div>

## MatcherParam

Extracts the param type from a matcher.

<div class="ts-block">

```dts
type MatcherParam<M extends StandardSchemaV1<any, any>> =
	M extends StandardSchemaV1<any, infer Inner>
		? Inner extends ParamValue
			? Inner
			: Inner extends StandardSchemaV1<any, any>
				? StandardSchemaV1.InferOutput<Inner> extends ParamValue
					? StandardSchemaV1.InferOutput<Inner>
					: never
				: never
		: never;
```

</div>

## ParamDefinition

A param matcher definition passed to [`defineParams`](/docs/kit/@sveltejs-kit-params#defineParams).

<div class="ts-block">

```dts
type ParamDefinition =
	| ((param: string) => ParamValue | undefined)
	| StandardSchemaV1<string, ParamValue>;
```

</div>

## ParamMatcher

The shape of a param matcher. See [matching](/docs/kit/advanced-routing#Matching) for more info.

<div class="ts-block">

```dts
type ParamMatcher<Output = any> = StandardSchemaV1<
	string,
	Output
>;
```

</div>

## ParamValue

A value that can be parsed from a URL param and losslessly encoded with `String(...)`.

<div class="ts-block">

```dts
type ParamValue = string | number | boolean | bigint;
```

</div>

# @sveltejs/kit/vite

## sveltekit

The SvelteKit Vite plugin, which must be added to your `vite.config.js` file along with your project's configuration:

```js
// @errors: 7031
/// file: vite.config.js
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
			compilerOptions: {
				experimental: {
					async: true
				}
			},
			experimental: {
				remoteFunctions: true
			}
		})
	]
});
```

As well as SvelteKit, the plugin options are used by other tooling that integrates with Svelte such as editor extensions.

Any options that don't belong to SvelteKit are passed through to [`vite-plugin-svelte`](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/config.md), so you can set options like `inspector` here too. The `experimental` namespace is shared — SvelteKit reads its own flags and forwards the rest.

> [!LEGACY]
> Prior to SvelteKit 3, config lived in a `svelte.config.js` file, which is no longer supported. The ability to configure SvelteKit via `vite.config.js` was added in version 2.62.

<div class="ts-block">

```dts
function sveltekit(config?: Config): Promise<Plugin[]>;
```

</div>



## Config

An extension of [`vite-plugin-svelte`'s options](https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/config.md#svelte-options).

## adapter

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `undefined`

</div>

Your [adapter](/docs/kit/adapters) is run when executing `vite build`. It determines how the output is converted for different platforms.

<div class="ts-block-property-children">



</div>

## alias

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> 
- <span class="tag">default</span> `{}`

</div>

An object containing zero or more aliases used to replace values in `import` statements. These aliases are automatically passed to Vite and TypeScript.

This option is deprecated. Use [subpath imports](/docs/kit/$lib) instead.

> [!NOTE] You will need to run `npm run dev` to have SvelteKit automatically generate the required alias configuration in `jsconfig.json` or `tsconfig.json`.

<div class="ts-block-property-children">



</div>

## appDir

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `"_app"`

</div>

The directory where SvelteKit keeps its stuff, including static assets (such as JS and CSS) and internally-used routes.

If `paths.assets` is specified, there will be two app directories — `${paths.assets}/${appDir}` and `${paths.base}/${appDir}`.

<div class="ts-block-property-children">



</div>

## csp

<div class="ts-block-property-bullets">



</div>

[Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy) configuration. CSP helps to protect your users against cross-site scripting (XSS) attacks, by limiting the places resources can be loaded from. For example, a configuration like this...

```js
// @errors: 7031
/// file: vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			csp: {
				directives: {
					'script-src': ['self']
				},
				// must be specified with either the `report-uri` or `report-to` directives, or both
				reportOnly: {
					'script-src': ['self'],
					'report-uri': ['/']
				}
			}
		})
	]
});
```

...would prevent scripts loading from external sites. SvelteKit will augment the specified directives with nonces or hashes (depending on `mode`) for any inline styles and scripts it generates.

To add a nonce for scripts and links manually included in `src/app.html`, you may use the placeholder `%sveltekit.nonce%` (for example `<script nonce="%sveltekit.nonce%">`).

When pages are prerendered, the CSP header is added via a `<meta http-equiv>` tag (note that in this case, `frame-ancestors`, `report-uri` and `sandbox` directives will be ignored).

> [!NOTE] When `mode` is `'auto'`, SvelteKit will use nonces for dynamically rendered pages and hashes for prerendered pages. Using nonces with prerendered pages is insecure and therefore forbidden.

If this level of configuration is insufficient and you have more dynamic requirements, you can use the [`handle` hook](/docs/kit/hooks#handle) to roll your own CSP.

<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
mode?: 'hash' | 'nonce' | 'auto';
```

<div class="ts-block-property-details">

Whether to use hashes or nonces to restrict `<script>` and `<style>` elements. `'auto'` will use hashes for prerendered pages, and nonces for dynamically rendered pages.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
directives?: CspDirectives;
```

<div class="ts-block-property-details">

Directives that will be added to `Content-Security-Policy` headers.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
reportOnly?: CspDirectives;
```

<div class="ts-block-property-details">

Directives that will be added to `Content-Security-Policy-Report-Only` headers.

</div>
</div>

</div>

## csrf

<div class="ts-block-property-bullets">



</div>

Protection against [cross-site request forgery (CSRF)](https://owasp.org/www-community/attacks/csrf) attacks.

<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
checkOrigin?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `true`
- <span class="tag deprecated">deprecated</span> removed in 3.0. Use `trustedOrigins: ['*']` instead

</div>

Whether to check the incoming `origin` header for `POST`, `PUT`, `PATCH`, or `DELETE` form submissions and verify that it matches the server's origin.

To allow people to make `POST`, `PUT`, `PATCH`, or `DELETE` requests with a `Content-Type` of `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain` to your app from other origins, you will need to disable this option. Be careful!

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
trustedOrigins?: string[];
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `[]`

</div>

An array of origins that are allowed to make cross-origin form submissions to your app.

Each origin should be a complete origin including protocol (e.g., `https://payment-gateway.com`).
This is useful for allowing trusted third-party services like payment gateways or authentication providers to submit forms to your app.

If the array contains `'*'`, all origins will be trusted. This is generally not recommended!

> [!NOTE] Only add origins you completely trust, as this bypasses CSRF protection for those origins.

CSRF checks only apply in production, not in local development.

</div>
</div>

</div>

## embedded

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`

</div>

Whether or not the app is embedded inside a larger app. If `true`, SvelteKit will add its event listeners related to navigation etc on the parent of `%sveltekit.body%` instead of `window`, and will pass `params` from the server rather than inferring them from `location.pathname`.
Note that it is generally not supported to embed multiple SvelteKit apps on the same page and use client-side SvelteKit features within them (things such as pushing to the history state assume a single instance).

<div class="ts-block-property-children">



</div>

## env

<div class="ts-block-property-bullets">



</div>

Environment variable configuration

<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
dir?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `"."`

</div>

The directory to search for `.env` files.

</div>
</div>

</div>

## experimental

<div class="ts-block-property-bullets">



</div>

Experimental features. Here be dragons. These are not subject to semantic versioning, so breaking changes or removal can happen in any release.

<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
remoteFunctions?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`

</div>

Whether to enable the experimental remote functions feature. This feature is not yet stable and may be changed or removed at any time.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
forkPreloads?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`

</div>

Whether to enable the experimental forked preloading feature using Svelte's fork API.

</div>
</div>

</div>

## files

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead

</div>

Where to find various files within your project.

<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
src?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead
- <span class="tag">default</span> `"src"`
- <span class="tag since">available since</span> v2.28

</div>

The location of your source code.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
assets?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead
- <span class="tag">default</span> `"static"`

</div>

A place to put static files that should have stable URLs and undergo no processing, such as `favicon.ico` or `manifest.json`.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
hooks?: {/*…*/};
```

<div class="ts-block-property-details">

<div class="ts-block-property-children"><div class="ts-block-property">

```ts
// @noErrors
client?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead
- <span class="tag">default</span> `"src/hooks.client"`

</div>

The location of your client [hooks](/docs/kit/hooks).

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
server?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead
- <span class="tag">default</span> `"src/hooks.server"`

</div>

The location of your server [hooks](/docs/kit/hooks).

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
universal?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead
- <span class="tag">default</span> `"src/hooks"`
- <span class="tag since">available since</span> v2.3.0

</div>

The location of your universal [hooks](/docs/kit/hooks).

</div>
</div></div>

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
params?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead
- <span class="tag">default</span> `"src/params"`

</div>

A directory containing [parameter matchers](/docs/kit/advanced-routing#Matching).

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
routes?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead
- <span class="tag">default</span> `"src/routes"`

</div>

The files that define the structure of your app (see [Routing](/docs/kit/routing)).

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
serviceWorker?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead
- <span class="tag">default</span> `"src/service-worker"`

</div>

The location of your service worker's entry point (see [Service workers](/docs/kit/service-workers)).

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
appTemplate?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead
- <span class="tag">default</span> `"src/app.html"`

</div>

The location of the template for HTML responses.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
errorTemplate?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> this feature is still supported, but it's generally recommended to use [monorepos](https://levelup.video/tutorials/monorepos-with-pnpm) instead
- <span class="tag">default</span> `"src/error.html"`

</div>

The location of the template for fallback error responses.

</div>
</div>

</div>

## inlineStyleThreshold

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `0`

</div>

Inline CSS inside a `<style>` block at the head of the HTML. This option is a number that specifies the maximum length of a CSS file in UTF-16 code units, as specified by the [String.length](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/length) property, to be inlined. All CSS files needed for the page that are smaller than this value are merged and inlined in a `<style>` block.

> [!NOTE] This results in fewer initial requests and can improve your [First Contentful Paint](https://web.dev/first-contentful-paint) score. However, it generates larger HTML output and reduces the effectiveness of browser caches. Use it advisedly.

<div class="ts-block-property-children">



</div>

## moduleExtensions

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `[".js", ".ts"]`

</div>

An array of file extensions that SvelteKit will treat as modules. Files with extensions that match neither `config.extensions` nor `config.moduleExtensions` will be ignored.

<div class="ts-block-property-children">



</div>

## outDir

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `".svelte-kit"`

</div>

The directory that SvelteKit writes files to during `dev` and `build`. You should exclude this directory from version control.

<div class="ts-block-property-children">



</div>

## output

<div class="ts-block-property-bullets">



</div>

Options related to the build output format

<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
linkHeaderPreload?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`
- <span class="tag since">available since</span> v3.0.0

</div>

Whether to use the [HTTP `Link` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Link) to preload assets instead of the [`<link>` HTML element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/link) for non-prerendered pages.

Note that some web servers such as Nginx and Apache have a default header size limit which may be easily exceeded.
If you are using one of these web servers, you may want to leave this as `false` or configure a higher limit.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
preloadStrategy?: 'modulepreload' | 'preload-js' | 'preload-mjs';
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `"modulepreload"`
- <span class="tag since">available since</span> v1.8.4
- <span class="tag deprecated">deprecated</span> removed in 3.0

</div>

SvelteKit will preload the JavaScript modules needed for the initial page to avoid import 'waterfalls', resulting in faster application startup. There
are three strategies with different trade-offs:
- `modulepreload` - uses `<link rel="modulepreload">`. This delivers the best results in Chromium-based browsers, in Firefox 115+, and Safari 17+. It is ignored in older browsers.
- `preload-js` - uses `<link rel="preload">`. Prevents waterfalls in Chromium and Safari, but Chromium will parse each module twice (once as a script, once as a module). Causes modules to be requested twice in Firefox. This is a good setting if you want to maximise performance for users on iOS devices at the cost of a very slight degradation for Chromium users.
- `preload-mjs` - uses `<link rel="preload">` but with the `.mjs` extension which prevents double-parsing in Chromium. Some static webservers will fail to serve .mjs files with a `Content-Type: application/javascript` header, which will cause your application to break. If that doesn't apply to you, this is the option that will deliver the best performance for the largest number of users, until `modulepreload` is more widely supported.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
bundleStrategy?: 'split' | 'single' | 'inline';
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `'split'`
- <span class="tag since">available since</span> v2.13.0

</div>

The bundle strategy option affects how your app's JavaScript and CSS files are loaded.
- If `'split'`, splits the app up into multiple .js/.css files so that they are loaded lazily as the user navigates around the app. This is the default, and is recommended for most scenarios.
- If `'single'`, creates just one .js bundle and one .css file containing code for the entire app.
- If `'inline'`, inlines all JavaScript and CSS of the entire app into the HTML. The result is usable without a server (i.e. you can just open the file in your browser).

When using `'split'`, you can also adjust the bundling behaviour by setting [`output.codeSplitting`](https://rolldown.rs/reference/OutputOptions.codeSplitting) inside your Vite config's [`build.rolldownOptions`](https://vite.dev/config/build-options#build-rolldownoptions).

If you want to inline your assets, you'll need to set Vite's [`build.assetsInlineLimit`](https://vite.dev/config/build-options.html#build-assetsinlinelimit) option to an appropriate size then import your assets through Vite.

```js
// @errors: 7031
/// file: vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		// inline all imported assets
		assetsInlineLimit: Infinity
	}
});
```

```svelte
/// file: src/routes/+layout.svelte
<script>
	// import the asset through Vite
	import favicon from './favicon.png';
</script>

<svelte:head>
	<!-- this asset will be inlined as a base64 URL -->
	<link rel="icon" href={favicon} />
</svelte:head>
```

</div>
</div>

</div>

## paths

<div class="ts-block-property-bullets">



</div>



<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
assets?: '' | `http://${string}` | `https://${string}`;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `""`

</div>

An absolute path that your app's files are served from. This is useful if your files are served from a storage bucket of some kind.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
base?: '' | `/${string}`;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `""`

</div>

A root-relative path that must start, but not end with `/` (e.g. `/base-path`), unless it is the empty string. This specifies where your app is served from and allows the app to live on a non-root path. Note that you need to prepend all your root-relative links with the base value or they will point to the root of your domain, not your `base` (this is how the browser works). You can use [`resolve(...)` from `$app/paths`](/docs/kit/$app-paths#resolve) for that: `<a href="{resolve('/your-page')}">Link</a>`. If you find yourself writing this often, it may make sense to extract this into a reusable component.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
origin?: string;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `undefined`
- <span class="tag since">available since</span> v3.0

</div>

The origin of your app, used for CSRF protection and prerendering.

By default, this is `undefined`, meaning SvelteKit will derive the origin from `request.url` (which is set by the adapter, and ultimately by the platform).

If your app is served from an origin that isn't known at request time — for example because it's deployed to a preview deployment whose URL isn't known at build time, or because it's behind a reverse proxy that doesn't pass the `host` header — you can set this to a string like `https://my-site.com`.

This is also used as the value of `url.origin` during prerendering (when unset, it defaults to `http://sveltekit-prerender`), and as the trusted origin for CSRF checks on form submissions and remote function calls.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
relative?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `true`
- <span class="tag since">available since</span> v1.9.0

</div>

Whether to use relative asset paths.

If `true`, paths created with `resolve()` and `asset()` imported from `$app/paths` will be replaced with relative asset paths during server-side rendering, resulting in more portable HTML.
If `false`, `%sveltekit.assets%` and references to build artifacts will always be root-relative paths, unless `paths.assets` is an external URL

[Single-page app](/docs/kit/single-page-apps) fallback pages will always use absolute paths, regardless of this setting.

If your app uses a `<base>` element, you should set this to `false`, otherwise asset URLs will incorrectly be resolved against the `<base>` URL rather than the current page.

In 1.0, `undefined` was a valid value, which was set by default. In that case, if `paths.assets` was not external, SvelteKit would replace `%sveltekit.assets%` with a relative path and use relative paths to reference build artifacts, but `base` and `assets` imported from `$app/paths` would be as specified in your config.

</div>
</div>

</div>

## prerender

<div class="ts-block-property-bullets">



</div>

See [Prerendering](/docs/kit/page-options#prerender).

<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
concurrency?: number;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `1`

</div>

How many pages can be prerendered simultaneously. JS is single-threaded, but in cases where prerendering performance is network-bound (for example loading content from a remote CMS) this can speed things up by processing other tasks while waiting on the network response.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
crawl?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `true`

</div>

Whether SvelteKit should find pages to prerender by following links from `entries`.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
entries?: Array<'*' | `/${string}`>;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `["*"]`

</div>

An array of pages to prerender, or start crawling from (if `crawl: true`). The `*` string includes all routes containing no required `[parameters]` with optional parameters included as being empty (since SvelteKit doesn't know what value any parameters should have).

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
handleHttpError?: PrerenderHttpErrorHandlerValue;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `"fail"`
- <span class="tag since">available since</span> v1.15.7

</div>

How to respond to HTTP errors encountered while prerendering the app.

- `'fail'` — fail the build
- `'ignore'` - silently ignore the failure and continue
- `'warn'` — continue, but print a warning
- `(details) => void` — a custom error handler that takes a `details` object with `status`, `path`, `referrer`, `referenceType` and `message` properties. If you `throw` from this function, the build will fail

```js
// @errors: 7031
/// file: vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
 		prerender: {
 			handleHttpError: ({ path, referrer, message }) => {
					// ignore deliberate link to shiny 404 page
					if (path === '/not-found' && referrer === '/blog/how-we-built-our-404-page') {
						return;
					}

					// otherwise fail the build
					throw new Error(message);
				}
			}
		})
	]
});
```

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
handleMissingId?: PrerenderMissingIdHandlerValue;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `"fail"`
- <span class="tag since">available since</span> v1.15.7

</div>

How to respond when hash links from one prerendered page to another don't correspond to an `id` on the destination page.

- `'fail'` — fail the build
- `'ignore'` - silently ignore the failure and continue
- `'warn'` — continue, but print a warning
- `(details) => void` — a custom error handler that takes a `details` object with `path`, `id`, `referrers` and `message` properties. If you `throw` from this function, the build will fail

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
handleEntryGeneratorMismatch?: PrerenderEntryGeneratorMismatchHandlerValue;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `"fail"`
- <span class="tag since">available since</span> v1.16.0

</div>

How to respond when an entry generated by the `entries` export doesn't match the route it was generated from.

- `'fail'` — fail the build
- `'ignore'` - silently ignore the failure and continue
- `'warn'` — continue, but print a warning
- `(details) => void` — a custom error handler that takes a `details` object with `generatedFromId`, `entry`, `matchedId` and `message` properties. If you `throw` from this function, the build will fail

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
handleUnseenRoutes?: PrerenderUnseenRoutesHandlerValue;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `"fail"`
- <span class="tag since">available since</span> v2.16.0

</div>

How to respond when a route is marked as prerenderable but has not been prerendered.

- `'fail'` — fail the build
- `'ignore'` - silently ignore the failure and continue
- `'warn'` — continue, but print a warning
- `(details) => void` — a custom error handler that takes a `details` object with a `routes` property which contains all routes that haven't been prerendered. If you `throw` from this function, the build will fail

The default behavior is to fail the build. This may be undesirable when you know that some of your routes may never be reached under certain
circumstances such as a CMS not returning data for a specific area, resulting in certain routes never being reached.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
handleInvalidUrl?: PrerenderInvalidUrlHandlerValue;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `"fail"`
- <span class="tag since">available since</span> v2.67.0

</div>

How to respond when SvelteKit encounters a URL it cannot parse while crawling prerendered HTML (for example, an AT Protocol URL such as `at://did:plc:...`).

- `'fail'` — fail the build
- `'ignore'` - silently ignore the failure and continue
- `'warn'` — continue, but print a warning
- `(details) => void` — a custom error handler that takes a `details` object with `href`, `referrer` and `message` properties. If you `throw` from this function, the build will fail

</div>
</div>

</div>

## router

<div class="ts-block-property-bullets">



</div>



<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
type?: 'pathname' | 'hash';
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `"pathname"`
- <span class="tag since">available since</span> v2.14.0

</div>

What type of client-side router to use.
- `'pathname'` is the default and means the current URL pathname determines the route
- `'hash'` means the route is determined by `location.hash`. In this case, SSR and prerendering are disabled. This is only recommended if `pathname` is not an option, for example because you don't control the webserver where your app is deployed.
 It comes with some caveats: you can't use server-side rendering (or indeed any server logic), and you have to make sure that the links in your app all start with #/, or they won't work. Beyond that, everything works exactly like a normal SvelteKit app.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
resolution?: 'client' | 'server';
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `"client"`
- <span class="tag since">available since</span> v2.17.0

</div>

How to determine which route to load when navigating to a new page.

By default, SvelteKit will serve a route manifest to the browser.
When navigating, this manifest is used (along with the `reroute` hook, if it exists) to determine which components to load and which `load` functions to run.
Because everything happens on the client, this decision can be made immediately. The drawback is that the manifest needs to be
loaded and parsed before the first navigation can happen, which may have an impact if your app contains many routes.

Alternatively, SvelteKit can determine the route on the server. This means that for every navigation to a path that has not yet been visited, the server will be asked to determine the route.
This has several advantages:
- The client does not need to load the routing manifest upfront, which can lead to faster initial page loads
- The list of routes is hidden from public view
- The server has an opportunity to intercept each navigation (for example through middleware in front of SvelteKit, such as a reverse proxy or your platform's edge functions), enabling (for example) A/B testing opaque to SvelteKit

Route resolution requests are answered as soon as the route has been looked up, before the `handle` hook is invoked. To intercept them within SvelteKit itself, use the `reroute` hook, which runs for these requests too.

The drawback is that for unvisited paths, resolution will take slightly longer (though this is mitigated by [preloading](/docs/kit/link-options#data-sveltekit-preload-data)).

> [!NOTE] When using server-side route resolution and prerendering, the resolution is prerendered along with the route itself.

</div>
</div>

</div>

## serviceWorker

<div class="ts-block-property-bullets">



</div>



<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
register: true;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `true`

</div>

Whether to automatically register the service worker, if it exists.

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
options?: RegistrationOptions;
```

<div class="ts-block-property-details">

Options for serviceWorker.register("...", options);

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
register?: false;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `true`

</div>

Whether to automatically register the service worker, if it exists.

</div>
</div>

</div>

## tracing

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `{ server: false }`

</div>

Options for enabling [OpenTelemetry](https://opentelemetry.io/) tracing for SvelteKit operations.

<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
server?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`

</div>

Enables server-side [OpenTelemetry](https://opentelemetry.io/) span emission for SvelteKit operations including the [`handle` hook](/docs/kit/hooks#handle), [`load` functions](/docs/kit/load), [form actions](/docs/kit/form-actions), [`+server` handlers](/docs/kit/routing#server), and [remote functions](/docs/kit/remote-functions). Tracing — and more significantly, observability instrumentation — can have a nontrivial overhead, so consider whether you really need it, or if it might be more appropriate to turn it on in development and preview environments only.

</div>
</div>

</div>

## typescript

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> Add configuration to `tsconfig.json` directly

</div>



<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
config?: (config: Record<string, any>) => Record<string, any> | void;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag since">available since</span> v1.3.0

</div>

A function that allows you to edit the generated `tsconfig.json`. You can mutate the config (recommended) or return a new one.
This is useful for extending a shared `tsconfig.json` in a monorepo root, for example.

Note that any paths configured here should be relative to the generated config file, which is written to `node_modules/$app/tsconfig.json`.

</div>
</div>

</div>

## version

<div class="ts-block-property-bullets">



</div>

Client-side navigation can be buggy if you deploy a new version of your app while people are using it. If the code for the new page is already loaded, it may have stale content; if it isn't, the app's route manifest may point to a JavaScript file that no longer exists.
SvelteKit helps you solve this problem through version management. The current version is included in data, remote, and form action responses via the `x-sveltekit-version` header, so SvelteKit can detect new deployments without polling — for example when a navigation triggers a server `load` function, or when a remote function is called. SvelteKit also checks for new versions when the tab regains focus or becomes visible.
If SvelteKit encounters an error while loading the page and detects that a new version has been deployed (using the `name` specified here, which defaults to a timestamp of the build) it will fall back to traditional full-page navigation.
Not all navigations will result in an error though, for example if the JavaScript for the next page is already loaded. If you still want to force a full-page navigation in these cases, use `beforeNavigate`:
```html
/// file: +layout.svelte
<script>
	import { beforeNavigate } from '$app/navigation';
	import { updated } from '$app/state';

	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) {
			location.href = to.url.href;
		}
	});
</script>
```

In addition to these checks, SvelteKit polls for new versions on an interval and sets [`updated.current`](/docs/kit/$app-state#updated) to `true` when it detects one. Set `pollInterval` to `0` to disable polling (the header- and event-based checks will still run).

<div class="ts-block-property-children">

<div class="ts-block-property">

```ts
// @noErrors
name?: string;
```

<div class="ts-block-property-details">

The current app version string. If specified, this must be deterministic (e.g. a commit ref rather than `Math.random()` or `Date.now().toString()`), otherwise defaults to a timestamp of the build.

For example, to use the current commit hash, you could do use `git rev-parse HEAD`:

```js
// @errors: 7031
/// file: vite.config.js
import * as child_process from 'node:child_process';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
 		version: {
				name: child_process.execSync('git rev-parse HEAD').toString().trim()
			}
		})
	]
});
```

</div>
</div>
<div class="ts-block-property">

```ts
// @noErrors
pollInterval?: number;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `3600000`

</div>

The interval in milliseconds to poll for version changes. If this is `0`, no polling occurs. SvelteKit also checks for new versions on server responses (via the `x-sveltekit-version` header) and when the tab regains focus or becomes visible, so polling is only needed for long-lived sessions on a single page.

</div>
</div>

</div>

# $app/env

```js
// @noErrors
import { browser, building, dev, version } from '$app/env';
```

## browser

`true` if the app is running in the browser.

<div class="ts-block">

```dts
const browser: boolean;
```

</div>



## building

SvelteKit analyses your app during the `build` step by running it. During this process, `building` is `true`. This also applies during prerendering.

<div class="ts-block">

```dts
const building: boolean;
```

</div>



## dev

Whether the dev server is running. This is not guaranteed to correspond to `NODE_ENV` or `MODE`.

<div class="ts-block">

```dts
const dev: boolean;
```

</div>



## version

The value of `config.version.name`.

<div class="ts-block">

```dts
const version: string;
```

</div>

# $app/env/private

Private environment variables defined in `src/env.ts` (or `src/env.js`).

See the [Environment variables](environment-variables) page for more information.

# $app/env/public

Public environment variables defined in `src/env.ts` (or `src/env.js`).

See the [Environment variables](environment-variables) page for more information.

# $app/forms

```js
// @noErrors
import { applyAction, deserialize, enhance } from '$app/forms';
```

## applyAction

Updates the `form` property of the current page with the given data and updates `page.status`.
In case of an error, it renders the nearest error page. In case of a redirect, it navigates to
the redirect location.

<div class="ts-block">

```dts
function applyAction<
	Success extends Record<string, unknown> | undefined,
	Failure extends Record<string, unknown> | undefined
>(result: ActionResult<Success, Failure>): Promise<void>;
```

</div>



## deserialize

Use this function to deserialize the response from a form submission.
Usage:

```js
// @errors: 7031
import { deserialize } from '$app/forms';

async function handleSubmit(event) {
	const response = await fetch('/form?/action', {
		method: 'POST',
		body: new FormData(event.target)
	});

	const result = deserialize(await response.text());
	// ...
}
```

<div class="ts-block">

```dts
function deserialize<
	Success extends Record<string, unknown> | undefined,
	Failure extends Record<string, unknown> | undefined
>(result: string): ActionResult<Success, Failure>;
```

</div>



## enhance

This action enhances a `<form>` element that otherwise would work without JavaScript.

The `submit` function is called upon submission with the given FormData and the `action` that should be triggered.
If `cancel` is called, the form will not be submitted.
You can use the abort `controller` to cancel the submission in case another one starts.
If a function is returned, that function is called with the response from the server.
If nothing is returned, the fallback will be used.

If this function or its return value isn't set, it emulates the browser-native behaviour, just without the full-page reload. It
- resets the `<form>` element and refreshes all data in case of a successful submission with no redirect response
- updates the `form` prop, `page.form` and `page.status` if the action is on the same page as the form
- navigates to the page the submission lands on — populating that page's `form` prop and `page.status` — on success and failure if that isn't the current page, just as a native form submission would, but with the `?/actionName` param stripped from the destination URL
- redirects in case of a redirect response
- renders the nearest error page in case of an unexpected error — the one nearest the action's route, if the action is on a different page

If you provide a custom function with a callback and want to use the default behavior, invoke `update` in your callback.
It accepts an options object
- `reset: false` if you don't want the `<form>` values to be reset after a successful submission
- `refreshAll` to control whether all data is refreshed after submission; it defaults to `true` for successes and `false` for failures
- `navigate: false` to apply non-redirect results to the current page rather than navigating to `result.location`; redirects are always followed

<div class="ts-block">

```dts
function enhance<
	Success extends Record<string, unknown> | undefined,
	Failure extends Record<string, unknown> | undefined
>(
	form_element: HTMLFormElement,
	submit?: SubmitFunction<Success, Failure>
): {
	destroy(): void;
};
```

</div>



## ActionResult

When calling a form action via fetch, the response will be one of these shapes.
```svelte
<form method="post" use:enhance={() => {
	return ({ result }) => {
		// result is of type ActionResult
	};
}}
```

Success and failure results carry the root-relative `pathname + search` of the action URL, with
the `?/actionName` parameter removed. Redirect results carry the redirect target. Server-generated
error results also carry the action location, while client-generated errors such as network
failures do not. `update` uses this location to emulate native form navigation.

<div class="ts-block">

```dts
type ActionResult<
	Success extends Record<string, unknown> | undefined =
		Record<string, any>,
	Failure extends Record<string, unknown> | undefined =
		Record<string, any>
> =
	| {
			type: 'success';
			status: number;
			data?: Success;
			location: string;
	  }
	| {
			type: 'failure';
			status: number;
			data?: Failure;
			location: string;
	  }
	| { type: 'redirect'; status: number; location: string }
	| {
			type: 'error';
			status?: number;
			error: App.Error;
			location?: string;
	  };
```

</div>

## SubmitFunction

<div class="ts-block">

```dts
type SubmitFunction<
	Success extends Record<string, unknown> | undefined =
		Record<string, any>,
	Failure extends Record<string, unknown> | undefined =
		Record<string, any>
> = (input: {
	action: URL;
	formData: FormData;
	formElement: HTMLFormElement;
	controller: AbortController;
	submitter: HTMLElement | null;
	cancel: () => void;
}) => MaybePromise<
	| void
	| ((opts: {
			formData: FormData;
			formElement: HTMLFormElement;
			action: URL;
			result: ActionResult<Success, Failure>;
			/**
			 * Call this to get the default behavior of a form submission response.
			 * @param options Set `reset: false` if you don't want the `<form>` values to be reset after a successful submission. `refreshAll` defaults to `true` for successful results and `false` for failures. When the submission navigates, setting it to `false` still runs the destination's `load` functions but may reuse shared layout data. Set `navigate: false` to apply non-redirect results to the current page instead of navigating to `result.location`. Redirects are always followed.
			 */
			update: (options?: {
				reset?: boolean;
				refreshAll?: boolean;
				navigate?: boolean;
				/** @deprecated Use `refreshAll` instead. */
				invalidateAll?: boolean;
			}) => Promise<void>;
	  }) => MaybePromise<void>)
>;
```

</div>

# $app/manifest

```js
// @noErrors
import { assets, immutable, prerendered, routes } from '$app/manifest';
```

This module is available to [service workers](/docs/kit/service-workers) and other contexts.
It exports information about the build output, static files, prerendered pages, and routes.

## assets

An array of `{ path: AssetPath }` objects representing the files in your `static` directory, or whatever directory is specified by `config.files.assets`.
The path is relative to the [base path](/docs/kit/@sveltejs-kit-vite#paths), and can be used with [`asset(...)`](/docs/kit/$app-paths#asset).

<div class="ts-block">

```dts
const assets: Array<{
	path: import('$app/types').AssetPath;
}>;
```

</div>



## immutable

An array of `{ path: string }` objects representing the files generated by Vite.
The path is relative to the [base path](/docs/kit/@sveltejs-kit-vite#paths), and is intended for use with `cache.add(...)` inside a [service worker](/docs/kit/service-workers).
During development, this is an empty array.

<div class="ts-block">

```dts
const immutable: Array<{ path: string }>;
```

</div>



## prerendered

An array of `{ path: Path }` objects representing prerendered pages and endpoints, relative to the [base path](/docs/kit/@sveltejs-kit-vite#paths).
During development, this is an empty array.

<div class="ts-block">

```dts
const prerendered: Array<{
	path: import('$app/types').Path;
}>;
```

</div>



## routes

An array of objects representing the routes in your app. Only routes that the router can match
are included — directories that merely hold a `+layout` are not routes of their own.

Each object has an `id`, plus `page` and `endpoint` booleans describing whether the route has a
`+page` and/or a `+server`. Both are `true` for a route that has both, so the capabilities can
be filtered independently:

```js
// @errors: 7031
import { routes } from '$app/manifest';

const pages = routes.filter((route) => route.page);
const endpoints = routes.filter((route) => route.endpoint);
```

<div class="ts-block">

```dts
const routes: ManifestRoute[];
```

</div>



## ManifestRoute

A route in your app, along with its capabilities. `page` indicates the presence of a `+page`,
while `endpoint` indicates the presence of a `+server`. Both are `true` when both files exist.

<div class="ts-block">

```dts
type ManifestRoute =
	| {
			id: Exclude<
				import('$app/types').PageRouteId,
				import('$app/types').EndpointRouteId
			>;
			page: true;
			endpoint: false;
	  }
	| {
			id: Exclude<
				import('$app/types').EndpointRouteId,
				import('$app/types').PageRouteId
			>;
			page: false;
			endpoint: true;
	  }
	| {
			id: Extract<
				import('$app/types').PageRouteId,
				import('$app/types').EndpointRouteId
			>;
			page: true;
			endpoint: true;
	  };
```

</div>

# $app/navigation

```js
// @noErrors
import {
	afterNavigate,
	beforeNavigate,
	disableScrollHandling,
	goto,
	invalidate,
	invalidateAll,
	onNavigate,
	preloadCode,
	preloadData,
	pushState,
	refreshAll,
	replaceState,
	snapshot
} from '$app/navigation';
```

## afterNavigate

A lifecycle function that runs the supplied `callback` when the current component mounts, and also whenever we navigate to a URL.

`afterNavigate` must be called during a component initialization. It remains active as long as the component is mounted.

<div class="ts-block">

```dts
function afterNavigate(
	callback: (navigation: AfterNavigate) => void
): void;
```

</div>



## beforeNavigate

A navigation interceptor that triggers before we navigate to a URL, whether by clicking a link, calling `goto(...)`, or using the browser back/forward controls.

Calling `cancel()` will prevent the navigation from completing. If `navigation.type === 'leave'` — meaning the user is navigating away from the app (or closing the tab) — calling `cancel` will trigger the native browser unload confirmation dialog. In this case, the navigation may or may not be cancelled depending on the user's response.

When a navigation isn't to a SvelteKit-owned route (and therefore controlled by SvelteKit's client-side router), `navigation.to.route.id` will be `null`.

If the navigation will (if not cancelled) cause the document to unload — in other words `'leave'` navigations and `'link'` navigations where `navigation.to.route === null` — `navigation.willUnload` is `true`.

`beforeNavigate` must be called during a component initialization. It remains active as long as the component is mounted.

<div class="ts-block">

```dts
function beforeNavigate(
	callback: (navigation: BeforeNavigate) => void
): void;
```

</div>



## disableScrollHandling

If called when the page is being updated following a navigation (in `onMount` or `afterNavigate` or an action, for example), this disables SvelteKit's built-in scroll handling.
This is generally discouraged, since it breaks user expectations.

<div class="ts-block">

```dts
function disableScrollHandling(): void;
```

</div>



## goto

Allows you to navigate programmatically to a given route, with control over details such as whether scroll and focus are reset
(as they would be with a regular navigation) or preserved.

Returns a Promise that resolves when SvelteKit navigates (or fails to navigate, in which case the promise rejects) or the state change has been applied.

`goto` is intended for navigations to routes that belong to the app, and will reject if a route cannot be resolved.
For external URLs, use `window.location = url` to perform a full-page navigation instead of calling `goto(url)`.

<div class="ts-block">

```dts
function goto(
	url: string | URL,
	opts?: GotoOptions
): Promise<void>;
```

</div>



## invalidate

Causes any `load` functions belonging to the currently active page to re-run if they depend on the `url` in question, via `fetch` or `depends`. Returns a `Promise` that resolves when the page is subsequently updated.

If the argument is given as a `string` or `URL`, it must resolve to the same URL that was passed to `fetch` or `depends` (including query parameters).
To create a custom identifier, use a string beginning with `[a-z]+:` (e.g. `custom:state`) — this is a valid URL.

The `function` argument can be used define a custom predicate. It receives the full `URL` and causes `load` to rerun if `true` is returned.
This can be useful if you want to invalidate based on a pattern instead of a exact match.

```ts
// Example: Match '/path' regardless of the query parameters
import { invalidate } from '$app/navigation';

invalidate((url) => url.pathname === '/path');
```

<div class="ts-block">

```dts
function invalidate(
	resource: string | URL | ((url: URL) => boolean),
	keepState?: boolean
): Promise<void>;
```

</div>



## invalidateAll

<blockquote class="tag deprecated note">

Use [`refreshAll`](/docs/kit/$app-navigation#refreshAll) instead. Unlike `invalidateAll`, `refreshAll` does not reset `page.state`.

</blockquote>

Causes all `load` and `query` functions belonging to the currently active page to re-run. Returns a `Promise` that resolves when the page is subsequently updated.

Note that this resets `page.state` to an empty object. If you want to preserve `page.state` (for example when using [shallow routing](/docs/kit/shallow-routing)), use `refreshAll` instead.

<div class="ts-block">

```dts
function invalidateAll(): Promise<void>;
```

</div>



## onNavigate

A lifecycle function that runs the supplied `callback` immediately before we navigate to a new URL except during full-page navigations.

If you return a `Promise`, SvelteKit will wait for it to resolve before completing the navigation. This allows you to — for example — use `document.startViewTransition`. Avoid promises that are slow to resolve, since navigation will appear stalled to the user.

If a function (or a `Promise` that resolves to a function) is returned from the callback, it will be called once the DOM has updated.

`onNavigate` must be called during a component initialization. It remains active as long as the component is mounted.

<div class="ts-block">

```dts
function onNavigate(
	callback: (
		navigation: OnNavigate
	) => MaybePromise<(() => void) | void>
): void;
```

</div>



## preloadCode

Programmatically imports the code for routes that haven't yet been fetched.
Typically, you might call this to speed up subsequent navigation.

Takes a route ID such as `/about` or `/blog/[slug]`. Unlike pathnames, route IDs
are never prefixed with the app's [base path](/docs/kit/@sveltejs-kit-vite#paths).
If you have a pathname rather than a route ID, you can convert it with
[`match`](/docs/kit/$app-paths#match) from `$app/paths`:

```js
// @errors: 7031
import { match } from '$app/paths';
import { preloadCode } from '$app/navigation';

const matched = await match('/blog/hello-world');
if (matched) await preloadCode(matched.id);
```

Unlike `preloadData`, this won't call `load` functions.
Returns a Promise that resolves when the modules have been imported.

<div class="ts-block">

```dts
function preloadCode(
	id: import('$app/types').RouteId
): Promise<void>;
```

</div>



## preloadData

Programmatically preloads the given page, which means
 1. ensuring that the code for the page is loaded, and
 2. calling the page's load function with the appropriate options.

This is the same behaviour that SvelteKit triggers when the user taps or mouses over an `<a>` element with `data-sveltekit-preload-data`.
If the next navigation is to `href`, the values returned from load will be used, making navigation instantaneous.
Returns a Promise that resolves with the result of running the new route's `load` functions once the preload is complete.

<div class="ts-block">

```dts
function preloadData(href: string): Promise<
	(
		| {
				type: 'loaded';
				data: Record<string, any>;
		  }
		| {
				type: 'redirect';
				location: string;
		  }
		| {
				type: 'error';
				error: App.Error;
		  }
	) & {
		status: number;
	}
>;
```

</div>



## pushState

<blockquote class="tag deprecated note">

Use `goto(url, { state, shallow: true })` instead.

</blockquote>

Programmatically create a new history entry with the given `page.state`. Used for [shallow routing](/docs/kit/shallow-routing).

<div class="ts-block">

```dts
function pushState(
	url: string | URL,
	state: App.PageState
): Promise<void>;
```

</div>



## refreshAll

Causes all currently active remote functions to refresh, and all `load` functions belonging to the currently active page to re-run.
Returns a `Promise` that resolves when the page is subsequently updated.

<div class="ts-block">

```dts
function refreshAll(): Promise<void>;
```

</div>



## replaceState

<blockquote class="tag deprecated note">

Use `goto(url, { state, shallow: true, replace: true })` instead.

</blockquote>

Programmatically replace the current history entry with the given `page.state`. Used for [shallow routing](/docs/kit/shallow-routing).

<div class="ts-block">

```dts
function replaceState(
	url: string | URL,
	state: App.PageState
): Promise<void>;
```

</div>



## snapshot

A lifecycle function that captures state before navigating and restores it when traversing history.

By default, the snapshot `id` is generated from the call site. Pass an explicit `id` to keep snapshots stable across deployments or distinguish multiple uses of a shared helper.

The optional `reset` callback runs on navigations where there is no captured value to restore, such as when a new history entry is created. Captured values are serialized with the app's transport hook.

`snapshot` must be called during a component initialization. It remains active as long as the component is mounted.

<div class="ts-block">

```dts
function snapshot<T>(options: {
	id?: string;
	capture: () => T;
	restore: (value: T) => void;
	reset?: () => void;
}): void;
```

</div>



## AfterNavigate

The argument passed to [`afterNavigate`](/docs/kit/$app-navigation#afterNavigate) callbacks.

<div class="ts-block">

```dts
type AfterNavigate = (Navigation | NavigationEnter) & {
	type: Exclude<NavigationType, 'leave'>;
	/**
	 * Since `afterNavigate` callbacks are called after a navigation completes, they will never be called with a navigation that unloads the page.
	 */
	willUnload: false;
};
```

</div>

## BeforeNavigate

The argument passed to [`beforeNavigate`](/docs/kit/$app-navigation#beforeNavigate) callbacks.

<div class="ts-block">

```dts
type BeforeNavigate = Navigation & {
	/**
	 * Call this to prevent the navigation from starting.
	 */
	cancel: () => void;
};
```

</div>

## GotoOptions

<div class="ts-block">

```dts
interface GotoOptions {/*…*/}
```

<div class="ts-block-property">

```dts
replace?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`

</div>

If `true`, replaces the current history entry rather than creating a new one.

</div>
</div>

<div class="ts-block-property">

```dts
replaceState?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> Use `replace` instead.

</div>

</div>
</div>

<div class="ts-block-property">

```dts
shallow?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`

</div>

If `true`, updates the URL and `page.state` without navigating.

</div>
</div>

<div class="ts-block-property">

```dts
reset?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `true, or false when `shallow` is true`

</div>

If `true`, resets the scroll position (to the top of the page, or to the element
matching the URL's `#hash` if there is one) and resets focus (to the `<body>`, or the
`autofocus` element if there is one) once the navigation completes.

If `false`, the current scroll position and focused element are left alone.

</div>
</div>

<div class="ts-block-property">

```dts
refreshAll?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`

</div>

If `true`, reruns all `load` functions and queries of the page.

</div>
</div>

<div class="ts-block-property">

```dts
invalidate?: Array<string | URL | ((url: URL) => boolean)>;
```

<div class="ts-block-property-details">

Causes any `load` functions to rerun if they depend on one of the URLs.

</div>
</div>

<div class="ts-block-property">

```dts
invalidateAll?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag deprecated">deprecated</span> Use `refreshAll` instead.

</div>

</div>
</div>

<div class="ts-block-property">

```dts
state?: App.PageState;
```

<div class="ts-block-property-details">

An optional object that will be available as `page.state`.

</div>
</div>

<div class="ts-block-property">

```dts
persistState?: boolean;
```

<div class="ts-block-property-details">

<div class="ts-block-property-bullets">

- <span class="tag">default</span> `false`

</div>

If `true`, `page.state` will be restored after a full page reload.

</div>
</div></div>

## Navigation

<div class="ts-block">

```dts
type Navigation =
	| NavigationExternal
	| NavigationFormSubmit
	| NavigationPopState
	| NavigationLink;
```

</div>

## NavigationBase

<div class="ts-block">

```dts
interface NavigationBase {/*…*/}
```

<div class="ts-block-property">

```dts
type: NavigationType;
```

<div class="ts-block-property-details">

The type of navigation:
- `enter`: The app has hydrated/started
- `form`: The user submitted a `<form method="GET">`
- `goto`: Navigation was triggered by a `goto(...)` call or a redirect
- `leave`: The app is being left either because the tab is being closed or a navigation to a different document is occurring
- `link`: Navigation was triggered by a link click
- `popstate`: Navigation was triggered by back/forward navigation

</div>
</div>

<div class="ts-block-property">

```dts
shallow: boolean;
```

<div class="ts-block-property-details">

Whether this is a shallow navigation.

</div>
</div>

<div class="ts-block-property">

```dts
from: NavigationTarget | null;
```

<div class="ts-block-property-details">

Where navigation was triggered from

</div>
</div>

<div class="ts-block-property">

```dts
to: NavigationTarget | null;
```

<div class="ts-block-property-details">

Where navigation is going to/has gone to

</div>
</div>

<div class="ts-block-property">

```dts
willUnload: boolean;
```

<div class="ts-block-property-details">

Whether or not the navigation will result in the page being unloaded (i.e. not a client-side navigation).

</div>
</div>

<div class="ts-block-property">

```dts
complete: Promise<void>;
```

<div class="ts-block-property-details">

A promise that resolves once the navigation is complete, and rejects if the navigation
fails or is aborted. In the case of a `willUnload` navigation, the promise will never resolve

</div>
</div></div>

## NavigationEnter

The navigation that occurs when the app starts/hydrates

<div class="ts-block">

```dts
interface NavigationEnter extends NavigationBase {/*…*/}
```

<div class="ts-block-property">

```dts
type: 'enter';
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
from: null;
```

<div class="ts-block-property-details">

The app has just started, so there is no page it navigated from

</div>
</div>

<div class="ts-block-property">

```dts
delta?: undefined;
```

<div class="ts-block-property-details">

In case of a history back/forward navigation, the number of steps to go back/forward

</div>
</div>

<div class="ts-block-property">

```dts
event?: undefined;
```

<div class="ts-block-property-details">

Dispatched `Event` object when navigation occurred by `popstate` or `link`.

</div>
</div></div>

## NavigationExternal

<div class="ts-block">

```dts
type NavigationExternal = NavigationGoto | NavigationLeave;
```

</div>

## NavigationFormSubmit

A navigation triggered by a `<form method="GET">`

<div class="ts-block">

```dts
interface NavigationFormSubmit extends NavigationBase {/*…*/}
```

<div class="ts-block-property">

```dts
type: 'form';
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
event: SubmitEvent;
```

<div class="ts-block-property-details">

The `SubmitEvent` that caused the navigation

</div>
</div></div>

## NavigationGoto

A navigation triggered by a `goto(...)` call or a redirect

<div class="ts-block">

```dts
interface NavigationGoto extends NavigationBase {/*…*/}
```

<div class="ts-block-property">

```dts
type: 'goto';
```

<div class="ts-block-property-details"></div>
</div></div>

## NavigationLeave

A navigation triggered by the tab being closed, or the user navigating to a different document

<div class="ts-block">

```dts
interface NavigationLeave extends NavigationBase {/*…*/}
```

<div class="ts-block-property">

```dts
type: 'leave';
```

<div class="ts-block-property-details"></div>
</div></div>

## NavigationLink

A navigation triggered by a link click

<div class="ts-block">

```dts
interface NavigationLink extends NavigationBase {/*…*/}
```

<div class="ts-block-property">

```dts
type: 'link';
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
event: PointerEvent;
```

<div class="ts-block-property-details">

The `PointerEvent` that caused the navigation

</div>
</div></div>

## NavigationPopState

A navigation triggered by back/forward navigation

<div class="ts-block">

```dts
interface NavigationPopState extends NavigationBase {/*…*/}
```

<div class="ts-block-property">

```dts
type: 'popstate';
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
delta: number;
```

<div class="ts-block-property-details">

In case of a history back/forward navigation, the number of steps to go back/forward

</div>
</div>

<div class="ts-block-property">

```dts
event: PopStateEvent;
```

<div class="ts-block-property-details">

The `PopStateEvent` that caused the navigation

</div>
</div></div>

## NavigationTarget

Information about the target of a specific navigation.

<div class="ts-block">

```dts
interface NavigationTarget<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	RouteId extends AppRouteId | null = AppRouteId | null
> {/*…*/}
```

<div class="ts-block-property">

```dts
params: Params | null;
```

<div class="ts-block-property-details">

Parameters of the target page - e.g. for a route like `/blog/[slug]`, a `{ slug: string }` object.
Is `null` if the target is not part of the SvelteKit app (could not be resolved to a route).

</div>
</div>

<div class="ts-block-property">

```dts
route: {/*…*/};
```

<div class="ts-block-property-details">

Info about the target route

<div class="ts-block-property-children"><div class="ts-block-property">

```dts
id: RouteId | null;
```

<div class="ts-block-property-details">

The ID of the current route - e.g. for `src/routes/blog/[slug]`, it would be `/blog/[slug]`. It is `null` when no route is matched.

</div>
</div></div>

</div>
</div>

<div class="ts-block-property">

```dts
url: URL;
```

<div class="ts-block-property-details">

The URL that is navigated to

</div>
</div>

<div class="ts-block-property">

```dts
scroll: { x: number; y: number } | null;
```

<div class="ts-block-property-details">

The scroll position associated with this navigation.

For the `from` target, this is the scroll position at the moment of navigation.

For the `to` target, this represents the scroll position that will be or was restored:
- In `beforeNavigate` and `onNavigate`, this is only available for `popstate` navigations (back/forward button)
 and will be `null` for other navigation types, since the final scroll position isn't known
 ahead of time.
- In `afterNavigate`, this is always the scroll position that was applied after the navigation
 completed.

</div>
</div></div>

## NavigationType

- `enter`: The app has hydrated/started
- `form`: The user submitted a `<form method="GET">`
- `goto`: Navigation was triggered by a `goto(...)` call or a redirect
- `leave`: The app is being left either because the tab is being closed or a navigation to a different document is occurring
- `link`: Navigation was triggered by a link click
- `popstate`: Navigation was triggered by back/forward navigation

<div class="ts-block">

```dts
type NavigationType =
	'enter' | 'form' | 'leave' | 'link' | 'goto' | 'popstate';
```

</div>

## OnNavigate

The argument passed to [`onNavigate`](/docs/kit/$app-navigation#onNavigate) callbacks.

<div class="ts-block">

```dts
type OnNavigate = Navigation & {
	type: Exclude<NavigationType, 'enter' | 'leave'>;
	/**
	 * Since `onNavigate` callbacks are called immediately before a client-side navigation, they will never be called with a navigation that unloads the page.
	 */
	willUnload: false;
};
```

</div>

# $app/paths

```js
// @noErrors
import { asset, match, resolve } from '$app/paths';
```

## asset

<blockquote class="since note">

Available since 2.26

</blockquote>

Resolve the URL of an asset in your `static` directory, by prefixing it with [`config.paths.assets`](/docs/kit/@sveltejs-kit-vite#paths) if configured, or otherwise by prefixing it with the base path.

During server rendering, the base path is relative and depends on the page currently being rendered.

```svelte
<script>
	import { asset } from '$app/paths';
</script>

<img alt="a potato" src={asset('potato.jpg')} />
```

<div class="ts-block">

```dts
function asset(file: AssetPath): string;
```

</div>



## match

<blockquote class="since note">

Available since 2.52.0

</blockquote>

Match a path or URL to a route ID and extracts any parameters.

```js
// @errors: 7031
import { match } from '$app/paths';

const route = await match('blog/hello-world');

if (route?.id === '/blog/[slug]') {
	const slug = route.params.slug;
	const response = await fetch(`/api/posts/${slug}`);
	const post = await response.json();
}
```

<div class="ts-block">

```dts
function match(url: URL | string): Promise<
	| {
			[K in RouteId]: {
				id: K;
				params: RouteParams<K>;
			};
	  }[RouteId]
	| null
>;
```

</div>



## resolve

<blockquote class="since note">

Available since 2.26

</blockquote>

Resolve a pathname by prefixing it with the base path, if any, or resolve a route ID by populating dynamic segments with parameters.
In hash routing mode, the returned URL starts with `#`.

During server rendering, the base path is relative and depends on the page currently being rendered.

```js
// @errors: 7031
import { resolve } from '$app/paths';

// using a pathname
const resolved = resolve(`blog/hello-world`);

// using a route ID plus parameters
const resolved = resolve('/blog/[slug]', {
	slug: 'hello-world'
});
```

<div class="ts-block">

```dts
function resolve<
	T extends
		RouteIdWithSearchOrHash | PathnameWithSearchOrHash
>(...args: ResolveArgs<T>): ResolvedPathname;
```

</div>





> [!LEGACY]
> `base`, `assets`, and `resolveRoute` were removed in 3.0

# $app/server

```js
// @noErrors
import {
	command,
	form,
	getRequestEvent,
	prerender,
	query,
	read,
	requested
} from '$app/server';
```

## command

<blockquote class="since note">

Available since 2.27

</blockquote>

Creates a remote command. When called from the browser, the function will be invoked on the server via a `fetch` call.

See [Remote functions](/docs/kit/remote-functions#command) for full documentation.

<div class="ts-block">

```dts
function command<Output>(
	fn: () => MaybePromise<Output>
): RemoteCommand<void, Output>;
```

</div>

<div class="ts-block">

```dts
function command<Input, Output>(
	validate: 'unchecked',
	fn: (arg: Input) => MaybePromise<Output>
): RemoteCommand<Input, Output>;
```

</div>

<div class="ts-block">

```dts
function command<Schema extends StandardSchemaV1, Output>(
	validate: Schema,
	fn: (
		arg: StandardSchemaV1.InferOutput<Schema>
	) => MaybePromise<Output>
): RemoteCommand<
	StandardSchemaV1.InferInput<Schema>,
	Output
>;
```

</div>



## form

<blockquote class="since note">

Available since 2.27

</blockquote>

Creates a form object that can be spread onto a `<form>` element.

See [Remote functions](/docs/kit/remote-functions#form) for full documentation.

<div class="ts-block">

```dts
function form<Output>(
	fn: () => MaybePromise<Output>
): RemoteForm<void, Output>;
```

</div>

<div class="ts-block">

```dts
function form<Input extends RemoteFormInput, Output>(
	validate: 'unchecked',
	fn: (
		data: Input,
		issue: RemoteFormInvalidField<Input>
	) => MaybePromise<Output>
): RemoteForm<Input, Output>;
```

</div>

<div class="ts-block">

```dts
function form<
	Schema extends StandardSchemaV1<
		RemoteFormInput,
		Record<string, any>
	>,
	Output
>(
	validate: true extends HasNonOptionalBoolean<
		StandardSchemaV1.InferInput<Schema>
	>
		? 'Error: Boolean fields in form schemas that accept false must be optional (e.g. `v.optional(v.boolean(), false)`) because checkbox inputs do not send a false value when unchecked.'
		: Schema,
	fn: (
		data: StandardSchemaV1.InferOutput<Schema>,
		issue: RemoteFormInvalidField<
			StandardSchemaV1.InferInput<Schema>
		>
	) => MaybePromise<Output>
): RemoteForm<StandardSchemaV1.InferInput<Schema>, Output>;
```

</div>



## getRequestEvent

<blockquote class="since note">

Available since 2.20.0

</blockquote>

Returns the current `RequestEvent`. Can be used inside server hooks, server `load` functions, actions, and endpoints (and functions called by them).

In environments without [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage), this must be called synchronously (i.e. not after an `await`).

<div class="ts-block">

```dts
function getRequestEvent(): RequestEvent;
```

</div>



## prerender

<blockquote class="since note">

Available since 2.27

</blockquote>

Creates a remote prerender function. When called from the browser, the function will be invoked on the server via a `fetch` call.

See [Remote functions](/docs/kit/remote-functions#prerender) for full documentation.

<div class="ts-block">

```dts
function prerender<Output>(
	fn: () => MaybePromise<Output>,
	options?:
		| {
				inputs?: RemotePrerenderInputsGenerator<void>;
				dynamic?: boolean;
		  }
		| undefined
): RemotePrerenderFunction<void, Output>;
```

</div>

<div class="ts-block">

```dts
function prerender<Input, Output>(
	validate: 'unchecked',
	fn: (arg: Input) => MaybePromise<Output>,
	options?:
		| {
				inputs?: RemotePrerenderInputsGenerator<Input>;
				dynamic?: boolean;
		  }
		| undefined
): RemotePrerenderFunction<Input, Output>;
```

</div>

<div class="ts-block">

```dts
function prerender<Schema extends StandardSchemaV1, Output>(
	schema: Schema,
	fn: (
		arg: StandardSchemaV1.InferOutput<Schema>
	) => MaybePromise<Output>,
	options?:
		| {
				inputs?: RemotePrerenderInputsGenerator<
					StandardSchemaV1.InferInput<Schema>
				>;
				dynamic?: boolean;
		  }
		| undefined
): RemotePrerenderFunction<
	StandardSchemaV1.InferInput<Schema>,
	Output
>;
```

</div>



## query

<blockquote class="since note">

Available since 2.27

</blockquote>

Creates a remote query. When called from the browser, the function will be invoked on the server via a `fetch` call.

See [Remote functions](/docs/kit/remote-functions#query) for full documentation.

<div class="ts-block">

```dts
function query<Output>(
	fn: () => MaybePromise<Output>
): RemoteQueryFunction<void, Output>;
```

</div>

<div class="ts-block">

```dts
function query<Input, Output>(
	validate: 'unchecked',
	fn: (arg: Input) => MaybePromise<Output>
): RemoteQueryFunction<Input, Output>;
```

</div>

<div class="ts-block">

```dts
function query<Schema extends StandardSchemaV1, Output>(
	schema: Schema,
	fn: (
		arg: StandardSchemaV1.InferOutput<Schema>
	) => MaybePromise<Output>
): RemoteQueryFunction<
	StandardSchemaV1.InferInput<Schema>,
	Output,
	StandardSchemaV1.InferOutput<Schema>
>;
```

</div>



## read

<blockquote class="since note">

Available since 2.4.0

</blockquote>

Read the contents of an imported asset from the filesystem

```js
// @errors: 7031
import { read } from '$app/server';
import somefile from './somefile.txt';

const asset = read(somefile);
const text = await asset.text();
```

<div class="ts-block">

```dts
function read(asset: string): Response;
```

</div>



## requested

Inside a remote `command` or `form` callback, returns an iterable
of `{ arg, query }` entries for the query instances the client asked to refresh, up to
the supplied `limit`. Each `query` is a `RemoteQuery` bound to the original
client-side cache key, so `refresh()` / `set()` propagate correctly even when
the query's schema transforms the input. `arg` is the *validated* argument,
i.e. the value after the schema has run (so `InferOutput<Schema>` for queries
declared with a Standard Schema).

Arguments that fail validation or exceed `limit` are recorded as failures in
the response to the client.
See [Client-requested refreshes](/docs/kit/remote-functions#Single-flight-mutations-Client-requested-refreshes)
for usage in a remote `command` or `form`.

```ts
import { requested } from '$app/server';

for (const { arg, query } of requested(getPost, 5)) {
	// `arg` is the validated argument; `query` is bound to the client's
	// cache key. It's safe to throw away this promise -- SvelteKit will
	// await it and forward any errors to the client.
	void query.refresh();
}
```

As a shorthand for the above, you can also call `refreshAll` on the result:

```ts
import { requested } from '$app/server';

await requested(getPost, 5).refreshAll();
```

Works with `query.batch` as well — refreshes for individual entries are
collected into a single batched call.

For live queries, the same applies, but with `reconnect` and `reconnectAll`.

<div class="ts-block">

```dts
function requested<Input, Output, Validated = Input>(
	query: RemoteQueryFunction<Input, Output, Validated>,
	limit: number
): RemoteQueryRequestedResult<Validated, Output>;
```

</div>

<div class="ts-block">

```dts
function requested<Input, Output, Validated = Input>(
	query: RemoteLiveQueryFunction<Input, Output, Validated>,
	limit: number
): RemoteLiveQueryRequestedResult<Validated, Output>;
```

</div>



## RemoteCommand

The type of a remote `command` function. See [Remote functions](/docs/kit/remote-functions#command) for full documentation.

<div class="ts-block">

```dts
type RemoteCommand<Input, Output> = {
	(
		arg: undefined extends Input ? Input | void : Input
	): Promise<Output> & {
		updates(
			...updates: RemoteQueryUpdate[]
		): Promise<Output>;
	};
	/** The number of pending command executions */
	get pending(): number;
};
```

</div>

## RemoteForm

The type of a remote `form` function. See [Remote functions](/docs/kit/remote-functions#form) for full documentation.

<div class="ts-block">

```dts
type RemoteForm<
	Input extends RemoteFormInput | void,
	Output
> = RemoteForm_<Input, Output, [Input]>;
```

</div>

## RemoteFormEnhanceCallback

The callback passed to a remote form's `enhance` method. See [Remote functions](/docs/kit/remote-functions#form) for full documentation.

<div class="ts-block">

```dts
type RemoteFormEnhanceCallback<
	Input extends RemoteFormInput | void =
		RemoteFormInput | void,
	Output = any
> = (
	form: RemoteFormEnhanceInstance<Input, Output>
) => MaybePromise<void>;
```

</div>

## RemoteFormEnhanceInstance

The form instance as received inside an `enhance` callback. See [Remote functions](/docs/kit/remote-functions#form) for full documentation.

<div class="ts-block">

```dts
type RemoteFormEnhanceInstance<
	Input extends RemoteFormInput | void =
		RemoteFormInput | void,
	Output = any
> = Omit<
	RemoteForm<Input, Output>,
	'enhance' | 'element'
> & {
	readonly element: HTMLFormElement;
};
```

</div>

## RemoteFormField

Form field accessor type that provides name(), value(), and issues() methods

<div class="ts-block">

```dts
type RemoteFormField<Value extends RemoteFormFieldValue> =
	RemoteFormFieldMethods<Value> & {
		/**
		 * Returns an object that can be spread onto an input element with the correct type attribute,
		 * aria-invalid attribute if the field is invalid, and appropriate value/checked property getters/setters.
		 * @example
		 * ```svelte
		 * <input {...myForm.fields.myString.as('text')} />
		 * <input {...myForm.fields.myNumber.as('number')} />
		 * <input {...myForm.fields.myBoolean.as('checkbox')} />
		 * ```
		 */
		as<T extends RemoteFormFieldType<Value>>(
			...args: AsArgs<T, Value>
		): InputElementProps<T, WidenLiteralString<Value>>;
	};
```

</div>

## RemoteFormFieldType

<div class="ts-block">

```dts
type RemoteFormFieldType<T> = {
	[K in keyof InputTypeMap]: T extends InputTypeMap[K]
		? K
		: never;
}[keyof InputTypeMap];
```

</div>

## RemoteFormFieldValue

<div class="ts-block">

```dts
type RemoteFormFieldValue =
	| string
	| string[]
	| number
	| boolean
	| File
	| File[]
	| ImageInputValue;
```

</div>

## RemoteFormFields

Recursive type to build form fields structure with proxy access

<div class="ts-block">

```dts
type RemoteFormFields<T> =
	WillRecurseIndefinitely<T> extends true
		? RecursiveFormFields
		: NonNullable<T> extends
					string | number | boolean | File
			? RemoteFormField<NonNullable<T>>
			: IsImageInputValue<NonNullable<T>> extends true
				? RemoteFormField<
						NonNullable<T> & ImageInputValue
					> &
						Pick<
							RemoteFormFieldContainer<T>,
							'allIssues'
						> & {
							[K in KeysOfUnion<T>]-?: RemoteFormFields<
								ValueOfUnionKey<T, K>
							>;
						}
				: // [NonNullable<T>] is used to prevent distributing over union while still allowing
					// nullable wrappers (e.g. `string[] | undefined` from a schema with `.default([])`)
					// to be treated as arrays; only the last condition should distribute over unions
					[NonNullable<T>] extends [string[] | File[]]
					? RemoteFormField<NonNullable<T>> & {
							[K in number]: RemoteFormField<
								NonNullable<T>[number]
							>;
						}
					: [NonNullable<T>] extends [Array<infer U>]
						? RemoteFormFieldContainer<NonNullable<T>> & {
								[K in number]: RemoteFormFields<U>;
							}
						: RemoteFormFieldContainer<T> & {
								[K in KeysOfUnion<T>]-?: RemoteFormFields<
									ValueOfUnionKey<T, K>
								>;
							};
```

</div>

## RemoteFormInput

<div class="ts-block">

```dts
interface RemoteFormInput {/*…*/}
```

<div class="ts-block-property">

```dts
[key: string]: MaybeArray<string | number | boolean | File | RemoteFormInput> | undefined;
```

<div class="ts-block-property-details"></div>
</div></div>

## RemoteFormInvalidField

A function and proxy object used to imperatively create validation errors in form handlers.

Access properties to create field-specific issues: `issue.fieldName('message')`.
The type structure mirrors the input data structure for type-safe field access.
Call `invalid(issue.foo(...), issue.nested.bar(...))` to throw a validation error.

<div class="ts-block">

```dts
type RemoteFormInvalidField<T> =
	WillRecurseIndefinitely<T> extends true
		? Record<string | number, any>
		: NonNullable<T> extends
					string | number | boolean | File
			? (message: string) => StandardSchemaV1.Issue
			: NonNullable<T> extends Array<infer U>
				? {
						[K in number]: RemoteFormInvalidField<U>;
					} & ((message: string) => StandardSchemaV1.Issue)
				: NonNullable<T> extends RemoteFormInput
					? {
							[K in keyof T]-?: RemoteFormInvalidField<
								T[K]
							>;
						} & ((
							message: string
						) => StandardSchemaV1.Issue)
					: Record<string, never>;
```

</div>

## RemoteFormIssue

<div class="ts-block">

```dts
interface RemoteFormIssue {/*…*/}
```

<div class="ts-block-property">

```dts
message: string;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
path: Array<string | number>;
```

<div class="ts-block-property-details"></div>
</div></div>

## RemoteLiveQuery

<div class="ts-block">

```dts
type RemoteLiveQuery<T> = RemoteResource<T> &
	AsyncIterable<T> & {
		/** `true` if the live stream is currently connected. */
		readonly connected: boolean;
		/** `true` once the current live stream iterator is done. */
		readonly done: boolean;
		/** Reconnects the live stream immediately. */
		reconnect(): Promise<void>;
	};
```

</div>

## RemoteLiveQueryFunction

The type of a remote `query.live` function. See [Remote functions](/docs/kit/remote-functions#query.live) for full documentation.

The optional `Validated` generic parameter represents the argument type *after* the
query's schema has validated and (optionally) transformed it, and matches the type
yielded by [`requested`](/docs/kit/$app-server#requested).

<div class="ts-block">

```dts
type RemoteLiveQueryFunction<
	Input,
	Output,
	_Validated = Input
> = (
	arg: undefined extends Input ? Input | void : Input
) => RemoteLiveQuery<Output>;
```

</div>

## RemoteLiveQueryRequestedEntry

A single entry yielded by [`requested`](/docs/kit/$app-server#requested)
when called with a `query.live`. `arg` is the validated argument; `query` is a
`RemoteLiveQuery` bound to the client's original cache key, so `reconnect()` targets
the correct client subscription.

<div class="ts-block">

```dts
type RemoteLiveQueryRequestedEntry<Validated, Output> = {
	arg: Validated;
	query: RemoteLiveQuery<Output>;
	/** Explicitly ignore this requested update. */
	ignore: () => void;
};
```

</div>

## RemoteLiveQueryRequestedResult

<div class="ts-block">

```dts
type RemoteLiveQueryRequestedResult<Validated, Output> =
	Iterable<
		RemoteLiveQueryRequestedEntry<Validated, Output>
	> &
		AsyncIterable<
			RemoteLiveQueryRequestedEntry<Validated, Output>
		> & {
			/**
			 * Call `reconnect` on all live queries selected by this `requested` invocation.
			 * This is identical to:
			 * ```ts
			 * import { requested } from '$app/server';
			 *
			 * for await (const { query } of requested(liveQuery, ...)) {
			 *   void query.reconnect();
			 * }
			 * ```
			 */
			reconnectAll: () => Promise<void>;
			/** Explicitly ignore all updates selected by this `requested` invocation. */
			ignoreAll: () => Promise<void>;
		};
```

</div>

## RemotePrerenderFunction

The type of a remote `prerender` function. See [Remote functions](/docs/kit/remote-functions#prerender) for full documentation.

<div class="ts-block">

```dts
type RemotePrerenderFunction<Input, Output> = (
	arg: undefined extends Input ? Input | void : Input
) => RemoteResource<Output>;
```

</div>

## RemoteQuery

<div class="ts-block">

```dts
type RemoteQuery<T> = RemoteResource<T> & {
	/**
	 * On the client, this function will update the value of the query without re-fetching it.
	 *
	 * On the server, this can be called in the context of a `command` or `form` and the specified data will accompany the action response back to the client.
	 * This prevents SvelteKit needing to refresh all queries on the page in a second server round-trip.
	 */
	set(value: T): void;
	/**
	 * On the client, this function will re-fetch the query from the server.
	 *
	 * On the server, this can be called in the context of a `command` or `form` and the refreshed data will accompany the action response back to the client.
	 * This prevents SvelteKit needing to refresh all queries on the page in a second server round-trip.
	 */
	refresh(): Promise<void>;
	/**
	 * Temporarily override a query's value during a [single-flight mutation](https://svelte.dev/docs/kit/remote-functions#Single-flight-mutations) to provide optimistic updates.
	 *
	 * ```svelte
	 * <script>
	 *   import { getTodos, addTodo } from './todos.remote.js';
	 *   const todos = getTodos();
	 * </script>
	 *
	 * <form {...addTodo.enhance(async (form) => {
	 *   await form.submit().updates(
	 *     todos.withOverride((todos) => [...todos, { text: form.fields.text.value() }])
	 *   );
	 * })}>
	 *   <input type="text" name="text" />
	 *   <button type="submit">Add Todo</button>
	 * </form>
	 * ```
	 */
	withOverride(
		update: (current: T) => T
	): RemoteQueryOverride;
};
```

</div>

## RemoteQueryFunction

The return value of a remote `query` function. See [Remote functions](/docs/kit/remote-functions#query) for full documentation.

The optional `Validated` generic parameter represents the argument type *after* the
query's schema has validated and (optionally) transformed it — this is the type the
query's implementation function receives on the server, and the type yielded by
[`requested`](/docs/kit/$app-server#requested). For queries declared
with [Standard Schema](https://standardschema.dev/) it differs from `Input` when the
schema contains a transform (e.g. `v.pipe(v.number(), v.transform(String))` has
`Input = number` but `Validated = string`). For `'unchecked'` validators and queries
without arguments it defaults to `Input`.

<div class="ts-block">

```dts
type RemoteQueryFunction<
	Input,
	Output,
	_Validated = Input
> = (
	arg: undefined extends Input ? Input | void : Input
) => RemoteQuery<Output>;
```

</div>

## RemoteQueryOverride

<div class="ts-block">

```dts
type RemoteQueryOverride = () => void;
```

</div>

## RemoteQueryRequestedResult

<div class="ts-block">

```dts
type RemoteQueryRequestedResult<Validated, Output> =
	Iterable<RequestedEntry<Validated, Output>> &
		AsyncIterable<RequestedEntry<Validated, Output>> & {
			/**
			 * Call `refresh` on all queries selected by this `requested` invocation.
			 * This is identical to:
			 * ```ts
			 * import { requested } from '$app/server';
			 *
			 * for await (const { query } of requested(getPost, ...)) {
			 *   void query.refresh();
			 * }
			 * ```
			 */
			refreshAll: () => Promise<void>;
			/** Explicitly ignore all updates selected by this `requested` invocation. */
			ignoreAll: () => Promise<void>;
		};
```

</div>

## RemoteQueryUpdate

<div class="ts-block">

```dts
type RemoteQueryUpdate =
	| RemoteQuery<any>
	| RemoteLiveQuery<any>
	| RemoteQueryFunction<any, any>
	| RemoteLiveQueryFunction<any, any>
	| RemoteQueryOverride;
```

</div>

## RemoteResource

<div class="ts-block">

```dts
type RemoteResource<T> = Promise<T> & {
	/** The error in case the query fails. */
	get error(): App.Error | undefined;
	/** `true` before the first result is available and during refreshes */
	get loading(): boolean;
} & (
		| {
				/** The current value of the query. Undefined until `ready` is `true` */
				get current(): undefined;
				ready: false;
		  }
		| {
				/** The current value of the query. Undefined until `ready` is `true` */
				get current(): T;
				ready: true;
		  }
	);
```

</div>

## RequestedEntry

A single entry yielded by [`requested`](/docs/kit/$app-server#requested)
when called with a regular `query`. `arg` is the validated argument (the input *after*
the query's schema validated and transformed it, if applicable); `query` is a
`RemoteQuery` bound to the client's original cache key, so `refresh()` / `set()` will
update the correct client entry.

<div class="ts-block">

```dts
type RequestedEntry<Validated, Output> = {
	arg: Validated;
	query: RemoteQuery<Output>;
	/** Explicitly ignore this requested update. */
	ignore: () => void;
};
```

</div>

## RequestedResult

<div class="ts-block">

```dts
type RequestedResult<Validated, Output> =
	| RemoteQueryRequestedResult<Validated, Output>
	| RemoteLiveQueryRequestedResult<Validated, Output>;
```

</div>

## query

<div class="ts-block">

```dts
namespace query {
	/**
	 * Creates a batch query function that collects multiple calls and executes them in a single request
	 *
	 * See [Remote functions](https://svelte.dev/docs/kit/remote-functions#query.batch) for full documentation.
	 *
	 * @since 2.35
	 */
	function batch<Input, Output>(
		validate: 'unchecked',
		fn: (
			args: Input[]
		) => MaybePromise<(arg: Input, idx: number) => Output>
	): RemoteQueryFunction<Input, Output>;
	/**
	 * Creates a batch query function that collects multiple calls and executes them in a single request
	 *
	 * See [Remote functions](https://svelte.dev/docs/kit/remote-functions#query.batch) for full documentation.
	 *
	 * @since 2.35
	 */
	function batch<Schema extends StandardSchemaV1, Output>(
		schema: Schema,
		fn: (
			args: StandardSchemaV1.InferOutput<Schema>[]
		) => MaybePromise<
			(
				arg: StandardSchemaV1.InferOutput<Schema>,
				idx: number
			) => Output
		>
	): RemoteQueryFunction<
		StandardSchemaV1.InferInput<Schema>,
		Output,
		StandardSchemaV1.InferOutput<Schema>
	>;
	/**
	 * Creates a live remote query. When called from the browser, the function will be invoked on the server via a streaming `fetch` call.
	 *
	 * See [Remote functions](https://svelte.dev/docs/kit/remote-functions#query.live) for full documentation.
	 *
	 * */
	function live<Output>(
		fn: (
			arg: void
		) => RemoteLiveQueryUserFunctionReturnType<Output>
	): RemoteLiveQueryFunction<void, Output>;

	function live<Input, Output>(
		validate: 'unchecked',
		fn: (
			arg: Input
		) => RemoteLiveQueryUserFunctionReturnType<Output>
	): RemoteLiveQueryFunction<Input, Output>;

	function live<Schema extends StandardSchemaV1, Output>(
		schema: Schema,
		fn: (
			arg: StandardSchemaV1.InferOutput<Schema>
		) => RemoteLiveQueryUserFunctionReturnType<Output>
	): RemoteLiveQueryFunction<
		StandardSchemaV1.InferInput<Schema>,
		Output,
		StandardSchemaV1.InferOutput<Schema>
	>;
}
```

</div>

# $app/service-worker

This module can only be imported in service workers.



```js
// @noErrors
import { self } from '$app/service-worker';
```

## self

The execution context of a service worker. This export exists to make it easier to
use service workers with the correct types, provided the importing module is governed
by a `tsconfig.json` that extends [`$app/tsconfig/service-worker`](/docs/kit/$app-tsconfig-service-worker).

<div class="ts-block">

```dts
const self: ServiceWorkerGlobalScope;
```

</div>

# $app/state

SvelteKit makes three read-only state objects available via the `$app/state` module — `page`, `navigating` and `updated`.



```js
// @noErrors
import { navigating, page, updated } from '$app/state';
```

## navigating

A read-only object representing an in-progress navigation, with `from`, `to`, `type` and (if `type === 'popstate'`) `delta` properties.
Values are `null` when no navigation is occurring, or during server rendering.

<div class="ts-block">

```dts
const navigating:
	| Navigation
	| {
			from: null;
			to: null;
			type: null;
			willUnload: null;
			delta: null;
			complete: null;
	  };
```

</div>



## page

A read-only reactive object with information about the current page, serving several use cases:
- retrieving the combined `data` of all pages/layouts anywhere in your component tree (also see [loading data](/docs/kit/load))
- retrieving the current value of the `form` prop anywhere in your component tree (also see [form actions](/docs/kit/form-actions))
- retrieving the page state that was set through `goto` (also see [goto](/docs/kit/$app-navigation#goto) and [shallow routing](/docs/kit/shallow-routing))
- retrieving metadata such as the URL you're on, the current route and its parameters, the target of a shallow navigation, and whether or not there was an error

```svelte
<!--- file: +layout.svelte --->
<script>
	import { page } from '$app/state';
</script>

<p>Currently at {page.url.pathname}</p>

{#if page.error}
	<span class="red">Problem detected</span>
{:else}
	<span class="small">All systems operational</span>
{/if}
```

Changes to `page` are available exclusively with runes. (The legacy reactivity syntax will not reflect any changes)

```svelte
<!--- file: +page.svelte --->
<script>
	import { page } from '$app/state';
	const id = $derived(page.params.id); // This will correctly update id for usage on this page
	$: badId = page.params.id; // Do not use; will never update after initial load
</script>
```

On the server, values can only be read during rendering (in other words _not_ in e.g. `load` functions). In the browser, the values can be read at any time.

<div class="ts-block">

```dts
const page: Page;
```

</div>



## updated

A read-only reactive value that's initially `false`. SvelteKit checks for new versions on data, remote, and form action responses (via the `x-sveltekit-version` header), when the tab regains focus or becomes visible, and on a poll interval (see [`version.pollInterval`](/docs/kit/@sveltejs-kit-vite#version)). `updated.current` is set to `true` when a new version is detected. `updated.check()` will force an immediate check, regardless of polling.

<div class="ts-block">

```dts
const updated: {
	get current(): boolean;
	check(): Promise<boolean>;
};
```

</div>



## Page

The shape of the [`page`](/docs/kit/$app-state#page) reactive object.

<div class="ts-block">

```dts
interface Page<
	Params extends AppLayoutParams<'/'> =
		AppLayoutParams<'/'>,
	RouteId extends AppRouteId | null = AppRouteId | null
> {/*…*/}
```

<div class="ts-block-property">

```dts
url: ReadonlyURL & { readonly pathname: ResolvedPathname | (string & {}) };
```

<div class="ts-block-property-details">

The URL of the current page.

</div>
</div>

<div class="ts-block-property">

```dts
params: Params;
```

<div class="ts-block-property-details">

The parameters of the current page - e.g. for a route like `/blog/[slug]`, a `{ slug: string }` object.

</div>
</div>

<div class="ts-block-property">

```dts
route: {/*…*/};
```

<div class="ts-block-property-details">

Info about the current route.

<div class="ts-block-property-children"><div class="ts-block-property">

```dts
id: RouteId;
```

<div class="ts-block-property-details">

The ID of the current route - e.g. for `src/routes/blog/[slug]`, it would be `/blog/[slug]`. It is `null` when no route is matched.

</div>
</div></div>

</div>
</div>

<div class="ts-block-property">

```dts
status: number;
```

<div class="ts-block-property-details">

HTTP status code of the current page.

</div>
</div>

<div class="ts-block-property">

```dts
error: App.Error | null;
```

<div class="ts-block-property-details">

The error object of the current page, if any. Filled from the `handleError` hooks.

</div>
</div>

<div class="ts-block-property">

```dts
data: App.PageData & Record<string, any>;
```

<div class="ts-block-property-details">

The merged result of all data from all `load` functions on the current page. You can type a common denominator through `App.PageData`.

</div>
</div>

<div class="ts-block-property">

```dts
state: App.PageState;
```

<div class="ts-block-property-details">

The page state, which can be manipulated using [`goto`](/docs/kit/$app-navigation#goto) from `$app/navigation`.

</div>
</div>

<div class="ts-block-property">

```dts
shallow: {/*…*/} | null;
```

<div class="ts-block-property-details">

Information about the target of the current shallow navigation, or `null` if no shallow navigation has occurred.

<div class="ts-block-property-children"><div class="ts-block-property">

```dts
params: AppLayoutParams<'/'> | null;
```

<div class="ts-block-property-details">

Parameters of the target route, or `null` if the URL does not resolve to a route.

</div>
</div>
<div class="ts-block-property">

```dts
route: { id: AppRouteId } | null;
```

<div class="ts-block-property-details">

Info about the target route, or `null` if the URL does not resolve to a route.

</div>
</div>
<div class="ts-block-property">

```dts
url: ReadonlyURL;
```

<div class="ts-block-property-details">

The normalized URL passed to `goto(..., { shallow: true })`.

</div>
</div></div>

</div>
</div>

<div class="ts-block-property">

```dts
form: any;
```

<div class="ts-block-property-details">

Filled only after a form submission. See [form actions](/docs/kit/form-actions) for more info.

</div>
</div></div>

## ReadonlyURL

<div class="ts-block">

```dts
type ReadonlyURL = Readonly<
	Omit<URL, 'searchParams'> & {
		searchParams: ReadonlyURLSearchParams;
	}
>;
```

</div>

## ReadonlyURLSearchParams

<div class="ts-block">

```dts
type ReadonlyURLSearchParams = Omit<
	URLSearchParams,
	'set' | 'append' | 'delete' | 'sort'
>;
```

</div>

# $app/tsconfig

This module contains TypeScript configuration tailored for your app. Your own config should extend it — a typical `tsconfig.json` looks like this:

```json
/// file: tsconfig.json
{
	"extends": "$app/tsconfig",
	"include": ["src", "test"],
	"exclude": ["src/service-worker"]
}
```

You can extend this configuration with your own `compilerOptions`. Overriding the following properties may cause things to break — SvelteKit will warn you if this happens:

- `paths` — this is derived from the (deprecated) [`alias`](@sveltejs-kit-vite#alias) config option, together with any [subpath imports](https://nodejs.org/api/packages.html#subpath-imports) specified in your `package.json`, to align behaviour between Vite and TypeScript. Ideally, configure subpath imports rather than using `paths` directly
- `types` — your app needs to be able to 'see' generated module declarations for things like [environment variables](environment-variables), and as such this array must include `"$app/types"`
- `isolatedModules` — must be `true`, as Vite compiles modules one at a time
- `verbatimModuleSyntax` — must be `true`, so that you can safely use type imports in `.svelte` files

Note that the example configuration above excludes `src/service-worker`, because service workers need to be in their own TypeScript project. If you are using a service worker, create a `src/service-worker/tsconfig.json` that extends [`$app/tsconfig/service-worker`]($app-tsconfig-service-worker).

# $app/tsconfig/service-worker

This module contains TypeScript configuration tailored for your service worker:

```json
/// file: src/service-worker/tsconfig.json
{
	"extends": "$app/tsconfig/service-worker"
}
```

You can extend this configuration with your own `compilerOptions`, adhering to the same restrictions as [`$app/tsconfig`]($app-tsconfig).

# $app/types

This module contains generated types for the routes in your app.

<blockquote class="since note">
 <p>Available since 2.26</p>
</blockquote>

```js
// @noErrors
import type { RouteId, PageRouteId, EndpointRouteId, RouteParams, LayoutParams } from '$app/types';
```

## AssetPath

A union of all the filenames of assets contained in your `static` directory, relative to the `base` path.

<div class="ts-block">

```dts
type AssetPath = 'favicon.png' | 'robots.txt' | (string & {});
```

</div>

## RouteId

A union of all the route IDs in your app — the union of `PageRouteId` and `EndpointRouteId`. Used for `page.route.id` and `event.route.id`.

<div class="ts-block">

```dts
type RouteId = '/' | '/my-route' | '/my-other-route/[param]' | '/my-endpoint';
```

</div>

## PageRouteId

A union of the route IDs in your app that have a `+page`.

A route ID can be in both `PageRouteId` and `EndpointRouteId`, if its directory contains both a `+page` and a `+server`. In the example below, `/my-route` has both.

<div class="ts-block">

```dts
type PageRouteId = '/' | '/my-route' | '/my-other-route/[param]';
```

</div>

## EndpointRouteId

A union of the route IDs in your app that have a `+server`.

A route ID can be in both `PageRouteId` and `EndpointRouteId`, if its directory contains both a `+page` and a `+server`. In the example below, `/my-route` has both.

<div class="ts-block">

```dts
type EndpointRouteId = '/my-route' | '/my-endpoint';
```

</div>

## Path

A union of all valid paths in your app, relative to the `base` path.

<div class="ts-block">

```dts
type Path = '' | 'my-route' | `my-other-route/${string}` & {};
```

</div>

## ResolvedPathname

Similar to `Path`, but prefixed with a [base path](@sveltejs-kit-vite#paths). Used for `page.url.pathname`.

<div class="ts-block">

```dts
type ResolvedPathname = `${'' | `/${string}`}/` | `${'' | `/${string}`}/my-route` | `${'' | `/${string}`}/my-other-route/${string}` | {};
```

</div>

## RouteParams

A utility for getting the parameters associated with a given route.

```ts
// @errors: 2552
type BlogParams = RouteParams<'/blog/[slug]'>; // { slug: string }
```

<div class="ts-block">

```dts
type RouteParams<T extends RouteId> = { /* generated */ } | Record<string, never>;
```

</div>

## LayoutParams

A utility for getting the parameters associated with a given layout, which is similar to `RouteParams` but also includes optional parameters for any child route. It accepts the route ID of any directory containing a layout, including layout-only directories that are not part of `RouteId`.

<div class="ts-block">

```dts
type LayoutParams<T extends '/' | '/my-layout' | '/my-other-layout'> = { /* generated */ };
```

</div>

# #lib

When scaffolding a new SvelteKit project through the [`sv` CLI](/docs/cli/overview), it automatically creates a `#lib` import alias for your `src/lib` directory, by adding the following to your `package.json`:

```json
{
	"imports": {
		"#lib": "./src/lib/index.js",
		"#lib/*": "./src/lib/*"
	}
}
```

The `#` prefix leverages Node's built-in [subpath imports](https://nodejs.org/api/packages.html#subpath-imports) feature, which reserves `#` for package-internal aliases. Vite and TypeScript both resolve these natively.

> [!LEGACY]
> Previously, this alias was `$lib` and was automatically configured by SvelteKit. It is now `#lib` and must be declared in your `package.json` `imports` field. `import { foo } from '$lib/foo.js'` becomes `import { foo } from '#lib/foo.js'`.

```svelte
<!--- file: src/lib/Component.svelte --->
A reusable component
```

```svelte
<!--- file: src/routes/+page.svelte --->
<script>
	import Component from '#lib/Component.svelte';
</script>

<Component />
```

# Command Line Interface

SvelteKit projects use [Vite](https://vitejs.dev), meaning you'll mostly use its CLI (albeit via `npm run dev/build/preview` scripts):

- `vite dev` — start a development server
- `vite build` — build a production version of your app
- `vite preview` — run the production version locally

However SvelteKit includes its own CLI for initialising your project:

## svelte-kit sync

`svelte-kit sync` creates the `tsconfig.json` and all generated types (which you can import as `./$types` inside routing files) for your project. When you create a new project, it is listed as the `prepare` script and will be run automatically as part of the npm lifecycle, so you should not ordinarily have to run this command.

# Types

## Generated types

The `RequestHandler` and `Load` types both accept a `Params` argument allowing you to type the `params` object. For example this endpoint expects `foo`, `bar` and `baz` params:

```js
/// file: src/routes/[foo]/[bar]/[baz]/+server.js
// @errors: 2355 2322 1360
/**
 * @type {import('@sveltejs/kit').RequestHandler<{
 *   foo: string;
 *   bar: string;
 *   baz: string
 * }>}
 */
export async function GET({ params }) {
	// ...
}
```

Needless to say, this is cumbersome to write out, and less portable (if you were to rename the `[foo]` directory to `[qux]`, the type would no longer reflect reality).

To solve this problem, SvelteKit generates `.d.ts` files for each of your endpoints and pages:

```ts
/// file: .svelte-kit/types/src/routes/[foo]/[bar]/[baz]/$types.d.ts
import type * as Kit from '@sveltejs/kit';

type RouteParams = {
	foo: string;
	bar: string;
	baz: string;
};

export type RequestHandler = Kit.RequestHandler<RouteParams>;
export type PageLoad = Kit.Load<RouteParams>;
```

These files can be imported into your endpoints and pages as siblings, thanks to the [`rootDirs`](https://www.typescriptlang.org/tsconfig#rootDirs) option in your TypeScript configuration:

```js
/// file: src/routes/[foo]/[bar]/[baz]/+server.js
// @filename: $types.d.ts
import type * as Kit from '@sveltejs/kit';

type RouteParams = {
	foo: string;
	bar: string;
	baz: string;
}

export type RequestHandler = Kit.RequestHandler<RouteParams>;

// @filename: index.js
// @errors: 2355 2322
// ---cut---
/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
	// ...
}
```

```js
/// file: src/routes/[foo]/[bar]/[baz]/+page.js
// @filename: $types.d.ts
import type * as Kit from '@sveltejs/kit';

type RouteParams = {
	foo: string;
	bar: string;
	baz: string;
}

export type PageLoad = Kit.Load<RouteParams>;

// @filename: index.js
// @errors: 2355
// ---cut---
/** @type {import('./$types').PageLoad} */
export async function load({ params, fetch }) {
	// ...
}
```

The return types of the load functions are then available through the `$types` module as `PageData` and `LayoutData` respectively, while the union of the return values of all `Actions` is available as `ActionData`.

Starting with version 2.16.0, two additional helper types are provided: `PageProps` defines `data: PageData`, as well as `form: ActionData`, when there are actions defined, while `LayoutProps` defines `data: LayoutData`, as well as `children: Snippet`.

```svelte
<!--- file: src/routes/+page.svelte --->
<script>
	/** @type {import('./$types').PageProps} */
	let { data, form } = $props();
</script>
```

> [!LEGACY]
> Before 2.16.0:
> ```svelte
> <!--- file: src/routes/+page.svelte --->
> <script>
> /** @type {{ data: import('./$types').PageData, form: import('./$types').ActionData }} */
> let { data, form } = $props();
> </script>
> ```
>
> Using Svelte 4:
> ```svelte
> <!--- file: src/routes/+page.svelte --->
> <script>
> /** @type {import('./$types').PageData} */
> export let data;
> /** @type {import('./$types').ActionData} */
> export let form;
> </script>
> ```

> [!NOTE] For this to work, your own `tsconfig.json` or `jsconfig.json` should extend from the generated `$app/types`:
>
> `{ "extends": "$app/tsconfig" }`

## app.d.ts

The `app.d.ts` file is home to the ambient types of your apps, i.e. types that are available without explicitly importing them.

Always part of this file is the `App` namespace. This namespace contains several types that influence the shape of certain SvelteKit features you interact with.

It's possible to tell SvelteKit how to type objects inside your app by declaring the `App` namespace. By default, a new project will have a file called `src/app.d.ts` containing the following:

```ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
```

The `export {}` line exists because without it, the file would be treated as an _ambient module_ which prevents you from adding `import` declarations.
If you need to add ambient `declare module` declarations, do so in a separate file like `src/ambient.d.ts`.

By populating these interfaces, you will gain type safety when using `event.locals`, `event.platform`, and `data` from `load` functions.

## Error

Defines the common shape of expected and unexpected errors. Expected errors are thrown using the `error` function. Every error passes through the `handleError` hooks, which must return this shape (with `status` and `message` optional, since they default to those of the caught error).

<div class="ts-block">

```dts
interface Error {/*…*/}
```

<div class="ts-block-property">

```dts
status: number;
```

<div class="ts-block-property-details"></div>
</div>

<div class="ts-block-property">

```dts
message: string;
```

<div class="ts-block-property-details"></div>
</div></div>

## Locals

The interface that defines `event.locals`, which can be accessed in server [hooks](/docs/kit/hooks) (`handle`, and `handleError`), server-only `load` functions, and `+server.js` files.

<div class="ts-block">

```dts
interface Locals {}
```

</div>

## PageData

Defines the common shape of the [page.data state](/docs/kit/$app-state#page) - that is, the data that is shared between all pages.
The `Load` and `ServerLoad` functions in `./$types` will be narrowed accordingly.
Use optional properties for data that is only present on specific pages. Do not add an index signature (`[key: string]: any`).

<div class="ts-block">

```dts
interface PageData {}
```

</div>

## PageState

The shape of the `page.state` object, which can be manipulated using [`goto`](/docs/kit/$app-navigation#goto).

<div class="ts-block">

```dts
interface PageState {}
```

</div>

## Platform

If your adapter provides [platform-specific context](/docs/kit/adapters#Platform-specific-context) via `event.platform`, you can specify it here.

<div class="ts-block">

```dts
interface Platform {}
```

</div>

# $service-worker

The `service-worker` module existed in SvelteKit 2, and provided access to the following exports:

## base

A root-relative path representing the application's base path. Use [`resolve(...)`]($app-paths#resolve) from `$app/paths` instead.

## build

A `string[]` array of files generated by Vite. Empty during development. Use [`immutable`]($app-manifest#immutable) from `$app/manifest` instead.

## files

A `string[]` array of files in your `static` directory. Use [`assets`]($app-manifest#assets) from `$app/manifest` instead.


## prerendered

A `string[]` array of prerendered pages. Empty during dev. Use [`prerendered`]($app-manifest#prerendered) from `$app/manifest` instead.

## version

The value of [`config.version.name`](@sveltejs-kit-vite#version), used for populating caches. Use [`version`]($app-env#version) from `$app/env` instead.

# $app/environment

This module was deprecated in SvelteKit 3 in favour of [$app/env]($app-env). It will be removed in SvelteKit 4.

# $app/stores

This module contained store-based equivalents of the exports from [`$app/state`]($app-state) but was removed in 3.0.

# $env/dynamic/private

This module was deprecated in SvelteKit 3 in favour of [explicit environment variables](environment-variables). It will be removed in SvelteKit 4.

# $env/dynamic/public

This module was deprecated in SvelteKit 3 in favour of [explicit environment variables](environment-variables). It will be removed in SvelteKit 4.

# $env/static/private

This module was deprecated in SvelteKit 3 in favour of [explicit environment variables](environment-variables). It will be removed in SvelteKit 4.

# $env/static/public

This module was deprecated in SvelteKit 3 in favour of [explicit environment variables](environment-variables). It will be removed in SvelteKit 4.