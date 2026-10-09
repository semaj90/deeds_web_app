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

# Indexes & Constraints

## Constraints

SQL constraints are the rules enforced on table columns. They are used to prevent invalid data from being entered into the database.

This ensures the accuracy and reliability of your data in the database.

### Default

The `DEFAULT` clause specifies a default value to use for the column if no value provided by the user when doing an `INSERT`.
If there is no explicit `DEFAULT` clause attached to a column definition,
then the default value of the column is `NULL`.

An explicit `DEFAULT` clause may specify that the default value is `NULL`,
a string constant, a blob constant, a signed-number, or any constant expression enclosed in parentheses.

```
import { sql } from "drizzle-orm";
import { integer, uuid, pgTable } from "drizzle-orm/pg-core";

export const table = pgTable('table', {
  integer1: integer().default(42),
  integer2: integer().default(sql`24`),
  uuid1: uuid().defaultRandom(),
  uuid2: uuid().default(sql`gen_random_uuid()`),
});
```

```
CREATE TABLE "table" (
  "integer1" integer DEFAULT 42,
  "integer2" integer DEFAULT 24,
  "uuid1" uuid DEFAULT gen_random_uuid(),
  "uuid2" uuid DEFAULT gen_random_uuid()
);
```

### Not null

By default, a column can hold **NULL** values. The `NOT NULL` constraint enforces a column to **NOT** accept **NULL** values.

This enforces a field to always contain a value, which means that you cannot insert a new record,
or update a record without adding a value to this field.

```
import { integer, pgTable } from "drizzle-orm/pg-core";

export const table = pgTable('table', {
  integer: integer().notNull(),
});
```

```
CREATE TABLE "table" (
  "integer" integer NOT NULL
);
```

### Unique

The `UNIQUE` constraint ensures that all values in a column are different.

Both the `UNIQUE` and `PRIMARY KEY` constraints provide a guarantee for uniqueness for a column or set of columns.

A `PRIMARY KEY` constraint automatically has a `UNIQUE` constraint.

You can have many `UNIQUE` constraints per table, but only one `PRIMARY KEY` constraint per table.

```
import { integer, text, unique, pgTable } from "drizzle-orm/pg-core";

export const user = pgTable('user', {
  id: integer().unique(),
});

export const table = pgTable('table', {
  id: integer().unique('custom_name'),
});

export const composite = pgTable('composite_example', {
  id: integer(),
  name: text(),
}, (t) => [\
  unique().on(t.id, t.name),\
  unique('custom_name').on(t.id, t.name)\
]);

// In Postgres 15.0+ NULLS NOT DISTINCT is available
// This example demonstrates both available usages
export const userNulls = pgTable("user_nulls_example", {
  id: integer(),
  id2: integer().unique("custom_name", { nulls: "not distinct" }),
}, (t) => [\
  unique().on(t.id).nullsNotDistinct()\
]);
```

```
CREATE TABLE "user" (
  "id" integer UNIQUE
);

CREATE TABLE "table" (
  "id" integer CONSTRAINT "custom_name" UNIQUE
);

CREATE TABLE "composite_example" (
  "id" integer,
  "name" text,
  CONSTRAINT "composite_example_id_name_unique" UNIQUE("id","name"),
  CONSTRAINT "custom_name" UNIQUE("id","name")
);

CREATE TABLE "user_nulls_example" (
  "id" integer UNIQUE NULLS NOT DISTINCT,
  "id2" integer CONSTRAINT "custom_name" UNIQUE NULLS NOT DISTINCT
);
```

### Check

The `CHECK` constraint is used to limit the value range that can be placed in a column.

If you define a `CHECK` constraint on a column it will allow only certain values for this column.

If you define a `CHECK` constraint on a table it can limit the values in certain columns based on values in other columns in the row.

```
import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid().defaultRandom().primaryKey(),
    username: text().notNull(),
    age: integer(),
  },
  (table) => [\
    check("age_check1", sql`${table.age} > 21`),\
  ]
);
```

```
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" text NOT NULL,
  "age" integer,
  CONSTRAINT "age_check1" CHECK ("age" > 21)
);
```

### Primary Key

The `PRIMARY KEY` constraint uniquely identifies each record in a table.

Primary keys must contain `UNIQUE` values, and cannot contain `NULL` values.

A table can have only **ONE** primary key; and in the table, this primary key can consist of single or multiple columns (fields).

```
import { serial, text, pgTable } from "drizzle-orm/pg-core";

export const user = pgTable('user', {
  id: serial('id').primaryKey(),
});

export const table = pgTable('table', {
  id: text('cuid').primaryKey(),
});
```

```
CREATE TABLE "user" (
  "id" serial PRIMARY KEY
);

CREATE TABLE "table" (
  "cuid" text PRIMARY KEY
);
```

### Composite Primary Key

Just like `PRIMARY KEY`, composite primary key uniquely identifies each record in a table using multiple fields.

Drizzle ORM provides a standalone `primaryKey` operator for that:

