/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const embedding = $root.embedding = (() => {

    /**
     * Namespace embedding.
     * @exports embedding
     * @namespace
     */
    const embedding = {};

    embedding.EmbeddingService = (function() {

        /**
         * Constructs a new EmbeddingService service.
         * @memberof embedding
         * @classdesc Represents an EmbeddingService
         * @extends $protobuf.rpc.Service
         * @constructor
         * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
         * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
         * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
         */
        function EmbeddingService(rpcImpl, requestDelimited, responseDelimited) {
            $protobuf.rpc.Service.call(this, rpcImpl, requestDelimited, responseDelimited);
        }

        (EmbeddingService.prototype = Object.create($protobuf.rpc.Service.prototype)).constructor = EmbeddingService;

        /**
         * Callback as used by {@link embedding.EmbeddingService#generateEmbeddings}.
         * @memberof embedding.EmbeddingService
         * @typedef GenerateEmbeddingsCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {embedding.EmbeddingResponse} [response] EmbeddingResponse
         */

        /**
         * Calls GenerateEmbeddings.
         * @function generateEmbeddings
         * @memberof embedding.EmbeddingService
         * @instance
         * @param {embedding.IEmbeddingRequest} request EmbeddingRequest message or plain object
         * @param {embedding.EmbeddingService.GenerateEmbeddingsCallback} callback Node-style callback called with the error, if any, and EmbeddingResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(EmbeddingService.prototype.generateEmbeddings = function generateEmbeddings(request, callback) {
            return this.rpcCall(generateEmbeddings, $root.embedding.EmbeddingRequest, $root.embedding.EmbeddingResponse, request, callback);
        }, "name", { value: "GenerateEmbeddings" });

        /**
         * Calls GenerateEmbeddings.
         * @function generateEmbeddings
         * @memberof embedding.EmbeddingService
         * @instance
         * @param {embedding.IEmbeddingRequest} request EmbeddingRequest message or plain object
         * @returns {Promise<embedding.EmbeddingResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link embedding.EmbeddingService#streamEmbeddings}.
         * @memberof embedding.EmbeddingService
         * @typedef StreamEmbeddingsCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {embedding.EmbeddingResult} [response] EmbeddingResult
         */

        /**
         * Calls StreamEmbeddings.
         * @function streamEmbeddings
         * @memberof embedding.EmbeddingService
         * @instance
         * @param {embedding.IEmbeddingChunk} request EmbeddingChunk message or plain object
         * @param {embedding.EmbeddingService.StreamEmbeddingsCallback} callback Node-style callback called with the error, if any, and EmbeddingResult
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(EmbeddingService.prototype.streamEmbeddings = function streamEmbeddings(request, callback) {
            return this.rpcCall(streamEmbeddings, $root.embedding.EmbeddingChunk, $root.embedding.EmbeddingResult, request, callback);
        }, "name", { value: "StreamEmbeddings" });

        /**
         * Calls StreamEmbeddings.
         * @function streamEmbeddings
         * @memberof embedding.EmbeddingService
         * @instance
         * @param {embedding.IEmbeddingChunk} request EmbeddingChunk message or plain object
         * @returns {Promise<embedding.EmbeddingResult>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link embedding.EmbeddingService#health}.
         * @memberof embedding.EmbeddingService
         * @typedef HealthCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {embedding.HealthResponse} [response] HealthResponse
         */

        /**
         * Calls Health.
         * @function health
         * @memberof embedding.EmbeddingService
         * @instance
         * @param {embedding.IHealthRequest} request HealthRequest message or plain object
         * @param {embedding.EmbeddingService.HealthCallback} callback Node-style callback called with the error, if any, and HealthResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(EmbeddingService.prototype.health = function health(request, callback) {
            return this.rpcCall(health, $root.embedding.HealthRequest, $root.embedding.HealthResponse, request, callback);
        }, "name", { value: "Health" });

        /**
         * Calls Health.
         * @function health
         * @memberof embedding.EmbeddingService
         * @instance
         * @param {embedding.IHealthRequest} request HealthRequest message or plain object
         * @returns {Promise<embedding.HealthResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link embedding.EmbeddingService#getStats}.
         * @memberof embedding.EmbeddingService
         * @typedef GetStatsCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {embedding.StatsResponse} [response] StatsResponse
         */

        /**
         * Calls GetStats.
         * @function getStats
         * @memberof embedding.EmbeddingService
         * @instance
         * @param {embedding.IStatsRequest} request StatsRequest message or plain object
         * @param {embedding.EmbeddingService.GetStatsCallback} callback Node-style callback called with the error, if any, and StatsResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(EmbeddingService.prototype.getStats = function getStats(request, callback) {
            return this.rpcCall(getStats, $root.embedding.StatsRequest, $root.embedding.StatsResponse, request, callback);
        }, "name", { value: "GetStats" });

        /**
         * Calls GetStats.
         * @function getStats
         * @memberof embedding.EmbeddingService
         * @instance
         * @param {embedding.IStatsRequest} request StatsRequest message or plain object
         * @returns {Promise<embedding.StatsResponse>} Promise
         * @variation 2
         */

        return EmbeddingService;
    })();

    embedding.EmbeddingChunk = (function() {

        /**
         * Properties of an EmbeddingChunk.
         * @memberof embedding
         * @interface IEmbeddingChunk
         * @property {string|null} [chunkId] EmbeddingChunk chunkId
         * @property {string|null} [text] EmbeddingChunk text
         * @property {string|null} [filePath] EmbeddingChunk filePath
         * @property {string|null} [language] EmbeddingChunk language
         * @property {Object.<string,string>|null} [metadata] EmbeddingChunk metadata
         */

        /**
         * Constructs a new EmbeddingChunk.
         * @memberof embedding
         * @classdesc Single embedding request
         * @implements IEmbeddingChunk
         * @constructor
         * @param {embedding.IEmbeddingChunk=} [properties] Properties to set
         */
        function EmbeddingChunk(properties) {
            this.metadata = {};
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * EmbeddingChunk chunkId.
         * @member {string} chunkId
         * @memberof embedding.EmbeddingChunk
         * @instance
         */
        EmbeddingChunk.prototype.chunkId = "";

        /**
         * EmbeddingChunk text.
         * @member {string} text
         * @memberof embedding.EmbeddingChunk
         * @instance
         */
        EmbeddingChunk.prototype.text = "";

        /**
         * EmbeddingChunk filePath.
         * @member {string} filePath
         * @memberof embedding.EmbeddingChunk
         * @instance
         */
        EmbeddingChunk.prototype.filePath = "";

        /**
         * EmbeddingChunk language.
         * @member {string} language
         * @memberof embedding.EmbeddingChunk
         * @instance
         */
        EmbeddingChunk.prototype.language = "";

        /**
         * EmbeddingChunk metadata.
         * @member {Object.<string,string>} metadata
         * @memberof embedding.EmbeddingChunk
         * @instance
         */
        EmbeddingChunk.prototype.metadata = $util.emptyObject;

        /**
         * Encodes the specified EmbeddingChunk message. Does not implicitly {@link embedding.EmbeddingChunk.verify|verify} messages.
         * @function encode
         * @memberof embedding.EmbeddingChunk
         * @static
         * @param {embedding.IEmbeddingChunk} message EmbeddingChunk message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        EmbeddingChunk.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.chunkId != null && Object.hasOwnProperty.call(message, "chunkId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.chunkId);
            if (message.text != null && Object.hasOwnProperty.call(message, "text"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.text);
            if (message.filePath != null && Object.hasOwnProperty.call(message, "filePath"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.filePath);
            if (message.language != null && Object.hasOwnProperty.call(message, "language"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.language);
            if (message.metadata != null && Object.hasOwnProperty.call(message, "metadata"))
                for (let keys = Object.keys(message.metadata), i = 0; i < keys.length; ++i)
                    writer.uint32(/* id 5, wireType 2 =*/42).fork().uint32(/* id 1, wireType 2 =*/10).string(keys[i]).uint32(/* id 2, wireType 2 =*/18).string(message.metadata[keys[i]]).ldelim();
            return writer;
        };

        /**
         * Encodes the specified EmbeddingChunk message, length delimited. Does not implicitly {@link embedding.EmbeddingChunk.verify|verify} messages.
         * @function encodeDelimited
         * @memberof embedding.EmbeddingChunk
         * @static
         * @param {embedding.IEmbeddingChunk} message EmbeddingChunk message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        EmbeddingChunk.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an EmbeddingChunk message from the specified reader or buffer.
         * @function decode
         * @memberof embedding.EmbeddingChunk
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {embedding.EmbeddingChunk} EmbeddingChunk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EmbeddingChunk.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.embedding.EmbeddingChunk(), key, value;
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.chunkId = reader.string();
                        break;
                    }
                case 2: {
                        message.text = reader.string();
                        break;
                    }
                case 3: {
                        message.filePath = reader.string();
                        break;
                    }
                case 4: {
                        message.language = reader.string();
                        break;
                    }
                case 5: {
                        if (message.metadata === $util.emptyObject)
                            message.metadata = {};
                        let end2 = reader.uint32() + reader.pos;
                        key = "";
                        value = "";
                        while (reader.pos < end2) {
                            let tag2 = reader.uint32();
                            switch (tag2 >>> 3) {
                            case 1:
                                key = reader.string();
                                break;
                            case 2:
                                value = reader.string();
                                break;
                            default:
                                reader.skipType(tag2 & 7, long);
                                break;
                            }
                        }
                        if (key === "__proto__")
                            $util.makeProp(message.metadata, key);
                        message.metadata[key] = value;
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
         * Decodes an EmbeddingChunk message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof embedding.EmbeddingChunk
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {embedding.EmbeddingChunk} EmbeddingChunk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EmbeddingChunk.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for EmbeddingChunk
         * @function getTypeUrl
         * @memberof embedding.EmbeddingChunk
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        EmbeddingChunk.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/embedding.EmbeddingChunk";
        };

        return EmbeddingChunk;
    })();

    embedding.EmbeddingRequest = (function() {

        /**
         * Properties of an EmbeddingRequest.
         * @memberof embedding
         * @interface IEmbeddingRequest
         * @property {Array.<embedding.IEmbeddingChunk>|null} [chunks] EmbeddingRequest chunks
         * @property {number|null} [batchSize] EmbeddingRequest batchSize
         * @property {boolean|null} [normalize] EmbeddingRequest normalize
         * @property {number|null} [maxLength] EmbeddingRequest maxLength
         */

        /**
         * Constructs a new EmbeddingRequest.
         * @memberof embedding
         * @classdesc Batch embedding request
         * @implements IEmbeddingRequest
         * @constructor
         * @param {embedding.IEmbeddingRequest=} [properties] Properties to set
         */
        function EmbeddingRequest(properties) {
            this.chunks = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * EmbeddingRequest chunks.
         * @member {Array.<embedding.IEmbeddingChunk>} chunks
         * @memberof embedding.EmbeddingRequest
         * @instance
         */
        EmbeddingRequest.prototype.chunks = $util.emptyArray;

        /**
         * EmbeddingRequest batchSize.
         * @member {number} batchSize
         * @memberof embedding.EmbeddingRequest
         * @instance
         */
        EmbeddingRequest.prototype.batchSize = 0;

        /**
         * EmbeddingRequest normalize.
         * @member {boolean} normalize
         * @memberof embedding.EmbeddingRequest
         * @instance
         */
        EmbeddingRequest.prototype.normalize = false;

        /**
         * EmbeddingRequest maxLength.
         * @member {number} maxLength
         * @memberof embedding.EmbeddingRequest
         * @instance
         */
        EmbeddingRequest.prototype.maxLength = 0;

        /**
         * Encodes the specified EmbeddingRequest message. Does not implicitly {@link embedding.EmbeddingRequest.verify|verify} messages.
         * @function encode
         * @memberof embedding.EmbeddingRequest
         * @static
         * @param {embedding.IEmbeddingRequest} message EmbeddingRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        EmbeddingRequest.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.chunks != null && message.chunks.length)
                for (let i = 0; i < message.chunks.length; ++i)
                    $root.embedding.EmbeddingChunk.encode(message.chunks[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
            if (message.batchSize != null && Object.hasOwnProperty.call(message, "batchSize"))
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.batchSize);
            if (message.normalize != null && Object.hasOwnProperty.call(message, "normalize"))
                writer.uint32(/* id 3, wireType 0 =*/24).bool(message.normalize);
            if (message.maxLength != null && Object.hasOwnProperty.call(message, "maxLength"))
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.maxLength);
            return writer;
        };

        /**
         * Encodes the specified EmbeddingRequest message, length delimited. Does not implicitly {@link embedding.EmbeddingRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof embedding.EmbeddingRequest
         * @static
         * @param {embedding.IEmbeddingRequest} message EmbeddingRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        EmbeddingRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an EmbeddingRequest message from the specified reader or buffer.
         * @function decode
         * @memberof embedding.EmbeddingRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {embedding.EmbeddingRequest} EmbeddingRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EmbeddingRequest.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.embedding.EmbeddingRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.chunks && message.chunks.length))
                            message.chunks = [];
                        message.chunks.push($root.embedding.EmbeddingChunk.decode(reader, reader.uint32(), undefined, long + 1));
                        break;
                    }
                case 2: {
                        message.batchSize = reader.int32();
                        break;
                    }
                case 3: {
                        message.normalize = reader.bool();
                        break;
                    }
                case 4: {
                        message.maxLength = reader.int32();
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
         * Decodes an EmbeddingRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof embedding.EmbeddingRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {embedding.EmbeddingRequest} EmbeddingRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EmbeddingRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for EmbeddingRequest
         * @function getTypeUrl
         * @memberof embedding.EmbeddingRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        EmbeddingRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/embedding.EmbeddingRequest";
        };

        return EmbeddingRequest;
    })();

    embedding.Embedding = (function() {

        /**
         * Properties of an Embedding.
         * @memberof embedding
         * @interface IEmbedding
         * @property {string|null} [chunkId] Embedding chunkId
         * @property {Array.<number>|null} [vector] Embedding vector
         * @property {number|null} [processingTimeMs] Embedding processingTimeMs
         * @property {number|null} [tokenCount] Embedding tokenCount
         * @property {string|null} [status] Embedding status
         */

        /**
         * Constructs a new Embedding.
         * @memberof embedding
         * @classdesc Single embedding result
         * @implements IEmbedding
         * @constructor
         * @param {embedding.IEmbedding=} [properties] Properties to set
         */
        function Embedding(properties) {
            this.vector = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Embedding chunkId.
         * @member {string} chunkId
         * @memberof embedding.Embedding
         * @instance
         */
        Embedding.prototype.chunkId = "";

        /**
         * Embedding vector.
         * @member {Array.<number>} vector
         * @memberof embedding.Embedding
         * @instance
         */
        Embedding.prototype.vector = $util.emptyArray;

        /**
         * Embedding processingTimeMs.
         * @member {number} processingTimeMs
         * @memberof embedding.Embedding
         * @instance
         */
        Embedding.prototype.processingTimeMs = 0;

        /**
         * Embedding tokenCount.
         * @member {number} tokenCount
         * @memberof embedding.Embedding
         * @instance
         */
        Embedding.prototype.tokenCount = 0;

        /**
         * Embedding status.
         * @member {string} status
         * @memberof embedding.Embedding
         * @instance
         */
        Embedding.prototype.status = "";

        /**
         * Encodes the specified Embedding message. Does not implicitly {@link embedding.Embedding.verify|verify} messages.
         * @function encode
         * @memberof embedding.Embedding
         * @static
         * @param {embedding.IEmbedding} message Embedding message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Embedding.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.chunkId != null && Object.hasOwnProperty.call(message, "chunkId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.chunkId);
            if (message.vector != null && message.vector.length) {
                writer.uint32(/* id 2, wireType 2 =*/18).fork();
                for (let i = 0; i < message.vector.length; ++i)
                    writer.float(message.vector[i]);
                writer.ldelim();
            }
            if (message.processingTimeMs != null && Object.hasOwnProperty.call(message, "processingTimeMs"))
                writer.uint32(/* id 3, wireType 5 =*/29).float(message.processingTimeMs);
            if (message.tokenCount != null && Object.hasOwnProperty.call(message, "tokenCount"))
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.tokenCount);
            if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.status);
            return writer;
        };

        /**
         * Encodes the specified Embedding message, length delimited. Does not implicitly {@link embedding.Embedding.verify|verify} messages.
         * @function encodeDelimited
         * @memberof embedding.Embedding
         * @static
         * @param {embedding.IEmbedding} message Embedding message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Embedding.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an Embedding message from the specified reader or buffer.
         * @function decode
         * @memberof embedding.Embedding
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {embedding.Embedding} Embedding
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Embedding.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.embedding.Embedding();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.chunkId = reader.string();
                        break;
                    }
                case 2: {
                        if (!(message.vector && message.vector.length))
                            message.vector = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.vector.push(reader.float());
                        } else
                            message.vector.push(reader.float());
                        break;
                    }
                case 3: {
                        message.processingTimeMs = reader.float();
                        break;
                    }
                case 4: {
                        message.tokenCount = reader.int32();
                        break;
                    }
                case 5: {
                        message.status = reader.string();
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
         * Decodes an Embedding message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof embedding.Embedding
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {embedding.Embedding} Embedding
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Embedding.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for Embedding
         * @function getTypeUrl
         * @memberof embedding.Embedding
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Embedding.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/embedding.Embedding";
        };

        return Embedding;
    })();

    embedding.EmbeddingResponse = (function() {

        /**
         * Properties of an EmbeddingResponse.
         * @memberof embedding
         * @interface IEmbeddingResponse
         * @property {Array.<embedding.IEmbedding>|null} [embeddings] EmbeddingResponse embeddings
         * @property {number|null} [totalTimeMs] EmbeddingResponse totalTimeMs
         * @property {string|null} [modelName] EmbeddingResponse modelName
         * @property {number|null} [embeddingDimension] EmbeddingResponse embeddingDimension
         * @property {string|null} [status] EmbeddingResponse status
         */

        /**
         * Constructs a new EmbeddingResponse.
         * @memberof embedding
         * @classdesc Batch embedding response
         * @implements IEmbeddingResponse
         * @constructor
         * @param {embedding.IEmbeddingResponse=} [properties] Properties to set
         */
        function EmbeddingResponse(properties) {
            this.embeddings = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * EmbeddingResponse embeddings.
         * @member {Array.<embedding.IEmbedding>} embeddings
         * @memberof embedding.EmbeddingResponse
         * @instance
         */
        EmbeddingResponse.prototype.embeddings = $util.emptyArray;

        /**
         * EmbeddingResponse totalTimeMs.
         * @member {number} totalTimeMs
         * @memberof embedding.EmbeddingResponse
         * @instance
         */
        EmbeddingResponse.prototype.totalTimeMs = 0;

        /**
         * EmbeddingResponse modelName.
         * @member {string} modelName
         * @memberof embedding.EmbeddingResponse
         * @instance
         */
        EmbeddingResponse.prototype.modelName = "";

        /**
         * EmbeddingResponse embeddingDimension.
         * @member {number} embeddingDimension
         * @memberof embedding.EmbeddingResponse
         * @instance
         */
        EmbeddingResponse.prototype.embeddingDimension = 0;

        /**
         * EmbeddingResponse status.
         * @member {string} status
         * @memberof embedding.EmbeddingResponse
         * @instance
         */
        EmbeddingResponse.prototype.status = "";

        /**
         * Encodes the specified EmbeddingResponse message. Does not implicitly {@link embedding.EmbeddingResponse.verify|verify} messages.
         * @function encode
         * @memberof embedding.EmbeddingResponse
         * @static
         * @param {embedding.IEmbeddingResponse} message EmbeddingResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        EmbeddingResponse.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.embeddings != null && message.embeddings.length)
                for (let i = 0; i < message.embeddings.length; ++i)
                    $root.embedding.Embedding.encode(message.embeddings[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
            if (message.totalTimeMs != null && Object.hasOwnProperty.call(message, "totalTimeMs"))
                writer.uint32(/* id 2, wireType 5 =*/21).float(message.totalTimeMs);
            if (message.modelName != null && Object.hasOwnProperty.call(message, "modelName"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.modelName);
            if (message.embeddingDimension != null && Object.hasOwnProperty.call(message, "embeddingDimension"))
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.embeddingDimension);
            if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.status);
            return writer;
        };

        /**
         * Encodes the specified EmbeddingResponse message, length delimited. Does not implicitly {@link embedding.EmbeddingResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof embedding.EmbeddingResponse
         * @static
         * @param {embedding.IEmbeddingResponse} message EmbeddingResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        EmbeddingResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an EmbeddingResponse message from the specified reader or buffer.
         * @function decode
         * @memberof embedding.EmbeddingResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {embedding.EmbeddingResponse} EmbeddingResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EmbeddingResponse.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.embedding.EmbeddingResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.embeddings && message.embeddings.length))
                            message.embeddings = [];
                        message.embeddings.push($root.embedding.Embedding.decode(reader, reader.uint32(), undefined, long + 1));
                        break;
                    }
                case 2: {
                        message.totalTimeMs = reader.float();
                        break;
                    }
                case 3: {
                        message.modelName = reader.string();
                        break;
                    }
                case 4: {
                        message.embeddingDimension = reader.int32();
                        break;
                    }
                case 5: {
                        message.status = reader.string();
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
         * Decodes an EmbeddingResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof embedding.EmbeddingResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {embedding.EmbeddingResponse} EmbeddingResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EmbeddingResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for EmbeddingResponse
         * @function getTypeUrl
         * @memberof embedding.EmbeddingResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        EmbeddingResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/embedding.EmbeddingResponse";
        };

        return EmbeddingResponse;
    })();

    embedding.EmbeddingResult = (function() {

        /**
         * Properties of an EmbeddingResult.
         * @memberof embedding
         * @interface IEmbeddingResult
         * @property {string|null} [chunkId] EmbeddingResult chunkId
         * @property {Array.<number>|null} [vector] EmbeddingResult vector
         * @property {number|null} [processingTimeMs] EmbeddingResult processingTimeMs
         * @property {number|null} [tokenCount] EmbeddingResult tokenCount
         * @property {string|null} [status] EmbeddingResult status
         * @property {number|null} [sequenceNumber] EmbeddingResult sequenceNumber
         */

        /**
         * Constructs a new EmbeddingResult.
         * @memberof embedding
         * @classdesc Streaming embedding result (for SSE)
         * @implements IEmbeddingResult
         * @constructor
         * @param {embedding.IEmbeddingResult=} [properties] Properties to set
         */
        function EmbeddingResult(properties) {
            this.vector = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * EmbeddingResult chunkId.
         * @member {string} chunkId
         * @memberof embedding.EmbeddingResult
         * @instance
         */
        EmbeddingResult.prototype.chunkId = "";

        /**
         * EmbeddingResult vector.
         * @member {Array.<number>} vector
         * @memberof embedding.EmbeddingResult
         * @instance
         */
        EmbeddingResult.prototype.vector = $util.emptyArray;

        /**
         * EmbeddingResult processingTimeMs.
         * @member {number} processingTimeMs
         * @memberof embedding.EmbeddingResult
         * @instance
         */
        EmbeddingResult.prototype.processingTimeMs = 0;

        /**
         * EmbeddingResult tokenCount.
         * @member {number} tokenCount
         * @memberof embedding.EmbeddingResult
         * @instance
         */
        EmbeddingResult.prototype.tokenCount = 0;

        /**
         * EmbeddingResult status.
         * @member {string} status
         * @memberof embedding.EmbeddingResult
         * @instance
         */
        EmbeddingResult.prototype.status = "";

        /**
         * EmbeddingResult sequenceNumber.
         * @member {number} sequenceNumber
         * @memberof embedding.EmbeddingResult
         * @instance
         */
        EmbeddingResult.prototype.sequenceNumber = 0;

        /**
         * Encodes the specified EmbeddingResult message. Does not implicitly {@link embedding.EmbeddingResult.verify|verify} messages.
         * @function encode
         * @memberof embedding.EmbeddingResult
         * @static
         * @param {embedding.IEmbeddingResult} message EmbeddingResult message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        EmbeddingResult.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.chunkId != null && Object.hasOwnProperty.call(message, "chunkId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.chunkId);
            if (message.vector != null && message.vector.length) {
                writer.uint32(/* id 2, wireType 2 =*/18).fork();
                for (let i = 0; i < message.vector.length; ++i)
                    writer.float(message.vector[i]);
                writer.ldelim();
            }
            if (message.processingTimeMs != null && Object.hasOwnProperty.call(message, "processingTimeMs"))
                writer.uint32(/* id 3, wireType 5 =*/29).float(message.processingTimeMs);
            if (message.tokenCount != null && Object.hasOwnProperty.call(message, "tokenCount"))
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.tokenCount);
            if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.status);
            if (message.sequenceNumber != null && Object.hasOwnProperty.call(message, "sequenceNumber"))
                writer.uint32(/* id 6, wireType 0 =*/48).int32(message.sequenceNumber);
            return writer;
        };

        /**
         * Encodes the specified EmbeddingResult message, length delimited. Does not implicitly {@link embedding.EmbeddingResult.verify|verify} messages.
         * @function encodeDelimited
         * @memberof embedding.EmbeddingResult
         * @static
         * @param {embedding.IEmbeddingResult} message EmbeddingResult message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        EmbeddingResult.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an EmbeddingResult message from the specified reader or buffer.
         * @function decode
         * @memberof embedding.EmbeddingResult
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {embedding.EmbeddingResult} EmbeddingResult
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EmbeddingResult.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.embedding.EmbeddingResult();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.chunkId = reader.string();
                        break;
                    }
                case 2: {
                        if (!(message.vector && message.vector.length))
                            message.vector = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.vector.push(reader.float());
                        } else
                            message.vector.push(reader.float());
                        break;
                    }
                case 3: {
                        message.processingTimeMs = reader.float();
                        break;
                    }
                case 4: {
                        message.tokenCount = reader.int32();
                        break;
                    }
                case 5: {
                        message.status = reader.string();
                        break;
                    }
                case 6: {
                        message.sequenceNumber = reader.int32();
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
         * Decodes an EmbeddingResult message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof embedding.EmbeddingResult
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {embedding.EmbeddingResult} EmbeddingResult
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EmbeddingResult.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for EmbeddingResult
         * @function getTypeUrl
         * @memberof embedding.EmbeddingResult
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        EmbeddingResult.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/embedding.EmbeddingResult";
        };

        return EmbeddingResult;
    })();

    embedding.HealthRequest = (function() {

        /**
         * Properties of a HealthRequest.
         * @memberof embedding
         * @interface IHealthRequest
         * @property {string|null} [service] HealthRequest service
         */

        /**
         * Constructs a new HealthRequest.
         * @memberof embedding
         * @classdesc Health check request
         * @implements IHealthRequest
         * @constructor
         * @param {embedding.IHealthRequest=} [properties] Properties to set
         */
        function HealthRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * HealthRequest service.
         * @member {string} service
         * @memberof embedding.HealthRequest
         * @instance
         */
        HealthRequest.prototype.service = "";

        /**
         * Encodes the specified HealthRequest message. Does not implicitly {@link embedding.HealthRequest.verify|verify} messages.
         * @function encode
         * @memberof embedding.HealthRequest
         * @static
         * @param {embedding.IHealthRequest} message HealthRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HealthRequest.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.service != null && Object.hasOwnProperty.call(message, "service"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.service);
            return writer;
        };

        /**
         * Encodes the specified HealthRequest message, length delimited. Does not implicitly {@link embedding.HealthRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof embedding.HealthRequest
         * @static
         * @param {embedding.IHealthRequest} message HealthRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HealthRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a HealthRequest message from the specified reader or buffer.
         * @function decode
         * @memberof embedding.HealthRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {embedding.HealthRequest} HealthRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        HealthRequest.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.embedding.HealthRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.service = reader.string();
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
         * Decodes a HealthRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof embedding.HealthRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {embedding.HealthRequest} HealthRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        HealthRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for HealthRequest
         * @function getTypeUrl
         * @memberof embedding.HealthRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        HealthRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/embedding.HealthRequest";
        };

        return HealthRequest;
    })();

    embedding.HealthResponse = (function() {

        /**
         * Properties of a HealthResponse.
         * @memberof embedding
         * @interface IHealthResponse
         * @property {string|null} [status] HealthResponse status
         * @property {string|null} [modelLoaded] HealthResponse modelLoaded
         * @property {number|null} [gpuMemoryUsedGb] HealthResponse gpuMemoryUsedGb
         * @property {number|null} [gpuMemoryTotalGb] HealthResponse gpuMemoryTotalGb
         * @property {string|null} [device] HealthResponse device
         * @property {number|Long|null} [timestamp] HealthResponse timestamp
         */

        /**
         * Constructs a new HealthResponse.
         * @memberof embedding
         * @classdesc Health check response
         * @implements IHealthResponse
         * @constructor
         * @param {embedding.IHealthResponse=} [properties] Properties to set
         */
        function HealthResponse(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * HealthResponse status.
         * @member {string} status
         * @memberof embedding.HealthResponse
         * @instance
         */
        HealthResponse.prototype.status = "";

        /**
         * HealthResponse modelLoaded.
         * @member {string} modelLoaded
         * @memberof embedding.HealthResponse
         * @instance
         */
        HealthResponse.prototype.modelLoaded = "";

        /**
         * HealthResponse gpuMemoryUsedGb.
         * @member {number} gpuMemoryUsedGb
         * @memberof embedding.HealthResponse
         * @instance
         */
        HealthResponse.prototype.gpuMemoryUsedGb = 0;

        /**
         * HealthResponse gpuMemoryTotalGb.
         * @member {number} gpuMemoryTotalGb
         * @memberof embedding.HealthResponse
         * @instance
         */
        HealthResponse.prototype.gpuMemoryTotalGb = 0;

        /**
         * HealthResponse device.
         * @member {string} device
         * @memberof embedding.HealthResponse
         * @instance
         */
        HealthResponse.prototype.device = "";

        /**
         * HealthResponse timestamp.
         * @member {number|Long} timestamp
         * @memberof embedding.HealthResponse
         * @instance
         */
        HealthResponse.prototype.timestamp = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * Encodes the specified HealthResponse message. Does not implicitly {@link embedding.HealthResponse.verify|verify} messages.
         * @function encode
         * @memberof embedding.HealthResponse
         * @static
         * @param {embedding.IHealthResponse} message HealthResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HealthResponse.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.status);
            if (message.modelLoaded != null && Object.hasOwnProperty.call(message, "modelLoaded"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.modelLoaded);
            if (message.gpuMemoryUsedGb != null && Object.hasOwnProperty.call(message, "gpuMemoryUsedGb"))
                writer.uint32(/* id 3, wireType 5 =*/29).float(message.gpuMemoryUsedGb);
            if (message.gpuMemoryTotalGb != null && Object.hasOwnProperty.call(message, "gpuMemoryTotalGb"))
                writer.uint32(/* id 4, wireType 5 =*/37).float(message.gpuMemoryTotalGb);
            if (message.device != null && Object.hasOwnProperty.call(message, "device"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.device);
            if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                writer.uint32(/* id 6, wireType 0 =*/48).int64(message.timestamp);
            return writer;
        };

        /**
         * Encodes the specified HealthResponse message, length delimited. Does not implicitly {@link embedding.HealthResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof embedding.HealthResponse
         * @static
         * @param {embedding.IHealthResponse} message HealthResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HealthResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a HealthResponse message from the specified reader or buffer.
         * @function decode
         * @memberof embedding.HealthResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {embedding.HealthResponse} HealthResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        HealthResponse.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.embedding.HealthResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.status = reader.string();
                        break;
                    }
                case 2: {
                        message.modelLoaded = reader.string();
                        break;
                    }
                case 3: {
                        message.gpuMemoryUsedGb = reader.float();
                        break;
                    }
                case 4: {
                        message.gpuMemoryTotalGb = reader.float();
                        break;
                    }
                case 5: {
                        message.device = reader.string();
                        break;
                    }
                case 6: {
                        message.timestamp = reader.int64();
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
         * Decodes a HealthResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof embedding.HealthResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {embedding.HealthResponse} HealthResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        HealthResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for HealthResponse
         * @function getTypeUrl
         * @memberof embedding.HealthResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        HealthResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/embedding.HealthResponse";
        };

        return HealthResponse;
    })();

    embedding.StatsRequest = (function() {

        /**
         * Properties of a StatsRequest.
         * @memberof embedding
         * @interface IStatsRequest
         * @property {boolean|null} [includeMemory] StatsRequest includeMemory
         */

        /**
         * Constructs a new StatsRequest.
         * @memberof embedding
         * @classdesc Stats request
         * @implements IStatsRequest
         * @constructor
         * @param {embedding.IStatsRequest=} [properties] Properties to set
         */
        function StatsRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * StatsRequest includeMemory.
         * @member {boolean} includeMemory
         * @memberof embedding.StatsRequest
         * @instance
         */
        StatsRequest.prototype.includeMemory = false;

        /**
         * Encodes the specified StatsRequest message. Does not implicitly {@link embedding.StatsRequest.verify|verify} messages.
         * @function encode
         * @memberof embedding.StatsRequest
         * @static
         * @param {embedding.IStatsRequest} message StatsRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        StatsRequest.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.includeMemory != null && Object.hasOwnProperty.call(message, "includeMemory"))
                writer.uint32(/* id 1, wireType 0 =*/8).bool(message.includeMemory);
            return writer;
        };

        /**
         * Encodes the specified StatsRequest message, length delimited. Does not implicitly {@link embedding.StatsRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof embedding.StatsRequest
         * @static
         * @param {embedding.IStatsRequest} message StatsRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        StatsRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a StatsRequest message from the specified reader or buffer.
         * @function decode
         * @memberof embedding.StatsRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {embedding.StatsRequest} StatsRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        StatsRequest.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.embedding.StatsRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.includeMemory = reader.bool();
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
         * Decodes a StatsRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof embedding.StatsRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {embedding.StatsRequest} StatsRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        StatsRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for StatsRequest
         * @function getTypeUrl
         * @memberof embedding.StatsRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        StatsRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/embedding.StatsRequest";
        };

        return StatsRequest;
    })();

    embedding.StatsResponse = (function() {

        /**
         * Properties of a StatsResponse.
         * @memberof embedding
         * @interface IStatsResponse
         * @property {string|null} [modelName] StatsResponse modelName
         * @property {string|null} [device] StatsResponse device
         * @property {boolean|null} [isLoaded] StatsResponse isLoaded
         * @property {number|null} [embeddingDimension] StatsResponse embeddingDimension
         * @property {number|null} [batchSize] StatsResponse batchSize
         * @property {number|null} [maxLength] StatsResponse maxLength
         * @property {number|Long|null} [totalRequests] StatsResponse totalRequests
         * @property {number|null} [totalProcessingTimeS] StatsResponse totalProcessingTimeS
         * @property {number|null} [avgProcessingTimeMs] StatsResponse avgProcessingTimeMs
         * @property {boolean|null} [gpuAvailable] StatsResponse gpuAvailable
         * @property {number|null} [gpuMemoryAllocatedGb] StatsResponse gpuMemoryAllocatedGb
         * @property {number|null} [gpuMemoryReservedGb] StatsResponse gpuMemoryReservedGb
         * @property {number|null} [uptimeSeconds] StatsResponse uptimeSeconds
         */

        /**
         * Constructs a new StatsResponse.
         * @memberof embedding
         * @classdesc Stats response
         * @implements IStatsResponse
         * @constructor
         * @param {embedding.IStatsResponse=} [properties] Properties to set
         */
        function StatsResponse(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * StatsResponse modelName.
         * @member {string} modelName
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.modelName = "";

        /**
         * StatsResponse device.
         * @member {string} device
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.device = "";

        /**
         * StatsResponse isLoaded.
         * @member {boolean} isLoaded
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.isLoaded = false;

        /**
         * StatsResponse embeddingDimension.
         * @member {number} embeddingDimension
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.embeddingDimension = 0;

        /**
         * StatsResponse batchSize.
         * @member {number} batchSize
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.batchSize = 0;

        /**
         * StatsResponse maxLength.
         * @member {number} maxLength
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.maxLength = 0;

        /**
         * StatsResponse totalRequests.
         * @member {number|Long} totalRequests
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.totalRequests = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * StatsResponse totalProcessingTimeS.
         * @member {number} totalProcessingTimeS
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.totalProcessingTimeS = 0;

        /**
         * StatsResponse avgProcessingTimeMs.
         * @member {number} avgProcessingTimeMs
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.avgProcessingTimeMs = 0;

        /**
         * StatsResponse gpuAvailable.
         * @member {boolean} gpuAvailable
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.gpuAvailable = false;

        /**
         * StatsResponse gpuMemoryAllocatedGb.
         * @member {number} gpuMemoryAllocatedGb
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.gpuMemoryAllocatedGb = 0;

        /**
         * StatsResponse gpuMemoryReservedGb.
         * @member {number} gpuMemoryReservedGb
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.gpuMemoryReservedGb = 0;

        /**
         * StatsResponse uptimeSeconds.
         * @member {number} uptimeSeconds
         * @memberof embedding.StatsResponse
         * @instance
         */
        StatsResponse.prototype.uptimeSeconds = 0;

        /**
         * Encodes the specified StatsResponse message. Does not implicitly {@link embedding.StatsResponse.verify|verify} messages.
         * @function encode
         * @memberof embedding.StatsResponse
         * @static
         * @param {embedding.IStatsResponse} message StatsResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        StatsResponse.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.modelName != null && Object.hasOwnProperty.call(message, "modelName"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.modelName);
            if (message.device != null && Object.hasOwnProperty.call(message, "device"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.device);
            if (message.isLoaded != null && Object.hasOwnProperty.call(message, "isLoaded"))
                writer.uint32(/* id 3, wireType 0 =*/24).bool(message.isLoaded);
            if (message.embeddingDimension != null && Object.hasOwnProperty.call(message, "embeddingDimension"))
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.embeddingDimension);
            if (message.batchSize != null && Object.hasOwnProperty.call(message, "batchSize"))
                writer.uint32(/* id 5, wireType 0 =*/40).int32(message.batchSize);
            if (message.maxLength != null && Object.hasOwnProperty.call(message, "maxLength"))
                writer.uint32(/* id 6, wireType 0 =*/48).int32(message.maxLength);
            if (message.totalRequests != null && Object.hasOwnProperty.call(message, "totalRequests"))
                writer.uint32(/* id 7, wireType 0 =*/56).int64(message.totalRequests);
            if (message.totalProcessingTimeS != null && Object.hasOwnProperty.call(message, "totalProcessingTimeS"))
                writer.uint32(/* id 8, wireType 5 =*/69).float(message.totalProcessingTimeS);
            if (message.avgProcessingTimeMs != null && Object.hasOwnProperty.call(message, "avgProcessingTimeMs"))
                writer.uint32(/* id 9, wireType 5 =*/77).float(message.avgProcessingTimeMs);
            if (message.gpuAvailable != null && Object.hasOwnProperty.call(message, "gpuAvailable"))
                writer.uint32(/* id 10, wireType 0 =*/80).bool(message.gpuAvailable);
            if (message.gpuMemoryAllocatedGb != null && Object.hasOwnProperty.call(message, "gpuMemoryAllocatedGb"))
                writer.uint32(/* id 11, wireType 5 =*/93).float(message.gpuMemoryAllocatedGb);
            if (message.gpuMemoryReservedGb != null && Object.hasOwnProperty.call(message, "gpuMemoryReservedGb"))
                writer.uint32(/* id 12, wireType 5 =*/101).float(message.gpuMemoryReservedGb);
            if (message.uptimeSeconds != null && Object.hasOwnProperty.call(message, "uptimeSeconds"))
                writer.uint32(/* id 13, wireType 0 =*/104).int32(message.uptimeSeconds);
            return writer;
        };

        /**
         * Encodes the specified StatsResponse message, length delimited. Does not implicitly {@link embedding.StatsResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof embedding.StatsResponse
         * @static
         * @param {embedding.IStatsResponse} message StatsResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        StatsResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a StatsResponse message from the specified reader or buffer.
         * @function decode
         * @memberof embedding.StatsResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {embedding.StatsResponse} StatsResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        StatsResponse.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.embedding.StatsResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.modelName = reader.string();
                        break;
                    }
                case 2: {
                        message.device = reader.string();
                        break;
                    }
                case 3: {
                        message.isLoaded = reader.bool();
                        break;
                    }
                case 4: {
                        message.embeddingDimension = reader.int32();
                        break;
                    }
                case 5: {
                        message.batchSize = reader.int32();
                        break;
                    }
                case 6: {
                        message.maxLength = reader.int32();
                        break;
                    }
                case 7: {
                        message.totalRequests = reader.int64();
                        break;
                    }
                case 8: {
                        message.totalProcessingTimeS = reader.float();
                        break;
                    }
                case 9: {
                        message.avgProcessingTimeMs = reader.float();
                        break;
                    }
                case 10: {
                        message.gpuAvailable = reader.bool();
                        break;
                    }
                case 11: {
                        message.gpuMemoryAllocatedGb = reader.float();
                        break;
                    }
                case 12: {
                        message.gpuMemoryReservedGb = reader.float();
                        break;
                    }
                case 13: {
                        message.uptimeSeconds = reader.int32();
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
         * Decodes a StatsResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof embedding.StatsResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {embedding.StatsResponse} StatsResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        StatsResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for StatsResponse
         * @function getTypeUrl
         * @memberof embedding.StatsResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        StatsResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/embedding.StatsResponse";
        };

        return StatsResponse;
    })();

    return embedding;
})();

export { $root as default };
