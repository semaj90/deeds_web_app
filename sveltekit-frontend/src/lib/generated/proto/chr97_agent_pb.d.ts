import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace chr97. */
export namespace chr97 {

    /** Properties of a CaseRef. */
    interface ICaseRef {

        /** CaseRef caseId */
        caseId?: (string|null);
    }

    /** Represents a CaseRef. */
    class CaseRef implements ICaseRef {

        /**
         * Constructs a new CaseRef.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.ICaseRef);

        /** CaseRef caseId. */
        public caseId: string;

        /**
         * Encodes the specified CaseRef message. Does not implicitly {@link chr97.CaseRef.verify|verify} messages.
         * @param message CaseRef message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.ICaseRef, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified CaseRef message, length delimited. Does not implicitly {@link chr97.CaseRef.verify|verify} messages.
         * @param message CaseRef message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.ICaseRef, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CaseRef message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns CaseRef
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.CaseRef;

        /**
         * Decodes a CaseRef message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns CaseRef
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.CaseRef;

        /**
         * Gets the default type url for CaseRef
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a RuneBinary. */
    interface IRuneBinary {

        /** RuneBinary header */
        header?: (Uint8Array|null);

        /** RuneBinary tag */
        tag?: (Uint8Array|null);

        /** RuneBinary label */
        label?: (Uint8Array|null);

        /** RuneBinary imageMeta */
        imageMeta?: (Uint8Array|null);
    }

    /** Represents a RuneBinary. */
    class RuneBinary implements IRuneBinary {

        /**
         * Constructs a new RuneBinary.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.IRuneBinary);

        /** RuneBinary header. */
        public header: Uint8Array;

        /** RuneBinary tag. */
        public tag: Uint8Array;

        /** RuneBinary label. */
        public label: Uint8Array;

        /** RuneBinary imageMeta. */
        public imageMeta: Uint8Array;

        /**
         * Encodes the specified RuneBinary message. Does not implicitly {@link chr97.RuneBinary.verify|verify} messages.
         * @param message RuneBinary message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.IRuneBinary, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified RuneBinary message, length delimited. Does not implicitly {@link chr97.RuneBinary.verify|verify} messages.
         * @param message RuneBinary message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.IRuneBinary, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RuneBinary message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns RuneBinary
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.RuneBinary;

        /**
         * Decodes a RuneBinary message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns RuneBinary
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.RuneBinary;

        /**
         * Gets the default type url for RuneBinary
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a GraphEdge. */
    interface IGraphEdge {

        /** GraphEdge fromId */
        fromId?: (number|null);

        /** GraphEdge toId */
        toId?: (number|null);

        /** GraphEdge relation */
        relation?: (string|null);
    }

    /** Represents a GraphEdge. */
    class GraphEdge implements IGraphEdge {

        /**
         * Constructs a new GraphEdge.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.IGraphEdge);

        /** GraphEdge fromId. */
        public fromId: number;

        /** GraphEdge toId. */
        public toId: number;

        /** GraphEdge relation. */
        public relation: string;

        /**
         * Encodes the specified GraphEdge message. Does not implicitly {@link chr97.GraphEdge.verify|verify} messages.
         * @param message GraphEdge message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.IGraphEdge, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified GraphEdge message, length delimited. Does not implicitly {@link chr97.GraphEdge.verify|verify} messages.
         * @param message GraphEdge message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.IGraphEdge, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a GraphEdge message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns GraphEdge
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.GraphEdge;

        /**
         * Decodes a GraphEdge message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns GraphEdge
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.GraphEdge;

        /**
         * Gets the default type url for GraphEdge
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a GetCartridgeRequest. */
    interface IGetCartridgeRequest {

        /** GetCartridgeRequest caseId */
        caseId?: (string|null);
    }

    /** Represents a GetCartridgeRequest. */
    class GetCartridgeRequest implements IGetCartridgeRequest {

        /**
         * Constructs a new GetCartridgeRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.IGetCartridgeRequest);

        /** GetCartridgeRequest caseId. */
        public caseId: string;

