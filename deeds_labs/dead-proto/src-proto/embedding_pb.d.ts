import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace embedding. */
export namespace embedding {

    /** Represents an EmbeddingService */
    class EmbeddingService extends $protobuf.rpc.Service {

        /**
         * Constructs a new EmbeddingService service.
         * @param rpcImpl RPC implementation
         * @param [requestDelimited=false] Whether requests are length-delimited
         * @param [responseDelimited=false] Whether responses are length-delimited
         */
        constructor(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean);

        /**
         * Creates new EmbeddingService service using the specified rpc implementation.
         * @param rpcImpl RPC implementation
         * @param [requestDelimited=false] Whether requests are length-delimited
         * @param [responseDelimited=false] Whether responses are length-delimited
         * @returns RPC service. Useful where requests and/or responses are streamed.
         */
        public static create(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean): EmbeddingService;

        /**
         * Calls GenerateEmbeddings.
         * @param request EmbeddingRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and EmbeddingResponse
         */
        public generateEmbeddings(request: embedding.IEmbeddingRequest, callback: embedding.EmbeddingService.GenerateEmbeddingsCallback): void;

        /**
         * Calls GenerateEmbeddings.
         * @param request EmbeddingRequest message or plain object
         * @returns Promise
         */
        public generateEmbeddings(request: embedding.IEmbeddingRequest): Promise<embedding.EmbeddingResponse>;

        /**
         * Calls StreamEmbeddings.
         * @param request EmbeddingChunk message or plain object
         * @param callback Node-style callback called with the error, if any, and EmbeddingResult
         */
        public streamEmbeddings(request: embedding.IEmbeddingChunk, callback: embedding.EmbeddingService.StreamEmbeddingsCallback): void;

        /**
         * Calls StreamEmbeddings.
         * @param request EmbeddingChunk message or plain object
         * @returns Promise
         */
        public streamEmbeddings(request: embedding.IEmbeddingChunk): Promise<embedding.EmbeddingResult>;

        /**
         * Calls Health.
         * @param request HealthRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and HealthResponse
         */
        public health(request: embedding.IHealthRequest, callback: embedding.EmbeddingService.HealthCallback): void;

        /**
         * Calls Health.
         * @param request HealthRequest message or plain object
         * @returns Promise
         */
        public health(request: embedding.IHealthRequest): Promise<embedding.HealthResponse>;

        /**
         * Calls GetStats.
         * @param request StatsRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and StatsResponse
         */
        public getStats(request: embedding.IStatsRequest, callback: embedding.EmbeddingService.GetStatsCallback): void;

        /**
         * Calls GetStats.
         * @param request StatsRequest message or plain object
         * @returns Promise
         */
        public getStats(request: embedding.IStatsRequest): Promise<embedding.StatsResponse>;
    }

    namespace EmbeddingService {

        /**
         * Callback as used by {@link embedding.EmbeddingService#generateEmbeddings}.
         * @param error Error, if any
         * @param [response] EmbeddingResponse
         */
        type GenerateEmbeddingsCallback = (error: (Error|null), response?: embedding.EmbeddingResponse) => void;

        /**
         * Callback as used by {@link embedding.EmbeddingService#streamEmbeddings}.
         * @param error Error, if any
         * @param [response] EmbeddingResult
         */
        type StreamEmbeddingsCallback = (error: (Error|null), response?: embedding.EmbeddingResult) => void;

        /**
         * Callback as used by {@link embedding.EmbeddingService#health}.
         * @param error Error, if any
         * @param [response] HealthResponse
         */
        type HealthCallback = (error: (Error|null), response?: embedding.HealthResponse) => void;

        /**
         * Callback as used by {@link embedding.EmbeddingService#getStats}.
         * @param error Error, if any
         * @param [response] StatsResponse
         */
        type GetStatsCallback = (error: (Error|null), response?: embedding.StatsResponse) => void;
    }

    /** Properties of an EmbeddingChunk. */
    interface IEmbeddingChunk {

        /** EmbeddingChunk chunkId */
        chunkId?: (string|null);

        /** EmbeddingChunk text */
        text?: (string|null);

        /** EmbeddingChunk filePath */
        filePath?: (string|null);

        /** EmbeddingChunk language */
        language?: (string|null);

        /** EmbeddingChunk metadata */
        metadata?: ({ [k: string]: string }|null);
    }

    /** Single embedding request */
    class EmbeddingChunk implements IEmbeddingChunk {

        /**
         * Constructs a new EmbeddingChunk.
         * @param [properties] Properties to set
         */
        constructor(properties?: embedding.IEmbeddingChunk);

        /** EmbeddingChunk chunkId. */
        public chunkId: string;

