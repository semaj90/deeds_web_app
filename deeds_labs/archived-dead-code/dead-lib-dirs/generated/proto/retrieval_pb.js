/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const yorha = $root.yorha = (() => {

    /**
     * Namespace yorha.
     * @exports yorha
     * @namespace
     */
    const yorha = {};

    yorha.retrieval = (function() {

        /**
         * Namespace retrieval.
         * @memberof yorha
         * @namespace
         */
        const retrieval = {};

        retrieval.RetrievalService = (function() {

            /**
             * Constructs a new RetrievalService service.
             * @memberof yorha.retrieval
             * @classdesc Represents a RetrievalService
             * @extends $protobuf.rpc.Service
             * @constructor
             * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
             * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
             * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
             */
            function RetrievalService(rpcImpl, requestDelimited, responseDelimited) {
                $protobuf.rpc.Service.call(this, rpcImpl, requestDelimited, responseDelimited);
            }

            (RetrievalService.prototype = Object.create($protobuf.rpc.Service.prototype)).constructor = RetrievalService;

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#searchEvidence}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef SearchEvidenceCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.EvidenceSearchResponse} [response] EvidenceSearchResponse
             */

            /**
             * Calls SearchEvidence.
             * @function searchEvidence
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IEvidenceSearchRequest} request EvidenceSearchRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.SearchEvidenceCallback} callback Node-style callback called with the error, if any, and EvidenceSearchResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.searchEvidence = function searchEvidence(request, callback) {
                return this.rpcCall(searchEvidence, $root.yorha.retrieval.EvidenceSearchRequest, $root.yorha.retrieval.EvidenceSearchResponse, request, callback);
            }, "name", { value: "SearchEvidence" });

            /**
             * Calls SearchEvidence.
             * @function searchEvidence
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IEvidenceSearchRequest} request EvidenceSearchRequest message or plain object
             * @returns {Promise<yorha.retrieval.EvidenceSearchResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#streamEvidence}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef StreamEvidenceCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.EvidenceBundleEvent} [response] EvidenceBundleEvent
             */

            /**
             * Calls StreamEvidence.
             * @function streamEvidence
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IEvidenceSearchRequest} request EvidenceSearchRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.StreamEvidenceCallback} callback Node-style callback called with the error, if any, and EvidenceBundleEvent
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.streamEvidence = function streamEvidence(request, callback) {
                return this.rpcCall(streamEvidence, $root.yorha.retrieval.EvidenceSearchRequest, $root.yorha.retrieval.EvidenceBundleEvent, request, callback);
            }, "name", { value: "StreamEvidence" });

            /**
             * Calls StreamEvidence.
             * @function streamEvidence
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IEvidenceSearchRequest} request EvidenceSearchRequest message or plain object
             * @returns {Promise<yorha.retrieval.EvidenceBundleEvent>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#searchCodebase}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef SearchCodebaseCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.CodebaseSearchResponse} [response] CodebaseSearchResponse
             */

            /**
             * Calls SearchCodebase.
             * @function searchCodebase
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.ICodebaseSearchRequest} request CodebaseSearchRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.SearchCodebaseCallback} callback Node-style callback called with the error, if any, and CodebaseSearchResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.searchCodebase = function searchCodebase(request, callback) {
                return this.rpcCall(searchCodebase, $root.yorha.retrieval.CodebaseSearchRequest, $root.yorha.retrieval.CodebaseSearchResponse, request, callback);
            }, "name", { value: "SearchCodebase" });

            /**
             * Calls SearchCodebase.
             * @function searchCodebase
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.ICodebaseSearchRequest} request CodebaseSearchRequest message or plain object
             * @returns {Promise<yorha.retrieval.CodebaseSearchResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#streamCodebase}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef StreamCodebaseCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.CodebaseChunkEvent} [response] CodebaseChunkEvent
             */

            /**
             * Calls StreamCodebase.
             * @function streamCodebase
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.ICodebaseSearchRequest} request CodebaseSearchRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.StreamCodebaseCallback} callback Node-style callback called with the error, if any, and CodebaseChunkEvent
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.streamCodebase = function streamCodebase(request, callback) {
                return this.rpcCall(streamCodebase, $root.yorha.retrieval.CodebaseSearchRequest, $root.yorha.retrieval.CodebaseChunkEvent, request, callback);
            }, "name", { value: "StreamCodebase" });

            /**
             * Calls StreamCodebase.
             * @function streamCodebase
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.ICodebaseSearchRequest} request CodebaseSearchRequest message or plain object
             * @returns {Promise<yorha.retrieval.CodebaseChunkEvent>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#health}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef HealthCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.HealthResponse} [response] HealthResponse
             */

            /**
             * Calls Health.
             * @function health
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IHealthRequest} request HealthRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.HealthCallback} callback Node-style callback called with the error, if any, and HealthResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.health = function health(request, callback) {
                return this.rpcCall(health, $root.yorha.retrieval.HealthRequest, $root.yorha.retrieval.HealthResponse, request, callback);
            }, "name", { value: "Health" });

            /**
             * Calls Health.
             * @function health
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IHealthRequest} request HealthRequest message or plain object
             * @returns {Promise<yorha.retrieval.HealthResponse>} Promise
             * @variation 2
             */

            return RetrievalService;
        })();

        retrieval.EvidenceSearchRequest = (function() {

            /**
             * Properties of an EvidenceSearchRequest.
             * @memberof yorha.retrieval
             * @interface IEvidenceSearchRequest
             * @property {string|null} [query] EvidenceSearchRequest query
             * @property {string|null} [caseId] EvidenceSearchRequest caseId
             * @property {number|null} [limit] EvidenceSearchRequest limit
             * @property {string|null} [jurisdiction] EvidenceSearchRequest jurisdiction
             * @property {yorha.retrieval.IGraphHopPolicy|null} [hop] EvidenceSearchRequest hop
             * @property {yorha.retrieval.IPrefilterPolicy|null} [prefilter] EvidenceSearchRequest prefilter
             * @property {yorha.retrieval.IRankPolicy|null} [rank] EvidenceSearchRequest rank
             * @property {Array.<number>|null} [queryEmbedding] EvidenceSearchRequest queryEmbedding
             * @property {boolean|null} [includeDebug] EvidenceSearchRequest includeDebug
             */

            /**
             * Constructs a new EvidenceSearchRequest.
             * @memberof yorha.retrieval
             * @classdesc Represents an EvidenceSearchRequest.
             * @implements IEvidenceSearchRequest
             * @constructor
             * @param {yorha.retrieval.IEvidenceSearchRequest=} [properties] Properties to set
             */
            function EvidenceSearchRequest(properties) {
                this.queryEmbedding = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EvidenceSearchRequest query.
             * @member {string} query
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.query = "";

            /**
             * EvidenceSearchRequest caseId.
             * @member {string} caseId
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.caseId = "";

            /**
             * EvidenceSearchRequest limit.
             * @member {number} limit
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.limit = 0;

            /**
             * EvidenceSearchRequest jurisdiction.
             * @member {string} jurisdiction
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.jurisdiction = "";

            /**
             * EvidenceSearchRequest hop.
             * @member {yorha.retrieval.IGraphHopPolicy|null|undefined} hop
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.hop = null;

            /**
             * EvidenceSearchRequest prefilter.
             * @member {yorha.retrieval.IPrefilterPolicy|null|undefined} prefilter
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.prefilter = null;

            /**
             * EvidenceSearchRequest rank.
             * @member {yorha.retrieval.IRankPolicy|null|undefined} rank
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.rank = null;

            /**
             * EvidenceSearchRequest queryEmbedding.
             * @member {Array.<number>} queryEmbedding
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.queryEmbedding = $util.emptyArray;

            /**
             * EvidenceSearchRequest includeDebug.
             * @member {boolean} includeDebug
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.includeDebug = false;

            /**
             * Encodes the specified EvidenceSearchRequest message. Does not implicitly {@link yorha.retrieval.EvidenceSearchRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @static
             * @param {yorha.retrieval.IEvidenceSearchRequest} message EvidenceSearchRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EvidenceSearchRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.query != null && Object.hasOwnProperty.call(message, "query"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.query);
                if (message.caseId != null && Object.hasOwnProperty.call(message, "caseId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.caseId);
                if (message.limit != null && Object.hasOwnProperty.call(message, "limit"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.limit);
                if (message.jurisdiction != null && Object.hasOwnProperty.call(message, "jurisdiction"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.jurisdiction);
                if (message.hop != null && Object.hasOwnProperty.call(message, "hop"))
                    $root.yorha.retrieval.GraphHopPolicy.encode(message.hop, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
                if (message.prefilter != null && Object.hasOwnProperty.call(message, "prefilter"))
                    $root.yorha.retrieval.PrefilterPolicy.encode(message.prefilter, writer.uint32(/* id 6, wireType 2 =*/50).fork()).ldelim();
                if (message.rank != null && Object.hasOwnProperty.call(message, "rank"))
                    $root.yorha.retrieval.RankPolicy.encode(message.rank, writer.uint32(/* id 7, wireType 2 =*/58).fork()).ldelim();
                if (message.queryEmbedding != null && message.queryEmbedding.length) {
                    writer.uint32(/* id 8, wireType 2 =*/66).fork();
                    for (let i = 0; i < message.queryEmbedding.length; ++i)
                        writer.float(message.queryEmbedding[i]);
                    writer.ldelim();
                }
                if (message.includeDebug != null && Object.hasOwnProperty.call(message, "includeDebug"))
                    writer.uint32(/* id 9, wireType 0 =*/72).bool(message.includeDebug);
                return writer;
            };

            /**
             * Encodes the specified EvidenceSearchRequest message, length delimited. Does not implicitly {@link yorha.retrieval.EvidenceSearchRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @static
             * @param {yorha.retrieval.IEvidenceSearchRequest} message EvidenceSearchRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EvidenceSearchRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an EvidenceSearchRequest message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.EvidenceSearchRequest} EvidenceSearchRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EvidenceSearchRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.EvidenceSearchRequest();
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
                            message.caseId = reader.string();
                            break;
                        }
                    case 3: {
                            message.limit = reader.int32();
                            break;
                        }
                    case 4: {
                            message.jurisdiction = reader.string();
                            break;
                        }
                    case 5: {
                            message.hop = $root.yorha.retrieval.GraphHopPolicy.decode(reader, reader.uint32());
                            break;
                        }
                    case 6: {
                            message.prefilter = $root.yorha.retrieval.PrefilterPolicy.decode(reader, reader.uint32());
                            break;
                        }
                    case 7: {
                            message.rank = $root.yorha.retrieval.RankPolicy.decode(reader, reader.uint32());
                            break;
                        }
                    case 8: {
                            if (!(message.queryEmbedding && message.queryEmbedding.length))
                                message.queryEmbedding = [];
                            if ((tag & 7) === 2) {
                                let end2 = reader.uint32() + reader.pos;
                                while (reader.pos < end2)
                                    message.queryEmbedding.push(reader.float());
                            } else
                                message.queryEmbedding.push(reader.float());
                            break;
                        }
                    case 9: {
                            message.includeDebug = reader.bool();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an EvidenceSearchRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.EvidenceSearchRequest} EvidenceSearchRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EvidenceSearchRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for EvidenceSearchRequest
             * @function getTypeUrl
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            EvidenceSearchRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.EvidenceSearchRequest";
            };

            return EvidenceSearchRequest;
        })();

        retrieval.EvidenceSearchResponse = (function() {

            /**
             * Properties of an EvidenceSearchResponse.
             * @memberof yorha.retrieval
             * @interface IEvidenceSearchResponse
             * @property {Array.<yorha.retrieval.ISearchResult>|null} [results] EvidenceSearchResponse results
             * @property {Array.<yorha.retrieval.IContextBundle>|null} [bundles] EvidenceSearchResponse bundles
             * @property {yorha.retrieval.ISearchTiming|null} [timing] EvidenceSearchResponse timing
             * @property {string|null} [cacheSource] EvidenceSearchResponse cacheSource
             * @property {string|null} [debugJson] EvidenceSearchResponse debugJson
             */

            /**
             * Constructs a new EvidenceSearchResponse.
             * @memberof yorha.retrieval
             * @classdesc Represents an EvidenceSearchResponse.
             * @implements IEvidenceSearchResponse
             * @constructor
             * @param {yorha.retrieval.IEvidenceSearchResponse=} [properties] Properties to set
             */
            function EvidenceSearchResponse(properties) {
                this.results = [];
                this.bundles = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EvidenceSearchResponse results.
             * @member {Array.<yorha.retrieval.ISearchResult>} results
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @instance
             */
            EvidenceSearchResponse.prototype.results = $util.emptyArray;

            /**
             * EvidenceSearchResponse bundles.
             * @member {Array.<yorha.retrieval.IContextBundle>} bundles
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @instance
             */
            EvidenceSearchResponse.prototype.bundles = $util.emptyArray;

            /**
             * EvidenceSearchResponse timing.
             * @member {yorha.retrieval.ISearchTiming|null|undefined} timing
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @instance
             */
            EvidenceSearchResponse.prototype.timing = null;

            /**
             * EvidenceSearchResponse cacheSource.
             * @member {string} cacheSource
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @instance
             */
            EvidenceSearchResponse.prototype.cacheSource = "";

            /**
             * EvidenceSearchResponse debugJson.
             * @member {string} debugJson
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @instance
             */
            EvidenceSearchResponse.prototype.debugJson = "";

            /**
             * Encodes the specified EvidenceSearchResponse message. Does not implicitly {@link yorha.retrieval.EvidenceSearchResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @static
             * @param {yorha.retrieval.IEvidenceSearchResponse} message EvidenceSearchResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EvidenceSearchResponse.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.results != null && message.results.length)
                    for (let i = 0; i < message.results.length; ++i)
                        $root.yorha.retrieval.SearchResult.encode(message.results[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                if (message.bundles != null && message.bundles.length)
                    for (let i = 0; i < message.bundles.length; ++i)
                        $root.yorha.retrieval.ContextBundle.encode(message.bundles[i], writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                if (message.timing != null && Object.hasOwnProperty.call(message, "timing"))
                    $root.yorha.retrieval.SearchTiming.encode(message.timing, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
                if (message.cacheSource != null && Object.hasOwnProperty.call(message, "cacheSource"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.cacheSource);
                if (message.debugJson != null && Object.hasOwnProperty.call(message, "debugJson"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.debugJson);
                return writer;
            };

            /**
             * Encodes the specified EvidenceSearchResponse message, length delimited. Does not implicitly {@link yorha.retrieval.EvidenceSearchResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @static
             * @param {yorha.retrieval.IEvidenceSearchResponse} message EvidenceSearchResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EvidenceSearchResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an EvidenceSearchResponse message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.EvidenceSearchResponse} EvidenceSearchResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EvidenceSearchResponse.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.EvidenceSearchResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.results && message.results.length))
                                message.results = [];
                            message.results.push($root.yorha.retrieval.SearchResult.decode(reader, reader.uint32()));
                            break;
                        }
                    case 2: {
                            if (!(message.bundles && message.bundles.length))
                                message.bundles = [];
                            message.bundles.push($root.yorha.retrieval.ContextBundle.decode(reader, reader.uint32()));
                            break;
                        }
                    case 3: {
                            message.timing = $root.yorha.retrieval.SearchTiming.decode(reader, reader.uint32());
                            break;
                        }
                    case 4: {
                            message.cacheSource = reader.string();
                            break;
                        }
                    case 5: {
                            message.debugJson = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an EvidenceSearchResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.EvidenceSearchResponse} EvidenceSearchResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EvidenceSearchResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for EvidenceSearchResponse
             * @function getTypeUrl
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            EvidenceSearchResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.EvidenceSearchResponse";
            };

            return EvidenceSearchResponse;
        })();

        retrieval.EvidenceBundleEvent = (function() {

            /**
             * Properties of an EvidenceBundleEvent.
             * @memberof yorha.retrieval
             * @interface IEvidenceBundleEvent
             * @property {yorha.retrieval.IContextBundle|null} [bundle] EvidenceBundleEvent bundle
             * @property {yorha.retrieval.IRetrievalProgress|null} [progress] EvidenceBundleEvent progress
             * @property {yorha.retrieval.IRetrievalError|null} [error] EvidenceBundleEvent error
             */

            /**
             * Constructs a new EvidenceBundleEvent.
             * @memberof yorha.retrieval
             * @classdesc Represents an EvidenceBundleEvent.
             * @implements IEvidenceBundleEvent
             * @constructor
             * @param {yorha.retrieval.IEvidenceBundleEvent=} [properties] Properties to set
             */
            function EvidenceBundleEvent(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EvidenceBundleEvent bundle.
             * @member {yorha.retrieval.IContextBundle|null|undefined} bundle
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @instance
             */
            EvidenceBundleEvent.prototype.bundle = null;

            /**
             * EvidenceBundleEvent progress.
             * @member {yorha.retrieval.IRetrievalProgress|null|undefined} progress
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @instance
             */
            EvidenceBundleEvent.prototype.progress = null;

            /**
             * EvidenceBundleEvent error.
             * @member {yorha.retrieval.IRetrievalError|null|undefined} error
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @instance
             */
            EvidenceBundleEvent.prototype.error = null;

            // OneOf field names bound to virtual getters and setters
            let $oneOfFields;

            /**
             * EvidenceBundleEvent event.
             * @member {"bundle"|"progress"|"error"|undefined} event
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @instance
             */
            Object.defineProperty(EvidenceBundleEvent.prototype, "event", {
                get: $util.oneOfGetter($oneOfFields = ["bundle", "progress", "error"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Encodes the specified EvidenceBundleEvent message. Does not implicitly {@link yorha.retrieval.EvidenceBundleEvent.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @static
             * @param {yorha.retrieval.IEvidenceBundleEvent} message EvidenceBundleEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EvidenceBundleEvent.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.bundle != null && Object.hasOwnProperty.call(message, "bundle"))
                    $root.yorha.retrieval.ContextBundle.encode(message.bundle, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                if (message.progress != null && Object.hasOwnProperty.call(message, "progress"))
                    $root.yorha.retrieval.RetrievalProgress.encode(message.progress, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                if (message.error != null && Object.hasOwnProperty.call(message, "error"))
                    $root.yorha.retrieval.RetrievalError.encode(message.error, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified EvidenceBundleEvent message, length delimited. Does not implicitly {@link yorha.retrieval.EvidenceBundleEvent.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @static
             * @param {yorha.retrieval.IEvidenceBundleEvent} message EvidenceBundleEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EvidenceBundleEvent.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an EvidenceBundleEvent message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.EvidenceBundleEvent} EvidenceBundleEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EvidenceBundleEvent.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.EvidenceBundleEvent();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.bundle = $root.yorha.retrieval.ContextBundle.decode(reader, reader.uint32());
                            break;
                        }
                    case 2: {
                            message.progress = $root.yorha.retrieval.RetrievalProgress.decode(reader, reader.uint32());
                            break;
                        }
                    case 3: {
                            message.error = $root.yorha.retrieval.RetrievalError.decode(reader, reader.uint32());
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an EvidenceBundleEvent message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.EvidenceBundleEvent} EvidenceBundleEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EvidenceBundleEvent.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for EvidenceBundleEvent
             * @function getTypeUrl
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            EvidenceBundleEvent.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.EvidenceBundleEvent";
            };

            return EvidenceBundleEvent;
        })();

        retrieval.SearchResult = (function() {

            /**
             * Properties of a SearchResult.
             * @memberof yorha.retrieval
             * @interface ISearchResult
             * @property {string|null} [evidenceId] SearchResult evidenceId
             * @property {number|null} [chunkIndex] SearchResult chunkIndex
             * @property {string|null} [content] SearchResult content
             * @property {number|null} [score] SearchResult score
             * @property {yorha.retrieval.IChunkMetadata|null} [metadata] SearchResult metadata
             * @property {yorha.retrieval.IRerankExplain|null} [rerank] SearchResult rerank
             */

            /**
             * Constructs a new SearchResult.
             * @memberof yorha.retrieval
             * @classdesc Represents a SearchResult.
             * @implements ISearchResult
             * @constructor
             * @param {yorha.retrieval.ISearchResult=} [properties] Properties to set
             */
            function SearchResult(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SearchResult evidenceId.
             * @member {string} evidenceId
             * @memberof yorha.retrieval.SearchResult
             * @instance
             */
            SearchResult.prototype.evidenceId = "";

            /**
             * SearchResult chunkIndex.
             * @member {number} chunkIndex
             * @memberof yorha.retrieval.SearchResult
             * @instance
             */
            SearchResult.prototype.chunkIndex = 0;

            /**
             * SearchResult content.
             * @member {string} content
             * @memberof yorha.retrieval.SearchResult
             * @instance
             */
            SearchResult.prototype.content = "";

            /**
             * SearchResult score.
             * @member {number} score
             * @memberof yorha.retrieval.SearchResult
             * @instance
             */
            SearchResult.prototype.score = 0;

            /**
             * SearchResult metadata.
             * @member {yorha.retrieval.IChunkMetadata|null|undefined} metadata
             * @memberof yorha.retrieval.SearchResult
             * @instance
             */
            SearchResult.prototype.metadata = null;

            /**
             * SearchResult rerank.
             * @member {yorha.retrieval.IRerankExplain|null|undefined} rerank
             * @memberof yorha.retrieval.SearchResult
             * @instance
             */
            SearchResult.prototype.rerank = null;

            /**
             * Encodes the specified SearchResult message. Does not implicitly {@link yorha.retrieval.SearchResult.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.SearchResult
             * @static
             * @param {yorha.retrieval.ISearchResult} message SearchResult message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchResult.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.evidenceId != null && Object.hasOwnProperty.call(message, "evidenceId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.evidenceId);
                if (message.chunkIndex != null && Object.hasOwnProperty.call(message, "chunkIndex"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.chunkIndex);
                if (message.content != null && Object.hasOwnProperty.call(message, "content"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.content);
                if (message.score != null && Object.hasOwnProperty.call(message, "score"))
                    writer.uint32(/* id 4, wireType 5 =*/37).float(message.score);
                if (message.metadata != null && Object.hasOwnProperty.call(message, "metadata"))
                    $root.yorha.retrieval.ChunkMetadata.encode(message.metadata, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
                if (message.rerank != null && Object.hasOwnProperty.call(message, "rerank"))
                    $root.yorha.retrieval.RerankExplain.encode(message.rerank, writer.uint32(/* id 6, wireType 2 =*/50).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified SearchResult message, length delimited. Does not implicitly {@link yorha.retrieval.SearchResult.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.SearchResult
             * @static
             * @param {yorha.retrieval.ISearchResult} message SearchResult message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchResult.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SearchResult message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.SearchResult
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.SearchResult} SearchResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchResult.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.SearchResult();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.evidenceId = reader.string();
                            break;
                        }
                    case 2: {
                            message.chunkIndex = reader.int32();
                            break;
                        }
                    case 3: {
                            message.content = reader.string();
                            break;
                        }
                    case 4: {
                            message.score = reader.float();
                            break;
                        }
                    case 5: {
                            message.metadata = $root.yorha.retrieval.ChunkMetadata.decode(reader, reader.uint32());
                            break;
                        }
                    case 6: {
                            message.rerank = $root.yorha.retrieval.RerankExplain.decode(reader, reader.uint32());
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a SearchResult message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.SearchResult
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.SearchResult} SearchResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchResult.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for SearchResult
             * @function getTypeUrl
             * @memberof yorha.retrieval.SearchResult
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SearchResult.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.SearchResult";
            };

            return SearchResult;
        })();

        retrieval.ChunkMetadata = (function() {

            /**
             * Properties of a ChunkMetadata.
             * @memberof yorha.retrieval
             * @interface IChunkMetadata
             * @property {Array.<string>|null} [sectionPath] ChunkMetadata sectionPath
             * @property {string|null} [heading] ChunkMetadata heading
             * @property {Array.<string>|null} [citations] ChunkMetadata citations
             * @property {string|null} [fileName] ChunkMetadata fileName
             * @property {number|null} [tokenCount] ChunkMetadata tokenCount
             * @property {string|null} [extractionMethod] ChunkMetadata extractionMethod
             * @property {string|null} [jurisdiction] ChunkMetadata jurisdiction
             */

            /**
             * Constructs a new ChunkMetadata.
             * @memberof yorha.retrieval
             * @classdesc Represents a ChunkMetadata.
             * @implements IChunkMetadata
             * @constructor
             * @param {yorha.retrieval.IChunkMetadata=} [properties] Properties to set
             */
            function ChunkMetadata(properties) {
                this.sectionPath = [];
                this.citations = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ChunkMetadata sectionPath.
             * @member {Array.<string>} sectionPath
             * @memberof yorha.retrieval.ChunkMetadata
             * @instance
             */
            ChunkMetadata.prototype.sectionPath = $util.emptyArray;

            /**
             * ChunkMetadata heading.
             * @member {string} heading
             * @memberof yorha.retrieval.ChunkMetadata
             * @instance
             */
            ChunkMetadata.prototype.heading = "";

            /**
             * ChunkMetadata citations.
             * @member {Array.<string>} citations
             * @memberof yorha.retrieval.ChunkMetadata
             * @instance
             */
            ChunkMetadata.prototype.citations = $util.emptyArray;

            /**
             * ChunkMetadata fileName.
             * @member {string} fileName
             * @memberof yorha.retrieval.ChunkMetadata
             * @instance
             */
            ChunkMetadata.prototype.fileName = "";

            /**
             * ChunkMetadata tokenCount.
             * @member {number} tokenCount
             * @memberof yorha.retrieval.ChunkMetadata
             * @instance
             */
            ChunkMetadata.prototype.tokenCount = 0;

            /**
             * ChunkMetadata extractionMethod.
             * @member {string} extractionMethod
             * @memberof yorha.retrieval.ChunkMetadata
             * @instance
             */
            ChunkMetadata.prototype.extractionMethod = "";

            /**
             * ChunkMetadata jurisdiction.
             * @member {string} jurisdiction
             * @memberof yorha.retrieval.ChunkMetadata
             * @instance
             */
            ChunkMetadata.prototype.jurisdiction = "";

            /**
             * Encodes the specified ChunkMetadata message. Does not implicitly {@link yorha.retrieval.ChunkMetadata.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.ChunkMetadata
             * @static
             * @param {yorha.retrieval.IChunkMetadata} message ChunkMetadata message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ChunkMetadata.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.sectionPath != null && message.sectionPath.length)
                    for (let i = 0; i < message.sectionPath.length; ++i)
                        writer.uint32(/* id 1, wireType 2 =*/10).string(message.sectionPath[i]);
                if (message.heading != null && Object.hasOwnProperty.call(message, "heading"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.heading);
                if (message.citations != null && message.citations.length)
                    for (let i = 0; i < message.citations.length; ++i)
                        writer.uint32(/* id 3, wireType 2 =*/26).string(message.citations[i]);
                if (message.fileName != null && Object.hasOwnProperty.call(message, "fileName"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.fileName);
                if (message.tokenCount != null && Object.hasOwnProperty.call(message, "tokenCount"))
                    writer.uint32(/* id 5, wireType 0 =*/40).int32(message.tokenCount);
                if (message.extractionMethod != null && Object.hasOwnProperty.call(message, "extractionMethod"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.extractionMethod);
                if (message.jurisdiction != null && Object.hasOwnProperty.call(message, "jurisdiction"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.jurisdiction);
                return writer;
            };

            /**
             * Encodes the specified ChunkMetadata message, length delimited. Does not implicitly {@link yorha.retrieval.ChunkMetadata.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.ChunkMetadata
             * @static
             * @param {yorha.retrieval.IChunkMetadata} message ChunkMetadata message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ChunkMetadata.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ChunkMetadata message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.ChunkMetadata
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.ChunkMetadata} ChunkMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ChunkMetadata.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.ChunkMetadata();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.sectionPath && message.sectionPath.length))
                                message.sectionPath = [];
                            message.sectionPath.push(reader.string());
                            break;
                        }
                    case 2: {
                            message.heading = reader.string();
                            break;
                        }
                    case 3: {
                            if (!(message.citations && message.citations.length))
                                message.citations = [];
                            message.citations.push(reader.string());
                            break;
                        }
                    case 4: {
                            message.fileName = reader.string();
                            break;
                        }
                    case 5: {
                            message.tokenCount = reader.int32();
                            break;
                        }
                    case 6: {
                            message.extractionMethod = reader.string();
                            break;
                        }
                    case 7: {
                            message.jurisdiction = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a ChunkMetadata message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.ChunkMetadata
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.ChunkMetadata} ChunkMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ChunkMetadata.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for ChunkMetadata
             * @function getTypeUrl
             * @memberof yorha.retrieval.ChunkMetadata
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ChunkMetadata.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.ChunkMetadata";
            };

            return ChunkMetadata;
        })();

        retrieval.RerankExplain = (function() {

            /**
             * Properties of a RerankExplain.
             * @memberof yorha.retrieval
             * @interface IRerankExplain
             * @property {number|null} [cosine] RerankExplain cosine
             * @property {number|null} [sharedCitations] RerankExplain sharedCitations
             * @property {number|null} [jurisdictionMatch] RerankExplain jurisdictionMatch
             * @property {number|null} [sectionProximity] RerankExplain sectionProximity
             * @property {number|null} [finalScore] RerankExplain finalScore
             */

            /**
             * Constructs a new RerankExplain.
             * @memberof yorha.retrieval
             * @classdesc Represents a RerankExplain.
             * @implements IRerankExplain
             * @constructor
             * @param {yorha.retrieval.IRerankExplain=} [properties] Properties to set
             */
            function RerankExplain(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * RerankExplain cosine.
             * @member {number} cosine
             * @memberof yorha.retrieval.RerankExplain
             * @instance
             */
            RerankExplain.prototype.cosine = 0;

            /**
             * RerankExplain sharedCitations.
             * @member {number} sharedCitations
             * @memberof yorha.retrieval.RerankExplain
             * @instance
             */
            RerankExplain.prototype.sharedCitations = 0;

            /**
             * RerankExplain jurisdictionMatch.
             * @member {number} jurisdictionMatch
             * @memberof yorha.retrieval.RerankExplain
             * @instance
             */
            RerankExplain.prototype.jurisdictionMatch = 0;

            /**
             * RerankExplain sectionProximity.
             * @member {number} sectionProximity
             * @memberof yorha.retrieval.RerankExplain
             * @instance
             */
            RerankExplain.prototype.sectionProximity = 0;

            /**
             * RerankExplain finalScore.
             * @member {number} finalScore
             * @memberof yorha.retrieval.RerankExplain
             * @instance
             */
            RerankExplain.prototype.finalScore = 0;

            /**
             * Encodes the specified RerankExplain message. Does not implicitly {@link yorha.retrieval.RerankExplain.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RerankExplain
             * @static
             * @param {yorha.retrieval.IRerankExplain} message RerankExplain message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RerankExplain.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.cosine != null && Object.hasOwnProperty.call(message, "cosine"))
                    writer.uint32(/* id 1, wireType 5 =*/13).float(message.cosine);
                if (message.sharedCitations != null && Object.hasOwnProperty.call(message, "sharedCitations"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.sharedCitations);
                if (message.jurisdictionMatch != null && Object.hasOwnProperty.call(message, "jurisdictionMatch"))
                    writer.uint32(/* id 3, wireType 5 =*/29).float(message.jurisdictionMatch);
                if (message.sectionProximity != null && Object.hasOwnProperty.call(message, "sectionProximity"))
                    writer.uint32(/* id 4, wireType 5 =*/37).float(message.sectionProximity);
                if (message.finalScore != null && Object.hasOwnProperty.call(message, "finalScore"))
                    writer.uint32(/* id 5, wireType 5 =*/45).float(message.finalScore);
                return writer;
            };

            /**
             * Encodes the specified RerankExplain message, length delimited. Does not implicitly {@link yorha.retrieval.RerankExplain.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.RerankExplain
             * @static
             * @param {yorha.retrieval.IRerankExplain} message RerankExplain message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RerankExplain.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a RerankExplain message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.RerankExplain
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.RerankExplain} RerankExplain
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RerankExplain.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.RerankExplain();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.cosine = reader.float();
                            break;
                        }
                    case 2: {
                            message.sharedCitations = reader.float();
                            break;
                        }
                    case 3: {
                            message.jurisdictionMatch = reader.float();
                            break;
                        }
                    case 4: {
                            message.sectionProximity = reader.float();
                            break;
                        }
                    case 5: {
                            message.finalScore = reader.float();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a RerankExplain message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.RerankExplain
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.RerankExplain} RerankExplain
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RerankExplain.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for RerankExplain
             * @function getTypeUrl
             * @memberof yorha.retrieval.RerankExplain
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            RerankExplain.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.RerankExplain";
            };

            return RerankExplain;
        })();

        retrieval.ContextBundle = (function() {

            /**
             * Properties of a ContextBundle.
             * @memberof yorha.retrieval
             * @interface IContextBundle
             * @property {yorha.retrieval.ISearchResult|null} [hit] ContextBundle hit
             * @property {Array.<yorha.retrieval.ISearchResult>|null} [siblings] ContextBundle siblings
             * @property {Array.<string>|null} [sectionPath] ContextBundle sectionPath
             * @property {string|null} [heading] ContextBundle heading
             * @property {Array.<string>|null} [citations] ContextBundle citations
             * @property {Array.<yorha.retrieval.IGraphNeighbor>|null} [graphNeighbors] ContextBundle graphNeighbors
             * @property {yorha.retrieval.IDocumentContext|null} [documentContext] ContextBundle documentContext
             */

            /**
             * Constructs a new ContextBundle.
             * @memberof yorha.retrieval
             * @classdesc Represents a ContextBundle.
             * @implements IContextBundle
             * @constructor
             * @param {yorha.retrieval.IContextBundle=} [properties] Properties to set
             */
            function ContextBundle(properties) {
                this.siblings = [];
                this.sectionPath = [];
                this.citations = [];
                this.graphNeighbors = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ContextBundle hit.
             * @member {yorha.retrieval.ISearchResult|null|undefined} hit
             * @memberof yorha.retrieval.ContextBundle
             * @instance
             */
            ContextBundle.prototype.hit = null;

            /**
             * ContextBundle siblings.
             * @member {Array.<yorha.retrieval.ISearchResult>} siblings
             * @memberof yorha.retrieval.ContextBundle
             * @instance
             */
            ContextBundle.prototype.siblings = $util.emptyArray;

            /**
             * ContextBundle sectionPath.
             * @member {Array.<string>} sectionPath
             * @memberof yorha.retrieval.ContextBundle
             * @instance
             */
            ContextBundle.prototype.sectionPath = $util.emptyArray;

            /**
             * ContextBundle heading.
             * @member {string} heading
             * @memberof yorha.retrieval.ContextBundle
             * @instance
             */
            ContextBundle.prototype.heading = "";

            /**
             * ContextBundle citations.
             * @member {Array.<string>} citations
             * @memberof yorha.retrieval.ContextBundle
             * @instance
             */
            ContextBundle.prototype.citations = $util.emptyArray;

            /**
             * ContextBundle graphNeighbors.
             * @member {Array.<yorha.retrieval.IGraphNeighbor>} graphNeighbors
             * @memberof yorha.retrieval.ContextBundle
             * @instance
             */
            ContextBundle.prototype.graphNeighbors = $util.emptyArray;

            /**
             * ContextBundle documentContext.
             * @member {yorha.retrieval.IDocumentContext|null|undefined} documentContext
             * @memberof yorha.retrieval.ContextBundle
             * @instance
             */
            ContextBundle.prototype.documentContext = null;

            /**
             * Encodes the specified ContextBundle message. Does not implicitly {@link yorha.retrieval.ContextBundle.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.ContextBundle
             * @static
             * @param {yorha.retrieval.IContextBundle} message ContextBundle message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ContextBundle.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.hit != null && Object.hasOwnProperty.call(message, "hit"))
                    $root.yorha.retrieval.SearchResult.encode(message.hit, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                if (message.siblings != null && message.siblings.length)
                    for (let i = 0; i < message.siblings.length; ++i)
                        $root.yorha.retrieval.SearchResult.encode(message.siblings[i], writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                if (message.sectionPath != null && message.sectionPath.length)
                    for (let i = 0; i < message.sectionPath.length; ++i)
                        writer.uint32(/* id 3, wireType 2 =*/26).string(message.sectionPath[i]);
                if (message.heading != null && Object.hasOwnProperty.call(message, "heading"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.heading);
                if (message.citations != null && message.citations.length)
                    for (let i = 0; i < message.citations.length; ++i)
                        writer.uint32(/* id 5, wireType 2 =*/42).string(message.citations[i]);
                if (message.graphNeighbors != null && message.graphNeighbors.length)
                    for (let i = 0; i < message.graphNeighbors.length; ++i)
                        $root.yorha.retrieval.GraphNeighbor.encode(message.graphNeighbors[i], writer.uint32(/* id 6, wireType 2 =*/50).fork()).ldelim();
                if (message.documentContext != null && Object.hasOwnProperty.call(message, "documentContext"))
                    $root.yorha.retrieval.DocumentContext.encode(message.documentContext, writer.uint32(/* id 7, wireType 2 =*/58).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified ContextBundle message, length delimited. Does not implicitly {@link yorha.retrieval.ContextBundle.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.ContextBundle
             * @static
             * @param {yorha.retrieval.IContextBundle} message ContextBundle message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ContextBundle.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ContextBundle message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.ContextBundle
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.ContextBundle} ContextBundle
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ContextBundle.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.ContextBundle();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.hit = $root.yorha.retrieval.SearchResult.decode(reader, reader.uint32());
                            break;
                        }
                    case 2: {
                            if (!(message.siblings && message.siblings.length))
                                message.siblings = [];
                            message.siblings.push($root.yorha.retrieval.SearchResult.decode(reader, reader.uint32()));
                            break;
                        }
                    case 3: {
                            if (!(message.sectionPath && message.sectionPath.length))
                                message.sectionPath = [];
                            message.sectionPath.push(reader.string());
                            break;
                        }
                    case 4: {
                            message.heading = reader.string();
                            break;
                        }
                    case 5: {
                            if (!(message.citations && message.citations.length))
                                message.citations = [];
                            message.citations.push(reader.string());
                            break;
                        }
                    case 6: {
                            if (!(message.graphNeighbors && message.graphNeighbors.length))
                                message.graphNeighbors = [];
                            message.graphNeighbors.push($root.yorha.retrieval.GraphNeighbor.decode(reader, reader.uint32()));
                            break;
                        }
                    case 7: {
                            message.documentContext = $root.yorha.retrieval.DocumentContext.decode(reader, reader.uint32());
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a ContextBundle message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.ContextBundle
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.ContextBundle} ContextBundle
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ContextBundle.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for ContextBundle
             * @function getTypeUrl
             * @memberof yorha.retrieval.ContextBundle
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ContextBundle.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.ContextBundle";
            };

            return ContextBundle;
        })();

        retrieval.GraphNeighbor = (function() {

            /**
             * Properties of a GraphNeighbor.
             * @memberof yorha.retrieval
             * @interface IGraphNeighbor
             * @property {string|null} [nodeId] GraphNeighbor nodeId
             * @property {string|null} [title] GraphNeighbor title
             * @property {string|null} [evidenceType] GraphNeighbor evidenceType
             * @property {string|null} [connectionType] GraphNeighbor connectionType
             * @property {number|null} [strength] GraphNeighbor strength
             * @property {number|null} [confidence] GraphNeighbor confidence
             * @property {string|null} [aiReasoning] GraphNeighbor aiReasoning
             */

            /**
             * Constructs a new GraphNeighbor.
             * @memberof yorha.retrieval
             * @classdesc Represents a GraphNeighbor.
             * @implements IGraphNeighbor
             * @constructor
             * @param {yorha.retrieval.IGraphNeighbor=} [properties] Properties to set
             */
            function GraphNeighbor(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * GraphNeighbor nodeId.
             * @member {string} nodeId
             * @memberof yorha.retrieval.GraphNeighbor
             * @instance
             */
            GraphNeighbor.prototype.nodeId = "";

            /**
             * GraphNeighbor title.
             * @member {string} title
             * @memberof yorha.retrieval.GraphNeighbor
             * @instance
             */
            GraphNeighbor.prototype.title = "";

            /**
             * GraphNeighbor evidenceType.
             * @member {string} evidenceType
             * @memberof yorha.retrieval.GraphNeighbor
             * @instance
             */
            GraphNeighbor.prototype.evidenceType = "";

            /**
             * GraphNeighbor connectionType.
             * @member {string} connectionType
             * @memberof yorha.retrieval.GraphNeighbor
             * @instance
             */
            GraphNeighbor.prototype.connectionType = "";

            /**
             * GraphNeighbor strength.
             * @member {number} strength
             * @memberof yorha.retrieval.GraphNeighbor
             * @instance
             */
            GraphNeighbor.prototype.strength = 0;

            /**
             * GraphNeighbor confidence.
             * @member {number} confidence
             * @memberof yorha.retrieval.GraphNeighbor
             * @instance
             */
            GraphNeighbor.prototype.confidence = 0;

            /**
             * GraphNeighbor aiReasoning.
             * @member {string} aiReasoning
             * @memberof yorha.retrieval.GraphNeighbor
             * @instance
             */
            GraphNeighbor.prototype.aiReasoning = "";

            /**
             * Encodes the specified GraphNeighbor message. Does not implicitly {@link yorha.retrieval.GraphNeighbor.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.GraphNeighbor
             * @static
             * @param {yorha.retrieval.IGraphNeighbor} message GraphNeighbor message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            GraphNeighbor.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.nodeId != null && Object.hasOwnProperty.call(message, "nodeId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.nodeId);
                if (message.title != null && Object.hasOwnProperty.call(message, "title"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.title);
                if (message.evidenceType != null && Object.hasOwnProperty.call(message, "evidenceType"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.evidenceType);
                if (message.connectionType != null && Object.hasOwnProperty.call(message, "connectionType"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.connectionType);
                if (message.strength != null && Object.hasOwnProperty.call(message, "strength"))
                    writer.uint32(/* id 5, wireType 0 =*/40).int32(message.strength);
                if (message.confidence != null && Object.hasOwnProperty.call(message, "confidence"))
                    writer.uint32(/* id 6, wireType 0 =*/48).int32(message.confidence);
                if (message.aiReasoning != null && Object.hasOwnProperty.call(message, "aiReasoning"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.aiReasoning);
                return writer;
            };

            /**
             * Encodes the specified GraphNeighbor message, length delimited. Does not implicitly {@link yorha.retrieval.GraphNeighbor.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.GraphNeighbor
             * @static
             * @param {yorha.retrieval.IGraphNeighbor} message GraphNeighbor message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            GraphNeighbor.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a GraphNeighbor message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.GraphNeighbor
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.GraphNeighbor} GraphNeighbor
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            GraphNeighbor.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.GraphNeighbor();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.nodeId = reader.string();
                            break;
                        }
                    case 2: {
                            message.title = reader.string();
                            break;
                        }
                    case 3: {
                            message.evidenceType = reader.string();
                            break;
                        }
                    case 4: {
                            message.connectionType = reader.string();
                            break;
                        }
                    case 5: {
                            message.strength = reader.int32();
                            break;
                        }
                    case 6: {
                            message.confidence = reader.int32();
                            break;
                        }
                    case 7: {
                            message.aiReasoning = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a GraphNeighbor message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.GraphNeighbor
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.GraphNeighbor} GraphNeighbor
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            GraphNeighbor.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for GraphNeighbor
             * @function getTypeUrl
             * @memberof yorha.retrieval.GraphNeighbor
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            GraphNeighbor.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.GraphNeighbor";
            };

            return GraphNeighbor;
        })();

        retrieval.DocumentContext = (function() {

            /**
             * Properties of a DocumentContext.
             * @memberof yorha.retrieval
             * @interface IDocumentContext
             * @property {string|null} [evidenceId] DocumentContext evidenceId
             * @property {string|null} [fileName] DocumentContext fileName
             * @property {string|null} [fileType] DocumentContext fileType
             * @property {string|null} [description] DocumentContext description
             * @property {string|null} [aiSummary] DocumentContext aiSummary
             * @property {string|null} [aiTagsJson] DocumentContext aiTagsJson
             * @property {string|null} [keyEntitiesJson] DocumentContext keyEntitiesJson
             */

            /**
             * Constructs a new DocumentContext.
             * @memberof yorha.retrieval
             * @classdesc Represents a DocumentContext.
             * @implements IDocumentContext
             * @constructor
             * @param {yorha.retrieval.IDocumentContext=} [properties] Properties to set
             */
            function DocumentContext(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * DocumentContext evidenceId.
             * @member {string} evidenceId
             * @memberof yorha.retrieval.DocumentContext
             * @instance
             */
            DocumentContext.prototype.evidenceId = "";

            /**
             * DocumentContext fileName.
             * @member {string} fileName
             * @memberof yorha.retrieval.DocumentContext
             * @instance
             */
            DocumentContext.prototype.fileName = "";

            /**
             * DocumentContext fileType.
             * @member {string} fileType
             * @memberof yorha.retrieval.DocumentContext
             * @instance
             */
            DocumentContext.prototype.fileType = "";

            /**
             * DocumentContext description.
             * @member {string} description
             * @memberof yorha.retrieval.DocumentContext
             * @instance
             */
            DocumentContext.prototype.description = "";

            /**
             * DocumentContext aiSummary.
             * @member {string} aiSummary
             * @memberof yorha.retrieval.DocumentContext
             * @instance
             */
            DocumentContext.prototype.aiSummary = "";

            /**
             * DocumentContext aiTagsJson.
             * @member {string} aiTagsJson
             * @memberof yorha.retrieval.DocumentContext
             * @instance
             */
            DocumentContext.prototype.aiTagsJson = "";

            /**
             * DocumentContext keyEntitiesJson.
             * @member {string} keyEntitiesJson
             * @memberof yorha.retrieval.DocumentContext
             * @instance
             */
            DocumentContext.prototype.keyEntitiesJson = "";

            /**
             * Encodes the specified DocumentContext message. Does not implicitly {@link yorha.retrieval.DocumentContext.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.DocumentContext
             * @static
             * @param {yorha.retrieval.IDocumentContext} message DocumentContext message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            DocumentContext.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.evidenceId != null && Object.hasOwnProperty.call(message, "evidenceId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.evidenceId);
                if (message.fileName != null && Object.hasOwnProperty.call(message, "fileName"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.fileName);
                if (message.fileType != null && Object.hasOwnProperty.call(message, "fileType"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.fileType);
                if (message.description != null && Object.hasOwnProperty.call(message, "description"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.description);
                if (message.aiSummary != null && Object.hasOwnProperty.call(message, "aiSummary"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.aiSummary);
                if (message.aiTagsJson != null && Object.hasOwnProperty.call(message, "aiTagsJson"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.aiTagsJson);
                if (message.keyEntitiesJson != null && Object.hasOwnProperty.call(message, "keyEntitiesJson"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.keyEntitiesJson);
                return writer;
            };

            /**
             * Encodes the specified DocumentContext message, length delimited. Does not implicitly {@link yorha.retrieval.DocumentContext.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.DocumentContext
             * @static
             * @param {yorha.retrieval.IDocumentContext} message DocumentContext message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            DocumentContext.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a DocumentContext message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.DocumentContext
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.DocumentContext} DocumentContext
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            DocumentContext.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.DocumentContext();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.evidenceId = reader.string();
                            break;
                        }
                    case 2: {
                            message.fileName = reader.string();
                            break;
                        }
                    case 3: {
                            message.fileType = reader.string();
                            break;
                        }
                    case 4: {
                            message.description = reader.string();
                            break;
                        }
                    case 5: {
                            message.aiSummary = reader.string();
                            break;
                        }
                    case 6: {
                            message.aiTagsJson = reader.string();
                            break;
                        }
                    case 7: {
                            message.keyEntitiesJson = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a DocumentContext message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.DocumentContext
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.DocumentContext} DocumentContext
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            DocumentContext.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for DocumentContext
             * @function getTypeUrl
             * @memberof yorha.retrieval.DocumentContext
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            DocumentContext.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.DocumentContext";
            };

            return DocumentContext;
        })();

        retrieval.SearchTiming = (function() {

            /**
             * Properties of a SearchTiming.
             * @memberof yorha.retrieval
             * @interface ISearchTiming
             * @property {number|null} [embedMs] SearchTiming embedMs
             * @property {number|null} [searchMs] SearchTiming searchMs
             * @property {number|null} [rerankMs] SearchTiming rerankMs
             * @property {number|null} [hopMs] SearchTiming hopMs
             * @property {number|null} [kagMs] SearchTiming kagMs
             * @property {number|null} [dagMs] SearchTiming dagMs
             * @property {number|null} [totalMs] SearchTiming totalMs
             */

            /**
             * Constructs a new SearchTiming.
             * @memberof yorha.retrieval
             * @classdesc Represents a SearchTiming.
             * @implements ISearchTiming
             * @constructor
             * @param {yorha.retrieval.ISearchTiming=} [properties] Properties to set
             */
            function SearchTiming(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SearchTiming embedMs.
             * @member {number} embedMs
             * @memberof yorha.retrieval.SearchTiming
             * @instance
             */
            SearchTiming.prototype.embedMs = 0;

            /**
             * SearchTiming searchMs.
             * @member {number} searchMs
             * @memberof yorha.retrieval.SearchTiming
             * @instance
             */
            SearchTiming.prototype.searchMs = 0;

            /**
             * SearchTiming rerankMs.
             * @member {number} rerankMs
             * @memberof yorha.retrieval.SearchTiming
             * @instance
             */
            SearchTiming.prototype.rerankMs = 0;

            /**
             * SearchTiming hopMs.
             * @member {number} hopMs
             * @memberof yorha.retrieval.SearchTiming
             * @instance
             */
            SearchTiming.prototype.hopMs = 0;

            /**
             * SearchTiming kagMs.
             * @member {number} kagMs
             * @memberof yorha.retrieval.SearchTiming
             * @instance
             */
            SearchTiming.prototype.kagMs = 0;

            /**
             * SearchTiming dagMs.
             * @member {number} dagMs
             * @memberof yorha.retrieval.SearchTiming
             * @instance
             */
            SearchTiming.prototype.dagMs = 0;

            /**
             * SearchTiming totalMs.
             * @member {number} totalMs
             * @memberof yorha.retrieval.SearchTiming
             * @instance
             */
            SearchTiming.prototype.totalMs = 0;

            /**
             * Encodes the specified SearchTiming message. Does not implicitly {@link yorha.retrieval.SearchTiming.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.SearchTiming
             * @static
             * @param {yorha.retrieval.ISearchTiming} message SearchTiming message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchTiming.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.embedMs != null && Object.hasOwnProperty.call(message, "embedMs"))
                    writer.uint32(/* id 1, wireType 5 =*/13).float(message.embedMs);
                if (message.searchMs != null && Object.hasOwnProperty.call(message, "searchMs"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.searchMs);
                if (message.rerankMs != null && Object.hasOwnProperty.call(message, "rerankMs"))
                    writer.uint32(/* id 3, wireType 5 =*/29).float(message.rerankMs);
                if (message.hopMs != null && Object.hasOwnProperty.call(message, "hopMs"))
                    writer.uint32(/* id 4, wireType 5 =*/37).float(message.hopMs);
                if (message.kagMs != null && Object.hasOwnProperty.call(message, "kagMs"))
                    writer.uint32(/* id 5, wireType 5 =*/45).float(message.kagMs);
                if (message.dagMs != null && Object.hasOwnProperty.call(message, "dagMs"))
                    writer.uint32(/* id 6, wireType 5 =*/53).float(message.dagMs);
                if (message.totalMs != null && Object.hasOwnProperty.call(message, "totalMs"))
                    writer.uint32(/* id 7, wireType 5 =*/61).float(message.totalMs);
                return writer;
            };

            /**
             * Encodes the specified SearchTiming message, length delimited. Does not implicitly {@link yorha.retrieval.SearchTiming.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.SearchTiming
             * @static
             * @param {yorha.retrieval.ISearchTiming} message SearchTiming message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchTiming.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SearchTiming message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.SearchTiming
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.SearchTiming} SearchTiming
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchTiming.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.SearchTiming();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.embedMs = reader.float();
                            break;
                        }
                    case 2: {
                            message.searchMs = reader.float();
                            break;
                        }
                    case 3: {
                            message.rerankMs = reader.float();
                            break;
                        }
                    case 4: {
                            message.hopMs = reader.float();
                            break;
                        }
                    case 5: {
                            message.kagMs = reader.float();
                            break;
                        }
                    case 6: {
                            message.dagMs = reader.float();
                            break;
                        }
                    case 7: {
                            message.totalMs = reader.float();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a SearchTiming message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.SearchTiming
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.SearchTiming} SearchTiming
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchTiming.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for SearchTiming
             * @function getTypeUrl
             * @memberof yorha.retrieval.SearchTiming
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SearchTiming.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.SearchTiming";
            };

            return SearchTiming;
        })();

        retrieval.CodebaseSearchRequest = (function() {

            /**
             * Properties of a CodebaseSearchRequest.
             * @memberof yorha.retrieval
             * @interface ICodebaseSearchRequest
             * @property {string|null} [query] CodebaseSearchRequest query
             * @property {number|null} [limit] CodebaseSearchRequest limit
             * @property {number|null} [contentWeight] CodebaseSearchRequest contentWeight
             * @property {number|null} [signatureWeight] CodebaseSearchRequest signatureWeight
             * @property {Array.<string>|null} [kinds] CodebaseSearchRequest kinds
             * @property {string|null} [httpMethod] CodebaseSearchRequest httpMethod
             * @property {Array.<string>|null} [pathPrefixes] CodebaseSearchRequest pathPrefixes
             * @property {boolean|null} [includeDebug] CodebaseSearchRequest includeDebug
             */

            /**
             * Constructs a new CodebaseSearchRequest.
             * @memberof yorha.retrieval
             * @classdesc Represents a CodebaseSearchRequest.
             * @implements ICodebaseSearchRequest
             * @constructor
             * @param {yorha.retrieval.ICodebaseSearchRequest=} [properties] Properties to set
             */
            function CodebaseSearchRequest(properties) {
                this.kinds = [];
                this.pathPrefixes = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * CodebaseSearchRequest query.
             * @member {string} query
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.query = "";

            /**
             * CodebaseSearchRequest limit.
             * @member {number} limit
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.limit = 0;

            /**
             * CodebaseSearchRequest contentWeight.
             * @member {number} contentWeight
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.contentWeight = 0;

            /**
             * CodebaseSearchRequest signatureWeight.
             * @member {number} signatureWeight
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.signatureWeight = 0;

            /**
             * CodebaseSearchRequest kinds.
             * @member {Array.<string>} kinds
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.kinds = $util.emptyArray;

            /**
             * CodebaseSearchRequest httpMethod.
             * @member {string} httpMethod
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.httpMethod = "";

            /**
             * CodebaseSearchRequest pathPrefixes.
             * @member {Array.<string>} pathPrefixes
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.pathPrefixes = $util.emptyArray;

            /**
             * CodebaseSearchRequest includeDebug.
             * @member {boolean} includeDebug
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.includeDebug = false;

            /**
             * Encodes the specified CodebaseSearchRequest message. Does not implicitly {@link yorha.retrieval.CodebaseSearchRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @static
             * @param {yorha.retrieval.ICodebaseSearchRequest} message CodebaseSearchRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseSearchRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.query != null && Object.hasOwnProperty.call(message, "query"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.query);
                if (message.limit != null && Object.hasOwnProperty.call(message, "limit"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.limit);
                if (message.contentWeight != null && Object.hasOwnProperty.call(message, "contentWeight"))
                    writer.uint32(/* id 3, wireType 5 =*/29).float(message.contentWeight);
                if (message.signatureWeight != null && Object.hasOwnProperty.call(message, "signatureWeight"))
                    writer.uint32(/* id 4, wireType 5 =*/37).float(message.signatureWeight);
                if (message.kinds != null && message.kinds.length)
                    for (let i = 0; i < message.kinds.length; ++i)
                        writer.uint32(/* id 5, wireType 2 =*/42).string(message.kinds[i]);
                if (message.httpMethod != null && Object.hasOwnProperty.call(message, "httpMethod"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.httpMethod);
                if (message.pathPrefixes != null && message.pathPrefixes.length)
                    for (let i = 0; i < message.pathPrefixes.length; ++i)
                        writer.uint32(/* id 7, wireType 2 =*/58).string(message.pathPrefixes[i]);
                if (message.includeDebug != null && Object.hasOwnProperty.call(message, "includeDebug"))
                    writer.uint32(/* id 8, wireType 0 =*/64).bool(message.includeDebug);
                return writer;
            };

            /**
             * Encodes the specified CodebaseSearchRequest message, length delimited. Does not implicitly {@link yorha.retrieval.CodebaseSearchRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @static
             * @param {yorha.retrieval.ICodebaseSearchRequest} message CodebaseSearchRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseSearchRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a CodebaseSearchRequest message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.CodebaseSearchRequest} CodebaseSearchRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CodebaseSearchRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.CodebaseSearchRequest();
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
                            message.limit = reader.int32();
                            break;
                        }
                    case 3: {
                            message.contentWeight = reader.float();
                            break;
                        }
                    case 4: {
                            message.signatureWeight = reader.float();
                            break;
                        }
                    case 5: {
                            if (!(message.kinds && message.kinds.length))
                                message.kinds = [];
                            message.kinds.push(reader.string());
                            break;
                        }
                    case 6: {
                            message.httpMethod = reader.string();
                            break;
                        }
                    case 7: {
                            if (!(message.pathPrefixes && message.pathPrefixes.length))
                                message.pathPrefixes = [];
                            message.pathPrefixes.push(reader.string());
                            break;
                        }
                    case 8: {
                            message.includeDebug = reader.bool();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a CodebaseSearchRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.CodebaseSearchRequest} CodebaseSearchRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CodebaseSearchRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for CodebaseSearchRequest
             * @function getTypeUrl
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            CodebaseSearchRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.CodebaseSearchRequest";
            };

            return CodebaseSearchRequest;
        })();

        retrieval.CodebaseSearchResponse = (function() {

            /**
             * Properties of a CodebaseSearchResponse.
             * @memberof yorha.retrieval
             * @interface ICodebaseSearchResponse
             * @property {Array.<yorha.retrieval.ICodebaseChunk>|null} [chunks] CodebaseSearchResponse chunks
             * @property {number|null} [totalMs] CodebaseSearchResponse totalMs
             * @property {string|null} [debugJson] CodebaseSearchResponse debugJson
             */

            /**
             * Constructs a new CodebaseSearchResponse.
             * @memberof yorha.retrieval
             * @classdesc Represents a CodebaseSearchResponse.
             * @implements ICodebaseSearchResponse
             * @constructor
             * @param {yorha.retrieval.ICodebaseSearchResponse=} [properties] Properties to set
             */
            function CodebaseSearchResponse(properties) {
                this.chunks = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * CodebaseSearchResponse chunks.
             * @member {Array.<yorha.retrieval.ICodebaseChunk>} chunks
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @instance
             */
            CodebaseSearchResponse.prototype.chunks = $util.emptyArray;

            /**
             * CodebaseSearchResponse totalMs.
             * @member {number} totalMs
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @instance
             */
            CodebaseSearchResponse.prototype.totalMs = 0;

            /**
             * CodebaseSearchResponse debugJson.
             * @member {string} debugJson
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @instance
             */
            CodebaseSearchResponse.prototype.debugJson = "";

            /**
             * Encodes the specified CodebaseSearchResponse message. Does not implicitly {@link yorha.retrieval.CodebaseSearchResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @static
             * @param {yorha.retrieval.ICodebaseSearchResponse} message CodebaseSearchResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseSearchResponse.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.chunks != null && message.chunks.length)
                    for (let i = 0; i < message.chunks.length; ++i)
                        $root.yorha.retrieval.CodebaseChunk.encode(message.chunks[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                if (message.totalMs != null && Object.hasOwnProperty.call(message, "totalMs"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.totalMs);
                if (message.debugJson != null && Object.hasOwnProperty.call(message, "debugJson"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.debugJson);
                return writer;
            };

            /**
             * Encodes the specified CodebaseSearchResponse message, length delimited. Does not implicitly {@link yorha.retrieval.CodebaseSearchResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @static
             * @param {yorha.retrieval.ICodebaseSearchResponse} message CodebaseSearchResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseSearchResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a CodebaseSearchResponse message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.CodebaseSearchResponse} CodebaseSearchResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CodebaseSearchResponse.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.CodebaseSearchResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.chunks && message.chunks.length))
                                message.chunks = [];
                            message.chunks.push($root.yorha.retrieval.CodebaseChunk.decode(reader, reader.uint32()));
                            break;
                        }
                    case 2: {
                            message.totalMs = reader.float();
                            break;
                        }
                    case 3: {
                            message.debugJson = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a CodebaseSearchResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.CodebaseSearchResponse} CodebaseSearchResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CodebaseSearchResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for CodebaseSearchResponse
             * @function getTypeUrl
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            CodebaseSearchResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.CodebaseSearchResponse";
            };

            return CodebaseSearchResponse;
        })();

        retrieval.CodebaseChunkEvent = (function() {

            /**
             * Properties of a CodebaseChunkEvent.
             * @memberof yorha.retrieval
             * @interface ICodebaseChunkEvent
             * @property {yorha.retrieval.ICodebaseChunk|null} [chunk] CodebaseChunkEvent chunk
             * @property {yorha.retrieval.IRetrievalProgress|null} [progress] CodebaseChunkEvent progress
             * @property {yorha.retrieval.IRetrievalError|null} [error] CodebaseChunkEvent error
             */

            /**
             * Constructs a new CodebaseChunkEvent.
             * @memberof yorha.retrieval
             * @classdesc Represents a CodebaseChunkEvent.
             * @implements ICodebaseChunkEvent
             * @constructor
             * @param {yorha.retrieval.ICodebaseChunkEvent=} [properties] Properties to set
             */
            function CodebaseChunkEvent(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * CodebaseChunkEvent chunk.
             * @member {yorha.retrieval.ICodebaseChunk|null|undefined} chunk
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @instance
             */
            CodebaseChunkEvent.prototype.chunk = null;

            /**
             * CodebaseChunkEvent progress.
             * @member {yorha.retrieval.IRetrievalProgress|null|undefined} progress
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @instance
             */
            CodebaseChunkEvent.prototype.progress = null;

            /**
             * CodebaseChunkEvent error.
             * @member {yorha.retrieval.IRetrievalError|null|undefined} error
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @instance
             */
            CodebaseChunkEvent.prototype.error = null;

            // OneOf field names bound to virtual getters and setters
            let $oneOfFields;

            /**
             * CodebaseChunkEvent event.
             * @member {"chunk"|"progress"|"error"|undefined} event
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @instance
             */
            Object.defineProperty(CodebaseChunkEvent.prototype, "event", {
                get: $util.oneOfGetter($oneOfFields = ["chunk", "progress", "error"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Encodes the specified CodebaseChunkEvent message. Does not implicitly {@link yorha.retrieval.CodebaseChunkEvent.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @static
             * @param {yorha.retrieval.ICodebaseChunkEvent} message CodebaseChunkEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseChunkEvent.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.chunk != null && Object.hasOwnProperty.call(message, "chunk"))
                    $root.yorha.retrieval.CodebaseChunk.encode(message.chunk, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                if (message.progress != null && Object.hasOwnProperty.call(message, "progress"))
                    $root.yorha.retrieval.RetrievalProgress.encode(message.progress, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                if (message.error != null && Object.hasOwnProperty.call(message, "error"))
                    $root.yorha.retrieval.RetrievalError.encode(message.error, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified CodebaseChunkEvent message, length delimited. Does not implicitly {@link yorha.retrieval.CodebaseChunkEvent.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @static
             * @param {yorha.retrieval.ICodebaseChunkEvent} message CodebaseChunkEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseChunkEvent.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a CodebaseChunkEvent message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.CodebaseChunkEvent} CodebaseChunkEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CodebaseChunkEvent.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.CodebaseChunkEvent();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.chunk = $root.yorha.retrieval.CodebaseChunk.decode(reader, reader.uint32());
                            break;
                        }
                    case 2: {
                            message.progress = $root.yorha.retrieval.RetrievalProgress.decode(reader, reader.uint32());
                            break;
                        }
                    case 3: {
                            message.error = $root.yorha.retrieval.RetrievalError.decode(reader, reader.uint32());
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a CodebaseChunkEvent message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.CodebaseChunkEvent} CodebaseChunkEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CodebaseChunkEvent.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for CodebaseChunkEvent
             * @function getTypeUrl
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            CodebaseChunkEvent.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.CodebaseChunkEvent";
            };

            return CodebaseChunkEvent;
        })();

        retrieval.CodebaseChunk = (function() {

            /**
             * Properties of a CodebaseChunk.
             * @memberof yorha.retrieval
             * @interface ICodebaseChunk
             * @property {string|null} [chunkId] CodebaseChunk chunkId
             * @property {string|null} [filePath] CodebaseChunk filePath
             * @property {string|null} [kind] CodebaseChunk kind
             * @property {string|null} [httpMethod] CodebaseChunk httpMethod
             * @property {string|null} [routeId] CodebaseChunk routeId
             * @property {Array.<string>|null} [tags] CodebaseChunk tags
             * @property {string|null} [contentPreview] CodebaseChunk contentPreview
             * @property {number|null} [score] CodebaseChunk score
             * @property {number|null} [startLine] CodebaseChunk startLine
             * @property {number|null} [endLine] CodebaseChunk endLine
             */

            /**
             * Constructs a new CodebaseChunk.
             * @memberof yorha.retrieval
             * @classdesc Represents a CodebaseChunk.
             * @implements ICodebaseChunk
             * @constructor
             * @param {yorha.retrieval.ICodebaseChunk=} [properties] Properties to set
             */
            function CodebaseChunk(properties) {
                this.tags = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * CodebaseChunk chunkId.
             * @member {string} chunkId
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.chunkId = "";

            /**
             * CodebaseChunk filePath.
             * @member {string} filePath
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.filePath = "";

            /**
             * CodebaseChunk kind.
             * @member {string} kind
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.kind = "";

            /**
             * CodebaseChunk httpMethod.
             * @member {string} httpMethod
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.httpMethod = "";

            /**
             * CodebaseChunk routeId.
             * @member {string} routeId
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.routeId = "";

            /**
             * CodebaseChunk tags.
             * @member {Array.<string>} tags
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.tags = $util.emptyArray;

            /**
             * CodebaseChunk contentPreview.
             * @member {string} contentPreview
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.contentPreview = "";

            /**
             * CodebaseChunk score.
             * @member {number} score
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.score = 0;

            /**
             * CodebaseChunk startLine.
             * @member {number} startLine
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.startLine = 0;

            /**
             * CodebaseChunk endLine.
             * @member {number} endLine
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.endLine = 0;

            /**
             * Encodes the specified CodebaseChunk message. Does not implicitly {@link yorha.retrieval.CodebaseChunk.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.CodebaseChunk
             * @static
             * @param {yorha.retrieval.ICodebaseChunk} message CodebaseChunk message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseChunk.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.chunkId != null && Object.hasOwnProperty.call(message, "chunkId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.chunkId);
                if (message.filePath != null && Object.hasOwnProperty.call(message, "filePath"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.filePath);
                if (message.kind != null && Object.hasOwnProperty.call(message, "kind"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.kind);
                if (message.httpMethod != null && Object.hasOwnProperty.call(message, "httpMethod"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.httpMethod);
                if (message.routeId != null && Object.hasOwnProperty.call(message, "routeId"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.routeId);
                if (message.tags != null && message.tags.length)
                    for (let i = 0; i < message.tags.length; ++i)
                        writer.uint32(/* id 6, wireType 2 =*/50).string(message.tags[i]);
                if (message.contentPreview != null && Object.hasOwnProperty.call(message, "contentPreview"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.contentPreview);
                if (message.score != null && Object.hasOwnProperty.call(message, "score"))
                    writer.uint32(/* id 8, wireType 5 =*/69).float(message.score);
                if (message.startLine != null && Object.hasOwnProperty.call(message, "startLine"))
                    writer.uint32(/* id 9, wireType 0 =*/72).int32(message.startLine);
                if (message.endLine != null && Object.hasOwnProperty.call(message, "endLine"))
                    writer.uint32(/* id 10, wireType 0 =*/80).int32(message.endLine);
                return writer;
            };

            /**
             * Encodes the specified CodebaseChunk message, length delimited. Does not implicitly {@link yorha.retrieval.CodebaseChunk.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.CodebaseChunk
             * @static
             * @param {yorha.retrieval.ICodebaseChunk} message CodebaseChunk message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseChunk.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a CodebaseChunk message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.CodebaseChunk
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.CodebaseChunk} CodebaseChunk
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CodebaseChunk.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.CodebaseChunk();
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
                            message.filePath = reader.string();
                            break;
                        }
                    case 3: {
                            message.kind = reader.string();
                            break;
                        }
                    case 4: {
                            message.httpMethod = reader.string();
                            break;
                        }
                    case 5: {
                            message.routeId = reader.string();
                            break;
                        }
                    case 6: {
                            if (!(message.tags && message.tags.length))
                                message.tags = [];
                            message.tags.push(reader.string());
                            break;
                        }
                    case 7: {
                            message.contentPreview = reader.string();
                            break;
                        }
                    case 8: {
                            message.score = reader.float();
                            break;
                        }
                    case 9: {
                            message.startLine = reader.int32();
                            break;
                        }
                    case 10: {
                            message.endLine = reader.int32();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a CodebaseChunk message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.CodebaseChunk
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.CodebaseChunk} CodebaseChunk
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CodebaseChunk.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for CodebaseChunk
             * @function getTypeUrl
             * @memberof yorha.retrieval.CodebaseChunk
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            CodebaseChunk.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.CodebaseChunk";
            };

            return CodebaseChunk;
        })();

        retrieval.GraphHopPolicy = (function() {

            /**
             * Properties of a GraphHopPolicy.
             * @memberof yorha.retrieval
             * @interface IGraphHopPolicy
             * @property {number|null} [mode] GraphHopPolicy mode
             * @property {number|null} [maxHopChunks] GraphHopPolicy maxHopChunks
             * @property {boolean|null} [withinSameEvidenceOnly] GraphHopPolicy withinSameEvidenceOnly
             */

            /**
             * Constructs a new GraphHopPolicy.
             * @memberof yorha.retrieval
             * @classdesc Represents a GraphHopPolicy.
             * @implements IGraphHopPolicy
             * @constructor
             * @param {yorha.retrieval.IGraphHopPolicy=} [properties] Properties to set
             */
            function GraphHopPolicy(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * GraphHopPolicy mode.
             * @member {number} mode
             * @memberof yorha.retrieval.GraphHopPolicy
             * @instance
             */
            GraphHopPolicy.prototype.mode = 0;

            /**
             * GraphHopPolicy maxHopChunks.
             * @member {number} maxHopChunks
             * @memberof yorha.retrieval.GraphHopPolicy
             * @instance
             */
            GraphHopPolicy.prototype.maxHopChunks = 0;

            /**
             * GraphHopPolicy withinSameEvidenceOnly.
             * @member {boolean} withinSameEvidenceOnly
             * @memberof yorha.retrieval.GraphHopPolicy
             * @instance
             */
            GraphHopPolicy.prototype.withinSameEvidenceOnly = false;

            /**
             * Encodes the specified GraphHopPolicy message. Does not implicitly {@link yorha.retrieval.GraphHopPolicy.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.GraphHopPolicy
             * @static
             * @param {yorha.retrieval.IGraphHopPolicy} message GraphHopPolicy message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            GraphHopPolicy.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.mode != null && Object.hasOwnProperty.call(message, "mode"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.mode);
                if (message.maxHopChunks != null && Object.hasOwnProperty.call(message, "maxHopChunks"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.maxHopChunks);
                if (message.withinSameEvidenceOnly != null && Object.hasOwnProperty.call(message, "withinSameEvidenceOnly"))
                    writer.uint32(/* id 3, wireType 0 =*/24).bool(message.withinSameEvidenceOnly);
                return writer;
            };

            /**
             * Encodes the specified GraphHopPolicy message, length delimited. Does not implicitly {@link yorha.retrieval.GraphHopPolicy.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.GraphHopPolicy
             * @static
             * @param {yorha.retrieval.IGraphHopPolicy} message GraphHopPolicy message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            GraphHopPolicy.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a GraphHopPolicy message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.GraphHopPolicy
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.GraphHopPolicy} GraphHopPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            GraphHopPolicy.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.GraphHopPolicy();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.mode = reader.int32();
                            break;
                        }
                    case 2: {
                            message.maxHopChunks = reader.int32();
                            break;
                        }
                    case 3: {
                            message.withinSameEvidenceOnly = reader.bool();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a GraphHopPolicy message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.GraphHopPolicy
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.GraphHopPolicy} GraphHopPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            GraphHopPolicy.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for GraphHopPolicy
             * @function getTypeUrl
             * @memberof yorha.retrieval.GraphHopPolicy
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            GraphHopPolicy.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.GraphHopPolicy";
            };

            return GraphHopPolicy;
        })();

        retrieval.PrefilterPolicy = (function() {

            /**
             * Properties of a PrefilterPolicy.
             * @memberof yorha.retrieval
             * @interface IPrefilterPolicy
             * @property {boolean|null} [enableQdrant] PrefilterPolicy enableQdrant
             * @property {number|null} [qdrantShortlist] PrefilterPolicy qdrantShortlist
             * @property {number|null} [scoreThreshold] PrefilterPolicy scoreThreshold
             * @property {boolean|null} [allowPgvectorFallback] PrefilterPolicy allowPgvectorFallback
             */

            /**
             * Constructs a new PrefilterPolicy.
             * @memberof yorha.retrieval
             * @classdesc Represents a PrefilterPolicy.
             * @implements IPrefilterPolicy
             * @constructor
             * @param {yorha.retrieval.IPrefilterPolicy=} [properties] Properties to set
             */
            function PrefilterPolicy(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * PrefilterPolicy enableQdrant.
             * @member {boolean} enableQdrant
             * @memberof yorha.retrieval.PrefilterPolicy
             * @instance
             */
            PrefilterPolicy.prototype.enableQdrant = false;

            /**
             * PrefilterPolicy qdrantShortlist.
             * @member {number} qdrantShortlist
             * @memberof yorha.retrieval.PrefilterPolicy
             * @instance
             */
            PrefilterPolicy.prototype.qdrantShortlist = 0;

            /**
             * PrefilterPolicy scoreThreshold.
             * @member {number} scoreThreshold
             * @memberof yorha.retrieval.PrefilterPolicy
             * @instance
             */
            PrefilterPolicy.prototype.scoreThreshold = 0;

            /**
             * PrefilterPolicy allowPgvectorFallback.
             * @member {boolean} allowPgvectorFallback
             * @memberof yorha.retrieval.PrefilterPolicy
             * @instance
             */
            PrefilterPolicy.prototype.allowPgvectorFallback = false;

            /**
             * Encodes the specified PrefilterPolicy message. Does not implicitly {@link yorha.retrieval.PrefilterPolicy.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.PrefilterPolicy
             * @static
             * @param {yorha.retrieval.IPrefilterPolicy} message PrefilterPolicy message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PrefilterPolicy.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.enableQdrant != null && Object.hasOwnProperty.call(message, "enableQdrant"))
                    writer.uint32(/* id 1, wireType 0 =*/8).bool(message.enableQdrant);
                if (message.qdrantShortlist != null && Object.hasOwnProperty.call(message, "qdrantShortlist"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.qdrantShortlist);
                if (message.scoreThreshold != null && Object.hasOwnProperty.call(message, "scoreThreshold"))
                    writer.uint32(/* id 3, wireType 5 =*/29).float(message.scoreThreshold);
                if (message.allowPgvectorFallback != null && Object.hasOwnProperty.call(message, "allowPgvectorFallback"))
                    writer.uint32(/* id 4, wireType 0 =*/32).bool(message.allowPgvectorFallback);
                return writer;
            };

            /**
             * Encodes the specified PrefilterPolicy message, length delimited. Does not implicitly {@link yorha.retrieval.PrefilterPolicy.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.PrefilterPolicy
             * @static
             * @param {yorha.retrieval.IPrefilterPolicy} message PrefilterPolicy message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PrefilterPolicy.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a PrefilterPolicy message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.PrefilterPolicy
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.PrefilterPolicy} PrefilterPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            PrefilterPolicy.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.PrefilterPolicy();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.enableQdrant = reader.bool();
                            break;
                        }
                    case 2: {
                            message.qdrantShortlist = reader.int32();
                            break;
                        }
                    case 3: {
                            message.scoreThreshold = reader.float();
                            break;
                        }
                    case 4: {
                            message.allowPgvectorFallback = reader.bool();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a PrefilterPolicy message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.PrefilterPolicy
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.PrefilterPolicy} PrefilterPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            PrefilterPolicy.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for PrefilterPolicy
             * @function getTypeUrl
             * @memberof yorha.retrieval.PrefilterPolicy
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            PrefilterPolicy.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.PrefilterPolicy";
            };

            return PrefilterPolicy;
        })();

        retrieval.RankPolicy = (function() {

            /**
             * Properties of a RankPolicy.
             * @memberof yorha.retrieval
             * @interface IRankPolicy
             * @property {number|null} [cosineWeight] RankPolicy cosineWeight
             * @property {number|null} [citationsWeight] RankPolicy citationsWeight
             * @property {number|null} [jurisdictionWeight] RankPolicy jurisdictionWeight
             */

            /**
             * Constructs a new RankPolicy.
             * @memberof yorha.retrieval
             * @classdesc Represents a RankPolicy.
             * @implements IRankPolicy
             * @constructor
             * @param {yorha.retrieval.IRankPolicy=} [properties] Properties to set
             */
            function RankPolicy(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * RankPolicy cosineWeight.
             * @member {number} cosineWeight
             * @memberof yorha.retrieval.RankPolicy
             * @instance
             */
            RankPolicy.prototype.cosineWeight = 0;

            /**
             * RankPolicy citationsWeight.
             * @member {number} citationsWeight
             * @memberof yorha.retrieval.RankPolicy
             * @instance
             */
            RankPolicy.prototype.citationsWeight = 0;

            /**
             * RankPolicy jurisdictionWeight.
             * @member {number} jurisdictionWeight
             * @memberof yorha.retrieval.RankPolicy
             * @instance
             */
            RankPolicy.prototype.jurisdictionWeight = 0;

            /**
             * Encodes the specified RankPolicy message. Does not implicitly {@link yorha.retrieval.RankPolicy.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RankPolicy
             * @static
             * @param {yorha.retrieval.IRankPolicy} message RankPolicy message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RankPolicy.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.cosineWeight != null && Object.hasOwnProperty.call(message, "cosineWeight"))
                    writer.uint32(/* id 1, wireType 5 =*/13).float(message.cosineWeight);
                if (message.citationsWeight != null && Object.hasOwnProperty.call(message, "citationsWeight"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.citationsWeight);
                if (message.jurisdictionWeight != null && Object.hasOwnProperty.call(message, "jurisdictionWeight"))
                    writer.uint32(/* id 3, wireType 5 =*/29).float(message.jurisdictionWeight);
                return writer;
            };

            /**
             * Encodes the specified RankPolicy message, length delimited. Does not implicitly {@link yorha.retrieval.RankPolicy.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.RankPolicy
             * @static
             * @param {yorha.retrieval.IRankPolicy} message RankPolicy message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RankPolicy.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a RankPolicy message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.RankPolicy
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.RankPolicy} RankPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RankPolicy.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.RankPolicy();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.cosineWeight = reader.float();
                            break;
                        }
                    case 2: {
                            message.citationsWeight = reader.float();
                            break;
                        }
                    case 3: {
                            message.jurisdictionWeight = reader.float();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a RankPolicy message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.RankPolicy
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.RankPolicy} RankPolicy
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RankPolicy.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for RankPolicy
             * @function getTypeUrl
             * @memberof yorha.retrieval.RankPolicy
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            RankPolicy.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.RankPolicy";
            };

            return RankPolicy;
        })();

        retrieval.RetrievalProgress = (function() {

            /**
             * Properties of a RetrievalProgress.
             * @memberof yorha.retrieval
             * @interface IRetrievalProgress
             * @property {string|null} [stage] RetrievalProgress stage
             * @property {number|null} [current] RetrievalProgress current
             * @property {number|null} [total] RetrievalProgress total
             * @property {string|null} [message] RetrievalProgress message
             */

            /**
             * Constructs a new RetrievalProgress.
             * @memberof yorha.retrieval
             * @classdesc Represents a RetrievalProgress.
             * @implements IRetrievalProgress
             * @constructor
             * @param {yorha.retrieval.IRetrievalProgress=} [properties] Properties to set
             */
            function RetrievalProgress(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * RetrievalProgress stage.
             * @member {string} stage
             * @memberof yorha.retrieval.RetrievalProgress
             * @instance
             */
            RetrievalProgress.prototype.stage = "";

            /**
             * RetrievalProgress current.
             * @member {number} current
             * @memberof yorha.retrieval.RetrievalProgress
             * @instance
             */
            RetrievalProgress.prototype.current = 0;

            /**
             * RetrievalProgress total.
             * @member {number} total
             * @memberof yorha.retrieval.RetrievalProgress
             * @instance
             */
            RetrievalProgress.prototype.total = 0;

            /**
             * RetrievalProgress message.
             * @member {string} message
             * @memberof yorha.retrieval.RetrievalProgress
             * @instance
             */
            RetrievalProgress.prototype.message = "";

            /**
             * Encodes the specified RetrievalProgress message. Does not implicitly {@link yorha.retrieval.RetrievalProgress.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RetrievalProgress
             * @static
             * @param {yorha.retrieval.IRetrievalProgress} message RetrievalProgress message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalProgress.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.stage != null && Object.hasOwnProperty.call(message, "stage"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.stage);
                if (message.current != null && Object.hasOwnProperty.call(message, "current"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.current);
                if (message.total != null && Object.hasOwnProperty.call(message, "total"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.total);
                if (message.message != null && Object.hasOwnProperty.call(message, "message"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.message);
                return writer;
            };

            /**
             * Encodes the specified RetrievalProgress message, length delimited. Does not implicitly {@link yorha.retrieval.RetrievalProgress.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.RetrievalProgress
             * @static
             * @param {yorha.retrieval.IRetrievalProgress} message RetrievalProgress message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalProgress.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a RetrievalProgress message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.RetrievalProgress
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.RetrievalProgress} RetrievalProgress
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RetrievalProgress.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.RetrievalProgress();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.stage = reader.string();
                            break;
                        }
                    case 2: {
                            message.current = reader.int32();
                            break;
                        }
                    case 3: {
                            message.total = reader.int32();
                            break;
                        }
                    case 4: {
                            message.message = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a RetrievalProgress message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.RetrievalProgress
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.RetrievalProgress} RetrievalProgress
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RetrievalProgress.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for RetrievalProgress
             * @function getTypeUrl
             * @memberof yorha.retrieval.RetrievalProgress
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            RetrievalProgress.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.RetrievalProgress";
            };

            return RetrievalProgress;
        })();

        retrieval.RetrievalError = (function() {

            /**
             * Properties of a RetrievalError.
             * @memberof yorha.retrieval
             * @interface IRetrievalError
             * @property {string|null} [code] RetrievalError code
             * @property {string|null} [message] RetrievalError message
             * @property {string|null} [detailsJson] RetrievalError detailsJson
             */

            /**
             * Constructs a new RetrievalError.
             * @memberof yorha.retrieval
             * @classdesc Represents a RetrievalError.
             * @implements IRetrievalError
             * @constructor
             * @param {yorha.retrieval.IRetrievalError=} [properties] Properties to set
             */
            function RetrievalError(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * RetrievalError code.
             * @member {string} code
             * @memberof yorha.retrieval.RetrievalError
             * @instance
             */
            RetrievalError.prototype.code = "";

            /**
             * RetrievalError message.
             * @member {string} message
             * @memberof yorha.retrieval.RetrievalError
             * @instance
             */
            RetrievalError.prototype.message = "";

            /**
             * RetrievalError detailsJson.
             * @member {string} detailsJson
             * @memberof yorha.retrieval.RetrievalError
             * @instance
             */
            RetrievalError.prototype.detailsJson = "";

            /**
             * Encodes the specified RetrievalError message. Does not implicitly {@link yorha.retrieval.RetrievalError.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RetrievalError
             * @static
             * @param {yorha.retrieval.IRetrievalError} message RetrievalError message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalError.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.code != null && Object.hasOwnProperty.call(message, "code"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.code);
                if (message.message != null && Object.hasOwnProperty.call(message, "message"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.message);
                if (message.detailsJson != null && Object.hasOwnProperty.call(message, "detailsJson"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.detailsJson);
                return writer;
            };

            /**
             * Encodes the specified RetrievalError message, length delimited. Does not implicitly {@link yorha.retrieval.RetrievalError.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.RetrievalError
             * @static
             * @param {yorha.retrieval.IRetrievalError} message RetrievalError message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalError.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a RetrievalError message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.RetrievalError
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.RetrievalError} RetrievalError
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RetrievalError.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.RetrievalError();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.code = reader.string();
                            break;
                        }
                    case 2: {
                            message.message = reader.string();
                            break;
                        }
                    case 3: {
                            message.detailsJson = reader.string();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a RetrievalError message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.RetrievalError
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.RetrievalError} RetrievalError
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RetrievalError.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for RetrievalError
             * @function getTypeUrl
             * @memberof yorha.retrieval.RetrievalError
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            RetrievalError.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.RetrievalError";
            };

            return RetrievalError;
        })();

        retrieval.HealthRequest = (function() {

            /**
             * Properties of a HealthRequest.
             * @memberof yorha.retrieval
             * @interface IHealthRequest
             * @property {string|null} [service] HealthRequest service
             */

            /**
             * Constructs a new HealthRequest.
             * @memberof yorha.retrieval
             * @classdesc Represents a HealthRequest.
             * @implements IHealthRequest
             * @constructor
             * @param {yorha.retrieval.IHealthRequest=} [properties] Properties to set
             */
            function HealthRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * HealthRequest service.
             * @member {string} service
             * @memberof yorha.retrieval.HealthRequest
             * @instance
             */
            HealthRequest.prototype.service = "";

            /**
             * Encodes the specified HealthRequest message. Does not implicitly {@link yorha.retrieval.HealthRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.HealthRequest
             * @static
             * @param {yorha.retrieval.IHealthRequest} message HealthRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            HealthRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.service != null && Object.hasOwnProperty.call(message, "service"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.service);
                return writer;
            };

            /**
             * Encodes the specified HealthRequest message, length delimited. Does not implicitly {@link yorha.retrieval.HealthRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.HealthRequest
             * @static
             * @param {yorha.retrieval.IHealthRequest} message HealthRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            HealthRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a HealthRequest message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.HealthRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.HealthRequest} HealthRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            HealthRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.HealthRequest();
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
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a HealthRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.HealthRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.HealthRequest} HealthRequest
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
             * @memberof yorha.retrieval.HealthRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            HealthRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.HealthRequest";
            };

            return HealthRequest;
        })();

        retrieval.HealthResponse = (function() {

            /**
             * Properties of a HealthResponse.
             * @memberof yorha.retrieval
             * @interface IHealthResponse
             * @property {string|null} [status] HealthResponse status
             * @property {boolean|null} [pgvectorConnected] HealthResponse pgvectorConnected
             * @property {boolean|null} [qdrantConnected] HealthResponse qdrantConnected
             * @property {boolean|null} [redisConnected] HealthResponse redisConnected
             * @property {boolean|null} [embeddingServiceUp] HealthResponse embeddingServiceUp
             * @property {number|Long|null} [timestamp] HealthResponse timestamp
             */

            /**
             * Constructs a new HealthResponse.
             * @memberof yorha.retrieval
             * @classdesc Represents a HealthResponse.
             * @implements IHealthResponse
             * @constructor
             * @param {yorha.retrieval.IHealthResponse=} [properties] Properties to set
             */
            function HealthResponse(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * HealthResponse status.
             * @member {string} status
             * @memberof yorha.retrieval.HealthResponse
             * @instance
             */
            HealthResponse.prototype.status = "";

            /**
             * HealthResponse pgvectorConnected.
             * @member {boolean} pgvectorConnected
             * @memberof yorha.retrieval.HealthResponse
             * @instance
             */
            HealthResponse.prototype.pgvectorConnected = false;

            /**
             * HealthResponse qdrantConnected.
             * @member {boolean} qdrantConnected
             * @memberof yorha.retrieval.HealthResponse
             * @instance
             */
            HealthResponse.prototype.qdrantConnected = false;

            /**
             * HealthResponse redisConnected.
             * @member {boolean} redisConnected
             * @memberof yorha.retrieval.HealthResponse
             * @instance
             */
            HealthResponse.prototype.redisConnected = false;

            /**
             * HealthResponse embeddingServiceUp.
             * @member {boolean} embeddingServiceUp
             * @memberof yorha.retrieval.HealthResponse
             * @instance
             */
            HealthResponse.prototype.embeddingServiceUp = false;

            /**
             * HealthResponse timestamp.
             * @member {number|Long} timestamp
             * @memberof yorha.retrieval.HealthResponse
             * @instance
             */
            HealthResponse.prototype.timestamp = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Encodes the specified HealthResponse message. Does not implicitly {@link yorha.retrieval.HealthResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.HealthResponse
             * @static
             * @param {yorha.retrieval.IHealthResponse} message HealthResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            HealthResponse.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.status);
                if (message.pgvectorConnected != null && Object.hasOwnProperty.call(message, "pgvectorConnected"))
                    writer.uint32(/* id 2, wireType 0 =*/16).bool(message.pgvectorConnected);
                if (message.qdrantConnected != null && Object.hasOwnProperty.call(message, "qdrantConnected"))
                    writer.uint32(/* id 3, wireType 0 =*/24).bool(message.qdrantConnected);
                if (message.redisConnected != null && Object.hasOwnProperty.call(message, "redisConnected"))
                    writer.uint32(/* id 4, wireType 0 =*/32).bool(message.redisConnected);
                if (message.embeddingServiceUp != null && Object.hasOwnProperty.call(message, "embeddingServiceUp"))
                    writer.uint32(/* id 5, wireType 0 =*/40).bool(message.embeddingServiceUp);
                if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                    writer.uint32(/* id 6, wireType 0 =*/48).int64(message.timestamp);
                return writer;
            };

            /**
             * Encodes the specified HealthResponse message, length delimited. Does not implicitly {@link yorha.retrieval.HealthResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.HealthResponse
             * @static
             * @param {yorha.retrieval.IHealthResponse} message HealthResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            HealthResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a HealthResponse message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.HealthResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.HealthResponse} HealthResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            HealthResponse.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.HealthResponse();
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
                            message.pgvectorConnected = reader.bool();
                            break;
                        }
                    case 3: {
                            message.qdrantConnected = reader.bool();
                            break;
                        }
                    case 4: {
                            message.redisConnected = reader.bool();
                            break;
                        }
                    case 5: {
                            message.embeddingServiceUp = reader.bool();
                            break;
                        }
                    case 6: {
                            message.timestamp = reader.int64();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a HealthResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.HealthResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.HealthResponse} HealthResponse
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
             * @memberof yorha.retrieval.HealthResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            HealthResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.HealthResponse";
            };

            return HealthResponse;
        })();

        return retrieval;
    })();

    return yorha;
})();

export { $root as default };
