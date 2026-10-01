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
Core concepts
# Form actions
### On this page
Form actions
Default actions
Named actions
Anatomy of an action
Validation errors
Redirects
Loading data
Progressive enhancement
use:enhance
Customising use:enhance
Custom event listener
Alternatives
GET vs POST
Further reading
A
`+page.server.js`
file can export
actions
, which allow you to
`POST`
data to the server using the
`<form>`
element.
When using
`<form>`
, client-side JavaScript is optional, but you can easily
progressively enhance
your form interactions with JavaScript to provide the best user experience.
The experimental
`form`
remote function
covers the same use cases as form actions, adding type safety and
single-flight mutations
. Form actions are feature-complete and will continue to work, but new development is focused on remote functions, which are intended to become the recommended way to communicate with the server. Consider remote functions for new projects, keeping in mind that the API may change while the feature is experimental.
## Default actions
In the simplest case, a page declares a
`default`
action:
src/routes/login/+page.server
```
/** @satisfies {import('./$types').Actions} */
export const actionsconst actions: {
    default: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}{import('./$types').Actions}
 = {
	default(property) default: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO log the user in	}
};
```
```
import type { Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions } from './$types';

export const actionsconst actions: {
    default: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
} = {
	default(property) default: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO log the user in	}
} satisfies Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions;
```
To invoke this action from the
`/login`
page, just add a
`<form>`
— no JavaScript needed:
src/routes/login/+page
```
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
If someone were to click the button, the browser would send the form data via
`POST`
request to the server, running the default action.
Actions always use
`POST`
requests, since
`GET`
requests should never have side-effects.
We can also invoke the action from other pages (for example if there’s a login widget in the nav in the root layout) by adding the
`action`
attribute, pointing to the page:
src/routes/+layout
```
<form method="POST" action="/login">
	<!-- content -->
</form>
```
## Named actions
Instead of one
`default`
action, a page can have as many named actions as it needs:
src/routes/login/+page.server
```
/** @satisfies {import('./$types').Actions} */
export const actionsconst actions: {
    login: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}{import('./$types').Actions}
 = {
	default: async (event) => {
	login(property) login: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO log the user in	},
	register(property) register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO register the user
	}
};
```
```
import type { Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions } from './$types';

export const actionsconst actions: {
    login: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
} = {
	default: async (event) => {
	login(property) login: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO log the user in	},
	register(property) register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO register the user
	}
} satisfies Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions;
```
To invoke a named action, add a query parameter with the name prefixed by a
`/`
character:
src/routes/login/+page
```
<form method="POST" action="?/register">
```
src/routes/+layout
```
<form method="POST" action="/login?/register">
```
As well as the
`action`
attribute, we can use the
`formaction`
attribute on a button to
`POST`
the same form data to a different action than the parent
`<form>`
:
src/routes/login/+page
```
<form method="POST" action="?/login">
	<label>
		Email
		<input name="email" type="email">
	</label>
	<label>
		Password
		<input name="password" type="password">
	</label>
	<button>Log in</button>
	<button formaction="?/register">Register</button>
</form>
```
We can’t have default actions next to named actions, because if you POST to a named action without a redirect, the query parameter is persisted in the URL, which means the next default POST would go through the named action from before.
## Anatomy of an action
Each action receives a
`RequestEvent`
object, allowing you to read the data with
`request.formData()`
. After processing the request (for example, logging the user in by setting a cookie), the action can respond with data that will be available through the
`form`
property on the corresponding page and through
`page.form`
app-wide until the next update.
src/routes/login/+page.server
```
import * as db(alias) module "$lib/server/db"
import db from '$lib/server/db';

/** @type {import('./$types').PageServerLoad} */
export async function loadfunction load(event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>): MaybePromise<void | Record<string, any>>{import('./$types').PageServerLoad}
({ cookies(parameter) cookies: CookiesGet or set cookies related to the current request
 }) {
	const userconst user: any = await db(alias) module "$lib/server/db"
import db.getUserFromSessionany(cookies(parameter) cookies: CookiesGet or set cookies related to the current request
.get(property) Cookies.get: (name: string, opts?: CookieParseOptions) => string | undefinedGets a cookie that was previously set with cookies.set, or from the request headers.
name the name of the cookie
opts the options, passed directly to cookie.parse. See documentation here
('sessionid'));
	return { user(property) user: any };
}

/** @satisfies {import('./$types').Actions} */
export const actionsconst actions: {
    login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<{
        success: boolean;
    }>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}{import('./$types').Actions}
 = {
	login(property) login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<{
    success: boolean;
}>: async ({ cookies(parameter) cookies: CookiesGet or set cookies related to the current request
, request(parameter) request: RequestThe original request object.
 }) => {
		const dataconst data: FormData = await request(parameter) request: RequestThe original request object.
.formData(method) Body.formData(): Promise<FormData>MDN Reference
();
		const emailconst email: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('email');
		const passwordconst password: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('password');

		const userconst user: any = await db(alias) module "$lib/server/db"
import db.getUserany(emailconst email: FormDataEntryValue | null);
		cookies(parameter) cookies: CookiesGet or set cookies related to the current request
.set(property) Cookies.set: (name: string, value: string, opts: CookieSerializeOptions & {
    path: string;
}) => voidSets a cookie. This will add a set-cookie header to the response, but also make the cookie available via cookies.get or cookies.getAll during the current request.
The httpOnly and secure options are true by default (except on http://localhost, where secure is false), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The sameSite option defaults to lax.
You must specify a path for the cookie. In most cases you should explicitly set path: '/' to make the cookie available throughout your app. You can use relative paths, or set path: '' to make the cookie only available on the current path and its children
name the name of the cookie
value the cookie value
opts the options, passed directly to cookie.serialize. See documentation here
('sessionid', await db(alias) module "$lib/server/db"
import db.createSessionany(userconst user: any), { path(property) path: stringSpecifies the value for the 
{@link 
https://tools.ietf.org/html/rfc6265#section-5.2.4 Path Set-Cookie attribute
}
.
By default, the path is considered the "default path".
: '/' });

		return { success(property) success: boolean: true };
	},
	register(property) register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO register the user	}
};
```
```
import * as db(alias) module "$lib/server/db"
import db from '$lib/server/db';
import type { PageServerLoad(alias) type PageServerLoad = (event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>) => MaybePromise<void | Record<string, any>>
import PageServerLoad, Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions } from './$types';

