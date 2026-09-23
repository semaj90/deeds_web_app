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
export const 
const actions: {
    default: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}@satisfies{import('./$types').Actions}actions = {
	default: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>default: async (event: RequestEvent<Record<string, any>, string | null>event) => {
		// TODO log the user in
	}
};
```
```
import type { 
type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}Actions } from './$types';

export const 
const actions: {
    default: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}actions = {
	default: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>default: async (event: RequestEvent<Record<string, any>, string | null>event) => {
		// TODO log the user in
	}
} satisfies 
type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}Actions;
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
export const 
const actions: {
    login: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}@satisfies{import('./$types').Actions}actions = {
	default: async (event) => {
	login: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>login: async (event: RequestEvent<Record<string, any>, string | null>event) => {
		// TODO log the user in
	},
	register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>register: async (event: RequestEvent<Record<string, any>, string | null>event) => {
		// TODO register the user
	}
};
```
```
import type { 
type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}Actions } from './$types';

export const 
const actions: {
    login: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}actions = {
	default: async (event) => {
	login: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>login: async (event: RequestEvent<Record<string, any>, string | null>event) => {
		// TODO log the user in
	},
	register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>register: async (event: RequestEvent<Record<string, any>, string | null>event) => {
		// TODO register the user
	}
} satisfies 
type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}Actions;
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
import * as module "$lib/server/db"db from '$lib/server/db';

/** @type {import('./$types').PageServerLoad} */
export async function function load(event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>): MaybePromise<void | Record<string, any>>load({ cookies: CookiesGet or set cookies related to the current request
cookies }) {
	const const user: anyuser = await module "$lib/server/db"db.getUserFromSession(cookies: CookiesGet or set cookies related to the current request
cookies.Cookies.get: (name: string, opts?: CookieParseOptions) => string | undefinedGets a cookie that was previously set with cookies.set, or from the request headers.
@paramname the name of the cookie@paramopts the options, passed directly to cookie.parse. See documentation hereget('sessionid'));
	return { user: anyuser };
}

/** @satisfies {import('./$types').Actions} */
export const 
const actions: {
    login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<{
        success: boolean;
    }>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}@satisfies{import('./$types').Actions}actions = {
	
login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<{
    success: boolean;
}>login: async ({ cookies: CookiesGet or set cookies related to the current request
cookies, request: RequestThe original request object.
request }) => {
		const const data: FormDatadata = await request: RequestThe original request object.
request.Body.formData(): Promise<FormData>MDN Reference
formData();
		const const email: FormDataEntryValue | nullemail = const data: FormDatadata.FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
get('email');
		const const password: FormDataEntryValue | nullpassword = const data: FormDatadata.FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
get('password');

		const const user: anyuser = await module "$lib/server/db"db.getUser(const email: FormDataEntryValue | nullemail);
		cookies: CookiesGet or set cookies related to the current request
cookies.
Cookies.set: (name: string, value: string, opts: CookieSerializeOptions & {
    path: string;
}) => voidSets a cookie. This will add a set-cookie header to the response, but also make the cookie available via cookies.get or cookies.getAll during the current request.
The httpOnly and secure options are true by default (except on http://localhost, where secure is false), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The sameSite option defaults to lax.
You must specify a path for the cookie. In most cases you should explicitly set path: '/' to make the cookie available throughout your app. You can use relative paths, or set path: '' to make the cookie only available on the current path and its children
@paramname the name of the cookie@paramvalue the cookie value@paramopts the options, passed directly to cookie.serialize. See documentation hereset('sessionid', await module "$lib/server/db"db.createSession(const user: anyuser), { path: stringSpecifies the value for the 
{@link 
https://tools.ietf.org/html/rfc6265#section-5.2.4 Path Set-Cookie attribute
}
.
By default, the path is considered the “default path”.
path: '/' });

		return { success: booleansuccess: true };
	},
	register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>register: async (event: RequestEvent<Record<string, any>, string | null>event) => {
		// TODO register the user
	}
};
```
```
import * as module "$lib/server/db"db from '$lib/server/db';
import type { type PageServerLoad = (event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>) => MaybePromise<void | Record<string, any>>PageServerLoad, 
type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}Actions } from './$types';