        /**
         * Encodes the specified GetCartridgeRequest message. Does not implicitly {@link chr97.GetCartridgeRequest.verify|verify} messages.
         * @param message GetCartridgeRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.IGetCartridgeRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified GetCartridgeRequest message, length delimited. Does not implicitly {@link chr97.GetCartridgeRequest.verify|verify} messages.
         * @param message GetCartridgeRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.IGetCartridgeRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a GetCartridgeRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns GetCartridgeRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.GetCartridgeRequest;

        /**
         * Decodes a GetCartridgeRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns GetCartridgeRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.GetCartridgeRequest;

        /**
         * Gets the default type url for GetCartridgeRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a GetCartridgeResponse. */
    interface IGetCartridgeResponse {

        /** GetCartridgeResponse runes */
        runes?: (chr97.IRuneBinary[]|null);

        /** GetCartridgeResponse edges */
        edges?: (chr97.IGraphEdge[]|null);
    }

    /** Represents a GetCartridgeResponse. */
    class GetCartridgeResponse implements IGetCartridgeResponse {

        /**
         * Constructs a new GetCartridgeResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.IGetCartridgeResponse);

        /** GetCartridgeResponse runes. */
        public runes: chr97.IRuneBinary[];

        /** GetCartridgeResponse edges. */
        public edges: chr97.IGraphEdge[];

        /**
         * Encodes the specified GetCartridgeResponse message. Does not implicitly {@link chr97.GetCartridgeResponse.verify|verify} messages.
         * @param message GetCartridgeResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.IGetCartridgeResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified GetCartridgeResponse message, length delimited. Does not implicitly {@link chr97.GetCartridgeResponse.verify|verify} messages.
         * @param message GetCartridgeResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.IGetCartridgeResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a GetCartridgeResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns GetCartridgeResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.GetCartridgeResponse;

        /**
         * Decodes a GetCartridgeResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns GetCartridgeResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.GetCartridgeResponse;

        /**
         * Gets the default type url for GetCartridgeResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a TagQueryRequest. */
    interface ITagQueryRequest {

        /** TagQueryRequest query */
        query?: (string|null);

        /** TagQueryRequest limit */
        limit?: (number|null);
    }

    /** Represents a TagQueryRequest. */
    class TagQueryRequest implements ITagQueryRequest {

        /**
         * Constructs a new TagQueryRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.ITagQueryRequest);

        /** TagQueryRequest query. */
        public query: string;

        /** TagQueryRequest limit. */
        public limit: number;

        /**
         * Encodes the specified TagQueryRequest message. Does not implicitly {@link chr97.TagQueryRequest.verify|verify} messages.
         * @param message TagQueryRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.ITagQueryRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TagQueryRequest message, length delimited. Does not implicitly {@link chr97.TagQueryRequest.verify|verify} messages.
         * @param message TagQueryRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.ITagQueryRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TagQueryRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns TagQueryRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.TagQueryRequest;

        /**
         * Decodes a TagQueryRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns TagQueryRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.TagQueryRequest;

        /**
         * Gets the default type url for TagQueryRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a TagHit. */
    interface ITagHit {

        /** TagHit runeId */
        runeId?: (number|null);

        /** TagHit caseId */
        caseId?: (string|null);

        /** TagHit chunkIndex */
        chunkIndex?: (number|null);

        /** TagHit tag */
        tag?: (string|null);

        /** TagHit label */
        label?: (string|null);

        /** TagHit savedCitations */
        savedCitations?: (string[]|null);

        /** TagHit searchCitations */
        searchCitations?: (string[]|null);
    }

    /** Represents a TagHit. */
    class TagHit implements ITagHit {

        /**
         * Constructs a new TagHit.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.ITagHit);

        /** TagHit runeId. */
        public runeId: number;

        /** TagHit caseId. */
        public caseId: string;

        /** TagHit chunkIndex. */
        public chunkIndex: number;

