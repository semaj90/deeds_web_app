/**
 * CouchDB Client for ACE Graph Analysis
 *
 * Databases:
 * - codebase_graph: AST trees, file dependencies
 * - error_clusters: Cluster summaries from CUDA
 * - error_graph: Error relationship DAG
 * - llm_summaries: LLM-generated content summaries
 */

const COUCHDB_URL = process.env.COUCHDB_URL || 'http://localhost:5984';
const COUCHDB_USER = process.env.COUCHDB_USER || 'admin';
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD || 'password';

interface CouchDBResponse {
  ok?: boolean;
  id?: string;
  rev?: string;
  error?: string;
  reason?: string;
}

interface CouchDBDoc {
  _id?: string;
  _rev?: string;
  [key: string]: unknown;
}

interface ViewResult<T> {
  total_rows: number; offset: number;
  rows: Array<{ id: string;
    key: unknown; value: T;
    doc?: T;
  }>;
}

class CouchDBClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(url?: string, user?: string, password?: string) {
    this.baseUrl = url || COUCHDB_URL;
    const auth = Buffer.from(`${user || COUCHDB_USER}:${password || COUCHDB_PASSWORD}`).toString('base64');
    this.authHeader = `Basic ${auth}`;
  }

  private async request<T = CouchDBResponse>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${ path }`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.authHeader,
        ...options.headers
      }
    });

    const data = await response.json() as T;

    if (!response.ok && (data as any).error) {
      throw new Error(`CouchDB error: ${(data as any).error} - ${(data as any).reason}`);
    }

    return data;
  }

  /**
   * List all databases
   */
  async listDatabases(): Promise<string[]> {
    return this.request<string[]>('/_all_dbs');
  }

  /**
   * Create database if not exists
   */
  async createDatabase(name: string): Promise<boolean> {
    try {
      await this.request(`/${ name }`, { method: 'PUT' });
      return true;
    } catch (error: any) {
      if (error.message.includes('file_exists')) {
        return false; // Already exists
      }
      throw error;
    }
  }

  /**
   * Get document by ID
   */
  async get<T extends CouchDBDoc>(database: string, docId: string): Promise<T | null> {
    try {
      return await this.request<T>(`/${ database }/${encodeURIComponent(docId)}`);
    } catch {
      return null;
    }
  }

  /**
   * Create or update document
   */
  async put<T extends CouchDBDoc>(database: string, doc: T): Promise<CouchDBResponse> {
    const docId = doc._id || crypto.randomUUID();
    return this.request(`/${ database }/${encodeURIComponent(docId)}`, {
      method: 'PUT',
      body: JSON.stringify({ ...doc, _id: docId })
    });
  }

  /**
   * Bulk insert documents
   */
  async bulkDocs<T extends CouchDBDoc>(database: string, docs: T[]): Promise<CouchDBResponse[]> {
    return this.request<CouchDBResponse[]>(`/${ database }/_bulk_docs`, {
      method: 'POST',
      body: JSON.stringify({ docs })
    });
  }

  /**
   * Delete document
   */
  async delete(database: string, docId: string, rev: string): Promise<CouchDBResponse> {
    return this.request(`/${database}/${encodeURIComponent(docId)}?rev=${ rev }`, {
      method: 'DELETE'
    });
  }

  /**
   * Query a view
   */
  async queryView<T>(
    database: string,
    designDoc: string,
    viewName: string,
    options: {
      key?: unknown;
      startkey?: unknown;
      endkey?: unknown;
      limit?: number;
      skip?: number;
      include_docs?: boolean;
      reduce?: boolean;
      group?: boolean;
      group_level?: number;
    } = {}
  ): Promise<ViewResult<T>> {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<ViewResult<T>>(`/${database}/_design/${designDoc}/_view/${ viewName }${query}`);
  }

  /**
   * Create or update a design document
   */
  async putDesignDoc(
    database: string,
    designName: string,
    views: Record<string, { map: string; reduce?: string }>
  ): Promise<CouchDBResponse> {
    const designDoc = {
      _id: `_design/${ designName }`,
      views
    };

    // Get existing to preserve _rev
    const existing = await this.get(database, `_design/${designName}`);
    if (existing) {
      (designDoc as any)._rev = existing._rev;
    }

    return this.request(`/${database}/_design/${designName}`, {
      method: 'PUT',
      body: JSON.stringify(designDoc)
    });
  }

  /**
   * Search with Mango query
   */
  async find<T>(
    database: string,
    selector: Record<string, unknown>,
    options: {
      limit?: number;
      fields?: string[];
      sort?: Array<Record<string, 'asc' | 'desc'>>;
    } = {}
  ): Promise<{ docs: T[] }> {
    return this.request<{ docs: T[] }>(`/${database}/_find`, {
      method: 'POST',
      body: JSON.stringify({
        selector,
        ...options
      })
    });
  }

  /**
   * Get database info
   */
  async info(database: string): Promise<{ db_name: string;
    doc_count: number; doc_del_count: number;
    update_seq: string; disk_size: number;
  }> {
    return this.request(`/${database}`);
  }
}

// Singleton instance
export const couchdb = new CouchDBClient();

// Convenience functions for ACE databases
export const aceGraphs = {
  async storeASTNode(node: { file_path: string;
    language: string; node_type: string;
    name: string;
    children?: unknown[];
    imports?: string[];
    exports?: string[];
    errors?: { line: number; code: string; message: string }[];
  }) {
    const doc = {
      _id: `ast_${Buffer.from(node.file_path).toString('base64').slice(0, 20)}_${node.name}`,
      type: 'ast_node',
      ...node,
      indexed_at: new Date().toISOString()
    };
    return couchdb.put('codebase_graph', doc);
  },

  async storeFileGraph(graph: { file_path: string;
    imports: string[]; exports: string[];
    dependencies: string[];
  }) {
    const doc = {
      _id: `file_${Buffer.from(graph.file_path).toString('base64').slice(0, 30)}`,
      type: 'file_graph',
      ...graph,
      indexed_at: new Date().toISOString()
    };
    return couchdb.put('codebase_graph', doc);
  },

  async storeCluster(cluster: { cluster_id: number;
    collection: string; size: number;
    centroid_id: string; summary: string;
    tags: string[]; sample_ids: string[];
  }) {
    const doc = {
      _id: `cluster_${cluster.collection}_${cluster.cluster_id}`,
      type: 'cluster',
      ...cluster,
      created_at: new Date().toISOString()
    };
    return couchdb.put('error_clusters', doc);
  },

  async storeErrorRelation(relation: { source_error: string;
    target_error: string; relation_type: 'caused_by' | 'similar_to' | 'fixed_by' | 'blocks';
    confidence: number;
    evidence?: string[];
  }) {
    const doc = {
      _id: `rel_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      type: 'error_relation',
      ...relation,
      created_at: new Date().toISOString()
    };
    return couchdb.put('error_graph', doc);
  }
};

export const aceLLM = {
  async storeSummary(summary: { source_type: 'cluster' | 'file' | 'component' | 'error_pattern';
    source_id: string; model: string;
    summary_text: string; tags: string[];
    confidence: number;
  }) {
    const doc = {
      _id: `summary_${summary.source_type}_${summary.source_id}`,
      type: 'llm_summary',
      ...summary,
      created_at: new Date().toISOString()
    };
    return couchdb.put('llm_summaries', doc);
  },

  async getSummary(sourceType: string, sourceId: string) {
    return couchdb.get('llm_summaries', `summary_${sourceType}_${sourceId}`);
  }
};

export { CouchDBClient };



