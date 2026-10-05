[Skip to main content](https://trpc.io/docs/client/tanstack-react-query/setup#__docusaurus_skipToContent_fallback)

Version: 11.x

On this page

Compared to our [classic React Query Integration](https://trpc.io/docs/client/react) this client is simpler and more TanStack Query-native, providing factories for common TanStack React Query interfaces like QueryKeys, QueryOptions, and MutationOptions. We think it's the future and recommend using this over the classic client, [read the announcement post](https://trpc.io/blog/introducing-tanstack-react-query-client) for more information about this change.

tip

You can try this integration out on the homepage of tRPC.io: [https://trpc.io/?try=minimal-react#try-it-out](https://trpc.io/?try=minimal-react#try-it-out)

❓ Do I have to use an integration?

No! The integration is fully optional. You can use `@tanstack/react-query` using just a [vanilla tRPC client](https://trpc.io/docs/client/vanilla), although then you'll have to manually manage query keys and do not get the same level of DX as when using the integration package.

```
utils/trpc.ts
ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/router';

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'YOUR_API_URL' })],
});

Copy
```

```
utils/trpc.ts
ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/router';

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'YOUR_API_URL' })],
});

Copy
```

```
components/PostList.tsx
tsx
import { useQuery } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

function PostList() {
  const { data } = useQuery({
    queryKey: ['posts'] as const,
    queryFn: () => trpc.post.list.query(),
  });
  data; // Post[]

  // ...
}

Copy
```

```
components/PostList.tsx
tsx
import { useQuery } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

function PostList() {
  const { data } = useQuery({
    queryKey: ['posts'] as const,
    queryFn: () => trpc.post.list.query(),
  });
  data; // Post[]

  // ...
}

Copy
```

## Setup [​](https://trpc.io/docs/client/tanstack-react-query/setup\#setup "Direct link to Setup")

### 1\. Install dependencies [​](https://trpc.io/docs/client/tanstack-react-query/setup\#1-install-dependencies "Direct link to 1. Install dependencies")

The following dependencies should be installed

- npm
- yarn
- pnpm
- bun
- deno

```
npm install @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-queryCopy
```

```
yarn add @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-queryCopy
```

```
pnpm add @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-queryCopy
```

```
bun add @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-queryCopy
```

```
deno add npm:@trpc/server npm:@trpc/client npm:@trpc/tanstack-react-query npm:@tanstack/react-queryCopy
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

### 2\. Import your `AppRouter` [​](https://trpc.io/docs/client/tanstack-react-query/setup\#2-import-your-approuter "Direct link to 2-import-your-approuter")

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

### 3a. Set up the tRPC context provider [​](https://trpc.io/docs/client/tanstack-react-query/setup\#3a-set-up-the-trpc-context-provider "Direct link to 3a. Set up the tRPC context provider")

In cases where you rely on React context, such as when using server-side rendering in full-stack frameworks like Next.js, it's important to create a new QueryClient for each request so that your users don't end up sharing the same cache, you can use the `createTRPCContext` to create a set of type-safe context providers and consumers from your `AppRouter` type signature.

```
utils/trpc.ts
tsx
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

Copy
```

```
utils/trpc.ts
tsx
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

Copy
```

Then, create a tRPC client, and wrap your application in the `TRPCProvider`, as below. You will also need to set up and connect React Query, which [they document in more depth](https://tanstack.com/query/latest/docs/framework/react/quick-start).

tip

If you already use React Query in your application, you **should** re-use the `QueryClient` and `QueryClientProvider` you already have. You can read more about the QueryClient initialization in the [React Query docs](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr#initial-setup).

```
components/App.tsx
tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import type { AppRouter } from '../server/router';
import { TRPCProvider } from '../utils/trpc';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function App() {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [\
        httpBatchLink({\
          url: 'http://localhost:2022',\
        }),\
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {null /* Your app here */}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

Copy
```

```
components/App.tsx
tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import type { AppRouter } from '../server/router';
import { TRPCProvider } from '../utils/trpc';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function App() {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [\
        httpBatchLink({\
          url: 'http://localhost:2022',\
        }),\
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {null /* Your app here */}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

Copy
```

### 3b. Set up with Query/Mutation Key Prefixing enabled [​](https://trpc.io/docs/client/tanstack-react-query/setup\#3b-set-up-with-querymutation-key-prefixing-enabled "Direct link to 3b. Set up with Query/Mutation Key Prefixing enabled")

If you want to prefix all queries and mutations with a specific key, see [Query Key Prefixing](https://trpc.io/docs/client/tanstack-react-query/usage#keyPrefix) for setup and usage examples.

### 3c. Set up without React context [​](https://trpc.io/docs/client/tanstack-react-query/setup\#3c-set-up-without-react-context "Direct link to 3c. Set up without React context")

When building an SPA using only client-side rendering with something like Vite, you can create the `QueryClient` and tRPC client outside of React context as singletons.

```
utils/trpc.ts
ts
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

export const queryClient = new QueryClient();

const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:2022' })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

Copy
```

```
utils/trpc.ts
ts
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

export const queryClient = new QueryClient();

const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:2022' })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

Copy
```

```
components/App.tsx
tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../utils/trpc';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Your app here */}
    </QueryClientProvider>
  );
}

Copy
```

```
components/App.tsx
tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../utils/trpc';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Your app here */}
    </QueryClientProvider>
  );
}

Copy
```

### 4\. Fetch data [​](https://trpc.io/docs/client/tanstack-react-query/setup\#4-fetch-data "Direct link to 4. Fetch data")

You can now use the tRPC React Query integration to call queries and mutations on your API.

```
components/user-list.tsx
tsx
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTRPC } from '../utils/trpc';

export default function UserList() {
  const trpc = useTRPC(); // use `import { trpc } from './utils/trpc'` if you're using the singleton pattern

  const userQuery = useQuery(trpc.getUser.queryOptions({ id: 'id_bilbo' }));
  const userCreator = useMutation(trpc.createUser.mutationOptions());

  return (
    <div>
      <p>{userQuery.data?.name}</p>

      <button onClick={() => userCreator.mutate({ name: 'Frodo' })}>
        Create Frodo
      </button>
    </div>
  );
}

Copy
```

```
components/user-list.tsx
tsx
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTRPC } from '../utils/trpc';

export default function UserList() {
  const trpc = useTRPC(); // use `import { trpc } from './utils/trpc'` if you're using the singleton pattern

  const userQuery = useQuery(trpc.getUser.queryOptions({ id: 'id_bilbo' }));
  const userCreator = useMutation(trpc.createUser.mutationOptions());

  return (
    <div>
      <p>{userQuery.data?.name}</p>

      <button onClick={() => userCreator.mutate({ name: 'Frodo' })}>
        Create Frodo
      </button>
    </div>
  );
}

Copy
```

- [Setup](https://trpc.io/docs/client/tanstack-react-query/setup#setup)
 - [1\. Install dependencies](https://trpc.io/docs/client/tanstack-react-query/setup#1-install-dependencies)
 - [2\. Import your `AppRouter`](https://trpc.io/docs/client/tanstack-react-query/setup#2-import-your-approuter)
 - [3a. Set up the tRPC context provider](https://trpc.io/docs/client/tanstack-react-query/setup#3a-set-up-the-trpc-context-provider)
 - [3b. Set up with Query/Mutation Key Prefixing enabled](https://trpc.io/docs/client/tanstack-react-query/setup#3b-set-up-with-querymutation-key-prefixing-enabled)
 - [3c. Set up without React context](https://trpc.io/docs/client/tanstack-react-query/setup#3c-set-up-without-react-context)
 - [4\. Fetch data](https://trpc.io/docs/client/tanstack-react-query/setup#4-fetch-data)

Twitter Widget Iframe