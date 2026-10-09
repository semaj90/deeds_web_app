[We've merged alternation-engine into Beta release. Try it out!](https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0-beta.2)

[v1.0\\
\\
98%](https://orm.drizzle.team/roadmap)

[Benchmarks](https://orm.drizzle.team/benchmarks) [Extension](https://driz.link/extension) [Studio](https://orm.drizzle.team/drizzle-studio/overview) [Studio Package](https://github.com/drizzle-team/drizzle-studio-npm) [Gateway](https://gateway.drizzle.team/) [Drizzle Run](https://drizzle.run/)

Our goodies!

[Our Primary backer\\
\\
![](<Base64-Image-Removed>)![PlanetScale](<Base64-Image-Removed>)](https://driz.link/planetscale) [Our Cloud Partner\\
\\
![](<Base64-Image-Removed>)![Railway](<Base64-Image-Removed>)](https://driz.link/railway)

[![](<Base64-Image-Removed>)![Replit](<Base64-Image-Removed>)](https://driz.link/replit)[![](<Base64-Image-Removed>)![Sentry](<Base64-Image-Removed>)](https://driz.link/sentry)[![](<Base64-Image-Removed>)![Sevalla](<Base64-Image-Removed>)](https://driz.link/sevalla)[![](<Base64-Image-Removed>)![Clerk](<Base64-Image-Removed>)](https://clerk.com/)[![](<Base64-Image-Removed>)![Warp](<Base64-Image-Removed>)](https://driz.link/warp)[![](<Base64-Image-Removed>)![Appwrite](<Base64-Image-Removed>)](https://driz.link/appwrite)[![](<Base64-Image-Removed>)![Turso](<Base64-Image-Removed>)\\
\\
🚀 Drizzle is giving you 10% off Turso Scaler and Pro for 1 Year 🚀](https://driz.link/turso) [![](<Base64-Image-Removed>)![Payload](<Base64-Image-Removed>)](https://driz.link/payload) [![](<Base64-Image-Removed>)![Xata](<Base64-Image-Removed>)](https://driz.link/xataio) [![](<Base64-Image-Removed>)![Neon](<Base64-Image-Removed>)](https://driz.link/neon) [![](<Base64-Image-Removed>)![Upstash](<Base64-Image-Removed>)](https://driz.link/upstash) [![](<Base64-Image-Removed>)![Lokalise](<Base64-Image-Removed>)](https://driz.link/lokalise) [![](<Base64-Image-Removed>)![Sponsor](<Base64-Image-Removed>)](https://driz.link/sponsor)

Product by Drizzle Team

[One Dollar Stats$1 per mo web analytics\\
\\
christmas\\
\\
deal](https://driz.link/onedollarstats)

# Vector similarity search with pgvector extension

This guide assumes familiarity with:

- Get started with [PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)
- [Select statement](https://orm.drizzle.team/docs/select)
- [Indexes](https://orm.drizzle.team/docs/indexes-constraints#indexes)
- [sql operator](https://orm.drizzle.team/docs/sql)
- [pgvector extension](https://orm.drizzle.team/docs/extensions#pg_vector)
- [Drizzle kit](https://orm.drizzle.team/docs/kit-overview)
- You should have installed the `openai` [package](https://www.npmjs.com/package/openai) for generating embeddings.

npm

yarn

pnpm

bun

```
npm i openai
```

```
yarn add openai
```

```
pnpm add openai
```

```
bun add openai
```

- You should have `drizzle-orm@0.31.0` and `drizzle-kit@0.22.0` or higher.

To implement vector similarity search in PostgreSQL with Drizzle ORM, you can use the `pgvector` extension. This extension provides a set of functions to work with vectors and perform similarity search.

As for now, Drizzle doesn’t create extension automatically, so you need to create it manually. Create an empty migration file and add SQL query:

```
npx drizzle-kit generate --custom
```

```
CREATE EXTENSION vector;
```

To perform similarity search, you need to create a table with a vector column and an `HNSW` or `IVFFlat` index on this column for better performance:

schema.ts

migration.sql

```
import { index, pgTable, serial, text, vector } from 'drizzle-orm/pg-core';

export const guides = pgTable(
  'guides',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    url: text('url').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  (table) => [\
    index('embeddingIndex').using('hnsw', table.embedding.op('vector_cosine_ops')),\
  ]
);
```

```
CREATE TABLE IF NOT EXISTS "guides" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "url" text NOT NULL,
  "embedding" vector(1536)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddingIndex" ON "guides" USING hnsw (embedding vector_cosine_ops);
```

The `embedding` column is used to store vector embeddings of the guide descriptions. Vector embedding is just a representation of some data. It converts different types of data into a common format (vectors) that language models can process. This allows us to perform mathematical operations, such as measuring the distance between two vectors, to determine how similar or different two data items are.

In this example we will use `OpenAI` model to generate [embeddings](https://platform.openai.com/docs/guides/embeddings) for the description:

```
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});

export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll('\n', ' ');

  const { data } = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input,
  });

  return data[0].embedding;
};
```

To search for similar guides by embedding, you can use `gt` and `sql` operators with `cosineDistance` function to calculate the similarity between the `embedding` column and the generated embedding:

```
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import { generateEmbedding } from './embedding';
import { guides } from './schema';

const db = drizzle(...);

const findSimilarGuides = async (description: string) => {
  const embedding = await generateEmbedding(description);

  const similarity = sql<number>`1 - (${cosineDistance(guides.embedding, embedding)})`;

  const similarGuides = await db
    .select({ name: guides.title, url: guides.url, similarity })
    .from(guides)
    .where(gt(similarity, 0.5))
    .orderBy((t) => desc(t.similarity))
    .limit(4);

  return similarGuides;
};
```

```
const description = 'Guides on using Drizzle ORM with different platforms';

const similarGuides = await findSimilarGuides(description);
```

```
[\
  {\
    name: 'Drizzle with Turso',\
    url: '/docs/tutorials/drizzle-with-turso',\
    similarity: 0.8642314333984994\
  },\
  {\
    name: 'Drizzle with Supabase Database',\
    url: '/docs/tutorials/drizzle-with-supabase',\
    similarity: 0.8593631126014918\
  },\
  {\
    name: 'Drizzle with Neon Postgres',\
    url: '/docs/tutorials/drizzle-with-neon',\
    similarity: 0.8541051184461372\
  },\
  {\
    name: 'Drizzle with Vercel Edge Functions',\
    url: '/docs/tutorials/drizzle-with-vercel-edge-functions',\
    similarity: 0.8481551084241092\
  }\
]
```