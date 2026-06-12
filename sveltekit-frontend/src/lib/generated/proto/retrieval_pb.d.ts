import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace yorha. */
export namespace yorha {

    /** Namespace retrieval. */
    namespace retrieval {

        /** Represents a RetrievalService */
        class RetrievalService extends $protobuf.rpc.Service {

            /**
             * Constructs a new RetrievalService service.
             * @param rpcImpl RPC implementation
             * @param [requestDelimited=false] Whether requests are length-delimited
             * @param [responseDelimited=false] Whether responses are length-delimited
             */
            constructor(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean);

            /**
             * Calls SearchEvidence.
             * @param request EvidenceSearchRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and EvidenceSearchResponse
             */
            public searchEvidence(request: yorha.retrieval.IEvidenceSearchRequest, callback: yorha.retrieval.RetrievalService.SearchEvidenceCallback): void;

            /**
             * Calls SearchEvidence.
             * @param request EvidenceSearchRequest message or plain object
             * @returns Promise
             */
            public searchEvidence(request: yorha.retrieval.IEvidenceSearchRequest): Promise<yorha.retrieval.EvidenceSearchResponse>;

            /**
             * Calls StreamEvidence.
             * @param request EvidenceSearchRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and EvidenceBundleEvent
             */
            public streamEvidence(request: yorha.retrieval.IEvidenceSearchRequest, callback: yorha.retrieval.RetrievalService.StreamEvidenceCallback): void;

            /**
             * Calls StreamEvidence.
             * @param request EvidenceSearchRequest message or plain object
             * @returns Promise
             */
            public streamEvidence(request: yorha.retrieval.IEvidenceSearchRequest): Promise<yorha.retrieval.EvidenceBundleEvent>;

            /**
             * Calls SearchCodebase.
             * @param request CodebaseSearchRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and CodebaseSearchResponse
             */
            public searchCodebase(request: yorha.retrieval.ICodebaseSearchRequest, callback: yorha.retrieval.RetrievalService.SearchCodebaseCallback): void;

            /**
             * Calls SearchCodebase.
             * @param request CodebaseSearchRequest message or plain object
             * @returns Promise
             */
            public searchCodebase(request: yorha.retrieval.ICodebaseSearchRequest): Promise<yorha.retrieval.CodebaseSearchResponse>;

            /**
             * Calls StreamCodebase.
             * @param request CodebaseSearchRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and CodebaseChunkEvent
             */
            public streamCodebase(request: yorha.retrieval.ICodebaseSearchRequest, callback: yorha.retrieval.RetrievalService.StreamCodebaseCallback): void;

            /**
             * Calls StreamCodebase.
             * @param request CodebaseSearchRequest message or plain object
             * @returns Promise
             */
            public streamCodebase(request: yorha.retrieval.ICodebaseSearchRequest): Promise<yorha.retrieval.CodebaseChunkEvent>;

            /**
             * Calls SearchChunks.
             * @param request SearchChunksRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and SearchChunksResponse
             */
            public searchChunks(request: yorha.retrieval.ISearchChunksRequest, callback: yorha.retrieval.RetrievalService.SearchChunksCallback): void;

            /**
             * Calls SearchChunks.
             * @param request SearchChunksRequest message or plain object
             * @returns Promise
             */
            public searchChunks(request: yorha.retrieval.ISearchChunksRequest): Promise<yorha.retrieval.SearchChunksResponse>;

            /**
             * Calls GetClusterSummary.
             * @param request ClusterSummaryRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and ClusterSummaryResponse
             */
            public getClusterSummary(request: yorha.retrieval.IClusterSummaryRequest, callback: yorha.retrieval.RetrievalService.GetClusterSummaryCallback): void;

            /**
             * Calls GetClusterSummary.
             * @param request ClusterSummaryRequest message or plain object
             * @returns Promise
             */
            public getClusterSummary(request: yorha.retrieval.IClusterSummaryRequest): Promise<yorha.retrieval.ClusterSummaryResponse>;

            /**
             * Calls ExpandAstNeighbors.
             * @param request AstExpansionRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and AstExpansionResponse
             */
            public expandAstNeighbors(request: yorha.retrieval.IAstExpansionRequest, callback: yorha.retrieval.RetrievalService.ExpandAstNeighborsCallback): void;

            /**
             * Calls ExpandAstNeighbors.
             * @param request AstExpansionRequest message or plain object
             * @returns Promise
             */
            public expandAstNeighbors(request: yorha.retrieval.IAstExpansionRequest): Promise<yorha.retrieval.AstExpansionResponse>;

            /**
             * Calls GetTopologyContext.
             * @param request TopologyRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and TopologyResponse
             */
            public getTopologyContext(request: yorha.retrieval.ITopologyRequest, callback: yorha.retrieval.RetrievalService.GetTopologyContextCallback): void;

            /**
             * Calls GetTopologyContext.
             * @param request TopologyRequest message or plain object
             * @returns Promise
             */
            public getTopologyContext(request: yorha.retrieval.ITopologyRequest): Promise<yorha.retrieval.TopologyResponse>;

            /**
             * Calls GetResearchContext.
             * @param request ResearchContextRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and ResearchContextResponse
             */
            public getResearchContext(request: yorha.retrieval.IResearchContextRequest, callback: yorha.retrieval.RetrievalService.GetResearchContextCallback): void;

            /**
             * Calls GetResearchContext.
             * @param request ResearchContextRequest message or plain object
             * @returns Promise
             */
            public getResearchContext(request: yorha.retrieval.IResearchContextRequest): Promise<yorha.retrieval.ResearchContextResponse>;

            /**
             * Calls Health.
             * @param request HealthRequest message or plain object
             * @param callback Node-style callback called with the error, if any, and HealthResponse
             */
            public health(request: yorha.retrieval.IHealthRequest, callback: yorha.retrieval.RetrievalService.HealthCallback): void;

            /**
             * Calls Health.
             * @param request HealthRequest message or plain object
             * @returns Promise
             */
            public health(request: yorha.retrieval.IHealthRequest): Promise<yorha.retrieval.HealthResponse>;
        }

        namespace RetrievalService {

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#searchEvidence}.
             * @param error Error, if any
             * @param [response] EvidenceSearchResponse
             */
            type SearchEvidenceCallback = (error: (Error|null), response?: yorha.retrieval.EvidenceSearchResponse) => void;

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#streamEvidence}.
             * @param error Error, if any
             * @param [response] EvidenceBundleEvent
             */
            type StreamEvidenceCallback = (error: (Error|null), response?: yorha.retrieval.EvidenceBundleEvent) => void;

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#searchCodebase}.
             * @param error Error, if any
             * @param [response] CodebaseSearchResponse
             */
            type SearchCodebaseCallback = (error: (Error|null), response?: yorha.retrieval.CodebaseSearchResponse) => void;

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#streamCodebase}.
             * @param error Error, if any
             * @param [response] CodebaseChunkEvent
             */
            type StreamCodebaseCallback = (error: (Error|null), response?: yorha.retrieval.CodebaseChunkEvent) => void;

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#searchChunks}.
             * @param error Error, if any
             * @param [response] SearchChunksResponse
             */
            type SearchChunksCallback = (error: (Error|null), response?: yorha.retrieval.SearchChunksResponse) => void;

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#getClusterSummary}.
             * @param error Error, if any
             * @param [response] ClusterSummaryResponse
             */
            type GetClusterSummaryCallback = (error: (Error|null), response?: yorha.retrieval.ClusterSummaryResponse) => void;

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#expandAstNeighbors}.
             * @param error Error, if any
             * @param [response] AstExpansionResponse
             */
            type ExpandAstNeighborsCallback = (error: (Error|null), response?: yorha.retrieval.AstExpansionResponse) => void;

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#getTopologyContext}.
             * @param error Error, if any
             * @param [response] TopologyResponse
             */
            type GetTopologyContextCallback = (error: (Error|null), response?: yorha.retrieval.TopologyResponse) => void;

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#getResearchContext}.
             * @param error Error, if any
             * @param [response] ResearchContextResponse
             */
            type GetResearchContextCallback = (error: (Error|null), response?: yorha.retrieval.ResearchContextResponse) => void;

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#health}.
             * @param error Error, if any
             * @param [response] HealthResponse
             */
            type HealthCallback = (error: (Error|null), response?: yorha.retrieval.HealthResponse) => void;
        }

        /** Properties of an EvidenceSearchRequest. */
        interface IEvidenceSearchRequest {

            /** EvidenceSearchRequest ids */
            ids?: (yorha.shared.IRunIds|null);

            /** EvidenceSearchRequest query */
            query?: (string|null);

            /** EvidenceSearchRequest caseId */
            caseId?: (string|null);

            /** EvidenceSearchRequest limit */
            limit?: (number|null);

            /** EvidenceSearchRequest jurisdiction */
            jurisdiction?: (string|null);

            /** EvidenceSearchRequest hop */
            hop?: (yorha.retrieval.IGraphHopPolicy|null);

            /** EvidenceSearchRequest prefilter */
            prefilter?: (yorha.retrieval.IPrefilterPolicy|null);

            /** EvidenceSearchRequest rank */
            rank?: (yorha.retrieval.IRankPolicy|null);

            /** EvidenceSearchRequest queryEmbedding */
            queryEmbedding?: (number[]|null);

            /** EvidenceSearchRequest includeDebug */
            includeDebug?: (boolean|null);
        }

        /** Represents an EvidenceSearchRequest. */
        class EvidenceSearchRequest implements IEvidenceSearchRequest {

            /**
             * Constructs a new EvidenceSearchRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IEvidenceSearchRequest);

            /** EvidenceSearchRequest ids. */
            public ids?: (yorha.shared.IRunIds|null);

            /** EvidenceSearchRequest query. */
            public query: string;

            /** EvidenceSearchRequest caseId. */
            public caseId: string;

            /** EvidenceSearchRequest limit. */
            public limit: number;

            /** EvidenceSearchRequest jurisdiction. */
            public jurisdiction: string;

            /** EvidenceSearchRequest hop. */
            public hop?: (yorha.retrieval.IGraphHopPolicy|null);

            /** EvidenceSearchRequest prefilter. */
            public prefilter?: (yorha.retrieval.IPrefilterPolicy|null);

            /** EvidenceSearchRequest rank. */
            public rank?: (yorha.retrieval.IRankPolicy|null);

