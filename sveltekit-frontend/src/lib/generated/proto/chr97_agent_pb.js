/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const chr97 = $root.chr97 = (() => {

    /**
     * Namespace chr97.
     * @exports chr97
     * @namespace
     */
    const chr97 = {};

    chr97.CaseRef = (function() {

        /**
         * Properties of a CaseRef.
         * @memberof chr97
         * @interface ICaseRef
         * @property {string|null} [caseId] CaseRef caseId
         */

        /**
         * Constructs a new CaseRef.
         * @memberof chr97
         * @classdesc Represents a CaseRef.
         * @implements ICaseRef
         * @constructor
         * @param {chr97.ICaseRef=} [properties] Properties to set
         */
        function CaseRef(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * CaseRef caseId.
         * @member {string} caseId
         * @memberof chr97.CaseRef
         * @instance
         */
        CaseRef.prototype.caseId = "";

        /**
         * Encodes the specified CaseRef message. Does not implicitly {@link chr97.CaseRef.verify|verify} messages.
         * @function encode
         * @memberof chr97.CaseRef
         * @static
         * @param {chr97.ICaseRef} message CaseRef message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CaseRef.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.caseId != null && Object.hasOwnProperty.call(message, "caseId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.caseId);
            return writer;
        };

        /**
         * Encodes the specified CaseRef message, length delimited. Does not implicitly {@link chr97.CaseRef.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.CaseRef
         * @static
         * @param {chr97.ICaseRef} message CaseRef message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CaseRef.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a CaseRef message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.CaseRef
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.CaseRef} CaseRef
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CaseRef.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.CaseRef();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.caseId = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a CaseRef message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.CaseRef
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.CaseRef} CaseRef
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CaseRef.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for CaseRef
         * @function getTypeUrl
         * @memberof chr97.CaseRef
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        CaseRef.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.CaseRef";
        };

        return CaseRef;
    })();

    chr97.RuneBinary = (function() {

        /**
         * Properties of a RuneBinary.
         * @memberof chr97
         * @interface IRuneBinary
         * @property {Uint8Array|null} [header] RuneBinary header
         * @property {Uint8Array|null} [tag] RuneBinary tag
         * @property {Uint8Array|null} [label] RuneBinary label
         * @property {Uint8Array|null} [imageMeta] RuneBinary imageMeta
         */

        /**
         * Constructs a new RuneBinary.
         * @memberof chr97
         * @classdesc Represents a RuneBinary.
         * @implements IRuneBinary
         * @constructor
         * @param {chr97.IRuneBinary=} [properties] Properties to set
         */
        function RuneBinary(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * RuneBinary header.
         * @member {Uint8Array} header
         * @memberof chr97.RuneBinary
         * @instance
         */
        RuneBinary.prototype.header = $util.newBuffer([]);

        /**
         * RuneBinary tag.
         * @member {Uint8Array} tag
         * @memberof chr97.RuneBinary
         * @instance
         */
        RuneBinary.prototype.tag = $util.newBuffer([]);

        /**
         * RuneBinary label.
         * @member {Uint8Array} label
         * @memberof chr97.RuneBinary
         * @instance
         */
        RuneBinary.prototype.label = $util.newBuffer([]);

        /**
         * RuneBinary imageMeta.
         * @member {Uint8Array} imageMeta
         * @memberof chr97.RuneBinary
         * @instance
         */
        RuneBinary.prototype.imageMeta = $util.newBuffer([]);

        /**
         * Encodes the specified RuneBinary message. Does not implicitly {@link chr97.RuneBinary.verify|verify} messages.
         * @function encode
         * @memberof chr97.RuneBinary
         * @static
         * @param {chr97.IRuneBinary} message RuneBinary message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RuneBinary.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.header != null && Object.hasOwnProperty.call(message, "header"))
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.header);
            if (message.tag != null && Object.hasOwnProperty.call(message, "tag"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.tag);
            if (message.label != null && Object.hasOwnProperty.call(message, "label"))
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.label);
            if (message.imageMeta != null && Object.hasOwnProperty.call(message, "imageMeta"))
                writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.imageMeta);
            return writer;
        };

        /**
         * Encodes the specified RuneBinary message, length delimited. Does not implicitly {@link chr97.RuneBinary.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.RuneBinary
         * @static
         * @param {chr97.IRuneBinary} message RuneBinary message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RuneBinary.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a RuneBinary message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.RuneBinary
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.RuneBinary} RuneBinary
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RuneBinary.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.RuneBinary();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.header = reader.bytes();
                        break;
                    }
                case 2: {
                        message.tag = reader.bytes();
                        break;
                    }
                case 3: {
                        message.label = reader.bytes();
                        break;
                    }
                case 4: {
                        message.imageMeta = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a RuneBinary message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.RuneBinary
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.RuneBinary} RuneBinary
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RuneBinary.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for RuneBinary
         * @function getTypeUrl
         * @memberof chr97.RuneBinary
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        RuneBinary.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.RuneBinary";
        };

        return RuneBinary;
    })();

    chr97.GraphEdge = (function() {

        /**
         * Properties of a GraphEdge.
         * @memberof chr97
         * @interface IGraphEdge
         * @property {number|null} [fromId] GraphEdge fromId
         * @property {number|null} [toId] GraphEdge toId
         * @property {string|null} [relation] GraphEdge relation
         */

        /**
         * Constructs a new GraphEdge.
         * @memberof chr97
         * @classdesc Represents a GraphEdge.
         * @implements IGraphEdge
         * @constructor
         * @param {chr97.IGraphEdge=} [properties] Properties to set
         */
        function GraphEdge(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * GraphEdge fromId.
         * @member {number} fromId
         * @memberof chr97.GraphEdge
         * @instance
         */
        GraphEdge.prototype.fromId = 0;

        /**
         * GraphEdge toId.
         * @member {number} toId
         * @memberof chr97.GraphEdge
         * @instance
         */
        GraphEdge.prototype.toId = 0;

        /**
         * GraphEdge relation.
         * @member {string} relation
         * @memberof chr97.GraphEdge
         * @instance
         */
        GraphEdge.prototype.relation = "";

        /**
         * Encodes the specified GraphEdge message. Does not implicitly {@link chr97.GraphEdge.verify|verify} messages.
         * @function encode
         * @memberof chr97.GraphEdge
         * @static
         * @param {chr97.IGraphEdge} message GraphEdge message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GraphEdge.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.fromId != null && Object.hasOwnProperty.call(message, "fromId"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.fromId);
            if (message.toId != null && Object.hasOwnProperty.call(message, "toId"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.toId);
            if (message.relation != null && Object.hasOwnProperty.call(message, "relation"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.relation);
            return writer;
        };

        /**
         * Encodes the specified GraphEdge message, length delimited. Does not implicitly {@link chr97.GraphEdge.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.GraphEdge
         * @static
         * @param {chr97.IGraphEdge} message GraphEdge message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GraphEdge.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a GraphEdge message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.GraphEdge
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.GraphEdge} GraphEdge
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GraphEdge.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.GraphEdge();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.fromId = reader.uint32();
                        break;
                    }
                case 2: {
                        message.toId = reader.uint32();
                        break;
                    }
                case 3: {
                        message.relation = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a GraphEdge message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.GraphEdge
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.GraphEdge} GraphEdge
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GraphEdge.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for GraphEdge
         * @function getTypeUrl
         * @memberof chr97.GraphEdge
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        GraphEdge.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.GraphEdge";
        };

        return GraphEdge;
    })();

    chr97.GetCartridgeRequest = (function() {

        /**
         * Properties of a GetCartridgeRequest.
         * @memberof chr97
         * @interface IGetCartridgeRequest
         * @property {string|null} [caseId] GetCartridgeRequest caseId
         */

        /**
         * Constructs a new GetCartridgeRequest.
         * @memberof chr97
         * @classdesc Represents a GetCartridgeRequest.
         * @implements IGetCartridgeRequest
         * @constructor
         * @param {chr97.IGetCartridgeRequest=} [properties] Properties to set
         */
        function GetCartridgeRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * GetCartridgeRequest caseId.
         * @member {string} caseId
         * @memberof chr97.GetCartridgeRequest
         * @instance
         */
        GetCartridgeRequest.prototype.caseId = "";

        /**
         * Encodes the specified GetCartridgeRequest message. Does not implicitly {@link chr97.GetCartridgeRequest.verify|verify} messages.
         * @function encode
         * @memberof chr97.GetCartridgeRequest
         * @static
         * @param {chr97.IGetCartridgeRequest} message GetCartridgeRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GetCartridgeRequest.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.caseId != null && Object.hasOwnProperty.call(message, "caseId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.caseId);
            return writer;
        };

        /**
         * Encodes the specified GetCartridgeRequest message, length delimited. Does not implicitly {@link chr97.GetCartridgeRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.GetCartridgeRequest
         * @static
         * @param {chr97.IGetCartridgeRequest} message GetCartridgeRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GetCartridgeRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a GetCartridgeRequest message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.GetCartridgeRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.GetCartridgeRequest} GetCartridgeRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GetCartridgeRequest.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.GetCartridgeRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.caseId = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a GetCartridgeRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.GetCartridgeRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.GetCartridgeRequest} GetCartridgeRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GetCartridgeRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for GetCartridgeRequest
         * @function getTypeUrl
         * @memberof chr97.GetCartridgeRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        GetCartridgeRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.GetCartridgeRequest";
        };

        return GetCartridgeRequest;
    })();

    chr97.GetCartridgeResponse = (function() {

        /**
         * Properties of a GetCartridgeResponse.
         * @memberof chr97
         * @interface IGetCartridgeResponse
         * @property {Array.<chr97.IRuneBinary>|null} [runes] GetCartridgeResponse runes
         * @property {Array.<chr97.IGraphEdge>|null} [edges] GetCartridgeResponse edges
         */

        /**
         * Constructs a new GetCartridgeResponse.
         * @memberof chr97
         * @classdesc Represents a GetCartridgeResponse.
         * @implements IGetCartridgeResponse
         * @constructor
         * @param {chr97.IGetCartridgeResponse=} [properties] Properties to set
         */
        function GetCartridgeResponse(properties) {
            this.runes = [];
            this.edges = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * GetCartridgeResponse runes.
         * @member {Array.<chr97.IRuneBinary>} runes
         * @memberof chr97.GetCartridgeResponse
         * @instance
         */
        GetCartridgeResponse.prototype.runes = $util.emptyArray;

        /**
         * GetCartridgeResponse edges.
         * @member {Array.<chr97.IGraphEdge>} edges
         * @memberof chr97.GetCartridgeResponse
         * @instance
         */
        GetCartridgeResponse.prototype.edges = $util.emptyArray;

        /**
         * Encodes the specified GetCartridgeResponse message. Does not implicitly {@link chr97.GetCartridgeResponse.verify|verify} messages.
         * @function encode
         * @memberof chr97.GetCartridgeResponse
         * @static
         * @param {chr97.IGetCartridgeResponse} message GetCartridgeResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GetCartridgeResponse.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.runes != null && message.runes.length)
                for (let i = 0; i < message.runes.length; ++i)
                    $root.chr97.RuneBinary.encode(message.runes[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
            if (message.edges != null && message.edges.length)
                for (let i = 0; i < message.edges.length; ++i)
                    $root.chr97.GraphEdge.encode(message.edges[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), q + 1).ldelim();
            return writer;
        };

        /**
         * Encodes the specified GetCartridgeResponse message, length delimited. Does not implicitly {@link chr97.GetCartridgeResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.GetCartridgeResponse
         * @static
         * @param {chr97.IGetCartridgeResponse} message GetCartridgeResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GetCartridgeResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a GetCartridgeResponse message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.GetCartridgeResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.GetCartridgeResponse} GetCartridgeResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GetCartridgeResponse.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.GetCartridgeResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.runes && message.runes.length))
                            message.runes = [];
                        message.runes.push($root.chr97.RuneBinary.decode(reader, reader.uint32(), undefined, long + 1));
                        break;
                    }
                case 2: {
                        if (!(message.edges && message.edges.length))
                            message.edges = [];
                        message.edges.push($root.chr97.GraphEdge.decode(reader, reader.uint32(), undefined, long + 1));
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a GetCartridgeResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.GetCartridgeResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.GetCartridgeResponse} GetCartridgeResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GetCartridgeResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for GetCartridgeResponse
         * @function getTypeUrl
         * @memberof chr97.GetCartridgeResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        GetCartridgeResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.GetCartridgeResponse";
        };

        return GetCartridgeResponse;
    })();

    chr97.TagQueryRequest = (function() {

        /**
         * Properties of a TagQueryRequest.
         * @memberof chr97
         * @interface ITagQueryRequest
         * @property {string|null} [query] TagQueryRequest query
         * @property {number|null} [limit] TagQueryRequest limit
         */

        /**
         * Constructs a new TagQueryRequest.
         * @memberof chr97
         * @classdesc Represents a TagQueryRequest.
         * @implements ITagQueryRequest
         * @constructor
         * @param {chr97.ITagQueryRequest=} [properties] Properties to set
         */
        function TagQueryRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TagQueryRequest query.
         * @member {string} query
         * @memberof chr97.TagQueryRequest
         * @instance
         */
        TagQueryRequest.prototype.query = "";

        /**
         * TagQueryRequest limit.
         * @member {number} limit
         * @memberof chr97.TagQueryRequest
         * @instance
         */
        TagQueryRequest.prototype.limit = 0;

        /**
         * Encodes the specified TagQueryRequest message. Does not implicitly {@link chr97.TagQueryRequest.verify|verify} messages.
         * @function encode
         * @memberof chr97.TagQueryRequest
         * @static
         * @param {chr97.ITagQueryRequest} message TagQueryRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TagQueryRequest.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.query != null && Object.hasOwnProperty.call(message, "query"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.query);
            if (message.limit != null && Object.hasOwnProperty.call(message, "limit"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.limit);
            return writer;
        };

        /**
         * Encodes the specified TagQueryRequest message, length delimited. Does not implicitly {@link chr97.TagQueryRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.TagQueryRequest
         * @static
         * @param {chr97.ITagQueryRequest} message TagQueryRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TagQueryRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a TagQueryRequest message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.TagQueryRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.TagQueryRequest} TagQueryRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TagQueryRequest.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.TagQueryRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.query = reader.string();
                        break;
                    }
                case 2: {
                        message.limit = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a TagQueryRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.TagQueryRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.TagQueryRequest} TagQueryRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TagQueryRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for TagQueryRequest
         * @function getTypeUrl
         * @memberof chr97.TagQueryRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TagQueryRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.TagQueryRequest";
        };

        return TagQueryRequest;
    })();

    chr97.TagHit = (function() {

        /**
         * Properties of a TagHit.
         * @memberof chr97
         * @interface ITagHit
         * @property {number|null} [runeId] TagHit runeId
         * @property {string|null} [caseId] TagHit caseId
         * @property {number|null} [chunkIndex] TagHit chunkIndex
         * @property {string|null} [tag] TagHit tag
         * @property {string|null} [label] TagHit label
         * @property {Array.<string>|null} [savedCitations] TagHit savedCitations
         * @property {Array.<string>|null} [searchCitations] TagHit searchCitations
         */

        /**
         * Constructs a new TagHit.
         * @memberof chr97
         * @classdesc Represents a TagHit.
         * @implements ITagHit
         * @constructor
         * @param {chr97.ITagHit=} [properties] Properties to set
         */
        function TagHit(properties) {
            this.savedCitations = [];
            this.searchCitations = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TagHit runeId.
         * @member {number} runeId
         * @memberof chr97.TagHit
         * @instance
         */
        TagHit.prototype.runeId = 0;

        /**
         * TagHit caseId.
         * @member {string} caseId
         * @memberof chr97.TagHit
         * @instance
         */
        TagHit.prototype.caseId = "";

        /**
         * TagHit chunkIndex.
         * @member {number} chunkIndex
         * @memberof chr97.TagHit
         * @instance
         */
        TagHit.prototype.chunkIndex = 0;

        /**
         * TagHit tag.
         * @member {string} tag
         * @memberof chr97.TagHit
         * @instance
         */
        TagHit.prototype.tag = "";

        /**
         * TagHit label.
         * @member {string} label
         * @memberof chr97.TagHit
         * @instance
         */
        TagHit.prototype.label = "";

        /**
         * TagHit savedCitations.
         * @member {Array.<string>} savedCitations
         * @memberof chr97.TagHit
         * @instance
         */
        TagHit.prototype.savedCitations = $util.emptyArray;

        /**
         * TagHit searchCitations.
         * @member {Array.<string>} searchCitations
         * @memberof chr97.TagHit
         * @instance
         */
        TagHit.prototype.searchCitations = $util.emptyArray;

        /**
         * Encodes the specified TagHit message. Does not implicitly {@link chr97.TagHit.verify|verify} messages.
         * @function encode
         * @memberof chr97.TagHit
         * @static
         * @param {chr97.ITagHit} message TagHit message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TagHit.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.runeId != null && Object.hasOwnProperty.call(message, "runeId"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.runeId);
            if (message.caseId != null && Object.hasOwnProperty.call(message, "caseId"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.caseId);
            if (message.chunkIndex != null && Object.hasOwnProperty.call(message, "chunkIndex"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.chunkIndex);
            if (message.tag != null && Object.hasOwnProperty.call(message, "tag"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.tag);
            if (message.label != null && Object.hasOwnProperty.call(message, "label"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.label);
            if (message.savedCitations != null && message.savedCitations.length)
                for (let i = 0; i < message.savedCitations.length; ++i)
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.savedCitations[i]);
            if (message.searchCitations != null && message.searchCitations.length)
                for (let i = 0; i < message.searchCitations.length; ++i)
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.searchCitations[i]);
            return writer;
        };

        /**
         * Encodes the specified TagHit message, length delimited. Does not implicitly {@link chr97.TagHit.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.TagHit
         * @static
         * @param {chr97.ITagHit} message TagHit message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TagHit.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a TagHit message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.TagHit
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.TagHit} TagHit
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TagHit.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.TagHit();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.runeId = reader.uint32();
                        break;
                    }
                case 2: {
                        message.caseId = reader.string();
                        break;
                    }
                case 3: {
                        message.chunkIndex = reader.uint32();
                        break;
                    }
                case 4: {
                        message.tag = reader.string();
                        break;
                    }
                case 5: {
                        message.label = reader.string();
                        break;
                    }
                case 6: {
                        if (!(message.savedCitations && message.savedCitations.length))
                            message.savedCitations = [];
                        message.savedCitations.push(reader.string());
                        break;
                    }
                case 7: {
                        if (!(message.searchCitations && message.searchCitations.length))
                            message.searchCitations = [];
                        message.searchCitations.push(reader.string());
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a TagHit message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.TagHit
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.TagHit} TagHit
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TagHit.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for TagHit
         * @function getTypeUrl
         * @memberof chr97.TagHit
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TagHit.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.TagHit";
        };

        return TagHit;
    })();

    chr97.TagQueryResponse = (function() {

        /**
         * Properties of a TagQueryResponse.
         * @memberof chr97
         * @interface ITagQueryResponse
         * @property {Array.<chr97.ITagHit>|null} [hits] TagQueryResponse hits
         */

        /**
         * Constructs a new TagQueryResponse.
         * @memberof chr97
         * @classdesc Represents a TagQueryResponse.
         * @implements ITagQueryResponse
         * @constructor
         * @param {chr97.ITagQueryResponse=} [properties] Properties to set
         */
        function TagQueryResponse(properties) {
            this.hits = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TagQueryResponse hits.
         * @member {Array.<chr97.ITagHit>} hits
         * @memberof chr97.TagQueryResponse
         * @instance
         */
        TagQueryResponse.prototype.hits = $util.emptyArray;

        /**
         * Encodes the specified TagQueryResponse message. Does not implicitly {@link chr97.TagQueryResponse.verify|verify} messages.
         * @function encode
         * @memberof chr97.TagQueryResponse
         * @static
         * @param {chr97.ITagQueryResponse} message TagQueryResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TagQueryResponse.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.hits != null && message.hits.length)
                for (let i = 0; i < message.hits.length; ++i)
                    $root.chr97.TagHit.encode(message.hits[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
            return writer;
        };

        /**
         * Encodes the specified TagQueryResponse message, length delimited. Does not implicitly {@link chr97.TagQueryResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.TagQueryResponse
         * @static
         * @param {chr97.ITagQueryResponse} message TagQueryResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TagQueryResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a TagQueryResponse message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.TagQueryResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.TagQueryResponse} TagQueryResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TagQueryResponse.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.TagQueryResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.hits && message.hits.length))
                            message.hits = [];
                        message.hits.push($root.chr97.TagHit.decode(reader, reader.uint32(), undefined, long + 1));
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a TagQueryResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.TagQueryResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.TagQueryResponse} TagQueryResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TagQueryResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for TagQueryResponse
         * @function getTypeUrl
         * @memberof chr97.TagQueryResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TagQueryResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.TagQueryResponse";
        };

        return TagQueryResponse;
    })();

    chr97.TimelineRequest = (function() {

        /**
         * Properties of a TimelineRequest.
         * @memberof chr97
         * @interface ITimelineRequest
         * @property {string|null} [caseId] TimelineRequest caseId
         * @property {string|null} [userId] TimelineRequest userId
         */

        /**
         * Constructs a new TimelineRequest.
         * @memberof chr97
         * @classdesc Represents a TimelineRequest.
         * @implements ITimelineRequest
         * @constructor
         * @param {chr97.ITimelineRequest=} [properties] Properties to set
         */
        function TimelineRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TimelineRequest caseId.
         * @member {string} caseId
         * @memberof chr97.TimelineRequest
         * @instance
         */
        TimelineRequest.prototype.caseId = "";

        /**
         * TimelineRequest userId.
         * @member {string} userId
         * @memberof chr97.TimelineRequest
         * @instance
         */
        TimelineRequest.prototype.userId = "";

        /**
         * Encodes the specified TimelineRequest message. Does not implicitly {@link chr97.TimelineRequest.verify|verify} messages.
         * @function encode
         * @memberof chr97.TimelineRequest
         * @static
         * @param {chr97.ITimelineRequest} message TimelineRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TimelineRequest.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.caseId != null && Object.hasOwnProperty.call(message, "caseId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.caseId);
            if (message.userId != null && Object.hasOwnProperty.call(message, "userId"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.userId);
            return writer;
        };

        /**
         * Encodes the specified TimelineRequest message, length delimited. Does not implicitly {@link chr97.TimelineRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.TimelineRequest
         * @static
         * @param {chr97.ITimelineRequest} message TimelineRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TimelineRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a TimelineRequest message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.TimelineRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.TimelineRequest} TimelineRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TimelineRequest.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.TimelineRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.caseId = reader.string();
                        break;
                    }
                case 2: {
                        message.userId = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a TimelineRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.TimelineRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.TimelineRequest} TimelineRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TimelineRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for TimelineRequest
         * @function getTypeUrl
         * @memberof chr97.TimelineRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TimelineRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.TimelineRequest";
        };

        return TimelineRequest;
    })();

    chr97.TimelineEvent = (function() {

        /**
         * Properties of a TimelineEvent.
         * @memberof chr97
         * @interface ITimelineEvent
         * @property {string|null} [id] TimelineEvent id
         * @property {string|null} [ts] TimelineEvent ts
         * @property {string|null} [kind] TimelineEvent kind
         * @property {string|null} [description] TimelineEvent description
         */

        /**
         * Constructs a new TimelineEvent.
         * @memberof chr97
         * @classdesc Represents a TimelineEvent.
         * @implements ITimelineEvent
         * @constructor
         * @param {chr97.ITimelineEvent=} [properties] Properties to set
         */
        function TimelineEvent(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TimelineEvent id.
         * @member {string} id
         * @memberof chr97.TimelineEvent
         * @instance
         */
        TimelineEvent.prototype.id = "";

        /**
         * TimelineEvent ts.
         * @member {string} ts
         * @memberof chr97.TimelineEvent
         * @instance
         */
        TimelineEvent.prototype.ts = "";

        /**
         * TimelineEvent kind.
         * @member {string} kind
         * @memberof chr97.TimelineEvent
         * @instance
         */
        TimelineEvent.prototype.kind = "";

        /**
         * TimelineEvent description.
         * @member {string} description
         * @memberof chr97.TimelineEvent
         * @instance
         */
        TimelineEvent.prototype.description = "";

        /**
         * Encodes the specified TimelineEvent message. Does not implicitly {@link chr97.TimelineEvent.verify|verify} messages.
         * @function encode
         * @memberof chr97.TimelineEvent
         * @static
         * @param {chr97.ITimelineEvent} message TimelineEvent message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TimelineEvent.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            if (message.ts != null && Object.hasOwnProperty.call(message, "ts"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.ts);
            if (message.kind != null && Object.hasOwnProperty.call(message, "kind"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.kind);
            if (message.description != null && Object.hasOwnProperty.call(message, "description"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.description);
            return writer;
        };

        /**
         * Encodes the specified TimelineEvent message, length delimited. Does not implicitly {@link chr97.TimelineEvent.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.TimelineEvent
         * @static
         * @param {chr97.ITimelineEvent} message TimelineEvent message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TimelineEvent.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a TimelineEvent message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.TimelineEvent
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.TimelineEvent} TimelineEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TimelineEvent.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.TimelineEvent();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.id = reader.string();
                        break;
                    }
                case 2: {
                        message.ts = reader.string();
                        break;
                    }
                case 3: {
                        message.kind = reader.string();
                        break;
                    }
                case 4: {
                        message.description = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a TimelineEvent message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.TimelineEvent
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.TimelineEvent} TimelineEvent
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TimelineEvent.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for TimelineEvent
         * @function getTypeUrl
         * @memberof chr97.TimelineEvent
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TimelineEvent.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.TimelineEvent";
        };

        return TimelineEvent;
    })();

    chr97.TimelineResponse = (function() {

        /**
         * Properties of a TimelineResponse.
         * @memberof chr97
         * @interface ITimelineResponse
         * @property {Array.<chr97.ITimelineEvent>|null} [events] TimelineResponse events
         * @property {string|null} [aiSummary] TimelineResponse aiSummary
         */

        /**
         * Constructs a new TimelineResponse.
         * @memberof chr97
         * @classdesc Represents a TimelineResponse.
         * @implements ITimelineResponse
         * @constructor
         * @param {chr97.ITimelineResponse=} [properties] Properties to set
         */
        function TimelineResponse(properties) {
            this.events = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TimelineResponse events.
         * @member {Array.<chr97.ITimelineEvent>} events
         * @memberof chr97.TimelineResponse
         * @instance
         */
        TimelineResponse.prototype.events = $util.emptyArray;

        /**
         * TimelineResponse aiSummary.
         * @member {string} aiSummary
         * @memberof chr97.TimelineResponse
         * @instance
         */
        TimelineResponse.prototype.aiSummary = "";

        /**
         * Encodes the specified TimelineResponse message. Does not implicitly {@link chr97.TimelineResponse.verify|verify} messages.
         * @function encode
         * @memberof chr97.TimelineResponse
         * @static
         * @param {chr97.ITimelineResponse} message TimelineResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TimelineResponse.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.events != null && message.events.length)
                for (let i = 0; i < message.events.length; ++i)
                    $root.chr97.TimelineEvent.encode(message.events[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
            if (message.aiSummary != null && Object.hasOwnProperty.call(message, "aiSummary"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.aiSummary);
            return writer;
        };

        /**
         * Encodes the specified TimelineResponse message, length delimited. Does not implicitly {@link chr97.TimelineResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof chr97.TimelineResponse
         * @static
         * @param {chr97.ITimelineResponse} message TimelineResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TimelineResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a TimelineResponse message from the specified reader or buffer.
         * @function decode
         * @memberof chr97.TimelineResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {chr97.TimelineResponse} TimelineResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TimelineResponse.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.chr97.TimelineResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.events && message.events.length))
                            message.events = [];
                        message.events.push($root.chr97.TimelineEvent.decode(reader, reader.uint32(), undefined, long + 1));
                        break;
                    }
                case 2: {
                        message.aiSummary = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7, long);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a TimelineResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof chr97.TimelineResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {chr97.TimelineResponse} TimelineResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TimelineResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for TimelineResponse
         * @function getTypeUrl
         * @memberof chr97.TimelineResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TimelineResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/chr97.TimelineResponse";
        };

        return TimelineResponse;
    })();

    chr97.Chr97Agent = (function() {

        /**
         * Constructs a new Chr97Agent service.
         * @memberof chr97
         * @classdesc Represents a Chr97Agent
         * @extends $protobuf.rpc.Service
         * @constructor
         * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
         * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
         * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
         */
        function Chr97Agent(rpcImpl, requestDelimited, responseDelimited) {
            $protobuf.rpc.Service.call(this, rpcImpl, requestDelimited, responseDelimited);
        }

        (Chr97Agent.prototype = Object.create($protobuf.rpc.Service.prototype)).constructor = Chr97Agent;

        /**
         * Callback as used by {@link chr97.Chr97Agent#getCartridge}.
         * @memberof chr97.Chr97Agent
         * @typedef GetCartridgeCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {chr97.GetCartridgeResponse} [response] GetCartridgeResponse
         */

        /**
         * Calls GetCartridge.
         * @function getCartridge
         * @memberof chr97.Chr97Agent
         * @instance
         * @param {chr97.IGetCartridgeRequest} request GetCartridgeRequest message or plain object
         * @param {chr97.Chr97Agent.GetCartridgeCallback} callback Node-style callback called with the error, if any, and GetCartridgeResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(Chr97Agent.prototype.getCartridge = function getCartridge(request, callback) {
            return this.rpcCall(getCartridge, $root.chr97.GetCartridgeRequest, $root.chr97.GetCartridgeResponse, request, callback);
        }, "name", { value: "GetCartridge" });

        /**
         * Calls GetCartridge.
         * @function getCartridge
         * @memberof chr97.Chr97Agent
         * @instance
         * @param {chr97.IGetCartridgeRequest} request GetCartridgeRequest message or plain object
         * @returns {Promise<chr97.GetCartridgeResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link chr97.Chr97Agent#queryTags}.
         * @memberof chr97.Chr97Agent
         * @typedef QueryTagsCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {chr97.TagQueryResponse} [response] TagQueryResponse
         */

        /**
         * Calls QueryTags.
         * @function queryTags
         * @memberof chr97.Chr97Agent
         * @instance
         * @param {chr97.ITagQueryRequest} request TagQueryRequest message or plain object
         * @param {chr97.Chr97Agent.QueryTagsCallback} callback Node-style callback called with the error, if any, and TagQueryResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(Chr97Agent.prototype.queryTags = function queryTags(request, callback) {
            return this.rpcCall(queryTags, $root.chr97.TagQueryRequest, $root.chr97.TagQueryResponse, request, callback);
        }, "name", { value: "QueryTags" });

        /**
         * Calls QueryTags.
         * @function queryTags
         * @memberof chr97.Chr97Agent
         * @instance
         * @param {chr97.ITagQueryRequest} request TagQueryRequest message or plain object
         * @returns {Promise<chr97.TagQueryResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link chr97.Chr97Agent#getTimeline}.
         * @memberof chr97.Chr97Agent
         * @typedef GetTimelineCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {chr97.TimelineResponse} [response] TimelineResponse
         */

        /**
         * Calls GetTimeline.
         * @function getTimeline
         * @memberof chr97.Chr97Agent
         * @instance
         * @param {chr97.ITimelineRequest} request TimelineRequest message or plain object
         * @param {chr97.Chr97Agent.GetTimelineCallback} callback Node-style callback called with the error, if any, and TimelineResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(Chr97Agent.prototype.getTimeline = function getTimeline(request, callback) {
            return this.rpcCall(getTimeline, $root.chr97.TimelineRequest, $root.chr97.TimelineResponse, request, callback);
        }, "name", { value: "GetTimeline" });

        /**
         * Calls GetTimeline.
         * @function getTimeline
         * @memberof chr97.Chr97Agent
         * @instance
         * @param {chr97.ITimelineRequest} request TimelineRequest message or plain object
         * @returns {Promise<chr97.TimelineResponse>} Promise
         * @variation 2
         */

        return Chr97Agent;
    })();

    return chr97;
})();

export { $root as default };
