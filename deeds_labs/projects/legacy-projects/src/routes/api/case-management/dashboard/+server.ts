/**
 * Case Management Dashboard API
 * Provides real-time statistics and metrics
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import CaseManagementService from '$lib/server/services/case-management';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  try {
    // Get user ID from session/auth
    // In a real app, you'd get this from your auth system
    const userId = locals.user?.id || url.searchParams.get('userId') || 'mock-user-id';

    if (!userId) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get dashboard statistics
    const stats = await CaseManagementService.getDashboardStats(userId);

    return json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Dashboard API error:', error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load dashboard',
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

    const { action, caseId } = await request.json();

    let result;

    switch (action) {
      case 'generate_recommendations':
        if (!caseId) {
          return json({ error: 'Case ID required for recommendation generation' }, { status: 400 });
        }
        result = await CaseManagementService.generateAIRecommendations(caseId);
        break;

      case 'refresh_stats':
        result = await CaseManagementService.getDashboardStats(userId);
        break;

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }

    return json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Dashboard action error:', error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Action failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};