            /** EvidenceSearchRequest queryEmbedding. */
            public queryEmbedding: number[];

            /** EvidenceSearchRequest includeDebug. */
            public includeDebug: boolean;

            /**
             * Encodes the specified EvidenceSearchRequest message. Does not implicitly {@link yorha.retrieval.EvidenceSearchRequest.verify|verify} messages.
             * @param message EvidenceSearchRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IEvidenceSearchRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified EvidenceSearchRequest message, length delimited. Does not implicitly {@link yorha.retrieval.EvidenceSearchRequest.verify|verify} messages.
             * @param message EvidenceSearchRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IEvidenceSearchRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an EvidenceSearchRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns EvidenceSearchRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.EvidenceSearchRequest;

            /**
             * Decodes an EvidenceSearchRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns EvidenceSearchRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.EvidenceSearchRequest;

            /**
             * Gets the default type url for EvidenceSearchRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of an EvidenceSearchResponse. */
        interface IEvidenceSearchResponse {

            /** EvidenceSearchResponse results */
            results?: (yorha.retrieval.ISearchResult[]|null);

            /** EvidenceSearchResponse bundles */
            bundles?: (yorha.retrieval.IContextBundle[]|null);

            /** EvidenceSearchResponse timing */
            timing?: (yorha.retrieval.ISearchTiming|null);

            /** EvidenceSearchResponse cacheSource */
            cacheSource?: (string|null);

            /** EvidenceSearchResponse debugJson */
            debugJson?: (string|null);
        }

        /** Represents an EvidenceSearchResponse. */
        class EvidenceSearchResponse implements IEvidenceSearchResponse {

            /**
             * Constructs a new EvidenceSearchResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IEvidenceSearchResponse);

            /** EvidenceSearchResponse results. */
            public results: yorha.retrieval.ISearchResult[];

            /** EvidenceSearchResponse bundles. */
            public bundles: yorha.retrieval.IContextBundle[];

            /** EvidenceSearchResponse timing. */
            public timing?: (yorha.retrieval.ISearchTiming|null);

            /** EvidenceSearchResponse cacheSource. */
            public cacheSource: string;

            /** EvidenceSearchResponse debugJson. */
            public debugJson: string;

            /**
             * Encodes the specified EvidenceSearchResponse message. Does not implicitly {@link yorha.retrieval.EvidenceSearchResponse.verify|verify} messages.
             * @param message EvidenceSearchResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IEvidenceSearchResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified EvidenceSearchResponse message, length delimited. Does not implicitly {@link yorha.retrieval.EvidenceSearchResponse.verify|verify} messages.
             * @param message EvidenceSearchResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IEvidenceSearchResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an EvidenceSearchResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns EvidenceSearchResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.EvidenceSearchResponse;

            /**
             * Decodes an EvidenceSearchResponse message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns EvidenceSearchResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.EvidenceSearchResponse;

            /**
             * Gets the default type url for EvidenceSearchResponse
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of an EvidenceBundleEvent. */
        interface IEvidenceBundleEvent {

            /** EvidenceBundleEvent bundle */
            bundle?: (yorha.retrieval.IContextBundle|null);

            /** EvidenceBundleEvent progress */
            progress?: (yorha.retrieval.IRetrievalProgress|null);

            /** EvidenceBundleEvent error */
            error?: (yorha.retrieval.IRetrievalError|null);
        }

        /** Represents an EvidenceBundleEvent. */
        class EvidenceBundleEvent implements IEvidenceBundleEvent {

            /**
             * Constructs a new EvidenceBundleEvent.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IEvidenceBundleEvent);

            /** EvidenceBundleEvent bundle. */
            public bundle?: (yorha.retrieval.IContextBundle|null);

            /** EvidenceBundleEvent progress. */
            public progress?: (yorha.retrieval.IRetrievalProgress|null);

            /** EvidenceBundleEvent error. */
            public error?: (yorha.retrieval.IRetrievalError|null);

            /** EvidenceBundleEvent event. */
            public event?: ("bundle"|"progress"|"error");

            /**
             * Encodes the specified EvidenceBundleEvent message. Does not implicitly {@link yorha.retrieval.EvidenceBundleEvent.verify|verify} messages.
             * @param message EvidenceBundleEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IEvidenceBundleEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified EvidenceBundleEvent message, length delimited. Does not implicitly {@link yorha.retrieval.EvidenceBundleEvent.verify|verify} messages.
             * @param message EvidenceBundleEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IEvidenceBundleEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an EvidenceBundleEvent message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns EvidenceBundleEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.EvidenceBundleEvent;

            /**
             * Decodes an EvidenceBundleEvent message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns EvidenceBundleEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.EvidenceBundleEvent;

            /**
             * Gets the default type url for EvidenceBundleEvent
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a SearchResult. */
        interface ISearchResult {

            /** SearchResult evidenceId */
            evidenceId?: (string|null);

            /** SearchResult chunkIndex */
            chunkIndex?: (number|null);

            /** SearchResult content */
            content?: (string|null);

            /** SearchResult score */
            score?: (number|null);

            /** SearchResult metadata */
            metadata?: (yorha.retrieval.IChunkMetadata|null);

            /** SearchResult rerank */
            rerank?: (yorha.retrieval.IRerankExplain|null);
        }

        /** Represents a SearchResult. */
        class SearchResult implements ISearchResult {

            /**
             * Constructs a new SearchResult.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ISearchResult);

            /** SearchResult evidenceId. */
            public evidenceId: string;

            /** SearchResult chunkIndex. */
            public chunkIndex: number;

            /** SearchResult content. */
            public content: string;

            /** SearchResult score. */
            public score: number;

            /** SearchResult metadata. */
            public metadata?: (yorha.retrieval.IChunkMetadata|null);

            /** SearchResult rerank. */
            public rerank?: (yorha.retrieval.IRerankExplain|null);

            /**
             * Encodes the specified SearchResult message. Does not implicitly {@link yorha.retrieval.SearchResult.verify|verify} messages.
             * @param message SearchResult message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ISearchResult, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified SearchResult message, length delimited. Does not implicitly {@link yorha.retrieval.SearchResult.verify|verify} messages.
             * @param message SearchResult message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ISearchResult, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a SearchResult message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns SearchResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.SearchResult;

            /**
             * Decodes a SearchResult message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns SearchResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.SearchResult;

            /**
             * Gets the default type url for SearchResult
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a ChunkMetadata. */
        interface IChunkMetadata {

            /** ChunkMetadata sectionPath */
            sectionPath?: (string[]|null);

            /** ChunkMetadata heading */
            heading?: (string|null);

            /** ChunkMetadata citations */
            citations?: (string[]|null);

            /** ChunkMetadata fileName */
            fileName?: (string|null);

            /** ChunkMetadata tokenCount */
            tokenCount?: (number|null);

            /** ChunkMetadata extractionMethod */
            extractionMethod?: (string|null);

            /** ChunkMetadata jurisdiction */
            jurisdiction?: (string|null);
        }

        /** Represents a ChunkMetadata. */
        class ChunkMetadata implements IChunkMetadata {

            /**
             * Constructs a new ChunkMetadata.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IChunkMetadata);

            /** ChunkMetadata sectionPath. */
            public sectionPath: string[];

            /** ChunkMetadata heading. */
            public heading: string;

            /** ChunkMetadata citations. */
            public citations: string[];

            /** ChunkMetadata fileName. */
            public fileName: string;

            /** ChunkMetadata tokenCount. */
            public tokenCount: number;

            /** ChunkMetadata extractionMethod. */
            public extractionMethod: string;

            /** ChunkMetadata jurisdiction. */
            public jurisdiction: string;

            /**
             * Encodes the specified ChunkMetadata message. Does not implicitly {@link yorha.retrieval.ChunkMetadata.verify|verify} messages.
             * @param message ChunkMetadata message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IChunkMetadata, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ChunkMetadata message, length delimited. Does not implicitly {@link yorha.retrieval.ChunkMetadata.verify|verify} messages.
             * @param message ChunkMetadata message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IChunkMetadata, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ChunkMetadata message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ChunkMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.ChunkMetadata;

            /**
             * Decodes a ChunkMetadata message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ChunkMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.ChunkMetadata;

            /**
             * Gets the default type url for ChunkMetadata
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a RerankExplain. */
        interface IRerankExplain {

            /** RerankExplain cosine */
            cosine?: (number|null);

            /** RerankExplain sharedCitations */
            sharedCitations?: (number|null);

            /** RerankExplain jurisdictionMatch */
            jurisdictionMatch?: (number|null);

            /** RerankExplain sectionProximity */
            sectionProximity?: (number|null);

            /** RerankExplain finalScore */
            finalScore?: (number|null);
        }

        /** Represents a RerankExplain. */
        class RerankExplain implements IRerankExplain {

            /**
             * Constructs a new RerankExplain.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IRerankExplain);

            /** RerankExplain cosine. */
            public cosine: number;

            /** RerankExplain sharedCitations. */
            public sharedCitations: number;

            /** RerankExplain jurisdictionMatch. */
            public jurisdictionMatch: number;

            /** RerankExplain sectionProximity. */
            public sectionProximity: number;

            /** RerankExplain finalScore. */
            public finalScore: number;

            /**
             * Encodes the specified RerankExplain message. Does not implicitly {@link yorha.retrieval.RerankExplain.verify|verify} messages.
             * @param message RerankExplain message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IRerankExplain, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified RerankExplain message, length delimited. Does not implicitly {@link yorha.retrieval.RerankExplain.verify|verify} messages.
             * @param message RerankExplain message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IRerankExplain, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a RerankExplain message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns RerankExplain
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.RerankExplain;

            /**
             * Decodes a RerankExplain message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns RerankExplain
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.RerankExplain;

            /**
             * Gets the default type url for RerankExplain
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a ContextBundle. */
        interface IContextBundle {

            /** ContextBundle hit */
            hit?: (yorha.retrieval.ISearchResult|null);

            /** ContextBundle siblings */
            siblings?: (yorha.retrieval.ISearchResult[]|null);

            /** ContextBundle sectionPath */
            sectionPath?: (string[]|null);

            /** ContextBundle heading */
            heading?: (string|null);

            /** ContextBundle citations */
            citations?: (string[]|null);