        /** EmbeddingChunk text. */
        public text: string;

        /** EmbeddingChunk filePath. */
        public filePath: string;

        /** EmbeddingChunk language. */
        public language: string;

        /** EmbeddingChunk metadata. */
        public metadata: { [k: string]: string };

        /**
         * Creates a new EmbeddingChunk instance using the specified properties.
         * @param [properties] Properties to set
         * @returns EmbeddingChunk instance
         */
        public static create(properties?: embedding.IEmbeddingChunk): embedding.EmbeddingChunk;

        /**
         * Encodes the specified EmbeddingChunk message. Does not implicitly {@link embedding.EmbeddingChunk.verify|verify} messages.
         * @param message EmbeddingChunk message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: embedding.IEmbeddingChunk, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified EmbeddingChunk message, length delimited. Does not implicitly {@link embedding.EmbeddingChunk.verify|verify} messages.
         * @param message EmbeddingChunk message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: embedding.IEmbeddingChunk, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an EmbeddingChunk message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns EmbeddingChunk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): embedding.EmbeddingChunk;

        /**
         * Decodes an EmbeddingChunk message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns EmbeddingChunk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): embedding.EmbeddingChunk;

        /**
         * Verifies an EmbeddingChunk message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an EmbeddingChunk message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns EmbeddingChunk
         */
        public static fromObject(object: { [k: string]: any }): embedding.EmbeddingChunk;

        /**
         * Creates a plain object from an EmbeddingChunk message. Also converts values to other types if specified.
         * @param message EmbeddingChunk
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: embedding.EmbeddingChunk, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this EmbeddingChunk to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for EmbeddingChunk
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an EmbeddingRequest. */
    interface IEmbeddingRequest {

        /** EmbeddingRequest chunks */
        chunks?: (embedding.IEmbeddingChunk[]|null);

        /** EmbeddingRequest batchSize */
        batchSize?: (number|null);

        /** EmbeddingRequest normalize */
        normalize?: (boolean|null);

        /** EmbeddingRequest maxLength */
        maxLength?: (number|null);
    }

    /** Batch embedding request */
    class EmbeddingRequest implements IEmbeddingRequest {

        /**
         * Constructs a new EmbeddingRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: embedding.IEmbeddingRequest);

        /** EmbeddingRequest chunks. */
        public chunks: embedding.IEmbeddingChunk[];

        /** EmbeddingRequest batchSize. */
        public batchSize: number;

        /** EmbeddingRequest normalize. */
        public normalize: boolean;

        /** EmbeddingRequest maxLength. */
        public maxLength: number;

        /**
         * Creates a new EmbeddingRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns EmbeddingRequest instance
         */
        public static create(properties?: embedding.IEmbeddingRequest): embedding.EmbeddingRequest;

        /**
         * Encodes the specified EmbeddingRequest message. Does not implicitly {@link embedding.EmbeddingRequest.verify|verify} messages.
         * @param message EmbeddingRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: embedding.IEmbeddingRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified EmbeddingRequest message, length delimited. Does not implicitly {@link embedding.EmbeddingRequest.verify|verify} messages.
         * @param message EmbeddingRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: embedding.IEmbeddingRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an EmbeddingRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns EmbeddingRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): embedding.EmbeddingRequest;

        /**
         * Decodes an EmbeddingRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns EmbeddingRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): embedding.EmbeddingRequest;

        /**
         * Verifies an EmbeddingRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an EmbeddingRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns EmbeddingRequest
         */
        public static fromObject(object: { [k: string]: any }): embedding.EmbeddingRequest;

        /**
         * Creates a plain object from an EmbeddingRequest message. Also converts values to other types if specified.
         * @param message EmbeddingRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: embedding.EmbeddingRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this EmbeddingRequest to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for EmbeddingRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an Embedding. */
    interface IEmbedding {

        /** Embedding chunkId */
        chunkId?: (string|null);

        /** Embedding vector */
        vector?: (number[]|null);

        /** Embedding processingTimeMs */
        processingTimeMs?: (number|null);

        /** Embedding tokenCount */
        tokenCount?: (number|null);

        /** Embedding status */
        status?: (string|null);
    }

    /** Single embedding result */
    class Embedding implements IEmbedding {

        /**
         * Constructs a new Embedding.
         * @param [properties] Properties to set
         */
        constructor(properties?: embedding.IEmbedding);

        /** Embedding chunkId. */
        public chunkId: string;

        /** Embedding vector. */
        public vector: number[];

        /** Embedding processingTimeMs. */
        public processingTimeMs: number;

        /** Embedding tokenCount. */
        public tokenCount: number;

        /** Embedding status. */
        public status: string;

