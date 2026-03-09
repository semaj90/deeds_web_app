/**
 * Case Management Service Layer
 * Business logic for legal case management with AI integration
 */
import { db } from '../db';
import {
  cases,
  caseTodos,
  caseRecommendations,
  caseActivities,
  caseAssignments,
} from '../db/schemas/case-management';
import { eq, and, or, desc, asc, sql, count, avg, sum } from 'drizzle-orm';
import type {
  Case,
  NewCase,
  CaseTodo,
  NewCaseTodo,
  CaseRecommendation,
  NewCaseRecommendation,
} from '../db/schemas/case-management';

export interface CaseFilters {
  status?: string[];
  practiceArea?: string[];
  priority?: string[];
  assignedTo?: string;
  client?: string;
  tags?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface CaseDashboardStats {
  totalCases: number;
  activeCases: number;
  completedThisMonth: number;
  averageProgress: number;
  highPriorityCases: number;
  overdueTodos: number;
  pendingRecommendations: number;
  totalTimeSpent: number;
  recentActivities: any[];
}

export interface TodoFilters {
  status?: string[];
  priority?: string[];
  assignedTo?: string;
  category?: string[];
  dueDate?: {
    start: Date;
    end: Date;
  };
}

export class CaseManagementService {
  /**
   * Get comprehensive dashboard statistics
   */
  static async getDashboardStats(userId: string): Promise<CaseDashboardStats> {
    try {
      // Get user's assigned cases
      const userCases = await db
        .select()
        .from(cases)
        .leftJoin(caseAssignments, eq(caseAssignments.caseId, cases.id))
        .where(or(eq(cases.primaryAttorneyId, userId), eq(caseAssignments.userId, userId)));

      const caseIds = userCases.map((uc) => uc.cases.id);

      // Parallel queries for better performance
      const [
        totalCases,
        activeCases,
        completedThisMonth,
        avgProgress,
        highPriorityCases,
        overdueTodos,
        pendingRecommendations,
        totalTimeSpent,
        recentActivities,
      ] = await Promise.all([
        // Total cases count
        db
          .select({ count: count() })
          .from(cases)
          .where(sql`${cases.id} = ANY(${caseIds})`),

        // Active cases count
        db
          .select({ count: count() })
          .from(cases)
          .where(and(sql`${cases.id} = ANY(${caseIds})`, eq(cases.status, 'active'))),

        // Cases completed this month
        db
          .select({ count: count() })
          .from(cases)
          .where(
            and(
              sql`${cases.id} = ANY(${caseIds})`,
              eq(cases.status, 'closed'),
              sql`${cases.closedDate} >= date_trunc('month', current_date)`
            )
          ),

        // Average progress
        db
          .select({ avg: avg(cases.progress) })
          .from(cases)
          .where(sql`${cases.id} = ANY(${caseIds})`),

        // High priority cases
        db
          .select({ count: count() })
          .from(cases)
          .where(
            and(
              sql`${cases.id} = ANY(${caseIds})`,
              or(eq(cases.priority, 'high'), eq(cases.priority, 'critical'))
            )
          ),

        // Overdue todos
        db
          .select({ count: count() })
          .from(caseTodos)
          .where(
            and(
              sql`${caseTodos.caseId} = ANY(${caseIds})`,
              eq(caseTodos.status, 'pending'),
              sql`${caseTodos.dueDate} < current_date`
            )
          ),

        // Pending recommendations
        db
          .select({ count: count() })
          .from(caseRecommendations)
          .where(
            and(
              sql`${caseRecommendations.caseId} = ANY(${caseIds})`,
              eq(caseRecommendations.status, 'pending')
            )
          ),

        // Total time spent
        db
          .select({ sum: sum(cases.timeSpent) })
          .from(cases)
          .where(sql`${cases.id} = ANY(${caseIds})`),

        // Recent activities (last 10)
        db
          .select()
          .from(caseActivities)
          .where(sql`${caseActivities.caseId} = ANY(${caseIds})`)
          .orderBy(desc(caseActivities.createdAt))
          .limit(10),
      ]);

      return {
        totalCases: totalCases[0]?.count || 0,
        activeCases: activeCases[0]?.count || 0,
        completedThisMonth: completedThisMonth[0]?.count || 0,
        averageProgress: Math.round(Number(avgProgress[0]?.avg || 0)),
        highPriorityCases: highPriorityCases[0]?.count || 0,
        overdueTodos: overdueTodos[0]?.count || 0,
        pendingRecommendations: pendingRecommendations[0]?.count || 0,
        totalTimeSpent: Number(totalTimeSpent[0]?.sum || 0),
        recentActivities: recentActivities || [],
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      throw new Error('Failed to load dashboard statistics');
    }
  }

  /**
   * Get cases with filtering and pagination
   */
  static async getCases(userId: string, filters: CaseFilters = {}, page = 1, limit = 20) {
    try {
      let query = db
        .select({
          case: cases,
          primaryAttorney: {
            id: sql`pa.id`,
            name: sql`pa.name`,
            email: sql`pa.email`,
          },
          client: {
            id: sql`cl.id`,
            name: sql`cl.name`,
            email: sql`cl.email`,
          },
        })
        .from(cases)
        .leftJoin(sql`users pa`, eq(cases.primaryAttorneyId, sql`pa.id`))
        .leftJoin(sql`users cl`, eq(cases.clientId, sql`cl.id`))
        .leftJoin(caseAssignments, eq(caseAssignments.caseId, cases.id))
        .where(or(eq(cases.primaryAttorneyId, userId), eq(caseAssignments.userId, userId)));

      // Apply filters
      const conditions = [];

      if (filters.status?.length) {
        conditions.push(<any>(<any>sql`${cases.status} = ANY(${filters.status})`));
      }

      if (filters.practiceArea?.length) {
        conditions.push(<any>(<any>sql`${cases.practiceArea} = ANY(${filters.practiceArea})`));
      }

      if (filters.priority?.length) {
        conditions.push(<any>(<any>sql`${cases.priority} = ANY(${filters.priority})`));
      }

      if (filters.tags?.length) {
        conditions.push(<any>(<any>sql`${cases.tags} && ${filters.tags}`));
      }

      if (filters.dateRange) {
        conditions.push(
          <any>(
            (<any>(
              and(
                sql`${cases.createdAt} >= ${filters.dateRange.start}`,
                sql`${cases.createdAt} <= ${filters.dateRange.end}`
              )
            ))
          )
        );
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      // Add pagination
      const offset = (page - 1) * limit;
      const results = await query.orderBy(desc(cases.updatedAt)).limit(limit).offset(offset);

      return results;
    } catch (error) {
      console.error('Error getting cases:', error);
      throw new Error('Failed to load cases');
    }
  }

  /**
   * Create a new case with activity logging
   */
  static async createCase(caseData: NewCase, createdBy: string): Promise<Case> {
    try {
      const [newCase] = await db.insert(cases).values(caseData).returning();

      // Log case creation activity
      await this.logActivity(newCase.id, createdBy, 'created', `Case "${newCase.title}" created`);

      return newCase;
    } catch (error) {
      console.error('Error creating case:', error);
      throw new Error('Failed to create case');
    }
  }

  /**
   * Update case with change tracking
   */
  static async updateCase(
    caseId: string,
    updates: Partial<Case>,
    updatedBy: string
  ): Promise<Case> {
    try {
      // Get current case for change tracking
      const [currentCase] = await db.select().from(cases).where(eq(cases.id, caseId));

      if (!currentCase) {
        throw new Error('Case not found');
      }

      // Update the case
      const [updatedCase] = await db
        .update(cases)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(cases.id, caseId))
        .returning();

      // Log significant changes
      const changes = [];
      if (updates.status && updates.status !== currentCase.status) {
        changes.push(<any>(<any>`Status changed from ${currentCase.status} to ${updates.status}`));
        await this.logActivity(
          caseId,
          updatedBy,
          'status_changed',
          `Case status changed to ${updates.status}`,
          'case',
          caseId,
          { status: currentCase.status },
          { status: updates.status }
        );
      }

      if (updates.priority && updates.priority !== currentCase.priority) {
        changes.push(
          <any>(<any>`Priority changed from ${currentCase.priority} to ${updates.priority}`)
        );
      }

      if (changes.length > 0) {
        await this.logActivity(caseId, updatedBy, 'updated', `Case updated: ${changes.join(', ')}`);
      }

      return updatedCase;
    } catch (error) {
      console.error('Error updating case:', error);
      throw new Error('Failed to update case');
    }
  }

  /**
   * Get todos for a case or user with filtering
   */
  static async getTodos(
    caseId?: string,
    userId?: string,
    filters: TodoFilters = {},
    page = 1,
    limit = 50
  ) {
    try {
      let query = db
        .select({
          todo: caseTodos,
          case: {
            id: cases.id,
            title: cases.title,
            caseNumber: cases.caseNumber,
          },
          assignedTo: {
            id: sql`atu.id`,
            name: sql`atu.name`,
            email: sql`atu.email`,
          },
          createdBy: {
            id: sql`cbu.id`,
            name: sql`cbu.name`,
            email: sql`cbu.email`,
          },
        })
        .from(caseTodos)
        .leftJoin(cases, eq(caseTodos.caseId, cases.id))
        .leftJoin(sql`users atu`, eq(caseTodos.assignedToId, sql`atu.id`))
        .leftJoin(sql`users cbu`, eq(caseTodos.createdById, sql`cbu.id`));

      const conditions = [];

      if (caseId) {
        conditions.push(<any>(<any>eq(caseTodos.caseId, caseId)));
      }

      if (userId) {
        conditions.push(
          <any>(<any>or(eq(caseTodos.assignedToId, userId), eq(caseTodos.createdById, userId)))
        );
      }

      // Apply filters
      if (filters.status?.length) {
        conditions.push(<any>(<any>sql`${caseTodos.status} = ANY(${filters.status})`));
      }

      if (filters.priority?.length) {
        conditions.push(<any>(<any>sql`${caseTodos.priority} = ANY(${filters.priority})`));
      }

      if (filters.category?.length) {
        conditions.push(<any>(<any>sql`${caseTodos.category} = ANY(${filters.category})`));
      }

      if (filters.dueDate) {
        conditions.push(
          <any>(
            (<any>(
              and(
                sql`${caseTodos.dueDate} >= ${filters.dueDate.start}`,
                sql`${caseTodos.dueDate} <= ${filters.dueDate.end}`
              )
            ))
          )
        );
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const offset = (page - 1) * limit;
      const results = await query
        .orderBy(asc(caseTodos.dueDate), desc(caseTodos.priority))
        .limit(limit)
        .offset(offset);

      return results;
    } catch (error) {
      console.error('Error getting todos:', error);
      throw new Error('Failed to load todos');
    }
  }

  /**
   * Create a new todo with AI suggestions
   */
  static async createTodo(todoData: NewCaseTodo): Promise<CaseTodo> {
    try {
      const [newTodo] = await db.insert(caseTodos).values(todoData).returning();

      // Log todo creation
      await this.logActivity(
        newTodo.caseId,
        todoData.createdById,
        'todo_added',
        `Todo "${newTodo.title}" added`,
        'todo',
        newTodo.id
      );

      return newTodo;
    } catch (error) {
      console.error('Error creating todo:', error);
      throw new Error('Failed to create todo');
    }
  }

  /**
   * Complete a todo with time tracking
   */
  static async completeTodo(
    todoId: string,
    completedBy: string,
    completionNotes?: string,
    actualHours?: number
  ): Promise<CaseTodo> {
    try {
      const [completedTodo] = await db
        .update(caseTodos)
        .set({
          status: 'completed',
          completedAt: new Date(),
          completionNotes,
          actualHours: actualHours ? String(actualHours) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(caseTodos.id, todoId))
        .returning();

      // Log completion
      await this.logActivity(
        completedTodo.caseId,
        completedBy,
        'todo_completed',
        `Todo "${completedTodo.title}" completed`,
        'todo',
        todoId
      );

      return completedTodo;
    } catch (error) {
      console.error('Error completing todo:', error);
      throw new Error('Failed to complete todo');
    }
  }

  /**
   * Get recommendations for a case
   */
  static async getRecommendations(caseId: string, status?: string) {
    try {
      let query = db
        .select({
          recommendation: caseRecommendations,
          reviewedBy: {
            id: sql`rbu.id`,
            name: sql`rbu.name`,
            email: sql`rbu.email`,
          },
        })
        .from(caseRecommendations)
        .leftJoin(sql`users rbu`, eq(caseRecommendations.reviewedById, sql`rbu.id`))
        .where(eq(caseRecommendations.caseId, caseId));

      if (status) {
        query = query.where(
          and(eq(caseRecommendations.caseId, caseId), eq(caseRecommendations.status, status))
        );
      }

      const results = await query.orderBy(desc(caseRecommendations.createdAt));
      return results;
    } catch (error) {
      console.error('Error getting recommendations:', error);
      throw new Error('Failed to load recommendations');
    }
  }

  /**
   * Create an AI-generated recommendation
   */
  static async createRecommendation(
    recommendationData: NewCaseRecommendation
  ): Promise<CaseRecommendation> {
    try {
      const [newRec] = await db.insert(caseRecommendations).values(recommendationData).returning();

      // Log recommendation generation
      if (recommendationData.caseId) {
        await this.logActivity(
          recommendationData.caseId,
          null, // System generated
          'recommendation_generated',
          `AI recommendation: ${newRec.title}`,
          'recommendation',
          newRec.id
        );
      }

      return newRec;
    } catch (error) {
      console.error('Error creating recommendation:', error);
      throw new Error('Failed to create recommendation');
    }
  }

  /**
   * Review a recommendation
   */
  static async reviewRecommendation(
    recommendationId: string,
    reviewedBy: string,
    status: 'accepted' | 'rejected',
    reviewNotes?: string
  ): Promise<CaseRecommendation> {
    try {
      const [reviewed] = await db
        .update(caseRecommendations)
        .set({
          status,
          reviewedById: reviewedBy,
          reviewedAt: new Date(),
          reviewNotes,
          updatedAt: new Date(),
        })
        .where(eq(caseRecommendations.id, recommendationId))
        .returning();

      return reviewed;
    } catch (error) {
      console.error('Error reviewing recommendation:', error);
      throw new Error('Failed to review recommendation');
    }
  }

  /**
   * Log case activity
   */
  static async logActivity(
    caseId: string,
    userId: string | null,
    action: string,
    description: string,
    entityType?: string,
    entityId?: string,
    oldValue?: any,
    newValue?: any
  ) {
    try {
      await db.insert(caseActivities).values({
        caseId,
        userId,
        action,
        description,
        entityType,
        entityId,
        oldValue,
        newValue,
      });
    } catch (error) {
      console.error('Error logging activity:', error);
      // Don't throw - activity logging shouldn't break main operations
    }
  }

  /**
   * Generate AI recommendations for a case
   */
  static async generateAIRecommendations(caseId: string): Promise<CaseRecommendation[]> {
    try {
      // Get case details for AI analysis
      const [caseDetails] = await db.select().from(cases).where(eq(cases.id, caseId));

      if (!caseDetails) {
        throw new Error('Case not found');
      }

      // Get case todos and recent activities for context
      const [todos, activities] = await Promise.all([
        db.select().from(caseTodos).where(eq(caseTodos.caseId, caseId)),
        db
          .select()
          .from(caseActivities)
          .where(eq(caseActivities.caseId, caseId))
          .orderBy(desc(caseActivities.createdAt))
          .limit(20),
      ]);

      // AI Analysis based on case data
      const recommendations = [];

      // Risk-based recommendations
      if (caseDetails.riskLevel === 'high' || caseDetails.riskLevel === 'critical') {
        recommendations.push(<any>(<any>{
          caseId,
          type: 'risk_mitigation' as const,
          title: 'High Risk Case - Immediate Review Required',
          description:
            'This case has been flagged as high risk. Consider scheduling an immediate review with senior counsel.',
          reasoning: `Risk level: ${caseDetails.riskLevel}. Practice area: ${caseDetails.practiceArea}`,
          confidence: '0.9500',
          priority: 'high' as const,
          aiModel: 'gemma3-legal',
          aiVersion: '1.0',
        }));
      }

      // Progress-based recommendations
      if (caseDetails.progress < 30 && caseDetails.dueDate) {
        const daysUntilDue = Math.ceil(
          (new Date(caseDetails.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilDue < 30) {
          recommendations.push(<any>(<any>{
            caseId,
            type: 'timeline_adjustment' as const,
            title: 'Timeline Risk - Consider Resource Allocation',
            description: `Case progress is ${caseDetails.progress}% with ${daysUntilDue} days remaining. Consider additional resources.`,
            reasoning: 'Low progress relative to time remaining',
            confidence: '0.8500',
            priority: 'medium' as const,
            aiModel: 'gemma3-legal',
            aiVersion: '1.0',
          }));
        }
      }

      // Todo-based recommendations
      const overdueTodos = todos.filter(
        (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed'
      );

      if (overdueTodos.length > 0) {
        recommendations.push(<any>(<any>{
          caseId,
          type: 'action_item' as const,
          title: `${overdueTodos.length} Overdue Tasks Require Attention`,
          description:
            'Multiple tasks are past their due dates. Consider reassigning or extending deadlines.',
          reasoning: `${overdueTodos.length} overdue tasks detected`,
          confidence: '0.9800',
          priority: 'high' as const,
          aiModel: 'gemma3-legal',
          aiVersion: '1.0',
        }));
      }

      // Create recommendations in database
      const createdRecommendations = [];
      for (const rec of recommendations) {
        const created = await this.createRecommendation(rec);
        createdRecommendations.push(<any>(<any>created));
      }

      return createdRecommendations;
    } catch (error) {
      console.error('Error generating AI recommendations:', error);
      throw new Error('Failed to generate recommendations');
    }
  }
}

export default CaseManagementService;