            /** ContextBundle graphNeighbors */
            graphNeighbors?: (yorha.retrieval.IGraphNeighbor[]|null);

            /** ContextBundle documentContext */
            documentContext?: (yorha.retrieval.IDocumentContext|null);
        }

        /** Represents a ContextBundle. */
        class ContextBundle implements IContextBundle {

            /**
             * Constructs a new ContextBundle.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IContextBundle);

            /** ContextBundle hit. */
            public hit?: (yorha.retrieval.ISearchResult|null);

            /** ContextBundle siblings. */
            public siblings: yorha.retrieval.ISearchResult[];

            /** ContextBundle sectionPath. */
            public sectionPath: string[];

            /** ContextBundle heading. */
            public heading: string;

            /** ContextBundle citations. */
            public citations: string[];

            /** ContextBundle graphNeighbors. */
            public graphNeighbors: yorha.retrieval.IGraphNeighbor[];

            /** ContextBundle documentContext. */
            public documentContext?: (yorha.retrieval.IDocumentContext|null);

            /**
             * Encodes the specified ContextBundle message. Does not implicitly {@link yorha.retrieval.ContextBundle.verify|verify} messages.
             * @param message ContextBundle message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IContextBundle, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ContextBundle message, length delimited. Does not implicitly {@link yorha.retrieval.ContextBundle.verify|verify} messages.
             * @param message ContextBundle message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IContextBundle, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ContextBundle message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ContextBundle
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.ContextBundle;

            /**
             * Decodes a ContextBundle message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ContextBundle
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.ContextBundle;

            /**
             * Gets the default type url for ContextBundle
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a GraphNeighbor. */
        interface IGraphNeighbor {

            /** GraphNeighbor nodeId */
            nodeId?: (string|null);

            /** GraphNeighbor title */
            title?: (string|null);

            /** GraphNeighbor evidenceType */
            evidenceType?: (string|null);

            /** GraphNeighbor connectionType */
            connectionType?: (string|null);

            /** GraphNeighbor strength */
            strength?: (number|null);

            /** GraphNeighbor confidence */
            confidence?: (number|null);

            /** GraphNeighbor aiReasoning */
            aiReasoning?: (string|null);
        }

        /** Represents a GraphNeighbor. */
        class GraphNeighbor implements IGraphNeighbor {

            /**
             * Constructs a new GraphNeighbor.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IGraphNeighbor);

            /** GraphNeighbor nodeId. */
            public nodeId: string;

            /** GraphNeighbor title. */
            public title: string;

            /** GraphNeighbor evidenceType. */
            public evidenceType: string;

            /** GraphNeighbor connectionType. */
            public connectionType: string;

            /** GraphNeighbor strength. */
            public strength: number;

            /** GraphNeighbor confidence. */
            public confidence: number;

            /** GraphNeighbor aiReasoning. */
            public aiReasoning: string;

            /**
             * Encodes the specified GraphNeighbor message. Does not implicitly {@link yorha.retrieval.GraphNeighbor.verify|verify} messages.
             * @param message GraphNeighbor message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IGraphNeighbor, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified GraphNeighbor message, length delimited. Does not implicitly {@link yorha.retrieval.GraphNeighbor.verify|verify} messages.
             * @param message GraphNeighbor message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IGraphNeighbor, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a GraphNeighbor message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns GraphNeighbor
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.GraphNeighbor;

            /**
             * Decodes a GraphNeighbor message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns GraphNeighbor
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.GraphNeighbor;

            /**
             * Gets the default type url for GraphNeighbor
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a DocumentContext. */
        interface IDocumentContext {

            /** DocumentContext evidenceId */
            evidenceId?: (string|null);

            /** DocumentContext fileName */
            fileName?: (string|null);

            /** DocumentContext fileType */
            fileType?: (string|null);

            /** DocumentContext description */
            description?: (string|null);

            /** DocumentContext aiSummary */
            aiSummary?: (string|null);

            /** DocumentContext aiTagsJson */
            aiTagsJson?: (string|null);

            /** DocumentContext keyEntitiesJson */
            keyEntitiesJson?: (string|null);
        }

        /** Represents a DocumentContext. */
        class DocumentContext implements IDocumentContext {

            /**
             * Constructs a new DocumentContext.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IDocumentContext);

            /** DocumentContext evidenceId. */
            public evidenceId: string;

            /** DocumentContext fileName. */
            public fileName: string;

            /** DocumentContext fileType. */
            public fileType: string;

            /** DocumentContext description. */
            public description: string;

            /** DocumentContext aiSummary. */
            public aiSummary: string;

            /** DocumentContext aiTagsJson. */
            public aiTagsJson: string;

            /** DocumentContext keyEntitiesJson. */
            public keyEntitiesJson: string;

            /**
             * Encodes the specified DocumentContext message. Does not implicitly {@link yorha.retrieval.DocumentContext.verify|verify} messages.
             * @param message DocumentContext message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IDocumentContext, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified DocumentContext message, length delimited. Does not implicitly {@link yorha.retrieval.DocumentContext.verify|verify} messages.
             * @param message DocumentContext message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IDocumentContext, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a DocumentContext message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns DocumentContext
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.DocumentContext;

            /**
             * Decodes a DocumentContext message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns DocumentContext
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.DocumentContext;

            /**
             * Gets the default type url for DocumentContext
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a SearchTiming. */
        interface ISearchTiming {

            /** SearchTiming embedMs */
            embedMs?: (number|null);

            /** SearchTiming searchMs */
            searchMs?: (number|null);

            /** SearchTiming rerankMs */
            rerankMs?: (number|null);

            /** SearchTiming hopMs */
            hopMs?: (number|null);

            /** SearchTiming kagMs */
            kagMs?: (number|null);

            /** SearchTiming dagMs */
            dagMs?: (number|null);

            /** SearchTiming totalMs */
            totalMs?: (number|null);
        }

        /** Represents a SearchTiming. */
        class SearchTiming implements ISearchTiming {

            /**
             * Constructs a new SearchTiming.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ISearchTiming);

            /** SearchTiming embedMs. */
            public embedMs: number;

            /** SearchTiming searchMs. */
            public searchMs: number;

            /** SearchTiming rerankMs. */
            public rerankMs: number;

            /** SearchTiming hopMs. */
            public hopMs: number;

            /** SearchTiming kagMs. */
            public kagMs: number;

            /** SearchTiming dagMs. */
            public dagMs: number;

            /** SearchTiming totalMs. */
            public totalMs: number;

            /**
             * Encodes the specified SearchTiming message. Does not implicitly {@link yorha.retrieval.SearchTiming.verify|verify} messages.
             * @param message SearchTiming message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ISearchTiming, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified SearchTiming message, length delimited. Does not implicitly {@link yorha.retrieval.SearchTiming.verify|verify} messages.
             * @param message SearchTiming message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ISearchTiming, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a SearchTiming message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns SearchTiming
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.SearchTiming;

            /**
             * Decodes a SearchTiming message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns SearchTiming
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.SearchTiming;

            /**
             * Gets the default type url for SearchTiming
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a CodebaseSearchRequest. */
        interface ICodebaseSearchRequest {

            /** CodebaseSearchRequest query */
            query?: (string|null);

            /** CodebaseSearchRequest limit */
            limit?: (number|null);

            /** CodebaseSearchRequest contentWeight */
            contentWeight?: (number|null);

            /** CodebaseSearchRequest signatureWeight */
            signatureWeight?: (number|null);

            /** CodebaseSearchRequest kinds */
            kinds?: (string[]|null);

            /** CodebaseSearchRequest httpMethod */
            httpMethod?: (string|null);

            /** CodebaseSearchRequest pathPrefixes */
            pathPrefixes?: (string[]|null);

            /** CodebaseSearchRequest includeDebug */
            includeDebug?: (boolean|null);
        }

        /** Represents a CodebaseSearchRequest. */
        class CodebaseSearchRequest implements ICodebaseSearchRequest {

            /**
             * Constructs a new CodebaseSearchRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ICodebaseSearchRequest);

            /** CodebaseSearchRequest query. */
            public query: string;

            /** CodebaseSearchRequest limit. */
            public limit: number;

            /** CodebaseSearchRequest contentWeight. */
            public contentWeight: number;

            /** CodebaseSearchRequest signatureWeight. */
            public signatureWeight: number;

            /** CodebaseSearchRequest kinds. */
            public kinds: string[];

            /** CodebaseSearchRequest httpMethod. */
            public httpMethod: string;

            /** CodebaseSearchRequest pathPrefixes. */
            public pathPrefixes: string[];

            /** CodebaseSearchRequest includeDebug. */
            public includeDebug: boolean;

            /**
             * Encodes the specified CodebaseSearchRequest message. Does not implicitly {@link yorha.retrieval.CodebaseSearchRequest.verify|verify} messages.
             * @param message CodebaseSearchRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ICodebaseSearchRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified CodebaseSearchRequest message, length delimited. Does not implicitly {@link yorha.retrieval.CodebaseSearchRequest.verify|verify} messages.
             * @param message CodebaseSearchRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ICodebaseSearchRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a CodebaseSearchRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns CodebaseSearchRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.CodebaseSearchRequest;

            /**
             * Decodes a CodebaseSearchRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns CodebaseSearchRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.CodebaseSearchRequest;

            /**
             * Gets the default type url for CodebaseSearchRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a CodebaseSearchResponse. */
        interface ICodebaseSearchResponse {

            /** CodebaseSearchResponse chunks */
            chunks?: (yorha.retrieval.ICodebaseChunk[]|null);

            /** CodebaseSearchResponse totalMs */
            totalMs?: (number|null);

            /** CodebaseSearchResponse debugJson */
            debugJson?: (string|null);
        }

        /** Represents a CodebaseSearchResponse. */
        class CodebaseSearchResponse implements ICodebaseSearchResponse {

            /**
             * Constructs a new CodebaseSearchResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ICodebaseSearchResponse);

            /** CodebaseSearchResponse chunks. */
            public chunks: yorha.retrieval.ICodebaseChunk[];

            /** CodebaseSearchResponse totalMs. */
            public totalMs: number;

            /** CodebaseSearchResponse debugJson. */
            public debugJson: string;

