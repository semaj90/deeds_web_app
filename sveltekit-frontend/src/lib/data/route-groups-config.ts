import type { User } from '$lib/types';
import type { Case } from '$lib/types';

/**
 * Route Groups Configuration for Phase 2 Consolidation
 * Organized route structure with proper categorization and theming
 */
export interface RouteGroupDefinition {
  id: string;
  label: string;
  path: string;
  icon: string;
  description: string;
  theme: 'matrix' | 'cyberpunk' | 'amber' | 'retro';
  routes: RouteDefinition[];
}

export interface RouteDefinition {
  id: string;
  label: string;
  route: string;
  icon: string;
  description: string;
  status: 'active' | 'beta' | 'experimental' | 'deprecated';
  tags: string[];
}

// New consolidated route groups
export const routeGroups: RouteGroupDefinition[] = [
  {
    id: 'legal',
    label: 'Legal Operations',
    path: '/(legal)',
    icon: '⚖️',
    description: 'Case management, evidence analysis, and legal research',
    theme: 'matrix',
    routes: [
      { id: 'legal-cases', label: 'Cases', route: '/cases', icon: '📂', description: 'Legal case management with AI analysis', status: 'active', tags: ['legal', 'cases', 'management'] },
      { id: 'legal-evidence', label: 'Evidence', route: '/evidence', icon: '🔍', description: 'Digital evidence processing and analysis', status: 'active', tags: ['evidence', 'analysis', 'forensics'] },
      { id: 'legal-documents', label: 'Documents', route: '/documents', icon: '📄', description: 'Legal document management and processing', status: 'active', tags: ['documents', 'legal', 'processing'] },
      { id: 'legal-detective', label: 'Detective', route: '/detective', icon: '🔎', description: 'Advanced investigative analysis tools', status: 'active', tags: ['detective', 'investigation', 'analysis'] },
      { id: 'legal-research', label: 'Legal Research', route: '/research', icon: '📚', description: 'Legal precedent and statute research', status: 'active', tags: ['research', 'precedent', 'law'] },
      { id: 'legal-citations', label: 'Citations', route: '/citations', icon: '📑', description: 'Legal citation management and validation', status: 'active', tags: ['citations', 'bluebook', 'references'] },
      { id: 'legal-laws', label: 'Laws & Statutes', route: '/laws', icon: '⚖️', description: 'Statute lookup and legal precedent search', status: 'active', tags: ['statutes', 'laws', 'jurisdiction'] },
      { id: 'legal-evidence-board', label: 'Evidence Board', route: '/(legal)/evidence-board', icon: '📍', description: 'Visual evidence organization and analysis', status: 'active', tags: ['evidence', 'canvas', 'visualization'] },
      { id: 'legal-persons-of-interest', label: 'Persons of Interest', route: '/(legal)/persons-of-interest', icon: '👤', description: 'Person tracking and profile management', status: 'active', tags: ['poi', 'profiles', 'tracking'] }
    ]
  },
  {
    id: 'ai',
    label: 'AI Assistant',
    path: '/(ai)',
    icon: '🤖',
    description: 'AI-powered analysis, chat, and GPU acceleration',
    theme: 'cyberpunk',
    routes: [
      { id: 'ai-assistant', label: 'Assistant', route: '/(ai)/assistant', icon: '💬', description: 'AI-powered legal assistant chat interface', status: 'active', tags: ['ai', 'chat', 'assistant'] },
      { id: 'ai-analysis', label: 'Analysis', route: '/(ai)/analysis', icon: '🧠', description: 'Advanced AI document and case analysis', status: 'active', tags: ['ai', 'analysis', 'intelligence'] },
      { id: 'ai-cuda', label: 'CUDA Streaming', route: '/(ai)/cuda-streaming', icon: '⚡', description: 'GPU-accelerated AI processing', status: 'active', tags: ['cuda', 'gpu', 'streaming'] },
      { id: 'ai-rag', label: 'RAG System', route: '/(ai)/rag', icon: '🎯', description: 'Retrieval Augmented Generation system', status: 'active', tags: ['rag', 'retrieval', 'generation'] },
      { id: 'ai-embeddings', label: 'Embeddings', route: '/(ai)/embeddings', icon: '🌐', description: 'Vector embeddings and similarity search', status: 'active', tags: ['embeddings', 'vectors', 'search'] },
      { id: 'ai-search', label: 'Search', route: '/(ai)/search', icon: '🔍', description: 'Semantic and hybrid search capabilities', status: 'active', tags: ['search', 'semantic', 'hybrid'] },
      { id: 'ai-vector-search', label: 'Vector Search', route: '/(ai)/vector-search', icon: '🎯', description: 'Advanced vector similarity search', status: 'active', tags: ['vector', 'similarity', 'pgvector'] },
      { id: 'ai-recommendations', label: 'Recommendations', route: '/(ai)/recommendations', icon: '💡', description: 'AI-powered case recommendations', status: 'active', tags: ['recommendations', 'ml', 'scoring'] }
    ]
  },
  {
    id: 'admin',
    label: 'Administration',
    path: '/(admin)',
    icon: '🛠️',
    description: 'System administration and monitoring',
    theme: 'amber',
    routes: [
      { id: 'admin-dashboard', label: 'Dashboard', route: '/(admin)/dashboard', icon: '📊', description: 'System overview and metrics dashboard', status: 'active', tags: ['dashboard', 'metrics', 'overview'] },
      { id: 'admin-health', label: 'System Health', route: '/(admin)/health', icon: '💚', description: 'System health monitoring and diagnostics', status: 'active', tags: ['health', 'monitoring', 'diagnostics'] },
      { id: 'admin-users', label: 'User Management', route: '/(admin)/users', icon: '👥', description: 'User accounts and permissions management', status: 'active', tags: ['users', 'permissions', 'management'] },
      { id: 'admin-performance', label: 'Performance', route: '/(admin)/performance', icon: '⚡', description: 'Performance monitoring and optimization', status: 'active', tags: ['performance', 'optimization', 'monitoring'] },
      { id: 'admin-redis', label: 'Redis Monitor', route: '/(admin)/redis', icon: '🔴', description: 'Redis cache monitoring and management', status: 'active', tags: ['redis', 'cache', 'monitoring'] },
      { id: 'admin-user-analytics', label: 'User Analytics', route: '/(admin)/user-analytics', icon: '📈', description: 'User behavior and query analytics', status: 'active', tags: ['analytics', 'users', 'metrics'] }
    ]
  },
  {
    id: 'core',
    label: 'Core Features',
    path: '/(core)',
    icon: '👤',
    description: 'Authentication, user profile, and system features',
    theme: 'amber',
    routes: [
      { id: 'core-auth', label: 'Authentication', route: '/auth/login', icon: '🔒', description: 'User login and authentication', status: 'active', tags: ['auth', 'login', 'security'] },
      { id: 'core-register', label: 'Register', route: '/auth/register', icon: '📝', description: 'New user registration', status: 'active', tags: ['auth', 'register', 'signup'] },
      { id: 'core-profile', label: 'User Profile', route: '/profile', icon: '👤', description: 'User profile and account management', status: 'active', tags: ['profile', 'user', 'account'] },
      { id: 'core-reports', label: 'Reports', route: '/reports', icon: '📊', description: 'System reports and analytics', status: 'active', tags: ['reports', 'analytics', 'data'] },
      { id: 'core-settings', label: 'Settings', route: '/settings', icon: '⚙️', description: 'Application settings and preferences', status: 'active', tags: ['settings', 'preferences', 'config'] }
    ]
  },
  {
    id: 'dev',
    label: 'Development',
    path: '/(dev)',
    icon: '🛠️',
    description: 'Development tools, testing, and debugging',
    theme: 'retro',
    routes: [
      { id: 'dev-tests', label: 'Testing Suite', route: '/(dev)/tests', icon: '🧪', description: 'Automated testing and validation tools', status: 'active', tags: ['testing', 'validation', 'qa'] },
      { id: 'dev-examples', label: 'Examples', route: '/(dev)/examples', icon: '📚', description: 'Code examples and demonstrations', status: 'active', tags: ['examples', 'demo', 'education'] },
      { id: 'dev-showcase', label: 'Showcase', route: '/(dev)/showcase', icon: '✨', description: 'Feature showcase and component gallery', status: 'active', tags: ['showcase', 'components', 'gallery'] },
      { id: 'dev-metrics', label: 'Dev Metrics', route: '/(dev)/metrics', icon: '📈', description: 'Development and build metrics', status: 'active', tags: ['metrics', 'development', 'build'] },
      { id: 'dev-gpu', label: 'GPU Diagnostics', route: '/(dev)/gpu-diagnostics', icon: '🎮', description: 'GPU and WebGPU diagnostic tools', status: 'beta', tags: ['gpu', 'webgpu', 'diagnostics'] },
      { id: 'dev-cuda', label: 'CUDA Streaming', route: '/cuda-streaming', icon: '⚡', description: 'CUDA GPU acceleration demos', status: 'active', tags: ['cuda', 'gpu', 'streaming'] },
      { id: 'dev-webasm', label: 'WebAssembly Demos', route: '/webasm-demos', icon: '🔧', description: 'WebAssembly and WASM integration examples', status: 'active', tags: ['webassembly', 'wasm', 'performance'] },
      { id: 'dev-nes-bits', label: 'NES Bits Demo', route: '/demo/enhanced-bits-showcase', icon: '🎮', description: 'Nintendo-style UI components and demos', status: 'active', tags: ['nes', 'retro', 'ui-components'] },
      { id: 'dev-shader-cache', label: 'Shader Cache', route: '/shader-cache', icon: '🎨', description: 'WebGPU shader caching and optimization', status: 'beta', tags: ['webgpu', 'shaders', 'cache'] }
    ]
  }
];

