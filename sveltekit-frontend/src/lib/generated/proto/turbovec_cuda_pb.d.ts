import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace turbovec. */
export namespace turbovec {

    /** Represents a TurboVecCudaService */
    class TurboVecCudaService extends $protobuf.rpc.Service {

        /**
         * Constructs a new TurboVecCudaService service.
         * @param rpcImpl RPC implementation
         * @param [requestDelimited=false] Whether requests are length-delimited
         * @param [responseDelimited=false] Whether responses are length-delimited
         */
        constructor(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean);

        /**
         * Calls Search.
         * @param request TurboSearchRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and TurboSearchResponse
         */
        public search(request: turbovec.ITurboSearchRequest, callback: turbovec.TurboVecCudaService.SearchCallback): void;

        /**
         * Calls Search.
         * @param request TurboSearchRequest message or plain object
         * @returns Promise
         */
        public search(request: turbovec.ITurboSearchRequest): Promise<turbovec.TurboSearchResponse>;

        /**
         * Calls Transform.
         * @param request TransformRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and TransformResponse
         */
        public transform(request: turbovec.ITransformRequest, callback: turbovec.TurboVecCudaService.TransformCallback): void;

        /**
         * Calls Transform.
         * @param request TransformRequest message or plain object
         * @returns Promise
         */
        public transform(request: turbovec.ITransformRequest): Promise<turbovec.TransformResponse>;
    }

    namespace TurboVecCudaService {

        /**
         * Callback as used by {@link turbovec.TurboVecCudaService#search}.
         * @param error Error, if any
         * @param [response] TurboSearchResponse
         */
        type SearchCallback = (error: (Error|null), response?: turbovec.TurboSearchResponse) => void;

        /**
         * Callback as used by {@link turbovec.TurboVecCudaService#transform}.
         * @param error Error, if any
         * @param [response] TransformResponse
         */
        type TransformCallback = (error: (Error|null), response?: turbovec.TransformResponse) => void;
    }

    /** Properties of a TurboSearchRequest. */
    interface ITurboSearchRequest {

        /** TurboSearchRequest queryVector */
        queryVector?: (number[]|null);

        /** TurboSearchRequest topK */
        topK?: (number|null);

        /** TurboSearchRequest quaternionRot */
        quaternionRot?: (number[]|null);
    }

    /** Represents a TurboSearchRequest. */
    class TurboSearchRequest implements ITurboSearchRequest {

        /**
         * Constructs a new TurboSearchRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: turbovec.ITurboSearchRequest);

        /** TurboSearchRequest queryVector. */
        public queryVector: number[];

        /** TurboSearchRequest topK. */
        public topK: number;

        /** TurboSearchRequest quaternionRot. */
        public quaternionRot: number[];

        /**
         * Encodes the specified TurboSearchRequest message. Does not implicitly {@link turbovec.TurboSearchRequest.verify|verify} messages.
         * @param message TurboSearchRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: turbovec.ITurboSearchRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TurboSearchRequest message, length delimited. Does not implicitly {@link turbovec.TurboSearchRequest.verify|verify} messages.
         * @param message TurboSearchRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: turbovec.ITurboSearchRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TurboSearchRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns TurboSearchRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): turbovec.TurboSearchRequest;

        /**
         * Decodes a TurboSearchRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns TurboSearchRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): turbovec.TurboSearchRequest;

        /**
         * Gets the default type url for TurboSearchRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a TurboSearchResponse. */
    interface ITurboSearchResponse {

        /** TurboSearchResponse candidates */
        candidates?: (turbovec.TurboSearchResponse.ICandidate[]|null);

        /** TurboSearchResponse backend */
        backend?: (string|null);
    }

    /** Represents a TurboSearchResponse. */
    class TurboSearchResponse implements ITurboSearchResponse {

        /**
         * Constructs a new TurboSearchResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: turbovec.ITurboSearchResponse);

        /** TurboSearchResponse candidates. */
        public candidates: turbovec.TurboSearchResponse.ICandidate[];

        /** TurboSearchResponse backend. */
        public backend: string;