            /**
             * Encodes the specified CodebaseSearchResponse message. Does not implicitly {@link yorha.retrieval.CodebaseSearchResponse.verify|verify} messages.
             * @param message CodebaseSearchResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ICodebaseSearchResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified CodebaseSearchResponse message, length delimited. Does not implicitly {@link yorha.retrieval.CodebaseSearchResponse.verify|verify} messages.
             * @param message CodebaseSearchResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ICodebaseSearchResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a CodebaseSearchResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns CodebaseSearchResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.CodebaseSearchResponse;

            /**
             * Decodes a CodebaseSearchResponse message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns CodebaseSearchResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.CodebaseSearchResponse;

            /**
             * Gets the default type url for CodebaseSearchResponse
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a CodebaseChunkEvent. */
        interface ICodebaseChunkEvent {

            /** CodebaseChunkEvent chunk */
            chunk?: (yorha.retrieval.ICodebaseChunk|null);

            /** CodebaseChunkEvent progress */
            progress?: (yorha.retrieval.IRetrievalProgress|null);

            /** CodebaseChunkEvent error */
            error?: (yorha.retrieval.IRetrievalError|null);
        }

        /** Represents a CodebaseChunkEvent. */
        class CodebaseChunkEvent implements ICodebaseChunkEvent {

            /**
             * Constructs a new CodebaseChunkEvent.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ICodebaseChunkEvent);

            /** CodebaseChunkEvent chunk. */
            public chunk?: (yorha.retrieval.ICodebaseChunk|null);

            /** CodebaseChunkEvent progress. */
            public progress?: (yorha.retrieval.IRetrievalProgress|null);

            /** CodebaseChunkEvent error. */
            public error?: (yorha.retrieval.IRetrievalError|null);

            /** CodebaseChunkEvent event. */
            public event?: ("chunk"|"progress"|"error");

            /**
             * Encodes the specified CodebaseChunkEvent message. Does not implicitly {@link yorha.retrieval.CodebaseChunkEvent.verify|verify} messages.
             * @param message CodebaseChunkEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ICodebaseChunkEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified CodebaseChunkEvent message, length delimited. Does not implicitly {@link yorha.retrieval.CodebaseChunkEvent.verify|verify} messages.
             * @param message CodebaseChunkEvent message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ICodebaseChunkEvent, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a CodebaseChunkEvent message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns CodebaseChunkEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.CodebaseChunkEvent;

            /**
             * Decodes a CodebaseChunkEvent message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns CodebaseChunkEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.CodebaseChunkEvent;

            /**
             * Gets the default type url for CodebaseChunkEvent
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a CodebaseChunk. */
        interface ICodebaseChunk {

            /** CodebaseChunk chunkId */
            chunkId?: (string|null);

            /** CodebaseChunk filePath */
            filePath?: (string|null);

            /** CodebaseChunk kind */
            kind?: (string|null);

            /** CodebaseChunk httpMethod */
            httpMethod?: (string|null);

            /** CodebaseChunk routeId */
            routeId?: (string|null);

            /** CodebaseChunk tags */
            tags?: (string[]|null);

            /** CodebaseChunk contentPreview */
            contentPreview?: (string|null);

            /** CodebaseChunk score */
            score?: (number|null);

            /** CodebaseChunk startLine */
            startLine?: (number|null);

            /** CodebaseChunk endLine */
            endLine?: (number|null);
        }

        /** Represents a CodebaseChunk. */
        class CodebaseChunk implements ICodebaseChunk {

            /**
             * Constructs a new CodebaseChunk.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ICodebaseChunk);

            /** CodebaseChunk chunkId. */
            public chunkId: string;

            /** CodebaseChunk filePath. */
            public filePath: string;

            /** CodebaseChunk kind. */
            public kind: string;

            /** CodebaseChunk httpMethod. */
            public httpMethod: string;

            /** CodebaseChunk routeId. */
            public routeId: string;

            /** CodebaseChunk tags. */
            public tags: string[];

            /** CodebaseChunk contentPreview. */
            public contentPreview: string;

            /** CodebaseChunk score. */
            public score: number;

            /** CodebaseChunk startLine. */
            public startLine: number;

            /** CodebaseChunk endLine. */
            public endLine: number;

            /**
             * Encodes the specified CodebaseChunk message. Does not implicitly {@link yorha.retrieval.CodebaseChunk.verify|verify} messages.
             * @param message CodebaseChunk message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ICodebaseChunk, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified CodebaseChunk message, length delimited. Does not implicitly {@link yorha.retrieval.CodebaseChunk.verify|verify} messages.
             * @param message CodebaseChunk message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ICodebaseChunk, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a CodebaseChunk message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns CodebaseChunk
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.CodebaseChunk;

            /**
             * Decodes a CodebaseChunk message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns CodebaseChunk
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.CodebaseChunk;

            /**
             * Gets the default type url for CodebaseChunk
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a GraphHopPolicy. */
        interface IGraphHopPolicy {

            /** GraphHopPolicy mode */
            mode?: (number|null);

            /** GraphHopPolicy maxHopChunks */
            maxHopChunks?: (number|null);

            /** GraphHopPolicy withinSameEvidenceOnly */
            withinSameEvidenceOnly?: (boolean|null);
        }

        /** Represents a GraphHopPolicy. */
        class GraphHopPolicy implements IGraphHopPolicy {

            /**
             * Constructs a new GraphHopPolicy.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IGraphHopPolicy);

            /** GraphHopPolicy mode. */
            public mode: number;

            /** GraphHopPolicy maxHopChunks. */
            public maxHopChunks: number;

            /** GraphHopPolicy withinSameEvidenceOnly. */
            public withinSameEvidenceOnly: boolean;

            /**
             * Encodes the specified GraphHopPolicy message. Does not implicitly {@link yorha.retrieval.GraphHopPolicy.verify|verify} messages.
             * @param message GraphHopPolicy message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IGraphHopPolicy, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified GraphHopPolicy message, length delimited. Does not implicitly {@link yorha.retrieval.GraphHopPolicy.verify|verify} messages.
             * @param message GraphHopPolicy message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IGraphHopPolicy, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a GraphHopPolicy message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns GraphHopPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.GraphHopPolicy;

            /**
             * Decodes a GraphHopPolicy message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns GraphHopPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.GraphHopPolicy;

            /**
             * Gets the default type url for GraphHopPolicy
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a PrefilterPolicy. */
        interface IPrefilterPolicy {

            /** PrefilterPolicy enableQdrant */
            enableQdrant?: (boolean|null);

            /** PrefilterPolicy qdrantShortlist */
            qdrantShortlist?: (number|null);

            /** PrefilterPolicy scoreThreshold */
            scoreThreshold?: (number|null);

            /** PrefilterPolicy allowPgvectorFallback */
            allowPgvectorFallback?: (boolean|null);
        }

        /** Represents a PrefilterPolicy. */
        class PrefilterPolicy implements IPrefilterPolicy {

            /**
             * Constructs a new PrefilterPolicy.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IPrefilterPolicy);

            /** PrefilterPolicy enableQdrant. */
            public enableQdrant: boolean;

            /** PrefilterPolicy qdrantShortlist. */
            public qdrantShortlist: number;

            /** PrefilterPolicy scoreThreshold. */
            public scoreThreshold: number;

            /** PrefilterPolicy allowPgvectorFallback. */
            public allowPgvectorFallback: boolean;

            /**
             * Encodes the specified PrefilterPolicy message. Does not implicitly {@link yorha.retrieval.PrefilterPolicy.verify|verify} messages.
             * @param message PrefilterPolicy message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IPrefilterPolicy, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified PrefilterPolicy message, length delimited. Does not implicitly {@link yorha.retrieval.PrefilterPolicy.verify|verify} messages.
             * @param message PrefilterPolicy message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IPrefilterPolicy, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a PrefilterPolicy message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns PrefilterPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.PrefilterPolicy;

            /**
             * Decodes a PrefilterPolicy message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns PrefilterPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.PrefilterPolicy;

            /**
             * Gets the default type url for PrefilterPolicy
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a RankPolicy. */
        interface IRankPolicy {

            /** RankPolicy cosineWeight */
            cosineWeight?: (number|null);

            /** RankPolicy citationsWeight */
            citationsWeight?: (number|null);

            /** RankPolicy jurisdictionWeight */
            jurisdictionWeight?: (number|null);
        }

        /** Represents a RankPolicy. */
        class RankPolicy implements IRankPolicy {

            /**
             * Constructs a new RankPolicy.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IRankPolicy);

            /** RankPolicy cosineWeight. */
            public cosineWeight: number;

            /** RankPolicy citationsWeight. */
            public citationsWeight: number;

            /** RankPolicy jurisdictionWeight. */
            public jurisdictionWeight: number;

            /**
             * Encodes the specified RankPolicy message. Does not implicitly {@link yorha.retrieval.RankPolicy.verify|verify} messages.
             * @param message RankPolicy message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IRankPolicy, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified RankPolicy message, length delimited. Does not implicitly {@link yorha.retrieval.RankPolicy.verify|verify} messages.
             * @param message RankPolicy message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IRankPolicy, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a RankPolicy message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns RankPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.RankPolicy;

            /**
             * Decodes a RankPolicy message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns RankPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.RankPolicy;

            /**
             * Gets the default type url for RankPolicy
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a RetrievalProgress. */
        interface IRetrievalProgress {

            /** RetrievalProgress stage */
            stage?: (string|null);

            /** RetrievalProgress current */
            current?: (number|null);

            /** RetrievalProgress total */
            total?: (number|null);

            /** RetrievalProgress message */
            message?: (string|null);
        }

        /** Represents a RetrievalProgress. */
        class RetrievalProgress implements IRetrievalProgress {

            /**
             * Constructs a new RetrievalProgress.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IRetrievalProgress);

            /** RetrievalProgress stage. */
            public stage: string;

            /** RetrievalProgress current. */
            public current: number;

            /** RetrievalProgress total. */
            public total: number;

            /** RetrievalProgress message. */
            public message: string;

            /**
             * Encodes the specified RetrievalProgress message. Does not implicitly {@link yorha.retrieval.RetrievalProgress.verify|verify} messages.
             * @param message RetrievalProgress message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IRetrievalProgress, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified RetrievalProgress message, length delimited. Does not implicitly {@link yorha.retrieval.RetrievalProgress.verify|verify} messages.
             * @param message RetrievalProgress message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IRetrievalProgress, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a RetrievalProgress message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns RetrievalProgress
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.RetrievalProgress;

            /**
             * Decodes a RetrievalProgress message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns RetrievalProgress
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.RetrievalProgress;

            /**
             * Gets the default type url for RetrievalProgress
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a RetrievalError. */
        interface IRetrievalError {

