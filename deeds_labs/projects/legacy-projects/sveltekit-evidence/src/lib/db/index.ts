// Database connection and Drizzle setup
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
// Use process.env for database URL
const DATABASE_URL = process.env.DATABASE_URL;

// Create the connection
const connectionString =
  DATABASE_URL || "postgresql://legal_admin:123456@localhost:5433/legal_ai_db";
export const connection = postgres(connectionString);

// Create the drizzle instance with schema
export const db = drizzle(connection, { schema });

// Helper function to close connection (for cleanup)
export const closeConnection = async () => {
  await connection.end();
};

// Type exports for convenience
export type Database = typeof db;
export type User = typeof schema.users.$inferSelect;
export type NewUser = typeof schema.users.$inferInsert;
export type Case = typeof schema.cases.$inferSelect;
export type NewCase = typeof schema.cases.$inferInsert;
export type Evidence = typeof schema.evidence.$inferSelect;
export type NewEvidence = typeof schema.evidence.$inferInsert;
export type BoardObject = typeof schema.boardObjects.$inferSelect;
export type NewBoardObject = typeof schema.boardObjects.$inferInsert;
export type Session = typeof schema.sessions.$inferSelect;
export type NewSession = typeof schema.sessions.$inferInsert;