        /**
         * Creates a new Embedding instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Embedding instance
         */
        public static create(properties?: embedding.IEmbedding): embedding.Embedding;

        /**
         * Encodes the specified Embedding message. Does not implicitly {@link embedding.Embedding.verify|verify} messages.
         * @param message Embedding message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: embedding.IEmbedding, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Embedding message, length delimited. Does not implicitly {@link embedding.Embedding.verify|verify} messages.
         * @param message Embedding message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: embedding.IEmbedding, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an Embedding message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Embedding
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): embedding.Embedding;

        /**
         * Decodes an Embedding message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Embedding
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): embedding.Embedding;

        /**
         * Verifies an Embedding message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an Embedding message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Embedding
         */
        public static fromObject(object: { [k: string]: any }): embedding.Embedding;

        /**
         * Creates a plain object from an Embedding message. Also converts values to other types if specified.
         * @param message Embedding
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: embedding.Embedding, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Embedding to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for Embedding
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an EmbeddingResponse. */
    interface IEmbeddingResponse {

        /** EmbeddingResponse embeddings */
        embeddings?: (embedding.IEmbedding[]|null);

        /** EmbeddingResponse totalTimeMs */
        totalTimeMs?: (number|null);

        /** EmbeddingResponse modelName */
        modelName?: (string|null);

        /** EmbeddingResponse embeddingDimension */
        embeddingDimension?: (number|null);

        /** EmbeddingResponse status */
        status?: (string|null);
    }

    /** Batch embedding response */
    class EmbeddingResponse implements IEmbeddingResponse {

        /**
         * Constructs a new EmbeddingResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: embedding.IEmbeddingResponse);

        /** EmbeddingResponse embeddings. */
        public embeddings: embedding.IEmbedding[];

        /** EmbeddingResponse totalTimeMs. */
        public totalTimeMs: number;

        /** EmbeddingResponse modelName. */
        public modelName: string;

        /** EmbeddingResponse embeddingDimension. */
        public embeddingDimension: number;

        /** EmbeddingResponse status. */
        public status: string;

        /**
         * Creates a new EmbeddingResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns EmbeddingResponse instance
         */
        public static create(properties?: embedding.IEmbeddingResponse): embedding.EmbeddingResponse;

        /**
         * Encodes the specified EmbeddingResponse message. Does not implicitly {@link embedding.EmbeddingResponse.verify|verify} messages.
         * @param message EmbeddingResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: embedding.IEmbeddingResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified EmbeddingResponse message, length delimited. Does not implicitly {@link embedding.EmbeddingResponse.verify|verify} messages.
         * @param message EmbeddingResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: embedding.IEmbeddingResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an EmbeddingResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns EmbeddingResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): embedding.EmbeddingResponse;

        /**
         * Decodes an EmbeddingResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns EmbeddingResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): embedding.EmbeddingResponse;

        /**
         * Verifies an EmbeddingResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an EmbeddingResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns EmbeddingResponse
         */
        public static fromObject(object: { [k: string]: any }): embedding.EmbeddingResponse;

        /**
         * Creates a plain object from an EmbeddingResponse message. Also converts values to other types if specified.
         * @param message EmbeddingResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: embedding.EmbeddingResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this EmbeddingResponse to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for EmbeddingResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an EmbeddingResult. */
    interface IEmbeddingResult {

        /** EmbeddingResult chunkId */
        chunkId?: (string|null);

        /** EmbeddingResult vector */
        vector?: (number[]|null);

        /** EmbeddingResult processingTimeMs */
        processingTimeMs?: (number|null);

        /** EmbeddingResult tokenCount */
        tokenCount?: (number|null);

        /** EmbeddingResult status */
        status?: (string|null);

        /** EmbeddingResult sequenceNumber */
        sequenceNumber?: (number|null);
    }

    /** Streaming embedding result (for SSE) */
    class EmbeddingResult implements IEmbeddingResult {

        /**
         * Constructs a new EmbeddingResult.
         * @param [properties] Properties to set
         */
        constructor(properties?: embedding.IEmbeddingResult);

        /** EmbeddingResult chunkId. */
        public chunkId: string;

        /** EmbeddingResult vector. */
        public vector: number[];

        /** EmbeddingResult processingTimeMs. */
        public processingTimeMs: number;

        /** EmbeddingResult tokenCount. */
        public tokenCount: number;

        /** EmbeddingResult status. */
        public status: string;

        /** EmbeddingResult sequenceNumber. */
        public sequenceNumber: number;

