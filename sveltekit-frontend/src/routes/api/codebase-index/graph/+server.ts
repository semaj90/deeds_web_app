/**
 * ═══════════════════════════════════════════════════════════════════════
 * Codebase Dependency Graph API
 * ═══════════════════════════════════════════════════════════════════════
 * Task: 13.2: 16.2 - Route graph visualization + FastAPI integration
 * Endpoint: GET /api/codebase-index/graph
 * Purpose: Fetch dependency graph nodes and edges for visualization
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

interface GraphNode { id: string, label: string;
  type: 'route' | 'component' | 'store' | 'service' | 'api' | 'util';
  errorCount: number, filePath: string;
  cluster?: string;
  imports?: string[];
  exports?: string[];
  functions?: string[];
}

interface GraphEdge { source: string, target:string;
  type: 'import' | 'export' | 'dependency';
}

export const GET: RequestHandler = async ({ url, fetch }) => {
  try {
    // Try to fetch from FastAPI backend (Task 16.2 integration)
    const backendUrl = env?.FASTAPI_URL|| env?.CODEBASE_INDEXER_URL ?? 'http://localhost:8090';

    try {
      // Try FastAPI admin routes first (Task 16.2)
      const response = await fetch(`${backendUrl}/api/codebase/graph`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        return json(data);
      }
    } catch (backendError) {
      console.warn('FastAPI backend not available, using mock data:', backendError);
    }

    // Return mock data for development/demo
// Routes
      {
        id: 'route-home',
        label: '+page.svelte',
        type: 'route',
        errorCount: 2,
        filePath: 'src/routes/+page.svelte',
        cluster: 'routes-main',
        imports: ['$lib/components/ui', '$lib/stores/user'],
        exports: [],
        functions: ['load']
      },
      {
        id: 'route-dashboard',
        label: 'dashboard/+page.svelte',
        type: 'route',
        errorCount: 0,
        filePath: 'src/routes/(app)/dashboard/+page.svelte',
        cluster: 'routes-app',
        imports: ['$lib/components/evidence', '$lib/stores/case'],
        exports: [],
        functions: ['load', 'actions']
      },
      {
        id: 'route-command-center',
        label: 'command-center/+page.svelte',
        type: 'route',
        errorCount: 1,
        filePath: 'src/routes/(app)/command-center/+page.svelte',
        cluster: 'routes-admin',
        imports: ['$lib/components/admin', '$lib/services/api'],
        exports: [],
        functions: ['load']
      },
      // Components
      {
        id: 'comp-button',
        label: 'Button.svelte',
        type: 'component',
        errorCount: 0,
        filePath: 'src/lib/components/ui/button/Button.svelte',
        cluster: 'ui-primitives',
        imports: ['bits-ui'],
        exports: ['Button'],
        functions: []
      },
      {
        id: 'comp-card',
        label: 'Card.svelte',
        type: 'component',
        errorCount: 3,
        filePath: 'src/lib/components/ui/card/Card.svelte',
        cluster: 'ui-primitives',
        imports: [],
        exports: ['Card', 'CardHeader', 'CardContent'],
        functions: []
      },
      {
        id: 'comp-evidence-board',
        label: 'EvidenceBoard.svelte',
        type: 'component',
        errorCount: 5,
        filePath: 'src/lib/components/evidence/EvidenceBoard.svelte',
        cluster: 'evidence',
        imports: ['$lib/stores/evidence', '$lib/services/api', 'd3'],
        exports: ['EvidenceBoard'],
        functions: ['initCanvas', 'handleDrag', 'updateConnections']
      },
      {
        id: 'comp-evidence-node',
        label: 'EvidenceNode.svelte',
        type: 'component',
        errorCount: 2,
        filePath: 'src/lib/components/evidence/EvidenceNode.svelte',
        cluster: 'evidence',
        imports: ['$lib/types/evidence'],
        exports: ['EvidenceNode'],
        functions: ['handleClick', 'handleHover']
      },
      // Stores
      {
        id: 'store-user',
        label: 'user.ts',
        type: 'store',
        errorCount: 1,
        filePath: 'src/lib/stores/user.ts',
        cluster: 'stores',
        imports: ['svelte/store'],
        exports: ['userStore', 'isAuthenticated'],
        functions: ['login', 'logout', 'updateProfile']
      },
      {
        id: 'store-case',
        label: 'case.ts',
        type: 'store',
        errorCount: 0,
        filePath: 'src/lib/stores/case.ts',
        cluster: 'stores',
        imports: ['svelte/store', '$lib/types/case'],
        exports: ['caseStore', 'currentCase'],
        functions: ['loadCase', 'updateCase', 'deleteCase']
      },
      {
        id: 'store-evidence',
        label: 'evidence.ts',
        type: 'store',
        errorCount: 4,
        filePath: 'src/lib/stores/evidence.ts',
        cluster: 'stores',
        imports: ['svelte/store', '$lib/types/evidence'],
        exports: ['evidenceStore', 'selectedEvidence'],
        functions: ['addEvidence', 'removeEvidence', 'updateConnections']
      },
      // Services
      {
        id: 'service-api',
        label: 'api.ts',
        type: 'service',
        errorCount: 2,
        filePath: 'src/lib/services/api.ts',
        cluster: 'services',
        imports: ['$env/static/public'],
        exports: ['apiClient', 'fetchWithAuth'],
        functions: ['get', 'post', 'put', 'delete', 'handleError']
      },
      {
        id: 'service-search',
        label: 'search.ts',
        type: 'service',
        errorCount: 0,
        filePath: 'src/lib/services/search.ts',
        cluster: 'services',
        imports: ['$lib/services/api', '$lib/types/search'],
        exports: ['searchService'],
        functions: ['semanticSearch', 'vectorSearch', 'rerank']
      },
      // API endpoints
      {
        id: 'api-auth',
        label: 'auth/+server.ts',
        type: 'api',
        errorCount: 1,
        filePath: 'src/routes/api/auth/+server.ts',
        cluster: 'api',
        imports: ['$lib/server/auth', 'lucia'],
        exports: [],
        functions: ['GET', 'POST']
      },
      {
        id: 'api-evidence',
        label: 'evidence/+server.ts',
        type: 'api',
        errorCount: 3,
        filePath: 'src/routes/api/evidence/+server.ts',
        cluster: 'api',
        imports: ['$lib/server/db', '$lib/types/evidence'],
        exports: [],
        functions: ['GET', 'POST', 'PUT', 'DELETE']
      },
      // Utils
      {
        id: 'util-format',
        label: 'format.ts',
        type: 'util',
        errorCount: 0,
        filePath: 'src/lib/utils/format.ts',
        cluster: 'utils',
        imports: [],
        exports: ['formatDate', 'formatCurrency', 'truncate'],
        functions: ['formatDate', 'formatCurrency', 'truncate']
      }
    ];
// Route imports
      { source: 'route-home', target: 'comp-button', type: 'import' },
      { source: 'route-home', target: 'store-user', type: 'import' },
      { source: 'route-dashboard', target: 'comp-evidence-board', type: 'import' },
      { source: 'route-dashboard', target: 'store-case', type: 'import' },
      { source: 'route-command-center', target: 'service-api', type: 'import' },

      // Component dependencies
      { source: 'comp-evidence-board', target: 'comp-evidence-node', type: 'import' },
      { source: 'comp-evidence-board', target: 'store-evidence', type: 'import' },
      { source: 'comp-evidence-board', target: 'service-api', type: 'import' },
      { source: 'comp-evidence-node', target: 'comp-card', type: 'import' },

      // Store dependencies
      { source: 'store-evidence', target: 'service-api', type: 'import' },
      { source: 'store-case', target: 'service-api', type: 'import' },

      // Service dependencies
      { source: 'service-search', target: 'service-api', type: 'import' },

      // API dependencies
      { source: 'api-evidence', target: 'store-evidence', type: 'dependency' },
      { source: 'api-auth', target: 'store-user', type: 'dependency' },

      // Util usage
      { source: 'comp-evidence-node', target: 'util-format', type: 'import' },
      { source: 'service-api', target: 'util-format', type: 'import' }
    ];

    return json({
      nodes: mockNodes,
      edges: mockEdges,
      metadata: {, totalNodes: mockNodes.length,
        totalEdges: mockEdges.length,
        nodesWithErrors: mockNodes.filter(n => n.errorCount > 0).length,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching graph data:', error);
    return json(
      { error: 'Failed to fetch graph data', nodes: [], edges: [] },
      { status: 500 }
    );
  }
};




