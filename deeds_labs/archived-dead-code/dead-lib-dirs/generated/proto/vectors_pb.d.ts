import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace cyber_elephant. */
export namespace cyber_elephant {

    /** Properties of a DocumentVector. */
    interface IDocumentVector {

        /** DocumentVector id */
        id?: (string|null);

        /** DocumentVector title */
        title?: (string|null);

        /** DocumentVector contentSnippet */
        contentSnippet?: (string|null);

        /** DocumentVector embedding */
        embedding?: (number[]|null);

        /** DocumentVector projected_3d */
        projected_3d?: (cyber_elephant.IProjectedPoint|null);

        /** DocumentVector documentType */
        documentType?: (string|null);

        /** DocumentVector metadata */
        metadata?: ({ [k: string]: string }|null);
    }

    /** Represents a DocumentVector. */
    class DocumentVector implements IDocumentVector {

        /**
         * Constructs a new DocumentVector.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IDocumentVector);

        /** DocumentVector id. */
        public id: string;

        /** DocumentVector title. */
        public title: string;

        /** DocumentVector contentSnippet. */
        public contentSnippet: string;

        /** DocumentVector embedding. */
        public embedding: number[];

        /** DocumentVector projected_3d. */
        public projected_3d?: (cyber_elephant.IProjectedPoint|null);

        /** DocumentVector documentType. */
        public documentType: string;

        /** DocumentVector metadata. */
        public metadata: { [k: string]: string };

        /**
         * Encodes the specified DocumentVector message. Does not implicitly {@link cyber_elephant.DocumentVector.verify|verify} messages.
         * @param message DocumentVector message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IDocumentVector, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified DocumentVector message, length delimited. Does not implicitly {@link cyber_elephant.DocumentVector.verify|verify} messages.
         * @param message DocumentVector message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IDocumentVector, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a DocumentVector message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns DocumentVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.DocumentVector;

        /**
         * Decodes a DocumentVector message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns DocumentVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.DocumentVector;

        /**
         * Gets the default type url for DocumentVector
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a ProjectedPoint. */
    interface IProjectedPoint {

        /** ProjectedPoint x */
        x?: (number|null);

        /** ProjectedPoint y */
        y?: (number|null);

        /** ProjectedPoint z */
        z?: (number|null);

        /** ProjectedPoint confidence */
        confidence?: (number|null);
    }

    /** Represents a ProjectedPoint. */
    class ProjectedPoint implements IProjectedPoint {

        /**
         * Constructs a new ProjectedPoint.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IProjectedPoint);

        /** ProjectedPoint x. */
        public x: number;

        /** ProjectedPoint y. */
        public y: number;

        /** ProjectedPoint z. */
        public z: number;

        /** ProjectedPoint confidence. */
        public confidence: number;

        /**
         * Encodes the specified ProjectedPoint message. Does not implicitly {@link cyber_elephant.ProjectedPoint.verify|verify} messages.
         * @param message ProjectedPoint message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IProjectedPoint, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ProjectedPoint message, length delimited. Does not implicitly {@link cyber_elephant.ProjectedPoint.verify|verify} messages.
         * @param message ProjectedPoint message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IProjectedPoint, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ProjectedPoint message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ProjectedPoint
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.ProjectedPoint;

        /**
         * Decodes a ProjectedPoint message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns ProjectedPoint
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.ProjectedPoint;

        /**
         * Gets the default type url for ProjectedPoint
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a DocumentCluster. */
    interface IDocumentCluster {

        /** DocumentCluster id */
        id?: (string|null);

        /** DocumentCluster name */
        name?: (string|null);

        /** DocumentCluster centroid */
        centroid?: (cyber_elephant.IProjectedPoint|null);

        /** DocumentCluster documentIds */
        documentIds?: (string[]|null);

        /** DocumentCluster density */
        density?: (number|null);

        /** DocumentCluster clusterType */
        clusterType?: (string|null);
    }

    /** Represents a DocumentCluster. */
    class DocumentCluster implements IDocumentCluster {

        /**
         * Constructs a new DocumentCluster.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IDocumentCluster);

        /** DocumentCluster id. */
        public id: string;

        /** DocumentCluster name. */
        public name: string;

        /** DocumentCluster centroid. */
        public centroid?: (cyber_elephant.IProjectedPoint|null);

        /** DocumentCluster documentIds. */
        public documentIds: string[];