            /** RetrievalError code */
            code?: (string|null);

            /** RetrievalError message */
            message?: (string|null);

            /** RetrievalError detailsJson */
            detailsJson?: (string|null);
        }

        /** Represents a RetrievalError. */
        class RetrievalError implements IRetrievalError {

            /**
             * Constructs a new RetrievalError.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IRetrievalError);

            /** RetrievalError code. */
            public code: string;

            /** RetrievalError message. */
            public message: string;

            /** RetrievalError detailsJson. */
            public detailsJson: string;

            /**
             * Encodes the specified RetrievalError message. Does not implicitly {@link yorha.retrieval.RetrievalError.verify|verify} messages.
             * @param message RetrievalError message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IRetrievalError, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified RetrievalError message, length delimited. Does not implicitly {@link yorha.retrieval.RetrievalError.verify|verify} messages.
             * @param message RetrievalError message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IRetrievalError, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a RetrievalError message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns RetrievalError
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.RetrievalError;

            /**
             * Decodes a RetrievalError message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns RetrievalError
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.RetrievalError;

            /**
             * Gets the default type url for RetrievalError
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a RetrievalSourceMetadata. */
        interface IRetrievalSourceMetadata {

            /** RetrievalSourceMetadata source */
            source?: (string|null);

            /** RetrievalSourceMetadata sourceId */
            sourceId?: (string|null);

            /** RetrievalSourceMetadata sourceType */
            sourceType?: (string|null);

            /** RetrievalSourceMetadata url */
            url?: (string|null);

            /** RetrievalSourceMetadata title */
            title?: (string|null);

            /** RetrievalSourceMetadata filePath */
            filePath?: (string|null);

            /** RetrievalSourceMetadata routeId */
            routeId?: (string|null);

            /** RetrievalSourceMetadata collection */
            collection?: (string|null);

            /** RetrievalSourceMetadata metadata */
            metadata?: ({ [k: string]: string }|null);
        }

        /** Represents a RetrievalSourceMetadata. */
        class RetrievalSourceMetadata implements IRetrievalSourceMetadata {

            /**
             * Constructs a new RetrievalSourceMetadata.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IRetrievalSourceMetadata);

            /** RetrievalSourceMetadata source. */
            public source: string;

            /** RetrievalSourceMetadata sourceId. */
            public sourceId: string;

            /** RetrievalSourceMetadata sourceType. */
            public sourceType: string;

            /** RetrievalSourceMetadata url. */
            public url: string;

            /** RetrievalSourceMetadata title. */
            public title: string;

            /** RetrievalSourceMetadata filePath. */
            public filePath: string;

            /** RetrievalSourceMetadata routeId. */
            public routeId: string;

            /** RetrievalSourceMetadata collection. */
            public collection: string;

            /** RetrievalSourceMetadata metadata. */
            public metadata: { [k: string]: string };

            /**
             * Encodes the specified RetrievalSourceMetadata message. Does not implicitly {@link yorha.retrieval.RetrievalSourceMetadata.verify|verify} messages.
             * @param message RetrievalSourceMetadata message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IRetrievalSourceMetadata, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified RetrievalSourceMetadata message, length delimited. Does not implicitly {@link yorha.retrieval.RetrievalSourceMetadata.verify|verify} messages.
             * @param message RetrievalSourceMetadata message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IRetrievalSourceMetadata, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a RetrievalSourceMetadata message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns RetrievalSourceMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.RetrievalSourceMetadata;

            /**
             * Decodes a RetrievalSourceMetadata message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns RetrievalSourceMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.RetrievalSourceMetadata;

            /**
             * Gets the default type url for RetrievalSourceMetadata
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a RetrievalScoreMetadata. */
        interface IRetrievalScoreMetadata {

            /** RetrievalScoreMetadata score */
            score?: (number|null);

            /** RetrievalScoreMetadata semanticScore */
            semanticScore?: (number|null);

            /** RetrievalScoreMetadata lexicalScore */
            lexicalScore?: (number|null);

            /** RetrievalScoreMetadata rerankScore */
            rerankScore?: (number|null);
        }

        /** Represents a RetrievalScoreMetadata. */
        class RetrievalScoreMetadata implements IRetrievalScoreMetadata {

            /**
             * Constructs a new RetrievalScoreMetadata.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IRetrievalScoreMetadata);

            /** RetrievalScoreMetadata score. */
            public score: number;

            /** RetrievalScoreMetadata semanticScore. */
            public semanticScore: number;

            /** RetrievalScoreMetadata lexicalScore. */
            public lexicalScore: number;

            /** RetrievalScoreMetadata rerankScore. */
            public rerankScore: number;

            /**
             * Encodes the specified RetrievalScoreMetadata message. Does not implicitly {@link yorha.retrieval.RetrievalScoreMetadata.verify|verify} messages.
             * @param message RetrievalScoreMetadata message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IRetrievalScoreMetadata, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified RetrievalScoreMetadata message, length delimited. Does not implicitly {@link yorha.retrieval.RetrievalScoreMetadata.verify|verify} messages.
             * @param message RetrievalScoreMetadata message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IRetrievalScoreMetadata, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a RetrievalScoreMetadata message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns RetrievalScoreMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.RetrievalScoreMetadata;

            /**
             * Decodes a RetrievalScoreMetadata message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns RetrievalScoreMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.RetrievalScoreMetadata;

            /**
             * Gets the default type url for RetrievalScoreMetadata
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a RetrievalClusterMetadata. */
        interface IRetrievalClusterMetadata {

            /** RetrievalClusterMetadata clusterId */
            clusterId?: (string|null);

            /** RetrievalClusterMetadata clusterType */
            clusterType?: (string|null);

            /** RetrievalClusterMetadata gpuCluster */
            gpuCluster?: (number|null);

            /** RetrievalClusterMetadata somCluster */
            somCluster?: (number|null);

            /** RetrievalClusterMetadata bmuRow */
            bmuRow?: (number|null);

            /** RetrievalClusterMetadata bmuCol */
            bmuCol?: (number|null);
        }

        /** Represents a RetrievalClusterMetadata. */
        class RetrievalClusterMetadata implements IRetrievalClusterMetadata {

            /**
             * Constructs a new RetrievalClusterMetadata.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IRetrievalClusterMetadata);

            /** RetrievalClusterMetadata clusterId. */
            public clusterId: string;

            /** RetrievalClusterMetadata clusterType. */
            public clusterType: string;

            /** RetrievalClusterMetadata gpuCluster. */
            public gpuCluster: number;

            /** RetrievalClusterMetadata somCluster. */
            public somCluster: number;

            /** RetrievalClusterMetadata bmuRow. */
            public bmuRow: number;

            /** RetrievalClusterMetadata bmuCol. */
            public bmuCol: number;

            /**
             * Encodes the specified RetrievalClusterMetadata message. Does not implicitly {@link yorha.retrieval.RetrievalClusterMetadata.verify|verify} messages.
             * @param message RetrievalClusterMetadata message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IRetrievalClusterMetadata, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified RetrievalClusterMetadata message, length delimited. Does not implicitly {@link yorha.retrieval.RetrievalClusterMetadata.verify|verify} messages.
             * @param message RetrievalClusterMetadata message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IRetrievalClusterMetadata, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a RetrievalClusterMetadata message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns RetrievalClusterMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.RetrievalClusterMetadata;

            /**
             * Decodes a RetrievalClusterMetadata message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns RetrievalClusterMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.RetrievalClusterMetadata;

            /**
             * Gets the default type url for RetrievalClusterMetadata
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a TransportTimestamps. */
        interface ITransportTimestamps {

            /** TransportTimestamps createdAt */
            createdAt?: (string|null);

            /** TransportTimestamps updatedAt */
            updatedAt?: (string|null);

            /** TransportTimestamps indexedAt */
            indexedAt?: (string|null);
        }

        /** Represents a TransportTimestamps. */
        class TransportTimestamps implements ITransportTimestamps {

            /**
             * Constructs a new TransportTimestamps.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ITransportTimestamps);

            /** TransportTimestamps createdAt. */
            public createdAt: string;

            /** TransportTimestamps updatedAt. */
            public updatedAt: string;

            /** TransportTimestamps indexedAt. */
            public indexedAt: string;

            /**
             * Encodes the specified TransportTimestamps message. Does not implicitly {@link yorha.retrieval.TransportTimestamps.verify|verify} messages.
             * @param message TransportTimestamps message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ITransportTimestamps, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified TransportTimestamps message, length delimited. Does not implicitly {@link yorha.retrieval.TransportTimestamps.verify|verify} messages.
             * @param message TransportTimestamps message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ITransportTimestamps, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a TransportTimestamps message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns TransportTimestamps
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.TransportTimestamps;

            /**
             * Decodes a TransportTimestamps message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns TransportTimestamps
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.TransportTimestamps;

            /**
             * Gets the default type url for TransportTimestamps
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a SearchChunksRequest. */
        interface ISearchChunksRequest {

            /** SearchChunksRequest query */
            query?: (string|null);

            /** SearchChunksRequest limit */
            limit?: (number|null);

            /** SearchChunksRequest collection */
            collection?: (string|null);

            /** SearchChunksRequest filters */
            filters?: (string[]|null);

            /** SearchChunksRequest ids */
            ids?: (string[]|null);

            /** SearchChunksRequest tags */
            tags?: (string[]|null);

            /** SearchChunksRequest sourceFilter */
            sourceFilter?: (string[]|null);

            /** SearchChunksRequest clusterIds */
            clusterIds?: (string[]|null);

            /** SearchChunksRequest somClusters */
            somClusters?: (number[]|null);

            /** SearchChunksRequest createdAfter */
            createdAfter?: (string|null);

            /** SearchChunksRequest updatedAfter */
            updatedAfter?: (string|null);
        }

        /** Represents a SearchChunksRequest. */
        class SearchChunksRequest implements ISearchChunksRequest {

