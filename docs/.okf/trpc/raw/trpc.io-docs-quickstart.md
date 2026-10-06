tRPC
Quickstart
Version: 11.x
On this page
# Quickstart
## Installation ​
tRPC is split between several packages, so you can install only what you need. Make sure to install the packages you want in the proper sections of your codebase. For this quickstart guide we'll keep it simple and use the vanilla client only. For framework guides, check out
usage with React
and
usage with Next.js
.
Requirements
tRPC requires TypeScript >=5.7.2
We strongly recommend using
`"strict": true`
in your
`tsconfig.json`
as we don't officially support non-strict mode.
Start off by installing the
`@trpc/server`
and
`@trpc/client`
packages:
npm
yarn
pnpm
bun
deno
```bash
npm install @trpc/server @trpc/client
```
```bash
yarn add @trpc/server @trpc/client
```
```bash
pnpm add @trpc/server @trpc/client
```
```bash
bun add @trpc/server @trpc/client
```
```bash
deno add npm:@trpc/server npm:@trpc/client
```
AI Agents
If you use an AI coding agent, install tRPC skills for better code generation:
```
npx @tanstack/intent@latest install
```
```
npx @tanstack/intent@latest install
```
## Your first tRPC API ​
Let's walk through the steps of building a typesafe API with tRPC. To start, this API will contain three endpoints with these TypeScript signatures:
```
type User = { id: string; name: string; };
userList: () => User[];
userById: (id: string) => User;
userCreate: (data: { name: string }) => User;
```
```
type User = { id: string; name: string; };
userList: () => User[];
userById: (id: string) => User;
userCreate: (data: { name: string }) => User;
```
Here's the file structure we'll be building. We recommend separating tRPC initialization, router definition, and server setup into distinct files to prevent cyclic dependencies:
```
.
├── server/
│   ├── trpc.ts        # tRPC instantiation & setup
│   ├── appRouter.ts   # Your API logic and type export
│   └── index.ts       # HTTP server
└── client/
    └── index.ts       # tRPC client
```
```
.
├── server/
│   ├── trpc.ts        # tRPC instantiation & setup
│   ├── appRouter.ts   # Your API logic and type export
│   └── index.ts       # HTTP server
└── client/
    └── index.ts       # tRPC client
```
### 1. Create a router instance ​
First, let's initialize the tRPC backend. It's good convention to do this in a separate file and export reusable helper functions instead of the entire tRPC object.
```
import { initTRPC } from '@trpc/server';
 
/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.create();
 
/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;
```
```
import { initTRPC } from '@trpc/server';
 
/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.create();
 
/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;
```
Next, we'll initialize our main router instance, commonly referred to as
`appRouter`
, to which we'll later add procedures. Lastly, we need to export the type of the router which we'll later use on the client side.
```
import { router } from './trpc';
 
export const appRouter = router({
  // ...
});
 
export type AppRouter = typeof appRouter;
```
```
import { router } from './trpc';
 
export const appRouter = router({
  // ...
});
 
export type AppRouter = typeof appRouter;
```
### 2. Add a query procedure ​
Use
`publicProcedure.query()`
to add a query procedure to the router.
The following creates a query procedure called
`userList`
that returns a list of users:
```
import { publicProcedure, router } from './trpc';
 
export const appRouter = router({
  userList: publicProcedure
    .query(async () => {
      const users: User[] = [{ id: '1', name: 'Katt' }];
 
      return users;
    }),
});
 
export type AppRouter = typeof appRouter;
```
```
import { publicProcedure, router } from './trpc';
 
export const appRouter = router({
  userList: publicProcedure
    .query(async () => {
      const users: User[] = [{ id: '1', name: 'Katt' }];
 
      return users;
    }),
});
 
export type AppRouter = typeof appRouter;
```
### 3. Using input parser to validate procedure inputs ​
To implement the
`userById`
procedure, we need to accept input from the client. tRPC lets you define
input parsers
to validate and parse the input. You can define your own input parser or use a validation library of your choice, like
zod
,
yup
, or
superstruct
.
You define your input parser on
`publicProcedure.input()`
, which can then be accessed on the resolver function as shown below:
Vanilla
Zod
Yup
Valibot
The input parser should be a function that validates and casts the input of this procedure. It should return a strongly typed value when the input is valid or throw an error if the input is invalid.
info
Throughout the remainder of this documentation, we will use
`zod`
as our validation library.
```
import { publicProcedure, router } from './trpc';
 
export const appRouter = router({
  // ...
  userById: publicProcedure
    // The input is unknown at this time. A client could have sent
    // us anything so we won't assume a certain data type.
    .input((val: unknown) => {
      // If the value is of type string, return it.
      // It will now be inferred as a string.
      if (typeof val === 'string') return val;
 
      // Uh oh, looks like that input wasn't a string.
      // We will throw an error instead of running the procedure.
      throw new Error(`Invalid input: ${typeof val}`);
    })
    .query(async (opts) => {
      const { input } = opts;               const input: string
      const user: User = { id: input, name: 'Katt' };
 
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
```
import { publicProcedure, router } from './trpc';
 
