# Query Data

Drizzle ORM provides you with two ways to query your data:
1. **SQL-like queries** (Drizzle Queries)
2. **Relational queries** (Drizzle Relational Queries)

## Why SQL-like?

If you know SQL, you know Drizzle. It's that simple. Drizzle Queries are designed to be as close to SQL as possible, while providing you with full type safety and a great developer experience.

- **Familiarity**: No new concepts to learn. If you've written SQL, you'll feel right at home.
- **Performance**: Drizzle doesn't add any overhead to your queries. It just helps you write them in a type-safe way.
- **Flexibility**: You have full control over the generated SQL.

## Why not SQL-like?

While SQL-like queries are great, sometimes you want something more high-level. That's where Relational Queries come in.

- **Ease of use**: Relational queries allow you to query your data in a more object-oriented way.
- **Automatic joins**: Drizzle will automatically join the related tables for you.
- **Nested results**: You can get nested results in a single query.

## Advanced

Drizzle also supports advanced querying features like Subqueries, Common Table Expressions (CTEs), and Prepared statements.

### Separate subqueries into different variables

`	ypescript
const subquery = db
  .select()
  .from(internalStaff)
  .leftJoin(customUser, eq(internalStaff.userId, customUser.id))
  .as('internal_staff');

const mainQuery = await db
  .select()
  .from(ticket)
  .leftJoin(subquery, eq(subquery.internal_staff.userId, ticket.staffId));
`
"@

 = @"
# Migrations

Drizzle ORM offers several ways to handle database migrations, depending on your project's needs and your preferred workflow.

## Choose your migration strategy

- **Option 1: External migration tools**: Manage database schema yourself and use Drizzle for Introspection only.
- **Option 2: Drizzle Kit "push"**: Push schema changes directly from TypeScript code to the database without SQL files.
- **Option 3: Generate and apply SQL migrations**: Let Drizzle generate SQL migration files and apply them for you.
- **Option 4: Generate and apply at runtime**: Generate SQL migration files and apply them during application runtime.
- **Option 5: Generate and apply manually**: Generate SQL migration files but apply them yourself or via external tools.
- **Option 6: Output SQL representation**: Output the SQL representation of your Drizzle schema to the console for use with tools like Atlas.
