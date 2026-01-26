// Test 1: Standard import (failing)
// import { eq } from 'drizzle-orm';

// Test 2: Import from sql
import { eq } from 'drizzle-orm/sql';

// Test 3: Import from expressions (if exposed)
// import { eq } from 'drizzle-orm/expressions';

import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { db } from './lib/db';

const test = pgTable('test', {
    id: serial('id').primaryKey(),
    name: text('name'),
});

const result = db.select().from(test).where(eq(test.name, 'foo'));

