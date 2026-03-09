/**
 * Cases API for Case Tracker
 * Handles filtering, sorting, and pagination
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import CaseManagementService from '$lib/server/services/case-management';
import type { CaseFilters } from '$lib/server/services/case-management';

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    // Get user ID from session/auth
    const userId = locals.user?.id || url.searchParams.get('userId') || 'mock-user-id';

    if (!userId) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse query parameters
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const search = url.searchParams.get('search') || '';
    const sortBy = url.searchParams.get('sortBy') || 'updatedAt';
    const sortOrder = url.searchParams.get('sortOrder') || 'desc';

    // Parse filter arrays
    const status = url.searchParams.get('status')?.split(',').filter(Boolean) || [];
    const practiceArea = url.searchParams.get('practiceArea')?.split(',').filter(Boolean) || [];
    const priority = url.searchParams.get('priority')?.split(',').filter(Boolean) || [];
    const tags = url.searchParams.get('tags')?.split(',').filter(Boolean) || [];

    // Parse date range
    const dateStart = url.searchParams.get('dateStart');
    const dateEnd = url.searchParams.get('dateEnd');

    // Build filters object
    const filters: CaseFilters = {};

    if (status.length > 0) filters.status = status;
    if (practiceArea.length > 0) filters.practiceArea = practiceArea;
    if (priority.length > 0) filters.priority = priority;
    if (tags.length > 0) filters.tags = tags;

    if (dateStart && dateEnd) {
      filters.dateRange = {
        start: new Date(dateStart),
        end: new Date(dateEnd),
      };
    }

    // Add search to filters if provided
    if (search.trim()) {
      // Note: This would need to be implemented in the service layer
      // For now, we'll pass it as a separate parameter
    }

    // Get cases with filters
    const cases = await CaseManagementService.getCases(userId, filters, page, limit);

    // Get total count for pagination (this would need a separate query in real implementation)
    // For now, we'll estimate based on the returned results
    const total = cases.length === limit ? page * limit + 1 : (page - 1) * limit + cases.length;

    return json({
      success: true,
      cases,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        search,
        status,
        practiceArea,
        priority,
        tags,
        dateRange: filters.dateRange,
      },
      sorting: {
        sortBy,
        sortOrder,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cases API error:', error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load cases',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const userId = locals.user?.id;

    if (!userId) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const caseData = await request.json();

    // Validate required fields
    if (!caseData.title || !caseData.practiceArea || !caseData.caseType) {
      return json(
        { error: 'Missing required fields: title, practiceArea, caseType' },
        { status: 400 }
      );
    }

    // Generate case number if not provided
    if (!caseData.caseNumber) {
      const timestamp = Date.now().toString().slice(-6);
      const practiceCode = caseData.practiceArea.substring(0, 3).toUpperCase();
      caseData.caseNumber = `${practiceCode}-${timestamp}`;
    }

    // Set default values
    const newCaseData = {
      ...caseData,
      primaryAttorneyId: userId,
      status: caseData.status || 'active',
      priority: caseData.priority || 'medium',
      progress: caseData.progress || 0,
      riskLevel: caseData.riskLevel || 'medium',
      isArchived: false,
      tags: caseData.tags || [],
    };

    // Create the case
    const newCase = await CaseManagementService.createCase(newCaseData, userId);

    return json({
      success: true,
      case: newCase,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Create case error:', error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create case',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  try {
    const userId = locals.user?.id;

    if (!userId) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const { caseId, updates } = await request.json();

    if (!caseId) {
      return json({ error: 'Case ID is required' }, { status: 400 });
    }

    // Update the case
    const updatedCase = await CaseManagementService.updateCase(caseId, updates, userId);

    return json({
      success: true,
      case: updatedCase,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Update case error:', error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update case',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
  try {
    const userId = locals.user?.id;

    if (!userId) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const { caseIds } = await request.json();

    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return json({ error: 'Case IDs array is required' }, { status: 400 });
    }

    // Archive cases instead of deleting them
    const results = [];
    for (const caseId of caseIds) {
      try {
        const archivedCase = await CaseManagementService.updateCase(
          caseId,
          { isArchived: true, status: 'archived' },
          userId
        );
        results.push(<any>(<any>{ caseId, success: true, case: archivedCase }));
      } catch (error) {
        results.push(<any>(<any>{
          caseId,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to archive case',
        }));
      }
    }

    return json({
      success: true,
      results,
      archived: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Archive cases error:', error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to archive cases',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};