export const loadconst load: PageServerLoad: PageServerLoad(alias) type PageServerLoad = (event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>) => MaybePromise<void | Record<string, any>>
import PageServerLoad = async ({ cookies(parameter) cookies: CookiesGet or set cookies related to the current request
 }) => {
	const userconst user: any = await db(alias) module "$lib/server/db"
import db.getUserFromSessionany(cookies(parameter) cookies: CookiesGet or set cookies related to the current request
.get(property) Cookies.get: (name: string, opts?: CookieParseOptions) => string | undefinedGets a cookie that was previously set with cookies.set, or from the request headers.
name the name of the cookie
opts the options, passed directly to cookie.parse. See documentation here
('sessionid'));
	return { user(property) user: any };
};

export const actionsconst actions: {
    login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<{
        success: boolean;
    }>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
} = {
	login(property) login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<{
    success: boolean;
}>: async ({ cookies(parameter) cookies: CookiesGet or set cookies related to the current request
, request(parameter) request: RequestThe original request object.
 }) => {
		const dataconst data: FormData = await request(parameter) request: RequestThe original request object.
.formData(method) Body.formData(): Promise<FormData>MDN Reference
();
		const emailconst email: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('email');
		const passwordconst password: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('password');

		const userconst user: any = await db(alias) module "$lib/server/db"
import db.getUserany(emailconst email: FormDataEntryValue | null);
		cookies(parameter) cookies: CookiesGet or set cookies related to the current request
.set(property) Cookies.set: (name: string, value: string, opts: CookieSerializeOptions & {
    path: string;
}) => voidSets a cookie. This will add a set-cookie header to the response, but also make the cookie available via cookies.get or cookies.getAll during the current request.
The httpOnly and secure options are true by default (except on http://localhost, where secure is false), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The sameSite option defaults to lax.
You must specify a path for the cookie. In most cases you should explicitly set path: '/' to make the cookie available throughout your app. You can use relative paths, or set path: '' to make the cookie only available on the current path and its children
name the name of the cookie
value the cookie value
opts the options, passed directly to cookie.serialize. See documentation here
('sessionid', await db(alias) module "$lib/server/db"
import db.createSessionany(userconst user: any), { path(property) path: stringSpecifies the value for the 
{@link 
https://tools.ietf.org/html/rfc6265#section-5.2.4 Path Set-Cookie attribute
}
.
By default, the path is considered the "default path".
: '/' });

		return { success(property) success: boolean: true };
	},
	register(property) register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO register the user	}
} satisfies Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions;
```
src/routes/login/+page
```
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
```
<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

{#if form?.success}
	<!-- this message is ephemeral; it exists because the page was rendered in
	       response to a form submission. it will vanish if the user reloads -->
	<p>Successfully logged in! Welcome back, {data.user.name}</p>
{/if}
```
Legacy mode
`PageProps`
was added in 2.16.0. In earlier versions, you had to type the
`data`
and
`form`
properties individually:
+page
```
/** @type {{ data: import('./$types').PageData, form: import('./$types').ActionData }} */
let { data, form } = $props();
```
```
import type { PageData, ActionData } from './$types';

let { data, form }: { data: PageData, form: ActionData } = $props();
```
In Svelte 4, you’d use
`export let data`
and
`export let form`
instead to declare properties.
### Validation errors
If the request couldn’t be processed because of invalid data, you can return validation errors — along with the previously submitted form values — back to the user so that they can try again. The
`fail`
function lets you return an HTTP status code (typically 400 or 422, in the case of validation errors) along with the data. The status code is available through
`page.status`
and the data through
`form`
:
src/routes/login/+page.server
```
import { fail(alias) function fail(status: number): ActionFailure<undefined> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
reference } from '@sveltejs/kit';
import * as db(alias) module "$lib/server/db"
import db from '$lib/server/db';

/** @satisfies {import('./$types').Actions} */
export const actionsconst actions: {
    login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<ActionFailure<{
        email: string | null;
        missing: boolean;
    }> | ActionFailure<{
        email: FormDataEntryValue;
        incorrect: boolean;
    }> | {
        success: boolean;
    }>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}{import('./$types').Actions}
 = {
	login(property) login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<ActionFailure<{
    email: string | null;
    missing: boolean;
}> | ActionFailure<{
    email: FormDataEntryValue;
    incorrect: boolean;
}> | {
    success: boolean;
}>: async ({ cookies(parameter) cookies: CookiesGet or set cookies related to the current request
, request(parameter) request: RequestThe original request object.
 }) => {
		const dataconst data: FormData = await request(parameter) request: RequestThe original request object.
.formData(method) Body.formData(): Promise<FormData>MDN Reference
();
		const emailconst email: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('email');
		const passwordconst password: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('password');

		if (!emailconst email: FormDataEntryValue | null) {
			return fail(alias) fail<{
    email: string | null;
    missing: boolean;
}>(status: number, data: {
    email: string | null;
    missing: boolean;
}): ActionFailure<{
    email: string | null;
    missing: boolean;
}> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
data Data associated with the failure (e.g. validation errors)
reference(400, { email(property) email: string | null, missing(property) missing: boolean: true });
		}

		const userconst user: any = await db(alias) module "$lib/server/db"
import db.getUserany(emailconst email: FormDataEntryValue);

		if (!userconst user: any || userconst user: any.passwordany !== db(alias) module "$lib/server/db"
import db.hashany(passwordconst password: FormDataEntryValue | null)) {
			return fail(alias) fail<{
    email: FormDataEntryValue;
    incorrect: boolean;
}>(status: number, data: {
    email: FormDataEntryValue;
    incorrect: boolean;
}): ActionFailure<{
    email: FormDataEntryValue;
    incorrect: boolean;
}> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
data Data associated with the failure (e.g. validation errors)
reference(400, { email(property) email: FormDataEntryValue, incorrect(property) incorrect: boolean: true });
		}

		cookies(parameter) cookies: CookiesGet or set cookies related to the current request
.set(property) Cookies.set: (name: string, value: string, opts: CookieSerializeOptions & {
    path: string;
}) => voidSets a cookie. This will add a set-cookie header to the response, but also make the cookie available via cookies.get or cookies.getAll during the current request.
The httpOnly and secure options are true by default (except on http://localhost, where secure is false), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The sameSite option defaults to lax.
You must specify a path for the cookie. In most cases you should explicitly set path: '/' to make the cookie available throughout your app. You can use relative paths, or set path: '' to make the cookie only available on the current path and its children
name the name of the cookie
value the cookie value
opts the options, passed directly to cookie.serialize. See documentation here
('sessionid', await db(alias) module "$lib/server/db"
import db.createSessionany(userconst user: any), { path(property) path: stringSpecifies the value for the 
{@link 
https://tools.ietf.org/html/rfc6265#section-5.2.4 Path Set-Cookie attribute
}
.
By default, the path is considered the "default path".
: '/' });

		return { success(property) success: boolean: true };
	},
	register(property) register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO register the user	}
};
```
```
import { fail(alias) function fail(status: number): ActionFailure<undefined> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
reference } from '@sveltejs/kit';
import * as db(alias) module "$lib/server/db"
import db from '$lib/server/db';
import type { Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions } from './$types';

export const actionsconst actions: {
    login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<ActionFailure<{
        email: string | null;
        missing: boolean;
    }> | ActionFailure<{
        email: FormDataEntryValue;
        incorrect: boolean;
    }> | {
        success: boolean;
    }>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
} = {
	login(property) login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<ActionFailure<{
    email: string | null;
    missing: boolean;
}> | ActionFailure<{
    email: FormDataEntryValue;
    incorrect: boolean;
}> | {
    success: boolean;
}>: async ({ cookies(parameter) cookies: CookiesGet or set cookies related to the current request
, request(parameter) request: RequestThe original request object.
 }) => {
		const dataconst data: FormData = await request(parameter) request: RequestThe original request object.
.formData(method) Body.formData(): Promise<FormData>MDN Reference
();
		const emailconst email: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('email');
		const passwordconst password: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('password');

		if (!emailconst email: FormDataEntryValue | null) {
			return fail(alias) fail<{
    email: string | null;
    missing: boolean;
}>(status: number, data: {
    email: string | null;
    missing: boolean;
}): ActionFailure<{
    email: string | null;
    missing: boolean;
}> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
data Data associated with the failure (e.g. validation errors)
reference(400, { email(property) email: string | null, missing(property) missing: boolean: true });
		}

		const userconst user: any = await db(alias) module "$lib/server/db"
import db.getUserany(emailconst email: FormDataEntryValue);

		if (!userconst user: any || userconst user: any.passwordany !== db(alias) module "$lib/server/db"
import db.hashany(passwordconst password: FormDataEntryValue | null)) {
			return fail(alias) fail<{
    email: FormDataEntryValue;
    incorrect: boolean;
}>(status: number, data: {
    email: FormDataEntryValue;
    incorrect: boolean;
}): ActionFailure<{
    email: FormDataEntryValue;
    incorrect: boolean;
}> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
data Data associated with the failure (e.g. validation errors)
reference(400, { email(property) email: FormDataEntryValue, incorrect(property) incorrect: boolean: true });
		}

		cookies(parameter) cookies: CookiesGet or set cookies related to the current request
.set(property) Cookies.set: (name: string, value: string, opts: CookieSerializeOptions & {
    path: string;
}) => voidSets a cookie. This will add a set-cookie header to the response, but also make the cookie available via cookies.get or cookies.getAll during the current request.
The httpOnly and secure options are true by default (except on http://localhost, where secure is false), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The sameSite option defaults to lax.
You must specify a path for the cookie. In most cases you should explicitly set path: '/' to make the cookie available throughout your app. You can use relative paths, or set path: '' to make the cookie only available on the current path and its children
name the name of the cookie
value the cookie value
opts the options, passed directly to cookie.serialize. See documentation here
('sessionid', await db(alias) module "$lib/server/db"
import db.createSessionany(userconst user: any), { path(property) path: stringSpecifies the value for the 
{@link 
https://tools.ietf.org/html/rfc6265#section-5.2.4 Path Set-Cookie attribute
}
.
By default, the path is considered the "default path".
: '/' });

		return { success(property) success: boolean: true };
	},
	register(property) register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO register the user	}
} satisfies Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions;
```
Note that as a precaution, we only return the email back to the page — not the password.
src/routes/login/+page
```
<form method="POST" action="?/login">
	{#if form?.missing}<p class="error">The email field is required</p>{/if}
	{#if form?.incorrect}<p class="error">Invalid credentials!</p>{/if}
	<label>
		Email
		<input name="email" type="email" value={form?.email ?? ''}>
	</label>
	<label>
		Password
		<input name="password" type="password">
	</label>
	<button>Log in</button>
	<button formaction="?/register">Register</button>
</form>
```
The returned data must be serializable as JSON. Beyond that, the structure is entirely up to you. For example, if you had multiple forms on the page, you could distinguish which
`<form>`
the returned
`form`
data referred to with an
`id`
property or similar.
### Redirects
Redirects (and errors) work exactly the same as in
`load`
:
src/routes/login/+page.server
```
import { fail(alias) function fail(status: number): ActionFailure<undefined> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
reference, redirect(alias) function redirect(status: 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308 | ({} & number), location: string | URL): never
import redirectRedirect a request. When called during request handling, SvelteKit will return a redirect response.
Make sure you're not catching the thrown redirect, which would prevent SvelteKit from handling it.
Most common status codes:

303 See Other: redirect as a GET request (often used after a form POST request)
307 Temporary Redirect: redirect will keep the request method
308 Permanent Redirect: redirect will keep the request method, SEO will be transferred to the new page

See all redirect status codes
status The HTTP status code. Must be in the range 300-308.
location The location to redirect to.
{Redirect} This error instructs SvelteKit to redirect to the specified location.
{Error} If the provided status is invalid or the location cannot be used as a header value.
reference } from '@sveltejs/kit';
import * as db(alias) module "$lib/server/db"
import db from '$lib/server/db';

/** @satisfies {import('./$types').Actions} */
export const actionsconst actions: {
    login: ({ cookies, request, url }: RequestEvent<Record<string, any>, string | null>) => Promise<ActionFailure<{
        email: FormDataEntryValue | null;
        missing: boolean;
    }> | ActionFailure<{
        email: FormDataEntryValue | null;
        incorrect: boolean;
    }> | {
        success: boolean;
    }>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}{import('./$types').Actions}
 = {
	login(property) login: ({ cookies, request, url }: RequestEvent<Record<string, any>, string | null>) => Promise<ActionFailure<{
    email: FormDataEntryValue | null;
    missing: boolean;
}> | ActionFailure<{
    email: FormDataEntryValue | null;
    incorrect: boolean;
}> | {
    success: boolean;
}>: async ({ cookies(parameter) cookies: CookiesGet or set cookies related to the current request
, request(parameter) request: RequestThe original request object.
, url(parameter) url: URLThe requested URL.
In the context of a remote function request initiated by the client, this relates to the page the remote function
was called from, not the URL of the endpoint SvelteKit creates for the remote function. Never use this to determine
whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.
 }) => {
		const dataconst data: FormData = await request(parameter) request: RequestThe original request object.
.formData(method) Body.formData(): Promise<FormData>MDN Reference
();
		const emailconst email: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('email');
		const passwordconst password: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('password');

		const userconst user: any = await db(alias) module "$lib/server/db"
import db.getUserany(emailconst email: FormDataEntryValue | null);
		if (!userconst user: any) {
			return fail(alias) fail<{
    email: FormDataEntryValue | null;
    missing: boolean;
}>(status: number, data: {
    email: FormDataEntryValue | null;
    missing: boolean;
}): ActionFailure<{
    email: FormDataEntryValue | null;
    missing: boolean;
}> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
data Data associated with the failure (e.g. validation errors)
reference(400, { email(property) email: FormDataEntryValue | null, missing(property) missing: boolean: true });
		}

		if (userconst user: any.passwordany !== db(alias) module "$lib/server/db"
import db.hashany(passwordconst password: FormDataEntryValue | null)) {
			return fail(alias) fail<{
    email: FormDataEntryValue | null;
    incorrect: boolean;
}>(status: number, data: {
    email: FormDataEntryValue | null;
    incorrect: boolean;
}): ActionFailure<{
    email: FormDataEntryValue | null;
    incorrect: boolean;
}> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
data Data associated with the failure (e.g. validation errors)
reference(400, { email(property) email: FormDataEntryValue | null, incorrect(property) incorrect: boolean: true });
		}

		cookies(parameter) cookies: CookiesGet or set cookies related to the current request
.set(property) Cookies.set: (name: string, value: string, opts: CookieSerializeOptions & {
    path: string;
}) => voidSets a cookie. This will add a set-cookie header to the response, but also make the cookie available via cookies.get or cookies.getAll during the current request.
The httpOnly and secure options are true by default (except on http://localhost, where secure is false), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The sameSite option defaults to lax.
You must specify a path for the cookie. In most cases you should explicitly set path: '/' to make the cookie available throughout your app. You can use relative paths, or set path: '' to make the cookie only available on the current path and its children
name the name of the cookie
value the cookie value
opts the options, passed directly to cookie.serialize. See documentation here
('sessionid', await db(alias) module "$lib/server/db"
import db.createSessionany(userconst user: any), { path(property) path: stringSpecifies the value for the 
{@link 
https://tools.ietf.org/html/rfc6265#section-5.2.4 Path Set-Cookie attribute
}
.
By default, the path is considered the "default path".
: '/' });

		if (url(parameter) url: URLThe requested URL.
In the context of a remote function request initiated by the client, this relates to the page the remote function
was called from, not the URL of the endpoint SvelteKit creates for the remote function. Never use this to determine
whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.
.searchParams(property) URL.searchParams: URLSearchParamsThe searchParams read-only property of the URL interface returns a URLSearchParams object allowing access to the GET decoded query arguments contained in the URL.
MDN Reference
.has(method) URLSearchParams.has(name: string, value?: string): booleanThe has() method of the URLSearchParams interface returns a boolean value that indicates whether the specified parameter is in the search parameters.
MDN Reference
('redirectTo')) {
			redirect(alias) redirect(status: 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308 | ({} & number), location: string | URL): never
import redirectRedirect a request. When called during request handling, SvelteKit will return a redirect response.
Make sure you're not catching the thrown redirect, which would prevent SvelteKit from handling it.
Most common status codes:

303 See Other: redirect as a GET request (often used after a form POST request)
307 Temporary Redirect: redirect will keep the request method
308 Permanent Redirect: redirect will keep the request method, SEO will be transferred to the new page

See all redirect status codes
status The HTTP status code. Must be in the range 300-308.
location The location to redirect to.
{Redirect} This error instructs SvelteKit to redirect to the specified location.
{Error} If the provided status is invalid or the location cannot be used as a header value.
reference(303, url(parameter) url: URLThe requested URL.
In the context of a remote function request initiated by the client, this relates to the page the remote function
was called from, not the URL of the endpoint SvelteKit creates for the remote function. Never use this to determine
whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.
.searchParams(property) URL.searchParams: URLSearchParamsThe searchParams read-only property of the URL interface returns a URLSearchParams object allowing access to the GET decoded query arguments contained in the URL.
MDN Reference
.get(method) URLSearchParams.get(name: string): string | nullThe get() method of the URLSearchParams interface returns the first value associated to the given search parameter.
MDN Reference
('redirectTo'));
		}

		return { success(property) success: boolean: true };
	},
	register(property) register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO register the user	}
};
```
```
import { fail(alias) function fail(status: number): ActionFailure<undefined> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
reference, redirect(alias) function redirect(status: 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308 | ({} & number), location: string | URL): never
import redirectRedirect a request. When called during request handling, SvelteKit will return a redirect response.
Make sure you're not catching the thrown redirect, which would prevent SvelteKit from handling it.
Most common status codes:

303 See Other: redirect as a GET request (often used after a form POST request)
307 Temporary Redirect: redirect will keep the request method
308 Permanent Redirect: redirect will keep the request method, SEO will be transferred to the new page

See all redirect status codes
status The HTTP status code. Must be in the range 300-308.
location The location to redirect to.
{Redirect} This error instructs SvelteKit to redirect to the specified location.
{Error} If the provided status is invalid or the location cannot be used as a header value.
reference } from '@sveltejs/kit';
import * as db(alias) module "$lib/server/db"
import db from '$lib/server/db';
import type { Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions } from './$types';

export const actionsconst actions: {
    login: ({ cookies, request, url }: RequestEvent<Record<string, any>, string | null>) => Promise<ActionFailure<{
        email: FormDataEntryValue | null;
        missing: boolean;
    }> | ActionFailure<{
        email: FormDataEntryValue | null;
        incorrect: boolean;
    }> | {
        success: boolean;
    }>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
} = {
	login(property) login: ({ cookies, request, url }: RequestEvent<Record<string, any>, string | null>) => Promise<ActionFailure<{
    email: FormDataEntryValue | null;
    missing: boolean;
}> | ActionFailure<{
    email: FormDataEntryValue | null;
    incorrect: boolean;
}> | {
    success: boolean;
}>: async ({ cookies(parameter) cookies: CookiesGet or set cookies related to the current request
, request(parameter) request: RequestThe original request object.
, url(parameter) url: URLThe requested URL.
In the context of a remote function request initiated by the client, this relates to the page the remote function
was called from, not the URL of the endpoint SvelteKit creates for the remote function. Never use this to determine
whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.
 }) => {
		const dataconst data: FormData = await request(parameter) request: RequestThe original request object.
.formData(method) Body.formData(): Promise<FormData>MDN Reference
();
		const emailconst email: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('email');
		const passwordconst password: FormDataEntryValue | null = dataconst data: FormData.get(method) FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
('password');

		const userconst user: any = await db(alias) module "$lib/server/db"
import db.getUserany(emailconst email: FormDataEntryValue | null);
		if (!userconst user: any) {
			return fail(alias) fail<{
    email: FormDataEntryValue | null;
    missing: boolean;
}>(status: number, data: {
    email: FormDataEntryValue | null;
    missing: boolean;
}): ActionFailure<{
    email: FormDataEntryValue | null;
    missing: boolean;
}> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
data Data associated with the failure (e.g. validation errors)
reference(400, { email(property) email: FormDataEntryValue | null, missing(property) missing: boolean: true });
		}

		if (userconst user: any.passwordany !== db(alias) module "$lib/server/db"
import db.hashany(passwordconst password: FormDataEntryValue | null)) {
			return fail(alias) fail<{
    email: FormDataEntryValue | null;
    incorrect: boolean;
}>(status: number, data: {
    email: FormDataEntryValue | null;
    incorrect: boolean;
}): ActionFailure<{
    email: FormDataEntryValue | null;
    incorrect: boolean;
}> (+1 overload)
import failCreate an ActionFailure object. Call when form submission fails.
status The HTTP status code. Must be in the range 400-599.
data Data associated with the failure (e.g. validation errors)
reference(400, { email(property) email: FormDataEntryValue | null, incorrect(property) incorrect: boolean: true });
		}

		cookies(parameter) cookies: CookiesGet or set cookies related to the current request
.set(property) Cookies.set: (name: string, value: string, opts: CookieSerializeOptions & {
    path: string;
}) => voidSets a cookie. This will add a set-cookie header to the response, but also make the cookie available via cookies.get or cookies.getAll during the current request.
The httpOnly and secure options are true by default (except on http://localhost, where secure is false), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The sameSite option defaults to lax.
You must specify a path for the cookie. In most cases you should explicitly set path: '/' to make the cookie available throughout your app. You can use relative paths, or set path: '' to make the cookie only available on the current path and its children
name the name of the cookie
value the cookie value
opts the options, passed directly to cookie.serialize. See documentation here
('sessionid', await db(alias) module "$lib/server/db"
import db.createSessionany(userconst user: any), { path(property) path: stringSpecifies the value for the 
{@link 
https://tools.ietf.org/html/rfc6265#section-5.2.4 Path Set-Cookie attribute
}
.
By default, the path is considered the "default path".
: '/' });

		if (url(parameter) url: URLThe requested URL.
In the context of a remote function request initiated by the client, this relates to the page the remote function
was called from, not the URL of the endpoint SvelteKit creates for the remote function. Never use this to determine
whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.
.searchParams(property) URL.searchParams: URLSearchParamsThe searchParams read-only property of the URL interface returns a URLSearchParams object allowing access to the GET decoded query arguments contained in the URL.
MDN Reference
.has(method) URLSearchParams.has(name: string, value?: string): booleanThe has() method of the URLSearchParams interface returns a boolean value that indicates whether the specified parameter is in the search parameters.
MDN Reference
('redirectTo')) {
			redirect(alias) redirect(status: 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308 | ({} & number), location: string | URL): never
import redirectRedirect a request. When called during request handling, SvelteKit will return a redirect response.
Make sure you're not catching the thrown redirect, which would prevent SvelteKit from handling it.
Most common status codes:

303 See Other: redirect as a GET request (often used after a form POST request)
307 Temporary Redirect: redirect will keep the request method
308 Permanent Redirect: redirect will keep the request method, SEO will be transferred to the new page

See all redirect status codes
status The HTTP status code. Must be in the range 300-308.
location The location to redirect to.
{Redirect} This error instructs SvelteKit to redirect to the specified location.
{Error} If the provided status is invalid or the location cannot be used as a header value.
reference(303, url(parameter) url: URLThe requested URL.
In the context of a remote function request initiated by the client, this relates to the page the remote function
was called from, not the URL of the endpoint SvelteKit creates for the remote function. Never use this to determine
whether or not a user is authorized to access certain data, as these values are part of the request which could be manipulated.
.searchParams(property) URL.searchParams: URLSearchParamsThe searchParams read-only property of the URL interface returns a URLSearchParams object allowing access to the GET decoded query arguments contained in the URL.
MDN Reference
.get(method) URLSearchParams.get(name: string): string | nullThe get() method of the URLSearchParams interface returns the first value associated to the given search parameter.
MDN Reference
('redirectTo'));
		}

		return { success(property) success: boolean: true };
	},
	register(property) register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		// TODO register the user	}
} satisfies Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions;
```
## Loading data
After an action runs, the page will be re-rendered (unless a redirect or an unexpected error occurs), with the action’s return value available to the page as the
`form`
prop. This means that your page’s
`load`
functions will run after the action completes.
Note that
`handle`
runs before the action is invoked, and does not rerun before the
`load`
functions. This means that if, for example, you use
`handle`
to populate
`event.locals`
based on a cookie, you must update
`event.locals`
when you set or delete the cookie in an action:
src/hooks.server
```
/** @type {import('@sveltejs/kit').Handle} */
export async function handlefunction handle(input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}): MaybePromise<Response>{import('@sveltejs/kit').Handle}
({ event(parameter) event: RequestEvent<Record<string, string>, string | null>, resolve(parameter) resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response> }) {
	event(parameter) event: RequestEvent<Record<string, string>, string | null>.locals(property) RequestEvent<Record<string, string>, string | null>.locals: App.LocalsContains custom data that was added to the request within the server handle hook.
.user(property) App.Locals.user: {
    name: string;
} | null = await getUserfunction getUser(sessionid: string | undefined): {
    name: string;
}(event(parameter) event: RequestEvent<Record<string, string>, string | null>.cookies(property) RequestEvent<Record<string, string>, string | null>.cookies: CookiesGet or set cookies related to the current request
.get(property) Cookies.get: (name: string, opts?: CookieParseOptions) => string | undefinedGets a cookie that was previously set with cookies.set, or from the request headers.
name the name of the cookie
opts the options, passed directly to cookie.parse. See documentation here
('sessionid'));
	return resolve(parameter) resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>(event(parameter) event: RequestEvent<Record<string, string>, string | null>);
}
```
```
import type { Handle(alias) type Handle = (input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}) => MaybePromise<Response>
import HandleThe handle hook runs every time the SvelteKit server receives a request and
determines the response.
It receives an event object representing the request and a function called resolve, which renders the route and generates a Response.
This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing routes programmatically, for example).
reference } from '@sveltejs/kit';

export const handleconst handle: Handle: Handle(alias) type Handle = (input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>;
}) => MaybePromise<Response>
import HandleThe handle hook runs every time the SvelteKit server receives a request and
determines the response.
It receives an event object representing the request and a function called resolve, which renders the route and generates a Response.
This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing routes programmatically, for example).
reference = async ({ event(parameter) event: RequestEvent<Record<string, string>, string | null>, resolve(parameter) resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response> }) => {
	event(parameter) event: RequestEvent<Record<string, string>, string | null>.locals(property) RequestEvent<Record<string, string>, string | null>.locals: App.LocalsContains custom data that was added to the request within the server handle hook.
.user(property) App.Locals.user: {
    name: string;
} | null = await getUserfunction getUser(sessionid: string | undefined): {
    name: string;
}(event(parameter) event: RequestEvent<Record<string, string>, string | null>.cookies(property) RequestEvent<Record<string, string>, string | null>.cookies: CookiesGet or set cookies related to the current request
.get(property) Cookies.get: (name: string, opts?: CookieParseOptions) => string | undefinedGets a cookie that was previously set with cookies.set, or from the request headers.
name the name of the cookie
opts the options, passed directly to cookie.parse. See documentation here
('sessionid'));
	return resolve(parameter) resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>(event(parameter) event: RequestEvent<Record<string, string>, string | null>);
};
```
src/routes/account/+page.server
```
/** @type {import('./$types').PageServerLoad} */
export function loadfunction load(event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>): MaybePromise<void | Record<string, any>>{import('./$types').PageServerLoad}
(event(parameter) event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>) {
	return {
		user(property) user: {
    name: string;
} | null: event(parameter) event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>.locals(property) RequestEvent<Record<string, any>, string | null>.locals: App.LocalsContains custom data that was added to the request within the server handle hook.
.user(property) App.Locals.user: {
    name: string;
} | null
	};
}

/** @satisfies {import('./$types').Actions} */
export const actionsconst actions: {
    logout: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}{import('./$types').Actions}
 = {
	logout(property) logout: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		event(parameter) event: RequestEvent<Record<string, any>, string | null>.cookies(property) RequestEvent<Record<string, any>, string | null>.cookies: CookiesGet or set cookies related to the current request
.delete(property) Cookies.delete: (name: string, opts: CookieSerializeOptions & {
    path: string;
}) => voidDeletes a cookie by setting its value to an empty string and setting the expiry date in the past.
You must specify a path for the cookie. In most cases you should explicitly set path: '/' to make the cookie available throughout your app. You can use relative paths, or set path: '' to make the cookie only available on the current path and its children
name the name of the cookie
opts the options, passed directly to cookie.serialize. The path must match the path of the cookie you want to delete. See documentation here
('sessionid', { path(property) path: stringSpecifies the value for the 
{@link 
https://tools.ietf.org/html/rfc6265#section-5.2.4 Path Set-Cookie attribute
}
.
By default, the path is considered the "default path".
: '/' });
		event(parameter) event: RequestEvent<Record<string, any>, string | null>.locals(property) RequestEvent<Params extends LayoutParams<"/"> = Record<string, string>, RouteId extends RouteId | null = string | null>.locals: App.LocalsContains custom data that was added to the request within the server handle hook.
.user(property) App.Locals.user: {
    name: string;
} | null = null;
	}
};
```
```
import type { PageServerLoad(alias) type PageServerLoad = (event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>) => MaybePromise<void | Record<string, any>>
import PageServerLoad, Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions } from './$types';

export const loadconst load: PageServerLoad: PageServerLoad(alias) type PageServerLoad = (event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>) => MaybePromise<void | Record<string, any>>
import PageServerLoad = (event(parameter) event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>) => {
	return {
		user(property) user: {
    name: string;
} | null: event(parameter) event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>.locals(property) RequestEvent<Record<string, any>, string | null>.locals: App.LocalsContains custom data that was added to the request within the server handle hook.
.user(property) App.Locals.user: {
    name: string;
} | null
	};
};

export const actionsconst actions: {
    logout: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
} = {
	logout(property) logout: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>: async (event(parameter) event: RequestEvent<Record<string, any>, string | null>) => {
		event(parameter) event: RequestEvent<Record<string, any>, string | null>.cookies(property) RequestEvent<Record<string, any>, string | null>.cookies: CookiesGet or set cookies related to the current request
.delete(property) Cookies.delete: (name: string, opts: CookieSerializeOptions & {
    path: string;
}) => voidDeletes a cookie by setting its value to an empty string and setting the expiry date in the past.
You must specify a path for the cookie. In most cases you should explicitly set path: '/' to make the cookie available throughout your app. You can use relative paths, or set path: '' to make the cookie only available on the current path and its children
name the name of the cookie
opts the options, passed directly to cookie.serialize. The path must match the path of the cookie you want to delete. See documentation here
('sessionid', { path(property) path: stringSpecifies the value for the 
{@link 
https://tools.ietf.org/html/rfc6265#section-5.2.4 Path Set-Cookie attribute
}
.
By default, the path is considered the "default path".
: '/' });
		event(parameter) event: RequestEvent<Record<string, any>, string | null>.locals(property) RequestEvent<Params extends LayoutParams<"/"> = Record<string, string>, RouteId extends RouteId | null = string | null>.locals: App.LocalsContains custom data that was added to the request within the server handle hook.
.user(property) App.Locals.user: {
    name: string;
} | null = null;
	}
} satisfies Actions(alias) type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
import Actions;
```
## Progressive enhancement
In the preceding sections we built a
`/login`
action that
works without client-side JavaScript
— not a
`fetch`
in sight. That’s great, but when JavaScript
is
available we can progressively enhance our form interactions to provide a better user experience.
### use:enhance
The easiest way to progressively enhance a form is to add the
`use:enhance`
action:
src/routes/login/+page
```
<script>
	import { enhance } from '$app/forms';

	/** @type {import('./$types').PageProps} */
	let { form } = $props();
</script>

<form method="POST" use:enhance>
```
```
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<form method="POST" use:enhance>
```
`use:enhance`
can only be used with forms that have
`method="POST"`
and point to actions defined in a
`+page.server.js`
file. It will not work with
`method="GET"`
, which is the default for forms without a specified method. Attempting to use
`use:enhance`
on forms without
`method="POST"`
or posting to a
`+server.js`
endpoint will result in an error.
Yes, it’s a little confusing that the
`enhance`
action and
`<form action>`
are both called ‘action’. These docs are action-packed. Sorry.
Without an argument,
`use:enhance`
will emulate the browser-native behaviour, just without the full-page reloads. It will:
update the
`form`
property,
`page.form`
and
`page.status`
on a successful or invalid response, but only if the action is on the same page you’re submitting from. For example, if your form looks like
`<form action="/somewhere/else" ..>`
, the
`form`
prop and the
`page.form`
state will
not
be updated. This is because in the native form submission case you would be redirected to the page the action is on. If you want to have them updated either way, use
`applyAction`
reset the
`<form>`
element
invalidate all data using
`invalidateAll`
on a successful response
call
`goto`
on a redirect response
render the nearest
`+error`
boundary if an error occurs
reset focus
to the appropriate element
### Customising use:enhance
To customise the behaviour, you can provide a
`SubmitFunction`
that runs immediately before the form is submitted, and (optionally) returns a callback that runs with the
`ActionResult`
.
```
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
If you return a callback, you override the default post-submission behavior. To get it back, call
`update`
, which accepts
`invalidateAll`
and
`reset`
parameters, or use
`applyAction`
on the result:
src/routes/login/+page
```
<script>
	import { enhance, applyAction } from '$app/forms';

	/** @type {import('./$types').PageProps} */
	let { form } = $props();
