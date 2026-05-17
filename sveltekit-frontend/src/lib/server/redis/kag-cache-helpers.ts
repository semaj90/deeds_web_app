export const kagCacheKeys = {
    /** 1. exact answer cache */
    ragExact: (queryHash: string) => `rag:exact:${queryHash}`,
    
    /** 2. prior-answer semantic cache via entities */
    ragEntity: (entityFingerprint: string) => `rag:entity:${entityFingerprint}`,
    
    /** 2. prior-answer semantic cache via tags */
    ragTags: (tagFingerprint: string) => `rag:tags:${tagFingerprint}`,
    
    /** 3. centroid-level retrieval cache */
    ragCentroid: (centroidClusterId: string, queryHash: string) => `rag:centroid:${centroidClusterId}:${queryHash}`,
    
    /** DAG run state */
    kagDagRun: (runId: string) => `kag:dag:${runId}`,
    
    /** DAG node state */
    kagDagNode: (runId: string, nodeKey: string) => `kag:node:${runId}:${nodeKey}`,
    
    /** 4. summary cache */
    summary: (stableKey: string, sourceHash: string) => `summary:${stableKey}:${sourceHash}`,
    
    /** 5. LLMS.md directory cache */
    agentsDir: (directoryPath: string) => `agents:dir:${directoryPath}`
};
