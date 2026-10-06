[Skip to main content](https://trpc.io/docs/client/vanilla/setup#__docusaurus_skipToContent_fallback)

Version: 11.x

On this page

### 1\. Install the tRPC Client library [​](https://trpc.io/docs/client/vanilla/setup\#1-install-the-trpc-client-library "Direct link to 1. Install the tRPC Client library")

Use your preferred package manager to install the `@trpc/client` library, and also install `@trpc/server` which contains some required types.

- npm
- yarn
- pnpm
- bun
- deno

```
npm install @trpc/server @trpc/clientCopy
```

```
yarn add @trpc/server @trpc/clientCopy
```

```
pnpm add @trpc/server @trpc/clientCopy
```

```
bun add @trpc/server @trpc/clientCopy
```

```
deno add npm:@trpc/server npm:@trpc/clientCopy
```

AI Agents

If you use an AI coding agent, install tRPC skills for better code generation:

```
bash
npx @tanstack/intent@latest install

Copy
```

```
bash
npx @tanstack/intent@latest install

Copy
```

### 2\. Import your App Router [​](https://trpc.io/docs/client/vanilla/setup\#2-import-your-app-router "Direct link to 2. Import your App Router")

Import your `AppRouter` type into the client application. This type holds the shape of your entire API.

```
utils/trpc.ts
ts
import type { AppRouter } from '../server/router';

Copy
```

```
utils/trpc.ts
ts
import type { AppRouter } from '../server/router';

Copy
```

tip

By using `import type` you ensure that the reference will be stripped at compile-time, meaning you don't inadvertently import server-side code into your client. For more information, [see the Typescript docs](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export).

### 3\. Initialize the tRPC client [​](https://trpc.io/docs/client/vanilla/setup\#3-initialize-the-trpc-client "Direct link to 3. Initialize the tRPC client")

Create a tRPC client with the `createTRPCClient` method, and add a `links` array with a [terminating link](https://trpc.io/docs/client/links#the-terminating-link) pointing at your API. To learn more about tRPC links, [click here](https://trpc.io/docs/client/links).

```
client.ts
ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [\
    httpBatchLink({\
      url: 'http://localhost:3000/trpc',\
\
      // You can pass any HTTP headers you wish here\
      async headers() {\
        return {\
          authorization: getAuthCookie(),\
        };\
      },\
    }),\
  ],
});

Copy
```

```
client.ts
ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [\
    httpBatchLink({\
      url: 'http://localhost:3000/trpc',\
\
      // You can pass any HTTP headers you wish here\
      async headers() {\
        return {\
          authorization: getAuthCookie(),\
        };\
      },\
    }),\
  ],
});

Copy
```

### 4\. Use the tRPC Client [​](https://trpc.io/docs/client/vanilla/setup\#4-use-the-trpc-client "Direct link to 4. Use the tRPC Client")

Under the hood this creates a typed [JavaScript Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) which allows you to interact with your tRPC API in a fully type-safe way:

```
client.ts
ts
const bilbo = await client.getUser.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };

const frodo = await client.createUser.mutate({ name: 'Frodo' });
// => { id: 'id_frodo', name: 'Frodo' };

Copy
```

```
client.ts
ts
const bilbo = await client.getUser.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };

const frodo = await client.createUser.mutate({ name: 'Frodo' });
// => { id: 'id_frodo', name: 'Frodo' };

Copy
```

You're all set!

- [1\. Install the tRPC Client library](https://trpc.io/docs/client/vanilla/setup#1-install-the-trpc-client-library)
- [2\. Import your App Router](https://trpc.io/docs/client/vanilla/setup#2-import-your-app-router)
- [3\. Initialize the tRPC client](https://trpc.io/docs/client/vanilla/setup#3-initialize-the-trpc-client)
- [4\. Use the tRPC Client](https://trpc.io/docs/client/vanilla/setup#4-use-the-trpc-client)

Twitter Widget Iframe