```
import { serial, text, integer, primaryKey, pgTable } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: serial("id").primaryKey(),
  name: text("name"),
});

export const book = pgTable("book", {
  id: serial("id").primaryKey(),
  name: text("name"),
});

export const booksToAuthors = pgTable("books_to_authors", {
  authorId: integer("author_id"),
  bookId: integer("book_id"),
}, (table) => [\
  primaryKey({ columns: [table.bookId, table.authorId] }),\
  // Or PK with custom name\
  primaryKey({ name: 'custom_name', columns: [table.bookId, table.authorId] }),\
]);
```

```
...

CREATE TABLE "books_to_authors" (
  "author_id" integer,
  "book_id" integer,
  PRIMARY KEY("book_id","author_id")
);

ALTER TABLE "books_to_authors" ADD CONSTRAINT "custom_name" PRIMARY KEY("book_id","author_id");
```

### Foreign key

The `FOREIGN KEY` constraint is used to prevent actions that would destroy links between tables.
A `FOREIGN KEY` is a field (or collection of fields) in one table, that refers to the `PRIMARY KEY` in another table.
The table with the foreign key is called the child table, and the table with the primary key is called the referenced or parent table.

Drizzle ORM provides several ways to declare foreign keys.
You can declare them in a column declaration statement:

```
import { serial, text, integer, pgTable } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: serial("id"),
	name: text("name"),
});

export const book = pgTable("book", {
	id: serial("id"),
	name: text("name"),
	authorId: integer("author_id").references(() => user.id)
});
```

```
CREATE TABLE "user" (
	"id" serial,
	"name" text
);

CREATE TABLE "book" (
	"id" serial,
	"name" text,
	"author_id" integer
);

ALTER TABLE "book" ADD CONSTRAINT "book_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id");
```

If you want to do a self reference, due to a TypeScript limitations you will have to either explicitly
set return type for reference callback or use a standalone `foreignKey` operator.

```
import { serial, text, integer, foreignKey, pgTable, type AnyPgColumn } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: serial("id"),
  name: text("name"),
  parentId: integer("parent_id").references((): AnyPgColumn => user.id)
});

// or
export const user = pgTable("user", {
  id: serial("id"),
  name: text("name"),
  parentId: integer("parent_id"),
}, (table) => [\
  foreignKey({\
    columns: [table.parentId],\
    foreignColumns: [table.id],\
    name: "custom_fk"\
  })\
]);
```

```
CREATE TABLE "user" (
	"id" serial,
	"name" text,
	"parent_id" integer
);

ALTER TABLE "user" ADD CONSTRAINT "user_parent_id_user_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "user"("id");
```

To declare multi-column foreign keys you can use a dedicated `foreignKey` operator:

```
    import { serial, text, foreignKey, pgTable, AnyPgColumn } from "drizzle-orm/pg-core";

    export const user = pgTable("user", {
      firstName: text("firstName"),
      lastName: text("lastName"),
    }, (table) => [\
      primaryKey({ columns: [table.firstName, table.lastName]})\
    ]);

    export const profile = pgTable("profile", {
      id: serial("id").primaryKey(),
      userFirstName: text("user_first_name"),
      userLastName: text("user_last_name"),
    }, (table) => [\
      foreignKey({\
        columns: [table.userFirstName, table.userLastName],\
        foreignColumns: [user.firstName, user.lastName],\
        name: "custom_fk"\
      })\
    ])
```

```
CREATE TABLE "user" (
	"firstName" text,
	"lastName" text,
	CONSTRAINT "user_pkey" PRIMARY KEY("firstName","lastName")
);

CREATE TABLE "profile" (
	"id" serial PRIMARY KEY,
	"user_first_name" text,
	"user_last_name" text
);

ALTER TABLE "profile" ADD CONSTRAINT "custom_fk" FOREIGN KEY ("user_first_name","user_last_name") REFERENCES "user"("firstName","lastName");
```

## Indexes

Drizzle ORM provides API for both `index` and `unique index` declaration:

```
import { serial, text, index, uniqueIndex, pgTable } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: serial().primaryKey(),
  name: text(),
  email: text(),
}, (table) => [\
  index("name_idx").on(table.name),\
  uniqueIndex("email_idx").on(table.email)\
]);
```

```
CREATE TABLE "user" (
	...
);

CREATE INDEX "name_idx" ON "user" ("name");
CREATE UNIQUE INDEX "email_idx" ON "user" ("email");
```

Drizzle ORM provides a set of params for index creation:

```
// `.on()`
index('name')
  .on(table.column1.asc(), table.column2.nullsFirst(), ...)
  .concurrently()
  .where(sql``)
  .with({ fillfactor: '70' })

// `.onOnly()`
index('name')
  .onOnly(table.column1.asc(), table.column2.nullsFirst(), ...)
  .concurrently()
  .where(sql``)
  .with({ fillfactor: '70' })

// Second Example, with `.using()`
index('name')
  .using('btree', table.column1.asc(), sql`lower(${table.column2})`, table.column1.op('text_ops'))
  .concurrently()
  .where(sql``) // sql expression
  .with({ fillfactor: '70' })
```