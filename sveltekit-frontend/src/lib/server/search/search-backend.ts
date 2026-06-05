export interface SearchBackendRequest {
  embedding: number[];
  limit?: number;
  topoClass?: string;
  collection?: string;
}

export interface SearchBackend<TResult> {
  readonly name: string;
  search(request: SearchBackendRequest): Promise<TResult[]>;
}
