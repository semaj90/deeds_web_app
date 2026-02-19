// Database schema for authenticated legal AI platform
import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, vector, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table
export const userTable = pgTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	name: text("name").notNull(),
	role: text("role").notNull().default("user"), // user, lawyer, paralegal, admin
	organizationId: text("organization_id"),
	preferences: jsonb("preferences").$type<{
		aiModel: "gemma3" | "gemma-local" | "crew-ai";
		maxTokens: number;
		temperature: number;
		enableCache: boolean;
		enableRL: boolean;
		defaultAgents?: string[];
	}>().notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
	emailIndex: index("user_email_idx").on(table.email),
	orgIndex: index("user_org_idx").on(table.organizationId)
}));

// Sessions table (Lucia v3)
export const sessionTable = pgTable("sessions", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull()
});

// Legal cases table
export const caseTable = pgTable(
  "cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    caseType: text("case_type").notNull(), // contract, litigation, compliance, research
    priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
    status: text("status").notNull().default("active"), // active, archived, completed
    tags: jsonb("tags").$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<{
      clientInfo?: Record<string, unknown>;
      deadlines?: Date[];
      relatedCases?: string[];
      legalEntities?: string[];
      precedents?: string[];
      confidenceScore?: number;
    }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userCaseIndex: index("case_user_idx").on(table.userId),
    caseTypeIndex: index("case_type_idx").on(table.caseType),
    statusIndex: index("case_status_idx").on(table.status),
  })
);

// AI conversation messages
export const messageTable = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => caseTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user, assistant, system, agent
    content: text("content").notNull(),
    modelUsed: text("model_used"), // gemma3, gemma-local, crew-ai, autogen
    agentType: text("agent_type"), // researcher, analyst, reviewer, coordinator
    tokenCount: integer("token_count"),
    metadata: jsonb("metadata").$type<{
      tensorIds?: string[];
      cacheKey?: string;
      similarity?: number;
      processingTime?: number;
      temperature?: number;
      rlScore?: number;
      agentChain?: string[];
    }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    caseMessageIndex: index("message_case_idx").on(table.caseId),
    roleIndex: index("message_role_idx").on(table.role),
    createdIndex: index("message_created_idx").on(table.createdAt),
  })
);

// Tensor embeddings storage
export const embeddingTable = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tensorId: text("tensor_id").notNull().unique(),
    caseId: uuid("case_id").references(() => caseTable.id, {
      onDelete: "cascade",
    }),
    messageId: uuid("message_id").references(() => messageTable.id, {
      onDelete: "cascade",
    }),
    embeddingType: text("embedding_type").notNull(), // text, legal_context, case_summary, precedent
    sourceText: text("source_text"),
    vector: vector("vector", { dimensions: 768 }), // pgvector for similarity search
    modelUsed: text("model_used").notNull(), // embeddinggemma, nomic-embed-text
    compressionLevel: text("compression_level").notNull().default("float32"), // float32, float16, int8
    metadata: jsonb("metadata").$type<{
      shape: number[];
      dtype: string;
      parentIds: string[];
      gpuReusable: boolean;
      cacheLocation: "redis" | "minio" | "gpu" | "disk";
      rlValue?: number;
      clusterIds?: string[];
    }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tensorIndex: index("embedding_tensor_idx").on(table.tensorId),
    caseEmbedIndex: index("embedding_case_idx").on(table.caseId),
    vectorIndex: index("embedding_vector_idx").using(
      "hnsw",
      table.vector.op("vector_cosine_ops")
    ),
    typeIndex: index("embedding_type_idx").on(table.embeddingType),
  })
);

// GPU computation cache for RL
export const computationTable = pgTable(
  "computations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    computationKey: text("computation_key").notNull().unique(),
    caseId: uuid("case_id").references(() => caseTable.id),
    computationType: text("computation_type").notNull(), // inference, embedding, clustering, rl_training
    inputTensors: jsonb("input_tensors").$type<string[]>(),
    outputTensors: jsonb("output_tensors").$type<string[]>(),
    gpuTime: integer("gpu_time"), // milliseconds
    accuracy: integer("accuracy"), // percentage
    rewardScore: integer("reward_score"), // RL reward
    metadata: jsonb("metadata").$type<{
      modelConfig: Record<string, unknown>;
      hyperparams: Record<string, unknown>;
      memoryUsed: number;
      cacheHits: number;
      improvements: string[];
    }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsed: timestamp("last_used").notNull().defaultNow(),
  },
  (table) => ({
    computationKeyIndex: index("computation_key_idx").on(table.computationKey),
    typeIndex: index("computation_type_idx").on(table.computationType),
    rewardIndex: index("computation_reward_idx").on(table.rewardScore),
  })
);

// Multi-agent workflows (AutoGen/CrewAI)
export const workflowTable = pgTable("workflows", {
	id: uuid("id").primaryKey().defaultRandom(),
	caseId: uuid("case_id").notNull().references(() => caseTable.id, { onDelete: "cascade" }),
	workflowType: text("workflow_type").notNull(), // autogen, crew-ai, custom
	name: text("name").notNull(),
	description: text("description"),
	agents: jsonb("agents").$type<Array<{
		name: string;
		role: string;
		model: string;
		systemPrompt: string;
		tools: string[];
	}>>(),
	status: text("status").notNull().default("pending"), // pending, running, completed, failed
	results: jsonb("results"),
	executionTime: integer("execution_time"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	completedAt: timestamp("completed_at")
}, (table) => ({
	caseWorkflowIndex: index("workflow_case_idx").on(table.caseId),
	statusIndex: index("workflow_status_idx").on(table.status),
	typeIndex: index("workflow_type_idx").on(table.workflowType)
}));

// Relations
export const userRelations = relations(userTable, ({ many }) => ({
	sessions: many(sessionTable),
	cases: many(caseTable)
}));

export const sessionRelations = relations(sessionTable, ({ one }) => ({
	user: one(userTable, {
		fields: [sessionTable.userId],
		references: [userTable.id]
	})
}));

export const caseRelations = relations(caseTable, ({ one, many }) => ({
	user: one(userTable, {
		fields: [caseTable.userId],
		references: [userTable.id]
	}),
	messages: many(messageTable),
	embeddings: many(embeddingTable),
	workflows: many(workflowTable)
}));

export const messageRelations = relations(messageTable, ({ one, many }) => ({
	case: one(caseTable, {
		fields: [messageTable.caseId],
		references: [caseTable.id]
	}),
	embeddings: many(embeddingTable)
}));

export const embeddingRelations = relations(embeddingTable, ({ one }) => ({
	case: one(caseTable, {
		fields: [embeddingTable.caseId],
		references: [caseTable.id]
	}),
	message: one(messageTable, {
		fields: [embeddingTable.messageId],
		references: [messageTable.id]
	})
}));

export const workflowRelations = relations(workflowTable, ({ one }) => ({
	case: one(caseTable, {
		fields: [workflowTable.caseId],
		references: [caseTable.id]
	})
}));