            /**
             * Constructs a new SearchChunksRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ISearchChunksRequest);

            /** SearchChunksRequest query. */
            public query: string;

            /** SearchChunksRequest limit. */
            public limit: number;

            /** SearchChunksRequest collection. */
            public collection: string;

            /** SearchChunksRequest filters. */
            public filters: string[];

            /** SearchChunksRequest ids. */
            public ids: string[];

            /** SearchChunksRequest tags. */
            public tags: string[];

            /** SearchChunksRequest sourceFilter. */
            public sourceFilter: string[];

            /** SearchChunksRequest clusterIds. */
            public clusterIds: string[];

            /** SearchChunksRequest somClusters. */
            public somClusters: number[];

            /** SearchChunksRequest createdAfter. */
            public createdAfter: string;

            /** SearchChunksRequest updatedAfter. */
            public updatedAfter: string;

            /**
             * Encodes the specified SearchChunksRequest message. Does not implicitly {@link yorha.retrieval.SearchChunksRequest.verify|verify} messages.
             * @param message SearchChunksRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ISearchChunksRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified SearchChunksRequest message, length delimited. Does not implicitly {@link yorha.retrieval.SearchChunksRequest.verify|verify} messages.
             * @param message SearchChunksRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ISearchChunksRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a SearchChunksRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns SearchChunksRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.SearchChunksRequest;

            /**
             * Decodes a SearchChunksRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns SearchChunksRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.SearchChunksRequest;

            /**
             * Gets the default type url for SearchChunksRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a SearchChunkResult. */
        interface ISearchChunkResult {

            /** SearchChunkResult id */
            id?: (string|null);

            /** SearchChunkResult chunkId */
            chunkId?: (string|null);

            /** SearchChunkResult contentPreview */
            contentPreview?: (string|null);

            /** SearchChunkResult kind */
            kind?: (string|null);

            /** SearchChunkResult httpMethod */
            httpMethod?: (string|null);

            /** SearchChunkResult routeId */
            routeId?: (string|null);

            /** SearchChunkResult startLine */
            startLine?: (number|null);

            /** SearchChunkResult endLine */
            endLine?: (number|null);

            /** SearchChunkResult tags */
            tags?: (string[]|null);

            /** SearchChunkResult sourceMetadata */
            sourceMetadata?: (yorha.retrieval.IRetrievalSourceMetadata|null);

            /** SearchChunkResult scoreMetadata */
            scoreMetadata?: (yorha.retrieval.IRetrievalScoreMetadata|null);

            /** SearchChunkResult clusterMetadata */
            clusterMetadata?: (yorha.retrieval.IRetrievalClusterMetadata|null);

            /** SearchChunkResult timestamps */
            timestamps?: (yorha.retrieval.ITransportTimestamps|null);

            /** SearchChunkResult filePath */
            filePath?: (string|null);
        }

        /** Represents a SearchChunkResult. */
        class SearchChunkResult implements ISearchChunkResult {

            /**
             * Constructs a new SearchChunkResult.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ISearchChunkResult);

            /** SearchChunkResult id. */
            public id: string;

            /** SearchChunkResult chunkId. */
            public chunkId: string;

            /** SearchChunkResult contentPreview. */
            public contentPreview: string;

            /** SearchChunkResult kind. */
            public kind: string;

            /** SearchChunkResult httpMethod. */
            public httpMethod: string;

            /** SearchChunkResult routeId. */
            public routeId: string;

            /** SearchChunkResult startLine. */
            public startLine: number;

            /** SearchChunkResult endLine. */
            public endLine: number;

            /** SearchChunkResult tags. */
            public tags: string[];

            /** SearchChunkResult sourceMetadata. */
            public sourceMetadata?: (yorha.retrieval.IRetrievalSourceMetadata|null);

            /** SearchChunkResult scoreMetadata. */
            public scoreMetadata?: (yorha.retrieval.IRetrievalScoreMetadata|null);

            /** SearchChunkResult clusterMetadata. */
            public clusterMetadata?: (yorha.retrieval.IRetrievalClusterMetadata|null);

            /** SearchChunkResult timestamps. */
            public timestamps?: (yorha.retrieval.ITransportTimestamps|null);

            /** SearchChunkResult filePath. */
            public filePath: string;

            /**
             * Encodes the specified SearchChunkResult message. Does not implicitly {@link yorha.retrieval.SearchChunkResult.verify|verify} messages.
             * @param message SearchChunkResult message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ISearchChunkResult, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified SearchChunkResult message, length delimited. Does not implicitly {@link yorha.retrieval.SearchChunkResult.verify|verify} messages.
             * @param message SearchChunkResult message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ISearchChunkResult, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a SearchChunkResult message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns SearchChunkResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.SearchChunkResult;

            /**
             * Decodes a SearchChunkResult message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns SearchChunkResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.SearchChunkResult;

            /**
             * Gets the default type url for SearchChunkResult
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a SearchChunksResponse. */
        interface ISearchChunksResponse {

            /** SearchChunksResponse results */
            results?: (yorha.retrieval.ISearchChunkResult[]|null);

            /** SearchChunksResponse totalMs */
            totalMs?: (number|null);
        }

        /** Represents a SearchChunksResponse. */
        class SearchChunksResponse implements ISearchChunksResponse {

            /**
             * Constructs a new SearchChunksResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ISearchChunksResponse);

            /** SearchChunksResponse results. */
            public results: yorha.retrieval.ISearchChunkResult[];

            /** SearchChunksResponse totalMs. */
            public totalMs: number;

            /**
             * Encodes the specified SearchChunksResponse message. Does not implicitly {@link yorha.retrieval.SearchChunksResponse.verify|verify} messages.
             * @param message SearchChunksResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ISearchChunksResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified SearchChunksResponse message, length delimited. Does not implicitly {@link yorha.retrieval.SearchChunksResponse.verify|verify} messages.
             * @param message SearchChunksResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ISearchChunksResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a SearchChunksResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns SearchChunksResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.SearchChunksResponse;

            /**
             * Decodes a SearchChunksResponse message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns SearchChunksResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.SearchChunksResponse;

            /**
             * Gets the default type url for SearchChunksResponse
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a ClusterSummaryRequest. */
        interface IClusterSummaryRequest {

            /** ClusterSummaryRequest clusterId */
            clusterId?: (number|null);

            /** ClusterSummaryRequest clusterType */
            clusterType?: (string|null);
        }

        /** Represents a ClusterSummaryRequest. */
        class ClusterSummaryRequest implements IClusterSummaryRequest {

            /**
             * Constructs a new ClusterSummaryRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IClusterSummaryRequest);

            /** ClusterSummaryRequest clusterId. */
            public clusterId: number;

            /** ClusterSummaryRequest clusterType. */
            public clusterType: string;

            /**
             * Encodes the specified ClusterSummaryRequest message. Does not implicitly {@link yorha.retrieval.ClusterSummaryRequest.verify|verify} messages.
             * @param message ClusterSummaryRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IClusterSummaryRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ClusterSummaryRequest message, length delimited. Does not implicitly {@link yorha.retrieval.ClusterSummaryRequest.verify|verify} messages.
             * @param message ClusterSummaryRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IClusterSummaryRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ClusterSummaryRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ClusterSummaryRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.ClusterSummaryRequest;

            /**
             * Decodes a ClusterSummaryRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ClusterSummaryRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.ClusterSummaryRequest;

            /**
             * Gets the default type url for ClusterSummaryRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a ClusterSummaryResponse. */
        interface IClusterSummaryResponse {

            /** ClusterSummaryResponse clusterId */
            clusterId?: (number|null);

            /** ClusterSummaryResponse summary */
            summary?: (string|null);

            /** ClusterSummaryResponse patterns */
            patterns?: (string[]|null);

            /** ClusterSummaryResponse keywords */
            keywords?: (string[]|null);

            /** ClusterSummaryResponse metadata */
            metadata?: ({ [k: string]: string }|null);
        }

        /** Represents a ClusterSummaryResponse. */
        class ClusterSummaryResponse implements IClusterSummaryResponse {

            /**
             * Constructs a new ClusterSummaryResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IClusterSummaryResponse);

            /** ClusterSummaryResponse clusterId. */
            public clusterId: number;

            /** ClusterSummaryResponse summary. */
            public summary: string;

            /** ClusterSummaryResponse patterns. */
            public patterns: string[];

            /** ClusterSummaryResponse keywords. */
            public keywords: string[];

            /** ClusterSummaryResponse metadata. */
            public metadata: { [k: string]: string };

            /**
             * Encodes the specified ClusterSummaryResponse message. Does not implicitly {@link yorha.retrieval.ClusterSummaryResponse.verify|verify} messages.
             * @param message ClusterSummaryResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IClusterSummaryResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ClusterSummaryResponse message, length delimited. Does not implicitly {@link yorha.retrieval.ClusterSummaryResponse.verify|verify} messages.
             * @param message ClusterSummaryResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IClusterSummaryResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ClusterSummaryResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ClusterSummaryResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.ClusterSummaryResponse;

            /**
             * Decodes a ClusterSummaryResponse message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ClusterSummaryResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.ClusterSummaryResponse;

            /**
             * Gets the default type url for ClusterSummaryResponse
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of an AstExpansionRequest. */
        interface IAstExpansionRequest {

            /** AstExpansionRequest symbol */
            symbol?: (string|null);

            /** AstExpansionRequest filePath */
            filePath?: (string|null);

            /** AstExpansionRequest depth */
            depth?: (number|null);
        }

        /** Represents an AstExpansionRequest. */
        class AstExpansionRequest implements IAstExpansionRequest {

            /**
             * Constructs a new AstExpansionRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IAstExpansionRequest);

            /** AstExpansionRequest symbol. */
            public symbol: string;

            /** AstExpansionRequest filePath. */
            public filePath: string;

            /** AstExpansionRequest depth. */
            public depth: number;

            /**
             * Encodes the specified AstExpansionRequest message. Does not implicitly {@link yorha.retrieval.AstExpansionRequest.verify|verify} messages.
             * @param message AstExpansionRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IAstExpansionRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified AstExpansionRequest message, length delimited. Does not implicitly {@link yorha.retrieval.AstExpansionRequest.verify|verify} messages.
             * @param message AstExpansionRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IAstExpansionRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an AstExpansionRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns AstExpansionRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.AstExpansionRequest;

            /**
             * Decodes an AstExpansionRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns AstExpansionRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.AstExpansionRequest;

            /**
             * Gets the default type url for AstExpansionRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of an AstExpansionResponse. */
        interface IAstExpansionResponse {