        /** DocumentCluster density. */
        public density: number;

        /** DocumentCluster clusterType. */
        public clusterType: string;

        /**
         * Encodes the specified DocumentCluster message. Does not implicitly {@link cyber_elephant.DocumentCluster.verify|verify} messages.
         * @param message DocumentCluster message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IDocumentCluster, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified DocumentCluster message, length delimited. Does not implicitly {@link cyber_elephant.DocumentCluster.verify|verify} messages.
         * @param message DocumentCluster message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IDocumentCluster, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a DocumentCluster message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns DocumentCluster
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.DocumentCluster;

        /**
         * Decodes a DocumentCluster message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns DocumentCluster
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.DocumentCluster;

        /**
         * Gets the default type url for DocumentCluster
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a VectorQuery. */
    interface IVectorQuery {

        /** VectorQuery queryText */
        queryText?: (string|null);

        /** VectorQuery queryEmbedding */
        queryEmbedding?: (number[]|null);

        /** VectorQuery limit */
        limit?: (number|null);

        /** VectorQuery threshold */
        threshold?: (number|null);

        /** VectorQuery documentTypes */
        documentTypes?: (string[]|null);

        /** VectorQuery filters */
        filters?: ({ [k: string]: string }|null);
    }

    /** Represents a VectorQuery. */
    class VectorQuery implements IVectorQuery {

        /**
         * Constructs a new VectorQuery.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IVectorQuery);

        /** VectorQuery queryText. */
        public queryText: string;

        /** VectorQuery queryEmbedding. */
        public queryEmbedding: number[];

        /** VectorQuery limit. */
        public limit: number;

        /** VectorQuery threshold. */
        public threshold: number;

        /** VectorQuery documentTypes. */
        public documentTypes: string[];

        /** VectorQuery filters. */
        public filters: { [k: string]: string };

        /**
         * Encodes the specified VectorQuery message. Does not implicitly {@link cyber_elephant.VectorQuery.verify|verify} messages.
         * @param message VectorQuery message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IVectorQuery, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified VectorQuery message, length delimited. Does not implicitly {@link cyber_elephant.VectorQuery.verify|verify} messages.
         * @param message VectorQuery message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IVectorQuery, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a VectorQuery message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns VectorQuery
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.VectorQuery;

        /**
         * Decodes a VectorQuery message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns VectorQuery
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.VectorQuery;

        /**
         * Gets the default type url for VectorQuery
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a VectorSearchResponse. */
    interface IVectorSearchResponse {

        /** VectorSearchResponse documents */
        documents?: (cyber_elephant.IDocumentVector[]|null);

        /** VectorSearchResponse clusters */
        clusters?: (cyber_elephant.IDocumentCluster[]|null);

        /** VectorSearchResponse stats */
        stats?: (cyber_elephant.IQueryStatistics|null);

        /** VectorSearchResponse sessionId */
        sessionId?: (string|null);
    }

    /** Represents a VectorSearchResponse. */
    class VectorSearchResponse implements IVectorSearchResponse {

        /**
         * Constructs a new VectorSearchResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IVectorSearchResponse);

        /** VectorSearchResponse documents. */
        public documents: cyber_elephant.IDocumentVector[];

        /** VectorSearchResponse clusters. */
        public clusters: cyber_elephant.IDocumentCluster[];

        /** VectorSearchResponse stats. */
        public stats?: (cyber_elephant.IQueryStatistics|null);

        /** VectorSearchResponse sessionId. */
        public sessionId: string;

        /**
         * Encodes the specified VectorSearchResponse message. Does not implicitly {@link cyber_elephant.VectorSearchResponse.verify|verify} messages.
         * @param message VectorSearchResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IVectorSearchResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified VectorSearchResponse message, length delimited. Does not implicitly {@link cyber_elephant.VectorSearchResponse.verify|verify} messages.
         * @param message VectorSearchResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IVectorSearchResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a VectorSearchResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns VectorSearchResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.VectorSearchResponse;

        /**
         * Decodes a VectorSearchResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns VectorSearchResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.VectorSearchResponse;

        /**
         * Gets the default type url for VectorSearchResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a QueryStatistics. */
    interface IQueryStatistics {

        /** QueryStatistics totalDocuments */
        totalDocuments?: (number|null);

