Version: 11.x
End-to-end typesafe APIs made easy
## Introduction ​
tRPC
lets you build &
consume fully typesafe APIs without schemas or code generation. It combines
concepts from
REST
and
GraphQL
- if you are unfamiliar with either, take a
look at the key
Concepts
.
In full-stack TypeScript projects, keeping API contracts in sync between the client and server is a common pain point. tRPC does this by leveraging TypeScript's type inference directly, with no code generation step, and catches problems at build time.
tRPC can run standalone or mounted as an endpoint on your existing REST API using our extensive ecosystem of adapters.
## Features ​
✅  Well-tested and production ready.
🧙‍♂️  Full static typesafety & autocompletion on the client, for inputs, outputs, and errors.
🐎  Snappy DX - No code generation, run-time bloat, or build pipeline.
🍃  Light - tRPC has zero runtime dependencies and a tiny client-side footprint.
🐻  For new and old projects - Easy to start with or add to your existing brownfield project.
🔋  Framework agnostic - The tRPC community has built
adapters
for all of the most popular frameworks.
🥃  Subscriptions support - Add typesafe real-time updates to your application.
⚡️  Request batching - Requests made at the same time can be automatically combined into one.
👀  Examples - Check out an
example
to learn with or use as a starting point.
## Quick Look ​
tRPC in 100 Seconds
Matt Pocock: Learn tRPC in 5 minutes
Chris Bautista: Making typesafe APIs easy with tRPC
See more on the
Videos & Community Resources
page.
## Try tRPC ​
Minimal Example
— Node.js http server + client.
Minimal Next.js Example
— single endpoint + page.
Or use an
example app
to get started locally.
## Adopt tRPC ​
### Creating a new project ​
Since tRPC can live inside of many different frameworks, you will first need to decide where you want to use it.
On the backend, there are
adapters
for a range of frameworks as well as vanilla Node.js. On the frontend, you can use our
TanStack React Query
or
Next.js
integrations, a
third-party integration
for a variety of other frameworks, or the
Vanilla Client
, which works anywhere JavaScript runs.
After choosing your stack, you can either scaffold your app using a
template
, or start from scratch using the documentation for your chosen backend and frontend integration.
### Adding tRPC to an existing project ​
Adding tRPC to an existing project is not significantly different from starting a new project, so the same resources apply. The main challenge is that it can feel difficult to know how to integrate tRPC with your existing application. Here are some tips:
You don't need to port all of your existing backend logic to tRPC. A common migration strategy is to initially only use tRPC for new endpoints, and only later migrate existing endpoints to tRPC.
If you're not sure where to start, check the documentation for your backend
adapter
and frontend implementation, as well as the
example apps
.
If you are looking for some inspiration of how tRPC might look as part of a larger codebase, there are some examples in
Open-source projects using tRPC
.
## Community ​
Join us on
Discord
to ask questions and share your experiences!