        /**
         * Encodes the specified TurboSearchResponse message. Does not implicitly {@link turbovec.TurboSearchResponse.verify|verify} messages.
         * @param message TurboSearchResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: turbovec.ITurboSearchResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TurboSearchResponse message, length delimited. Does not implicitly {@link turbovec.TurboSearchResponse.verify|verify} messages.
         * @param message TurboSearchResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: turbovec.ITurboSearchResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TurboSearchResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns TurboSearchResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): turbovec.TurboSearchResponse;

        /**
         * Decodes a TurboSearchResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns TurboSearchResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): turbovec.TurboSearchResponse;

        /**
         * Gets the default type url for TurboSearchResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    namespace TurboSearchResponse {

        /** Properties of a Candidate. */
        interface ICandidate {

            /** Candidate id */
            id?: (string|null);

            /** Candidate score */
            score?: (number|null);

            /** Candidate clusterId */
            clusterId?: (number|null);
        }

        /** Represents a Candidate. */
        class Candidate implements ICandidate {

            /**
             * Constructs a new Candidate.
             * @param [properties] Properties to set
             */
            constructor(properties?: turbovec.TurboSearchResponse.ICandidate);

            /** Candidate id. */
            public id: string;

            /** Candidate score. */
            public score: number;

            /** Candidate clusterId. */
            public clusterId: number;

            /**
             * Encodes the specified Candidate message. Does not implicitly {@link turbovec.TurboSearchResponse.Candidate.verify|verify} messages.
             * @param message Candidate message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: turbovec.TurboSearchResponse.ICandidate, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified Candidate message, length delimited. Does not implicitly {@link turbovec.TurboSearchResponse.Candidate.verify|verify} messages.
             * @param message Candidate message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: turbovec.TurboSearchResponse.ICandidate, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Candidate message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns Candidate
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): turbovec.TurboSearchResponse.Candidate;

            /**
             * Decodes a Candidate message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns Candidate
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): turbovec.TurboSearchResponse.Candidate;

            /**
             * Gets the default type url for Candidate
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }
    }

    /** Properties of a TransformRequest. */
    interface ITransformRequest {

        /** TransformRequest vectors */
        vectors?: (number[]|null);

        /** TransformRequest quaternionRot */
        quaternionRot?: (number[]|null);
    }

    /** Represents a TransformRequest. */
    class TransformRequest implements ITransformRequest {

        /**
         * Constructs a new TransformRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: turbovec.ITransformRequest);

        /** TransformRequest vectors. */
        public vectors: number[];

        /** TransformRequest quaternionRot. */
        public quaternionRot: number[];

        /**
         * Encodes the specified TransformRequest message. Does not implicitly {@link turbovec.TransformRequest.verify|verify} messages.
         * @param message TransformRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: turbovec.ITransformRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TransformRequest message, length delimited. Does not implicitly {@link turbovec.TransformRequest.verify|verify} messages.
         * @param message TransformRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: turbovec.ITransformRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TransformRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns TransformRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): turbovec.TransformRequest;

        /**
         * Decodes a TransformRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns TransformRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): turbovec.TransformRequest;

        /**
         * Gets the default type url for TransformRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a TransformResponse. */
    interface ITransformResponse {

        /** TransformResponse projectedVectors */
        projectedVectors?: (number[]|null);
    }

    /** Represents a TransformResponse. */
    class TransformResponse implements ITransformResponse {

        /**
         * Constructs a new TransformResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: turbovec.ITransformResponse);

        /** TransformResponse projectedVectors. */
        public projectedVectors: number[];

        /**
         * Encodes the specified TransformResponse message. Does not implicitly {@link turbovec.TransformResponse.verify|verify} messages.
         * @param message TransformResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: turbovec.ITransformResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TransformResponse message, length delimited. Does not implicitly {@link turbovec.TransformResponse.verify|verify} messages.
         * @param message TransformResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: turbovec.ITransformResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TransformResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns TransformResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): turbovec.TransformResponse;

        /**
         * Decodes a TransformResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns TransformResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): turbovec.TransformResponse;

        /**
         * Gets the default type url for TransformResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
