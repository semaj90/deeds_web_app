### Getting started
Introduction
Creating a project
Project types
Project structure
Web standards
### Core concepts
Routing
Loading data
Form actions
Page options
State management
Remote functions
Environment variables
### Build and deploy
Building your app
Adapters
Zero-config deployments
Node servers
Static site generation
Single-page apps
Cloudflare
Cloudflare Workers
Netlify
Vercel
Writing adapters
### Advanced
Advanced routing
Hooks
Errors
Link options
Service workers
Server-only modules
Snapshots
Shallow routing
Observability
Packaging
### Best practices
Auth
Performance
Icons
Images
Accessibility
SEO
### Appendix
Frequently asked questions
Integrations
Breakpoint Debugging
Migrating to SvelteKit v2
Migrating from Sapper
Additional resources
Glossary
### Reference
@sveltejs/kit
@sveltejs/kit/env
@sveltejs/kit/hooks
@sveltejs/kit/node/polyfills
@sveltejs/kit/node
@sveltejs/kit/vite
$app/env
$app/env/private
$app/env/public
$app/environment
$app/forms
$app/navigation
$app/paths
$app/server
$app/state
$app/stores
$app/types
$env/dynamic/private
$env/dynamic/public
$env/static/private
$env/static/public
$lib
$service-worker
Configuration
Command Line Interface
Types
SvelteKit
Advanced
# Hooks
### On this page
Hooks
handle
locals
handleFetch
handleValidationError
handleError
init
reroute
transport
Further reading
‘Hooks’ are app-wide functions you declare that SvelteKit will call in response to specific events, giving you fine-grained control over the framework’s behaviour.
There are three hooks files, all optional:
`src/hooks.server.js`
— your app’s server hooks
`src/hooks.client.js`
— your app’s client hooks
`src/hooks.js`
— your app’s hooks that run on both the client and server
Code in these modules will run when the application starts up, making them useful for initializing database clients and so on.
## handle
Can be added to
`src/hooks.server.js`
This function runs every time the SvelteKit server receives a
request
— whether that happens while the app is running, or during
prerendering
— and determines the
response
. It receives an
`event`
object representing the request and a function called
`resolve`
, which renders the route and generates a
`Response`
. This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing routes programmatically, for example).
src/hooks.server
```
/** @type {import('@sveltejs/kit').Handle} */
export async function 
function handle(input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}): MaybePromise<Response>handle({ event: RequestEvent<Record<string, string>, string | null>event, resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve }) {
	if (event: RequestEvent<Record<string, string>, string | null>event.RequestEvent<Record<string, string>, string | null>.url: URLThe requested URL.
In the context of a remote function request initiated by the client, this relates to the page the remote function
was called from, not the URL of the endpoint SvelteKit creates for the remote function. Never use this to determine
whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.
url.URL.pathname: stringThe pathname property of the URL interface represents a location in a hierarchical structure. It is a string constructed from a list of path segments, each of which is prefixed by a / character.
MDN Reference
pathname.String.startsWith(searchString: string, position?: number): booleanReturns true if the sequence of elements of searchString converted to a String is the
same as the corresponding elements of this object (converted to a String) starting at
position. Otherwise returns false.
startsWith('/custom')) {
		return new var Response: new (body?: BodyInit | null, init?: ResponseInit) => ResponseThe Response interface of the Fetch API represents the response to a request.
MDN Reference
Response('custom response');
	}

	const const response: Responseresponse = await resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve(event: RequestEvent<Record<string, string>, string | null>event);
	return const response: Responseresponse;
}
```
```
import type { 
type Handle = (input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}) => MaybePromise<Response>The handle hook runs every time the SvelteKit server receives a request and
determines the response.
It receives an event object representing the request and a function called resolve, which renders the route and generates a Response.
This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing routes programmatically, for example).
referenceHandle } from '@sveltejs/kit';

export const const handle: Handlehandle: 
type Handle = (input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}) => MaybePromise<Response>The handle hook runs every time the SvelteKit server receives a request and
determines the response.
It receives an event object representing the request and a function called resolve, which renders the route and generates a Response.
This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing routes programmatically, for example).
referenceHandle = async ({ event: RequestEvent<Record<string, string>, string | null>event, resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve }) => {
	if (event: RequestEvent<Record<string, string>, string | null>event.RequestEvent<Record<string, string>, string | null>.url: URLThe requested URL.
In the context of a remote function request initiated by the client, this relates to the page the remote function
was called from, not the URL of the endpoint SvelteKit creates for the remote function. Never use this to determine
whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.
url.URL.pathname: stringThe pathname property of the URL interface represents a location in a hierarchical structure. It is a string constructed from a list of path segments, each of which is prefixed by a / character.
MDN Reference
pathname.String.startsWith(searchString: string, position?: number): booleanReturns true if the sequence of elements of searchString converted to a String is the
same as the corresponding elements of this object (converted to a String) starting at
position. Otherwise returns false.
startsWith('/custom')) {
		return new var Response: new (body?: BodyInit | null, init?: ResponseInit) => ResponseThe Response interface of the Fetch API represents the response to a request.
MDN Reference
Response('custom response');
	}

	const const response: Responseresponse = await resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve(event: RequestEvent<Record<string, string>, string | null>event);
	return const response: Responseresponse;
};
```
Requests for static assets — which includes pages that were already prerendered — are
not
handled by SvelteKit.
If the
`handle`
hook runs as part of a remote function request initiated by the client,
`route`
,
`params`
and
`url`
relate to the page the remote function was called from,
not
the URL of the endpoint SvelteKit creates for the remote function. Never use them to determine whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated. Queries are also not re-run when the user navigates (unless the argument to the query changes as a result of navigation), and so you should be mindful of how you use these values.
If unimplemented, defaults to
`({ event, resolve }) => resolve(event)`
.
During prerendering, SvelteKit crawls your pages for links and renders each route it finds. Rendering the route invokes the
`handle`
function (and all other route dependencies, like
`load`
). If you need to exclude some code from running during this phase, check that the app is not
`building`
beforehand.
You can define multiple
`handle`
functions and execute them with the
`sequence`
helper function.
`resolve`
also supports a second, optional parameter that gives you more control over how the response will be rendered. That parameter is an object that can have the following fields:
`transformPageChunk(opts: { html: string, done: boolean }): MaybePromise<string | undefined>`
— applies custom transforms to HTML. If
`done`
is true, it’s the final chunk. Chunks are not guaranteed to be well-formed HTML (they could include an element’s opening tag but not its closing tag, for example) but they will always be split at sensible boundaries such as
`%sveltekit.head%`
or layout/page components.
`filterSerializedResponseHeaders(name: string, value: string): boolean`
— determines which headers should be included in serialized responses when a
`load`
function loads a resource with
`fetch`
. By default, none will be included.
`preload(input: { type: 'js' | 'css' | 'font' | 'asset', path: string }): boolean`
— determines which files should be preloaded. Files are preloaded via
`<link>`
tags added to the
`<head>`
tag; if
`output.linkHeaderPreload`
is enabled, dynamically rendered pages use the
`Link`
response header
instead. The method is called with each file that was found at build time while constructing the code chunks — so if you for example have
`import './styles.css`
in your
`+page.svelte`
,
`preload`
will be called with the resolved path to that CSS file when visiting that page. Note that in dev mode
`preload`
is
not
called, since it depends on analysis that happens at build time. Preloading can improve performance by downloading assets sooner, but it can also hurt if too much is downloaded unnecessarily. By default,
`js`
and
`css`
files will be preloaded.
`asset`
files are not preloaded at all currently, but we may add this later after evaluating feedback.
src/hooks.server
```
/** @type {import('@sveltejs/kit').Handle} */
export async function 
function handle(input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}): MaybePromise<Response>handle({ event: RequestEvent<Record<string, string>, string | null>event, resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve }) {
	const const response: Responseresponse = await resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve(event: RequestEvent<Record<string, string>, string | null>event, {
		
ResolveOptions.transformPageChunk?: ((input: {
    html: string;
    done: boolean;
}) => MaybePromise<string | undefined>) | undefinedApplies custom transforms to HTML. If done is true, it’s the final chunk. Chunks are not guaranteed to be well-formed HTML
(they could include an element’s opening tag but not its closing tag, for example)
but they will always be split at sensible boundaries such as %sveltekit.head% or layout/page components.
@paraminput the html chunk and the info if this is the last chunktransformPageChunk: ({ html: stringhtml }) => html: stringhtml.String.replace(searchValue: string | RegExp, replaceValue: string): string (+3 overloads)Replaces text in a string, using a regular expression or search string.
@paramsearchValue A string or regular expression to search for.@paramreplaceValue A string containing the text to replace. When the {@linkcode searchValue} is a RegExp, all matches are replaced if the g flag is set (or only those matches at the beginning, if the y flag is also present). Otherwise, only the first match of {@linkcode searchValue} is replaced.replace('old', 'new'),
		ResolveOptions.filterSerializedResponseHeaders?: ((name: string, value: string) => boolean) | undefinedDetermines which headers should be included in serialized responses when a load function loads a resource with fetch.
By default, none will be included.
@paramname header name@paramvalue header valuefilterSerializedResponseHeaders: (name: stringname) => name: stringname.String.startsWith(searchString: string, position?: number): booleanReturns true if the sequence of elements of searchString converted to a String is the
same as the corresponding elements of this object (converted to a String) starting at
position. Otherwise returns false.
startsWith('x-'),
		
ResolveOptions.preload?: ((input: {
    type: "font" | "css" | "js" | "asset";
    path: string;
}) => boolean) | undefinedDetermines what should be added to the <head> tag to preload it.
By default, js and css files will be preloaded.
@paraminput the type of the file and its pathpreload: ({ type: "font" | "css" | "js" | "asset"type, path: stringpath }) => type: "font" | "css" | "js" | "asset"type === 'js' || path: stringpath.String.includes(searchString: string, position?: number): booleanReturns true if searchString appears as a substring of the result of converting this
object to a String, at one or more positions that are
greater than or equal to position; otherwise, returns false.
@paramsearchString search string@paramposition If position is undefined, 0 is assumed, so as to search all of the String.includes('/important/')
	});

	return const response: Responseresponse;
}
```
```
import type { 
type Handle = (input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}) => MaybePromise<Response>The handle hook runs every time the SvelteKit server receives a request and
determines the response.
It receives an event object representing the request and a function called resolve, which renders the route and generates a Response.
This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing routes programmatically, for example).
referenceHandle } from '@sveltejs/kit';

export const const handle: Handlehandle: 
type Handle = (input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}) => MaybePromise<Response>The handle hook runs every time the SvelteKit server receives a request and
determines the response.
It receives an event object representing the request and a function called resolve, which renders the route and generates a Response.
This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing routes programmatically, for example).
referenceHandle = async ({ event: RequestEvent<Record<string, string>, string | null>event, resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve }) => {
	const const response: Responseresponse = await resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve(event: RequestEvent<Record<string, string>, string | null>event, {
		
ResolveOptions.transformPageChunk?: ((input: {
    html: string;
    done: boolean;
}) => MaybePromise<string | undefined>) | undefinedApplies custom transforms to HTML. If done is true, it’s the final chunk. Chunks are not guaranteed to be well-formed HTML
(they could include an element’s opening tag but not its closing tag, for example)
but they will always be split at sensible boundaries such as %sveltekit.head% or layout/page components.
@paraminput the html chunk and the info if this is the last chunktransformPageChunk: ({ html: stringhtml }) => html: stringhtml.String.replace(searchValue: string | RegExp, replaceValue: string): string (+3 overloads)Replaces text in a string, using a regular expression or search string.
@paramsearchValue A string or regular expression to search for.@paramreplaceValue A string containing the text to replace. When the {@linkcode searchValue} is a RegExp, all matches are replaced if the g flag is set (or only those matches at the beginning, if the y flag is also present). Otherwise, only the first match of {@linkcode searchValue} is replaced.replace('old', 'new'),
		ResolveOptions.filterSerializedResponseHeaders?: ((name: string, value: string) => boolean) | undefinedDetermines which headers should be included in serialized responses when a load function loads a resource with fetch.
By default, none will be included.
@paramname header name@paramvalue header valuefilterSerializedResponseHeaders: (name: stringname) => name: stringname.String.startsWith(searchString: string, position?: number): booleanReturns true if the sequence of elements of searchString converted to a String is the
same as the corresponding elements of this object (converted to a String) starting at
position. Otherwise returns false.
startsWith('x-'),
		
ResolveOptions.preload?: ((input: {
    type: "font" | "css" | "js" | "asset";
    path: string;
}) => boolean) | undefinedDetermines what should be added to the <head> tag to preload it.
By default, js and css files will be preloaded.
@paraminput the type of the file and its pathpreload: ({ type: "font" | "css" | "js" | "asset"type, path: stringpath }) => type: "font" | "css" | "js" | "asset"type === 'js' || path: stringpath.String.includes(searchString: string, position?: number): booleanReturns true if searchString appears as a substring of the result of converting this
object to a String, at one or more positions that are
greater than or equal to position; otherwise, returns false.
@paramsearchString search string@paramposition If position is undefined, 0 is assumed, so as to search all of the String.includes('/important/')
	});

	return const response: Responseresponse;
};
```
Note that
`resolve(...)`
will never throw an error, it will always return a
`Promise<Response>`
with the appropriate status code. If an error is thrown elsewhere during
`handle`
, it is treated as fatal, and SvelteKit will respond with a JSON representation of the error or a fallback error page — which can be customised via
`src/error.html`
— depending on the
`Accept`
header. You can read more about error handling
here
.
### locals
To add custom data to the request, which is passed to handlers in
`+server.js`
and server
`load`
functions, populate the
`event.locals`
object, as shown below.
src/hooks.server
```
/** @type {import('@sveltejs/kit').Handle} */
export async function 
function handle(input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}): MaybePromise<Response>handle({ event: RequestEvent<Record<string, string>, string | null>event, resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve }) {
	event: RequestEvent<Record<string, string>, string | null>event.RequestEvent<Record<string, string>, string | null>.locals: App.LocalsContains custom data that was added to the request within the server handle hook.
locals.App.Locals.user: Useruser = await const getUserInformation: (cookie: string | void) => Promise<User>getUserInformation(event: RequestEvent<Record<string, string>, string | null>event.RequestEvent<Record<string, string>, string | null>.cookies: CookiesGet or set cookies related to the current request
cookies.Cookies.get: (name: string, opts?: CookieParseOptions) => string | undefinedGets a cookie that was previously set with cookies.set, or from the request headers.
@paramname the name of the cookie@paramopts the options, passed directly to cookie.parse. See documentation hereget('sessionid'));

	const const response: Responseresponse = await resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve(event: RequestEvent<Record<string, string>, string | null>event);

	// Note that modifying response headers isn't always safe.
	// Response objects can have immutable headers
	// (e.g. Response.redirect() returned from an endpoint).
	// Modifying immutable headers throws a TypeError.
	// In that case, clone the response or avoid creating a
	// response object with immutable headers.
	const response: Responseresponse.Response.headers: HeadersThe headers read-only property of the Response interface contains the Headers object associated with the response.
MDN Reference
headers.Headers.set(name: string, value: string): voidThe set() method of the Headers interface sets a new value for an existing header inside a Headers object, or adds the header if it does not already exist.
MDN Reference
set('x-custom-header', 'potato');

	return const response: Responseresponse;
}
```
```
import type { 
type Handle = (input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}) => MaybePromise<Response>The handle hook runs every time the SvelteKit server receives a request and
determines the response.
It receives an event object representing the request and a function called resolve, which renders the route and generates a Response.
This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing routes programmatically, for example).
referenceHandle } from '@sveltejs/kit';

export const const handle: Handlehandle: 
type Handle = (input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}) => MaybePromise<Response>The handle hook runs every time the SvelteKit server receives a request and
determines the response.
It receives an event object representing the request and a function called resolve, which renders the route and generates a Response.
This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing routes programmatically, for example).
referenceHandle = async ({ event: RequestEvent<Record<string, string>, string | null>event, resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve }) => {
	event: RequestEvent<Record<string, string>, string | null>event.RequestEvent<Record<string, string>, string | null>.locals: App.LocalsContains custom data that was added to the request within the server handle hook.
locals.App.Locals.user: Useruser = await const getUserInformation: (cookie: string | void) => Promise<User>getUserInformation(event: RequestEvent<Record<string, string>, string | null>event.RequestEvent<Record<string, string>, string | null>.cookies: CookiesGet or set cookies related to the current request
cookies.Cookies.get: (name: string, opts?: CookieParseOptions) => string | undefinedGets a cookie that was previously set with cookies.set, or from the request headers.
@paramname the name of the cookie@paramopts the options, passed directly to cookie.parse. See documentation hereget('sessionid'));

	const const response: Responseresponse = await resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>resolve(event: RequestEvent<Record<string, string>, string | null>event);

	// Note that modifying response headers isn't always safe.
	// Response objects can have immutable headers
	// (e.g. Response.redirect() returned from an endpoint).
	// Modifying immutable headers throws a TypeError.
	// In that case, clone the response or avoid creating a
	// response object with immutable headers.
	const response: Responseresponse.Response.headers: HeadersThe headers read-only property of the Response interface contains the Headers object associated with the response.
MDN Reference
headers.Headers.set(name: string, value: string): voidThe set() method of the Headers interface sets a new value for an existing header inside a Headers object, or adds the header if it does not already exist.
MDN Reference
set('x-custom-header', 'potato');

	return const response: Responseresponse;
};
```
## handleFetch
Can be added to
`src/hooks.server.js`
This function allows you to modify (or replace) the result of an
`event.fetch`
call that runs on the server (or during prerendering) inside an endpoint,
`load`
,
`action`
,
`handle`
,
`handleError`
or
`reroute`
.
For example, your
`load`
function might make a request to a public URL like
`https://api.yourapp.com`
when the user performs a client-side navigation to the respective page, but during SSR it might make sense to hit the API directly (bypassing whatever proxies and load balancers sit between it and the public internet).
src/hooks.server
```
/** @type {import('@sveltejs/kit').HandleFetch} */
export async function 
function handleFetch(input: {
    event: RequestEvent;
    request: Request;
    fetch: typeof globalThis.fetch;
}): MaybePromise<Response>handleFetch({ request: Requestrequest, 
fetch: {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}fetch }) {
	if (request: Requestrequest.Request.url: stringThe url read-only property of the Request interface contains the URL of the request.
MDN Reference
url.String.startsWith(searchString: string, position?: number): booleanReturns true if the sequence of elements of searchString converted to a String is the
same as the corresponding elements of this object (converted to a String) starting at
position. Otherwise returns false.
startsWith('https://api.yourapp.com/')) {
		// clone the original request, but change the URL
		request: Requestrequest = new var Request: new (input: RequestInfo | URL, init?: RequestInit) => RequestThe Request interface of the Fetch API represents a resource request.
MDN Reference
Request(
			request: Requestrequest.Request.url: stringThe url read-only property of the Request interface contains the URL of the request.
MDN Reference
url.String.replace(searchValue: string | RegExp, replaceValue: string): string (+3 overloads)Replaces text in a string, using a regular expression or search string.
@paramsearchValue A string or regular expression to search for.@paramreplaceValue A string containing the text to replace. When the {@linkcode searchValue} is a RegExp, all matches are replaced if the g flag is set (or only those matches at the beginning, if the y flag is also present). Otherwise, only the first match of {@linkcode searchValue} is replaced.replace('https://api.yourapp.com/', 'http://localhost:9999/'),
			request: Requestrequest
		);
	}

	return fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response> (+1 overload)MDN Reference
fetch(request: Requestrequest);
}
```
```
import type { 
type HandleFetch = (input: {
    event: RequestEvent;
    request: Request;
    fetch: typeof fetch;
}) => MaybePromise<Response>The handleFetch hook allows you to modify (or replace) the result of an event.fetch call that runs on the server (or during prerendering) inside an endpoint, load, action, handle, handleError or reroute.
referenceHandleFetch } from '@sveltejs/kit';

export const const handleFetch: HandleFetchhandleFetch: 
type HandleFetch = (input: {
    event: RequestEvent;
    request: Request;
    fetch: typeof fetch;
}) => MaybePromise<Response>The handleFetch hook allows you to modify (or replace) the result of an event.fetch call that runs on the server (or during prerendering) inside an endpoint, load, action, handle, handleError or reroute.
referenceHandleFetch = async ({ request: Requestrequest, 
fetch: {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}fetch }) => {
	if (request: Requestrequest.Request.url: stringThe url read-only property of the Request interface contains the URL of the request.
MDN Reference
url.String.startsWith(searchString: string, position?: number): booleanReturns true if the sequence of elements of searchString converted to a String is the
same as the corresponding elements of this object (converted to a String) starting at
position. Otherwise returns false.
startsWith('https://api.yourapp.com/')) {
		// clone the original request, but change the URL
		request: Requestrequest = new var Request: new (input: RequestInfo | URL, init?: RequestInit) => RequestThe Request interface of the Fetch API represents a resource request.
MDN Reference
Request(
			request: Requestrequest.Request.url: stringThe url read-only property of the Request interface contains the URL of the request.
MDN Reference
url.String.replace(searchValue: string | RegExp, replaceValue: string): string (+3 overloads)Replaces text in a string, using a regular expression or search string.
@paramsearchValue A string or regular expression to search for.@paramreplaceValue A string containing the text to replace. When the {@linkcode searchValue} is a RegExp, all matches are replaced if the g flag is set (or only those matches at the beginning, if the y flag is also present). Otherwise, only the first match of {@linkcode searchValue} is replaced.replace('https://api.yourapp.com/', 'http://localhost:9999/'),
			request: Requestrequest
		);
	}

	return fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response> (+1 overload)MDN Reference
fetch(request: Requestrequest);
};
```
Requests made with
`event.fetch`
follow the browser’s credentials model — for same-origin requests,
`cookie`
and
`authorization`
headers are forwarded unless the
`credentials`
option is set to
`"omit"`
. For cross-origin requests,
`cookie`
will be included if the request URL belongs to a subdomain of the app — for example if your app is on
`my-domain.com`
, and your API is on
`api.my-domain.com`
, cookies will be included in the request.
There is one caveat: if your app and your API are on sibling subdomains —
`www.my-domain.com`
and
`api.my-domain.com`
for example — then a cookie belonging to a common parent domain like
`my-domain.com`
will
not
be included, because SvelteKit has no way to know which domain the cookie belongs to. In these cases you will need to manually include the cookie using
`handleFetch`
:
src/hooks.server
```
/** @type {import('@sveltejs/kit').HandleFetch} */
export async function 
function handleFetch(input: {
    event: RequestEvent;
    request: Request;
    fetch: typeof globalThis.fetch;
}): MaybePromise<Response>handleFetch({ event: RequestEvent<Record<string, string>, string | null>event, request: Requestrequest, 
fetch: {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}fetch }) {
	if (request: Requestrequest.Request.url: stringThe url read-only property of the Request interface contains the URL of the request.
MDN Reference
url.String.startsWith(searchString: string, position?: number): booleanReturns true if the sequence of elements of searchString converted to a String is the
same as the corresponding elements of this object (converted to a String) starting at
position. Otherwise returns false.
startsWith('https://api.my-domain.com/')) {
		request: Requestrequest.Request.headers: HeadersThe headers read-only property of the Request interface contains the Headers object associated with the request.
MDN Reference
headers.Headers.set(name: string, value: string): voidThe set() method of the Headers interface sets a new value for an existing header inside a Headers object, or adds the header if it does not already exist.
MDN Reference
set('cookie', event.request.headers.get('cookie'));
	}

	return fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response> (+1 overload)MDN Reference
fetch(request: Requestrequest);
}
```
```
import type { 
type HandleFetch = (input: {
    event: RequestEvent;
    request: Request;
    fetch: typeof fetch;
}) => MaybePromise<Response>The handleFetch hook allows you to modify (or replace) the result of an event.fetch call that runs on the server (or during prerendering) inside an endpoint, load, action, handle, handleError or reroute.
referenceHandleFetch } from '@sveltejs/kit';
export const const handleFetch: HandleFetchhandleFetch: 
type HandleFetch = (input: {
    event: RequestEvent;
    request: Request;
    fetch: typeof fetch;
}) => MaybePromise<Response>The handleFetch hook allows you to modify (or replace) the result of an event.fetch call that runs on the server (or during prerendering) inside an endpoint, load, action, handle, handleError or reroute.
referenceHandleFetch = async ({ event: RequestEvent<Record<string, string>, string | null>event, request: Requestrequest, 
fetch: {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}fetch }) => {
	if (request: Requestrequest.Request.url: stringThe url read-only property of the Request interface contains the URL of the request.
MDN Reference
url.String.startsWith(searchString: string, position?: number): booleanReturns true if the sequence of elements of searchString converted to a String is the
same as the corresponding elements of this object (converted to a String) starting at
position. Otherwise returns false.
startsWith('https://api.my-domain.com/')) {
		request: Requestrequest.Request.headers: HeadersThe headers read-only property of the Request interface contains the Headers object associated with the request.
MDN Reference
headers.Headers.set(name: string, value: string): voidThe set() method of the Headers interface sets a new value for an existing header inside a Headers object, or adds the header if it does not already exist.
MDN Reference
set('cookie', event.request.headers.get('cookie'));
	}

	return fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response> (+1 overload)MDN Reference
fetch(request: Requestrequest);
};
```
## handleValidationError
Can be added to
`src/hooks.server.js`
This hook is called when a remote function is called with an argument that does not match the provided
Standard Schema
. It must return an object matching the shape of
`App.Error`
.
Say you have a remote function that expects a string as its argument ...
todos.remote
```
import * as import vv from 'valibot';
import { function query<Output>(fn: () => MaybePromise<Output>): RemoteQueryFunction<void, Output> (+2 overloads)Creates a remote query. When called from the browser, the function will be invoked on the server via a fetch call.
See Remote functions for full documentation.
@since2.27referencequery } from '$app/server';

export const const getTodo: RemoteQueryFunction<string, void, string>getTodo = query<v.StringSchema<undefined>, void>(schema: v.StringSchema<undefined>, fn: (arg: string) => MaybePromise<void>): RemoteQueryFunction<string, void, string> (+2 overloads)Creates a remote query. When called from the browser, the function will be invoked on the server via a fetch call.
See Remote functions for full documentation.
@since2.27referencequery(import vv.
function string(): v.StringSchema<undefined> (+1 overload)
export stringCreates a string schema.
@returnsA string schema.string(), (id: stringid) => {
	// implementation...
});
```
...but it is called with something that doesn’t match the schema — such as a number (e.g.
`await getTodos(1)`
) — then validation will fail, the server will respond with a
400 status code
, and the function will throw with the message ‘Bad Request’.
To customise this message and add additional properties to the error object, implement
`handleValidationError`
:
src/hooks.server
```
/** @type {import('@sveltejs/kit').HandleValidationError} */
export function 
function handleValidationError(input: {
    issues: StandardSchemaV1<Input = unknown, Output = Input>.Issue[];
    event: RequestEvent;
}): MaybePromise<App.Error>handleValidationError({ issues: StandardSchemaV1.Issue[]issues }) {
	return {
		App.Error.message: stringmessage: 'No thank you'
	};
}
```
```
import type { 
type HandleValidationError<Issue extends StandardSchemaV1.Issue = StandardSchemaV1.Issue> = (input: {
    issues: Issue[];
    event: RequestEvent;
}) => MaybePromise<App.Error>The handleValidationError hook runs when the argument to a remote function fails validation.
It will be called with the validation issues and the event, and must return an object shape that matches App.Error.
referenceHandleValidationError } from '@sveltejs/kit';

export const const handleValidationError: HandleValidationErrorhandleValidationError: 
type HandleValidationError<Issue extends StandardSchemaV1.Issue = StandardSchemaV1.Issue> = (input: {
    issues: Issue[];
    event: RequestEvent;
}) => MaybePromise<App.Error>The handleValidationError hook runs when the argument to a remote function fails validation.
It will be called with the validation issues and the event, and must return an object shape that matches App.Error.
referenceHandleValidationError = ({ issues: StandardSchemaV1.Issue[]issues }) => {
	return {
		App.Error.message: stringmessage: 'No thank you'
	};
};
```
Be thoughtful about what information you expose here, as the most likely reason for validation to fail is that someone is sending malicious requests to your server.
## handleError
Can be added to
`src/hooks.server.js`
and
`src/hooks.client.js`
If an
unexpected error
is thrown during loading, rendering, or from an endpoint, this function will be called with the
`error`
,
`event`
,
`status`
code and
`message`
. This allows for two things:
you can log the error
you can generate a custom representation of the error that is safe to show to users, omitting sensitive details like messages and stack traces. The returned value, which defaults to
`{ message }`
, becomes the value of
`page.error`
.
For errors thrown from your code (or library code called by your code) the status will be 500 and the message will be “Internal Error”. While
`error.message`
may contain sensitive information that should not be exposed to users,
`message`
is safe (albeit meaningless to the average user).
To add more information to the
`page.error`
object in a type-safe way, you can customize the expected shape by declaring an
`App.Error`
interface (which must include
`message: string`
, to guarantee sensible fallback behavior). This allows you to — for example — append a tracking ID for users to quote in correspondence with your technical support staff:
src/app.d
```
declare global {
	namespace App {
		interface interface App.ErrorDefines the common shape of expected and unexpected errors. Expected errors are thrown using the error function. Unexpected errors are handled by the handleError hooks which should return this shape.
Error {
			App.Error.message: stringmessage: string;
			App.Error.errorId: stringerrorId: string;
		}
	}
}

export {};
```
src/hooks.server
```
import * as module "@sentry/sveltekit"Sentry from '@sentry/sveltekit';

module "@sentry/sveltekit"Sentry.const init: (opts: any) => voidinit({/*...*/})

/** @type {import('@sveltejs/kit').HandleServerError} */
export async function 
function handleError(input: {
    error: unknown;
    event: RequestEvent;
    status: number;
    message: string;
}): MaybePromise<void | App.Error>handleError({ error: unknownerror, event: RequestEvent<Record<string, string>, string | null>event, status: numberstatus, message: stringmessage }) {
	const const errorId: `${string}-${string}-${string}-${string}-${string}`errorId = var crypto: CryptoMDN Reference
crypto.Crypto.randomUUID(): `${string}-${string}-${string}-${string}-${string}`The randomUUID() method of the Crypto interface is used to generate a v4 UUID using a cryptographically secure random number generator.
Available only in secure contexts.
MDN Reference
randomUUID();

	// example integration with https://sentry.io/
	module "@sentry/sveltekit"Sentry.const captureException: (error: any, opts: any) => voidcaptureException(error: unknownerror, {
		
extra: {
    event: RequestEvent<Record<string, string>, string | null>;
    errorId: `${string}-${string}-${string}-${string}-${string}`;
    status: number;
}extra: { event: RequestEvent<Record<string, string>, string | null>event, errorId: `${string}-${string}-${string}-${string}-${string}`errorId, status: numberstatus }
	});

	return {
		App.Error.message: stringmessage: 'Whoops!',
		errorId
	};
}
```
```
import * as module "@sentry/sveltekit"Sentry from '@sentry/sveltekit';
import type { 
type HandleServerError = (input: {
    error: unknown;
    event: RequestEvent;
    status: number;
    message: string;
}) => MaybePromise<void | App.Error>The server-side handleError hook runs when an unexpected error is thrown while responding to a request.
If an unexpected error is thrown during loading or rendering, this function will be called with the error and the event.
Make sure that this function never throws an error.
referenceHandleServerError } from '@sveltejs/kit';

module "@sentry/sveltekit"Sentry.const init: (opts: any) => voidinit({/*...*/})

export const const handleError: HandleServerErrorhandleError: 
type HandleServerError = (input: {
    error: unknown;
    event: RequestEvent;
    status: number;
    message: string;
}) => MaybePromise<void | App.Error>The server-side handleError hook runs when an unexpected error is thrown while responding to a request.
If an unexpected error is thrown during loading or rendering, this function will be called with the error and the event.
Make sure that this function never throws an error.
referenceHandleServerError = async ({ error: unknownerror, event: RequestEvent<Record<string, string>, string | null>event, status: numberstatus, message: stringmessage }) => {
	const const errorId: `${string}-${string}-${string}-${string}-${string}`errorId = var crypto: CryptoMDN Reference
crypto.Crypto.randomUUID(): `${string}-${string}-${string}-${string}-${string}`The randomUUID() method of the Crypto interface is used to generate a v4 UUID using a cryptographically secure random number generator.
Available only in secure contexts.
MDN Reference
randomUUID();

	// example integration with https://sentry.io/
	module "@sentry/sveltekit"Sentry.const captureException: (error: any, opts: any) => voidcaptureException(error: unknownerror, {
		
extra: {
    event: RequestEvent<Record<string, string>, string | null>;
    errorId: `${string}-${string}-${string}-${string}-${string}`;
    status: number;
}extra: { event: RequestEvent<Record<string, string>, string | null>event, errorId: `${string}-${string}-${string}-${string}-${string}`errorId, status: numberstatus }
	});

	return {
		App.Error.message: stringmessage: 'Whoops!',
		errorId: `${string}-${string}-${string}-${string}-${string}`errorId
	};
};
```
src/hooks.client
```
import * as module "@sentry/sveltekit"Sentry from '@sentry/sveltekit';

module "@sentry/sveltekit"Sentry.const init: (opts: any) => voidinit({/*...*/})

/** @type {import('@sveltejs/kit').HandleClientError} */
export async function 
function handleError(input: {
    error: unknown;
    event: NavigationEvent;
    status: number;
    message: string;
}): MaybePromise<void | App.Error>handleError({ error: unknownerror, event: NavigationEvent<Record<string, string>, string | null>event, status: numberstatus, message: stringmessage }) {
	const const errorId: `${string}-${string}-${string}-${string}-${string}`errorId = var crypto: CryptoMDN Reference
crypto.Crypto.randomUUID(): `${string}-${string}-${string}-${string}-${string}`The randomUUID() method of the Crypto interface is used to generate a v4 UUID using a cryptographically secure random number generator.
Available only in secure contexts.
MDN Reference
randomUUID();

	// example integration with https://sentry.io/
	module "@sentry/sveltekit"Sentry.const captureException: (error: any, opts: any) => voidcaptureException(error: unknownerror, {
		
extra: {
    event: NavigationEvent<Record<string, string>, string | null>;
    errorId: `${string}-${string}-${string}-${string}-${string}`;
    status: number;
}extra: { event: NavigationEvent<Record<string, string>, string | null>event, errorId: `${string}-${string}-${string}-${string}-${string}`errorId, status: numberstatus }
	});

	return {
		App.Error.message: stringmessage: 'Whoops!',
		errorId
	};
}
```
```
import * as module "@sentry/sveltekit"Sentry from '@sentry/sveltekit';
import type { 
type HandleClientError = (input: {
    error: unknown;
    event: NavigationEvent;
    status: number;
    message: string;
}) => MaybePromise<void | App.Error>The client-side handleError hook runs when an unexpected error is thrown while navigating.
If an unexpected error is thrown during loading or the following render, this function will be called with the error and the event.
Make sure that this function never throws an error.
referenceHandleClientError } from '@sveltejs/kit';

module "@sentry/sveltekit"Sentry.const init: (opts: any) => voidinit({/*...*/})

export const const handleError: HandleClientErrorhandleError: 
type HandleClientError = (input: {
    error: unknown;
    event: NavigationEvent;
    status: number;
    message: string;
}) => MaybePromise<void | App.Error>The client-side handleError hook runs when an unexpected error is thrown while navigating.
If an unexpected error is thrown during loading or the following render, this function will be called with the error and the event.
Make sure that this function never throws an error.
referenceHandleClientError = async ({ error: unknownerror, event: NavigationEvent<Record<string, string>, string | null>event, status: numberstatus, message: stringmessage }) => {
	const const errorId: `${string}-${string}-${string}-${string}-${string}`errorId = var crypto: CryptoMDN Reference
crypto.Crypto.randomUUID(): `${string}-${string}-${string}-${string}-${string}`The randomUUID() method of the Crypto interface is used to generate a v4 UUID using a cryptographically secure random number generator.
Available only in secure contexts.
MDN Reference
randomUUID();

	// example integration with https://sentry.io/
	module "@sentry/sveltekit"Sentry.const captureException: (error: any, opts: any) => voidcaptureException(error: unknownerror, {
		
extra: {
    event: NavigationEvent<Record<string, string>, string | null>;
    errorId: `${string}-${string}-${string}-${string}-${string}`;
    status: number;
}extra: { event: NavigationEvent<Record<string, string>, string | null>event, errorId: `${string}-${string}-${string}-${string}-${string}`errorId, status: numberstatus }
	});

	return {
		App.Error.message: stringmessage: 'Whoops!',
		errorId: `${string}-${string}-${string}-${string}-${string}`errorId
	};
};
```
In
`src/hooks.client.js`
, the type of
`handleError`
is
`HandleClientError`
instead of
`HandleServerError`
, and
`event`
is a
`NavigationEvent`
rather than a
`RequestEvent`
.
This function is not called for
expected
errors (those thrown with the
`error`
function imported from
`@sveltejs/kit`
).
During development, if an error occurs because of a syntax error in your Svelte code, the passed in error has a
`frame`
property appended highlighting the location of the error.
Make sure that
`handleError`
never
throws an error
## init
Can be added to
`src/hooks.server.js`
and
`src/hooks.client.js`
This function runs once, when the server is created or the app starts in the browser, and is a useful place to do asynchronous work such as initializing a database connection.
If your environment supports top-level await, the
`init`
function is really no different from writing your initialisation logic at the top level of the module, but some environments — most notably, Safari — don’t.
src/hooks.server
```
import * as import dbdb from '$lib/server/database';

/** @type {import('@sveltejs/kit').ServerInit} */
export async function function init(): MaybePromise<void>init() {
	await import dbdb.connect();
}
```
```
import * as import dbdb from '$lib/server/database';
import type { type ServerInit = () => MaybePromise<void>The init will be invoked before the server responds to its first request
@since2.10.0referenceServerInit } from '@sveltejs/kit';

export const const init: ServerInitinit: type ServerInit = () => MaybePromise<void>The init will be invoked before the server responds to its first request
@since2.10.0referenceServerInit = async () => {
	await import dbdb.connect();
};
```
In the browser, asynchronous work in
`init`
will delay hydration, so be mindful of what you put in there.
## reroute
Can be added to
`src/hooks.js`
; it runs on both server and client
This function runs before
`handle`
and allows you to change how URLs are translated into routes. The returned pathname (which defaults to
`url.pathname`
) is used to select the route and its parameters.
For example, you might have a
`src/routes/[[lang]]/about/+page.svelte`
page, which should be accessible as
`/en/about`
or
`/de/ueber-uns`
or
`/fr/a-propos`
. You could implement this with
`reroute`
:
src/hooks
```
/** @type {Record<string, string>} */
const const translated: Record<string, string>translated = {
	'/en/about': '/en/about',
	'/de/ueber-uns': '/de/about',
	'/fr/a-propos': '/fr/about',
};

/** @type {import('@sveltejs/kit').Reroute} */
export function 
function reroute(event: {
    url: URL;
    fetch: typeof fetch;
}): MaybePromise<string | void>reroute({ url: URLurl }) {
	if (url: URLurl.URL.pathname: stringThe pathname property of the URL interface represents a location in a hierarchical structure. It is a string constructed from a list of path segments, each of which is prefixed by a / character.
MDN Reference
pathname in const translated: Record<string, string>translated) {
		return const translated: Record<string, string>translated[url: URLurl.URL.pathname: stringThe pathname property of the URL interface represents a location in a hierarchical structure. It is a string constructed from a list of path segments, each of which is prefixed by a / character.
MDN Reference
pathname];
	}
}
```
```
import type { 
type Reroute = (event: {
    url: URL;
    fetch: typeof fetch;
}) => MaybePromise<string | void>The reroute hook allows you to modify the URL before it is used to determine which route to render.
@since2.3.0referenceReroute } from '@sveltejs/kit';
const const translated: Record<string, string>translated: type Record<K extends keyof any, T> = { [P in K]: T; }Construct a type with a set of properties K of type T
Record<string, string> = {
	'/en/about': '/en/about',
	'/de/ueber-uns': '/de/about',
	'/fr/a-propos': '/fr/about',
};

export const const reroute: Reroutereroute: 
type Reroute = (event: {
    url: URL;
    fetch: typeof fetch;
}) => MaybePromise<string | void>The reroute hook allows you to modify the URL before it is used to determine which route to render.
@since2.3.0referenceReroute = ({ url: URLurl }) => {
	if (url: URLurl.URL.pathname: stringThe pathname property of the URL interface represents a location in a hierarchical structure. It is a string constructed from a list of path segments, each of which is prefixed by a / character.
MDN Reference
pathname in const translated: Record<string, string>translated) {
		return const translated: Record<string, string>translated[url: URLurl.URL.pathname: stringThe pathname property of the URL interface represents a location in a hierarchical structure. It is a string constructed from a list of path segments, each of which is prefixed by a / character.
MDN Reference
pathname];
	}
};
```
The
`lang`
parameter will be correctly derived from the returned pathname.
Using
`reroute`
will
not
change the contents of the browser’s address bar, or the value of
`event.url`
.
Since version 2.18, the
`reroute`
hook can be asynchronous, allowing it to (for example) fetch data from your backend to decide where to reroute to. Use this carefully and make sure it’s fast, as it will delay navigation otherwise. If you need to fetch data, use the
`fetch`
provided as an argument. It has the
same benefits
as the
`fetch`
provided to
`load`
functions, with the caveat that
`params`
and
`id`
are unavailable to
`handleFetch`
because the route is not yet known.
src/hooks
```
/** @type {import('@sveltejs/kit').Reroute} */
export async function 
function reroute(event: {
    url: URL;
    fetch: typeof globalThis.fetch;
}): MaybePromise<string | void>reroute({ url: URLurl, 
fetch: {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}fetch }) {
	// Ask a special endpoint within your app about the destination
	if (url: URLurl.URL.pathname: stringThe pathname property of the URL interface represents a location in a hierarchical structure. It is a string constructed from a list of path segments, each of which is prefixed by a / character.
MDN Reference
pathname === '/api/reroute') return;

	const const api: URLapi = new var URL: new (url: string | URL, base?: string | URL) => URLThe URL interface is used to parse, construct, normalize, and encode URLs. It works by providing properties which allow you to easily read and modify the components of a URL.
MDN Reference
URL class is a global reference for import { URL } from 'url'
https://nodejs.org/api/url.html#the-whatwg-url-api
@sincev10.0.0URL('/api/reroute', url: URLurl);
	const api: URLapi.URL.searchParams: URLSearchParamsThe searchParams read-only property of the URL interface returns a URLSearchParams object allowing access to the GET decoded query arguments contained in the URL.
MDN Reference
searchParams.URLSearchParams.set(name: string, value: string): voidThe set() method of the URLSearchParams interface sets the value associated with a given search parameter to the given value. If there were several matching values, this method deletes the others. If the search parameter doesn’t exist, this method creates it.
MDN Reference
set('pathname', url: URLurl.URL.pathname: stringThe pathname property of the URL interface represents a location in a hierarchical structure. It is a string constructed from a list of path segments, each of which is prefixed by a / character.
MDN Reference
pathname);

	const const result: anyresult = await fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response> (+1 overload)MDN Reference
fetch(const api: URLapi).Promise<Response>.then<any, never>(onfulfilled?: ((value: Response) => any) | null | undefined, onrejected?: ((reason: any) => PromiseLike<never>) | null | undefined): Promise<any>Attaches callbacks for the resolution and/or rejection of the Promise.
@paramonfulfilled The callback to execute when the Promise is resolved.@paramonrejected The callback to execute when the Promise is rejected.@returnsA Promise for the completion of which ever callback is executed.then(r: Responser => r: Responser.Body.json(): Promise<any>MDN Reference
json());
	return const result: anyresult.pathname;
}
```
```
import type { 
type Reroute = (event: {
    url: URL;
    fetch: typeof fetch;
}) => MaybePromise<string | void>The reroute hook allows you to modify the URL before it is used to determine which route to render.
@since2.3.0referenceReroute } from '@sveltejs/kit';
export const const reroute: Reroutereroute: 
type Reroute = (event: {
    url: URL;
    fetch: typeof fetch;
}) => MaybePromise<string | void>The reroute hook allows you to modify the URL before it is used to determine which route to render.
@since2.3.0referenceReroute = async ({ url: URLurl, 
fetch: {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}fetch }) => {
	// Ask a special endpoint within your app about the destination
	if (url: URLurl.URL.pathname: stringThe pathname property of the URL interface represents a location in a hierarchical structure. It is a string constructed from a list of path segments, each of which is prefixed by a / character.
MDN Reference
pathname === '/api/reroute') return;

	const const api: URLapi = new var URL: new (url: string | URL, base?: string | URL) => URLThe URL interface is used to parse, construct, normalize, and encode URLs. It works by providing properties which allow you to easily read and modify the components of a URL.
MDN Reference
URL class is a global reference for import { URL } from 'url'
https://nodejs.org/api/url.html#the-whatwg-url-api
@sincev10.0.0URL('/api/reroute', url: URLurl);
	const api: URLapi.URL.searchParams: URLSearchParamsThe searchParams read-only property of the URL interface returns a URLSearchParams object allowing access to the GET decoded query arguments contained in the URL.
MDN Reference
searchParams.URLSearchParams.set(name: string, value: string): voidThe set() method of the URLSearchParams interface sets the value associated with a given search parameter to the given value. If there were several matching values, this method deletes the others. If the search parameter doesn’t exist, this method creates it.
MDN Reference
set('pathname', url: URLurl.URL.pathname: stringThe pathname property of the URL interface represents a location in a hierarchical structure. It is a string constructed from a list of path segments, each of which is prefixed by a / character.
MDN Reference
pathname);

	const const result: anyresult = await fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response> (+1 overload)MDN Reference
fetch(const api: URLapi).Promise<Response>.then<any, never>(onfulfilled?: ((value: Response) => any) | null | undefined, onrejected?: ((reason: any) => PromiseLike<never>) | null | undefined): Promise<any>Attaches callbacks for the resolution and/or rejection of the Promise.
@paramonfulfilled The callback to execute when the Promise is resolved.@paramonrejected The callback to execute when the Promise is rejected.@returnsA Promise for the completion of which ever callback is executed.then(r: Responser => r: Responser.Body.json(): Promise<any>MDN Reference
json());
	return const result: anyresult.pathname;
};
```
`reroute`
is considered a pure, idempotent function. As such, it must always return the same output for the same input and not have side effects. Under these assumptions, SvelteKit caches the result of
`reroute`
on the client so it is only called once per unique URL.
## transport
Can be added to
`src/hooks.js`
; it runs on both server and client
This is a collection of
transporters
, which allow you to pass custom types — returned from
`load`
and form actions — across the server/client boundary. Each transporter contains an
`encode`
function, which encodes values on the server (or returns a falsy value for anything that isn’t an instance of the type) and a corresponding
`decode`
function:
src/hooks
```
import { import VectorVector } from '$lib/math';

/** @type {import('@sveltejs/kit').Transport} */
export const const transport: Transporttransport = {
	
type Vector: {
    encode: (value: any) => false | any[];
    decode: ([x, y]: any) => any;
}Vector: {
		Transporter<any, any>.encode: (value: any) => anyencode: (value: anyvalue) => value: anyvalue instanceof import VectorVector && [value: anyvalue.x, value: anyvalue.y],
		Transporter<any, any>.decode: (data: any) => anydecode: ([x: anyx, y: anyy]) => new import VectorVector(x: anyx, y: anyy)
	}
};
```
```
import { import VectorVector } from '$lib/math';
import type { 
type Transport = {
    [x: string]: Transporter<any, any>;
}The transport hook allows you to transport custom types across the server/client boundary.
Each transporter has a pair of encode and decode functions. On the server, encode determines whether a value is an instance of the custom type and, if so, returns a non-falsy encoding of the value which can be an object or an array (or false otherwise).
In the browser, decode turns the encoding back into an instance of the custom type.
import type { 
type Transport = {
    
[x: string]: Transporter<any, any>;
}The transport hook allows you to transport custom types across the server/client boundary.
Each transporter has a pair of encode and decode functions. On the server, encode determines whether a value is an instance of the custom type and, if so, returns a non-falsy encoding of the value which can be an object or an array (or false otherwise).
In the browser, decode turns the encoding back into an instance of the custom type.
import type { Transport } from '@sveltejs/kit';

declare class MyCustomType {
	
data: any
}

// hooks.js
export const transport: Transport = {
	
MyCustomType: {
		
encode: (value) => value instanceof MyCustomType && [value.data],
		
decode: ([data]) => new MyCustomType(data)
	
}
};@since2.11.0referenceTransport } from '@sveltejs/kit';

declare class class MyCustomTypeMyCustomType {
	
MyCustomType.data: anydata: any
}

// hooks.js
export const const transport: Transporttransport: 
type Transport = {
    
[x: string]: Transporter<any, any>;
}The transport hook allows you to transport custom types across the server/client boundary.
Each transporter has a pair of encode and decode functions. On the server, encode determines whether a value is an instance of the custom type and, if so, returns a non-falsy encoding of the value which can be an object or an array (or false otherwise).
In the browser, decode turns the encoding back into an instance of the custom type.
import type { Transport } from '@sveltejs/kit';

declare class MyCustomType {
	
data: any
}

// hooks.js
export const transport: Transport = {
	
MyCustomType: {
		
encode: (value) => value instanceof MyCustomType && [value.data],
		
decode: ([data]) => new MyCustomType(data)
	
}
};@since2.11.0referenceTransport = {
	
type MyCustomType: {
    
encode: (value: any) => false | any[];
    
decode: ([data]: any) => MyCustomType;
}MyCustomType: {
		
Transporter<any, any>.encode: (value: any) => anyencode: (value: anyvalue) => value: anyvalue instanceof class MyCustomTypeMyCustomType && [value: MyCustomTypevalue.MyCustomType.data: anydata],
		
Transporter<any, any>.decode: (data: any) => anydecode: ([data: anydata]) => new constructor MyCustomType(): MyCustomTypeMyCustomType(data: anydata)
	
}
};@since2.11.0Transport } from '@sveltejs/kit';

export const const transport: Transporttransport: 
type Transport = {
    [x: string]: Transporter<any, any>;
}The transport hook allows you to transport custom types across the server/client boundary.
Each transporter has a pair of encode and decode functions. On the server, encode determines whether a value is an instance of the custom type and, if so, returns a non-falsy encoding of the value which can be an object or an array (or false otherwise).
In the browser, decode turns the encoding back into an instance of the custom type.
import type { 
type Transport = {
    
[x: string]: Transporter<any, any>;
}The transport hook allows you to transport custom types across the server/client boundary.
Each transporter has a pair of encode and decode functions. On the server, encode determines whether a value is an instance of the custom type and, if so, returns a non-falsy encoding of the value which can be an object or an array (or false otherwise).
In the browser, decode turns the encoding back into an instance of the custom type.
import type { Transport } from '@sveltejs/kit';

declare class MyCustomType {
	
data: any
}

// hooks.js
export const transport: Transport = {
	
MyCustomType: {
		
encode: (value) => value instanceof MyCustomType && [value.data],
		
decode: ([data]) => new MyCustomType(data)
	
}
};@since2.11.0referenceTransport } from '@sveltejs/kit';

declare class class MyCustomTypeMyCustomType {
	
MyCustomType.data: anydata: any
}

// hooks.js
export const const transport: Transporttransport: 
type Transport = {
    
[x: string]: Transporter<any, any>;
}The transport hook allows you to transport custom types across the server/client boundary.
Each transporter has a pair of encode and decode functions. On the server, encode determines whether a value is an instance of the custom type and, if so, returns a non-falsy encoding of the value which can be an object or an array (or false otherwise).
In the browser, decode turns the encoding back into an instance of the custom type.
import type { Transport } from '@sveltejs/kit';

declare class MyCustomType {
	
data: any
}

// hooks.js
export const transport: Transport = {
	
MyCustomType: {
		
encode: (value) => value instanceof MyCustomType && [value.data],
		
decode: ([data]) => new MyCustomType(data)
	
}
};@since2.11.0referenceTransport = {
	
type MyCustomType: {
    
encode: (value: any) => false | any[];
    
decode: ([data]: any) => MyCustomType;
}MyCustomType: {
		
Transporter<any, any>.encode: (value: any) => anyencode: (value: anyvalue) => value: anyvalue instanceof class MyCustomTypeMyCustomType && [value: MyCustomTypevalue.MyCustomType.data: anydata],
		
Transporter<any, any>.decode: (data: any) => anydecode: ([data: anydata]) => new constructor MyCustomType(): MyCustomTypeMyCustomType(data: anydata)
	
}
};@since2.11.0Transport = {
	
type Vector: {
    encode: (value: any) => false | any[];
    decode: ([x, y]: any) => any;
}Vector: {
		Transporter<any, any>.encode: (value: any) => anyencode: (value: anyvalue) => value: anyvalue instanceof import VectorVector && [value: anyvalue.x, value: anyvalue.y],
		Transporter<any, any>.decode: (data: any) => anydecode: ([x: anyx, y: anyy]) => new import VectorVector(x: anyx, y: anyy)
	}
};
```
## Further reading
Tutorial: Hooks
Edit this page on GitHub
llms.txt
previous
next
Advanced routing
Errors