            /** AstExpansionResponse neighbors */
            neighbors?: (yorha.retrieval.IAstNode[]|null);

            /** AstExpansionResponse edges */
            edges?: (yorha.retrieval.IAstEdge[]|null);
        }

        /** Represents an AstExpansionResponse. */
        class AstExpansionResponse implements IAstExpansionResponse {

            /**
             * Constructs a new AstExpansionResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IAstExpansionResponse);

            /** AstExpansionResponse neighbors. */
            public neighbors: yorha.retrieval.IAstNode[];

            /** AstExpansionResponse edges. */
            public edges: yorha.retrieval.IAstEdge[];

            /**
             * Encodes the specified AstExpansionResponse message. Does not implicitly {@link yorha.retrieval.AstExpansionResponse.verify|verify} messages.
             * @param message AstExpansionResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IAstExpansionResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified AstExpansionResponse message, length delimited. Does not implicitly {@link yorha.retrieval.AstExpansionResponse.verify|verify} messages.
             * @param message AstExpansionResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IAstExpansionResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an AstExpansionResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns AstExpansionResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.AstExpansionResponse;

            /**
             * Decodes an AstExpansionResponse message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns AstExpansionResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.AstExpansionResponse;

            /**
             * Gets the default type url for AstExpansionResponse
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of an AstNode. */
        interface IAstNode {

            /** AstNode id */
            id?: (string|null);

            /** AstNode symbol */
            symbol?: (string|null);

            /** AstNode kind */
            kind?: (string|null);

            /** AstNode filePath */
            filePath?: (string|null);
        }

        /** Represents an AstNode. */
        class AstNode implements IAstNode {

            /**
             * Constructs a new AstNode.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IAstNode);

            /** AstNode id. */
            public id: string;

            /** AstNode symbol. */
            public symbol: string;

            /** AstNode kind. */
            public kind: string;

            /** AstNode filePath. */
            public filePath: string;

            /**
             * Encodes the specified AstNode message. Does not implicitly {@link yorha.retrieval.AstNode.verify|verify} messages.
             * @param message AstNode message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IAstNode, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified AstNode message, length delimited. Does not implicitly {@link yorha.retrieval.AstNode.verify|verify} messages.
             * @param message AstNode message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IAstNode, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an AstNode message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns AstNode
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.AstNode;

            /**
             * Decodes an AstNode message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns AstNode
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.AstNode;

            /**
             * Gets the default type url for AstNode
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of an AstEdge. */
        interface IAstEdge {

            /** AstEdge sourceId */
            sourceId?: (string|null);

            /** AstEdge targetId */
            targetId?: (string|null);

            /** AstEdge edgeType */
            edgeType?: (string|null);
        }

        /** Represents an AstEdge. */
        class AstEdge implements IAstEdge {

            /**
             * Constructs a new AstEdge.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IAstEdge);

            /** AstEdge sourceId. */
            public sourceId: string;

            /** AstEdge targetId. */
            public targetId: string;

            /** AstEdge edgeType. */
            public edgeType: string;

            /**
             * Encodes the specified AstEdge message. Does not implicitly {@link yorha.retrieval.AstEdge.verify|verify} messages.
             * @param message AstEdge message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IAstEdge, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified AstEdge message, length delimited. Does not implicitly {@link yorha.retrieval.AstEdge.verify|verify} messages.
             * @param message AstEdge message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IAstEdge, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an AstEdge message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns AstEdge
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.AstEdge;

            /**
             * Decodes an AstEdge message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns AstEdge
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.AstEdge;

            /**
             * Gets the default type url for AstEdge
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a TopologyRequest. */
        interface ITopologyRequest {

            /** TopologyRequest query */
            query?: (string|null);

            /** TopologyRequest bmuRow */
            bmuRow?: (number|null);

            /** TopologyRequest bmuCol */
            bmuCol?: (number|null);

            /** TopologyRequest radius */
            radius?: (number|null);

            /** TopologyRequest ids */
            ids?: (string[]|null);

            /** TopologyRequest tags */
            tags?: (string[]|null);

            /** TopologyRequest createdAfter */
            createdAfter?: (string|null);

            /** TopologyRequest updatedAfter */
            updatedAfter?: (string|null);
        }

        /** Represents a TopologyRequest. */
        class TopologyRequest implements ITopologyRequest {

            /**
             * Constructs a new TopologyRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ITopologyRequest);

            /** TopologyRequest query. */
            public query: string;

            /** TopologyRequest bmuRow. */
            public bmuRow: number;

            /** TopologyRequest bmuCol. */
            public bmuCol: number;

            /** TopologyRequest radius. */
            public radius: number;

            /** TopologyRequest ids. */
            public ids: string[];

            /** TopologyRequest tags. */
            public tags: string[];

            /** TopologyRequest createdAfter. */
            public createdAfter: string;

            /** TopologyRequest updatedAfter. */
            public updatedAfter: string;

            /**
             * Encodes the specified TopologyRequest message. Does not implicitly {@link yorha.retrieval.TopologyRequest.verify|verify} messages.
             * @param message TopologyRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ITopologyRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified TopologyRequest message, length delimited. Does not implicitly {@link yorha.retrieval.TopologyRequest.verify|verify} messages.
             * @param message TopologyRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ITopologyRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a TopologyRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns TopologyRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.TopologyRequest;

            /**
             * Decodes a TopologyRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns TopologyRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.TopologyRequest;

            /**
             * Gets the default type url for TopologyRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a TopologyResponse. */
        interface ITopologyResponse {

            /** TopologyResponse neighbors */
            neighbors?: (yorha.retrieval.ISearchChunkResult[]|null);

            /** TopologyResponse somMetadataJson */
            somMetadataJson?: (string|null);

            /** TopologyResponse clusterMetadata */
            clusterMetadata?: (yorha.retrieval.IRetrievalClusterMetadata|null);
        }

        /** Represents a TopologyResponse. */
        class TopologyResponse implements ITopologyResponse {

            /**
             * Constructs a new TopologyResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.ITopologyResponse);

            /** TopologyResponse neighbors. */
            public neighbors: yorha.retrieval.ISearchChunkResult[];

            /** TopologyResponse somMetadataJson. */
            public somMetadataJson: string;

            /** TopologyResponse clusterMetadata. */
            public clusterMetadata?: (yorha.retrieval.IRetrievalClusterMetadata|null);

            /**
             * Encodes the specified TopologyResponse message. Does not implicitly {@link yorha.retrieval.TopologyResponse.verify|verify} messages.
             * @param message TopologyResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.ITopologyResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified TopologyResponse message, length delimited. Does not implicitly {@link yorha.retrieval.TopologyResponse.verify|verify} messages.
             * @param message TopologyResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.ITopologyResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a TopologyResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns TopologyResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.TopologyResponse;

            /**
             * Decodes a TopologyResponse message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns TopologyResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.TopologyResponse;

            /**
             * Gets the default type url for TopologyResponse
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a ResearchContextRequest. */
        interface IResearchContextRequest {

            /** ResearchContextRequest query */
            query?: (string|null);

            /** ResearchContextRequest limit */
            limit?: (number|null);

            /** ResearchContextRequest sourceFilter */
            sourceFilter?: (string[]|null);

            /** ResearchContextRequest scoreThreshold */
            scoreThreshold?: (number|null);

            /** ResearchContextRequest queryEmbedding */
            queryEmbedding?: (number[]|null);

            /** ResearchContextRequest ids */
            ids?: (string[]|null);

            /** ResearchContextRequest tags */
            tags?: (string[]|null);

            /** ResearchContextRequest clusterIds */
            clusterIds?: (string[]|null);

            /** ResearchContextRequest somClusters */
            somClusters?: (number[]|null);

            /** ResearchContextRequest createdAfter */
            createdAfter?: (string|null);

            /** ResearchContextRequest updatedAfter */
            updatedAfter?: (string|null);
        }

        /** Represents a ResearchContextRequest. */
        class ResearchContextRequest implements IResearchContextRequest {

            /**
             * Constructs a new ResearchContextRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IResearchContextRequest);

            /** ResearchContextRequest query. */
            public query: string;

            /** ResearchContextRequest limit. */
            public limit: number;

            /** ResearchContextRequest sourceFilter. */
            public sourceFilter: string[];

            /** ResearchContextRequest scoreThreshold. */
            public scoreThreshold: number;

            /** ResearchContextRequest queryEmbedding. */
            public queryEmbedding: number[];

            /** ResearchContextRequest ids. */
            public ids: string[];

            /** ResearchContextRequest tags. */
            public tags: string[];

            /** ResearchContextRequest clusterIds. */
            public clusterIds: string[];

            /** ResearchContextRequest somClusters. */
            public somClusters: number[];

            /** ResearchContextRequest createdAfter. */
            public createdAfter: string;

            /** ResearchContextRequest updatedAfter. */
            public updatedAfter: string;

            /**
             * Encodes the specified ResearchContextRequest message. Does not implicitly {@link yorha.retrieval.ResearchContextRequest.verify|verify} messages.
             * @param message ResearchContextRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IResearchContextRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ResearchContextRequest message, length delimited. Does not implicitly {@link yorha.retrieval.ResearchContextRequest.verify|verify} messages.
             * @param message ResearchContextRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IResearchContextRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ResearchContextRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ResearchContextRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.ResearchContextRequest;

            /**
             * Decodes a ResearchContextRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ResearchContextRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.ResearchContextRequest;

            /**
             * Gets the default type url for ResearchContextRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a ResearchContextChunk. */
        interface IResearchContextChunk {

            /** ResearchContextChunk id */
            id?: (string|null);

            /** ResearchContextChunk chunkId */
            chunkId?: (string|null);

            /** ResearchContextChunk source */
            source?: (string|null);

            /** ResearchContextChunk url */
            url?: (string|null);

            /** ResearchContextChunk title */
            title?: (string|null);

            /** ResearchContextChunk body */
            body?: (string|null);

            /** ResearchContextChunk score */
            score?: (number|null);

