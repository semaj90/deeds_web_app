Backend Usage
Adapters
Overview
Version: 11.x
# Overview
tRPC is not a server on its own, and must therefore be served using other hosts, such as a simple
Node.js HTTP Server
,
Express
, or even
Next.js
. Most tRPC features are the same no matter which backend you choose.
Adapters
act as the glue between the host system and your tRPC API.
Adapters typically follow some common conventions, allowing you to set up context creation via
`createContext`
, and globally handle errors via
`onError`
, but importantly allow you to choose an appropriate host for your application.
We support many modes of hosting an API, which you will find documented here.
For serverful APIs, you might want our
Standalone
adapter, or use the
Express
or
Fastify
adapters to hook into your existing APIs
You might want a serverless solution and choose
AWS Lambda
, or
Fetch
for edge runtimes
You might have a full-stack framework and want a full integration like
Next.js
, or you could use the
Fetch
adapter with Next.js, Astro, Remix, or SolidStart
tip
For local development or serverful infrastructure, the simplest Adapter to use is the
Standalone Adapter
, which can be used to run a standard Node.js HTTP Server. We recommend this when you need to get started quickly and have no existing HTTP Server to integrate with. Swapping out later is trivial if your needs change.
Edit this page
Previous
Merging Routers
Next
Standalone