        /**
         * Creates a new EmbeddingResult instance using the specified properties.
         * @param [properties] Properties to set
         * @returns EmbeddingResult instance
         */
        public static create(properties?: embedding.IEmbeddingResult): embedding.EmbeddingResult;

        /**
         * Encodes the specified EmbeddingResult message. Does not implicitly {@link embedding.EmbeddingResult.verify|verify} messages.
         * @param message EmbeddingResult message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: embedding.IEmbeddingResult, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified EmbeddingResult message, length delimited. Does not implicitly {@link embedding.EmbeddingResult.verify|verify} messages.
         * @param message EmbeddingResult message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: embedding.IEmbeddingResult, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an EmbeddingResult message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns EmbeddingResult
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): embedding.EmbeddingResult;

        /**
         * Decodes an EmbeddingResult message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns EmbeddingResult
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): embedding.EmbeddingResult;

        /**
         * Verifies an EmbeddingResult message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates an EmbeddingResult message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns EmbeddingResult
         */
        public static fromObject(object: { [k: string]: any }): embedding.EmbeddingResult;

        /**
         * Creates a plain object from an EmbeddingResult message. Also converts values to other types if specified.
         * @param message EmbeddingResult
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: embedding.EmbeddingResult, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this EmbeddingResult to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for EmbeddingResult
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

    /** Health check request */
    class HealthRequest implements IHealthRequest {

        /**
         * Constructs a new HealthRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: embedding.IHealthRequest);

        /** HealthRequest service. */
        public service: string;

        /**
         * Creates a new HealthRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns HealthRequest instance
         */
        public static create(properties?: embedding.IHealthRequest): embedding.HealthRequest;

        /**
         * Encodes the specified HealthRequest message. Does not implicitly {@link embedding.HealthRequest.verify|verify} messages.
         * @param message HealthRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: embedding.IHealthRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified HealthRequest message, length delimited. Does not implicitly {@link embedding.HealthRequest.verify|verify} messages.
         * @param message HealthRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: embedding.IHealthRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a HealthRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns HealthRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): embedding.HealthRequest;

        /**
         * Decodes a HealthRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns HealthRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): embedding.HealthRequest;

        /**
         * Verifies a HealthRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a HealthRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns HealthRequest
         */
        public static fromObject(object: { [k: string]: any }): embedding.HealthRequest;

        /**
         * Creates a plain object from a HealthRequest message. Also converts values to other types if specified.
         * @param message HealthRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: embedding.HealthRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this HealthRequest to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

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

        /** HealthResponse modelLoaded */
        modelLoaded?: (string|null);

        /** HealthResponse gpuMemoryUsedGb */
        gpuMemoryUsedGb?: (number|null);

        /** HealthResponse gpuMemoryTotalGb */
        gpuMemoryTotalGb?: (number|null);

        /** HealthResponse device */
        device?: (string|null);

        /** HealthResponse timestamp */
        timestamp?: (number|Long|null);
    }

    /** Health check response */
    class HealthResponse implements IHealthResponse {

        /**
         * Constructs a new HealthResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: embedding.IHealthResponse);

        /** HealthResponse status. */
        public status: string;

        /** HealthResponse modelLoaded. */
        public modelLoaded: string;

        /** HealthResponse gpuMemoryUsedGb. */
        public gpuMemoryUsedGb: number;

        /** HealthResponse gpuMemoryTotalGb. */
        public gpuMemoryTotalGb: number;

        /** HealthResponse device. */
        public device: string;

        /** HealthResponse timestamp. */
        public timestamp: (number|Long);

        /**
         * Creates a new HealthResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns HealthResponse instance
         */
        public static create(properties?: embedding.IHealthResponse): embedding.HealthResponse;

        /**
         * Encodes the specified HealthResponse message. Does not implicitly {@link embedding.HealthResponse.verify|verify} messages.
         * @param message HealthResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: embedding.IHealthResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified HealthResponse message, length delimited. Does not implicitly {@link embedding.HealthResponse.verify|verify} messages.
         * @param message HealthResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: embedding.IHealthResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a HealthResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns HealthResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): embedding.HealthResponse;

        /**
         * Decodes a HealthResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns HealthResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): embedding.HealthResponse;

        /**
         * Verifies a HealthResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a HealthResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns HealthResponse
         */
        public static fromObject(object: { [k: string]: any }): embedding.HealthResponse;

        /**
         * Creates a plain object from a HealthResponse message. Also converts values to other types if specified.
         * @param message HealthResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: embedding.HealthResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this HealthResponse to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for HealthResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a StatsRequest. */
    interface IStatsRequest {

        /** StatsRequest includeMemory */
        includeMemory?: (boolean|null);
    }