export const const load: PageServerLoadload: type PageServerLoad = (event: ServerLoadEvent<Record<string, any>, Record<string, any>, string | null>) => MaybePromise<void | Record<string, any>>PageServerLoad = async ({ cookies: CookiesGet or set cookies related to the current request
cookies }) => {
	const const user: anyuser = await module "$lib/server/db"db.getUserFromSession(cookies: CookiesGet or set cookies related to the current request
cookies.Cookies.get: (name: string, opts?: CookieParseOptions) => string | undefinedGets a cookie that was previously set with cookies.set, or from the request headers.
@paramname the name of the cookie@paramopts the options, passed directly to cookie.parse. See documentation hereget('sessionid'));
	return { user: anyuser };
};

export const 
const actions: {
    login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<{
        success: boolean;
    }>;
    register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>;
}actions = {
	
login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<{
    success: boolean;
}>login: async ({ cookies: CookiesGet or set cookies related to the current request
cookies, request: RequestThe original request object.
request }) => {
		const const data: FormDatadata = await request: RequestThe original request object.
request.Body.formData(): Promise<FormData>MDN Reference
formData();
		const const email: FormDataEntryValue | nullemail = const data: FormDatadata.FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
get('email');
		const const password: FormDataEntryValue | nullpassword = const data: FormDatadata.FormData.get(name: string): FormDataEntryValue | nullThe get() method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
get('password');

		const const user: anyuser = await module "$lib/server/db"db.getUser(const email: FormDataEntryValue | nullemail);
		cookies: CookiesGet or set cookies related to the current request
cookies.
Cookies.set: (name: string, value: string, opts: CookieSerializeOptions & {
    path: string;
}) => voidSets a cookie. This will add a set-cookie header to the response, but also make the cookie available via cookies.get or cookies.getAll during the current request.
The httpOnly and secure options are true by default (except on http://localhost, where secure is false), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The sameSite option defaults to lax.
You must specify a path for the cookie. In most cases you should explicitly set path: '/' to make the cookie available throughout your app. You can use relative paths, or set path: '' to make the cookie only available on the current path and its children
@paramname the name of the cookie@paramvalue the cookie value@paramopts the options, passed directly to cookie.serialize. See documentation hereset('sessionid', await module "$lib/server/db"db.createSession(const user: anyuser), { path: stringSpecifies the value for the 
{@link 
https://tools.ietf.org/html/rfc6265#section-5.2.4 Path Set-Cookie attribute
}
.
By default, the path is considered the “default path”.
path: '/' });

		return { success: booleansuccess: true };
	},
	register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>register: async (event: RequestEvent<Record<string, any>, string | null>event) => {
		// TODO register the user
	}
} satisfies 
type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}Actions;
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
import { function fail(status: number): ActionFailure<undefined> (+1 overload)Create an ActionFailure object. Call when form submission fails.
```
@param
status
The
HTTP status code
. Must be in the range 400-599.
reference
fail
}
from
'@sveltejs/kit'
;
import
*
as
`module "$lib/server/db"`
db
from
'$lib/server/db'
;
/**
@satisfies
{import('./$types').Actions}
*/
export
const
`
```
const actions: {
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
}
```
`
@satisfies
{import('./$types').Actions}
actions
=
{
`
```
login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<ActionFailure<{
    email: string | null;
    missing: boolean;
}> | ActionFailure<{
    email: FormDataEntryValue;
    incorrect: boolean;
}> | {
    success: boolean;
}>
```
`
login
:
async
({
`cookies: Cookies`
Get or set cookies related to the current request
cookies
,
`request: Request`
The original request object.
request
})
=>
{
const
`const data: FormData`
data
=
await
`request: Request`
The original request object.
request
.
`Body.formData(): Promise<FormData>`
MDN Reference
formData
();
const
`const email: FormDataEntryValue | null`
email
=
`const data: FormData`
data
.
`FormData.get(name: string): FormDataEntryValue | null`
The
`get()`
method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
get
(
'email'
);
const
`const password: FormDataEntryValue | null`
password
=
`const data: FormData`
data
.
`FormData.get(name: string): FormDataEntryValue | null`
The
`get()`
method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
get
(
'password'
);
if
(
!
`const email: FormDataEntryValue | null`
email
) {
return
`
```
fail<{
```
`
email
:
string
|
null
;
missing
:
boolean
;
}>(status
:
number
,
data
:
{
email
:
string
|
null
;
missing
:
boolean
;
})
:
ActionFailure
<{
email
:
string
|
null
;
missing
:
boolean
;
}> (+
1
overload
)
Create an
`ActionFailure`
object. Call when form submission fails.
@param
status
The
HTTP status code
. Must be in the range 400-599.
@param
data
Data associated with the failure (e.g. validation errors)
reference
fail
(
400
,
{
`email: string | null`
email
,
`missing: boolean`
missing
:
true
});
}
const
`const user: any`
user
=
await
`module "$lib/server/db"`
db
.
getUser
(
`const email: FormDataEntryValue`
email
);
if
(
!
`const user: any`
user
||
`const user: any`
user
.
password
!==
`module "$lib/server/db"`
db
.
hash
(
`const password: FormDataEntryValue | null`
password
)) {
return
`
```
fail<{
```
`
email
:
FormDataEntryValue
;
incorrect
:
boolean
;
}>(status
:
number
,
data
:
{
email
:
FormDataEntryValue
;
incorrect
:
boolean
;
})
:
ActionFailure
<{
email
:
FormDataEntryValue
;
incorrect
:
boolean
;
}> (+
1
overload
)
Create an
`ActionFailure`
object. Call when form submission fails.
@param
status
The
HTTP status code
. Must be in the range 400-599.
@param
data
Data associated with the failure (e.g. validation errors)
reference
fail
(
400
,
{
`email: FormDataEntryValue`
email
,
`incorrect: boolean`
incorrect
:
true
});
}
`cookies: Cookies`
Get or set cookies related to the current request
cookies
.
`
```
Cookies.set: (name: string, value: string, opts: CookieSerializeOptions & {
    path: string;
}) => void
```
`
Sets a cookie. This will add a
`set-cookie`
header to the response, but also make the cookie available via
`cookies.get`
or
`cookies.getAll`
during the current request.
The
`httpOnly`
and
`secure`
options are
`true`
by default (except on
http://localhost
, where
`secure`
is
`false`
), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The
`sameSite`
option defaults to
`lax`
.
You must specify a
`path`
for the cookie. In most cases you should explicitly set
`path: '/'`
to make the cookie available throughout your app. You can use relative paths, or set
`path: ''`
to make the cookie only available on the current path and its children
@param
name
the name of the cookie
@param
value
the cookie value
@param
opts
the options, passed directly to
`cookie.serialize`
. See documentation
here
set
(
'sessionid'
,
await
`module "$lib/server/db"`
db
.
createSession
(
`const user: any`
user
)
,
{
`path: string`
Specifies the value for the 
{@link
https://tools.ietf.org/html/rfc6265#section-5.2.4
`Path`
`Set-Cookie`
attribute
}
.
By default, the path is considered the “default path”.
path
:
'/'
});
return
{
`success: boolean`
success
:
true
};
}
,
`register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>`
register
:
async
(
`event: RequestEvent<Record<string, any>, string | null>`
event
)
=>
{
// TODO register the user
}
};
```
import { function fail(status: number): ActionFailure<undefined> (+1 overload)Create an ActionFailure object. Call when form submission fails.
```
@param
status
The
HTTP status code
. Must be in the range 400-599.
reference
fail
}
from
'@sveltejs/kit'
;
import
*
as
`module "$lib/server/db"`
db
from
'$lib/server/db'
;
import
type
{
`
```
type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
```
`
Actions
}
from
'./$types'
;
export
const
`
```
const actions: {
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
}
```
`
actions
=
{
`
```
login: ({ cookies, request }: RequestEvent<Record<string, any>, string | null>) => Promise<ActionFailure<{
    email: string | null;
    missing: boolean;
}> | ActionFailure<{
    email: FormDataEntryValue;
    incorrect: boolean;
}> | {
    success: boolean;
}>
```
`
login
:
async
({
`cookies: Cookies`
Get or set cookies related to the current request
cookies
,
`request: Request`
The original request object.
request
})
=>
{
const
`const data: FormData`
data
=
await
`request: Request`
The original request object.
request
.
`Body.formData(): Promise<FormData>`
MDN Reference
formData
();
const
`const email: FormDataEntryValue | null`
email
=
`const data: FormData`
data
.
`FormData.get(name: string): FormDataEntryValue | null`
The
`get()`
method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
get
(
'email'
);
const
`const password: FormDataEntryValue | null`
password
=
`const data: FormData`
data
.
`FormData.get(name: string): FormDataEntryValue | null`
The
`get()`
method of the FormData interface returns the first value associated with a given key from within a FormData object. If you expect multiple values and want all of them, use the getAll() method instead.
MDN Reference
get
(
'password'
);
if
(
!
`const email: FormDataEntryValue | null`
email
) {
return
`
```
fail<{
```
`
email
:
string
|
null
;
missing
:
boolean
;
}>(status
:
number
,
data
:
{
email
:
string
|
null
;
missing
:
boolean
;
})
:
ActionFailure
<{
email
:
string
|
null
;
missing
:
boolean
;
}> (+
1
overload
)
Create an
`ActionFailure`
object. Call when form submission fails.
@param
status
The
HTTP status code
. Must be in the range 400-599.
@param
data
Data associated with the failure (e.g. validation errors)
reference
fail
(
400
,
{
`email: string | null`
email
,
`missing: boolean`
missing
:
true
});
}
const
`const user: any`
user
=
await
`module "$lib/server/db"`
db
.
getUser
(
`const email: FormDataEntryValue`
email
);
if
(
!
`const user: any`
user
||
`const user: any`
user
.
password
!==
`module "$lib/server/db"`
db
.
hash
(
`const password: FormDataEntryValue | null`
password
)) {
return
`
```
fail<{
```
`
email
:
FormDataEntryValue
;
incorrect
:
boolean
;
}>(status
:
number
,
data
:
{
email
:
FormDataEntryValue
;
incorrect
:
boolean
;
})
:
ActionFailure
<{
email
:
FormDataEntryValue
;
incorrect
:
boolean
;
}> (+
1
overload
)
Create an
`ActionFailure`
object. Call when form submission fails.
@param
status
The
HTTP status code
. Must be in the range 400-599.
@param
data
Data associated with the failure (e.g. validation errors)
reference
fail
(
400
,
{
`email: FormDataEntryValue`
email
,
`incorrect: boolean`
incorrect
:
true
});
}
`cookies: Cookies`
Get or set cookies related to the current request
cookies
.
`
```
Cookies.set: (name: string, value: string, opts: CookieSerializeOptions & {
    path: string;
}) => void
```
`
Sets a cookie. This will add a
`set-cookie`
header to the response, but also make the cookie available via
`cookies.get`
or
`cookies.getAll`
during the current request.
The
`httpOnly`
and
`secure`
options are
`true`
by default (except on
http://localhost
, where
`secure`
is
`false`
), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The
`sameSite`
option defaults to
`lax`
.
You must specify a
`path`
for the cookie. In most cases you should explicitly set
`path: '/'`
to make the cookie available throughout your app. You can use relative paths, or set
`path: ''`
to make the cookie only available on the current path and its children
@param
name
the name of the cookie
@param
value
the cookie value
@param
opts
the options, passed directly to
`cookie.serialize`
. See documentation
here
set
(
'sessionid'
,
await
`module "$lib/server/db"`
db
.
createSession
(
`const user: any`
user
)
,
{
`path: string`
Specifies the value for the 
{@link
https://tools.ietf.org/html/rfc6265#section-5.2.4
`Path`
`Set-Cookie`
attribute
}
.
By default, the path is considered the “default path”.
path
:
'/'
});
return
{
`success: boolean`
success
:
true
};
}
,
`register: (event: RequestEvent<Record<string, any>, string | null>) => Promise<void>`
register
:
async
(
`event: RequestEvent<Record<string, any>, string | null>`
event
)
=>
{
// TODO register the user
}
}
satisfies
`
```
type Actions = {
    [x: string]: Action<Record<string, any>, void | Record<string, any>, string | null>;
}
```
`
Actions
;