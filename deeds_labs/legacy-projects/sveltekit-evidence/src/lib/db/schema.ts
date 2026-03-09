// Drizzle ORM Schema for Legal AI Evidence Platform
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("user"), // admin, user, detective
  passwordHash: varchar("password_hash", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata").default({}),
});

// Sessions table for Lucia auth
export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Cases table
export const cases = pgTable(
  "cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 50 }).notNull().default("open"), // open, investigating, closed
    priority: varchar("priority", { length: 50 }).notNull().default("medium"), // low, medium, high, critical
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    assignedTo: uuid("assigned_to").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
    metadata: jsonb("metadata").default({}),
  },
  (table) => ({
    statusIdx: index("idx_cases_status").on(table.status),
    priorityIdx: index("idx_cases_priority").on(table.priority),
    createdByIdx: index("idx_cases_created_by").on(table.createdBy),
  }),
);

// Evidence table
export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 500 }).notNull(),
    originalName: varchar("original_name", { length: 500 }),
    type: varchar("type", { length: 50 }).notNull(), // image, document, audio, video, text
    mimeType: varchar("mime_type", { length: 100 }),
    fileSize: integer("file_size"),
    filePath: varchar("file_path", { length: 1000 }),
    minioUrl: varchar("minio_url", { length: 1000 }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
    tags: jsonb("tags").default([]),
    notes: text("notes"),
    metadata: jsonb("metadata").default({}),
    // Board positioning
    boardX: decimal("board_x"),
    boardY: decimal("board_y"),
    boardWidth: decimal("board_width"),
    boardHeight: decimal("board_height"),
    // Analysis results
    aiAnalysis: jsonb("ai_analysis").default({}),
    embeddings: jsonb("embeddings"), // Vector embeddings for similarity
  },
  (table) => ({
    caseIdIdx: index("idx_evidence_case_id").on(table.caseId),
    typeIdx: index("idx_evidence_type").on(table.type),
    uploadedByIdx: index("idx_evidence_uploaded_by").on(table.uploadedBy),
    uploadedAtIdx: index("idx_evidence_uploaded_at").on(table.uploadedAt),
  }),
);

// Evidence connections table
export const evidenceConnections = pgTable(
  "evidence_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceEvidenceId: uuid("source_evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    targetEvidenceId: uuid("target_evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    connectionType: varchar("connection_type", { length: 50 }).notNull(),
    strength: decimal("strength", { precision: 3, scale: 2 }).notNull(),
    sharedEntities: jsonb("shared_entities").default([]),
    sharedTerms: jsonb("shared_terms").default([]),
    temporalProximity: integer("temporal_proximity"), // minutes
    spatialProximity: decimal("spatial_proximity", { precision: 10, scale: 6 }),
    semanticSimilarity: decimal("semantic_similarity", {
      precision: 3,
      scale: 2,
    }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceIdx: index("idx_evidence_connections_source").on(
      table.sourceEvidenceId,
    ),
    targetIdx: index("idx_evidence_connections_target").on(
      table.targetEvidenceId,
    ),
    typeIdx: index("idx_evidence_connections_type").on(table.connectionType),
    strengthIdx: index("idx_evidence_connections_strength").on(table.strength),
  }),
);

// Board objects table (for Fabric.js canvas state)
export const boardObjects = pgTable(
  "board_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(), // image, text, note, connection
    x: decimal("x").notNull(),
    y: decimal("y").notNull(),
    width: decimal("width"),
    height: decimal("height"),
    content: text("content"),
    url: varchar("url", { length: 1000 }),
    evidenceId: uuid("evidence_id").references(() => evidence.id, {
      onDelete: "cascade",
    }),
    connections: jsonb("connections").default([]), // Array of connected object IDs
    style: jsonb("style").default({}), // Fabric.js styling
    metadata: jsonb("metadata").default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdIdx: index("idx_board_objects_case_id").on(table.caseId),
    typeIdx: index("idx_board_objects_type").on(table.type),
    evidenceIdIdx: index("idx_board_objects_evidence_id").on(table.evidenceId),
  }),
);

// Timeline/Activity table
export const timeline = pgTable(
  "timeline",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    type: varchar("type", { length: 50 }).notNull(),
    relatedItemId: uuid("related_item_id"), // Generic reference to evidence, reports, etc.
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    metadata: jsonb("metadata").default({}),
  },
  (table) => ({
    caseIdIdx: index("idx_timeline_case_id").on(table.caseId),
    typeIdx: index("idx_timeline_type").on(table.type),
    timestampIdx: index("idx_timeline_timestamp").on(table.timestamp),
  }),
);

// AI Chat sessions table
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }),
    messages: jsonb("messages").default([]),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdIdx: index("idx_chat_sessions_case_id").on(table.caseId),
    userIdIdx: index("idx_chat_sessions_user_id").on(table.userId),
  }),
);

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  cases: many(cases),
  evidence: many(evidence),
  sessions: many(sessions),
  chatSessions: many(chatSessions),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [cases.createdBy],
    references: [users.id],
  }),
  assignedToUser: one(users, {
    fields: [cases.assignedTo],
    references: [users.id],
  }),
  evidence: many(evidence),
  boardObjects: many(boardObjects),
  timeline: many(timeline),
  chatSessions: many(chatSessions),
}));

export const evidenceRelations = relations(evidence, ({ one, many }) => ({
  case: one(cases, {
    fields: [evidence.caseId],
    references: [cases.id],
  }),
  uploadedByUser: one(users, {
    fields: [evidence.uploadedBy],
    references: [users.id],
  }),
  sourceConnections: many(evidenceConnections, {
    relationName: "sourceConnections",
  }),
  targetConnections: many(evidenceConnections, {
    relationName: "targetConnections",
  }),
  boardObjects: many(boardObjects),
}));

export const evidenceConnectionsRelations = relations(
  evidenceConnections,
  ({ one }) => ({
    sourceEvidence: one(evidence, {
      fields: [evidenceConnections.sourceEvidenceId],
      references: [evidence.id],
      relationName: "sourceConnections",
    }),
    targetEvidence: one(evidence, {
      fields: [evidenceConnections.targetEvidenceId],
      references: [evidence.id],
      relationName: "targetConnections",
    }),
  }),
);

export const boardObjectsRelations = relations(boardObjects, ({ one }) => ({
  case: one(cases, {
    fields: [boardObjects.caseId],
    references: [cases.id],
  }),
  evidence: one(evidence, {
    fields: [boardObjects.evidenceId],
    references: [evidence.id],
  }),
  createdByUser: one(users, {
    fields: [boardObjects.createdBy],
    references: [users.id],
  }),
}));

export const timelineRelations = relations(timeline, ({ one }) => ({
  case: one(cases, {
    fields: [timeline.caseId],
    references: [cases.id],
  }),
  createdByUser: one(users, {
    fields: [timeline.createdBy],
    references: [users.id],
  }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one }) => ({
  case: one(cases, {
    fields: [chatSessions.caseId],
    references: [cases.id],
  }),
  user: one(users, {
    fields: [chatSessions.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
