import {
    and,
    asc,
    between,
    count, countDistinct,
    desc,
    eq,
    gt,
    ilike,
    inArray,
    isNotNull,
    isNull,
    like,
    ne,
    not,
    or,
    sql
} from 'drizzle-orm';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';

// Define a local schema for testing
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  age: integer('age'),
});

// Test SQL expressions
const s1 = sql`SELECT * FROM users`;

// Test Conditions
const c1 = eq(users.id, 1);
const c2 = ne(users.id, 1);
const c3 = gt(users.age, 18);
const c4 = and(c1, c2);
const c5 = or(c1, c2);
const c6 = not(c1);
const c7 = isNull(users.name);
const c8 = isNotNull(users.name);
const c9 = like(users.name, '%foo%');
const c10 = ilike(users.name, '%foo%');
const c11 = inArray(users.id, [1, 2, 3]);
const c12 = between(users.age, 21, 65);

// Test Selection
const o1 = asc(users.name);
const o2 = desc(users.name);

// Test Aggregation
const a1 = count(users.id);
const a2 = countDistinct(users.id);

export { a1, c1, s1 };