        /** QueryStatistics processedDocuments */
        processedDocuments?: (number|null);

        /** QueryStatistics processingTimeMs */
        processingTimeMs?: (number|null);

        /** QueryStatistics embeddingTimeMs */
        embeddingTimeMs?: (number|null);

        /** QueryStatistics searchTimeMs */
        searchTimeMs?: (number|null);

        /** QueryStatistics algorithmUsed */
        algorithmUsed?: (string|null);
    }

    /** Represents a QueryStatistics. */
    class QueryStatistics implements IQueryStatistics {

        /**
         * Constructs a new QueryStatistics.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IQueryStatistics);

        /** QueryStatistics totalDocuments. */
        public totalDocuments: number;

        /** QueryStatistics processedDocuments. */
        public processedDocuments: number;

        /** QueryStatistics processingTimeMs. */
        public processingTimeMs: number;

        /** QueryStatistics embeddingTimeMs. */
        public embeddingTimeMs: number;

        /** QueryStatistics searchTimeMs. */
        public searchTimeMs: number;

        /** QueryStatistics algorithmUsed. */
        public algorithmUsed: string;

        /**
         * Encodes the specified QueryStatistics message. Does not implicitly {@link cyber_elephant.QueryStatistics.verify|verify} messages.
         * @param message QueryStatistics message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IQueryStatistics, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified QueryStatistics message, length delimited. Does not implicitly {@link cyber_elephant.QueryStatistics.verify|verify} messages.
         * @param message QueryStatistics message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IQueryStatistics, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a QueryStatistics message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns QueryStatistics
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.QueryStatistics;

        /**
         * Decodes a QueryStatistics message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns QueryStatistics
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.QueryStatistics;

        /**
         * Gets the default type url for QueryStatistics
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a DocumentBatch. */
    interface IDocumentBatch {

        /** DocumentBatch documents */
        documents?: (cyber_elephant.IDocumentVector[]|null);

        /** DocumentBatch batchId */
        batchId?: (string|null);

        /** DocumentBatch options */
        options?: (cyber_elephant.IProcessingOptions|null);
    }

    /** Represents a DocumentBatch. */
    class DocumentBatch implements IDocumentBatch {

        /**
         * Constructs a new DocumentBatch.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IDocumentBatch);

        /** DocumentBatch documents. */
        public documents: cyber_elephant.IDocumentVector[];

        /** DocumentBatch batchId. */
        public batchId: string;

        /** DocumentBatch options. */
        public options?: (cyber_elephant.IProcessingOptions|null);

        /**
         * Encodes the specified DocumentBatch message. Does not implicitly {@link cyber_elephant.DocumentBatch.verify|verify} messages.
         * @param message DocumentBatch message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IDocumentBatch, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified DocumentBatch message, length delimited. Does not implicitly {@link cyber_elephant.DocumentBatch.verify|verify} messages.
         * @param message DocumentBatch message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IDocumentBatch, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a DocumentBatch message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns DocumentBatch
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.DocumentBatch;

        /**
         * Decodes a DocumentBatch message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns DocumentBatch
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.DocumentBatch;

        /**
         * Gets the default type url for DocumentBatch
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a ProcessingOptions. */
    interface IProcessingOptions {

        /** ProcessingOptions useGpuAcceleration */
        useGpuAcceleration?: (boolean|null);

        /** ProcessingOptions enableClustering */
        enableClustering?: (boolean|null);

        /** ProcessingOptions clusterThreshold */
        clusterThreshold?: (number|null);

        /** ProcessingOptions embeddingModel */
        embeddingModel?: (string|null);

        /** ProcessingOptions maxDimensions */
        maxDimensions?: (number|null);
    }

    /** Represents a ProcessingOptions. */
    class ProcessingOptions implements IProcessingOptions {

        /**
         * Constructs a new ProcessingOptions.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IProcessingOptions);

        /** ProcessingOptions useGpuAcceleration. */
        public useGpuAcceleration: boolean;

        /** ProcessingOptions enableClustering. */
        public enableClustering: boolean;

        /** ProcessingOptions clusterThreshold. */
        public clusterThreshold: number;

        /** ProcessingOptions embeddingModel. */
        public embeddingModel: string;

        /** ProcessingOptions maxDimensions. */
        public maxDimensions: number;

