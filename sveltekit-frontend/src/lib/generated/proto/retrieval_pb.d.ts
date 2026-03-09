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
             * Callback as used by {@link yorha.retrieval.RetrievalService#health}.
             * @param error Error, if any
             * @param [response] HealthResponse
             */
            type HealthCallback = (error: (Error|null), response?: yorha.retrieval.HealthResponse) => void;
        }

        /** Properties of an EvidenceSearchRequest. */
        interface IEvidenceSearchRequest {

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
}
