drizzle-team
/
drizzle-orm
Public
### Uh oh!
There was an error while loading.
Please reload this page
.
Notifications
You must be signed in to change notification settings
Fork
1.7k
Star
35.9k
Code
Issues
1.4k
Pull requests
677
Discussions
Actions
Projects
Security and quality
1
Insights
Additional navigation options
Code
Issues
Pull requests
Discussions
Actions
Projects
Security and quality
Insights
# drizzle-kit push generates HNSW index DDL without operator class, causing migration failure on pgvector #5792
New issue
Copy link
New issue
Copy link
Open
Open
drizzle-kit push generates HNSW index DDL without operator class, causing migration failure on pgvector
#5792
Copy link
Labels
bug/fixed-in-beta
This bug has been fixed in beta (or will be soon).
This bug has been fixed in beta (or will be soon).
## Description
roweeezy
opened
on May 21, 2026
Issue body actions
## Bug
When
`schema.ts`
declares an HNSW index on a
`vector`
column with
`vector_cosine_ops`
,
`drizzle-kit push`
regenerates the index DDL without the operator class. PostgreSQL rejects the resulting
`CREATE INDEX`
with:
```
ERROR: no default operator class for access method "hnsw"
HINT: You must specify an operator class for the index or define a default operator class for the data type.
```
## Reproduction
`shared/schema.ts`
:
```ts
import { pgTable, text, index } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

export const readings = pgTable("readings", {
  id: text("id").primaryKey(),
  embedding: vector("embedding", { dimensions: 1536 }),
}, (table) => ({
  embeddingIdx: index("idx_readings_embedding")
    .using("hnsw", table.embedding.op("vector_cosine_ops")),
}));
```
Run
`drizzle-kit push`
. The generated DDL omits
`vector_cosine_ops`
:
```sql
-- Generated (broken):
CREATE INDEX "idx_readings_embedding" ON "readings" USING hnsw ("embedding");

-- Required (working):
CREATE INDEX "idx_readings_embedding" ON "readings" USING hnsw ("embedding" vector_cosine_ops);
```
## Environment
drizzle-orm: 0.45.2
drizzle-kit: latest as of 2026-05-21
postgres: 16.x with pgvector 0.7+
Node 20
## Workaround
Remove the HNSW index from
`schema.ts`
and manage it via raw SQL on both dev and prod:
```sql
CREATE INDEX IF NOT EXISTS idx_readings_embedding
ON readings USING hnsw (embedding vector_cosine_ops);
```
This works but defeats the purpose of declaring the index in schema.
## Expected behavior
`drizzle-kit push`
should preserve operator class declarations in index definitions, especially for index methods like HNSW and IVFFlat where operator class is required.
## Related
pgvector requires explicit operator class for HNSW/IVFFlat indexes (no default exists)
This affects anyone using pgvector with Drizzle's
`push`
workflow
Reactions are currently unavailable
## Activity
Sign up for free
to join this conversation on GitHub.
Already have an account?
Sign in to comment
## Metadata
## Metadata
### Assignees
No one assigned
### Labels
bug/fixed-in-beta
This bug has been fixed in beta (or will be soon).
This bug has been fixed in beta (or will be soon).
### Type
No type
### Projects
No projects
### Milestone
No milestone
### Relationships
None yet
### Development
No branches or pull requests
## Issue actions
Open in GitHub Copilot app