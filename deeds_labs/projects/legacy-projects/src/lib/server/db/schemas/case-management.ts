/**
 * Case Management Database Schema
 * Comprehensive legal case tracking with user relationships
 */
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  decimal,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table (if not already exists)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'attorney', 'paralegal', 'investigator', 'client'] })
    .notNull()
    .default('attorney'),
  avatar: text('avatar'),
  preferences: jsonb('preferences')
    .$type<{
      notifications: boolean;
      dashboardLayout: string;
      defaultView: string;
    }>()
    .default({
      notifications: true,
      dashboardLayout: 'grid',
      defaultView: 'active',
    }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Cases table
export const cases = pgTable(
  'cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseNumber: text('case_number').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),

    // Case categorization
    practiceArea: text('practice_area', {
      enum: [
        'corporate',
        'litigation',
        'criminal',
        'family',
        'intellectual_property',
        'real_estate',
        'employment',
        'tax',
        'immigration',
        'other',
      ],
    }).notNull(),
    caseType: text('case_type', {
      enum: [
        'investigation',
        'litigation',
        'contract_review',
        'compliance',
        'consultation',
        'document_review',
      ],
    }).notNull(),
    priority: text('priority', { enum: ['low', 'medium', 'high', 'critical'] })
      .notNull()
      .default('medium'),

    // Status tracking
    status: text('status', {
      enum: ['active', 'pending', 'on_hold', 'closed', 'archived'],
    })
      .notNull()
      .default('active'),
    progress: integer('progress').default(0), // 0-100

    // Key dates
    openDate: timestamp('open_date').defaultNow().notNull(),
    dueDate: timestamp('due_date'),
    closedDate: timestamp('closed_date'),

    // Financial tracking
    billingRate: decimal('billing_rate', { precision: 10, scale: 2 }),
    budgetAllocated: decimal('budget_allocated', { precision: 12, scale: 2 }),
    timeSpent: integer('time_spent_minutes').default(0),

    // AI and metadata
    riskLevel: text('risk_level', { enum: ['low', 'medium', 'high', 'critical'] }).default(
      'medium'
    ),
    aiConfidence: decimal('ai_confidence', { precision: 5, scale: 4 }), // 0.0000-1.0000
    aiAnalysis: jsonb('ai_analysis').$type<{
      keyFindings: string[];
      riskFactors: string[];
      recommendations: string[];
      sentiment: number;
      complexity: number;
      tags: string[];
    }>(),

    // Relationships
    primaryAttorneyId: uuid('primary_attorney_id').references(() => users.id),
    clientId: uuid('client_id').references(() => users.id),

    // Search and organization
    tags: text('tags').array(),
    isArchived: boolean('is_archived').default(false),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    caseNumberIdx: index('case_number_idx').on(table.caseNumber),
    statusIdx: index('status_idx').on(table.status),
    practiceAreaIdx: index('practice_area_idx').on(table.practiceArea),
    priorityIdx: index('priority_idx').on(table.priority),
    primaryAttorneyIdx: index('primary_attorney_idx').on(table.primaryAttorneyId),
    clientIdx: index('client_idx').on(table.clientId),
    tagsIdx: index('tags_idx').on(table.tags),
  })
);

// Case assignments (many-to-many relationship between users and cases)
export const caseAssignments = pgTable(
  'case_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .references(() => cases.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role', {
      enum: ['primary_attorney', 'secondary_attorney', 'paralegal', 'investigator', 'consultant'],
    }).notNull(),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
    permissions: jsonb('permissions')
      .$type<{
        canEdit: boolean;
        canViewFinancials: boolean;
        canAssignTasks: boolean;
        canCloseCase: boolean;
      }>()
      .default({
        canEdit: false,
        canViewFinancials: false,
        canAssignTasks: false,
        canCloseCase: false,
      }),
  },
  (table) => ({
    caseUserIdx: index('case_user_idx').on(table.caseId, table.userId),
    roleIdx: index('assignment_role_idx').on(table.role),
  })
);

// Case todos/tasks
export const caseTodos = pgTable(
  'case_todos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .references(() => cases.id, { onDelete: 'cascade' })
      .notNull(),

    // Task details
    title: text('title').notNull(),
    description: text('description'),
    category: text('category', {
      enum: [
        'research',
        'document_review',
        'client_communication',
        'court_filing',
        'investigation',
        'analysis',
        'meeting',
        'other',
      ],
    })
      .notNull()
      .default('other'),

    // Status and priority
    status: text('status', { enum: ['pending', 'in_progress', 'completed', 'cancelled'] })
      .notNull()
      .default('pending'),
    priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] })
      .notNull()
      .default('medium'),

    // Assignment
    assignedToId: uuid('assigned_to_id').references(() => users.id),
    createdById: uuid('created_by_id')
      .references(() => users.id)
      .notNull(),

    // Timing
    dueDate: timestamp('due_date'),
    estimatedHours: decimal('estimated_hours', { precision: 5, scale: 2 }),
    actualHours: decimal('actual_hours', { precision: 5, scale: 2 }),

    // AI assistance
    aiGenerated: boolean('ai_generated').default(false),
    aiSuggestions: jsonb('ai_suggestions').$type<{
      suggestedActions: string[];
      relatedTasks: string[];
      estimatedComplexity: number;
      recommendedResources: string[];
    }>(),

    // Completion tracking
    completedAt: timestamp('completed_at'),
    completionNotes: text('completion_notes'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index('todo_case_idx').on(table.caseId),
    statusIdx: index('todo_status_idx').on(table.status),
    assignedToIdx: index('todo_assigned_to_idx').on(table.assignedToId),
    dueDateIdx: index('todo_due_date_idx').on(table.dueDate),
    priorityIdx: index('todo_priority_idx').on(table.priority),
  })
);

