export interface RetrievalLogEntry {
  trace_id?: string;
  packet_key?: string;
  feature_id?: string;
  source_ref?: string;
  cache_namespace?: string;
  cache_hit_source?: string;
  retrieval_path?: string[];
  verdict?: string;
  [key: string]: unknown;
}

export interface LogQueryOptions {
  trace_id?: string;
  packet_key?: string;
}

export class AceRetrievalLogger {
  private readonly entries: RetrievalLogEntry[] = [];

  record(entry: RetrievalLogEntry): void {
    this.entries.push(entry);
  }

  query(options: LogQueryOptions = {}): RetrievalLogEntry[] {
    return this.entries.filter((entry) => {
      if (options.trace_id && entry.trace_id !== options.trace_id) return false;
      if (options.packet_key && entry.packet_key !== options.packet_key) return false;
      return true;
    });
  }
}

export function createAceRetrievalLogger(): AceRetrievalLogger {
  return new AceRetrievalLogger();
}