</script>

<form
	method="POST"
	use:enhance={({ formElement, formData, action, cancel }) => {
		return async ({ result }) => {
			// `result` is an `ActionResult` object
			if (result.type === 'redirect') {
				goto(result.location);
			} else {
				await applyAction(result);
			}
		};
	}}
>
```
```
<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<form
	method="POST"
	use:enhance={({ formElement, formData, action, cancel }) => {
		return async ({ result }) => {
			// `result` is an `ActionResult` object
			if (result.type === 'redirect') {
				goto(result.location);
			} else {
				await applyAction(result);
			}
		};
	}}
>
```
The behaviour of
`applyAction(result)`
depends on
`result.type`
:
`success`
,
`failure`
— sets
`page.status`
to
`result.status`
and updates
`form`
and
`page.form`
to
`result.data`
(regardless of where you are submitting from, in contrast to
`update`
from
`enhance`
)
`redirect`
— calls
`goto(result.location, { invalidateAll: true })`
`error`
— renders the nearest
`+error`
boundary with
`result.error`
In all cases,
focus will be reset
.
### Custom event listener
We can also implement progressive enhancement ourselves, without
`use:enhance`
, with a normal event listener on the
`<form>`
:
src/routes/login/+page
```
<script>
	import { invalidateAll, goto } from '$app/navigation';
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

		/** @type {import('@sveltejs/kit').ActionResult} */
		const result = deserialize(await response.text());

		if (result.type === 'success') {
			// rerun all `load` functions, following the successful update
			await invalidateAll();
		}

		applyAction(result);
	}
