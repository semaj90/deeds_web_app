/**
 * ACE Tool Handlers - Index
 *
 * Import all handlers to register them with the tool registry
 */

// Import handlers to trigger registration
import './scanRepo.js';
import './kbSearch.js';
import './clusterTag.js';
import './chunkEmbed.js';
import './langextractBatch.js';
import './crawlDocs.js';

// Re-export registry
export { toolRegistry as getToolDefinitions } from '../registry.js';

// Re-export types
export type {
  ScanRepoRequest, LangExtractBatchRequest, ClusterTagRequest, KBSearchRequest,
  ChunkEmbedRequest, CrawlDocsRequest,
  ToolResult, ScanRepoResult,
  LangExtractResult, ClusterTagResult,
  KBSearchResult, ToolPermission
} from '../registry.js';