        /** TagHit tag. */
        public tag: string;

        /** TagHit label. */
        public label: string;

        /** TagHit savedCitations. */
        public savedCitations: string[];

        /** TagHit searchCitations. */
        public searchCitations: string[];

        /**
         * Encodes the specified TagHit message. Does not implicitly {@link chr97.TagHit.verify|verify} messages.
         * @param message TagHit message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.ITagHit, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TagHit message, length delimited. Does not implicitly {@link chr97.TagHit.verify|verify} messages.
         * @param message TagHit message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.ITagHit, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TagHit message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns TagHit
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.TagHit;

        /**
         * Decodes a TagHit message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns TagHit
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.TagHit;

        /**
         * Gets the default type url for TagHit
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a TagQueryResponse. */
    interface ITagQueryResponse {

        /** TagQueryResponse hits */
        hits?: (chr97.ITagHit[]|null);
    }

    /** Represents a TagQueryResponse. */
    class TagQueryResponse implements ITagQueryResponse {

        /**
         * Constructs a new TagQueryResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.ITagQueryResponse);

        /** TagQueryResponse hits. */
        public hits: chr97.ITagHit[];

        /**
         * Encodes the specified TagQueryResponse message. Does not implicitly {@link chr97.TagQueryResponse.verify|verify} messages.
         * @param message TagQueryResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.ITagQueryResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TagQueryResponse message, length delimited. Does not implicitly {@link chr97.TagQueryResponse.verify|verify} messages.
         * @param message TagQueryResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.ITagQueryResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TagQueryResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns TagQueryResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.TagQueryResponse;

        /**
         * Decodes a TagQueryResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns TagQueryResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.TagQueryResponse;

        /**
         * Gets the default type url for TagQueryResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a TimelineRequest. */
    interface ITimelineRequest {

        /** TimelineRequest caseId */
        caseId?: (string|null);

        /** TimelineRequest userId */
        userId?: (string|null);
    }

    /** Represents a TimelineRequest. */
    class TimelineRequest implements ITimelineRequest {

        /**
         * Constructs a new TimelineRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.ITimelineRequest);

        /** TimelineRequest caseId. */
        public caseId: string;

        /** TimelineRequest userId. */
        public userId: string;

        /**
         * Encodes the specified TimelineRequest message. Does not implicitly {@link chr97.TimelineRequest.verify|verify} messages.
         * @param message TimelineRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.ITimelineRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TimelineRequest message, length delimited. Does not implicitly {@link chr97.TimelineRequest.verify|verify} messages.
         * @param message TimelineRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.ITimelineRequest, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TimelineRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns TimelineRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.TimelineRequest;

        /**
         * Decodes a TimelineRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns TimelineRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.TimelineRequest;

        /**
         * Gets the default type url for TimelineRequest
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a TimelineEvent. */
    interface ITimelineEvent {

        /** TimelineEvent id */
        id?: (string|null);

        /** TimelineEvent ts */
        ts?: (string|null);

        /** TimelineEvent kind */
        kind?: (string|null);

        /** TimelineEvent description */
        description?: (string|null);
    }

    /** Represents a TimelineEvent. */
    class TimelineEvent implements ITimelineEvent {

        /**
         * Constructs a new TimelineEvent.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.ITimelineEvent);

        /** TimelineEvent id. */
        public id: string;

        /** TimelineEvent ts. */
        public ts: string;

        /** TimelineEvent kind. */
        public kind: string;

        /** TimelineEvent description. */
        public description: string;

        /**
         * Encodes the specified TimelineEvent message. Does not implicitly {@link chr97.TimelineEvent.verify|verify} messages.
         * @param message TimelineEvent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.ITimelineEvent, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TimelineEvent message, length delimited. Does not implicitly {@link chr97.TimelineEvent.verify|verify} messages.
         * @param message TimelineEvent message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.ITimelineEvent, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TimelineEvent message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns TimelineEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.TimelineEvent;

        /**
         * Decodes a TimelineEvent message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns TimelineEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.TimelineEvent;

        /**
         * Gets the default type url for TimelineEvent
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a TimelineResponse. */
    interface ITimelineResponse {

