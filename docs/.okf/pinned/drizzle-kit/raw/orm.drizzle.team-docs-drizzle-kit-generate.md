# drizzle-kit generate
This guide assumes familiarity with:
Get started with Drizzle and
`drizzle-kit`
-
read here
Drizzle schema fundamentals -
read here
Database connection basics -
read here
Drizzle migrations fundamentals -
read here
Drizzle Kit
overview
and
config file
`drizzle-kit generate`
lets you generate SQL migrations based on your Drizzle schema upon declaration or on subsequent schema changes.
How it works under the hood?
Drizzle Kit
`generate`
command triggers a sequence of events:
It will read through your Drizzle schema file(s) and compose a json snapshot of your schema
It will read through your previous migrations folders and compare current json snapshot to the most recent one
Based on json differences it will generate SQL migrations
Save
`migration.sql`
and
`snapshot.json`
in migration folder under current timestamp
src/schema.ts
```plaintext
import * as p from "drizzle-orm/pg-core";

export const users = p.pgTable("users", {
  id: p.serial().primaryKey(),
  name: p.text(),
  email: p.text().unique(), 
});
```
```plaintext
┌────────────────────────┐                  
│ $ drizzle-kit generate │                  
└─┬──────────────────────┘                  
  │                                           
  └ 1. read previous migration folders
    2. find diff between current and previous schema
    3. prompt developer for renames if necessary
  ┌ 4. generate SQL migration and persist to file
  │    ┌─┴───────────────────────────────────────┐  
  │      📂 drizzle       
  │      └ 📂 20242409125510_premium_mister_fear
  │        ├ 📜 migration.sql
  │        └ 📜 snapshot.json
  v
```
```plaintext
-- drizzle/20242409125510_premium_mister_fear/migration.sql

CREATE TABLE "users" (
 "id" SERIAL PRIMARY KEY,
 "name" TEXT,
 "email" TEXT UNIQUE
);
```
It’s designed to cover
code first
approach of managing Drizzle migrations.
You can apply generated migrations using
`drizzle-kit migrate`
, using drizzle-orm’s
`migrate()`
,
using external migration tools like
bytebase
or running migrations yourself directly on the database.
`drizzle-kit generate`
command requires you to provide both
`dialect`
and
`schema`
path options,
you can set them either via
drizzle.config.ts
config file or via CLI options
With config file
As CLI options
```plaintext
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
});
```
```plaintext
npx drizzle-kit generate
```
```plaintext
npx drizzle-kit generate --dialect=postgresql --schema=./src/schema.ts
```
### Schema files path
You can have a single
`schema.ts`
file or as many schema files as you want spread out across the project.
Drizzle Kit requires you to specify path(s) to them as a
glob
via
`schema`
configuration option.
Example 1
Example 2
Example 3
Example 4
```plaintext
📦 <project root>
 ├ ...
 ├ 📂 drizzle
 ├ 📂 src
 │ ├ ...
 │ ├ 📜 index.ts
 │ └ 📜 schema.ts 
 ├ 📜 drizzle.config.ts
 └ 📜 package.json
```
```plaintext
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
});
```
```plaintext
📦 <project root>
 ├ ...
 ├ 📂 drizzle
 ├ 📂 src
 │ ├ 📂 user
 │ │ ├ 📜 handler.ts 
 │ │ └ 📜 schema.ts 
 │ ├ 📂 posts
 │ │ ├ 📜 handler.ts 
 │ │ └ 📜 schema.ts 
 │ └ 📜 index.ts
 ├ 📜 drizzle.config.ts
 └ 📜 package.json
```
```plaintext
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/**/schema.ts",
  //or
  schema: ["./src/user/schema.ts", "./src/posts/schema.ts"]
});
```
```plaintext
📦 <project root>
 ├ ...
 ├ 📂 drizzle
 ├ 📂 src
 │ ├ 📂 schema
 │ │ ├ 📜 user.ts 
 │ │ ├ 📜 post.ts 
 │ │ └ 📜 comment.ts 
 │ └ 📜 index.ts
 ├ 📜 drizzle.config.ts
 └ 📜 package.json
```
```plaintext
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/*",
});
```
```plaintext
📦 <project root>
 ├ ...
 ├ 📂 drizzle
 ├ 📂 src
 │ ├ 📜 userById.ts 
 │ ├ 📜 userByEmail.ts 
 │ ├ 📜 listUsers.ts 
 │ ├ 📜 user.sql.ts 
 │ ├ 📜 postById.ts 
 │ ├ 📜 listPosts.ts 
 │ └ 📜 post.sql.ts 
 │ 📜 index.ts
 ├ 📜 drizzle.config.ts
 └ 📜 package.json
```
```plaintext
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/**/*.sql.ts", // Dax's favourite
});
```
### Custom migration file name
You can set custom migration file names by providing
`--name`
CLI option
```plaintext
npx drizzle-kit generate --name=init
```
```plaintext
📦 <project root>
 ├ 📂 drizzle
 │ └ 📂 20242409125510_init
 │   ├ 📜 snapshot.json
 │   └ 📜 migration.sql
 ├ 📂 src
 └ …
```
### Multiple configuration files in one project
You can have multiple config files in the project, it’s very useful when you have multiple database stages or multiple databases or different databases on the same project:
npm
yarn
pnpm
bun
```shell
npx drizzle-kit generate --config=drizzle-dev.config.ts
npx drizzle-kit generate --config=drizzle-prod.config.ts
```
```shell
yarn drizzle-kit generate --config=drizzle-dev.config.ts
yarn drizzle-kit generate --config=drizzle-prod.config.ts
```
```shell
pnpm drizzle-kit generate --config=drizzle-dev.config.ts
pnpm drizzle-kit generate --config=drizzle-prod.config.ts
```
```shell
bunx drizzle-kit generate --config=drizzle-dev.config.ts
bunx drizzle-kit generate --config=drizzle-prod.config.ts
```
```plaintext
📦 <project root>
 ├ 📂 drizzle
 ├ 📂 src
 ├ 📜 .env
 ├ 📜 drizzle-dev.config.ts
 ├ 📜 drizzle-prod.config.ts
 ├ 📜 package.json
 └ 📜 tsconfig.json
```
### Custom migrations
You can generate empty migration files to write your own custom SQL migrations
for DDL alternations currently not supported by Drizzle Kit or data seeding. Extended docs on custom migrations -
see here
```plaintext
drizzle-kit generate --custom --name=seed-users
```
```plaintext
📦 <project root>
 ├ 📂 drizzle
 │ ├ 📂 20242409125510_init
 │ └ 📂 20242409125510_seed-users
 ├ 📂 src
 └ …
```
```plaintext
-- ./drizzle/20242409125510_seed/migration.sql

INSERT INTO "users" ("name") VALUES('Dan');
INSERT INTO "users" ("name") VALUES('Andrew');
INSERT INTO "users" ("name") VALUES('Dandrew');
```
### Ignore conflicts
In case you need
`generate`
command to skip commutativity checks and bypass it, you can use
`--ignore-conflicts`
. If there is a situation you want to use it, then
there is a big chance that
`drizzle-kit`
didn’t check migrations right and it’s a bug. Please report us your case, so we can fix it
```plaintext
drizzle-kit generate --ignore-conflicts
```
### Extended list of available configurations
`drizzle-kit generate`
has a list of cli-only options
| 
custom | generate empty SQL for custom migration
name | generate migration with custom name
ignore-conflicts | skip commutativity conflict checks, default is false
npm
yarn
pnpm
bun
```shell
npx drizzle-kit generate --name=init
npx drizzle-kit generate --name=seed_users --custom
npx drizzle-kit generate --ignore-conflicts
```
```shell
yarn drizzle-kit generate --name=init
yarn drizzle-kit generate --name=seed_users --custom
yarn drizzle-kit generate --ignore-conflicts
```
```shell
pnpm drizzle-kit generate --name=init
pnpm drizzle-kit generate --name=seed_users --custom
pnpm drizzle-kit generate --ignore-conflicts
```
```shell
bunx drizzle-kit generate --name=init
bunx drizzle-kit generate --name=seed_users --custom
bunx drizzle-kit generate --ignore-conflicts
```
We recommend configuring
`drizzle-kit`
through
drizzle.config.ts
file,
yet you can provide all configuration options through CLI if necessary, e.g. in CI/CD pipelines, etc.
| | 
dialect | required | Database dialect, one of postgresql mysql sqlite turso singlestore mssql cockroach
schema | required | Path to typescript schema file(s) or folder(s) with multiple schema files
driver | | Driver one of aws-data-api , pglite
out | | Migrations output folder, default is ./drizzle
config | | Configuration file path, default is drizzle.config.ts
breakpoints | | SQL statements breakpoints, default is true
### Extended example
Example of how to create a custom postgresql migration file named
`0001_seed-users.sql`
with Drizzle schema located in
`./src/schema.ts`
and migrations folder named
`./migrations`
instead of default
`./drizzle`
.
We will also place drizzle config file in the
`configs`
folder.
Let’s create config file:
```plaintext
📦 <project root>
 ├ 📂 migrations
 ├ 📂 configs
 │ └ 📜 drizzle.config.ts
 ├ 📂 src
 └ …
```
drizzle.config.ts
```plaintext
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
});
```
Now let’s run
```plaintext
npx drizzle-kit generate --config=./configs/drizzle.config.ts --name=seed-users --custom
```
And it will successfully generate
```plaintext
📦 <project root>
 ├ …
 ├ 📂 migrations
 │ ├ 📂 20242409125510_init
 │ └ 📂 20242409125510_seed-users
 └ …
```
```plaintext
-- ./drizzle/20242409125510_seed-users/migration.sql

INSERT INTO "users" ("name") VALUES('Dan');
INSERT INTO "users" ("name") VALUES('Andrew');
INSERT INTO "users" ("name") VALUES('Dandrew');
```