// Legacy routes that need migration
export const legacyRouteMapping: Record<string, string> = {
  '/aiassistant': '/(ai)/assistant',
  '/ai-assistant': '/(ai)/assistant',
  '/ai-chat': '/(ai)/assistant',
  '/ai-chat-simple': '/(ai)/assistant',
  '/gpu-chat': '/(ai)/assistant',
  '/cuda-streaming': '/(ai)/cuda-streaming',
  '/evidence-analysis': '/evidence',
  '/evidence-workspace': '/evidence',
  '/documents': '/(legal)/documents',
  '/detective': '/(legal)/detective',
  '/detectivemode': '/(legal)/detective',
  '/investigation': '/(legal)/detective',
  '/citations': '/(legal)/citations',
  '/laws': '/(legal)/laws',
  '/evidenceboard': '/evidence',
  '/evidence-board': '/evidence',
  '/yorha': '/',
  '/yorha-home': '/',
  '/yorha-command-center': '/',
  '/admin/gpu-demo': '/admin/gpu-evidence-graph',
  '/poi': '/(legal)/persons-of-interest',
  '/analysis': '/(ai)/analysis',
  '/search': '/(ai)/search',
  '/vector-search': '/(ai)/vector-search',
  '/recommendations': '/(ai)/recommendations',
  '/didyoumean': '/(ai)/recommendations',
  '/useranalytics': '/(admin)/user-analytics',
  '/admin': '/(admin)/dashboard',
  '/metrics': '/(admin)/performance',
  '/system': '/(admin)/health',
  '/system-dashboard': '/(admin)/system-dashboard',
  '/dev': '/(dev)/examples',
  '/examples': '/(dev)/examples',
  '/showcase': '/(dev)/showcase',
  '/test-simple': '/(dev)/tests',
  '/simple-test': '/(dev)/tests',
  '/login': '/auth/login',
  '/register': '/auth/register',
  '/shader-cache': '/shader-cache',
  '/webasm': '/webasm-demos',
  '/nes-bits': '/demo/enhanced-bits-showcase',
  '/chat': '/(ai)/assistant'
};

// Get route group by theme
export function getRouteGroupByTheme(theme: string) {
  return routeGroups.find(group => group.theme === theme);
}

// Get all routes flattened
export function getAllRoutes(): RouteDefinition[] {
  return routeGroups.flatMap(group => group.routes);
}

// Get route by ID
export function getRouteById(id: string): RouteDefinition | undefined {
  return getAllRoutes().find(route => route.id === id);
}

// Get route group containing a specific route (by parsing routeId)
export function getRouteGroup(routeId: string): RouteGroupDefinition | undefined {
  return routeGroups.find(group => group.routes.some(route => route.id === routeId));
}