export const appRouter = router({
  // ...
  userById: publicProcedure
    // The input is unknown at this time. A client could have sent
    // us anything so we won't assume a certain data type.
    .input((val: unknown) => {
      // If the value is of type string, return it.
      // It will now be inferred as a string.
      if (typeof val === 'string') return val;
 
      // Uh oh, looks like that input wasn't a string.
      // We will throw an error instead of running the procedure.
      throw new Error(`Invalid input: ${typeof val}`);
    })
    .query(async (opts) => {
      const { input } = opts;               const input: string
      const user: User = { id: input, name: 'Katt' };
 
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
The input parser can be any
`ZodType`
, e.g.
`z.string()`
or
`z.object()`
.
```
import { publicProcedure, router } from './trpc';
import { z } from 'zod';
 
export const appRouter = router({
  // ...
  userById: publicProcedure
    .input(z.string())
    .query(async (opts) => {
      const { input } = opts;               const input: string
      const user: User = { id: input, name: 'Katt' };
 
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
```
import { publicProcedure, router } from './trpc';
import { z } from 'zod';
 
export const appRouter = router({
  // ...
  userById: publicProcedure
    .input(z.string())
    .query(async (opts) => {
      const { input } = opts;               const input: string
      const user: User = { id: input, name: 'Katt' };
 
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
The input parser can be any
`YupSchema`
, e.g.
`yup.string()`
or
`yup.object()`
.
info
Throughout the remainder of this documentation, we will use
`zod`
as our validation library.
```
import { publicProcedure, router } from './trpc';
import * as yup from 'yup';
 
export const appRouter = router({
  // ...
  userById: publicProcedure
    .input(yup.string().required())
    .query(async (opts) => {
      const { input } = opts;               const input: string
      const user: User = { id: input, name: 'Katt' };
 
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
```
import { publicProcedure, router } from './trpc';
import * as yup from 'yup';
 
export const appRouter = router({
  // ...
  userById: publicProcedure
    .input(yup.string().required())
    .query(async (opts) => {
      const { input } = opts;               const input: string
      const user: User = { id: input, name: 'Katt' };
 
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
The input parser can be any Valibot schema, e.g.
`v.string()`
or
`v.object()`
.
info
Throughout the remainder of this documentation, we will use
`zod`
as our validation library.
```
import { publicProcedure, router } from './trpc';
import * as v from 'valibot';
 
export const appRouter = router({
  // ...
  userById: publicProcedure
    .input(v.string())
    .query(async (opts) => {
      const { input } = opts;               const input: string
      const user: User = { id: input, name: 'Katt' };
 
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
```
import { publicProcedure, router } from './trpc';
import * as v from 'valibot';
 
export const appRouter = router({
  // ...
  userById: publicProcedure
    .input(v.string())
    .query(async (opts) => {
      const { input } = opts;               const input: string
      const user: User = { id: input, name: 'Katt' };
 
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
### 4. Adding a mutation procedure ​
Similar to GraphQL, tRPC makes a distinction between Query and Mutation procedures.
The distinction between a Query and a Mutation is primarily semantic. Queries use HTTP GET and are intended for read operations, while Mutations use HTTP POST and are intended for operations that cause side effects.
Let's add a
`userCreate`
mutation by adding it as a new property on our router object:
```
import { publicProcedure, router } from './trpc';
 
export const appRouter = router({
  // ...
  userCreate: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async (opts) => {
      const { input } = opts;               const input: {
    name: string;
}
      // Create the user in your DB
      const user: User = { id: '1', ...input };
 
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
```
import { publicProcedure, router } from './trpc';
 
export const appRouter = router({
  // ...
  userCreate: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async (opts) => {
      const { input } = opts;               const input: {
    name: string;
}
      // Create the user in your DB
      const user: User = { id: '1', ...input };
 
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
## Serving the API ​
Now that we have defined our router, we can serve it. tRPC has first-class
adapters
for many popular web servers. To keep it simple, we'll use the
`standalone`
Node.js adapter here.
```
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';
 
const server = createHTTPServer({
  router: appRouter,
});
 
server.listen(3000);
```
```
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';
 
const server = createHTTPServer({
  router: appRouter,
});
 
server.listen(3000);
```
See the full backend code
```
import { initTRPC } from '@trpc/server';
 
const t = initTRPC.create();
 
export const router = t.router;
export const publicProcedure = t.procedure;
```
```
import { initTRPC } from '@trpc/server';
 
const t = initTRPC.create();
 
export const router = t.router;
export const publicProcedure = t.procedure;
```
```
import { z } from "zod";
import { publicProcedure, router } from "./trpc";
 
type User = { id: string; name: string };
 
export const appRouter = router({
  userList: publicProcedure
    .query(async () => {
      const users: User[] = [{ id: '1', name: 'Katt' }];
      return users;
    }),
  userById: publicProcedure
    .input(z.string())
    .query(async (opts) => {
      const { input } = opts;
      const user: User = { id: input, name: 'Katt' };
      return user;
    }),
  userCreate: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async (opts) => {
      const { input } = opts;
      const user: User = { id: '1', ...input };
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
```
import { z } from "zod";
import { publicProcedure, router } from "./trpc";
 
type User = { id: string; name: string };
 
export const appRouter = router({
  userList: publicProcedure
    .query(async () => {
      const users: User[] = [{ id: '1', name: 'Katt' }];
      return users;
    }),
  userById: publicProcedure
    .input(z.string())
    .query(async (opts) => {
      const { input } = opts;
      const user: User = { id: input, name: 'Katt' };
      return user;
    }),
  userCreate: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async (opts) => {
      const { input } = opts;
      const user: User = { id: '1', ...input };
      return user;
    }),
});
 
export type AppRouter = typeof appRouter;
```
```
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./appRouter";
 
const server = createHTTPServer({
  router: appRouter,
});
 
server.listen(3000);
```
```
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./appRouter";
 
const server = createHTTPServer({
  router: appRouter,
});
 
server.listen(3000);
```
## Using your new backend on the client ​
Let's now move to the client-side code and embrace the power of end-to-end typesafety. When we import the
`AppRouter`
type for the client to use, we have achieved full typesafety for our system without leaking any implementation details to the client.
### 1. Setup the tRPC Client ​
```
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './appRouter';
//     👆 **type-only** imports are stripped at build time
 
// Pass AppRouter as a type parameter. 👇 This lets `trpc` know
// what procedures are available on the server and their input/output types.
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```
```
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './appRouter';
//     👆 **type-only** imports are stripped at build time
 
// Pass AppRouter as a type parameter. 👇 This lets `trpc` know
// what procedures are available on the server and their input/output types.
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```
Links in tRPC are similar to links in GraphQL, they let us control the data flow to the server. In the example above, we use the
httpBatchLink
, which automatically batches up multiple calls into a single HTTP request. For more in-depth usage of links, see the
links documentation
.
### 2. Type Inference & Autocomplete ​
You now have access to your API procedures on the
`trpc`
object. Try it out!
```
// Inferred types
const user = await trpc.userById.query('1');       const user: User
 
const createdUser = await trpc.userCreate.mutate({ name: 'Katt' });          const createdUser: User
```
```
// Inferred types
const user = await trpc.userById.query('1');       const user: User
 
const createdUser = await trpc.userCreate.mutate({ name: 'Katt' });          const createdUser: User
```
You can also use your autocomplete to explore the API on your client
```
trpc.u;      userByIduserCreateuserList
 
 
```
```
trpc.u;      userByIduserCreateuserList
 
 
```
## Next steps ​
What's next? Description Example Apps Explore tRPC in your chosen framework TanStack React Query Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Description Example Apps Explore tRPC in your chosen framework TanStack React Query Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Example Apps Explore tRPC in your chosen framework TanStack React Query Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Explore tRPC in your chosen framework TanStack React Query Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | TanStack React Query Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Transformers Use superjson to retain complex types like Date | Use superjson to retain complex types like Date
Example Apps Explore tRPC in your chosen framework TanStack React Query Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Explore tRPC in your chosen framework TanStack React Query Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | TanStack React Query Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Transformers Use superjson to retain complex types like Date | Use superjson to retain complex types like Date
TanStack React Query Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Recommended React integration via @trpc/tanstack-react-query Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Transformers Use superjson to retain complex types like Date | Use superjson to retain complex types like Date
Next.js Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Usage with Next.js Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Transformers Use superjson to retain complex types like Date | Use superjson to retain complex types like Date
Server Adapters Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Express, Fastify, and more Transformers Use superjson to retain complex types like Date | Transformers Use superjson to retain complex types like Date | Use superjson to retain complex types like Date
Transformers Use superjson to retain complex types like Date | Use superjson to retain complex types like Date
Edit this page
Previous
Introduction
Next
Agent Skills
Installation
Your first tRPC API
1. Create a router instance
2. Add a query procedure
3. Using input parser to validate procedure inputs
4. Adding a mutation procedure
Serving the API
Using your new backend on the client
1. Setup the tRPC Client
2. Type Inference & Autocomplete
Next steps