        /**
         * Encodes the specified ProcessingOptions message. Does not implicitly {@link cyber_elephant.ProcessingOptions.verify|verify} messages.
         * @param message ProcessingOptions message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IProcessingOptions, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ProcessingOptions message, length delimited. Does not implicitly {@link cyber_elephant.ProcessingOptions.verify|verify} messages.
         * @param message ProcessingOptions message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IProcessingOptions, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ProcessingOptions message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ProcessingOptions
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.ProcessingOptions;

        /**
         * Decodes a ProcessingOptions message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns ProcessingOptions
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.ProcessingOptions;

        /**
         * Gets the default type url for ProcessingOptions
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SystemStatus. */
    interface ISystemStatus {

        /** SystemStatus healthy */
        healthy?: (boolean|null);

        /** SystemStatus version */
        version?: (string|null);

        /** SystemStatus metrics */
        metrics?: (cyber_elephant.ISystemMetrics|null);

        /** SystemStatus availableModels */
        availableModels?: (string[]|null);

        /** SystemStatus gpuAvailable */
        gpuAvailable?: (boolean|null);
    }

    /** Represents a SystemStatus. */
    class SystemStatus implements ISystemStatus {

        /**
         * Constructs a new SystemStatus.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.ISystemStatus);

        /** SystemStatus healthy. */
        public healthy: boolean;

        /** SystemStatus version. */
        public version: string;

        /** SystemStatus metrics. */
        public metrics?: (cyber_elephant.ISystemMetrics|null);

        /** SystemStatus availableModels. */
        public availableModels: string[];

        /** SystemStatus gpuAvailable. */
        public gpuAvailable: boolean;

        /**
         * Encodes the specified SystemStatus message. Does not implicitly {@link cyber_elephant.SystemStatus.verify|verify} messages.
         * @param message SystemStatus message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.ISystemStatus, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SystemStatus message, length delimited. Does not implicitly {@link cyber_elephant.SystemStatus.verify|verify} messages.
         * @param message SystemStatus message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.ISystemStatus, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SystemStatus message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SystemStatus
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.SystemStatus;

        /**
         * Decodes a SystemStatus message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns SystemStatus
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.SystemStatus;

        /**
         * Gets the default type url for SystemStatus
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SystemMetrics. */
    interface ISystemMetrics {

        /** SystemMetrics totalDocuments */
        totalDocuments?: (number|null);

        /** SystemMetrics activeClusters */
        activeClusters?: (number|null);

        /** SystemMetrics avgQueryTimeMs */
        avgQueryTimeMs?: (number|null);

        /** SystemMetrics memoryUsageMb */
        memoryUsageMb?: (number|null);

        /** SystemMetrics cpuUsagePercent */
        cpuUsagePercent?: (number|null);

        /** SystemMetrics gpuUsagePercent */
        gpuUsagePercent?: (number|null);
    }

    /** Represents a SystemMetrics. */
    class SystemMetrics implements ISystemMetrics {

        /**
         * Constructs a new SystemMetrics.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.ISystemMetrics);

        /** SystemMetrics totalDocuments. */
        public totalDocuments: number;

        /** SystemMetrics activeClusters. */
        public activeClusters: number;

        /** SystemMetrics avgQueryTimeMs. */
        public avgQueryTimeMs: number;

        /** SystemMetrics memoryUsageMb. */
        public memoryUsageMb: number;

        /** SystemMetrics cpuUsagePercent. */
        public cpuUsagePercent: number;

        /** SystemMetrics gpuUsagePercent. */
        public gpuUsagePercent: number;

        /**
         * Encodes the specified SystemMetrics message. Does not implicitly {@link cyber_elephant.SystemMetrics.verify|verify} messages.
         * @param message SystemMetrics message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.ISystemMetrics, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SystemMetrics message, length delimited. Does not implicitly {@link cyber_elephant.SystemMetrics.verify|verify} messages.
         * @param message SystemMetrics message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.ISystemMetrics, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SystemMetrics message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SystemMetrics
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.SystemMetrics;

        /**
         * Decodes a SystemMetrics message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns SystemMetrics
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.SystemMetrics;

        /**
         * Gets the default type url for SystemMetrics
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Represents a CyberElephantService */
    class CyberElephantService extends $protobuf.rpc.Service {

        /**
         * Constructs a new CyberElephantService service.
         * @param rpcImpl RPC implementation
         * @param [requestDelimited=false] Whether requests are length-delimited
         * @param [responseDelimited=false] Whether responses are length-delimited
         */
        constructor(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean);