    /** Stats request */
    class StatsRequest implements IStatsRequest {

        /**
         * Constructs a new StatsRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: embedding.IStatsRequest);

        /** StatsRequest includeMemory. */
        public includeMemory: boolean;

        /**
         * Creates a new StatsRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns StatsRequest instance
         */
        public static create(properties?: embedding.IStatsRequest): embedding.StatsRequest;

        /**
         * Encodes the specified StatsRequest message. Does not implicitly {@link embedding.StatsRequest.verify|verify} messages.
         * @param message StatsRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: embedding.IStatsRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified StatsRequest message, length delimited. Does not implicitly {@link embedding.StatsRequest.verify|verify} messages.
         * @param message StatsRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: embedding.IStatsRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a StatsRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns StatsRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): embedding.StatsRequest;

        /**
         * Decodes a StatsRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns StatsRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): embedding.StatsRequest;

        /**
         * Verifies a StatsRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a StatsRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns StatsRequest
         */
        public static fromObject(object: { [k: string]: any }): embedding.StatsRequest;

        /**
         * Creates a plain object from a StatsRequest message. Also converts values to other types if specified.
         * @param message StatsRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: embedding.StatsRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this StatsRequest to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for StatsRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a StatsResponse. */
    interface IStatsResponse {

        /** StatsResponse modelName */
        modelName?: (string|null);

        /** StatsResponse device */
        device?: (string|null);

        /** StatsResponse isLoaded */
        isLoaded?: (boolean|null);

        /** StatsResponse embeddingDimension */
        embeddingDimension?: (number|null);

        /** StatsResponse batchSize */
        batchSize?: (number|null);

        /** StatsResponse maxLength */
        maxLength?: (number|null);

        /** StatsResponse totalRequests */
        totalRequests?: (number|Long|null);

        /** StatsResponse totalProcessingTimeS */
        totalProcessingTimeS?: (number|null);

        /** StatsResponse avgProcessingTimeMs */
        avgProcessingTimeMs?: (number|null);

        /** StatsResponse gpuAvailable */
        gpuAvailable?: (boolean|null);

        /** StatsResponse gpuMemoryAllocatedGb */
        gpuMemoryAllocatedGb?: (number|null);

        /** StatsResponse gpuMemoryReservedGb */
        gpuMemoryReservedGb?: (number|null);

        /** StatsResponse uptimeSeconds */
        uptimeSeconds?: (number|null);
    }

    /** Stats response */
    class StatsResponse implements IStatsResponse {

        /**
         * Constructs a new StatsResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: embedding.IStatsResponse);

        /** StatsResponse modelName. */
        public modelName: string;

        /** StatsResponse device. */
        public device: string;

        /** StatsResponse isLoaded. */
        public isLoaded: boolean;

        /** StatsResponse embeddingDimension. */
        public embeddingDimension: number;

        /** StatsResponse batchSize. */
        public batchSize: number;

        /** StatsResponse maxLength. */
        public maxLength: number;

        /** StatsResponse totalRequests. */
        public totalRequests: (number|Long);

        /** StatsResponse totalProcessingTimeS. */
        public totalProcessingTimeS: number;

        /** StatsResponse avgProcessingTimeMs. */
        public avgProcessingTimeMs: number;

        /** StatsResponse gpuAvailable. */
        public gpuAvailable: boolean;

        /** StatsResponse gpuMemoryAllocatedGb. */
        public gpuMemoryAllocatedGb: number;

        /** StatsResponse gpuMemoryReservedGb. */
        public gpuMemoryReservedGb: number;

        /** StatsResponse uptimeSeconds. */
        public uptimeSeconds: number;

        /**
         * Creates a new StatsResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns StatsResponse instance
         */
        public static create(properties?: embedding.IStatsResponse): embedding.StatsResponse;

        /**
         * Encodes the specified StatsResponse message. Does not implicitly {@link embedding.StatsResponse.verify|verify} messages.
         * @param message StatsResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: embedding.IStatsResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified StatsResponse message, length delimited. Does not implicitly {@link embedding.StatsResponse.verify|verify} messages.
         * @param message StatsResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: embedding.IStatsResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a StatsResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns StatsResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): embedding.StatsResponse;

        /**
         * Decodes a StatsResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns StatsResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): embedding.StatsResponse;

        /**
         * Verifies a StatsResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a StatsResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns StatsResponse
         */
        public static fromObject(object: { [k: string]: any }): embedding.StatsResponse;

        /**
         * Creates a plain object from a StatsResponse message. Also converts values to other types if specified.
         * @param message StatsResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: embedding.StatsResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this StatsResponse to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for StatsResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
