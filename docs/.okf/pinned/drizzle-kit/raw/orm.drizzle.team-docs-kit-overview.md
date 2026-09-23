# Migrations with Drizzle Kit
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
is a CLI tool for managing SQL database migrations with Drizzle.
npm
yarn
pnpm
bun
```shell
npm i -D drizzle-kit
```
```shell
yarn add -D drizzle-kit
```
```shell
pnpm add -D drizzle-kit
```
```shell
bun add -D drizzle-kit
```
IMPORTANT
Make sure to first go through Drizzle
get started
and
migration fundamentals
and pick SQL migration flow that suits your business needs best.
Based on your schema, Drizzle Kit let’s you generate and run SQL migration files,
push schema directly to the database, pull schema from database, spin up drizzle studio and has a couple of utility commands.
npm
yarn
pnpm
bun
```shell
npx drizzle-kit generate
npx drizzle-kit migrate
npx drizzle-kit push
npx drizzle-kit pull
npx drizzle-kit check
npx drizzle-kit up
npx drizzle-kit studio
npx drizzle-kit export
```
```shell
yarn drizzle-kit generate
yarn drizzle-kit migrate
yarn drizzle-kit push
yarn drizzle-kit pull
yarn drizzle-kit check
yarn drizzle-kit up
yarn drizzle-kit studio
yarn drizzle-kit export
```
```shell
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
pnpm drizzle-kit push
pnpm drizzle-kit pull
pnpm drizzle-kit check
pnpm drizzle-kit up
pnpm drizzle-kit studio
pnpm drizzle-kit export
```
```shell
bunx drizzle-kit generate
bunx drizzle-kit migrate
bunx drizzle-kit push
bunx drizzle-kit pull
bunx drizzle-kit check
bunx drizzle-kit up
bunx drizzle-kit studio
bunx drizzle-kit export
```
| 
drizzle-kit generate | lets you generate SQL migration files based on your Drizzle schema either upon declaration or on subsequent changes, see here .
drizzle-kit migrate | lets you apply generated SQL migration files to your database, see here .
drizzle-kit pull | lets you pull(introspect) database schema, convert it to Drizzle schema and save it to your codebase, see here
drizzle-kit push | lets you push your Drizzle schema to database either upon declaration or on subsequent schema changes, see here
drizzle-kit studio | will connect to your database and spin up proxy server for Drizzle Studio which you can use for convenient database browsing, see here
drizzle-kit check | will walk through all generate migrations and check for any race conditions(collisions) of generated migrations, see here
drizzle-kit up | used to upgrade snapshots of previously generated migrations, see here
drizzle-kit export | used to convert a TypeScript schema into raw SQL DDL and print it out see here
Drizzle Kit is configured through
drizzle.config.ts
configuration file or via CLI params.
It’s required to at least provide SQL
`dialect`
and
`schema`
path for Drizzle Kit to know how to generate migrations.
```plaintext
📦 <project root>
 ├ 📂 drizzle
 ├ 📂 src
 ├ 📜 .env
 ├ 📜 drizzle.config.ts  <--- Drizzle config file
 ├ 📜 package.json
 └ 📜 tsconfig.json
```
simple config
extended config
```plaintext
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
});
```
```plaintext
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  dialect: "postgresql",
  schema: "./schema.ts",

  entities: {
    roles: {
      exclude: ["admin"],
      include: ["user"],
      provider: "supabase",
    },
  },

  driver: "pglite",
  dbCredentials: {
    url: "./database/",
  },

  extensionsFilters: ["postgis"],
  schemaFilter: "public",
  tablesFilter: "*",

  introspect: {
    casing: "camel",
  },

  migrations: {
    table: "__drizzle_migrations__",
    schema: "public",
  },

  breakpoints: true,
  verbose: true,
});
```
You can provide Drizzle Kit config path via CLI param, it’s very useful when you have multiple database stages or multiple databases or different databases on the same project:
npm
yarn
pnpm
bun
```shell
npx drizzle-kit push --config=drizzle-dev.drizzle.config
npx drizzle-kit push --config=drizzle-prod.drizzle.config
```
```shell
yarn drizzle-kit push --config=drizzle-dev.drizzle.config
yarn drizzle-kit push --config=drizzle-prod.drizzle.config
```
```shell
pnpm drizzle-kit push --config=drizzle-dev.drizzle.config
pnpm drizzle-kit push --config=drizzle-prod.drizzle.config
```
```shell
bunx drizzle-kit push --config=drizzle-dev.drizzle.config
bunx drizzle-kit push --config=drizzle-prod.drizzle.config
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