        /**
         * Calls ProcessDocuments.
         * @param request DocumentBatch message or plain object
         * @param callback Node-style callback called with the error, if any, and VectorSearchResponse
         */
        public processDocuments(request: cyber_elephant.IDocumentBatch, callback: cyber_elephant.CyberElephantService.ProcessDocumentsCallback): void;

        /**
         * Calls ProcessDocuments.
         * @param request DocumentBatch message or plain object
         * @returns Promise
         */
        public processDocuments(request: cyber_elephant.IDocumentBatch): Promise<cyber_elephant.VectorSearchResponse>;

        /**
         * Calls SearchSimilar.
         * @param request VectorQuery message or plain object
         * @param callback Node-style callback called with the error, if any, and VectorSearchResponse
         */
        public searchSimilar(request: cyber_elephant.IVectorQuery, callback: cyber_elephant.CyberElephantService.SearchSimilarCallback): void;

        /**
         * Calls SearchSimilar.
         * @param request VectorQuery message or plain object
         * @returns Promise
         */
        public searchSimilar(request: cyber_elephant.IVectorQuery): Promise<cyber_elephant.VectorSearchResponse>;

        /**
         * Calls GetDocumentById.
         * @param request DocumentIdRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and DocumentVector
         */
        public getDocumentById(request: cyber_elephant.IDocumentIdRequest, callback: cyber_elephant.CyberElephantService.GetDocumentByIdCallback): void;

        /**
         * Calls GetDocumentById.
         * @param request DocumentIdRequest message or plain object
         * @returns Promise
         */
        public getDocumentById(request: cyber_elephant.IDocumentIdRequest): Promise<cyber_elephant.DocumentVector>;

        /**
         * Calls GetClusters.
         * @param request ClusterRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and ClusterResponse
         */
        public getClusters(request: cyber_elephant.IClusterRequest, callback: cyber_elephant.CyberElephantService.GetClustersCallback): void;

        /**
         * Calls GetClusters.
         * @param request ClusterRequest message or plain object
         * @returns Promise
         */
        public getClusters(request: cyber_elephant.IClusterRequest): Promise<cyber_elephant.ClusterResponse>;

        /**
         * Calls UpdateClusters.
         * @param request ClusterUpdateRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and ClusterResponse
         */
        public updateClusters(request: cyber_elephant.IClusterUpdateRequest, callback: cyber_elephant.CyberElephantService.UpdateClustersCallback): void;

        /**
         * Calls UpdateClusters.
         * @param request ClusterUpdateRequest message or plain object
         * @returns Promise
         */
        public updateClusters(request: cyber_elephant.IClusterUpdateRequest): Promise<cyber_elephant.ClusterResponse>;

        /**
         * Calls GetStatus.
         * @param request StatusRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and SystemStatus
         */
        public getStatus(request: cyber_elephant.IStatusRequest, callback: cyber_elephant.CyberElephantService.GetStatusCallback): void;

        /**
         * Calls GetStatus.
         * @param request StatusRequest message or plain object
         * @returns Promise
         */
        public getStatus(request: cyber_elephant.IStatusRequest): Promise<cyber_elephant.SystemStatus>;

        /**
         * Calls HealthCheck.
         * @param request HealthRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and HealthResponse
         */
        public healthCheck(request: cyber_elephant.IHealthRequest, callback: cyber_elephant.CyberElephantService.HealthCheckCallback): void;

        /**
         * Calls HealthCheck.
         * @param request HealthRequest message or plain object
         * @returns Promise
         */
        public healthCheck(request: cyber_elephant.IHealthRequest): Promise<cyber_elephant.HealthResponse>;
    }

