Client Usage
Vanilla Client
Setup
Version: 11.x
On this page
# Set up a tRPC Client
### 1. Install the tRPC Client library ​
Use your preferred package manager to install the
`@trpc/client`
library, and also install
`@trpc/server`
which contains some required types.
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
### 2. Import your App Router ​
Import your
`AppRouter`
type into the client application. This type holds the shape of your entire API.
```
import type { AppRouter } from '../server/router';
```
```
import type { AppRouter } from '../server/router';
```
tip
By using
`import type`
you ensure that the reference will be stripped at compile-time, meaning you don't inadvertently import server-side code into your client. For more information,
see the Typescript docs
.
### 3. Initialize the tRPC client ​
Create a tRPC client with the
`createTRPCClient`
method, and add a
`links`
array with a
terminating link
pointing at your API. To learn more about tRPC links,
click here
.
```
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';
 
const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
 
      // You can pass any HTTP headers you wish here
      async headers() {
        return {
          authorization: getAuthCookie(),
        };
      },
    }),
  ],
});
```
```
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';
 
const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
 
      // You can pass any HTTP headers you wish here
      async headers() {
        return {
          authorization: getAuthCookie(),
        };
      },
    }),
  ],
});
```
### 4. Use the tRPC Client ​
Under the hood this creates a typed
JavaScript Proxy
which allows you to interact with your tRPC API in a fully type-safe way:
```
const bilbo = await client.getUser.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };
 
const frodo = await client.createUser.mutate({ name: 'Frodo' });
// => { id: 'id_frodo', name: 'Frodo' };
```
```
const bilbo = await client.getUser.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };
 
const frodo = await client.createUser.mutate({ name: 'Frodo' });
// => { id: 'id_frodo', name: 'Frodo' };
```
You're all set!
Edit this page
Previous
Overview
Next
Inferring Types
1. Install the tRPC Client library
2. Import your App Router
3. Initialize the tRPC client
4. Use the tRPC Client