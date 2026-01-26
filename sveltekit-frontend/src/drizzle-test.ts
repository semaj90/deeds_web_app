import { eq } from 'drizzle-orm';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { db } from './lib/db';

const test = pgTable('test', {
    id: serial('id').primaryKey(),
    name: text('name'),
});

const result = db.select().from(test).where(eq(test.name, 'foo'));