    namespace CyberElephantService {

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#processDocuments}.
         * @param error Error, if any
         * @param [response] VectorSearchResponse
         */
        type ProcessDocumentsCallback = (error: (Error|null), response?: cyber_elephant.VectorSearchResponse) => void;

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#searchSimilar}.
         * @param error Error, if any
         * @param [response] VectorSearchResponse
         */
        type SearchSimilarCallback = (error: (Error|null), response?: cyber_elephant.VectorSearchResponse) => void;

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#getDocumentById}.
         * @param error Error, if any
         * @param [response] DocumentVector
         */
        type GetDocumentByIdCallback = (error: (Error|null), response?: cyber_elephant.DocumentVector) => void;

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#getClusters}.
         * @param error Error, if any
         * @param [response] ClusterResponse
         */
        type GetClustersCallback = (error: (Error|null), response?: cyber_elephant.ClusterResponse) => void;

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#updateClusters}.
         * @param error Error, if any
         * @param [response] ClusterResponse
         */
        type UpdateClustersCallback = (error: (Error|null), response?: cyber_elephant.ClusterResponse) => void;

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#getStatus}.
         * @param error Error, if any
         * @param [response] SystemStatus
         */
        type GetStatusCallback = (error: (Error|null), response?: cyber_elephant.SystemStatus) => void;

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#healthCheck}.
         * @param error Error, if any
         * @param [response] HealthResponse
         */
        type HealthCheckCallback = (error: (Error|null), response?: cyber_elephant.HealthResponse) => void;
    }

    /** Properties of a DocumentIdRequest. */
    interface IDocumentIdRequest {

        /** DocumentIdRequest id */
        id?: (string|null);
    }

    /** Represents a DocumentIdRequest. */
    class DocumentIdRequest implements IDocumentIdRequest {

        /**
         * Constructs a new DocumentIdRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IDocumentIdRequest);

        /** DocumentIdRequest id. */
        public id: string;

        /**
         * Encodes the specified DocumentIdRequest message. Does not implicitly {@link cyber_elephant.DocumentIdRequest.verify|verify} messages.
         * @param message DocumentIdRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IDocumentIdRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified DocumentIdRequest message, length delimited. Does not implicitly {@link cyber_elephant.DocumentIdRequest.verify|verify} messages.
         * @param message DocumentIdRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IDocumentIdRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a DocumentIdRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns DocumentIdRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.DocumentIdRequest;

        /**
         * Decodes a DocumentIdRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns DocumentIdRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.DocumentIdRequest;

        /**
         * Gets the default type url for DocumentIdRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a ClusterRequest. */
    interface IClusterRequest {

        /** ClusterRequest clusterId */
        clusterId?: (string|null);

        /** ClusterRequest includeDocuments */
        includeDocuments?: (boolean|null);
    }

    /** Represents a ClusterRequest. */
    class ClusterRequest implements IClusterRequest {

        /**
         * Constructs a new ClusterRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IClusterRequest);

        /** ClusterRequest clusterId. */
        public clusterId: string;

        /** ClusterRequest includeDocuments. */
        public includeDocuments: boolean;

        /**
         * Encodes the specified ClusterRequest message. Does not implicitly {@link cyber_elephant.ClusterRequest.verify|verify} messages.
         * @param message ClusterRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IClusterRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ClusterRequest message, length delimited. Does not implicitly {@link cyber_elephant.ClusterRequest.verify|verify} messages.
         * @param message ClusterRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IClusterRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ClusterRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ClusterRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.ClusterRequest;

        /**
         * Decodes a ClusterRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns ClusterRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.ClusterRequest;

        /**
         * Gets the default type url for ClusterRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a ClusterResponse. */
    interface IClusterResponse {

        /** ClusterResponse clusters */
        clusters?: (cyber_elephant.IDocumentCluster[]|null);

        /** ClusterResponse stats */
        stats?: (cyber_elephant.IQueryStatistics|null);
    }

    /** Represents a ClusterResponse. */
    class ClusterResponse implements IClusterResponse {

        /**
         * Constructs a new ClusterResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IClusterResponse);

        /** ClusterResponse clusters. */
        public clusters: cyber_elephant.IDocumentCluster[];

        /** ClusterResponse stats. */
        public stats?: (cyber_elephant.IQueryStatistics|null);

        /**
         * Encodes the specified ClusterResponse message. Does not implicitly {@link cyber_elephant.ClusterResponse.verify|verify} messages.
         * @param message ClusterResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IClusterResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ClusterResponse message, length delimited. Does not implicitly {@link cyber_elephant.ClusterResponse.verify|verify} messages.
         * @param message ClusterResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IClusterResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ClusterResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ClusterResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.ClusterResponse;

        /**
         * Decodes a ClusterResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns ClusterResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.ClusterResponse;

        /**
         * Gets the default type url for ClusterResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a ClusterUpdateRequest. */
    interface IClusterUpdateRequest {

