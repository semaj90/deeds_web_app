import {
  pgTable,
  text,
  timestamp,
  json,
  integer,
  vector,
  uuid,
  boolean,
  decimal,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table for authentication and user management
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("prosecutor"), // prosecutor, admin, viewer
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  preferences: json("preferences").default({}),
});

// Chat sessions for conversation management
export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  title: text("title").notNull(),
  caseId: uuid("case_id").references(() => cases.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: json("metadata").default({}),
});

// Messages table for chat history
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .references(() => chatSessions.id)
    .notNull(),
  role: text("role").notNull(), // user, assistant, system
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  metadata: json("metadata").default({}),
  tokensUsed: integer("tokens_used").default(0),
  responseTime: integer("response_time").default(0), // milliseconds
  rating: integer("rating"), // 1-5 for assistant responses
  feedback: text("feedback"),
});

// Cases table for legal case management
export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseNumber: text("case_number").unique().notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"), // active, closed, pending, archived
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  assignedTo: uuid("assigned_to").references(() => users.id),
  createdBy: uuid("created_by")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  metadata: json("metadata").default({}),
});

// Documents table for legal document storage and analysis
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").references(() => cases.id),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  uploadedBy: uuid("uploaded_by")
    .references(() => users.id)
    .notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  status: text("status").notNull().default("uploaded"), // uploaded, processing, processed, error
  extractedText: text("extracted_text"),
  summary: text("summary"),
  keyEntities: json("key_entities").default([]),
  metadata: json("metadata").default({}),
});

// Document chunks for RAG retrieval
export const documentChunks = pgTable("document_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .references(() => documents.id)
    .notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 384 }), // nomic-embed-text dimensions
  tokens: integer("tokens").notNull(),
  startOffset: integer("start_offset"),
  endOffset: integer("end_offset"),
  metadata: json("metadata").default({}),
});

// Evidence table for tracking evidence items
export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .references(() => cases.id)
    .notNull(),
  documentIds: json("document_ids").default([]), // Array of document IDs related to this evidence
  evidenceNumber: text("evidence_number").unique().notNull(),
  type: text("type").notNull(), // physical, digital, testimonial, documentary
  description: text("description").notNull(),
  source: text("source"),
  custodyChain: json("custody_chain").default([]),
  collectedAt: timestamp("collected_at"),
  collectedBy: text("collected_by"),
  location: text("location"),
  status: text("status").notNull().default("collected"), // collected, analyzed, processed, admitted
  admissible: boolean("admissible"),
  notes: text("notes"),
  createdBy: uuid("created_by")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  metadata: json("metadata").default({}),
});

// Knowledge base for legal precedents and references
export const knowledgeBase = pgTable("knowledge_base", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull(), // statute, case_law, regulation, procedure, template
  jurisdiction: text("jurisdiction"),
  citation: text("citation"),
  summary: text("summary"),
  keyTerms: json("key_terms").default([]),
  embedding: vector("embedding", { dimensions: 384 }),
  createdBy: uuid("created_by")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: json("metadata").default({}),
});

// Search queries for analytics and improvement
export const searchQueries = pgTable("search_queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  sessionId: uuid("session_id").references(() => chatSessions.id),
  query: text("query").notNull(),
  resultsCount: integer("results_count").default(0),
  responseTime: integer("response_time").default(0),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  successful: boolean("successful").default(true),
  metadata: json("metadata").default({}),
});

// System metrics for monitoring
export const systemMetrics = pgTable("system_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  metricName: text("metric_name").notNull(),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  metadata: json("metadata").default({}),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  chatSessions: many(chatSessions),
  createdCases: many(cases, { relationName: "createdBy" }),
  assignedCases: many(cases, { relationName: "assignedTo" }),
  uploadedDocuments: many(documents),
  createdEvidence: many(evidence),
  knowledgeBaseEntries: many(knowledgeBase),
  searchQueries: many(searchQueries),
}));

export const chatSessionsRelations = relations(
  chatSessions,
  ({ one, many }) => ({
    user: one(users, { fields: [chatSessions.userId], references: [users.id] }),
    case: one(cases, { fields: [chatSessions.caseId], references: [cases.id] }),
    messages: many(messages),
    searchQueries: many(searchQueries),
  })
);

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [messages.sessionId],
    references: [chatSessions.id],
  }),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  assignedUser: one(users, {
    fields: [cases.assignedTo],
    references: [users.id],
    relationName: "assignedTo",
  }),
  createdByUser: one(users, {
    fields: [cases.createdBy],
    references: [users.id],
    relationName: "createdBy",
  }),
  documents: many(documents),
  evidence: many(evidence),
  chatSessions: many(chatSessions),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  case: one(cases, { fields: [documents.caseId], references: [cases.id] }),
  uploadedByUser: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
  }),
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
}));

export const evidenceRelations = relations(evidence, ({ one }) => ({
  case: one(cases, { fields: [evidence.caseId], references: [cases.id] }),
  createdByUser: one(users, {
    fields: [evidence.createdBy],
    references: [users.id],
  }),
}));

export const knowledgeBaseRelations = relations(knowledgeBase, ({ one }) => ({
  createdByUser: one(users, {
    fields: [knowledgeBase.createdBy],
    references: [users.id],
  }),
}));

export const searchQueriesRelations = relations(searchQueries, ({ one }) => ({
  user: one(users, { fields: [searchQueries.userId], references: [users.id] }),
  session: one(chatSessions, {
    fields: [searchQueries.sessionId],
    references: [chatSessions.id],
  }),
}));

// Export all tables for use in other files
export const schema = {
  users,
  chatSessions,
  messages,
  cases,
  documents,
  documentChunks,
  evidence,
  knowledgeBase,
  searchQueries,
  systemMetrics,
};