            /** ResearchContextChunk semanticTags */
            semanticTags?: (string[]|null);

            /** ResearchContextChunk tags */
            tags?: (string[]|null);

            /** ResearchContextChunk sourceMetadata */
            sourceMetadata?: (yorha.retrieval.IRetrievalSourceMetadata|null);

            /** ResearchContextChunk scoreMetadata */
            scoreMetadata?: (yorha.retrieval.IRetrievalScoreMetadata|null);

            /** ResearchContextChunk clusterMetadata */
            clusterMetadata?: (yorha.retrieval.IRetrievalClusterMetadata|null);

            /** ResearchContextChunk timestamps */
            timestamps?: (yorha.retrieval.ITransportTimestamps|null);
        }

        /** Represents a ResearchContextChunk. */
        class ResearchContextChunk implements IResearchContextChunk {

            /**
             * Constructs a new ResearchContextChunk.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IResearchContextChunk);

            /** ResearchContextChunk id. */
            public id: string;

            /** ResearchContextChunk chunkId. */
            public chunkId: string;

            /** ResearchContextChunk source. */
            public source: string;

            /** ResearchContextChunk url. */
            public url: string;

            /** ResearchContextChunk title. */
            public title: string;

            /** ResearchContextChunk body. */
            public body: string;

            /** ResearchContextChunk score. */
            public score: number;

            /** ResearchContextChunk semanticTags. */
            public semanticTags: string[];

            /** ResearchContextChunk tags. */
            public tags: string[];

            /** ResearchContextChunk sourceMetadata. */
            public sourceMetadata?: (yorha.retrieval.IRetrievalSourceMetadata|null);

            /** ResearchContextChunk scoreMetadata. */
            public scoreMetadata?: (yorha.retrieval.IRetrievalScoreMetadata|null);

            /** ResearchContextChunk clusterMetadata. */
            public clusterMetadata?: (yorha.retrieval.IRetrievalClusterMetadata|null);

            /** ResearchContextChunk timestamps. */
            public timestamps?: (yorha.retrieval.ITransportTimestamps|null);

            /**
             * Encodes the specified ResearchContextChunk message. Does not implicitly {@link yorha.retrieval.ResearchContextChunk.verify|verify} messages.
             * @param message ResearchContextChunk message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IResearchContextChunk, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ResearchContextChunk message, length delimited. Does not implicitly {@link yorha.retrieval.ResearchContextChunk.verify|verify} messages.
             * @param message ResearchContextChunk message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IResearchContextChunk, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ResearchContextChunk message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ResearchContextChunk
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.ResearchContextChunk;

            /**
             * Decodes a ResearchContextChunk message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ResearchContextChunk
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.ResearchContextChunk;

            /**
             * Gets the default type url for ResearchContextChunk
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a ResearchContextResponse. */
        interface IResearchContextResponse {

            /** ResearchContextResponse research */
            research?: (yorha.retrieval.IResearchContextChunk[]|null);

            /** ResearchContextResponse totalMs */
            totalMs?: (number|null);
        }

        /** Represents a ResearchContextResponse. */
        class ResearchContextResponse implements IResearchContextResponse {

            /**
             * Constructs a new ResearchContextResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IResearchContextResponse);

            /** ResearchContextResponse research. */
            public research: yorha.retrieval.IResearchContextChunk[];

            /** ResearchContextResponse totalMs. */
            public totalMs: number;

            /**
             * Encodes the specified ResearchContextResponse message. Does not implicitly {@link yorha.retrieval.ResearchContextResponse.verify|verify} messages.
             * @param message ResearchContextResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IResearchContextResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ResearchContextResponse message, length delimited. Does not implicitly {@link yorha.retrieval.ResearchContextResponse.verify|verify} messages.
             * @param message ResearchContextResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IResearchContextResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ResearchContextResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ResearchContextResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.ResearchContextResponse;

            /**
             * Decodes a ResearchContextResponse message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ResearchContextResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.ResearchContextResponse;

            /**
             * Gets the default type url for ResearchContextResponse
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a HealthRequest. */
        interface IHealthRequest {

            /** HealthRequest service */
            service?: (string|null);
        }

        /** Represents a HealthRequest. */
        class HealthRequest implements IHealthRequest {

            /**
             * Constructs a new HealthRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IHealthRequest);

            /** HealthRequest service. */
            public service: string;

            /**
             * Encodes the specified HealthRequest message. Does not implicitly {@link yorha.retrieval.HealthRequest.verify|verify} messages.
             * @param message HealthRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IHealthRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified HealthRequest message, length delimited. Does not implicitly {@link yorha.retrieval.HealthRequest.verify|verify} messages.
             * @param message HealthRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IHealthRequest, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a HealthRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns HealthRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.HealthRequest;

            /**
             * Decodes a HealthRequest message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns HealthRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.HealthRequest;

            /**
             * Gets the default type url for HealthRequest
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of a HealthResponse. */
        interface IHealthResponse {

            /** HealthResponse status */
            status?: (string|null);

            /** HealthResponse pgvectorConnected */
            pgvectorConnected?: (boolean|null);

            /** HealthResponse qdrantConnected */
            qdrantConnected?: (boolean|null);

            /** HealthResponse redisConnected */
            redisConnected?: (boolean|null);

            /** HealthResponse embeddingServiceUp */
            embeddingServiceUp?: (boolean|null);

            /** HealthResponse timestamp */
            timestamp?: (number|Long|null);
        }

        /** Represents a HealthResponse. */
        class HealthResponse implements IHealthResponse {

            /**
             * Constructs a new HealthResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.retrieval.IHealthResponse);

            /** HealthResponse status. */
            public status: string;

            /** HealthResponse pgvectorConnected. */
            public pgvectorConnected: boolean;

            /** HealthResponse qdrantConnected. */
            public qdrantConnected: boolean;

            /** HealthResponse redisConnected. */
            public redisConnected: boolean;

            /** HealthResponse embeddingServiceUp. */
            public embeddingServiceUp: boolean;

            /** HealthResponse timestamp. */
            public timestamp: (number|Long);

            /**
             * Encodes the specified HealthResponse message. Does not implicitly {@link yorha.retrieval.HealthResponse.verify|verify} messages.
             * @param message HealthResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.retrieval.IHealthResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified HealthResponse message, length delimited. Does not implicitly {@link yorha.retrieval.HealthResponse.verify|verify} messages.
             * @param message HealthResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.retrieval.IHealthResponse, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a HealthResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns HealthResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.retrieval.HealthResponse;

            /**
             * Decodes a HealthResponse message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns HealthResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.retrieval.HealthResponse;

            /**
             * Gets the default type url for HealthResponse
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }
    }

    /** Namespace shared. */
    namespace shared {

        /** Properties of a RunIds. */
        interface IRunIds {

            /** RunIds runId */
            runId?: (string|null);

            /** RunIds chunkId */
            chunkId?: (string|null);

            /** RunIds groupId */
            groupId?: (string|null);

            /** RunIds symbolId */
            symbolId?: (string|null);

            /** RunIds errorHash */
            errorHash?: (string|null);

            /** RunIds contentHash */
            contentHash?: (string|null);

            /** RunIds embeddingModel */
            embeddingModel?: (string|null);

            /** RunIds embeddingDim */
            embeddingDim?: (number|null);
        }

        /** Represents a RunIds. */
        class RunIds implements IRunIds {

            /**
             * Constructs a new RunIds.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.shared.IRunIds);

            /** RunIds runId. */
            public runId: string;

            /** RunIds chunkId. */
            public chunkId: string;

            /** RunIds groupId. */
            public groupId: string;

            /** RunIds symbolId. */
            public symbolId: string;

            /** RunIds errorHash. */
            public errorHash: string;

            /** RunIds contentHash. */
            public contentHash: string;

            /** RunIds embeddingModel. */
            public embeddingModel: string;

            /** RunIds embeddingDim. */
            public embeddingDim: number;

            /**
             * Encodes the specified RunIds message. Does not implicitly {@link yorha.shared.RunIds.verify|verify} messages.
             * @param message RunIds message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.shared.IRunIds, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified RunIds message, length delimited. Does not implicitly {@link yorha.shared.RunIds.verify|verify} messages.
             * @param message RunIds message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.shared.IRunIds, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a RunIds message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns RunIds
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.shared.RunIds;

            /**
             * Decodes a RunIds message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns RunIds
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.shared.RunIds;

            /**
             * Gets the default type url for RunIds
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        /** Properties of an ArtifactRef. */
        interface IArtifactRef {

            /** ArtifactRef runId */
            runId?: (string|null);

            /** ArtifactRef relativePath */
            relativePath?: (string|null);

            /** ArtifactRef format */
            format?: (string|null);

            /** ArtifactRef sizeBytes */
            sizeBytes?: (number|Long|null);

            /** ArtifactRef contentHash */
            contentHash?: (string|null);

            /** ArtifactRef createdAtUnix */
            createdAtUnix?: (number|Long|null);
        }

        /** Represents an ArtifactRef. */
        class ArtifactRef implements IArtifactRef {

            /**
             * Constructs a new ArtifactRef.
             * @param [properties] Properties to set
             */
            constructor(properties?: yorha.shared.IArtifactRef);

            /** ArtifactRef runId. */
            public runId: string;

            /** ArtifactRef relativePath. */
            public relativePath: string;

            /** ArtifactRef format. */
            public format: string;

            /** ArtifactRef sizeBytes. */
            public sizeBytes: (number|Long);

            /** ArtifactRef contentHash. */
            public contentHash: string;

            /** ArtifactRef createdAtUnix. */
            public createdAtUnix: (number|Long);

            /**
             * Encodes the specified ArtifactRef message. Does not implicitly {@link yorha.shared.ArtifactRef.verify|verify} messages.
             * @param message ArtifactRef message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: yorha.shared.IArtifactRef, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified ArtifactRef message, length delimited. Does not implicitly {@link yorha.shared.ArtifactRef.verify|verify} messages.
             * @param message ArtifactRef message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: yorha.shared.IArtifactRef, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ArtifactRef message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns ArtifactRef
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): yorha.shared.ArtifactRef;

            /**
             * Decodes an ArtifactRef message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns ArtifactRef
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): yorha.shared.ArtifactRef;

            /**
             * Gets the default type url for ArtifactRef
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }
    }
}