</script>

<form method="POST" onsubmit={handleSubmit}>
	<!-- content -->
</form>
```
```
<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { applyAction, deserialize } from '$app/forms';
	import type { PageProps } from './$types';
	import type { ActionResult } from '@sveltejs/kit';
	let { form }: PageProps = $props();

	async function handleSubmit(event: SubmitEvent & { currentTarget: EventTarget & HTMLFormElement}) {
		event.preventDefault();
		const data = new FormData(event.currentTarget, event.submitter);

		const response = await fetch(event.currentTarget.action, {
			method: 'POST',
			body: data
		});

		const result: ActionResult = deserialize(await response.text());

		if (result.type === 'success') {
			// rerun all `load` functions, following the successful update
			await invalidateAll();
		}

		applyAction(result);
	}
</script>

<form method="POST" onsubmit={handleSubmit}>
	<!-- content -->
</form>
```
Note that you need to
`deserialize`
the response before processing it further using the corresponding method from
`$app/forms`
.
`JSON.parse()`
isn’t enough because form actions - like
`load`
functions - also support returning
`Date`
or
`BigInt`
objects.
If you have a
`+server.js`
alongside your
`+page.server.js`
,
`fetch`
requests will be routed there by default. To
`POST`
to an action in
`+page.server.js`
instead, use the custom
`x-sveltekit-action`
header:
```
const responseconst response: Response = await fetchfunction fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> (+1 overload)MDN Reference
(this.actionany, {
	method(property) RequestInit.method?: string | undefinedA string to set request's method.
: 'POST',
	body(property) RequestInit.body?: BodyInit | null | undefinedA BodyInit object or null to set request's body.
: dataany,
	headers(property) RequestInit.headers?: HeadersInit | undefinedA Headers object, an object literal, or an array of two-item arrays to set request's headers.
: {
		'x-sveltekit-action': 'true'
	}
});
```
## Alternatives
Form actions are the preferred way to send data to the server, since they can be progressively enhanced, but you can also use
`+server.js`
files to expose (for example) a JSON API. Here’s how such an interaction could look like:
src/routes/send-message/+page
```
<script>
	function rerun() {
		fetch('/api/ci', {
			method: 'POST'
		});
	}
