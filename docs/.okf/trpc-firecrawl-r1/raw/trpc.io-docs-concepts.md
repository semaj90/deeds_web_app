[Skip to main content](https://trpc.io/docs/concepts#__docusaurus_skipToContent_fallback)

Version: 11.x

On this page

## What is RPC? What mindset should I adopt? [​](https://trpc.io/docs/concepts\#what-is-rpc-what-mindset-should-i-adopt "Direct link to What is RPC? What mindset should I adopt?")

### It's just functions [​](https://trpc.io/docs/concepts\#its-just-functions "Direct link to It's just functions")

RPC is short for "Remote Procedure Call". It is a way of calling functions on one computer (the server) from another computer (the client). With traditional HTTP/REST APIs, you call a URL and get a response. With RPC, you call a function and get a response.

```
ts
// HTTP/REST
const res = await fetch('/api/users/1');
const user = await res.json();

// RPC
const user = await api.users.getById({ id: 1 });

Copy
```

```
ts
// HTTP/REST
const res = await fetch('/api/users/1');
const user = await res.json();

// RPC
const user = await api.users.getById({ id: 1 });

Copy
```

tRPC (TypeScript Remote Procedure Call) is one implementation of RPC, designed for TypeScript monorepos. It has its own flavor, but is RPC at its heart.

### Don't think about HTTP/REST implementation details [​](https://trpc.io/docs/concepts\#dont-think-about-httprest-implementation-details "Direct link to Don't think about HTTP/REST implementation details")

If you inspect the network traffic of a tRPC app, you'll see that it's fairly standard HTTP requests and responses, but you don't need to think about the implementation details while writing your application code. You call functions, and tRPC takes care of everything else. You should ignore details like HTTP Verbs, since they carry meaning in REST APIs but, in RPC, form part of your function names instead, for instance: `getUser(id)` instead of `GET /users/:id`.

## Vocabulary [​](https://trpc.io/docs/concepts\#vocabulary "Direct link to Vocabulary")

Below are some terms that are used frequently in the tRPC ecosystem. We'll be using these throughout the documentation, so it's good to get familiar with them. Most of these concepts also have their own pages in the documentation.

| Term | Description |
| --- | --- |
| [**Procedure ↗**](https://trpc.io/docs/server/procedures) | API endpoint - can be a **query**, **mutation**, or **subscription**. |
| **Query** | A **procedure** that gets some data. |
| **Mutation** | A **procedure** that creates, updates, or deletes some data. |
| [**Subscription ↗**](https://trpc.io/docs/subscriptions) | A **procedure** that creates a persistent connection and listens to changes. |
| [**Router ↗**](https://trpc.io/docs/server/routers) | A collection of **procedures**(and/or other routers) under a shared namespace. |
| [**Context ↗**](https://trpc.io/docs/server/context) | Stuff that every **procedure** can access. Commonly used for things like session state and database connections. |
| [**Middleware ↗**](https://trpc.io/docs/server/middlewares) | A function that can run code before and after a **procedure**. Can modify **context**. |
| [**Validation ↗**](https://trpc.io/docs/server/procedures#input-validation) | "Does this input data contain the right stuff?" |

- [What is RPC? What mindset should I adopt?](https://trpc.io/docs/concepts#what-is-rpc-what-mindset-should-i-adopt)
 - [It's just functions](https://trpc.io/docs/concepts#its-just-functions)
 - [Don't think about HTTP/REST implementation details](https://trpc.io/docs/concepts#dont-think-about-httprest-implementation-details)
- [Vocabulary](https://trpc.io/docs/concepts#vocabulary)

Twitter Widget Iframe