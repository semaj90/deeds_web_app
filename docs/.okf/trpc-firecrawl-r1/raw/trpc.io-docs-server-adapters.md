[Skip to main content](https://trpc.io/docs/server/adapters#__docusaurus_skipToContent_fallback)

Version: 11.x

tRPC is not a server on its own, and must therefore be served using other hosts, such as a simple [Node.js HTTP Server](https://trpc.io/docs/server/adapters/standalone), [Express](https://trpc.io/docs/server/adapters/express), or even [Next.js](https://trpc.io/docs/server/adapters/nextjs). Most tRPC features are the same no matter which backend you choose. **Adapters** act as the glue between the host system and your tRPC API.

Adapters typically follow some common conventions, allowing you to set up context creation via `createContext`, and globally handle errors via `onError`, but importantly allow you to choose an appropriate host for your application.

We support many modes of hosting an API, which you will find documented here.

- For serverful APIs, you might want our [Standalone](https://trpc.io/docs/server/adapters/standalone) adapter, or use the [Express](https://trpc.io/docs/server/adapters/express) or [Fastify](https://trpc.io/docs/server/adapters/fastify) adapters to hook into your existing APIs
- You might want a serverless solution and choose [AWS Lambda](https://trpc.io/docs/server/adapters/aws-lambda), or [Fetch](https://trpc.io/docs/server/adapters/fetch) for edge runtimes
- You might have a full-stack framework and want a full integration like [Next.js](https://trpc.io/docs/server/adapters/nextjs), or you could use the [Fetch](https://trpc.io/docs/server/adapters/fetch) adapter with Next.js, Astro, Remix, or SolidStart

tip

For local development or serverful infrastructure, the simplest Adapter to use is the [Standalone Adapter](https://trpc.io/docs/server/adapters/standalone), which can be used to run a standard Node.js HTTP Server. We recommend this when you need to get started quickly and have no existing HTTP Server to integrate with. Swapping out later is trivial if your needs change.

Twitter Widget Iframe