        /** TimelineResponse events */
        events?: (chr97.ITimelineEvent[]|null);

        /** TimelineResponse aiSummary */
        aiSummary?: (string|null);
    }

    /** Represents a TimelineResponse. */
    class TimelineResponse implements ITimelineResponse {

        /**
         * Constructs a new TimelineResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: chr97.ITimelineResponse);

        /** TimelineResponse events. */
        public events: chr97.ITimelineEvent[];

        /** TimelineResponse aiSummary. */
        public aiSummary: string;

        /**
         * Encodes the specified TimelineResponse message. Does not implicitly {@link chr97.TimelineResponse.verify|verify} messages.
         * @param message TimelineResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: chr97.ITimelineResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified TimelineResponse message, length delimited. Does not implicitly {@link chr97.TimelineResponse.verify|verify} messages.
         * @param message TimelineResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: chr97.ITimelineResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a TimelineResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns TimelineResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): chr97.TimelineResponse;

        /**
         * Decodes a TimelineResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns TimelineResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): chr97.TimelineResponse;

        /**
         * Gets the default type url for TimelineResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Represents a Chr97Agent */
    class Chr97Agent extends $protobuf.rpc.Service {

        /**
         * Constructs a new Chr97Agent service.
         * @param rpcImpl RPC implementation
         * @param [requestDelimited=false] Whether requests are length-delimited
         * @param [responseDelimited=false] Whether responses are length-delimited
         */
        constructor(rpcImpl: $protobuf.RPCImpl, requestDelimited?: boolean, responseDelimited?: boolean);

        /**
         * Calls GetCartridge.
         * @param request GetCartridgeRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and GetCartridgeResponse
         */
        public getCartridge(request: chr97.IGetCartridgeRequest, callback: chr97.Chr97Agent.GetCartridgeCallback): void;

        /**
         * Calls GetCartridge.
         * @param request GetCartridgeRequest message or plain object
         * @returns Promise
         */
        public getCartridge(request: chr97.IGetCartridgeRequest): Promise<chr97.GetCartridgeResponse>;

        /**
         * Calls QueryTags.
         * @param request TagQueryRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and TagQueryResponse
         */
        public queryTags(request: chr97.ITagQueryRequest, callback: chr97.Chr97Agent.QueryTagsCallback): void;

        /**
         * Calls QueryTags.
         * @param request TagQueryRequest message or plain object
         * @returns Promise
         */
        public queryTags(request: chr97.ITagQueryRequest): Promise<chr97.TagQueryResponse>;

        /**
         * Calls GetTimeline.
         * @param request TimelineRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and TimelineResponse
         */
        public getTimeline(request: chr97.ITimelineRequest, callback: chr97.Chr97Agent.GetTimelineCallback): void;

        /**
         * Calls GetTimeline.
         * @param request TimelineRequest message or plain object
         * @returns Promise
         */
        public getTimeline(request: chr97.ITimelineRequest): Promise<chr97.TimelineResponse>;
    }

    namespace Chr97Agent {

        /**
         * Callback as used by {@link chr97.Chr97Agent#getCartridge}.
         * @param error Error, if any
         * @param [response] GetCartridgeResponse
         */
        type GetCartridgeCallback = (error: (Error|null), response?: chr97.GetCartridgeResponse) => void;

        /**
         * Callback as used by {@link chr97.Chr97Agent#queryTags}.
         * @param error Error, if any
         * @param [response] TagQueryResponse
         */
        type QueryTagsCallback = (error: (Error|null), response?: chr97.TagQueryResponse) => void;

        /**
         * Callback as used by {@link chr97.Chr97Agent#getTimeline}.
         * @param error Error, if any
         * @param [response] TimelineResponse
         */
        type GetTimelineCallback = (error: (Error|null), response?: chr97.TimelineResponse) => void;
    }
}