</script>

<button onclick={rerun}>Rerun CI</button>
```
```
<script lang="ts">
	function rerun() {
		fetch('/api/ci', {
			method: 'POST'
		});
	}
</script>

<button onclick={rerun}>Rerun CI</button>
```
src/routes/api/ci/+server
```
/** @type {import('./$types').RequestHandler} */
export function POSTfunction POST(event: RequestEvent<Record<string, any>, string | null>): MaybePromise<Response>{import('./$types').RequestHandler}
() {
	// do something}
```
```
import type { RequestHandler(alias) type RequestHandler = (event: RequestEvent<Record<string, any>, string | null>) => MaybePromise<Response>
import RequestHandler } from './$types';
export const POSTconst POST: RequestHandler: RequestHandler(alias) type RequestHandler = (event: RequestEvent<Record<string, any>, string | null>) => MaybePromise<Response>
import RequestHandler = () => {
	// do something};
```
## GET vs POST
As we’ve seen, to invoke a form action you must use
`method="POST"`
.
Some forms don’t need to
`POST`
data to the server — search inputs, for example. For these you can use
`method="GET"`
(or, equivalently, no
`method`
at all), and SvelteKit will treat them like
`<a>`
elements, using the client-side router instead of a full page navigation:
```
<form action="/search">
	<label>
		Search
		<input name="q">
	</label>
</form>
```
Submitting this form will navigate to
`/search?q=...`
and invoke your load function but will not invoke an action. As with
`<a>`
elements, you can set the
`data-sveltekit-reload`
,
`data-sveltekit-replacestate`
,
`data-sveltekit-keepfocus`
and
`data-sveltekit-noscroll`
attributes on the
`<form>`
to control the router’s behaviour.
## Further reading
Tutorial: Forms
Edit this page on GitHub
llms.txt
previous
next
Loading data
Page options