        /** ClusterUpdateRequest clusterId */
        clusterId?: (string|null);

        /** ClusterUpdateRequest options */
        options?: (cyber_elephant.IProcessingOptions|null);
    }

    /** Represents a ClusterUpdateRequest. */
    class ClusterUpdateRequest implements IClusterUpdateRequest {

        /**
         * Constructs a new ClusterUpdateRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IClusterUpdateRequest);

        /** ClusterUpdateRequest clusterId. */
        public clusterId: string;

        /** ClusterUpdateRequest options. */
        public options?: (cyber_elephant.IProcessingOptions|null);

        /**
         * Encodes the specified ClusterUpdateRequest message. Does not implicitly {@link cyber_elephant.ClusterUpdateRequest.verify|verify} messages.
         * @param message ClusterUpdateRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IClusterUpdateRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ClusterUpdateRequest message, length delimited. Does not implicitly {@link cyber_elephant.ClusterUpdateRequest.verify|verify} messages.
         * @param message ClusterUpdateRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IClusterUpdateRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ClusterUpdateRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ClusterUpdateRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.ClusterUpdateRequest;

        /**
         * Decodes a ClusterUpdateRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns ClusterUpdateRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.ClusterUpdateRequest;

        /**
         * Gets the default type url for ClusterUpdateRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a StatusRequest. */
    interface IStatusRequest {

        /** StatusRequest includeMetrics */
        includeMetrics?: (boolean|null);
    }

    /** Represents a StatusRequest. */
    class StatusRequest implements IStatusRequest {

        /**
         * Constructs a new StatusRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IStatusRequest);

        /** StatusRequest includeMetrics. */
        public includeMetrics: boolean;

        /**
         * Encodes the specified StatusRequest message. Does not implicitly {@link cyber_elephant.StatusRequest.verify|verify} messages.
         * @param message StatusRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IStatusRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified StatusRequest message, length delimited. Does not implicitly {@link cyber_elephant.StatusRequest.verify|verify} messages.
         * @param message StatusRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IStatusRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a StatusRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns StatusRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.StatusRequest;

        /**
         * Decodes a StatusRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns StatusRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.StatusRequest;

        /**
         * Gets the default type url for StatusRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a HealthRequest. */
    interface IHealthRequest {

        /** HealthRequest component */
        component?: (string|null);
    }

    /** Represents a HealthRequest. */
    class HealthRequest implements IHealthRequest {

        /**
         * Constructs a new HealthRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IHealthRequest);

        /** HealthRequest component. */
        public component: string;

        /**
         * Encodes the specified HealthRequest message. Does not implicitly {@link cyber_elephant.HealthRequest.verify|verify} messages.
         * @param message HealthRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IHealthRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified HealthRequest message, length delimited. Does not implicitly {@link cyber_elephant.HealthRequest.verify|verify} messages.
         * @param message HealthRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IHealthRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a HealthRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns HealthRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.HealthRequest;

        /**
         * Decodes a HealthRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns HealthRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.HealthRequest;

        /**
         * Gets the default type url for HealthRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a HealthResponse. */
    interface IHealthResponse {

        /** HealthResponse healthy */
        healthy?: (boolean|null);

        /** HealthResponse status */
        status?: (string|null);

        /** HealthResponse details */
        details?: ({ [k: string]: string }|null);
    }

    /** Represents a HealthResponse. */
    class HealthResponse implements IHealthResponse {

        /**
         * Constructs a new HealthResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: cyber_elephant.IHealthResponse);

        /** HealthResponse healthy. */
        public healthy: boolean;

        /** HealthResponse status. */
        public status: string;

        /** HealthResponse details. */
        public details: { [k: string]: string };

        /**
         * Encodes the specified HealthResponse message. Does not implicitly {@link cyber_elephant.HealthResponse.verify|verify} messages.
         * @param message HealthResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: cyber_elephant.IHealthResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified HealthResponse message, length delimited. Does not implicitly {@link cyber_elephant.HealthResponse.verify|verify} messages.
         * @param message HealthResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: cyber_elephant.IHealthResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a HealthResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns HealthResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): cyber_elephant.HealthResponse;

        /**
         * Decodes a HealthResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns HealthResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): cyber_elephant.HealthResponse;

        /**
         * Gets the default type url for HealthResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