// Case recommendations (AI-generated suggestions)
export const caseRecommendations = pgTable(
  'case_recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .references(() => cases.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id').references(() => users.id), // null for system-generated

    // Recommendation details
    type: text('type', {
      enum: [
        'action_item',
        'risk_mitigation',
        'resource_suggestion',
        'timeline_adjustment',
        'strategy_change',
        'document_request',
      ],
    }).notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    reasoning: text('reasoning'), // AI explanation

    // Metadata
    confidence: decimal('confidence', { precision: 5, scale: 4 }), // AI confidence score
    priority: text('priority', { enum: ['low', 'medium', 'high', 'critical'] })
      .notNull()
      .default('medium'),
    category: text('category'), // Custom categorization

    // Status tracking
    status: text('status', { enum: ['pending', 'reviewed', 'accepted', 'rejected', 'implemented'] })
      .notNull()
      .default('pending'),
    reviewedById: uuid('reviewed_by_id').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    reviewNotes: text('review_notes'),

    // Implementation tracking
    implementedAt: timestamp('implemented_at'),
    implementationNotes: text('implementation_notes'),

    // AI metadata
    aiModel: text('ai_model'), // Which AI model generated this
    aiVersion: text('ai_version'),
    sourceData: jsonb('source_data').$type<{
      analyzedDocuments: string[];
      keyMetrics: Record<string, number>;
      contextFactors: string[];
    }>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index('rec_case_idx').on(table.caseId),
    typeIdx: index('rec_type_idx').on(table.type),
    statusIdx: index('rec_status_idx').on(table.status),
    priorityIdx: index('rec_priority_idx').on(table.priority),
    userIdx: index('rec_user_idx').on(table.userId),
  })
);

// Case timeline/activity log
export const caseActivities = pgTable(
  'case_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .references(() => cases.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id').references(() => users.id),

    // Activity details
    action: text('action', {
      enum: [
        'created',
        'updated',
        'status_changed',
        'assigned',
        'todo_added',
        'todo_completed',
        'document_added',
        'note_added',
        'recommendation_generated',
      ],
    }).notNull(),
    description: text('description').notNull(),
    entityType: text('entity_type'), // todo, document, note, etc.
    entityId: text('entity_id'), // ID of the related entity

    // Change tracking
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),

    // Metadata
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index('activity_case_idx').on(table.caseId),
    userIdx: index('activity_user_idx').on(table.userId),
    actionIdx: index('activity_action_idx').on(table.action),
    createdAtIdx: index('activity_created_at_idx').on(table.createdAt),
  })
);

// Define relationships
export const usersRelations = relations(users, ({ many }) => ({
  primaryCases: many(cases, { relationName: 'primary_attorney' }),
  clientCases: many(cases, { relationName: 'client' }),
  assignments: many(caseAssignments),
  todos: many(caseTodos, { relationName: 'assigned_todos' }),
  createdTodos: many(caseTodos, { relationName: 'created_todos' }),
  activities: many(caseActivities),
  recommendations: many(caseRecommendations, { relationName: 'user_recommendations' }),
  reviewedRecommendations: many(caseRecommendations, { relationName: 'reviewed_recommendations' }),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  primaryAttorney: one(users, {
    fields: [cases.primaryAttorneyId],
    references: [users.id],
    relationName: 'primary_attorney',
  }),
  client: one(users, {
    fields: [cases.clientId],
    references: [users.id],
    relationName: 'client',
  }),
  assignments: many(caseAssignments),
  todos: many(caseTodos),
  recommendations: many(caseRecommendations),
  activities: many(caseActivities),
}));

export const caseAssignmentsRelations = relations(caseAssignments, ({ one }) => ({
  case: one(cases, {
    fields: [caseAssignments.caseId],
    references: [cases.id],
  }),
  user: one(users, {
    fields: [caseAssignments.userId],
    references: [users.id],
  }),
}));

export const caseTodosRelations = relations(caseTodos, ({ one }) => ({
  case: one(cases, {
    fields: [caseTodos.caseId],
    references: [cases.id],
  }),
  assignedTo: one(users, {
    fields: [caseTodos.assignedToId],
    references: [users.id],
    relationName: 'assigned_todos',
  }),
  createdBy: one(users, {
    fields: [caseTodos.createdById],
    references: [users.id],
    relationName: 'created_todos',
  }),
}));

export const caseRecommendationsRelations = relations(caseRecommendations, ({ one }) => ({
  case: one(cases, {
    fields: [caseRecommendations.caseId],
    references: [cases.id],
  }),
  user: one(users, {
    fields: [caseRecommendations.userId],
    references: [users.id],
    relationName: 'user_recommendations',
  }),
  reviewedBy: one(users, {
    fields: [caseRecommendations.reviewedById],
    references: [users.id],
    relationName: 'reviewed_recommendations',
  }),
}));

export const caseActivitiesRelations = relations(caseActivities, ({ one }) => ({
  case: one(cases, {
    fields: [caseActivities.caseId],
    references: [cases.id],
  }),
  user: one(users, {
    fields: [caseActivities.userId],
    references: [users.id],
  }),
}));

// Export types for use in components
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type CaseAssignment = typeof caseAssignments.$inferSelect;
export type NewCaseAssignment = typeof caseAssignments.$inferInsert;
export type CaseTodo = typeof caseTodos.$inferSelect;
export type NewCaseTodo = typeof caseTodos.$inferInsert;
export type CaseRecommendation = typeof caseRecommendations.$inferSelect;
export type NewCaseRecommendation = typeof caseRecommendations.$inferInsert;
export type CaseActivity = typeof caseActivities.$inferSelect;
export type NewCaseActivity = typeof caseActivities.$inferInsert;
