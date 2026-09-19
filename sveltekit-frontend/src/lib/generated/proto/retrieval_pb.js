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
             * Creates new RetrievalService service using the specified rpc implementation.
             * @function create
             * @memberof yorha.retrieval.RetrievalService
             * @static
             * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
             * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
             * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
             * @returns {RetrievalService} RPC service. Useful where requests and/or responses are streamed.
             */
            RetrievalService.create = function create(rpcImpl, requestDelimited, responseDelimited) {
                return new this(rpcImpl, requestDelimited, responseDelimited);
            };

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
             * Callback as used by {@link yorha.retrieval.RetrievalService#searchChunks}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef SearchChunksCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.SearchChunksResponse} [response] SearchChunksResponse
             */

            /**
             * Calls SearchChunks.
             * @function searchChunks
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.ISearchChunksRequest} request SearchChunksRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.SearchChunksCallback} callback Node-style callback called with the error, if any, and SearchChunksResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.searchChunks = function searchChunks(request, callback) {
                return this.rpcCall(searchChunks, $root.yorha.retrieval.SearchChunksRequest, $root.yorha.retrieval.SearchChunksResponse, request, callback);
            }, "name", { value: "SearchChunks" });

            /**
             * Calls SearchChunks.
             * @function searchChunks
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.ISearchChunksRequest} request SearchChunksRequest message or plain object
             * @returns {Promise<yorha.retrieval.SearchChunksResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#getClusterSummary}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef GetClusterSummaryCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.ClusterSummaryResponse} [response] ClusterSummaryResponse
             */

            /**
             * Calls GetClusterSummary.
             * @function getClusterSummary
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IClusterSummaryRequest} request ClusterSummaryRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.GetClusterSummaryCallback} callback Node-style callback called with the error, if any, and ClusterSummaryResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.getClusterSummary = function getClusterSummary(request, callback) {
                return this.rpcCall(getClusterSummary, $root.yorha.retrieval.ClusterSummaryRequest, $root.yorha.retrieval.ClusterSummaryResponse, request, callback);
            }, "name", { value: "GetClusterSummary" });

            /**
             * Calls GetClusterSummary.
             * @function getClusterSummary
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IClusterSummaryRequest} request ClusterSummaryRequest message or plain object
             * @returns {Promise<yorha.retrieval.ClusterSummaryResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#expandAstNeighbors}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef ExpandAstNeighborsCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.AstExpansionResponse} [response] AstExpansionResponse
             */

            /**
             * Calls ExpandAstNeighbors.
             * @function expandAstNeighbors
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IAstExpansionRequest} request AstExpansionRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.ExpandAstNeighborsCallback} callback Node-style callback called with the error, if any, and AstExpansionResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.expandAstNeighbors = function expandAstNeighbors(request, callback) {
                return this.rpcCall(expandAstNeighbors, $root.yorha.retrieval.AstExpansionRequest, $root.yorha.retrieval.AstExpansionResponse, request, callback);
            }, "name", { value: "ExpandAstNeighbors" });

            /**
             * Calls ExpandAstNeighbors.
             * @function expandAstNeighbors
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IAstExpansionRequest} request AstExpansionRequest message or plain object
             * @returns {Promise<yorha.retrieval.AstExpansionResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#getSemanticAstPackets}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef GetSemanticAstPacketsCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.SemanticAstPacketResponse} [response] SemanticAstPacketResponse
             */

            /**
             * Calls GetSemanticAstPackets.
             * @function getSemanticAstPackets
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.ISemanticAstPacketRequest} request SemanticAstPacketRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.GetSemanticAstPacketsCallback} callback Node-style callback called with the error, if any, and SemanticAstPacketResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.getSemanticAstPackets = function getSemanticAstPackets(request, callback) {
                return this.rpcCall(getSemanticAstPackets, $root.yorha.retrieval.SemanticAstPacketRequest, $root.yorha.retrieval.SemanticAstPacketResponse, request, callback);
            }, "name", { value: "GetSemanticAstPackets" });

            /**
             * Calls GetSemanticAstPackets.
             * @function getSemanticAstPackets
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.ISemanticAstPacketRequest} request SemanticAstPacketRequest message or plain object
             * @returns {Promise<yorha.retrieval.SemanticAstPacketResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#getPacketRegistry}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef GetPacketRegistryCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.PacketRegistryResponse} [response] PacketRegistryResponse
             */

            /**
             * Calls GetPacketRegistry.
             * @function getPacketRegistry
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IPacketRegistryRequest} request PacketRegistryRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.GetPacketRegistryCallback} callback Node-style callback called with the error, if any, and PacketRegistryResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.getPacketRegistry = function getPacketRegistry(request, callback) {
                return this.rpcCall(getPacketRegistry, $root.yorha.retrieval.PacketRegistryRequest, $root.yorha.retrieval.PacketRegistryResponse, request, callback);
            }, "name", { value: "GetPacketRegistry" });

            /**
             * Calls GetPacketRegistry.
             * @function getPacketRegistry
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IPacketRegistryRequest} request PacketRegistryRequest message or plain object
             * @returns {Promise<yorha.retrieval.PacketRegistryResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#getTopologyContext}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef GetTopologyContextCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.TopologyResponse} [response] TopologyResponse
             */

            /**
             * Calls GetTopologyContext.
             * @function getTopologyContext
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.ITopologyRequest} request TopologyRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.GetTopologyContextCallback} callback Node-style callback called with the error, if any, and TopologyResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.getTopologyContext = function getTopologyContext(request, callback) {
                return this.rpcCall(getTopologyContext, $root.yorha.retrieval.TopologyRequest, $root.yorha.retrieval.TopologyResponse, request, callback);
            }, "name", { value: "GetTopologyContext" });

            /**
             * Calls GetTopologyContext.
             * @function getTopologyContext
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.ITopologyRequest} request TopologyRequest message or plain object
             * @returns {Promise<yorha.retrieval.TopologyResponse>} Promise
             * @variation 2
             */

            /**
             * Callback as used by {@link yorha.retrieval.RetrievalService#getResearchContext}.
             * @memberof yorha.retrieval.RetrievalService
             * @typedef GetResearchContextCallback
             * @type {function}
             * @param {Error|null} error Error, if any
             * @param {yorha.retrieval.ResearchContextResponse} [response] ResearchContextResponse
             */

            /**
             * Calls GetResearchContext.
             * @function getResearchContext
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IResearchContextRequest} request ResearchContextRequest message or plain object
             * @param {yorha.retrieval.RetrievalService.GetResearchContextCallback} callback Node-style callback called with the error, if any, and ResearchContextResponse
             * @returns {undefined}
             * @variation 1
             */
            Object.defineProperty(RetrievalService.prototype.getResearchContext = function getResearchContext(request, callback) {
                return this.rpcCall(getResearchContext, $root.yorha.retrieval.ResearchContextRequest, $root.yorha.retrieval.ResearchContextResponse, request, callback);
            }, "name", { value: "GetResearchContext" });

            /**
             * Calls GetResearchContext.
             * @function getResearchContext
             * @memberof yorha.retrieval.RetrievalService
             * @instance
             * @param {yorha.retrieval.IResearchContextRequest} request ResearchContextRequest message or plain object
             * @returns {Promise<yorha.retrieval.ResearchContextResponse>} Promise
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
             * @property {yorha.shared.IRunIds|null} [ids] EvidenceSearchRequest ids
             * @property {string|null} [query] EvidenceSearchRequest query
             * @property {string|null} [caseId] EvidenceSearchRequest caseId
             * @property {number|null} [limit] EvidenceSearchRequest limit
             * @property {string|null} [jurisdiction] EvidenceSearchRequest jurisdiction
             * @property {yorha.retrieval.IGraphHopPolicy|null} [hop] EvidenceSearchRequest hop
             * @property {yorha.retrieval.IPrefilterPolicy|null} [prefilter] EvidenceSearchRequest prefilter
             * @property {yorha.retrieval.IRankPolicy|null} [rank] EvidenceSearchRequest rank
             * @property {Array.<number>|null} [queryEmbedding] EvidenceSearchRequest queryEmbedding
             * @property {boolean|null} [includeDebug] EvidenceSearchRequest includeDebug
             * @property {yorha.shared.IAtlasRequestContextV2|null} [atlasContext] EvidenceSearchRequest atlasContext
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EvidenceSearchRequest ids.
             * @member {yorha.shared.IRunIds|null|undefined} ids
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.ids = null;

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
             * EvidenceSearchRequest atlasContext.
             * @member {yorha.shared.IAtlasRequestContextV2|null|undefined} atlasContext
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             */
            EvidenceSearchRequest.prototype.atlasContext = null;

            /**
             * Creates a new EvidenceSearchRequest instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @static
             * @param {yorha.retrieval.IEvidenceSearchRequest=} [properties] Properties to set
             * @returns {yorha.retrieval.EvidenceSearchRequest} EvidenceSearchRequest instance
             */
            EvidenceSearchRequest.create = function create(properties) {
                return new EvidenceSearchRequest(properties);
            };

            /**
             * Encodes the specified EvidenceSearchRequest message. Does not implicitly {@link yorha.retrieval.EvidenceSearchRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @static
             * @param {yorha.retrieval.IEvidenceSearchRequest} message EvidenceSearchRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EvidenceSearchRequest.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.query != null && Object.hasOwnProperty.call(message, "query"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.query);
                if (message.caseId != null && Object.hasOwnProperty.call(message, "caseId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.caseId);
                if (message.limit != null && Object.hasOwnProperty.call(message, "limit"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.limit);
                if (message.jurisdiction != null && Object.hasOwnProperty.call(message, "jurisdiction"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.jurisdiction);
                if (message.hop != null && Object.hasOwnProperty.call(message, "hop"))
                    $root.yorha.retrieval.GraphHopPolicy.encode(message.hop, writer.uint32(/* id 5, wireType 2 =*/42).fork(), q + 1).ldelim();
                if (message.prefilter != null && Object.hasOwnProperty.call(message, "prefilter"))
                    $root.yorha.retrieval.PrefilterPolicy.encode(message.prefilter, writer.uint32(/* id 6, wireType 2 =*/50).fork(), q + 1).ldelim();
                if (message.rank != null && Object.hasOwnProperty.call(message, "rank"))
                    $root.yorha.retrieval.RankPolicy.encode(message.rank, writer.uint32(/* id 7, wireType 2 =*/58).fork(), q + 1).ldelim();
                if (message.queryEmbedding != null && message.queryEmbedding.length) {
                    writer.uint32(/* id 8, wireType 2 =*/66).fork();
                    for (let i = 0; i < message.queryEmbedding.length; ++i)
                        writer.float(message.queryEmbedding[i]);
                    writer.ldelim();
                }
                if (message.includeDebug != null && Object.hasOwnProperty.call(message, "includeDebug"))
                    writer.uint32(/* id 9, wireType 0 =*/72).bool(message.includeDebug);
                if (message.ids != null && Object.hasOwnProperty.call(message, "ids"))
                    $root.yorha.shared.RunIds.encode(message.ids, writer.uint32(/* id 10, wireType 2 =*/82).fork(), q + 1).ldelim();
                if (message.atlasContext != null && Object.hasOwnProperty.call(message, "atlasContext"))
                    $root.yorha.shared.AtlasRequestContextV2.encode(message.atlasContext, writer.uint32(/* id 11, wireType 2 =*/90).fork(), q + 1).ldelim();
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
            EvidenceSearchRequest.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.EvidenceSearchRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 10: {
                            message.ids = $root.yorha.shared.RunIds.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
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
                            message.hop = $root.yorha.retrieval.GraphHopPolicy.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 6: {
                            message.prefilter = $root.yorha.retrieval.PrefilterPolicy.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 7: {
                            message.rank = $root.yorha.retrieval.RankPolicy.decode(reader, reader.uint32(), undefined, long + 1);
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
                    case 11: {
                            message.atlasContext = $root.yorha.shared.AtlasRequestContextV2.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Verifies an EvidenceSearchRequest message.
             * @function verify
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            EvidenceSearchRequest.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.ids != null && message.hasOwnProperty("ids")) {
                    let error = $root.yorha.shared.RunIds.verify(message.ids, long + 1);
                    if (error)
                        return "ids." + error;
                }
                if (message.query != null && message.hasOwnProperty("query"))
                    if (!$util.isString(message.query))
                        return "query: string expected";
                if (message.caseId != null && message.hasOwnProperty("caseId"))
                    if (!$util.isString(message.caseId))
                        return "caseId: string expected";
                if (message.limit != null && message.hasOwnProperty("limit"))
                    if (!$util.isInteger(message.limit))
                        return "limit: integer expected";
                if (message.jurisdiction != null && message.hasOwnProperty("jurisdiction"))
                    if (!$util.isString(message.jurisdiction))
                        return "jurisdiction: string expected";
                if (message.hop != null && message.hasOwnProperty("hop")) {
                    let error = $root.yorha.retrieval.GraphHopPolicy.verify(message.hop, long + 1);
                    if (error)
                        return "hop." + error;
                }
                if (message.prefilter != null && message.hasOwnProperty("prefilter")) {
                    let error = $root.yorha.retrieval.PrefilterPolicy.verify(message.prefilter, long + 1);
                    if (error)
                        return "prefilter." + error;
                }
                if (message.rank != null && message.hasOwnProperty("rank")) {
                    let error = $root.yorha.retrieval.RankPolicy.verify(message.rank, long + 1);
                    if (error)
                        return "rank." + error;
                }
                if (message.queryEmbedding != null && message.hasOwnProperty("queryEmbedding")) {
                    if (!Array.isArray(message.queryEmbedding))
                        return "queryEmbedding: array expected";
                    for (let i = 0; i < message.queryEmbedding.length; ++i)
                        if (typeof message.queryEmbedding[i] !== "number")
                            return "queryEmbedding: number[] expected";
                }
                if (message.includeDebug != null && message.hasOwnProperty("includeDebug"))
                    if (typeof message.includeDebug !== "boolean")
                        return "includeDebug: boolean expected";
                if (message.atlasContext != null && message.hasOwnProperty("atlasContext")) {
                    let error = $root.yorha.shared.AtlasRequestContextV2.verify(message.atlasContext, long + 1);
                    if (error)
                        return "atlasContext." + error;
                }
                return null;
            };

            /**
             * Creates an EvidenceSearchRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.EvidenceSearchRequest} EvidenceSearchRequest
             */
            EvidenceSearchRequest.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.EvidenceSearchRequest)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.EvidenceSearchRequest();
                if (object.ids != null) {
                    if (typeof object.ids !== "object")
                        throw TypeError(".yorha.retrieval.EvidenceSearchRequest.ids: object expected");
                    message.ids = $root.yorha.shared.RunIds.fromObject(object.ids, long + 1);
                }
                if (object.query != null)
                    message.query = String(object.query);
                if (object.caseId != null)
                    message.caseId = String(object.caseId);
                if (object.limit != null)
                    message.limit = object.limit | 0;
                if (object.jurisdiction != null)
                    message.jurisdiction = String(object.jurisdiction);
                if (object.hop != null) {
                    if (typeof object.hop !== "object")
                        throw TypeError(".yorha.retrieval.EvidenceSearchRequest.hop: object expected");
                    message.hop = $root.yorha.retrieval.GraphHopPolicy.fromObject(object.hop, long + 1);
                }
                if (object.prefilter != null) {
                    if (typeof object.prefilter !== "object")
                        throw TypeError(".yorha.retrieval.EvidenceSearchRequest.prefilter: object expected");
                    message.prefilter = $root.yorha.retrieval.PrefilterPolicy.fromObject(object.prefilter, long + 1);
                }
                if (object.rank != null) {
                    if (typeof object.rank !== "object")
                        throw TypeError(".yorha.retrieval.EvidenceSearchRequest.rank: object expected");
                    message.rank = $root.yorha.retrieval.RankPolicy.fromObject(object.rank, long + 1);
                }
                if (object.queryEmbedding) {
                    if (!Array.isArray(object.queryEmbedding))
                        throw TypeError(".yorha.retrieval.EvidenceSearchRequest.queryEmbedding: array expected");
                    message.queryEmbedding = [];
                    for (let i = 0; i < object.queryEmbedding.length; ++i)
                        message.queryEmbedding[i] = Number(object.queryEmbedding[i]);
                }
                if (object.includeDebug != null)
                    message.includeDebug = Boolean(object.includeDebug);
                if (object.atlasContext != null) {
                    if (typeof object.atlasContext !== "object")
                        throw TypeError(".yorha.retrieval.EvidenceSearchRequest.atlasContext: object expected");
                    message.atlasContext = $root.yorha.shared.AtlasRequestContextV2.fromObject(object.atlasContext, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from an EvidenceSearchRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @static
             * @param {yorha.retrieval.EvidenceSearchRequest} message EvidenceSearchRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            EvidenceSearchRequest.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.queryEmbedding = [];
                if (options.defaults) {
                    object.query = "";
                    object.caseId = "";
                    object.limit = 0;
                    object.jurisdiction = "";
                    object.hop = null;
                    object.prefilter = null;
                    object.rank = null;
                    object.includeDebug = false;
                    object.ids = null;
                    object.atlasContext = null;
                }
                if (message.query != null && message.hasOwnProperty("query"))
                    object.query = message.query;
                if (message.caseId != null && message.hasOwnProperty("caseId"))
                    object.caseId = message.caseId;
                if (message.limit != null && message.hasOwnProperty("limit"))
                    object.limit = message.limit;
                if (message.jurisdiction != null && message.hasOwnProperty("jurisdiction"))
                    object.jurisdiction = message.jurisdiction;
                if (message.hop != null && message.hasOwnProperty("hop"))
                    object.hop = $root.yorha.retrieval.GraphHopPolicy.toObject(message.hop, options, q + 1);
                if (message.prefilter != null && message.hasOwnProperty("prefilter"))
                    object.prefilter = $root.yorha.retrieval.PrefilterPolicy.toObject(message.prefilter, options, q + 1);
                if (message.rank != null && message.hasOwnProperty("rank"))
                    object.rank = $root.yorha.retrieval.RankPolicy.toObject(message.rank, options, q + 1);
                if (message.queryEmbedding && message.queryEmbedding.length) {
                    object.queryEmbedding = [];
                    for (let j = 0; j < message.queryEmbedding.length; ++j)
                        object.queryEmbedding[j] = options.json && !isFinite(message.queryEmbedding[j]) ? String(message.queryEmbedding[j]) : message.queryEmbedding[j];
                }
                if (message.includeDebug != null && message.hasOwnProperty("includeDebug"))
                    object.includeDebug = message.includeDebug;
                if (message.ids != null && message.hasOwnProperty("ids"))
                    object.ids = $root.yorha.shared.RunIds.toObject(message.ids, options, q + 1);
                if (message.atlasContext != null && message.hasOwnProperty("atlasContext"))
                    object.atlasContext = $root.yorha.shared.AtlasRequestContextV2.toObject(message.atlasContext, options, q + 1);
                return object;
            };

            /**
             * Converts this EvidenceSearchRequest to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.EvidenceSearchRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            EvidenceSearchRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
             * @property {yorha.shared.IAtlasToolReceiptV2|null} [receipt] EvidenceSearchResponse receipt
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * EvidenceSearchResponse receipt.
             * @member {yorha.shared.IAtlasToolReceiptV2|null|undefined} receipt
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @instance
             */
            EvidenceSearchResponse.prototype.receipt = null;

            /**
             * Creates a new EvidenceSearchResponse instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @static
             * @param {yorha.retrieval.IEvidenceSearchResponse=} [properties] Properties to set
             * @returns {yorha.retrieval.EvidenceSearchResponse} EvidenceSearchResponse instance
             */
            EvidenceSearchResponse.create = function create(properties) {
                return new EvidenceSearchResponse(properties);
            };

            /**
             * Encodes the specified EvidenceSearchResponse message. Does not implicitly {@link yorha.retrieval.EvidenceSearchResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @static
             * @param {yorha.retrieval.IEvidenceSearchResponse} message EvidenceSearchResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EvidenceSearchResponse.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.results != null && message.results.length)
                    for (let i = 0; i < message.results.length; ++i)
                        $root.yorha.retrieval.SearchResult.encode(message.results[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.bundles != null && message.bundles.length)
                    for (let i = 0; i < message.bundles.length; ++i)
                        $root.yorha.retrieval.ContextBundle.encode(message.bundles[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), q + 1).ldelim();
                if (message.timing != null && Object.hasOwnProperty.call(message, "timing"))
                    $root.yorha.retrieval.SearchTiming.encode(message.timing, writer.uint32(/* id 3, wireType 2 =*/26).fork(), q + 1).ldelim();
                if (message.cacheSource != null && Object.hasOwnProperty.call(message, "cacheSource"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.cacheSource);
                if (message.debugJson != null && Object.hasOwnProperty.call(message, "debugJson"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.debugJson);
                if (message.receipt != null && Object.hasOwnProperty.call(message, "receipt"))
                    $root.yorha.shared.AtlasToolReceiptV2.encode(message.receipt, writer.uint32(/* id 6, wireType 2 =*/50).fork(), q + 1).ldelim();
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
            EvidenceSearchResponse.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.EvidenceSearchResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.results && message.results.length))
                                message.results = [];
                            message.results.push($root.yorha.retrieval.SearchResult.decode(reader, reader.uint32(), undefined, long + 1));
                            break;
                        }
                    case 2: {
                            if (!(message.bundles && message.bundles.length))
                                message.bundles = [];
                            message.bundles.push($root.yorha.retrieval.ContextBundle.decode(reader, reader.uint32(), undefined, long + 1));
                            break;
                        }
                    case 3: {
                            message.timing = $root.yorha.retrieval.SearchTiming.decode(reader, reader.uint32(), undefined, long + 1);
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
                    case 6: {
                            message.receipt = $root.yorha.shared.AtlasToolReceiptV2.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Verifies an EvidenceSearchResponse message.
             * @function verify
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            EvidenceSearchResponse.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.results != null && message.hasOwnProperty("results")) {
                    if (!Array.isArray(message.results))
                        return "results: array expected";
                    for (let i = 0; i < message.results.length; ++i) {
                        let error = $root.yorha.retrieval.SearchResult.verify(message.results[i], long + 1);
                        if (error)
                            return "results." + error;
                    }
                }
                if (message.bundles != null && message.hasOwnProperty("bundles")) {
                    if (!Array.isArray(message.bundles))
                        return "bundles: array expected";
                    for (let i = 0; i < message.bundles.length; ++i) {
                        let error = $root.yorha.retrieval.ContextBundle.verify(message.bundles[i], long + 1);
                        if (error)
                            return "bundles." + error;
                    }
                }
                if (message.timing != null && message.hasOwnProperty("timing")) {
                    let error = $root.yorha.retrieval.SearchTiming.verify(message.timing, long + 1);
                    if (error)
                        return "timing." + error;
                }
                if (message.cacheSource != null && message.hasOwnProperty("cacheSource"))
                    if (!$util.isString(message.cacheSource))
                        return "cacheSource: string expected";
                if (message.debugJson != null && message.hasOwnProperty("debugJson"))
                    if (!$util.isString(message.debugJson))
                        return "debugJson: string expected";
                if (message.receipt != null && message.hasOwnProperty("receipt")) {
                    let error = $root.yorha.shared.AtlasToolReceiptV2.verify(message.receipt, long + 1);
                    if (error)
                        return "receipt." + error;
                }
                return null;
            };

            /**
             * Creates an EvidenceSearchResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.EvidenceSearchResponse} EvidenceSearchResponse
             */
            EvidenceSearchResponse.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.EvidenceSearchResponse)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.EvidenceSearchResponse();
                if (object.results) {
                    if (!Array.isArray(object.results))
                        throw TypeError(".yorha.retrieval.EvidenceSearchResponse.results: array expected");
                    message.results = [];
                    for (let i = 0; i < object.results.length; ++i) {
                        if (typeof object.results[i] !== "object")
                            throw TypeError(".yorha.retrieval.EvidenceSearchResponse.results: object expected");
                        message.results[i] = $root.yorha.retrieval.SearchResult.fromObject(object.results[i], long + 1);
                    }
                }
                if (object.bundles) {
                    if (!Array.isArray(object.bundles))
                        throw TypeError(".yorha.retrieval.EvidenceSearchResponse.bundles: array expected");
                    message.bundles = [];
                    for (let i = 0; i < object.bundles.length; ++i) {
                        if (typeof object.bundles[i] !== "object")
                            throw TypeError(".yorha.retrieval.EvidenceSearchResponse.bundles: object expected");
                        message.bundles[i] = $root.yorha.retrieval.ContextBundle.fromObject(object.bundles[i], long + 1);
                    }
                }
                if (object.timing != null) {
                    if (typeof object.timing !== "object")
                        throw TypeError(".yorha.retrieval.EvidenceSearchResponse.timing: object expected");
                    message.timing = $root.yorha.retrieval.SearchTiming.fromObject(object.timing, long + 1);
                }
                if (object.cacheSource != null)
                    message.cacheSource = String(object.cacheSource);
                if (object.debugJson != null)
                    message.debugJson = String(object.debugJson);
                if (object.receipt != null) {
                    if (typeof object.receipt !== "object")
                        throw TypeError(".yorha.retrieval.EvidenceSearchResponse.receipt: object expected");
                    message.receipt = $root.yorha.shared.AtlasToolReceiptV2.fromObject(object.receipt, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from an EvidenceSearchResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @static
             * @param {yorha.retrieval.EvidenceSearchResponse} message EvidenceSearchResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            EvidenceSearchResponse.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.results = [];
                    object.bundles = [];
                }
                if (options.defaults) {
                    object.timing = null;
                    object.cacheSource = "";
                    object.debugJson = "";
                    object.receipt = null;
                }
                if (message.results && message.results.length) {
                    object.results = [];
                    for (let j = 0; j < message.results.length; ++j)
                        object.results[j] = $root.yorha.retrieval.SearchResult.toObject(message.results[j], options, q + 1);
                }
                if (message.bundles && message.bundles.length) {
                    object.bundles = [];
                    for (let j = 0; j < message.bundles.length; ++j)
                        object.bundles[j] = $root.yorha.retrieval.ContextBundle.toObject(message.bundles[j], options, q + 1);
                }
                if (message.timing != null && message.hasOwnProperty("timing"))
                    object.timing = $root.yorha.retrieval.SearchTiming.toObject(message.timing, options, q + 1);
                if (message.cacheSource != null && message.hasOwnProperty("cacheSource"))
                    object.cacheSource = message.cacheSource;
                if (message.debugJson != null && message.hasOwnProperty("debugJson"))
                    object.debugJson = message.debugJson;
                if (message.receipt != null && message.hasOwnProperty("receipt"))
                    object.receipt = $root.yorha.shared.AtlasToolReceiptV2.toObject(message.receipt, options, q + 1);
                return object;
            };

            /**
             * Converts this EvidenceSearchResponse to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.EvidenceSearchResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            EvidenceSearchResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new EvidenceBundleEvent instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @static
             * @param {yorha.retrieval.IEvidenceBundleEvent=} [properties] Properties to set
             * @returns {yorha.retrieval.EvidenceBundleEvent} EvidenceBundleEvent instance
             */
            EvidenceBundleEvent.create = function create(properties) {
                return new EvidenceBundleEvent(properties);
            };

            /**
             * Encodes the specified EvidenceBundleEvent message. Does not implicitly {@link yorha.retrieval.EvidenceBundleEvent.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @static
             * @param {yorha.retrieval.IEvidenceBundleEvent} message EvidenceBundleEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EvidenceBundleEvent.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.bundle != null && Object.hasOwnProperty.call(message, "bundle"))
                    $root.yorha.retrieval.ContextBundle.encode(message.bundle, writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.progress != null && Object.hasOwnProperty.call(message, "progress"))
                    $root.yorha.retrieval.RetrievalProgress.encode(message.progress, writer.uint32(/* id 2, wireType 2 =*/18).fork(), q + 1).ldelim();
                if (message.error != null && Object.hasOwnProperty.call(message, "error"))
                    $root.yorha.retrieval.RetrievalError.encode(message.error, writer.uint32(/* id 3, wireType 2 =*/26).fork(), q + 1).ldelim();
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
            EvidenceBundleEvent.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.EvidenceBundleEvent();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.bundle = $root.yorha.retrieval.ContextBundle.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 2: {
                            message.progress = $root.yorha.retrieval.RetrievalProgress.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 3: {
                            message.error = $root.yorha.retrieval.RetrievalError.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Verifies an EvidenceBundleEvent message.
             * @function verify
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            EvidenceBundleEvent.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                let properties = {};
                if (message.bundle != null && message.hasOwnProperty("bundle")) {
                    properties.event = 1;
                    {
                        let error = $root.yorha.retrieval.ContextBundle.verify(message.bundle, long + 1);
                        if (error)
                            return "bundle." + error;
                    }
                }
                if (message.progress != null && message.hasOwnProperty("progress")) {
                    if (properties.event === 1)
                        return "event: multiple values";
                    properties.event = 1;
                    {
                        let error = $root.yorha.retrieval.RetrievalProgress.verify(message.progress, long + 1);
                        if (error)
                            return "progress." + error;
                    }
                }
                if (message.error != null && message.hasOwnProperty("error")) {
                    if (properties.event === 1)
                        return "event: multiple values";
                    properties.event = 1;
                    {
                        let error = $root.yorha.retrieval.RetrievalError.verify(message.error, long + 1);
                        if (error)
                            return "error." + error;
                    }
                }
                return null;
            };

            /**
             * Creates an EvidenceBundleEvent message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.EvidenceBundleEvent} EvidenceBundleEvent
             */
            EvidenceBundleEvent.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.EvidenceBundleEvent)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.EvidenceBundleEvent();
                if (object.bundle != null) {
                    if (typeof object.bundle !== "object")
                        throw TypeError(".yorha.retrieval.EvidenceBundleEvent.bundle: object expected");
                    message.bundle = $root.yorha.retrieval.ContextBundle.fromObject(object.bundle, long + 1);
                }
                if (object.progress != null) {
                    if (typeof object.progress !== "object")
                        throw TypeError(".yorha.retrieval.EvidenceBundleEvent.progress: object expected");
                    message.progress = $root.yorha.retrieval.RetrievalProgress.fromObject(object.progress, long + 1);
                }
                if (object.error != null) {
                    if (typeof object.error !== "object")
                        throw TypeError(".yorha.retrieval.EvidenceBundleEvent.error: object expected");
                    message.error = $root.yorha.retrieval.RetrievalError.fromObject(object.error, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from an EvidenceBundleEvent message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @static
             * @param {yorha.retrieval.EvidenceBundleEvent} message EvidenceBundleEvent
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            EvidenceBundleEvent.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (message.bundle != null && message.hasOwnProperty("bundle")) {
                    object.bundle = $root.yorha.retrieval.ContextBundle.toObject(message.bundle, options, q + 1);
                    if (options.oneofs)
                        object.event = "bundle";
                }
                if (message.progress != null && message.hasOwnProperty("progress")) {
                    object.progress = $root.yorha.retrieval.RetrievalProgress.toObject(message.progress, options, q + 1);
                    if (options.oneofs)
                        object.event = "progress";
                }
                if (message.error != null && message.hasOwnProperty("error")) {
                    object.error = $root.yorha.retrieval.RetrievalError.toObject(message.error, options, q + 1);
                    if (options.oneofs)
                        object.event = "error";
                }
                return object;
            };

            /**
             * Converts this EvidenceBundleEvent to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.EvidenceBundleEvent
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            EvidenceBundleEvent.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new SearchResult instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.SearchResult
             * @static
             * @param {yorha.retrieval.ISearchResult=} [properties] Properties to set
             * @returns {yorha.retrieval.SearchResult} SearchResult instance
             */
            SearchResult.create = function create(properties) {
                return new SearchResult(properties);
            };

            /**
             * Encodes the specified SearchResult message. Does not implicitly {@link yorha.retrieval.SearchResult.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.SearchResult
             * @static
             * @param {yorha.retrieval.ISearchResult} message SearchResult message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchResult.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.evidenceId != null && Object.hasOwnProperty.call(message, "evidenceId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.evidenceId);
                if (message.chunkIndex != null && Object.hasOwnProperty.call(message, "chunkIndex"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.chunkIndex);
                if (message.content != null && Object.hasOwnProperty.call(message, "content"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.content);
                if (message.score != null && Object.hasOwnProperty.call(message, "score"))
                    writer.uint32(/* id 4, wireType 5 =*/37).float(message.score);
                if (message.metadata != null && Object.hasOwnProperty.call(message, "metadata"))
                    $root.yorha.retrieval.ChunkMetadata.encode(message.metadata, writer.uint32(/* id 5, wireType 2 =*/42).fork(), q + 1).ldelim();
                if (message.rerank != null && Object.hasOwnProperty.call(message, "rerank"))
                    $root.yorha.retrieval.RerankExplain.encode(message.rerank, writer.uint32(/* id 6, wireType 2 =*/50).fork(), q + 1).ldelim();
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
            SearchResult.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                            message.metadata = $root.yorha.retrieval.ChunkMetadata.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 6: {
                            message.rerank = $root.yorha.retrieval.RerankExplain.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Verifies a SearchResult message.
             * @function verify
             * @memberof yorha.retrieval.SearchResult
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SearchResult.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.evidenceId != null && message.hasOwnProperty("evidenceId"))
                    if (!$util.isString(message.evidenceId))
                        return "evidenceId: string expected";
                if (message.chunkIndex != null && message.hasOwnProperty("chunkIndex"))
                    if (!$util.isInteger(message.chunkIndex))
                        return "chunkIndex: integer expected";
                if (message.content != null && message.hasOwnProperty("content"))
                    if (!$util.isString(message.content))
                        return "content: string expected";
                if (message.score != null && message.hasOwnProperty("score"))
                    if (typeof message.score !== "number")
                        return "score: number expected";
                if (message.metadata != null && message.hasOwnProperty("metadata")) {
                    let error = $root.yorha.retrieval.ChunkMetadata.verify(message.metadata, long + 1);
                    if (error)
                        return "metadata." + error;
                }
                if (message.rerank != null && message.hasOwnProperty("rerank")) {
                    let error = $root.yorha.retrieval.RerankExplain.verify(message.rerank, long + 1);
                    if (error)
                        return "rerank." + error;
                }
                return null;
            };

            /**
             * Creates a SearchResult message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.SearchResult
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.SearchResult} SearchResult
             */
            SearchResult.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.SearchResult)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.SearchResult();
                if (object.evidenceId != null)
                    message.evidenceId = String(object.evidenceId);
                if (object.chunkIndex != null)
                    message.chunkIndex = object.chunkIndex | 0;
                if (object.content != null)
                    message.content = String(object.content);
                if (object.score != null)
                    message.score = Number(object.score);
                if (object.metadata != null) {
                    if (typeof object.metadata !== "object")
                        throw TypeError(".yorha.retrieval.SearchResult.metadata: object expected");
                    message.metadata = $root.yorha.retrieval.ChunkMetadata.fromObject(object.metadata, long + 1);
                }
                if (object.rerank != null) {
                    if (typeof object.rerank !== "object")
                        throw TypeError(".yorha.retrieval.SearchResult.rerank: object expected");
                    message.rerank = $root.yorha.retrieval.RerankExplain.fromObject(object.rerank, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a SearchResult message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.SearchResult
             * @static
             * @param {yorha.retrieval.SearchResult} message SearchResult
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SearchResult.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.evidenceId = "";
                    object.chunkIndex = 0;
                    object.content = "";
                    object.score = 0;
                    object.metadata = null;
                    object.rerank = null;
                }
                if (message.evidenceId != null && message.hasOwnProperty("evidenceId"))
                    object.evidenceId = message.evidenceId;
                if (message.chunkIndex != null && message.hasOwnProperty("chunkIndex"))
                    object.chunkIndex = message.chunkIndex;
                if (message.content != null && message.hasOwnProperty("content"))
                    object.content = message.content;
                if (message.score != null && message.hasOwnProperty("score"))
                    object.score = options.json && !isFinite(message.score) ? String(message.score) : message.score;
                if (message.metadata != null && message.hasOwnProperty("metadata"))
                    object.metadata = $root.yorha.retrieval.ChunkMetadata.toObject(message.metadata, options, q + 1);
                if (message.rerank != null && message.hasOwnProperty("rerank"))
                    object.rerank = $root.yorha.retrieval.RerankExplain.toObject(message.rerank, options, q + 1);
                return object;
            };

            /**
             * Converts this SearchResult to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.SearchResult
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SearchResult.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new ChunkMetadata instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.ChunkMetadata
             * @static
             * @param {yorha.retrieval.IChunkMetadata=} [properties] Properties to set
             * @returns {yorha.retrieval.ChunkMetadata} ChunkMetadata instance
             */
            ChunkMetadata.create = function create(properties) {
                return new ChunkMetadata(properties);
            };

            /**
             * Encodes the specified ChunkMetadata message. Does not implicitly {@link yorha.retrieval.ChunkMetadata.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.ChunkMetadata
             * @static
             * @param {yorha.retrieval.IChunkMetadata} message ChunkMetadata message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ChunkMetadata.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
            ChunkMetadata.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a ChunkMetadata message.
             * @function verify
             * @memberof yorha.retrieval.ChunkMetadata
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ChunkMetadata.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.sectionPath != null && message.hasOwnProperty("sectionPath")) {
                    if (!Array.isArray(message.sectionPath))
                        return "sectionPath: array expected";
                    for (let i = 0; i < message.sectionPath.length; ++i)
                        if (!$util.isString(message.sectionPath[i]))
                            return "sectionPath: string[] expected";
                }
                if (message.heading != null && message.hasOwnProperty("heading"))
                    if (!$util.isString(message.heading))
                        return "heading: string expected";
                if (message.citations != null && message.hasOwnProperty("citations")) {
                    if (!Array.isArray(message.citations))
                        return "citations: array expected";
                    for (let i = 0; i < message.citations.length; ++i)
                        if (!$util.isString(message.citations[i]))
                            return "citations: string[] expected";
                }
                if (message.fileName != null && message.hasOwnProperty("fileName"))
                    if (!$util.isString(message.fileName))
                        return "fileName: string expected";
                if (message.tokenCount != null && message.hasOwnProperty("tokenCount"))
                    if (!$util.isInteger(message.tokenCount))
                        return "tokenCount: integer expected";
                if (message.extractionMethod != null && message.hasOwnProperty("extractionMethod"))
                    if (!$util.isString(message.extractionMethod))
                        return "extractionMethod: string expected";
                if (message.jurisdiction != null && message.hasOwnProperty("jurisdiction"))
                    if (!$util.isString(message.jurisdiction))
                        return "jurisdiction: string expected";
                return null;
            };

            /**
             * Creates a ChunkMetadata message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.ChunkMetadata
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.ChunkMetadata} ChunkMetadata
             */
            ChunkMetadata.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.ChunkMetadata)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.ChunkMetadata();
                if (object.sectionPath) {
                    if (!Array.isArray(object.sectionPath))
                        throw TypeError(".yorha.retrieval.ChunkMetadata.sectionPath: array expected");
                    message.sectionPath = [];
                    for (let i = 0; i < object.sectionPath.length; ++i)
                        message.sectionPath[i] = String(object.sectionPath[i]);
                }
                if (object.heading != null)
                    message.heading = String(object.heading);
                if (object.citations) {
                    if (!Array.isArray(object.citations))
                        throw TypeError(".yorha.retrieval.ChunkMetadata.citations: array expected");
                    message.citations = [];
                    for (let i = 0; i < object.citations.length; ++i)
                        message.citations[i] = String(object.citations[i]);
                }
                if (object.fileName != null)
                    message.fileName = String(object.fileName);
                if (object.tokenCount != null)
                    message.tokenCount = object.tokenCount | 0;
                if (object.extractionMethod != null)
                    message.extractionMethod = String(object.extractionMethod);
                if (object.jurisdiction != null)
                    message.jurisdiction = String(object.jurisdiction);
                return message;
            };

            /**
             * Creates a plain object from a ChunkMetadata message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.ChunkMetadata
             * @static
             * @param {yorha.retrieval.ChunkMetadata} message ChunkMetadata
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ChunkMetadata.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.sectionPath = [];
                    object.citations = [];
                }
                if (options.defaults) {
                    object.heading = "";
                    object.fileName = "";
                    object.tokenCount = 0;
                    object.extractionMethod = "";
                    object.jurisdiction = "";
                }
                if (message.sectionPath && message.sectionPath.length) {
                    object.sectionPath = [];
                    for (let j = 0; j < message.sectionPath.length; ++j)
                        object.sectionPath[j] = message.sectionPath[j];
                }
                if (message.heading != null && message.hasOwnProperty("heading"))
                    object.heading = message.heading;
                if (message.citations && message.citations.length) {
                    object.citations = [];
                    for (let j = 0; j < message.citations.length; ++j)
                        object.citations[j] = message.citations[j];
                }
                if (message.fileName != null && message.hasOwnProperty("fileName"))
                    object.fileName = message.fileName;
                if (message.tokenCount != null && message.hasOwnProperty("tokenCount"))
                    object.tokenCount = message.tokenCount;
                if (message.extractionMethod != null && message.hasOwnProperty("extractionMethod"))
                    object.extractionMethod = message.extractionMethod;
                if (message.jurisdiction != null && message.hasOwnProperty("jurisdiction"))
                    object.jurisdiction = message.jurisdiction;
                return object;
            };

            /**
             * Converts this ChunkMetadata to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.ChunkMetadata
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ChunkMetadata.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new RerankExplain instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.RerankExplain
             * @static
             * @param {yorha.retrieval.IRerankExplain=} [properties] Properties to set
             * @returns {yorha.retrieval.RerankExplain} RerankExplain instance
             */
            RerankExplain.create = function create(properties) {
                return new RerankExplain(properties);
            };

            /**
             * Encodes the specified RerankExplain message. Does not implicitly {@link yorha.retrieval.RerankExplain.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RerankExplain
             * @static
             * @param {yorha.retrieval.IRerankExplain} message RerankExplain message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RerankExplain.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
            RerankExplain.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a RerankExplain message.
             * @function verify
             * @memberof yorha.retrieval.RerankExplain
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            RerankExplain.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.cosine != null && message.hasOwnProperty("cosine"))
                    if (typeof message.cosine !== "number")
                        return "cosine: number expected";
                if (message.sharedCitations != null && message.hasOwnProperty("sharedCitations"))
                    if (typeof message.sharedCitations !== "number")
                        return "sharedCitations: number expected";
                if (message.jurisdictionMatch != null && message.hasOwnProperty("jurisdictionMatch"))
                    if (typeof message.jurisdictionMatch !== "number")
                        return "jurisdictionMatch: number expected";
                if (message.sectionProximity != null && message.hasOwnProperty("sectionProximity"))
                    if (typeof message.sectionProximity !== "number")
                        return "sectionProximity: number expected";
                if (message.finalScore != null && message.hasOwnProperty("finalScore"))
                    if (typeof message.finalScore !== "number")
                        return "finalScore: number expected";
                return null;
            };

            /**
             * Creates a RerankExplain message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.RerankExplain
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.RerankExplain} RerankExplain
             */
            RerankExplain.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.RerankExplain)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.RerankExplain();
                if (object.cosine != null)
                    message.cosine = Number(object.cosine);
                if (object.sharedCitations != null)
                    message.sharedCitations = Number(object.sharedCitations);
                if (object.jurisdictionMatch != null)
                    message.jurisdictionMatch = Number(object.jurisdictionMatch);
                if (object.sectionProximity != null)
                    message.sectionProximity = Number(object.sectionProximity);
                if (object.finalScore != null)
                    message.finalScore = Number(object.finalScore);
                return message;
            };

            /**
             * Creates a plain object from a RerankExplain message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.RerankExplain
             * @static
             * @param {yorha.retrieval.RerankExplain} message RerankExplain
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            RerankExplain.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.cosine = 0;
                    object.sharedCitations = 0;
                    object.jurisdictionMatch = 0;
                    object.sectionProximity = 0;
                    object.finalScore = 0;
                }
                if (message.cosine != null && message.hasOwnProperty("cosine"))
                    object.cosine = options.json && !isFinite(message.cosine) ? String(message.cosine) : message.cosine;
                if (message.sharedCitations != null && message.hasOwnProperty("sharedCitations"))
                    object.sharedCitations = options.json && !isFinite(message.sharedCitations) ? String(message.sharedCitations) : message.sharedCitations;
                if (message.jurisdictionMatch != null && message.hasOwnProperty("jurisdictionMatch"))
                    object.jurisdictionMatch = options.json && !isFinite(message.jurisdictionMatch) ? String(message.jurisdictionMatch) : message.jurisdictionMatch;
                if (message.sectionProximity != null && message.hasOwnProperty("sectionProximity"))
                    object.sectionProximity = options.json && !isFinite(message.sectionProximity) ? String(message.sectionProximity) : message.sectionProximity;
                if (message.finalScore != null && message.hasOwnProperty("finalScore"))
                    object.finalScore = options.json && !isFinite(message.finalScore) ? String(message.finalScore) : message.finalScore;
                return object;
            };

            /**
             * Converts this RerankExplain to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.RerankExplain
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            RerankExplain.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new ContextBundle instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.ContextBundle
             * @static
             * @param {yorha.retrieval.IContextBundle=} [properties] Properties to set
             * @returns {yorha.retrieval.ContextBundle} ContextBundle instance
             */
            ContextBundle.create = function create(properties) {
                return new ContextBundle(properties);
            };

            /**
             * Encodes the specified ContextBundle message. Does not implicitly {@link yorha.retrieval.ContextBundle.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.ContextBundle
             * @static
             * @param {yorha.retrieval.IContextBundle} message ContextBundle message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ContextBundle.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.hit != null && Object.hasOwnProperty.call(message, "hit"))
                    $root.yorha.retrieval.SearchResult.encode(message.hit, writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.siblings != null && message.siblings.length)
                    for (let i = 0; i < message.siblings.length; ++i)
                        $root.yorha.retrieval.SearchResult.encode(message.siblings[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), q + 1).ldelim();
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
                        $root.yorha.retrieval.GraphNeighbor.encode(message.graphNeighbors[i], writer.uint32(/* id 6, wireType 2 =*/50).fork(), q + 1).ldelim();
                if (message.documentContext != null && Object.hasOwnProperty.call(message, "documentContext"))
                    $root.yorha.retrieval.DocumentContext.encode(message.documentContext, writer.uint32(/* id 7, wireType 2 =*/58).fork(), q + 1).ldelim();
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
            ContextBundle.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.ContextBundle();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.hit = $root.yorha.retrieval.SearchResult.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 2: {
                            if (!(message.siblings && message.siblings.length))
                                message.siblings = [];
                            message.siblings.push($root.yorha.retrieval.SearchResult.decode(reader, reader.uint32(), undefined, long + 1));
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
                            message.graphNeighbors.push($root.yorha.retrieval.GraphNeighbor.decode(reader, reader.uint32(), undefined, long + 1));
                            break;
                        }
                    case 7: {
                            message.documentContext = $root.yorha.retrieval.DocumentContext.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Verifies a ContextBundle message.
             * @function verify
             * @memberof yorha.retrieval.ContextBundle
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ContextBundle.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.hit != null && message.hasOwnProperty("hit")) {
                    let error = $root.yorha.retrieval.SearchResult.verify(message.hit, long + 1);
                    if (error)
                        return "hit." + error;
                }
                if (message.siblings != null && message.hasOwnProperty("siblings")) {
                    if (!Array.isArray(message.siblings))
                        return "siblings: array expected";
                    for (let i = 0; i < message.siblings.length; ++i) {
                        let error = $root.yorha.retrieval.SearchResult.verify(message.siblings[i], long + 1);
                        if (error)
                            return "siblings." + error;
                    }
                }
                if (message.sectionPath != null && message.hasOwnProperty("sectionPath")) {
                    if (!Array.isArray(message.sectionPath))
                        return "sectionPath: array expected";
                    for (let i = 0; i < message.sectionPath.length; ++i)
                        if (!$util.isString(message.sectionPath[i]))
                            return "sectionPath: string[] expected";
                }
                if (message.heading != null && message.hasOwnProperty("heading"))
                    if (!$util.isString(message.heading))
                        return "heading: string expected";
                if (message.citations != null && message.hasOwnProperty("citations")) {
                    if (!Array.isArray(message.citations))
                        return "citations: array expected";
                    for (let i = 0; i < message.citations.length; ++i)
                        if (!$util.isString(message.citations[i]))
                            return "citations: string[] expected";
                }
                if (message.graphNeighbors != null && message.hasOwnProperty("graphNeighbors")) {
                    if (!Array.isArray(message.graphNeighbors))
                        return "graphNeighbors: array expected";
                    for (let i = 0; i < message.graphNeighbors.length; ++i) {
                        let error = $root.yorha.retrieval.GraphNeighbor.verify(message.graphNeighbors[i], long + 1);
                        if (error)
                            return "graphNeighbors." + error;
                    }
                }
                if (message.documentContext != null && message.hasOwnProperty("documentContext")) {
                    let error = $root.yorha.retrieval.DocumentContext.verify(message.documentContext, long + 1);
                    if (error)
                        return "documentContext." + error;
                }
                return null;
            };

            /**
             * Creates a ContextBundle message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.ContextBundle
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.ContextBundle} ContextBundle
             */
            ContextBundle.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.ContextBundle)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.ContextBundle();
                if (object.hit != null) {
                    if (typeof object.hit !== "object")
                        throw TypeError(".yorha.retrieval.ContextBundle.hit: object expected");
                    message.hit = $root.yorha.retrieval.SearchResult.fromObject(object.hit, long + 1);
                }
                if (object.siblings) {
                    if (!Array.isArray(object.siblings))
                        throw TypeError(".yorha.retrieval.ContextBundle.siblings: array expected");
                    message.siblings = [];
                    for (let i = 0; i < object.siblings.length; ++i) {
                        if (typeof object.siblings[i] !== "object")
                            throw TypeError(".yorha.retrieval.ContextBundle.siblings: object expected");
                        message.siblings[i] = $root.yorha.retrieval.SearchResult.fromObject(object.siblings[i], long + 1);
                    }
                }
                if (object.sectionPath) {
                    if (!Array.isArray(object.sectionPath))
                        throw TypeError(".yorha.retrieval.ContextBundle.sectionPath: array expected");
                    message.sectionPath = [];
                    for (let i = 0; i < object.sectionPath.length; ++i)
                        message.sectionPath[i] = String(object.sectionPath[i]);
                }
                if (object.heading != null)
                    message.heading = String(object.heading);
                if (object.citations) {
                    if (!Array.isArray(object.citations))
                        throw TypeError(".yorha.retrieval.ContextBundle.citations: array expected");
                    message.citations = [];
                    for (let i = 0; i < object.citations.length; ++i)
                        message.citations[i] = String(object.citations[i]);
                }
                if (object.graphNeighbors) {
                    if (!Array.isArray(object.graphNeighbors))
                        throw TypeError(".yorha.retrieval.ContextBundle.graphNeighbors: array expected");
                    message.graphNeighbors = [];
                    for (let i = 0; i < object.graphNeighbors.length; ++i) {
                        if (typeof object.graphNeighbors[i] !== "object")
                            throw TypeError(".yorha.retrieval.ContextBundle.graphNeighbors: object expected");
                        message.graphNeighbors[i] = $root.yorha.retrieval.GraphNeighbor.fromObject(object.graphNeighbors[i], long + 1);
                    }
                }
                if (object.documentContext != null) {
                    if (typeof object.documentContext !== "object")
                        throw TypeError(".yorha.retrieval.ContextBundle.documentContext: object expected");
                    message.documentContext = $root.yorha.retrieval.DocumentContext.fromObject(object.documentContext, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a ContextBundle message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.ContextBundle
             * @static
             * @param {yorha.retrieval.ContextBundle} message ContextBundle
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ContextBundle.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.siblings = [];
                    object.sectionPath = [];
                    object.citations = [];
                    object.graphNeighbors = [];
                }
                if (options.defaults) {
                    object.hit = null;
                    object.heading = "";
                    object.documentContext = null;
                }
                if (message.hit != null && message.hasOwnProperty("hit"))
                    object.hit = $root.yorha.retrieval.SearchResult.toObject(message.hit, options, q + 1);
                if (message.siblings && message.siblings.length) {
                    object.siblings = [];
                    for (let j = 0; j < message.siblings.length; ++j)
                        object.siblings[j] = $root.yorha.retrieval.SearchResult.toObject(message.siblings[j], options, q + 1);
                }
                if (message.sectionPath && message.sectionPath.length) {
                    object.sectionPath = [];
                    for (let j = 0; j < message.sectionPath.length; ++j)
                        object.sectionPath[j] = message.sectionPath[j];
                }
                if (message.heading != null && message.hasOwnProperty("heading"))
                    object.heading = message.heading;
                if (message.citations && message.citations.length) {
                    object.citations = [];
                    for (let j = 0; j < message.citations.length; ++j)
                        object.citations[j] = message.citations[j];
                }
                if (message.graphNeighbors && message.graphNeighbors.length) {
                    object.graphNeighbors = [];
                    for (let j = 0; j < message.graphNeighbors.length; ++j)
                        object.graphNeighbors[j] = $root.yorha.retrieval.GraphNeighbor.toObject(message.graphNeighbors[j], options, q + 1);
                }
                if (message.documentContext != null && message.hasOwnProperty("documentContext"))
                    object.documentContext = $root.yorha.retrieval.DocumentContext.toObject(message.documentContext, options, q + 1);
                return object;
            };

            /**
             * Converts this ContextBundle to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.ContextBundle
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ContextBundle.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new GraphNeighbor instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.GraphNeighbor
             * @static
             * @param {yorha.retrieval.IGraphNeighbor=} [properties] Properties to set
             * @returns {yorha.retrieval.GraphNeighbor} GraphNeighbor instance
             */
            GraphNeighbor.create = function create(properties) {
                return new GraphNeighbor(properties);
            };

            /**
             * Encodes the specified GraphNeighbor message. Does not implicitly {@link yorha.retrieval.GraphNeighbor.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.GraphNeighbor
             * @static
             * @param {yorha.retrieval.IGraphNeighbor} message GraphNeighbor message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            GraphNeighbor.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
            GraphNeighbor.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a GraphNeighbor message.
             * @function verify
             * @memberof yorha.retrieval.GraphNeighbor
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            GraphNeighbor.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.nodeId != null && message.hasOwnProperty("nodeId"))
                    if (!$util.isString(message.nodeId))
                        return "nodeId: string expected";
                if (message.title != null && message.hasOwnProperty("title"))
                    if (!$util.isString(message.title))
                        return "title: string expected";
                if (message.evidenceType != null && message.hasOwnProperty("evidenceType"))
                    if (!$util.isString(message.evidenceType))
                        return "evidenceType: string expected";
                if (message.connectionType != null && message.hasOwnProperty("connectionType"))
                    if (!$util.isString(message.connectionType))
                        return "connectionType: string expected";
                if (message.strength != null && message.hasOwnProperty("strength"))
                    if (!$util.isInteger(message.strength))
                        return "strength: integer expected";
                if (message.confidence != null && message.hasOwnProperty("confidence"))
                    if (!$util.isInteger(message.confidence))
                        return "confidence: integer expected";
                if (message.aiReasoning != null && message.hasOwnProperty("aiReasoning"))
                    if (!$util.isString(message.aiReasoning))
                        return "aiReasoning: string expected";
                return null;
            };

            /**
             * Creates a GraphNeighbor message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.GraphNeighbor
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.GraphNeighbor} GraphNeighbor
             */
            GraphNeighbor.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.GraphNeighbor)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.GraphNeighbor();
                if (object.nodeId != null)
                    message.nodeId = String(object.nodeId);
                if (object.title != null)
                    message.title = String(object.title);
                if (object.evidenceType != null)
                    message.evidenceType = String(object.evidenceType);
                if (object.connectionType != null)
                    message.connectionType = String(object.connectionType);
                if (object.strength != null)
                    message.strength = object.strength | 0;
                if (object.confidence != null)
                    message.confidence = object.confidence | 0;
                if (object.aiReasoning != null)
                    message.aiReasoning = String(object.aiReasoning);
                return message;
            };

            /**
             * Creates a plain object from a GraphNeighbor message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.GraphNeighbor
             * @static
             * @param {yorha.retrieval.GraphNeighbor} message GraphNeighbor
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            GraphNeighbor.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.nodeId = "";
                    object.title = "";
                    object.evidenceType = "";
                    object.connectionType = "";
                    object.strength = 0;
                    object.confidence = 0;
                    object.aiReasoning = "";
                }
                if (message.nodeId != null && message.hasOwnProperty("nodeId"))
                    object.nodeId = message.nodeId;
                if (message.title != null && message.hasOwnProperty("title"))
                    object.title = message.title;
                if (message.evidenceType != null && message.hasOwnProperty("evidenceType"))
                    object.evidenceType = message.evidenceType;
                if (message.connectionType != null && message.hasOwnProperty("connectionType"))
                    object.connectionType = message.connectionType;
                if (message.strength != null && message.hasOwnProperty("strength"))
                    object.strength = message.strength;
                if (message.confidence != null && message.hasOwnProperty("confidence"))
                    object.confidence = message.confidence;
                if (message.aiReasoning != null && message.hasOwnProperty("aiReasoning"))
                    object.aiReasoning = message.aiReasoning;
                return object;
            };

            /**
             * Converts this GraphNeighbor to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.GraphNeighbor
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            GraphNeighbor.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new DocumentContext instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.DocumentContext
             * @static
             * @param {yorha.retrieval.IDocumentContext=} [properties] Properties to set
             * @returns {yorha.retrieval.DocumentContext} DocumentContext instance
             */
            DocumentContext.create = function create(properties) {
                return new DocumentContext(properties);
            };

            /**
             * Encodes the specified DocumentContext message. Does not implicitly {@link yorha.retrieval.DocumentContext.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.DocumentContext
             * @static
             * @param {yorha.retrieval.IDocumentContext} message DocumentContext message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            DocumentContext.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
            DocumentContext.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a DocumentContext message.
             * @function verify
             * @memberof yorha.retrieval.DocumentContext
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            DocumentContext.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.evidenceId != null && message.hasOwnProperty("evidenceId"))
                    if (!$util.isString(message.evidenceId))
                        return "evidenceId: string expected";
                if (message.fileName != null && message.hasOwnProperty("fileName"))
                    if (!$util.isString(message.fileName))
                        return "fileName: string expected";
                if (message.fileType != null && message.hasOwnProperty("fileType"))
                    if (!$util.isString(message.fileType))
                        return "fileType: string expected";
                if (message.description != null && message.hasOwnProperty("description"))
                    if (!$util.isString(message.description))
                        return "description: string expected";
                if (message.aiSummary != null && message.hasOwnProperty("aiSummary"))
                    if (!$util.isString(message.aiSummary))
                        return "aiSummary: string expected";
                if (message.aiTagsJson != null && message.hasOwnProperty("aiTagsJson"))
                    if (!$util.isString(message.aiTagsJson))
                        return "aiTagsJson: string expected";
                if (message.keyEntitiesJson != null && message.hasOwnProperty("keyEntitiesJson"))
                    if (!$util.isString(message.keyEntitiesJson))
                        return "keyEntitiesJson: string expected";
                return null;
            };

            /**
             * Creates a DocumentContext message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.DocumentContext
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.DocumentContext} DocumentContext
             */
            DocumentContext.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.DocumentContext)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.DocumentContext();
                if (object.evidenceId != null)
                    message.evidenceId = String(object.evidenceId);
                if (object.fileName != null)
                    message.fileName = String(object.fileName);
                if (object.fileType != null)
                    message.fileType = String(object.fileType);
                if (object.description != null)
                    message.description = String(object.description);
                if (object.aiSummary != null)
                    message.aiSummary = String(object.aiSummary);
                if (object.aiTagsJson != null)
                    message.aiTagsJson = String(object.aiTagsJson);
                if (object.keyEntitiesJson != null)
                    message.keyEntitiesJson = String(object.keyEntitiesJson);
                return message;
            };

            /**
             * Creates a plain object from a DocumentContext message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.DocumentContext
             * @static
             * @param {yorha.retrieval.DocumentContext} message DocumentContext
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            DocumentContext.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.evidenceId = "";
                    object.fileName = "";
                    object.fileType = "";
                    object.description = "";
                    object.aiSummary = "";
                    object.aiTagsJson = "";
                    object.keyEntitiesJson = "";
                }
                if (message.evidenceId != null && message.hasOwnProperty("evidenceId"))
                    object.evidenceId = message.evidenceId;
                if (message.fileName != null && message.hasOwnProperty("fileName"))
                    object.fileName = message.fileName;
                if (message.fileType != null && message.hasOwnProperty("fileType"))
                    object.fileType = message.fileType;
                if (message.description != null && message.hasOwnProperty("description"))
                    object.description = message.description;
                if (message.aiSummary != null && message.hasOwnProperty("aiSummary"))
                    object.aiSummary = message.aiSummary;
                if (message.aiTagsJson != null && message.hasOwnProperty("aiTagsJson"))
                    object.aiTagsJson = message.aiTagsJson;
                if (message.keyEntitiesJson != null && message.hasOwnProperty("keyEntitiesJson"))
                    object.keyEntitiesJson = message.keyEntitiesJson;
                return object;
            };

            /**
             * Converts this DocumentContext to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.DocumentContext
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            DocumentContext.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new SearchTiming instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.SearchTiming
             * @static
             * @param {yorha.retrieval.ISearchTiming=} [properties] Properties to set
             * @returns {yorha.retrieval.SearchTiming} SearchTiming instance
             */
            SearchTiming.create = function create(properties) {
                return new SearchTiming(properties);
            };

            /**
             * Encodes the specified SearchTiming message. Does not implicitly {@link yorha.retrieval.SearchTiming.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.SearchTiming
             * @static
             * @param {yorha.retrieval.ISearchTiming} message SearchTiming message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchTiming.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
            SearchTiming.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a SearchTiming message.
             * @function verify
             * @memberof yorha.retrieval.SearchTiming
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SearchTiming.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.embedMs != null && message.hasOwnProperty("embedMs"))
                    if (typeof message.embedMs !== "number")
                        return "embedMs: number expected";
                if (message.searchMs != null && message.hasOwnProperty("searchMs"))
                    if (typeof message.searchMs !== "number")
                        return "searchMs: number expected";
                if (message.rerankMs != null && message.hasOwnProperty("rerankMs"))
                    if (typeof message.rerankMs !== "number")
                        return "rerankMs: number expected";
                if (message.hopMs != null && message.hasOwnProperty("hopMs"))
                    if (typeof message.hopMs !== "number")
                        return "hopMs: number expected";
                if (message.kagMs != null && message.hasOwnProperty("kagMs"))
                    if (typeof message.kagMs !== "number")
                        return "kagMs: number expected";
                if (message.dagMs != null && message.hasOwnProperty("dagMs"))
                    if (typeof message.dagMs !== "number")
                        return "dagMs: number expected";
                if (message.totalMs != null && message.hasOwnProperty("totalMs"))
                    if (typeof message.totalMs !== "number")
                        return "totalMs: number expected";
                return null;
            };

            /**
             * Creates a SearchTiming message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.SearchTiming
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.SearchTiming} SearchTiming
             */
            SearchTiming.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.SearchTiming)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.SearchTiming();
                if (object.embedMs != null)
                    message.embedMs = Number(object.embedMs);
                if (object.searchMs != null)
                    message.searchMs = Number(object.searchMs);
                if (object.rerankMs != null)
                    message.rerankMs = Number(object.rerankMs);
                if (object.hopMs != null)
                    message.hopMs = Number(object.hopMs);
                if (object.kagMs != null)
                    message.kagMs = Number(object.kagMs);
                if (object.dagMs != null)
                    message.dagMs = Number(object.dagMs);
                if (object.totalMs != null)
                    message.totalMs = Number(object.totalMs);
                return message;
            };

            /**
             * Creates a plain object from a SearchTiming message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.SearchTiming
             * @static
             * @param {yorha.retrieval.SearchTiming} message SearchTiming
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SearchTiming.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.embedMs = 0;
                    object.searchMs = 0;
                    object.rerankMs = 0;
                    object.hopMs = 0;
                    object.kagMs = 0;
                    object.dagMs = 0;
                    object.totalMs = 0;
                }
                if (message.embedMs != null && message.hasOwnProperty("embedMs"))
                    object.embedMs = options.json && !isFinite(message.embedMs) ? String(message.embedMs) : message.embedMs;
                if (message.searchMs != null && message.hasOwnProperty("searchMs"))
                    object.searchMs = options.json && !isFinite(message.searchMs) ? String(message.searchMs) : message.searchMs;
                if (message.rerankMs != null && message.hasOwnProperty("rerankMs"))
                    object.rerankMs = options.json && !isFinite(message.rerankMs) ? String(message.rerankMs) : message.rerankMs;
                if (message.hopMs != null && message.hasOwnProperty("hopMs"))
                    object.hopMs = options.json && !isFinite(message.hopMs) ? String(message.hopMs) : message.hopMs;
                if (message.kagMs != null && message.hasOwnProperty("kagMs"))
                    object.kagMs = options.json && !isFinite(message.kagMs) ? String(message.kagMs) : message.kagMs;
                if (message.dagMs != null && message.hasOwnProperty("dagMs"))
                    object.dagMs = options.json && !isFinite(message.dagMs) ? String(message.dagMs) : message.dagMs;
                if (message.totalMs != null && message.hasOwnProperty("totalMs"))
                    object.totalMs = options.json && !isFinite(message.totalMs) ? String(message.totalMs) : message.totalMs;
                return object;
            };

            /**
             * Converts this SearchTiming to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.SearchTiming
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SearchTiming.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
             * @property {Array.<string>|null} [packetKeys] CodebaseSearchRequest packetKeys
             * @property {string|null} [representationId] CodebaseSearchRequest representationId
             * @property {yorha.shared.IAtlasRequestContextV2|null} [atlasContext] CodebaseSearchRequest atlasContext
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
                this.packetKeys = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * CodebaseSearchRequest packetKeys.
             * @member {Array.<string>} packetKeys
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.packetKeys = $util.emptyArray;

            /**
             * CodebaseSearchRequest representationId.
             * @member {string} representationId
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.representationId = "";

            /**
             * CodebaseSearchRequest atlasContext.
             * @member {yorha.shared.IAtlasRequestContextV2|null|undefined} atlasContext
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             */
            CodebaseSearchRequest.prototype.atlasContext = null;

            /**
             * Creates a new CodebaseSearchRequest instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @static
             * @param {yorha.retrieval.ICodebaseSearchRequest=} [properties] Properties to set
             * @returns {yorha.retrieval.CodebaseSearchRequest} CodebaseSearchRequest instance
             */
            CodebaseSearchRequest.create = function create(properties) {
                return new CodebaseSearchRequest(properties);
            };

            /**
             * Encodes the specified CodebaseSearchRequest message. Does not implicitly {@link yorha.retrieval.CodebaseSearchRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @static
             * @param {yorha.retrieval.ICodebaseSearchRequest} message CodebaseSearchRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseSearchRequest.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
                if (message.packetKeys != null && message.packetKeys.length)
                    for (let i = 0; i < message.packetKeys.length; ++i)
                        writer.uint32(/* id 9, wireType 2 =*/74).string(message.packetKeys[i]);
                if (message.representationId != null && Object.hasOwnProperty.call(message, "representationId"))
                    writer.uint32(/* id 10, wireType 2 =*/82).string(message.representationId);
                if (message.atlasContext != null && Object.hasOwnProperty.call(message, "atlasContext"))
                    $root.yorha.shared.AtlasRequestContextV2.encode(message.atlasContext, writer.uint32(/* id 11, wireType 2 =*/90).fork(), q + 1).ldelim();
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
            CodebaseSearchRequest.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                    case 9: {
                            if (!(message.packetKeys && message.packetKeys.length))
                                message.packetKeys = [];
                            message.packetKeys.push(reader.string());
                            break;
                        }
                    case 10: {
                            message.representationId = reader.string();
                            break;
                        }
                    case 11: {
                            message.atlasContext = $root.yorha.shared.AtlasRequestContextV2.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Verifies a CodebaseSearchRequest message.
             * @function verify
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            CodebaseSearchRequest.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.query != null && message.hasOwnProperty("query"))
                    if (!$util.isString(message.query))
                        return "query: string expected";
                if (message.limit != null && message.hasOwnProperty("limit"))
                    if (!$util.isInteger(message.limit))
                        return "limit: integer expected";
                if (message.contentWeight != null && message.hasOwnProperty("contentWeight"))
                    if (typeof message.contentWeight !== "number")
                        return "contentWeight: number expected";
                if (message.signatureWeight != null && message.hasOwnProperty("signatureWeight"))
                    if (typeof message.signatureWeight !== "number")
                        return "signatureWeight: number expected";
                if (message.kinds != null && message.hasOwnProperty("kinds")) {
                    if (!Array.isArray(message.kinds))
                        return "kinds: array expected";
                    for (let i = 0; i < message.kinds.length; ++i)
                        if (!$util.isString(message.kinds[i]))
                            return "kinds: string[] expected";
                }
                if (message.httpMethod != null && message.hasOwnProperty("httpMethod"))
                    if (!$util.isString(message.httpMethod))
                        return "httpMethod: string expected";
                if (message.pathPrefixes != null && message.hasOwnProperty("pathPrefixes")) {
                    if (!Array.isArray(message.pathPrefixes))
                        return "pathPrefixes: array expected";
                    for (let i = 0; i < message.pathPrefixes.length; ++i)
                        if (!$util.isString(message.pathPrefixes[i]))
                            return "pathPrefixes: string[] expected";
                }
                if (message.includeDebug != null && message.hasOwnProperty("includeDebug"))
                    if (typeof message.includeDebug !== "boolean")
                        return "includeDebug: boolean expected";
                if (message.packetKeys != null && message.hasOwnProperty("packetKeys")) {
                    if (!Array.isArray(message.packetKeys))
                        return "packetKeys: array expected";
                    for (let i = 0; i < message.packetKeys.length; ++i)
                        if (!$util.isString(message.packetKeys[i]))
                            return "packetKeys: string[] expected";
                }
                if (message.representationId != null && message.hasOwnProperty("representationId"))
                    if (!$util.isString(message.representationId))
                        return "representationId: string expected";
                if (message.atlasContext != null && message.hasOwnProperty("atlasContext")) {
                    let error = $root.yorha.shared.AtlasRequestContextV2.verify(message.atlasContext, long + 1);
                    if (error)
                        return "atlasContext." + error;
                }
                return null;
            };

            /**
             * Creates a CodebaseSearchRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.CodebaseSearchRequest} CodebaseSearchRequest
             */
            CodebaseSearchRequest.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.CodebaseSearchRequest)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.CodebaseSearchRequest();
                if (object.query != null)
                    message.query = String(object.query);
                if (object.limit != null)
                    message.limit = object.limit | 0;
                if (object.contentWeight != null)
                    message.contentWeight = Number(object.contentWeight);
                if (object.signatureWeight != null)
                    message.signatureWeight = Number(object.signatureWeight);
                if (object.kinds) {
                    if (!Array.isArray(object.kinds))
                        throw TypeError(".yorha.retrieval.CodebaseSearchRequest.kinds: array expected");
                    message.kinds = [];
                    for (let i = 0; i < object.kinds.length; ++i)
                        message.kinds[i] = String(object.kinds[i]);
                }
                if (object.httpMethod != null)
                    message.httpMethod = String(object.httpMethod);
                if (object.pathPrefixes) {
                    if (!Array.isArray(object.pathPrefixes))
                        throw TypeError(".yorha.retrieval.CodebaseSearchRequest.pathPrefixes: array expected");
                    message.pathPrefixes = [];
                    for (let i = 0; i < object.pathPrefixes.length; ++i)
                        message.pathPrefixes[i] = String(object.pathPrefixes[i]);
                }
                if (object.includeDebug != null)
                    message.includeDebug = Boolean(object.includeDebug);
                if (object.packetKeys) {
                    if (!Array.isArray(object.packetKeys))
                        throw TypeError(".yorha.retrieval.CodebaseSearchRequest.packetKeys: array expected");
                    message.packetKeys = [];
                    for (let i = 0; i < object.packetKeys.length; ++i)
                        message.packetKeys[i] = String(object.packetKeys[i]);
                }
                if (object.representationId != null)
                    message.representationId = String(object.representationId);
                if (object.atlasContext != null) {
                    if (typeof object.atlasContext !== "object")
                        throw TypeError(".yorha.retrieval.CodebaseSearchRequest.atlasContext: object expected");
                    message.atlasContext = $root.yorha.shared.AtlasRequestContextV2.fromObject(object.atlasContext, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a CodebaseSearchRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @static
             * @param {yorha.retrieval.CodebaseSearchRequest} message CodebaseSearchRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            CodebaseSearchRequest.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.kinds = [];
                    object.pathPrefixes = [];
                    object.packetKeys = [];
                }
                if (options.defaults) {
                    object.query = "";
                    object.limit = 0;
                    object.contentWeight = 0;
                    object.signatureWeight = 0;
                    object.httpMethod = "";
                    object.includeDebug = false;
                    object.representationId = "";
                    object.atlasContext = null;
                }
                if (message.query != null && message.hasOwnProperty("query"))
                    object.query = message.query;
                if (message.limit != null && message.hasOwnProperty("limit"))
                    object.limit = message.limit;
                if (message.contentWeight != null && message.hasOwnProperty("contentWeight"))
                    object.contentWeight = options.json && !isFinite(message.contentWeight) ? String(message.contentWeight) : message.contentWeight;
                if (message.signatureWeight != null && message.hasOwnProperty("signatureWeight"))
                    object.signatureWeight = options.json && !isFinite(message.signatureWeight) ? String(message.signatureWeight) : message.signatureWeight;
                if (message.kinds && message.kinds.length) {
                    object.kinds = [];
                    for (let j = 0; j < message.kinds.length; ++j)
                        object.kinds[j] = message.kinds[j];
                }
                if (message.httpMethod != null && message.hasOwnProperty("httpMethod"))
                    object.httpMethod = message.httpMethod;
                if (message.pathPrefixes && message.pathPrefixes.length) {
                    object.pathPrefixes = [];
                    for (let j = 0; j < message.pathPrefixes.length; ++j)
                        object.pathPrefixes[j] = message.pathPrefixes[j];
                }
                if (message.includeDebug != null && message.hasOwnProperty("includeDebug"))
                    object.includeDebug = message.includeDebug;
                if (message.packetKeys && message.packetKeys.length) {
                    object.packetKeys = [];
                    for (let j = 0; j < message.packetKeys.length; ++j)
                        object.packetKeys[j] = message.packetKeys[j];
                }
                if (message.representationId != null && message.hasOwnProperty("representationId"))
                    object.representationId = message.representationId;
                if (message.atlasContext != null && message.hasOwnProperty("atlasContext"))
                    object.atlasContext = $root.yorha.shared.AtlasRequestContextV2.toObject(message.atlasContext, options, q + 1);
                return object;
            };

            /**
             * Converts this CodebaseSearchRequest to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.CodebaseSearchRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            CodebaseSearchRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
             * @property {string|null} [representationUsed] CodebaseSearchResponse representationUsed
             * @property {string|null} [representationFallbackReason] CodebaseSearchResponse representationFallbackReason
             * @property {yorha.shared.IAtlasToolReceiptV2|null} [receipt] CodebaseSearchResponse receipt
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * CodebaseSearchResponse representationUsed.
             * @member {string} representationUsed
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @instance
             */
            CodebaseSearchResponse.prototype.representationUsed = "";

            /**
             * CodebaseSearchResponse representationFallbackReason.
             * @member {string} representationFallbackReason
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @instance
             */
            CodebaseSearchResponse.prototype.representationFallbackReason = "";

            /**
             * CodebaseSearchResponse receipt.
             * @member {yorha.shared.IAtlasToolReceiptV2|null|undefined} receipt
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @instance
             */
            CodebaseSearchResponse.prototype.receipt = null;

            /**
             * Creates a new CodebaseSearchResponse instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @static
             * @param {yorha.retrieval.ICodebaseSearchResponse=} [properties] Properties to set
             * @returns {yorha.retrieval.CodebaseSearchResponse} CodebaseSearchResponse instance
             */
            CodebaseSearchResponse.create = function create(properties) {
                return new CodebaseSearchResponse(properties);
            };

            /**
             * Encodes the specified CodebaseSearchResponse message. Does not implicitly {@link yorha.retrieval.CodebaseSearchResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @static
             * @param {yorha.retrieval.ICodebaseSearchResponse} message CodebaseSearchResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseSearchResponse.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.chunks != null && message.chunks.length)
                    for (let i = 0; i < message.chunks.length; ++i)
                        $root.yorha.retrieval.CodebaseChunk.encode(message.chunks[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.totalMs != null && Object.hasOwnProperty.call(message, "totalMs"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.totalMs);
                if (message.debugJson != null && Object.hasOwnProperty.call(message, "debugJson"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.debugJson);
                if (message.representationUsed != null && Object.hasOwnProperty.call(message, "representationUsed"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.representationUsed);
                if (message.representationFallbackReason != null && Object.hasOwnProperty.call(message, "representationFallbackReason"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.representationFallbackReason);
                if (message.receipt != null && Object.hasOwnProperty.call(message, "receipt"))
                    $root.yorha.shared.AtlasToolReceiptV2.encode(message.receipt, writer.uint32(/* id 6, wireType 2 =*/50).fork(), q + 1).ldelim();
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
            CodebaseSearchResponse.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.CodebaseSearchResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.chunks && message.chunks.length))
                                message.chunks = [];
                            message.chunks.push($root.yorha.retrieval.CodebaseChunk.decode(reader, reader.uint32(), undefined, long + 1));
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
                    case 4: {
                            message.representationUsed = reader.string();
                            break;
                        }
                    case 5: {
                            message.representationFallbackReason = reader.string();
                            break;
                        }
                    case 6: {
                            message.receipt = $root.yorha.shared.AtlasToolReceiptV2.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Verifies a CodebaseSearchResponse message.
             * @function verify
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            CodebaseSearchResponse.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.chunks != null && message.hasOwnProperty("chunks")) {
                    if (!Array.isArray(message.chunks))
                        return "chunks: array expected";
                    for (let i = 0; i < message.chunks.length; ++i) {
                        let error = $root.yorha.retrieval.CodebaseChunk.verify(message.chunks[i], long + 1);
                        if (error)
                            return "chunks." + error;
                    }
                }
                if (message.totalMs != null && message.hasOwnProperty("totalMs"))
                    if (typeof message.totalMs !== "number")
                        return "totalMs: number expected";
                if (message.debugJson != null && message.hasOwnProperty("debugJson"))
                    if (!$util.isString(message.debugJson))
                        return "debugJson: string expected";
                if (message.representationUsed != null && message.hasOwnProperty("representationUsed"))
                    if (!$util.isString(message.representationUsed))
                        return "representationUsed: string expected";
                if (message.representationFallbackReason != null && message.hasOwnProperty("representationFallbackReason"))
                    if (!$util.isString(message.representationFallbackReason))
                        return "representationFallbackReason: string expected";
                if (message.receipt != null && message.hasOwnProperty("receipt")) {
                    let error = $root.yorha.shared.AtlasToolReceiptV2.verify(message.receipt, long + 1);
                    if (error)
                        return "receipt." + error;
                }
                return null;
            };

            /**
             * Creates a CodebaseSearchResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.CodebaseSearchResponse} CodebaseSearchResponse
             */
            CodebaseSearchResponse.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.CodebaseSearchResponse)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.CodebaseSearchResponse();
                if (object.chunks) {
                    if (!Array.isArray(object.chunks))
                        throw TypeError(".yorha.retrieval.CodebaseSearchResponse.chunks: array expected");
                    message.chunks = [];
                    for (let i = 0; i < object.chunks.length; ++i) {
                        if (typeof object.chunks[i] !== "object")
                            throw TypeError(".yorha.retrieval.CodebaseSearchResponse.chunks: object expected");
                        message.chunks[i] = $root.yorha.retrieval.CodebaseChunk.fromObject(object.chunks[i], long + 1);
                    }
                }
                if (object.totalMs != null)
                    message.totalMs = Number(object.totalMs);
                if (object.debugJson != null)
                    message.debugJson = String(object.debugJson);
                if (object.representationUsed != null)
                    message.representationUsed = String(object.representationUsed);
                if (object.representationFallbackReason != null)
                    message.representationFallbackReason = String(object.representationFallbackReason);
                if (object.receipt != null) {
                    if (typeof object.receipt !== "object")
                        throw TypeError(".yorha.retrieval.CodebaseSearchResponse.receipt: object expected");
                    message.receipt = $root.yorha.shared.AtlasToolReceiptV2.fromObject(object.receipt, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a CodebaseSearchResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @static
             * @param {yorha.retrieval.CodebaseSearchResponse} message CodebaseSearchResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            CodebaseSearchResponse.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.chunks = [];
                if (options.defaults) {
                    object.totalMs = 0;
                    object.debugJson = "";
                    object.representationUsed = "";
                    object.representationFallbackReason = "";
                    object.receipt = null;
                }
                if (message.chunks && message.chunks.length) {
                    object.chunks = [];
                    for (let j = 0; j < message.chunks.length; ++j)
                        object.chunks[j] = $root.yorha.retrieval.CodebaseChunk.toObject(message.chunks[j], options, q + 1);
                }
                if (message.totalMs != null && message.hasOwnProperty("totalMs"))
                    object.totalMs = options.json && !isFinite(message.totalMs) ? String(message.totalMs) : message.totalMs;
                if (message.debugJson != null && message.hasOwnProperty("debugJson"))
                    object.debugJson = message.debugJson;
                if (message.representationUsed != null && message.hasOwnProperty("representationUsed"))
                    object.representationUsed = message.representationUsed;
                if (message.representationFallbackReason != null && message.hasOwnProperty("representationFallbackReason"))
                    object.representationFallbackReason = message.representationFallbackReason;
                if (message.receipt != null && message.hasOwnProperty("receipt"))
                    object.receipt = $root.yorha.shared.AtlasToolReceiptV2.toObject(message.receipt, options, q + 1);
                return object;
            };

            /**
             * Converts this CodebaseSearchResponse to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.CodebaseSearchResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            CodebaseSearchResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new CodebaseChunkEvent instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @static
             * @param {yorha.retrieval.ICodebaseChunkEvent=} [properties] Properties to set
             * @returns {yorha.retrieval.CodebaseChunkEvent} CodebaseChunkEvent instance
             */
            CodebaseChunkEvent.create = function create(properties) {
                return new CodebaseChunkEvent(properties);
            };

            /**
             * Encodes the specified CodebaseChunkEvent message. Does not implicitly {@link yorha.retrieval.CodebaseChunkEvent.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @static
             * @param {yorha.retrieval.ICodebaseChunkEvent} message CodebaseChunkEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseChunkEvent.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.chunk != null && Object.hasOwnProperty.call(message, "chunk"))
                    $root.yorha.retrieval.CodebaseChunk.encode(message.chunk, writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.progress != null && Object.hasOwnProperty.call(message, "progress"))
                    $root.yorha.retrieval.RetrievalProgress.encode(message.progress, writer.uint32(/* id 2, wireType 2 =*/18).fork(), q + 1).ldelim();
                if (message.error != null && Object.hasOwnProperty.call(message, "error"))
                    $root.yorha.retrieval.RetrievalError.encode(message.error, writer.uint32(/* id 3, wireType 2 =*/26).fork(), q + 1).ldelim();
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
            CodebaseChunkEvent.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.CodebaseChunkEvent();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.chunk = $root.yorha.retrieval.CodebaseChunk.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 2: {
                            message.progress = $root.yorha.retrieval.RetrievalProgress.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 3: {
                            message.error = $root.yorha.retrieval.RetrievalError.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Verifies a CodebaseChunkEvent message.
             * @function verify
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            CodebaseChunkEvent.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                let properties = {};
                if (message.chunk != null && message.hasOwnProperty("chunk")) {
                    properties.event = 1;
                    {
                        let error = $root.yorha.retrieval.CodebaseChunk.verify(message.chunk, long + 1);
                        if (error)
                            return "chunk." + error;
                    }
                }
                if (message.progress != null && message.hasOwnProperty("progress")) {
                    if (properties.event === 1)
                        return "event: multiple values";
                    properties.event = 1;
                    {
                        let error = $root.yorha.retrieval.RetrievalProgress.verify(message.progress, long + 1);
                        if (error)
                            return "progress." + error;
                    }
                }
                if (message.error != null && message.hasOwnProperty("error")) {
                    if (properties.event === 1)
                        return "event: multiple values";
                    properties.event = 1;
                    {
                        let error = $root.yorha.retrieval.RetrievalError.verify(message.error, long + 1);
                        if (error)
                            return "error." + error;
                    }
                }
                return null;
            };

            /**
             * Creates a CodebaseChunkEvent message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.CodebaseChunkEvent} CodebaseChunkEvent
             */
            CodebaseChunkEvent.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.CodebaseChunkEvent)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.CodebaseChunkEvent();
                if (object.chunk != null) {
                    if (typeof object.chunk !== "object")
                        throw TypeError(".yorha.retrieval.CodebaseChunkEvent.chunk: object expected");
                    message.chunk = $root.yorha.retrieval.CodebaseChunk.fromObject(object.chunk, long + 1);
                }
                if (object.progress != null) {
                    if (typeof object.progress !== "object")
                        throw TypeError(".yorha.retrieval.CodebaseChunkEvent.progress: object expected");
                    message.progress = $root.yorha.retrieval.RetrievalProgress.fromObject(object.progress, long + 1);
                }
                if (object.error != null) {
                    if (typeof object.error !== "object")
                        throw TypeError(".yorha.retrieval.CodebaseChunkEvent.error: object expected");
                    message.error = $root.yorha.retrieval.RetrievalError.fromObject(object.error, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a CodebaseChunkEvent message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @static
             * @param {yorha.retrieval.CodebaseChunkEvent} message CodebaseChunkEvent
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            CodebaseChunkEvent.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (message.chunk != null && message.hasOwnProperty("chunk")) {
                    object.chunk = $root.yorha.retrieval.CodebaseChunk.toObject(message.chunk, options, q + 1);
                    if (options.oneofs)
                        object.event = "chunk";
                }
                if (message.progress != null && message.hasOwnProperty("progress")) {
                    object.progress = $root.yorha.retrieval.RetrievalProgress.toObject(message.progress, options, q + 1);
                    if (options.oneofs)
                        object.event = "progress";
                }
                if (message.error != null && message.hasOwnProperty("error")) {
                    object.error = $root.yorha.retrieval.RetrievalError.toObject(message.error, options, q + 1);
                    if (options.oneofs)
                        object.event = "error";
                }
                return object;
            };

            /**
             * Converts this CodebaseChunkEvent to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.CodebaseChunkEvent
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            CodebaseChunkEvent.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
             * @property {string|null} [packetKey] CodebaseChunk packetKey
             * @property {string|null} [sourceRef] CodebaseChunk sourceRef
             * @property {string|null} [canonicalSourceRef] CodebaseChunk canonicalSourceRef
             * @property {string|null} [symbolVersionId] CodebaseChunk symbolVersionId
             * @property {string|null} [contentHash] CodebaseChunk contentHash
             * @property {string|null} [workspaceRevision] CodebaseChunk workspaceRevision
             * @property {string|null} [sourceRevision] CodebaseChunk sourceRevision
             * @property {string|null} [representationId] CodebaseChunk representationId
             * @property {string|null} [representationRevision] CodebaseChunk representationRevision
             * @property {string|null} [candidateId] CodebaseChunk candidateId
             * @property {number|Long|null} [candidateOrdinal] CodebaseChunk candidateOrdinal
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * CodebaseChunk packetKey.
             * @member {string} packetKey
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.packetKey = "";

            /**
             * CodebaseChunk sourceRef.
             * @member {string} sourceRef
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.sourceRef = "";

            /**
             * CodebaseChunk canonicalSourceRef.
             * @member {string} canonicalSourceRef
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.canonicalSourceRef = "";

            /**
             * CodebaseChunk symbolVersionId.
             * @member {string} symbolVersionId
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.symbolVersionId = "";

            /**
             * CodebaseChunk contentHash.
             * @member {string} contentHash
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.contentHash = "";

            /**
             * CodebaseChunk workspaceRevision.
             * @member {string} workspaceRevision
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.workspaceRevision = "";

            /**
             * CodebaseChunk sourceRevision.
             * @member {string} sourceRevision
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.sourceRevision = "";

            /**
             * CodebaseChunk representationId.
             * @member {string} representationId
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.representationId = "";

            /**
             * CodebaseChunk representationRevision.
             * @member {string} representationRevision
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.representationRevision = "";

            /**
             * CodebaseChunk candidateId.
             * @member {string} candidateId
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.candidateId = "";

            /**
             * CodebaseChunk candidateOrdinal.
             * @member {number|Long} candidateOrdinal
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             */
            CodebaseChunk.prototype.candidateOrdinal = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Creates a new CodebaseChunk instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.CodebaseChunk
             * @static
             * @param {yorha.retrieval.ICodebaseChunk=} [properties] Properties to set
             * @returns {yorha.retrieval.CodebaseChunk} CodebaseChunk instance
             */
            CodebaseChunk.create = function create(properties) {
                return new CodebaseChunk(properties);
            };

            /**
             * Encodes the specified CodebaseChunk message. Does not implicitly {@link yorha.retrieval.CodebaseChunk.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.CodebaseChunk
             * @static
             * @param {yorha.retrieval.ICodebaseChunk} message CodebaseChunk message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CodebaseChunk.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
                if (message.packetKey != null && Object.hasOwnProperty.call(message, "packetKey"))
                    writer.uint32(/* id 11, wireType 2 =*/90).string(message.packetKey);
                if (message.sourceRef != null && Object.hasOwnProperty.call(message, "sourceRef"))
                    writer.uint32(/* id 12, wireType 2 =*/98).string(message.sourceRef);
                if (message.canonicalSourceRef != null && Object.hasOwnProperty.call(message, "canonicalSourceRef"))
                    writer.uint32(/* id 13, wireType 2 =*/106).string(message.canonicalSourceRef);
                if (message.symbolVersionId != null && Object.hasOwnProperty.call(message, "symbolVersionId"))
                    writer.uint32(/* id 14, wireType 2 =*/114).string(message.symbolVersionId);
                if (message.contentHash != null && Object.hasOwnProperty.call(message, "contentHash"))
                    writer.uint32(/* id 15, wireType 2 =*/122).string(message.contentHash);
                if (message.workspaceRevision != null && Object.hasOwnProperty.call(message, "workspaceRevision"))
                    writer.uint32(/* id 16, wireType 2 =*/130).string(message.workspaceRevision);
                if (message.sourceRevision != null && Object.hasOwnProperty.call(message, "sourceRevision"))
                    writer.uint32(/* id 17, wireType 2 =*/138).string(message.sourceRevision);
                if (message.representationId != null && Object.hasOwnProperty.call(message, "representationId"))
                    writer.uint32(/* id 18, wireType 2 =*/146).string(message.representationId);
                if (message.representationRevision != null && Object.hasOwnProperty.call(message, "representationRevision"))
                    writer.uint32(/* id 19, wireType 2 =*/154).string(message.representationRevision);
                if (message.candidateId != null && Object.hasOwnProperty.call(message, "candidateId"))
                    writer.uint32(/* id 20, wireType 2 =*/162).string(message.candidateId);
                if (message.candidateOrdinal != null && Object.hasOwnProperty.call(message, "candidateOrdinal"))
                    writer.uint32(/* id 21, wireType 0 =*/168).int64(message.candidateOrdinal);
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
            CodebaseChunk.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                    case 11: {
                            message.packetKey = reader.string();
                            break;
                        }
                    case 12: {
                            message.sourceRef = reader.string();
                            break;
                        }
                    case 13: {
                            message.canonicalSourceRef = reader.string();
                            break;
                        }
                    case 14: {
                            message.symbolVersionId = reader.string();
                            break;
                        }
                    case 15: {
                            message.contentHash = reader.string();
                            break;
                        }
                    case 16: {
                            message.workspaceRevision = reader.string();
                            break;
                        }
                    case 17: {
                            message.sourceRevision = reader.string();
                            break;
                        }
                    case 18: {
                            message.representationId = reader.string();
                            break;
                        }
                    case 19: {
                            message.representationRevision = reader.string();
                            break;
                        }
                    case 20: {
                            message.candidateId = reader.string();
                            break;
                        }
                    case 21: {
                            message.candidateOrdinal = reader.int64();
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
             * Verifies a CodebaseChunk message.
             * @function verify
             * @memberof yorha.retrieval.CodebaseChunk
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            CodebaseChunk.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.chunkId != null && message.hasOwnProperty("chunkId"))
                    if (!$util.isString(message.chunkId))
                        return "chunkId: string expected";
                if (message.filePath != null && message.hasOwnProperty("filePath"))
                    if (!$util.isString(message.filePath))
                        return "filePath: string expected";
                if (message.kind != null && message.hasOwnProperty("kind"))
                    if (!$util.isString(message.kind))
                        return "kind: string expected";
                if (message.httpMethod != null && message.hasOwnProperty("httpMethod"))
                    if (!$util.isString(message.httpMethod))
                        return "httpMethod: string expected";
                if (message.routeId != null && message.hasOwnProperty("routeId"))
                    if (!$util.isString(message.routeId))
                        return "routeId: string expected";
                if (message.tags != null && message.hasOwnProperty("tags")) {
                    if (!Array.isArray(message.tags))
                        return "tags: array expected";
                    for (let i = 0; i < message.tags.length; ++i)
                        if (!$util.isString(message.tags[i]))
                            return "tags: string[] expected";
                }
                if (message.contentPreview != null && message.hasOwnProperty("contentPreview"))
                    if (!$util.isString(message.contentPreview))
                        return "contentPreview: string expected";
                if (message.score != null && message.hasOwnProperty("score"))
                    if (typeof message.score !== "number")
                        return "score: number expected";
                if (message.startLine != null && message.hasOwnProperty("startLine"))
                    if (!$util.isInteger(message.startLine))
                        return "startLine: integer expected";
                if (message.endLine != null && message.hasOwnProperty("endLine"))
                    if (!$util.isInteger(message.endLine))
                        return "endLine: integer expected";
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    if (!$util.isString(message.packetKey))
                        return "packetKey: string expected";
                if (message.sourceRef != null && message.hasOwnProperty("sourceRef"))
                    if (!$util.isString(message.sourceRef))
                        return "sourceRef: string expected";
                if (message.canonicalSourceRef != null && message.hasOwnProperty("canonicalSourceRef"))
                    if (!$util.isString(message.canonicalSourceRef))
                        return "canonicalSourceRef: string expected";
                if (message.symbolVersionId != null && message.hasOwnProperty("symbolVersionId"))
                    if (!$util.isString(message.symbolVersionId))
                        return "symbolVersionId: string expected";
                if (message.contentHash != null && message.hasOwnProperty("contentHash"))
                    if (!$util.isString(message.contentHash))
                        return "contentHash: string expected";
                if (message.workspaceRevision != null && message.hasOwnProperty("workspaceRevision"))
                    if (!$util.isString(message.workspaceRevision))
                        return "workspaceRevision: string expected";
                if (message.sourceRevision != null && message.hasOwnProperty("sourceRevision"))
                    if (!$util.isString(message.sourceRevision))
                        return "sourceRevision: string expected";
                if (message.representationId != null && message.hasOwnProperty("representationId"))
                    if (!$util.isString(message.representationId))
                        return "representationId: string expected";
                if (message.representationRevision != null && message.hasOwnProperty("representationRevision"))
                    if (!$util.isString(message.representationRevision))
                        return "representationRevision: string expected";
                if (message.candidateId != null && message.hasOwnProperty("candidateId"))
                    if (!$util.isString(message.candidateId))
                        return "candidateId: string expected";
                if (message.candidateOrdinal != null && message.hasOwnProperty("candidateOrdinal"))
                    if (!$util.isInteger(message.candidateOrdinal) && !(message.candidateOrdinal && $util.isInteger(message.candidateOrdinal.low) && $util.isInteger(message.candidateOrdinal.high)))
                        return "candidateOrdinal: integer|Long expected";
                return null;
            };

            /**
             * Creates a CodebaseChunk message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.CodebaseChunk
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.CodebaseChunk} CodebaseChunk
             */
            CodebaseChunk.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.CodebaseChunk)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.CodebaseChunk();
                if (object.chunkId != null)
                    message.chunkId = String(object.chunkId);
                if (object.filePath != null)
                    message.filePath = String(object.filePath);
                if (object.kind != null)
                    message.kind = String(object.kind);
                if (object.httpMethod != null)
                    message.httpMethod = String(object.httpMethod);
                if (object.routeId != null)
                    message.routeId = String(object.routeId);
                if (object.tags) {
                    if (!Array.isArray(object.tags))
                        throw TypeError(".yorha.retrieval.CodebaseChunk.tags: array expected");
                    message.tags = [];
                    for (let i = 0; i < object.tags.length; ++i)
                        message.tags[i] = String(object.tags[i]);
                }
                if (object.contentPreview != null)
                    message.contentPreview = String(object.contentPreview);
                if (object.score != null)
                    message.score = Number(object.score);
                if (object.startLine != null)
                    message.startLine = object.startLine | 0;
                if (object.endLine != null)
                    message.endLine = object.endLine | 0;
                if (object.packetKey != null)
                    message.packetKey = String(object.packetKey);
                if (object.sourceRef != null)
                    message.sourceRef = String(object.sourceRef);
                if (object.canonicalSourceRef != null)
                    message.canonicalSourceRef = String(object.canonicalSourceRef);
                if (object.symbolVersionId != null)
                    message.symbolVersionId = String(object.symbolVersionId);
                if (object.contentHash != null)
                    message.contentHash = String(object.contentHash);
                if (object.workspaceRevision != null)
                    message.workspaceRevision = String(object.workspaceRevision);
                if (object.sourceRevision != null)
                    message.sourceRevision = String(object.sourceRevision);
                if (object.representationId != null)
                    message.representationId = String(object.representationId);
                if (object.representationRevision != null)
                    message.representationRevision = String(object.representationRevision);
                if (object.candidateId != null)
                    message.candidateId = String(object.candidateId);
                if (object.candidateOrdinal != null)
                    if ($util.Long)
                        message.candidateOrdinal = $util.Long.fromValue(object.candidateOrdinal, false);
                    else if (typeof object.candidateOrdinal === "string")
                        message.candidateOrdinal = parseInt(object.candidateOrdinal, 10);
                    else if (typeof object.candidateOrdinal === "number")
                        message.candidateOrdinal = object.candidateOrdinal;
                    else if (typeof object.candidateOrdinal === "object")
                        message.candidateOrdinal = new $util.LongBits(object.candidateOrdinal.low >>> 0, object.candidateOrdinal.high >>> 0).toNumber();
                return message;
            };

            /**
             * Creates a plain object from a CodebaseChunk message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.CodebaseChunk
             * @static
             * @param {yorha.retrieval.CodebaseChunk} message CodebaseChunk
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            CodebaseChunk.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.tags = [];
                if (options.defaults) {
                    object.chunkId = "";
                    object.filePath = "";
                    object.kind = "";
                    object.httpMethod = "";
                    object.routeId = "";
                    object.contentPreview = "";
                    object.score = 0;
                    object.startLine = 0;
                    object.endLine = 0;
                    object.packetKey = "";
                    object.sourceRef = "";
                    object.canonicalSourceRef = "";
                    object.symbolVersionId = "";
                    object.contentHash = "";
                    object.workspaceRevision = "";
                    object.sourceRevision = "";
                    object.representationId = "";
                    object.representationRevision = "";
                    object.candidateId = "";
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.candidateOrdinal = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : typeof BigInt !== "undefined" && options.longs === BigInt ? long.toBigInt() : long;
                    } else
                        object.candidateOrdinal = options.longs === String ? "0" : typeof BigInt !== "undefined" && options.longs === BigInt ? BigInt("0") : 0;
                }
                if (message.chunkId != null && message.hasOwnProperty("chunkId"))
                    object.chunkId = message.chunkId;
                if (message.filePath != null && message.hasOwnProperty("filePath"))
                    object.filePath = message.filePath;
                if (message.kind != null && message.hasOwnProperty("kind"))
                    object.kind = message.kind;
                if (message.httpMethod != null && message.hasOwnProperty("httpMethod"))
                    object.httpMethod = message.httpMethod;
                if (message.routeId != null && message.hasOwnProperty("routeId"))
                    object.routeId = message.routeId;
                if (message.tags && message.tags.length) {
                    object.tags = [];
                    for (let j = 0; j < message.tags.length; ++j)
                        object.tags[j] = message.tags[j];
                }
                if (message.contentPreview != null && message.hasOwnProperty("contentPreview"))
                    object.contentPreview = message.contentPreview;
                if (message.score != null && message.hasOwnProperty("score"))
                    object.score = options.json && !isFinite(message.score) ? String(message.score) : message.score;
                if (message.startLine != null && message.hasOwnProperty("startLine"))
                    object.startLine = message.startLine;
                if (message.endLine != null && message.hasOwnProperty("endLine"))
                    object.endLine = message.endLine;
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    object.packetKey = message.packetKey;
                if (message.sourceRef != null && message.hasOwnProperty("sourceRef"))
                    object.sourceRef = message.sourceRef;
                if (message.canonicalSourceRef != null && message.hasOwnProperty("canonicalSourceRef"))
                    object.canonicalSourceRef = message.canonicalSourceRef;
                if (message.symbolVersionId != null && message.hasOwnProperty("symbolVersionId"))
                    object.symbolVersionId = message.symbolVersionId;
                if (message.contentHash != null && message.hasOwnProperty("contentHash"))
                    object.contentHash = message.contentHash;
                if (message.workspaceRevision != null && message.hasOwnProperty("workspaceRevision"))
                    object.workspaceRevision = message.workspaceRevision;
                if (message.sourceRevision != null && message.hasOwnProperty("sourceRevision"))
                    object.sourceRevision = message.sourceRevision;
                if (message.representationId != null && message.hasOwnProperty("representationId"))
                    object.representationId = message.representationId;
                if (message.representationRevision != null && message.hasOwnProperty("representationRevision"))
                    object.representationRevision = message.representationRevision;
                if (message.candidateId != null && message.hasOwnProperty("candidateId"))
                    object.candidateId = message.candidateId;
                if (message.candidateOrdinal != null && message.hasOwnProperty("candidateOrdinal"))
                    if (typeof BigInt !== "undefined" && options.longs === BigInt)
                        object.candidateOrdinal = typeof message.candidateOrdinal === "number" ? BigInt(message.candidateOrdinal) : $util.Long.fromBits(message.candidateOrdinal.low >>> 0, message.candidateOrdinal.high >>> 0, false).toBigInt();
                    else if (typeof message.candidateOrdinal === "number")
                        object.candidateOrdinal = options.longs === String ? String(message.candidateOrdinal) : message.candidateOrdinal;
                    else
                        object.candidateOrdinal = options.longs === String ? $util.Long.prototype.toString.call(message.candidateOrdinal) : options.longs === Number ? new $util.LongBits(message.candidateOrdinal.low >>> 0, message.candidateOrdinal.high >>> 0).toNumber() : message.candidateOrdinal;
                return object;
            };

            /**
             * Converts this CodebaseChunk to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.CodebaseChunk
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            CodebaseChunk.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new GraphHopPolicy instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.GraphHopPolicy
             * @static
             * @param {yorha.retrieval.IGraphHopPolicy=} [properties] Properties to set
             * @returns {yorha.retrieval.GraphHopPolicy} GraphHopPolicy instance
             */
            GraphHopPolicy.create = function create(properties) {
                return new GraphHopPolicy(properties);
            };

            /**
             * Encodes the specified GraphHopPolicy message. Does not implicitly {@link yorha.retrieval.GraphHopPolicy.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.GraphHopPolicy
             * @static
             * @param {yorha.retrieval.IGraphHopPolicy} message GraphHopPolicy message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            GraphHopPolicy.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
            GraphHopPolicy.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a GraphHopPolicy message.
             * @function verify
             * @memberof yorha.retrieval.GraphHopPolicy
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            GraphHopPolicy.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.mode != null && message.hasOwnProperty("mode"))
                    if (!$util.isInteger(message.mode))
                        return "mode: integer expected";
                if (message.maxHopChunks != null && message.hasOwnProperty("maxHopChunks"))
                    if (!$util.isInteger(message.maxHopChunks))
                        return "maxHopChunks: integer expected";
                if (message.withinSameEvidenceOnly != null && message.hasOwnProperty("withinSameEvidenceOnly"))
                    if (typeof message.withinSameEvidenceOnly !== "boolean")
                        return "withinSameEvidenceOnly: boolean expected";
                return null;
            };

            /**
             * Creates a GraphHopPolicy message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.GraphHopPolicy
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.GraphHopPolicy} GraphHopPolicy
             */
            GraphHopPolicy.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.GraphHopPolicy)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.GraphHopPolicy();
                if (object.mode != null)
                    message.mode = object.mode | 0;
                if (object.maxHopChunks != null)
                    message.maxHopChunks = object.maxHopChunks | 0;
                if (object.withinSameEvidenceOnly != null)
                    message.withinSameEvidenceOnly = Boolean(object.withinSameEvidenceOnly);
                return message;
            };

            /**
             * Creates a plain object from a GraphHopPolicy message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.GraphHopPolicy
             * @static
             * @param {yorha.retrieval.GraphHopPolicy} message GraphHopPolicy
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            GraphHopPolicy.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.mode = 0;
                    object.maxHopChunks = 0;
                    object.withinSameEvidenceOnly = false;
                }
                if (message.mode != null && message.hasOwnProperty("mode"))
                    object.mode = message.mode;
                if (message.maxHopChunks != null && message.hasOwnProperty("maxHopChunks"))
                    object.maxHopChunks = message.maxHopChunks;
                if (message.withinSameEvidenceOnly != null && message.hasOwnProperty("withinSameEvidenceOnly"))
                    object.withinSameEvidenceOnly = message.withinSameEvidenceOnly;
                return object;
            };

            /**
             * Converts this GraphHopPolicy to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.GraphHopPolicy
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            GraphHopPolicy.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new PrefilterPolicy instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.PrefilterPolicy
             * @static
             * @param {yorha.retrieval.IPrefilterPolicy=} [properties] Properties to set
             * @returns {yorha.retrieval.PrefilterPolicy} PrefilterPolicy instance
             */
            PrefilterPolicy.create = function create(properties) {
                return new PrefilterPolicy(properties);
            };

            /**
             * Encodes the specified PrefilterPolicy message. Does not implicitly {@link yorha.retrieval.PrefilterPolicy.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.PrefilterPolicy
             * @static
             * @param {yorha.retrieval.IPrefilterPolicy} message PrefilterPolicy message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PrefilterPolicy.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
            PrefilterPolicy.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a PrefilterPolicy message.
             * @function verify
             * @memberof yorha.retrieval.PrefilterPolicy
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            PrefilterPolicy.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.enableQdrant != null && message.hasOwnProperty("enableQdrant"))
                    if (typeof message.enableQdrant !== "boolean")
                        return "enableQdrant: boolean expected";
                if (message.qdrantShortlist != null && message.hasOwnProperty("qdrantShortlist"))
                    if (!$util.isInteger(message.qdrantShortlist))
                        return "qdrantShortlist: integer expected";
                if (message.scoreThreshold != null && message.hasOwnProperty("scoreThreshold"))
                    if (typeof message.scoreThreshold !== "number")
                        return "scoreThreshold: number expected";
                if (message.allowPgvectorFallback != null && message.hasOwnProperty("allowPgvectorFallback"))
                    if (typeof message.allowPgvectorFallback !== "boolean")
                        return "allowPgvectorFallback: boolean expected";
                return null;
            };

            /**
             * Creates a PrefilterPolicy message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.PrefilterPolicy
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.PrefilterPolicy} PrefilterPolicy
             */
            PrefilterPolicy.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.PrefilterPolicy)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.PrefilterPolicy();
                if (object.enableQdrant != null)
                    message.enableQdrant = Boolean(object.enableQdrant);
                if (object.qdrantShortlist != null)
                    message.qdrantShortlist = object.qdrantShortlist | 0;
                if (object.scoreThreshold != null)
                    message.scoreThreshold = Number(object.scoreThreshold);
                if (object.allowPgvectorFallback != null)
                    message.allowPgvectorFallback = Boolean(object.allowPgvectorFallback);
                return message;
            };

            /**
             * Creates a plain object from a PrefilterPolicy message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.PrefilterPolicy
             * @static
             * @param {yorha.retrieval.PrefilterPolicy} message PrefilterPolicy
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            PrefilterPolicy.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.enableQdrant = false;
                    object.qdrantShortlist = 0;
                    object.scoreThreshold = 0;
                    object.allowPgvectorFallback = false;
                }
                if (message.enableQdrant != null && message.hasOwnProperty("enableQdrant"))
                    object.enableQdrant = message.enableQdrant;
                if (message.qdrantShortlist != null && message.hasOwnProperty("qdrantShortlist"))
                    object.qdrantShortlist = message.qdrantShortlist;
                if (message.scoreThreshold != null && message.hasOwnProperty("scoreThreshold"))
                    object.scoreThreshold = options.json && !isFinite(message.scoreThreshold) ? String(message.scoreThreshold) : message.scoreThreshold;
                if (message.allowPgvectorFallback != null && message.hasOwnProperty("allowPgvectorFallback"))
                    object.allowPgvectorFallback = message.allowPgvectorFallback;
                return object;
            };

            /**
             * Converts this PrefilterPolicy to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.PrefilterPolicy
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            PrefilterPolicy.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new RankPolicy instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.RankPolicy
             * @static
             * @param {yorha.retrieval.IRankPolicy=} [properties] Properties to set
             * @returns {yorha.retrieval.RankPolicy} RankPolicy instance
             */
            RankPolicy.create = function create(properties) {
                return new RankPolicy(properties);
            };

            /**
             * Encodes the specified RankPolicy message. Does not implicitly {@link yorha.retrieval.RankPolicy.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RankPolicy
             * @static
             * @param {yorha.retrieval.IRankPolicy} message RankPolicy message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RankPolicy.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
            RankPolicy.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a RankPolicy message.
             * @function verify
             * @memberof yorha.retrieval.RankPolicy
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            RankPolicy.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.cosineWeight != null && message.hasOwnProperty("cosineWeight"))
                    if (typeof message.cosineWeight !== "number")
                        return "cosineWeight: number expected";
                if (message.citationsWeight != null && message.hasOwnProperty("citationsWeight"))
                    if (typeof message.citationsWeight !== "number")
                        return "citationsWeight: number expected";
                if (message.jurisdictionWeight != null && message.hasOwnProperty("jurisdictionWeight"))
                    if (typeof message.jurisdictionWeight !== "number")
                        return "jurisdictionWeight: number expected";
                return null;
            };

            /**
             * Creates a RankPolicy message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.RankPolicy
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.RankPolicy} RankPolicy
             */
            RankPolicy.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.RankPolicy)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.RankPolicy();
                if (object.cosineWeight != null)
                    message.cosineWeight = Number(object.cosineWeight);
                if (object.citationsWeight != null)
                    message.citationsWeight = Number(object.citationsWeight);
                if (object.jurisdictionWeight != null)
                    message.jurisdictionWeight = Number(object.jurisdictionWeight);
                return message;
            };

            /**
             * Creates a plain object from a RankPolicy message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.RankPolicy
             * @static
             * @param {yorha.retrieval.RankPolicy} message RankPolicy
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            RankPolicy.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.cosineWeight = 0;
                    object.citationsWeight = 0;
                    object.jurisdictionWeight = 0;
                }
                if (message.cosineWeight != null && message.hasOwnProperty("cosineWeight"))
                    object.cosineWeight = options.json && !isFinite(message.cosineWeight) ? String(message.cosineWeight) : message.cosineWeight;
                if (message.citationsWeight != null && message.hasOwnProperty("citationsWeight"))
                    object.citationsWeight = options.json && !isFinite(message.citationsWeight) ? String(message.citationsWeight) : message.citationsWeight;
                if (message.jurisdictionWeight != null && message.hasOwnProperty("jurisdictionWeight"))
                    object.jurisdictionWeight = options.json && !isFinite(message.jurisdictionWeight) ? String(message.jurisdictionWeight) : message.jurisdictionWeight;
                return object;
            };

            /**
             * Converts this RankPolicy to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.RankPolicy
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            RankPolicy.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new RetrievalProgress instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.RetrievalProgress
             * @static
             * @param {yorha.retrieval.IRetrievalProgress=} [properties] Properties to set
             * @returns {yorha.retrieval.RetrievalProgress} RetrievalProgress instance
             */
            RetrievalProgress.create = function create(properties) {
                return new RetrievalProgress(properties);
            };

            /**
             * Encodes the specified RetrievalProgress message. Does not implicitly {@link yorha.retrieval.RetrievalProgress.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RetrievalProgress
             * @static
             * @param {yorha.retrieval.IRetrievalProgress} message RetrievalProgress message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalProgress.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
            RetrievalProgress.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a RetrievalProgress message.
             * @function verify
             * @memberof yorha.retrieval.RetrievalProgress
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            RetrievalProgress.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.stage != null && message.hasOwnProperty("stage"))
                    if (!$util.isString(message.stage))
                        return "stage: string expected";
                if (message.current != null && message.hasOwnProperty("current"))
                    if (!$util.isInteger(message.current))
                        return "current: integer expected";
                if (message.total != null && message.hasOwnProperty("total"))
                    if (!$util.isInteger(message.total))
                        return "total: integer expected";
                if (message.message != null && message.hasOwnProperty("message"))
                    if (!$util.isString(message.message))
                        return "message: string expected";
                return null;
            };

            /**
             * Creates a RetrievalProgress message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.RetrievalProgress
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.RetrievalProgress} RetrievalProgress
             */
            RetrievalProgress.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.RetrievalProgress)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.RetrievalProgress();
                if (object.stage != null)
                    message.stage = String(object.stage);
                if (object.current != null)
                    message.current = object.current | 0;
                if (object.total != null)
                    message.total = object.total | 0;
                if (object.message != null)
                    message.message = String(object.message);
                return message;
            };

            /**
             * Creates a plain object from a RetrievalProgress message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.RetrievalProgress
             * @static
             * @param {yorha.retrieval.RetrievalProgress} message RetrievalProgress
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            RetrievalProgress.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.stage = "";
                    object.current = 0;
                    object.total = 0;
                    object.message = "";
                }
                if (message.stage != null && message.hasOwnProperty("stage"))
                    object.stage = message.stage;
                if (message.current != null && message.hasOwnProperty("current"))
                    object.current = message.current;
                if (message.total != null && message.hasOwnProperty("total"))
                    object.total = message.total;
                if (message.message != null && message.hasOwnProperty("message"))
                    object.message = message.message;
                return object;
            };

            /**
             * Converts this RetrievalProgress to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.RetrievalProgress
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            RetrievalProgress.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new RetrievalError instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.RetrievalError
             * @static
             * @param {yorha.retrieval.IRetrievalError=} [properties] Properties to set
             * @returns {yorha.retrieval.RetrievalError} RetrievalError instance
             */
            RetrievalError.create = function create(properties) {
                return new RetrievalError(properties);
            };

            /**
             * Encodes the specified RetrievalError message. Does not implicitly {@link yorha.retrieval.RetrievalError.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RetrievalError
             * @static
             * @param {yorha.retrieval.IRetrievalError} message RetrievalError message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalError.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
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
            RetrievalError.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a RetrievalError message.
             * @function verify
             * @memberof yorha.retrieval.RetrievalError
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            RetrievalError.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.code != null && message.hasOwnProperty("code"))
                    if (!$util.isString(message.code))
                        return "code: string expected";
                if (message.message != null && message.hasOwnProperty("message"))
                    if (!$util.isString(message.message))
                        return "message: string expected";
                if (message.detailsJson != null && message.hasOwnProperty("detailsJson"))
                    if (!$util.isString(message.detailsJson))
                        return "detailsJson: string expected";
                return null;
            };

            /**
             * Creates a RetrievalError message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.RetrievalError
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.RetrievalError} RetrievalError
             */
            RetrievalError.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.RetrievalError)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.RetrievalError();
                if (object.code != null)
                    message.code = String(object.code);
                if (object.message != null)
                    message.message = String(object.message);
                if (object.detailsJson != null)
                    message.detailsJson = String(object.detailsJson);
                return message;
            };

            /**
             * Creates a plain object from a RetrievalError message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.RetrievalError
             * @static
             * @param {yorha.retrieval.RetrievalError} message RetrievalError
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            RetrievalError.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.code = "";
                    object.message = "";
                    object.detailsJson = "";
                }
                if (message.code != null && message.hasOwnProperty("code"))
                    object.code = message.code;
                if (message.message != null && message.hasOwnProperty("message"))
                    object.message = message.message;
                if (message.detailsJson != null && message.hasOwnProperty("detailsJson"))
                    object.detailsJson = message.detailsJson;
                return object;
            };

            /**
             * Converts this RetrievalError to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.RetrievalError
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            RetrievalError.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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

        retrieval.RetrievalSourceMetadata = (function() {

            /**
             * Properties of a RetrievalSourceMetadata.
             * @memberof yorha.retrieval
             * @interface IRetrievalSourceMetadata
             * @property {string|null} [source] RetrievalSourceMetadata source
             * @property {string|null} [sourceId] RetrievalSourceMetadata sourceId
             * @property {string|null} [sourceType] RetrievalSourceMetadata sourceType
             * @property {string|null} [url] RetrievalSourceMetadata url
             * @property {string|null} [title] RetrievalSourceMetadata title
             * @property {string|null} [filePath] RetrievalSourceMetadata filePath
             * @property {string|null} [routeId] RetrievalSourceMetadata routeId
             * @property {string|null} [collection] RetrievalSourceMetadata collection
             * @property {Object.<string,string>|null} [metadata] RetrievalSourceMetadata metadata
             */

            /**
             * Constructs a new RetrievalSourceMetadata.
             * @memberof yorha.retrieval
             * @classdesc Represents a RetrievalSourceMetadata.
             * @implements IRetrievalSourceMetadata
             * @constructor
             * @param {yorha.retrieval.IRetrievalSourceMetadata=} [properties] Properties to set
             */
            function RetrievalSourceMetadata(properties) {
                this.metadata = {};
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * RetrievalSourceMetadata source.
             * @member {string} source
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @instance
             */
            RetrievalSourceMetadata.prototype.source = "";

            /**
             * RetrievalSourceMetadata sourceId.
             * @member {string} sourceId
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @instance
             */
            RetrievalSourceMetadata.prototype.sourceId = "";

            /**
             * RetrievalSourceMetadata sourceType.
             * @member {string} sourceType
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @instance
             */
            RetrievalSourceMetadata.prototype.sourceType = "";

            /**
             * RetrievalSourceMetadata url.
             * @member {string} url
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @instance
             */
            RetrievalSourceMetadata.prototype.url = "";

            /**
             * RetrievalSourceMetadata title.
             * @member {string} title
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @instance
             */
            RetrievalSourceMetadata.prototype.title = "";

            /**
             * RetrievalSourceMetadata filePath.
             * @member {string} filePath
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @instance
             */
            RetrievalSourceMetadata.prototype.filePath = "";

            /**
             * RetrievalSourceMetadata routeId.
             * @member {string} routeId
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @instance
             */
            RetrievalSourceMetadata.prototype.routeId = "";

            /**
             * RetrievalSourceMetadata collection.
             * @member {string} collection
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @instance
             */
            RetrievalSourceMetadata.prototype.collection = "";

            /**
             * RetrievalSourceMetadata metadata.
             * @member {Object.<string,string>} metadata
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @instance
             */
            RetrievalSourceMetadata.prototype.metadata = $util.emptyObject;

            /**
             * Creates a new RetrievalSourceMetadata instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @static
             * @param {yorha.retrieval.IRetrievalSourceMetadata=} [properties] Properties to set
             * @returns {yorha.retrieval.RetrievalSourceMetadata} RetrievalSourceMetadata instance
             */
            RetrievalSourceMetadata.create = function create(properties) {
                return new RetrievalSourceMetadata(properties);
            };

            /**
             * Encodes the specified RetrievalSourceMetadata message. Does not implicitly {@link yorha.retrieval.RetrievalSourceMetadata.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @static
             * @param {yorha.retrieval.IRetrievalSourceMetadata} message RetrievalSourceMetadata message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalSourceMetadata.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.source != null && Object.hasOwnProperty.call(message, "source"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.source);
                if (message.sourceId != null && Object.hasOwnProperty.call(message, "sourceId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.sourceId);
                if (message.sourceType != null && Object.hasOwnProperty.call(message, "sourceType"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.sourceType);
                if (message.url != null && Object.hasOwnProperty.call(message, "url"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.url);
                if (message.title != null && Object.hasOwnProperty.call(message, "title"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.title);
                if (message.filePath != null && Object.hasOwnProperty.call(message, "filePath"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.filePath);
                if (message.routeId != null && Object.hasOwnProperty.call(message, "routeId"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.routeId);
                if (message.collection != null && Object.hasOwnProperty.call(message, "collection"))
                    writer.uint32(/* id 8, wireType 2 =*/66).string(message.collection);
                if (message.metadata != null && Object.hasOwnProperty.call(message, "metadata"))
                    for (let keys = Object.keys(message.metadata), i = 0; i < keys.length; ++i)
                        writer.uint32(/* id 9, wireType 2 =*/74).fork().uint32(/* id 1, wireType 2 =*/10).string(keys[i]).uint32(/* id 2, wireType 2 =*/18).string(message.metadata[keys[i]]).ldelim();
                return writer;
            };

            /**
             * Encodes the specified RetrievalSourceMetadata message, length delimited. Does not implicitly {@link yorha.retrieval.RetrievalSourceMetadata.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @static
             * @param {yorha.retrieval.IRetrievalSourceMetadata} message RetrievalSourceMetadata message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalSourceMetadata.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a RetrievalSourceMetadata message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.RetrievalSourceMetadata} RetrievalSourceMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RetrievalSourceMetadata.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.RetrievalSourceMetadata(), key, value;
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.source = reader.string();
                            break;
                        }
                    case 2: {
                            message.sourceId = reader.string();
                            break;
                        }
                    case 3: {
                            message.sourceType = reader.string();
                            break;
                        }
                    case 4: {
                            message.url = reader.string();
                            break;
                        }
                    case 5: {
                            message.title = reader.string();
                            break;
                        }
                    case 6: {
                            message.filePath = reader.string();
                            break;
                        }
                    case 7: {
                            message.routeId = reader.string();
                            break;
                        }
                    case 8: {
                            message.collection = reader.string();
                            break;
                        }
                    case 9: {
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
             * Decodes a RetrievalSourceMetadata message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.RetrievalSourceMetadata} RetrievalSourceMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RetrievalSourceMetadata.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a RetrievalSourceMetadata message.
             * @function verify
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            RetrievalSourceMetadata.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.source != null && message.hasOwnProperty("source"))
                    if (!$util.isString(message.source))
                        return "source: string expected";
                if (message.sourceId != null && message.hasOwnProperty("sourceId"))
                    if (!$util.isString(message.sourceId))
                        return "sourceId: string expected";
                if (message.sourceType != null && message.hasOwnProperty("sourceType"))
                    if (!$util.isString(message.sourceType))
                        return "sourceType: string expected";
                if (message.url != null && message.hasOwnProperty("url"))
                    if (!$util.isString(message.url))
                        return "url: string expected";
                if (message.title != null && message.hasOwnProperty("title"))
                    if (!$util.isString(message.title))
                        return "title: string expected";
                if (message.filePath != null && message.hasOwnProperty("filePath"))
                    if (!$util.isString(message.filePath))
                        return "filePath: string expected";
                if (message.routeId != null && message.hasOwnProperty("routeId"))
                    if (!$util.isString(message.routeId))
                        return "routeId: string expected";
                if (message.collection != null && message.hasOwnProperty("collection"))
                    if (!$util.isString(message.collection))
                        return "collection: string expected";
                if (message.metadata != null && message.hasOwnProperty("metadata")) {
                    if (!$util.isObject(message.metadata))
                        return "metadata: object expected";
                    let key = Object.keys(message.metadata);
                    for (let i = 0; i < key.length; ++i)
                        if (!$util.isString(message.metadata[key[i]]))
                            return "metadata: string{k:string} expected";
                }
                return null;
            };

            /**
             * Creates a RetrievalSourceMetadata message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.RetrievalSourceMetadata} RetrievalSourceMetadata
             */
            RetrievalSourceMetadata.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.RetrievalSourceMetadata)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.RetrievalSourceMetadata();
                if (object.source != null)
                    message.source = String(object.source);
                if (object.sourceId != null)
                    message.sourceId = String(object.sourceId);
                if (object.sourceType != null)
                    message.sourceType = String(object.sourceType);
                if (object.url != null)
                    message.url = String(object.url);
                if (object.title != null)
                    message.title = String(object.title);
                if (object.filePath != null)
                    message.filePath = String(object.filePath);
                if (object.routeId != null)
                    message.routeId = String(object.routeId);
                if (object.collection != null)
                    message.collection = String(object.collection);
                if (object.metadata) {
                    if (typeof object.metadata !== "object")
                        throw TypeError(".yorha.retrieval.RetrievalSourceMetadata.metadata: object expected");
                    message.metadata = {};
                    for (let keys = Object.keys(object.metadata), i = 0; i < keys.length; ++i) {
                        if (keys[i] === "__proto__")
                            $util.makeProp(message.metadata, keys[i]);
                        message.metadata[keys[i]] = String(object.metadata[keys[i]]);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a RetrievalSourceMetadata message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @static
             * @param {yorha.retrieval.RetrievalSourceMetadata} message RetrievalSourceMetadata
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            RetrievalSourceMetadata.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.objects || options.defaults)
                    object.metadata = {};
                if (options.defaults) {
                    object.source = "";
                    object.sourceId = "";
                    object.sourceType = "";
                    object.url = "";
                    object.title = "";
                    object.filePath = "";
                    object.routeId = "";
                    object.collection = "";
                }
                if (message.source != null && message.hasOwnProperty("source"))
                    object.source = message.source;
                if (message.sourceId != null && message.hasOwnProperty("sourceId"))
                    object.sourceId = message.sourceId;
                if (message.sourceType != null && message.hasOwnProperty("sourceType"))
                    object.sourceType = message.sourceType;
                if (message.url != null && message.hasOwnProperty("url"))
                    object.url = message.url;
                if (message.title != null && message.hasOwnProperty("title"))
                    object.title = message.title;
                if (message.filePath != null && message.hasOwnProperty("filePath"))
                    object.filePath = message.filePath;
                if (message.routeId != null && message.hasOwnProperty("routeId"))
                    object.routeId = message.routeId;
                if (message.collection != null && message.hasOwnProperty("collection"))
                    object.collection = message.collection;
                let keys2;
                if (message.metadata && (keys2 = Object.keys(message.metadata)).length) {
                    object.metadata = {};
                    for (let j = 0; j < keys2.length; ++j) {
                        if (keys2[j] === "__proto__")
                            $util.makeProp(object.metadata, keys2[j]);
                        object.metadata[keys2[j]] = message.metadata[keys2[j]];
                    }
                }
                return object;
            };

            /**
             * Converts this RetrievalSourceMetadata to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            RetrievalSourceMetadata.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for RetrievalSourceMetadata
             * @function getTypeUrl
             * @memberof yorha.retrieval.RetrievalSourceMetadata
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            RetrievalSourceMetadata.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.RetrievalSourceMetadata";
            };

            return RetrievalSourceMetadata;
        })();

        retrieval.RetrievalScoreMetadata = (function() {

            /**
             * Properties of a RetrievalScoreMetadata.
             * @memberof yorha.retrieval
             * @interface IRetrievalScoreMetadata
             * @property {number|null} [score] RetrievalScoreMetadata score
             * @property {number|null} [semanticScore] RetrievalScoreMetadata semanticScore
             * @property {number|null} [lexicalScore] RetrievalScoreMetadata lexicalScore
             * @property {number|null} [rerankScore] RetrievalScoreMetadata rerankScore
             */

            /**
             * Constructs a new RetrievalScoreMetadata.
             * @memberof yorha.retrieval
             * @classdesc Represents a RetrievalScoreMetadata.
             * @implements IRetrievalScoreMetadata
             * @constructor
             * @param {yorha.retrieval.IRetrievalScoreMetadata=} [properties] Properties to set
             */
            function RetrievalScoreMetadata(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * RetrievalScoreMetadata score.
             * @member {number} score
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @instance
             */
            RetrievalScoreMetadata.prototype.score = 0;

            /**
             * RetrievalScoreMetadata semanticScore.
             * @member {number} semanticScore
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @instance
             */
            RetrievalScoreMetadata.prototype.semanticScore = 0;

            /**
             * RetrievalScoreMetadata lexicalScore.
             * @member {number} lexicalScore
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @instance
             */
            RetrievalScoreMetadata.prototype.lexicalScore = 0;

            /**
             * RetrievalScoreMetadata rerankScore.
             * @member {number} rerankScore
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @instance
             */
            RetrievalScoreMetadata.prototype.rerankScore = 0;

            /**
             * Creates a new RetrievalScoreMetadata instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @static
             * @param {yorha.retrieval.IRetrievalScoreMetadata=} [properties] Properties to set
             * @returns {yorha.retrieval.RetrievalScoreMetadata} RetrievalScoreMetadata instance
             */
            RetrievalScoreMetadata.create = function create(properties) {
                return new RetrievalScoreMetadata(properties);
            };

            /**
             * Encodes the specified RetrievalScoreMetadata message. Does not implicitly {@link yorha.retrieval.RetrievalScoreMetadata.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @static
             * @param {yorha.retrieval.IRetrievalScoreMetadata} message RetrievalScoreMetadata message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalScoreMetadata.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.score != null && Object.hasOwnProperty.call(message, "score"))
                    writer.uint32(/* id 1, wireType 5 =*/13).float(message.score);
                if (message.semanticScore != null && Object.hasOwnProperty.call(message, "semanticScore"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.semanticScore);
                if (message.lexicalScore != null && Object.hasOwnProperty.call(message, "lexicalScore"))
                    writer.uint32(/* id 3, wireType 5 =*/29).float(message.lexicalScore);
                if (message.rerankScore != null && Object.hasOwnProperty.call(message, "rerankScore"))
                    writer.uint32(/* id 4, wireType 5 =*/37).float(message.rerankScore);
                return writer;
            };

            /**
             * Encodes the specified RetrievalScoreMetadata message, length delimited. Does not implicitly {@link yorha.retrieval.RetrievalScoreMetadata.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @static
             * @param {yorha.retrieval.IRetrievalScoreMetadata} message RetrievalScoreMetadata message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalScoreMetadata.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a RetrievalScoreMetadata message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.RetrievalScoreMetadata} RetrievalScoreMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RetrievalScoreMetadata.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.RetrievalScoreMetadata();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.score = reader.float();
                            break;
                        }
                    case 2: {
                            message.semanticScore = reader.float();
                            break;
                        }
                    case 3: {
                            message.lexicalScore = reader.float();
                            break;
                        }
                    case 4: {
                            message.rerankScore = reader.float();
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
             * Decodes a RetrievalScoreMetadata message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.RetrievalScoreMetadata} RetrievalScoreMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RetrievalScoreMetadata.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a RetrievalScoreMetadata message.
             * @function verify
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            RetrievalScoreMetadata.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.score != null && message.hasOwnProperty("score"))
                    if (typeof message.score !== "number")
                        return "score: number expected";
                if (message.semanticScore != null && message.hasOwnProperty("semanticScore"))
                    if (typeof message.semanticScore !== "number")
                        return "semanticScore: number expected";
                if (message.lexicalScore != null && message.hasOwnProperty("lexicalScore"))
                    if (typeof message.lexicalScore !== "number")
                        return "lexicalScore: number expected";
                if (message.rerankScore != null && message.hasOwnProperty("rerankScore"))
                    if (typeof message.rerankScore !== "number")
                        return "rerankScore: number expected";
                return null;
            };

            /**
             * Creates a RetrievalScoreMetadata message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.RetrievalScoreMetadata} RetrievalScoreMetadata
             */
            RetrievalScoreMetadata.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.RetrievalScoreMetadata)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.RetrievalScoreMetadata();
                if (object.score != null)
                    message.score = Number(object.score);
                if (object.semanticScore != null)
                    message.semanticScore = Number(object.semanticScore);
                if (object.lexicalScore != null)
                    message.lexicalScore = Number(object.lexicalScore);
                if (object.rerankScore != null)
                    message.rerankScore = Number(object.rerankScore);
                return message;
            };

            /**
             * Creates a plain object from a RetrievalScoreMetadata message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @static
             * @param {yorha.retrieval.RetrievalScoreMetadata} message RetrievalScoreMetadata
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            RetrievalScoreMetadata.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.score = 0;
                    object.semanticScore = 0;
                    object.lexicalScore = 0;
                    object.rerankScore = 0;
                }
                if (message.score != null && message.hasOwnProperty("score"))
                    object.score = options.json && !isFinite(message.score) ? String(message.score) : message.score;
                if (message.semanticScore != null && message.hasOwnProperty("semanticScore"))
                    object.semanticScore = options.json && !isFinite(message.semanticScore) ? String(message.semanticScore) : message.semanticScore;
                if (message.lexicalScore != null && message.hasOwnProperty("lexicalScore"))
                    object.lexicalScore = options.json && !isFinite(message.lexicalScore) ? String(message.lexicalScore) : message.lexicalScore;
                if (message.rerankScore != null && message.hasOwnProperty("rerankScore"))
                    object.rerankScore = options.json && !isFinite(message.rerankScore) ? String(message.rerankScore) : message.rerankScore;
                return object;
            };

            /**
             * Converts this RetrievalScoreMetadata to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            RetrievalScoreMetadata.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for RetrievalScoreMetadata
             * @function getTypeUrl
             * @memberof yorha.retrieval.RetrievalScoreMetadata
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            RetrievalScoreMetadata.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.RetrievalScoreMetadata";
            };

            return RetrievalScoreMetadata;
        })();

        retrieval.RetrievalClusterMetadata = (function() {

            /**
             * Properties of a RetrievalClusterMetadata.
             * @memberof yorha.retrieval
             * @interface IRetrievalClusterMetadata
             * @property {string|null} [clusterId] RetrievalClusterMetadata clusterId
             * @property {string|null} [clusterType] RetrievalClusterMetadata clusterType
             * @property {number|null} [gpuCluster] RetrievalClusterMetadata gpuCluster
             * @property {number|null} [somCluster] RetrievalClusterMetadata somCluster
             * @property {number|null} [bmuRow] RetrievalClusterMetadata bmuRow
             * @property {number|null} [bmuCol] RetrievalClusterMetadata bmuCol
             */

            /**
             * Constructs a new RetrievalClusterMetadata.
             * @memberof yorha.retrieval
             * @classdesc Represents a RetrievalClusterMetadata.
             * @implements IRetrievalClusterMetadata
             * @constructor
             * @param {yorha.retrieval.IRetrievalClusterMetadata=} [properties] Properties to set
             */
            function RetrievalClusterMetadata(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * RetrievalClusterMetadata clusterId.
             * @member {string} clusterId
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @instance
             */
            RetrievalClusterMetadata.prototype.clusterId = "";

            /**
             * RetrievalClusterMetadata clusterType.
             * @member {string} clusterType
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @instance
             */
            RetrievalClusterMetadata.prototype.clusterType = "";

            /**
             * RetrievalClusterMetadata gpuCluster.
             * @member {number} gpuCluster
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @instance
             */
            RetrievalClusterMetadata.prototype.gpuCluster = 0;

            /**
             * RetrievalClusterMetadata somCluster.
             * @member {number} somCluster
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @instance
             */
            RetrievalClusterMetadata.prototype.somCluster = 0;

            /**
             * RetrievalClusterMetadata bmuRow.
             * @member {number} bmuRow
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @instance
             */
            RetrievalClusterMetadata.prototype.bmuRow = 0;

            /**
             * RetrievalClusterMetadata bmuCol.
             * @member {number} bmuCol
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @instance
             */
            RetrievalClusterMetadata.prototype.bmuCol = 0;

            /**
             * Creates a new RetrievalClusterMetadata instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @static
             * @param {yorha.retrieval.IRetrievalClusterMetadata=} [properties] Properties to set
             * @returns {yorha.retrieval.RetrievalClusterMetadata} RetrievalClusterMetadata instance
             */
            RetrievalClusterMetadata.create = function create(properties) {
                return new RetrievalClusterMetadata(properties);
            };

            /**
             * Encodes the specified RetrievalClusterMetadata message. Does not implicitly {@link yorha.retrieval.RetrievalClusterMetadata.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @static
             * @param {yorha.retrieval.IRetrievalClusterMetadata} message RetrievalClusterMetadata message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalClusterMetadata.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.clusterId != null && Object.hasOwnProperty.call(message, "clusterId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.clusterId);
                if (message.clusterType != null && Object.hasOwnProperty.call(message, "clusterType"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.clusterType);
                if (message.gpuCluster != null && Object.hasOwnProperty.call(message, "gpuCluster"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.gpuCluster);
                if (message.somCluster != null && Object.hasOwnProperty.call(message, "somCluster"))
                    writer.uint32(/* id 4, wireType 0 =*/32).int32(message.somCluster);
                if (message.bmuRow != null && Object.hasOwnProperty.call(message, "bmuRow"))
                    writer.uint32(/* id 5, wireType 0 =*/40).int32(message.bmuRow);
                if (message.bmuCol != null && Object.hasOwnProperty.call(message, "bmuCol"))
                    writer.uint32(/* id 6, wireType 0 =*/48).int32(message.bmuCol);
                return writer;
            };

            /**
             * Encodes the specified RetrievalClusterMetadata message, length delimited. Does not implicitly {@link yorha.retrieval.RetrievalClusterMetadata.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @static
             * @param {yorha.retrieval.IRetrievalClusterMetadata} message RetrievalClusterMetadata message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RetrievalClusterMetadata.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a RetrievalClusterMetadata message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.RetrievalClusterMetadata} RetrievalClusterMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RetrievalClusterMetadata.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.RetrievalClusterMetadata();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.clusterId = reader.string();
                            break;
                        }
                    case 2: {
                            message.clusterType = reader.string();
                            break;
                        }
                    case 3: {
                            message.gpuCluster = reader.int32();
                            break;
                        }
                    case 4: {
                            message.somCluster = reader.int32();
                            break;
                        }
                    case 5: {
                            message.bmuRow = reader.int32();
                            break;
                        }
                    case 6: {
                            message.bmuCol = reader.int32();
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
             * Decodes a RetrievalClusterMetadata message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.RetrievalClusterMetadata} RetrievalClusterMetadata
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RetrievalClusterMetadata.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a RetrievalClusterMetadata message.
             * @function verify
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            RetrievalClusterMetadata.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.clusterId != null && message.hasOwnProperty("clusterId"))
                    if (!$util.isString(message.clusterId))
                        return "clusterId: string expected";
                if (message.clusterType != null && message.hasOwnProperty("clusterType"))
                    if (!$util.isString(message.clusterType))
                        return "clusterType: string expected";
                if (message.gpuCluster != null && message.hasOwnProperty("gpuCluster"))
                    if (!$util.isInteger(message.gpuCluster))
                        return "gpuCluster: integer expected";
                if (message.somCluster != null && message.hasOwnProperty("somCluster"))
                    if (!$util.isInteger(message.somCluster))
                        return "somCluster: integer expected";
                if (message.bmuRow != null && message.hasOwnProperty("bmuRow"))
                    if (!$util.isInteger(message.bmuRow))
                        return "bmuRow: integer expected";
                if (message.bmuCol != null && message.hasOwnProperty("bmuCol"))
                    if (!$util.isInteger(message.bmuCol))
                        return "bmuCol: integer expected";
                return null;
            };

            /**
             * Creates a RetrievalClusterMetadata message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.RetrievalClusterMetadata} RetrievalClusterMetadata
             */
            RetrievalClusterMetadata.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.RetrievalClusterMetadata)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.RetrievalClusterMetadata();
                if (object.clusterId != null)
                    message.clusterId = String(object.clusterId);
                if (object.clusterType != null)
                    message.clusterType = String(object.clusterType);
                if (object.gpuCluster != null)
                    message.gpuCluster = object.gpuCluster | 0;
                if (object.somCluster != null)
                    message.somCluster = object.somCluster | 0;
                if (object.bmuRow != null)
                    message.bmuRow = object.bmuRow | 0;
                if (object.bmuCol != null)
                    message.bmuCol = object.bmuCol | 0;
                return message;
            };

            /**
             * Creates a plain object from a RetrievalClusterMetadata message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @static
             * @param {yorha.retrieval.RetrievalClusterMetadata} message RetrievalClusterMetadata
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            RetrievalClusterMetadata.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.clusterId = "";
                    object.clusterType = "";
                    object.gpuCluster = 0;
                    object.somCluster = 0;
                    object.bmuRow = 0;
                    object.bmuCol = 0;
                }
                if (message.clusterId != null && message.hasOwnProperty("clusterId"))
                    object.clusterId = message.clusterId;
                if (message.clusterType != null && message.hasOwnProperty("clusterType"))
                    object.clusterType = message.clusterType;
                if (message.gpuCluster != null && message.hasOwnProperty("gpuCluster"))
                    object.gpuCluster = message.gpuCluster;
                if (message.somCluster != null && message.hasOwnProperty("somCluster"))
                    object.somCluster = message.somCluster;
                if (message.bmuRow != null && message.hasOwnProperty("bmuRow"))
                    object.bmuRow = message.bmuRow;
                if (message.bmuCol != null && message.hasOwnProperty("bmuCol"))
                    object.bmuCol = message.bmuCol;
                return object;
            };

            /**
             * Converts this RetrievalClusterMetadata to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            RetrievalClusterMetadata.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for RetrievalClusterMetadata
             * @function getTypeUrl
             * @memberof yorha.retrieval.RetrievalClusterMetadata
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            RetrievalClusterMetadata.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.RetrievalClusterMetadata";
            };

            return RetrievalClusterMetadata;
        })();

        retrieval.TransportTimestamps = (function() {

            /**
             * Properties of a TransportTimestamps.
             * @memberof yorha.retrieval
             * @interface ITransportTimestamps
             * @property {string|null} [createdAt] TransportTimestamps createdAt
             * @property {string|null} [updatedAt] TransportTimestamps updatedAt
             * @property {string|null} [indexedAt] TransportTimestamps indexedAt
             */

            /**
             * Constructs a new TransportTimestamps.
             * @memberof yorha.retrieval
             * @classdesc Represents a TransportTimestamps.
             * @implements ITransportTimestamps
             * @constructor
             * @param {yorha.retrieval.ITransportTimestamps=} [properties] Properties to set
             */
            function TransportTimestamps(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * TransportTimestamps createdAt.
             * @member {string} createdAt
             * @memberof yorha.retrieval.TransportTimestamps
             * @instance
             */
            TransportTimestamps.prototype.createdAt = "";

            /**
             * TransportTimestamps updatedAt.
             * @member {string} updatedAt
             * @memberof yorha.retrieval.TransportTimestamps
             * @instance
             */
            TransportTimestamps.prototype.updatedAt = "";

            /**
             * TransportTimestamps indexedAt.
             * @member {string} indexedAt
             * @memberof yorha.retrieval.TransportTimestamps
             * @instance
             */
            TransportTimestamps.prototype.indexedAt = "";

            /**
             * Creates a new TransportTimestamps instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.TransportTimestamps
             * @static
             * @param {yorha.retrieval.ITransportTimestamps=} [properties] Properties to set
             * @returns {yorha.retrieval.TransportTimestamps} TransportTimestamps instance
             */
            TransportTimestamps.create = function create(properties) {
                return new TransportTimestamps(properties);
            };

            /**
             * Encodes the specified TransportTimestamps message. Does not implicitly {@link yorha.retrieval.TransportTimestamps.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.TransportTimestamps
             * @static
             * @param {yorha.retrieval.ITransportTimestamps} message TransportTimestamps message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TransportTimestamps.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.createdAt != null && Object.hasOwnProperty.call(message, "createdAt"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.createdAt);
                if (message.updatedAt != null && Object.hasOwnProperty.call(message, "updatedAt"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.updatedAt);
                if (message.indexedAt != null && Object.hasOwnProperty.call(message, "indexedAt"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.indexedAt);
                return writer;
            };

            /**
             * Encodes the specified TransportTimestamps message, length delimited. Does not implicitly {@link yorha.retrieval.TransportTimestamps.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.TransportTimestamps
             * @static
             * @param {yorha.retrieval.ITransportTimestamps} message TransportTimestamps message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TransportTimestamps.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a TransportTimestamps message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.TransportTimestamps
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.TransportTimestamps} TransportTimestamps
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TransportTimestamps.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.TransportTimestamps();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.createdAt = reader.string();
                            break;
                        }
                    case 2: {
                            message.updatedAt = reader.string();
                            break;
                        }
                    case 3: {
                            message.indexedAt = reader.string();
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
             * Decodes a TransportTimestamps message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.TransportTimestamps
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.TransportTimestamps} TransportTimestamps
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TransportTimestamps.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a TransportTimestamps message.
             * @function verify
             * @memberof yorha.retrieval.TransportTimestamps
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            TransportTimestamps.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                    if (!$util.isString(message.createdAt))
                        return "createdAt: string expected";
                if (message.updatedAt != null && message.hasOwnProperty("updatedAt"))
                    if (!$util.isString(message.updatedAt))
                        return "updatedAt: string expected";
                if (message.indexedAt != null && message.hasOwnProperty("indexedAt"))
                    if (!$util.isString(message.indexedAt))
                        return "indexedAt: string expected";
                return null;
            };

            /**
             * Creates a TransportTimestamps message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.TransportTimestamps
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.TransportTimestamps} TransportTimestamps
             */
            TransportTimestamps.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.TransportTimestamps)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.TransportTimestamps();
                if (object.createdAt != null)
                    message.createdAt = String(object.createdAt);
                if (object.updatedAt != null)
                    message.updatedAt = String(object.updatedAt);
                if (object.indexedAt != null)
                    message.indexedAt = String(object.indexedAt);
                return message;
            };

            /**
             * Creates a plain object from a TransportTimestamps message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.TransportTimestamps
             * @static
             * @param {yorha.retrieval.TransportTimestamps} message TransportTimestamps
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            TransportTimestamps.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.createdAt = "";
                    object.updatedAt = "";
                    object.indexedAt = "";
                }
                if (message.createdAt != null && message.hasOwnProperty("createdAt"))
                    object.createdAt = message.createdAt;
                if (message.updatedAt != null && message.hasOwnProperty("updatedAt"))
                    object.updatedAt = message.updatedAt;
                if (message.indexedAt != null && message.hasOwnProperty("indexedAt"))
                    object.indexedAt = message.indexedAt;
                return object;
            };

            /**
             * Converts this TransportTimestamps to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.TransportTimestamps
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            TransportTimestamps.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for TransportTimestamps
             * @function getTypeUrl
             * @memberof yorha.retrieval.TransportTimestamps
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            TransportTimestamps.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.TransportTimestamps";
            };

            return TransportTimestamps;
        })();

        retrieval.SearchChunksRequest = (function() {

            /**
             * Properties of a SearchChunksRequest.
             * @memberof yorha.retrieval
             * @interface ISearchChunksRequest
             * @property {string|null} [query] SearchChunksRequest query
             * @property {number|null} [limit] SearchChunksRequest limit
             * @property {string|null} [collection] SearchChunksRequest collection
             * @property {Array.<string>|null} [filters] SearchChunksRequest filters
             * @property {Array.<string>|null} [ids] SearchChunksRequest ids
             * @property {Array.<string>|null} [tags] SearchChunksRequest tags
             * @property {Array.<string>|null} [sourceFilter] SearchChunksRequest sourceFilter
             * @property {Array.<string>|null} [clusterIds] SearchChunksRequest clusterIds
             * @property {Array.<number>|null} [somClusters] SearchChunksRequest somClusters
             * @property {string|null} [createdAfter] SearchChunksRequest createdAfter
             * @property {string|null} [updatedAfter] SearchChunksRequest updatedAfter
             */

            /**
             * Constructs a new SearchChunksRequest.
             * @memberof yorha.retrieval
             * @classdesc Represents a SearchChunksRequest.
             * @implements ISearchChunksRequest
             * @constructor
             * @param {yorha.retrieval.ISearchChunksRequest=} [properties] Properties to set
             */
            function SearchChunksRequest(properties) {
                this.filters = [];
                this.ids = [];
                this.tags = [];
                this.sourceFilter = [];
                this.clusterIds = [];
                this.somClusters = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SearchChunksRequest query.
             * @member {string} query
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.query = "";

            /**
             * SearchChunksRequest limit.
             * @member {number} limit
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.limit = 0;

            /**
             * SearchChunksRequest collection.
             * @member {string} collection
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.collection = "";

            /**
             * SearchChunksRequest filters.
             * @member {Array.<string>} filters
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.filters = $util.emptyArray;

            /**
             * SearchChunksRequest ids.
             * @member {Array.<string>} ids
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.ids = $util.emptyArray;

            /**
             * SearchChunksRequest tags.
             * @member {Array.<string>} tags
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.tags = $util.emptyArray;

            /**
             * SearchChunksRequest sourceFilter.
             * @member {Array.<string>} sourceFilter
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.sourceFilter = $util.emptyArray;

            /**
             * SearchChunksRequest clusterIds.
             * @member {Array.<string>} clusterIds
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.clusterIds = $util.emptyArray;

            /**
             * SearchChunksRequest somClusters.
             * @member {Array.<number>} somClusters
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.somClusters = $util.emptyArray;

            /**
             * SearchChunksRequest createdAfter.
             * @member {string} createdAfter
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.createdAfter = "";

            /**
             * SearchChunksRequest updatedAfter.
             * @member {string} updatedAfter
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             */
            SearchChunksRequest.prototype.updatedAfter = "";

            /**
             * Creates a new SearchChunksRequest instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.SearchChunksRequest
             * @static
             * @param {yorha.retrieval.ISearchChunksRequest=} [properties] Properties to set
             * @returns {yorha.retrieval.SearchChunksRequest} SearchChunksRequest instance
             */
            SearchChunksRequest.create = function create(properties) {
                return new SearchChunksRequest(properties);
            };

            /**
             * Encodes the specified SearchChunksRequest message. Does not implicitly {@link yorha.retrieval.SearchChunksRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.SearchChunksRequest
             * @static
             * @param {yorha.retrieval.ISearchChunksRequest} message SearchChunksRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchChunksRequest.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.query != null && Object.hasOwnProperty.call(message, "query"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.query);
                if (message.limit != null && Object.hasOwnProperty.call(message, "limit"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.limit);
                if (message.collection != null && Object.hasOwnProperty.call(message, "collection"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.collection);
                if (message.filters != null && message.filters.length)
                    for (let i = 0; i < message.filters.length; ++i)
                        writer.uint32(/* id 4, wireType 2 =*/34).string(message.filters[i]);
                if (message.ids != null && message.ids.length)
                    for (let i = 0; i < message.ids.length; ++i)
                        writer.uint32(/* id 5, wireType 2 =*/42).string(message.ids[i]);
                if (message.tags != null && message.tags.length)
                    for (let i = 0; i < message.tags.length; ++i)
                        writer.uint32(/* id 6, wireType 2 =*/50).string(message.tags[i]);
                if (message.sourceFilter != null && message.sourceFilter.length)
                    for (let i = 0; i < message.sourceFilter.length; ++i)
                        writer.uint32(/* id 7, wireType 2 =*/58).string(message.sourceFilter[i]);
                if (message.clusterIds != null && message.clusterIds.length)
                    for (let i = 0; i < message.clusterIds.length; ++i)
                        writer.uint32(/* id 8, wireType 2 =*/66).string(message.clusterIds[i]);
                if (message.somClusters != null && message.somClusters.length) {
                    writer.uint32(/* id 9, wireType 2 =*/74).fork();
                    for (let i = 0; i < message.somClusters.length; ++i)
                        writer.int32(message.somClusters[i]);
                    writer.ldelim();
                }
                if (message.createdAfter != null && Object.hasOwnProperty.call(message, "createdAfter"))
                    writer.uint32(/* id 10, wireType 2 =*/82).string(message.createdAfter);
                if (message.updatedAfter != null && Object.hasOwnProperty.call(message, "updatedAfter"))
                    writer.uint32(/* id 11, wireType 2 =*/90).string(message.updatedAfter);
                return writer;
            };

            /**
             * Encodes the specified SearchChunksRequest message, length delimited. Does not implicitly {@link yorha.retrieval.SearchChunksRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.SearchChunksRequest
             * @static
             * @param {yorha.retrieval.ISearchChunksRequest} message SearchChunksRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchChunksRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SearchChunksRequest message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.SearchChunksRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.SearchChunksRequest} SearchChunksRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchChunksRequest.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.SearchChunksRequest();
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
                            message.collection = reader.string();
                            break;
                        }
                    case 4: {
                            if (!(message.filters && message.filters.length))
                                message.filters = [];
                            message.filters.push(reader.string());
                            break;
                        }
                    case 5: {
                            if (!(message.ids && message.ids.length))
                                message.ids = [];
                            message.ids.push(reader.string());
                            break;
                        }
                    case 6: {
                            if (!(message.tags && message.tags.length))
                                message.tags = [];
                            message.tags.push(reader.string());
                            break;
                        }
                    case 7: {
                            if (!(message.sourceFilter && message.sourceFilter.length))
                                message.sourceFilter = [];
                            message.sourceFilter.push(reader.string());
                            break;
                        }
                    case 8: {
                            if (!(message.clusterIds && message.clusterIds.length))
                                message.clusterIds = [];
                            message.clusterIds.push(reader.string());
                            break;
                        }
                    case 9: {
                            if (!(message.somClusters && message.somClusters.length))
                                message.somClusters = [];
                            if ((tag & 7) === 2) {
                                let end2 = reader.uint32() + reader.pos;
                                while (reader.pos < end2)
                                    message.somClusters.push(reader.int32());
                            } else
                                message.somClusters.push(reader.int32());
                            break;
                        }
                    case 10: {
                            message.createdAfter = reader.string();
                            break;
                        }
                    case 11: {
                            message.updatedAfter = reader.string();
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
             * Decodes a SearchChunksRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.SearchChunksRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.SearchChunksRequest} SearchChunksRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchChunksRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SearchChunksRequest message.
             * @function verify
             * @memberof yorha.retrieval.SearchChunksRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SearchChunksRequest.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.query != null && message.hasOwnProperty("query"))
                    if (!$util.isString(message.query))
                        return "query: string expected";
                if (message.limit != null && message.hasOwnProperty("limit"))
                    if (!$util.isInteger(message.limit))
                        return "limit: integer expected";
                if (message.collection != null && message.hasOwnProperty("collection"))
                    if (!$util.isString(message.collection))
                        return "collection: string expected";
                if (message.filters != null && message.hasOwnProperty("filters")) {
                    if (!Array.isArray(message.filters))
                        return "filters: array expected";
                    for (let i = 0; i < message.filters.length; ++i)
                        if (!$util.isString(message.filters[i]))
                            return "filters: string[] expected";
                }
                if (message.ids != null && message.hasOwnProperty("ids")) {
                    if (!Array.isArray(message.ids))
                        return "ids: array expected";
                    for (let i = 0; i < message.ids.length; ++i)
                        if (!$util.isString(message.ids[i]))
                            return "ids: string[] expected";
                }
                if (message.tags != null && message.hasOwnProperty("tags")) {
                    if (!Array.isArray(message.tags))
                        return "tags: array expected";
                    for (let i = 0; i < message.tags.length; ++i)
                        if (!$util.isString(message.tags[i]))
                            return "tags: string[] expected";
                }
                if (message.sourceFilter != null && message.hasOwnProperty("sourceFilter")) {
                    if (!Array.isArray(message.sourceFilter))
                        return "sourceFilter: array expected";
                    for (let i = 0; i < message.sourceFilter.length; ++i)
                        if (!$util.isString(message.sourceFilter[i]))
                            return "sourceFilter: string[] expected";
                }
                if (message.clusterIds != null && message.hasOwnProperty("clusterIds")) {
                    if (!Array.isArray(message.clusterIds))
                        return "clusterIds: array expected";
                    for (let i = 0; i < message.clusterIds.length; ++i)
                        if (!$util.isString(message.clusterIds[i]))
                            return "clusterIds: string[] expected";
                }
                if (message.somClusters != null && message.hasOwnProperty("somClusters")) {
                    if (!Array.isArray(message.somClusters))
                        return "somClusters: array expected";
                    for (let i = 0; i < message.somClusters.length; ++i)
                        if (!$util.isInteger(message.somClusters[i]))
                            return "somClusters: integer[] expected";
                }
                if (message.createdAfter != null && message.hasOwnProperty("createdAfter"))
                    if (!$util.isString(message.createdAfter))
                        return "createdAfter: string expected";
                if (message.updatedAfter != null && message.hasOwnProperty("updatedAfter"))
                    if (!$util.isString(message.updatedAfter))
                        return "updatedAfter: string expected";
                return null;
            };

            /**
             * Creates a SearchChunksRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.SearchChunksRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.SearchChunksRequest} SearchChunksRequest
             */
            SearchChunksRequest.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.SearchChunksRequest)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.SearchChunksRequest();
                if (object.query != null)
                    message.query = String(object.query);
                if (object.limit != null)
                    message.limit = object.limit | 0;
                if (object.collection != null)
                    message.collection = String(object.collection);
                if (object.filters) {
                    if (!Array.isArray(object.filters))
                        throw TypeError(".yorha.retrieval.SearchChunksRequest.filters: array expected");
                    message.filters = [];
                    for (let i = 0; i < object.filters.length; ++i)
                        message.filters[i] = String(object.filters[i]);
                }
                if (object.ids) {
                    if (!Array.isArray(object.ids))
                        throw TypeError(".yorha.retrieval.SearchChunksRequest.ids: array expected");
                    message.ids = [];
                    for (let i = 0; i < object.ids.length; ++i)
                        message.ids[i] = String(object.ids[i]);
                }
                if (object.tags) {
                    if (!Array.isArray(object.tags))
                        throw TypeError(".yorha.retrieval.SearchChunksRequest.tags: array expected");
                    message.tags = [];
                    for (let i = 0; i < object.tags.length; ++i)
                        message.tags[i] = String(object.tags[i]);
                }
                if (object.sourceFilter) {
                    if (!Array.isArray(object.sourceFilter))
                        throw TypeError(".yorha.retrieval.SearchChunksRequest.sourceFilter: array expected");
                    message.sourceFilter = [];
                    for (let i = 0; i < object.sourceFilter.length; ++i)
                        message.sourceFilter[i] = String(object.sourceFilter[i]);
                }
                if (object.clusterIds) {
                    if (!Array.isArray(object.clusterIds))
                        throw TypeError(".yorha.retrieval.SearchChunksRequest.clusterIds: array expected");
                    message.clusterIds = [];
                    for (let i = 0; i < object.clusterIds.length; ++i)
                        message.clusterIds[i] = String(object.clusterIds[i]);
                }
                if (object.somClusters) {
                    if (!Array.isArray(object.somClusters))
                        throw TypeError(".yorha.retrieval.SearchChunksRequest.somClusters: array expected");
                    message.somClusters = [];
                    for (let i = 0; i < object.somClusters.length; ++i)
                        message.somClusters[i] = object.somClusters[i] | 0;
                }
                if (object.createdAfter != null)
                    message.createdAfter = String(object.createdAfter);
                if (object.updatedAfter != null)
                    message.updatedAfter = String(object.updatedAfter);
                return message;
            };

            /**
             * Creates a plain object from a SearchChunksRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.SearchChunksRequest
             * @static
             * @param {yorha.retrieval.SearchChunksRequest} message SearchChunksRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SearchChunksRequest.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.filters = [];
                    object.ids = [];
                    object.tags = [];
                    object.sourceFilter = [];
                    object.clusterIds = [];
                    object.somClusters = [];
                }
                if (options.defaults) {
                    object.query = "";
                    object.limit = 0;
                    object.collection = "";
                    object.createdAfter = "";
                    object.updatedAfter = "";
                }
                if (message.query != null && message.hasOwnProperty("query"))
                    object.query = message.query;
                if (message.limit != null && message.hasOwnProperty("limit"))
                    object.limit = message.limit;
                if (message.collection != null && message.hasOwnProperty("collection"))
                    object.collection = message.collection;
                if (message.filters && message.filters.length) {
                    object.filters = [];
                    for (let j = 0; j < message.filters.length; ++j)
                        object.filters[j] = message.filters[j];
                }
                if (message.ids && message.ids.length) {
                    object.ids = [];
                    for (let j = 0; j < message.ids.length; ++j)
                        object.ids[j] = message.ids[j];
                }
                if (message.tags && message.tags.length) {
                    object.tags = [];
                    for (let j = 0; j < message.tags.length; ++j)
                        object.tags[j] = message.tags[j];
                }
                if (message.sourceFilter && message.sourceFilter.length) {
                    object.sourceFilter = [];
                    for (let j = 0; j < message.sourceFilter.length; ++j)
                        object.sourceFilter[j] = message.sourceFilter[j];
                }
                if (message.clusterIds && message.clusterIds.length) {
                    object.clusterIds = [];
                    for (let j = 0; j < message.clusterIds.length; ++j)
                        object.clusterIds[j] = message.clusterIds[j];
                }
                if (message.somClusters && message.somClusters.length) {
                    object.somClusters = [];
                    for (let j = 0; j < message.somClusters.length; ++j)
                        object.somClusters[j] = message.somClusters[j];
                }
                if (message.createdAfter != null && message.hasOwnProperty("createdAfter"))
                    object.createdAfter = message.createdAfter;
                if (message.updatedAfter != null && message.hasOwnProperty("updatedAfter"))
                    object.updatedAfter = message.updatedAfter;
                return object;
            };

            /**
             * Converts this SearchChunksRequest to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.SearchChunksRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SearchChunksRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SearchChunksRequest
             * @function getTypeUrl
             * @memberof yorha.retrieval.SearchChunksRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SearchChunksRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.SearchChunksRequest";
            };

            return SearchChunksRequest;
        })();

        retrieval.SearchChunkResult = (function() {

            /**
             * Properties of a SearchChunkResult.
             * @memberof yorha.retrieval
             * @interface ISearchChunkResult
             * @property {string|null} [id] SearchChunkResult id
             * @property {string|null} [chunkId] SearchChunkResult chunkId
             * @property {string|null} [contentPreview] SearchChunkResult contentPreview
             * @property {string|null} [kind] SearchChunkResult kind
             * @property {string|null} [httpMethod] SearchChunkResult httpMethod
             * @property {string|null} [routeId] SearchChunkResult routeId
             * @property {number|null} [startLine] SearchChunkResult startLine
             * @property {number|null} [endLine] SearchChunkResult endLine
             * @property {Array.<string>|null} [tags] SearchChunkResult tags
             * @property {yorha.retrieval.IRetrievalSourceMetadata|null} [sourceMetadata] SearchChunkResult sourceMetadata
             * @property {yorha.retrieval.IRetrievalScoreMetadata|null} [scoreMetadata] SearchChunkResult scoreMetadata
             * @property {yorha.retrieval.IRetrievalClusterMetadata|null} [clusterMetadata] SearchChunkResult clusterMetadata
             * @property {yorha.retrieval.ITransportTimestamps|null} [timestamps] SearchChunkResult timestamps
             * @property {string|null} [filePath] SearchChunkResult filePath
             */

            /**
             * Constructs a new SearchChunkResult.
             * @memberof yorha.retrieval
             * @classdesc Represents a SearchChunkResult.
             * @implements ISearchChunkResult
             * @constructor
             * @param {yorha.retrieval.ISearchChunkResult=} [properties] Properties to set
             */
            function SearchChunkResult(properties) {
                this.tags = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SearchChunkResult id.
             * @member {string} id
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.id = "";

            /**
             * SearchChunkResult chunkId.
             * @member {string} chunkId
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.chunkId = "";

            /**
             * SearchChunkResult contentPreview.
             * @member {string} contentPreview
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.contentPreview = "";

            /**
             * SearchChunkResult kind.
             * @member {string} kind
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.kind = "";

            /**
             * SearchChunkResult httpMethod.
             * @member {string} httpMethod
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.httpMethod = "";

            /**
             * SearchChunkResult routeId.
             * @member {string} routeId
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.routeId = "";

            /**
             * SearchChunkResult startLine.
             * @member {number} startLine
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.startLine = 0;

            /**
             * SearchChunkResult endLine.
             * @member {number} endLine
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.endLine = 0;

            /**
             * SearchChunkResult tags.
             * @member {Array.<string>} tags
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.tags = $util.emptyArray;

            /**
             * SearchChunkResult sourceMetadata.
             * @member {yorha.retrieval.IRetrievalSourceMetadata|null|undefined} sourceMetadata
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.sourceMetadata = null;

            /**
             * SearchChunkResult scoreMetadata.
             * @member {yorha.retrieval.IRetrievalScoreMetadata|null|undefined} scoreMetadata
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.scoreMetadata = null;

            /**
             * SearchChunkResult clusterMetadata.
             * @member {yorha.retrieval.IRetrievalClusterMetadata|null|undefined} clusterMetadata
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.clusterMetadata = null;

            /**
             * SearchChunkResult timestamps.
             * @member {yorha.retrieval.ITransportTimestamps|null|undefined} timestamps
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.timestamps = null;

            /**
             * SearchChunkResult filePath.
             * @member {string} filePath
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             */
            SearchChunkResult.prototype.filePath = "";

            /**
             * Creates a new SearchChunkResult instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.SearchChunkResult
             * @static
             * @param {yorha.retrieval.ISearchChunkResult=} [properties] Properties to set
             * @returns {yorha.retrieval.SearchChunkResult} SearchChunkResult instance
             */
            SearchChunkResult.create = function create(properties) {
                return new SearchChunkResult(properties);
            };

            /**
             * Encodes the specified SearchChunkResult message. Does not implicitly {@link yorha.retrieval.SearchChunkResult.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.SearchChunkResult
             * @static
             * @param {yorha.retrieval.ISearchChunkResult} message SearchChunkResult message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchChunkResult.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                if (message.chunkId != null && Object.hasOwnProperty.call(message, "chunkId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.chunkId);
                if (message.contentPreview != null && Object.hasOwnProperty.call(message, "contentPreview"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.contentPreview);
                if (message.kind != null && Object.hasOwnProperty.call(message, "kind"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.kind);
                if (message.httpMethod != null && Object.hasOwnProperty.call(message, "httpMethod"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.httpMethod);
                if (message.routeId != null && Object.hasOwnProperty.call(message, "routeId"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.routeId);
                if (message.startLine != null && Object.hasOwnProperty.call(message, "startLine"))
                    writer.uint32(/* id 7, wireType 0 =*/56).int32(message.startLine);
                if (message.endLine != null && Object.hasOwnProperty.call(message, "endLine"))
                    writer.uint32(/* id 8, wireType 0 =*/64).int32(message.endLine);
                if (message.tags != null && message.tags.length)
                    for (let i = 0; i < message.tags.length; ++i)
                        writer.uint32(/* id 9, wireType 2 =*/74).string(message.tags[i]);
                if (message.sourceMetadata != null && Object.hasOwnProperty.call(message, "sourceMetadata"))
                    $root.yorha.retrieval.RetrievalSourceMetadata.encode(message.sourceMetadata, writer.uint32(/* id 10, wireType 2 =*/82).fork(), q + 1).ldelim();
                if (message.scoreMetadata != null && Object.hasOwnProperty.call(message, "scoreMetadata"))
                    $root.yorha.retrieval.RetrievalScoreMetadata.encode(message.scoreMetadata, writer.uint32(/* id 11, wireType 2 =*/90).fork(), q + 1).ldelim();
                if (message.clusterMetadata != null && Object.hasOwnProperty.call(message, "clusterMetadata"))
                    $root.yorha.retrieval.RetrievalClusterMetadata.encode(message.clusterMetadata, writer.uint32(/* id 12, wireType 2 =*/98).fork(), q + 1).ldelim();
                if (message.timestamps != null && Object.hasOwnProperty.call(message, "timestamps"))
                    $root.yorha.retrieval.TransportTimestamps.encode(message.timestamps, writer.uint32(/* id 13, wireType 2 =*/106).fork(), q + 1).ldelim();
                if (message.filePath != null && Object.hasOwnProperty.call(message, "filePath"))
                    writer.uint32(/* id 14, wireType 2 =*/114).string(message.filePath);
                return writer;
            };

            /**
             * Encodes the specified SearchChunkResult message, length delimited. Does not implicitly {@link yorha.retrieval.SearchChunkResult.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.SearchChunkResult
             * @static
             * @param {yorha.retrieval.ISearchChunkResult} message SearchChunkResult message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchChunkResult.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SearchChunkResult message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.SearchChunkResult
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.SearchChunkResult} SearchChunkResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchChunkResult.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.SearchChunkResult();
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
                            message.chunkId = reader.string();
                            break;
                        }
                    case 3: {
                            message.contentPreview = reader.string();
                            break;
                        }
                    case 4: {
                            message.kind = reader.string();
                            break;
                        }
                    case 5: {
                            message.httpMethod = reader.string();
                            break;
                        }
                    case 6: {
                            message.routeId = reader.string();
                            break;
                        }
                    case 7: {
                            message.startLine = reader.int32();
                            break;
                        }
                    case 8: {
                            message.endLine = reader.int32();
                            break;
                        }
                    case 9: {
                            if (!(message.tags && message.tags.length))
                                message.tags = [];
                            message.tags.push(reader.string());
                            break;
                        }
                    case 10: {
                            message.sourceMetadata = $root.yorha.retrieval.RetrievalSourceMetadata.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 11: {
                            message.scoreMetadata = $root.yorha.retrieval.RetrievalScoreMetadata.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 12: {
                            message.clusterMetadata = $root.yorha.retrieval.RetrievalClusterMetadata.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 13: {
                            message.timestamps = $root.yorha.retrieval.TransportTimestamps.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 14: {
                            message.filePath = reader.string();
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
             * Decodes a SearchChunkResult message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.SearchChunkResult
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.SearchChunkResult} SearchChunkResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchChunkResult.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SearchChunkResult message.
             * @function verify
             * @memberof yorha.retrieval.SearchChunkResult
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SearchChunkResult.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.id != null && message.hasOwnProperty("id"))
                    if (!$util.isString(message.id))
                        return "id: string expected";
                if (message.chunkId != null && message.hasOwnProperty("chunkId"))
                    if (!$util.isString(message.chunkId))
                        return "chunkId: string expected";
                if (message.contentPreview != null && message.hasOwnProperty("contentPreview"))
                    if (!$util.isString(message.contentPreview))
                        return "contentPreview: string expected";
                if (message.kind != null && message.hasOwnProperty("kind"))
                    if (!$util.isString(message.kind))
                        return "kind: string expected";
                if (message.httpMethod != null && message.hasOwnProperty("httpMethod"))
                    if (!$util.isString(message.httpMethod))
                        return "httpMethod: string expected";
                if (message.routeId != null && message.hasOwnProperty("routeId"))
                    if (!$util.isString(message.routeId))
                        return "routeId: string expected";
                if (message.startLine != null && message.hasOwnProperty("startLine"))
                    if (!$util.isInteger(message.startLine))
                        return "startLine: integer expected";
                if (message.endLine != null && message.hasOwnProperty("endLine"))
                    if (!$util.isInteger(message.endLine))
                        return "endLine: integer expected";
                if (message.tags != null && message.hasOwnProperty("tags")) {
                    if (!Array.isArray(message.tags))
                        return "tags: array expected";
                    for (let i = 0; i < message.tags.length; ++i)
                        if (!$util.isString(message.tags[i]))
                            return "tags: string[] expected";
                }
                if (message.sourceMetadata != null && message.hasOwnProperty("sourceMetadata")) {
                    let error = $root.yorha.retrieval.RetrievalSourceMetadata.verify(message.sourceMetadata, long + 1);
                    if (error)
                        return "sourceMetadata." + error;
                }
                if (message.scoreMetadata != null && message.hasOwnProperty("scoreMetadata")) {
                    let error = $root.yorha.retrieval.RetrievalScoreMetadata.verify(message.scoreMetadata, long + 1);
                    if (error)
                        return "scoreMetadata." + error;
                }
                if (message.clusterMetadata != null && message.hasOwnProperty("clusterMetadata")) {
                    let error = $root.yorha.retrieval.RetrievalClusterMetadata.verify(message.clusterMetadata, long + 1);
                    if (error)
                        return "clusterMetadata." + error;
                }
                if (message.timestamps != null && message.hasOwnProperty("timestamps")) {
                    let error = $root.yorha.retrieval.TransportTimestamps.verify(message.timestamps, long + 1);
                    if (error)
                        return "timestamps." + error;
                }
                if (message.filePath != null && message.hasOwnProperty("filePath"))
                    if (!$util.isString(message.filePath))
                        return "filePath: string expected";
                return null;
            };

            /**
             * Creates a SearchChunkResult message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.SearchChunkResult
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.SearchChunkResult} SearchChunkResult
             */
            SearchChunkResult.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.SearchChunkResult)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.SearchChunkResult();
                if (object.id != null)
                    message.id = String(object.id);
                if (object.chunkId != null)
                    message.chunkId = String(object.chunkId);
                if (object.contentPreview != null)
                    message.contentPreview = String(object.contentPreview);
                if (object.kind != null)
                    message.kind = String(object.kind);
                if (object.httpMethod != null)
                    message.httpMethod = String(object.httpMethod);
                if (object.routeId != null)
                    message.routeId = String(object.routeId);
                if (object.startLine != null)
                    message.startLine = object.startLine | 0;
                if (object.endLine != null)
                    message.endLine = object.endLine | 0;
                if (object.tags) {
                    if (!Array.isArray(object.tags))
                        throw TypeError(".yorha.retrieval.SearchChunkResult.tags: array expected");
                    message.tags = [];
                    for (let i = 0; i < object.tags.length; ++i)
                        message.tags[i] = String(object.tags[i]);
                }
                if (object.sourceMetadata != null) {
                    if (typeof object.sourceMetadata !== "object")
                        throw TypeError(".yorha.retrieval.SearchChunkResult.sourceMetadata: object expected");
                    message.sourceMetadata = $root.yorha.retrieval.RetrievalSourceMetadata.fromObject(object.sourceMetadata, long + 1);
                }
                if (object.scoreMetadata != null) {
                    if (typeof object.scoreMetadata !== "object")
                        throw TypeError(".yorha.retrieval.SearchChunkResult.scoreMetadata: object expected");
                    message.scoreMetadata = $root.yorha.retrieval.RetrievalScoreMetadata.fromObject(object.scoreMetadata, long + 1);
                }
                if (object.clusterMetadata != null) {
                    if (typeof object.clusterMetadata !== "object")
                        throw TypeError(".yorha.retrieval.SearchChunkResult.clusterMetadata: object expected");
                    message.clusterMetadata = $root.yorha.retrieval.RetrievalClusterMetadata.fromObject(object.clusterMetadata, long + 1);
                }
                if (object.timestamps != null) {
                    if (typeof object.timestamps !== "object")
                        throw TypeError(".yorha.retrieval.SearchChunkResult.timestamps: object expected");
                    message.timestamps = $root.yorha.retrieval.TransportTimestamps.fromObject(object.timestamps, long + 1);
                }
                if (object.filePath != null)
                    message.filePath = String(object.filePath);
                return message;
            };

            /**
             * Creates a plain object from a SearchChunkResult message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.SearchChunkResult
             * @static
             * @param {yorha.retrieval.SearchChunkResult} message SearchChunkResult
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SearchChunkResult.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.tags = [];
                if (options.defaults) {
                    object.id = "";
                    object.chunkId = "";
                    object.contentPreview = "";
                    object.kind = "";
                    object.httpMethod = "";
                    object.routeId = "";
                    object.startLine = 0;
                    object.endLine = 0;
                    object.sourceMetadata = null;
                    object.scoreMetadata = null;
                    object.clusterMetadata = null;
                    object.timestamps = null;
                    object.filePath = "";
                }
                if (message.id != null && message.hasOwnProperty("id"))
                    object.id = message.id;
                if (message.chunkId != null && message.hasOwnProperty("chunkId"))
                    object.chunkId = message.chunkId;
                if (message.contentPreview != null && message.hasOwnProperty("contentPreview"))
                    object.contentPreview = message.contentPreview;
                if (message.kind != null && message.hasOwnProperty("kind"))
                    object.kind = message.kind;
                if (message.httpMethod != null && message.hasOwnProperty("httpMethod"))
                    object.httpMethod = message.httpMethod;
                if (message.routeId != null && message.hasOwnProperty("routeId"))
                    object.routeId = message.routeId;
                if (message.startLine != null && message.hasOwnProperty("startLine"))
                    object.startLine = message.startLine;
                if (message.endLine != null && message.hasOwnProperty("endLine"))
                    object.endLine = message.endLine;
                if (message.tags && message.tags.length) {
                    object.tags = [];
                    for (let j = 0; j < message.tags.length; ++j)
                        object.tags[j] = message.tags[j];
                }
                if (message.sourceMetadata != null && message.hasOwnProperty("sourceMetadata"))
                    object.sourceMetadata = $root.yorha.retrieval.RetrievalSourceMetadata.toObject(message.sourceMetadata, options, q + 1);
                if (message.scoreMetadata != null && message.hasOwnProperty("scoreMetadata"))
                    object.scoreMetadata = $root.yorha.retrieval.RetrievalScoreMetadata.toObject(message.scoreMetadata, options, q + 1);
                if (message.clusterMetadata != null && message.hasOwnProperty("clusterMetadata"))
                    object.clusterMetadata = $root.yorha.retrieval.RetrievalClusterMetadata.toObject(message.clusterMetadata, options, q + 1);
                if (message.timestamps != null && message.hasOwnProperty("timestamps"))
                    object.timestamps = $root.yorha.retrieval.TransportTimestamps.toObject(message.timestamps, options, q + 1);
                if (message.filePath != null && message.hasOwnProperty("filePath"))
                    object.filePath = message.filePath;
                return object;
            };

            /**
             * Converts this SearchChunkResult to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.SearchChunkResult
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SearchChunkResult.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SearchChunkResult
             * @function getTypeUrl
             * @memberof yorha.retrieval.SearchChunkResult
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SearchChunkResult.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.SearchChunkResult";
            };

            return SearchChunkResult;
        })();

        retrieval.SearchChunksResponse = (function() {

            /**
             * Properties of a SearchChunksResponse.
             * @memberof yorha.retrieval
             * @interface ISearchChunksResponse
             * @property {Array.<yorha.retrieval.ISearchChunkResult>|null} [results] SearchChunksResponse results
             * @property {number|null} [totalMs] SearchChunksResponse totalMs
             */

            /**
             * Constructs a new SearchChunksResponse.
             * @memberof yorha.retrieval
             * @classdesc Represents a SearchChunksResponse.
             * @implements ISearchChunksResponse
             * @constructor
             * @param {yorha.retrieval.ISearchChunksResponse=} [properties] Properties to set
             */
            function SearchChunksResponse(properties) {
                this.results = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SearchChunksResponse results.
             * @member {Array.<yorha.retrieval.ISearchChunkResult>} results
             * @memberof yorha.retrieval.SearchChunksResponse
             * @instance
             */
            SearchChunksResponse.prototype.results = $util.emptyArray;

            /**
             * SearchChunksResponse totalMs.
             * @member {number} totalMs
             * @memberof yorha.retrieval.SearchChunksResponse
             * @instance
             */
            SearchChunksResponse.prototype.totalMs = 0;

            /**
             * Creates a new SearchChunksResponse instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.SearchChunksResponse
             * @static
             * @param {yorha.retrieval.ISearchChunksResponse=} [properties] Properties to set
             * @returns {yorha.retrieval.SearchChunksResponse} SearchChunksResponse instance
             */
            SearchChunksResponse.create = function create(properties) {
                return new SearchChunksResponse(properties);
            };

            /**
             * Encodes the specified SearchChunksResponse message. Does not implicitly {@link yorha.retrieval.SearchChunksResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.SearchChunksResponse
             * @static
             * @param {yorha.retrieval.ISearchChunksResponse} message SearchChunksResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchChunksResponse.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.results != null && message.results.length)
                    for (let i = 0; i < message.results.length; ++i)
                        $root.yorha.retrieval.SearchChunkResult.encode(message.results[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.totalMs != null && Object.hasOwnProperty.call(message, "totalMs"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.totalMs);
                return writer;
            };

            /**
             * Encodes the specified SearchChunksResponse message, length delimited. Does not implicitly {@link yorha.retrieval.SearchChunksResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.SearchChunksResponse
             * @static
             * @param {yorha.retrieval.ISearchChunksResponse} message SearchChunksResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SearchChunksResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SearchChunksResponse message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.SearchChunksResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.SearchChunksResponse} SearchChunksResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchChunksResponse.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.SearchChunksResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.results && message.results.length))
                                message.results = [];
                            message.results.push($root.yorha.retrieval.SearchChunkResult.decode(reader, reader.uint32(), undefined, long + 1));
                            break;
                        }
                    case 2: {
                            message.totalMs = reader.float();
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
             * Decodes a SearchChunksResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.SearchChunksResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.SearchChunksResponse} SearchChunksResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SearchChunksResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SearchChunksResponse message.
             * @function verify
             * @memberof yorha.retrieval.SearchChunksResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SearchChunksResponse.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.results != null && message.hasOwnProperty("results")) {
                    if (!Array.isArray(message.results))
                        return "results: array expected";
                    for (let i = 0; i < message.results.length; ++i) {
                        let error = $root.yorha.retrieval.SearchChunkResult.verify(message.results[i], long + 1);
                        if (error)
                            return "results." + error;
                    }
                }
                if (message.totalMs != null && message.hasOwnProperty("totalMs"))
                    if (typeof message.totalMs !== "number")
                        return "totalMs: number expected";
                return null;
            };

            /**
             * Creates a SearchChunksResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.SearchChunksResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.SearchChunksResponse} SearchChunksResponse
             */
            SearchChunksResponse.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.SearchChunksResponse)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.SearchChunksResponse();
                if (object.results) {
                    if (!Array.isArray(object.results))
                        throw TypeError(".yorha.retrieval.SearchChunksResponse.results: array expected");
                    message.results = [];
                    for (let i = 0; i < object.results.length; ++i) {
                        if (typeof object.results[i] !== "object")
                            throw TypeError(".yorha.retrieval.SearchChunksResponse.results: object expected");
                        message.results[i] = $root.yorha.retrieval.SearchChunkResult.fromObject(object.results[i], long + 1);
                    }
                }
                if (object.totalMs != null)
                    message.totalMs = Number(object.totalMs);
                return message;
            };

            /**
             * Creates a plain object from a SearchChunksResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.SearchChunksResponse
             * @static
             * @param {yorha.retrieval.SearchChunksResponse} message SearchChunksResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SearchChunksResponse.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.results = [];
                if (options.defaults)
                    object.totalMs = 0;
                if (message.results && message.results.length) {
                    object.results = [];
                    for (let j = 0; j < message.results.length; ++j)
                        object.results[j] = $root.yorha.retrieval.SearchChunkResult.toObject(message.results[j], options, q + 1);
                }
                if (message.totalMs != null && message.hasOwnProperty("totalMs"))
                    object.totalMs = options.json && !isFinite(message.totalMs) ? String(message.totalMs) : message.totalMs;
                return object;
            };

            /**
             * Converts this SearchChunksResponse to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.SearchChunksResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SearchChunksResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SearchChunksResponse
             * @function getTypeUrl
             * @memberof yorha.retrieval.SearchChunksResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SearchChunksResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.SearchChunksResponse";
            };

            return SearchChunksResponse;
        })();

        retrieval.ClusterSummaryRequest = (function() {

            /**
             * Properties of a ClusterSummaryRequest.
             * @memberof yorha.retrieval
             * @interface IClusterSummaryRequest
             * @property {number|null} [clusterId] ClusterSummaryRequest clusterId
             * @property {string|null} [clusterType] ClusterSummaryRequest clusterType
             */

            /**
             * Constructs a new ClusterSummaryRequest.
             * @memberof yorha.retrieval
             * @classdesc Represents a ClusterSummaryRequest.
             * @implements IClusterSummaryRequest
             * @constructor
             * @param {yorha.retrieval.IClusterSummaryRequest=} [properties] Properties to set
             */
            function ClusterSummaryRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ClusterSummaryRequest clusterId.
             * @member {number} clusterId
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @instance
             */
            ClusterSummaryRequest.prototype.clusterId = 0;

            /**
             * ClusterSummaryRequest clusterType.
             * @member {string} clusterType
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @instance
             */
            ClusterSummaryRequest.prototype.clusterType = "";

            /**
             * Creates a new ClusterSummaryRequest instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @static
             * @param {yorha.retrieval.IClusterSummaryRequest=} [properties] Properties to set
             * @returns {yorha.retrieval.ClusterSummaryRequest} ClusterSummaryRequest instance
             */
            ClusterSummaryRequest.create = function create(properties) {
                return new ClusterSummaryRequest(properties);
            };

            /**
             * Encodes the specified ClusterSummaryRequest message. Does not implicitly {@link yorha.retrieval.ClusterSummaryRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @static
             * @param {yorha.retrieval.IClusterSummaryRequest} message ClusterSummaryRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ClusterSummaryRequest.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.clusterId != null && Object.hasOwnProperty.call(message, "clusterId"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.clusterId);
                if (message.clusterType != null && Object.hasOwnProperty.call(message, "clusterType"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.clusterType);
                return writer;
            };

            /**
             * Encodes the specified ClusterSummaryRequest message, length delimited. Does not implicitly {@link yorha.retrieval.ClusterSummaryRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @static
             * @param {yorha.retrieval.IClusterSummaryRequest} message ClusterSummaryRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ClusterSummaryRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ClusterSummaryRequest message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.ClusterSummaryRequest} ClusterSummaryRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ClusterSummaryRequest.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.ClusterSummaryRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.clusterId = reader.int32();
                            break;
                        }
                    case 2: {
                            message.clusterType = reader.string();
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
             * Decodes a ClusterSummaryRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.ClusterSummaryRequest} ClusterSummaryRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ClusterSummaryRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ClusterSummaryRequest message.
             * @function verify
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ClusterSummaryRequest.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.clusterId != null && message.hasOwnProperty("clusterId"))
                    if (!$util.isInteger(message.clusterId))
                        return "clusterId: integer expected";
                if (message.clusterType != null && message.hasOwnProperty("clusterType"))
                    if (!$util.isString(message.clusterType))
                        return "clusterType: string expected";
                return null;
            };

            /**
             * Creates a ClusterSummaryRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.ClusterSummaryRequest} ClusterSummaryRequest
             */
            ClusterSummaryRequest.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.ClusterSummaryRequest)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.ClusterSummaryRequest();
                if (object.clusterId != null)
                    message.clusterId = object.clusterId | 0;
                if (object.clusterType != null)
                    message.clusterType = String(object.clusterType);
                return message;
            };

            /**
             * Creates a plain object from a ClusterSummaryRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @static
             * @param {yorha.retrieval.ClusterSummaryRequest} message ClusterSummaryRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ClusterSummaryRequest.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.clusterId = 0;
                    object.clusterType = "";
                }
                if (message.clusterId != null && message.hasOwnProperty("clusterId"))
                    object.clusterId = message.clusterId;
                if (message.clusterType != null && message.hasOwnProperty("clusterType"))
                    object.clusterType = message.clusterType;
                return object;
            };

            /**
             * Converts this ClusterSummaryRequest to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ClusterSummaryRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ClusterSummaryRequest
             * @function getTypeUrl
             * @memberof yorha.retrieval.ClusterSummaryRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ClusterSummaryRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.ClusterSummaryRequest";
            };

            return ClusterSummaryRequest;
        })();

        retrieval.ClusterSummaryResponse = (function() {

            /**
             * Properties of a ClusterSummaryResponse.
             * @memberof yorha.retrieval
             * @interface IClusterSummaryResponse
             * @property {number|null} [clusterId] ClusterSummaryResponse clusterId
             * @property {string|null} [summary] ClusterSummaryResponse summary
             * @property {Array.<string>|null} [patterns] ClusterSummaryResponse patterns
             * @property {Array.<string>|null} [keywords] ClusterSummaryResponse keywords
             * @property {Object.<string,string>|null} [metadata] ClusterSummaryResponse metadata
             */

            /**
             * Constructs a new ClusterSummaryResponse.
             * @memberof yorha.retrieval
             * @classdesc Represents a ClusterSummaryResponse.
             * @implements IClusterSummaryResponse
             * @constructor
             * @param {yorha.retrieval.IClusterSummaryResponse=} [properties] Properties to set
             */
            function ClusterSummaryResponse(properties) {
                this.patterns = [];
                this.keywords = [];
                this.metadata = {};
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ClusterSummaryResponse clusterId.
             * @member {number} clusterId
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @instance
             */
            ClusterSummaryResponse.prototype.clusterId = 0;

            /**
             * ClusterSummaryResponse summary.
             * @member {string} summary
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @instance
             */
            ClusterSummaryResponse.prototype.summary = "";

            /**
             * ClusterSummaryResponse patterns.
             * @member {Array.<string>} patterns
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @instance
             */
            ClusterSummaryResponse.prototype.patterns = $util.emptyArray;

            /**
             * ClusterSummaryResponse keywords.
             * @member {Array.<string>} keywords
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @instance
             */
            ClusterSummaryResponse.prototype.keywords = $util.emptyArray;

            /**
             * ClusterSummaryResponse metadata.
             * @member {Object.<string,string>} metadata
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @instance
             */
            ClusterSummaryResponse.prototype.metadata = $util.emptyObject;

            /**
             * Creates a new ClusterSummaryResponse instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @static
             * @param {yorha.retrieval.IClusterSummaryResponse=} [properties] Properties to set
             * @returns {yorha.retrieval.ClusterSummaryResponse} ClusterSummaryResponse instance
             */
            ClusterSummaryResponse.create = function create(properties) {
                return new ClusterSummaryResponse(properties);
            };

            /**
             * Encodes the specified ClusterSummaryResponse message. Does not implicitly {@link yorha.retrieval.ClusterSummaryResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @static
             * @param {yorha.retrieval.IClusterSummaryResponse} message ClusterSummaryResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ClusterSummaryResponse.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.clusterId != null && Object.hasOwnProperty.call(message, "clusterId"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.clusterId);
                if (message.summary != null && Object.hasOwnProperty.call(message, "summary"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.summary);
                if (message.patterns != null && message.patterns.length)
                    for (let i = 0; i < message.patterns.length; ++i)
                        writer.uint32(/* id 3, wireType 2 =*/26).string(message.patterns[i]);
                if (message.keywords != null && message.keywords.length)
                    for (let i = 0; i < message.keywords.length; ++i)
                        writer.uint32(/* id 4, wireType 2 =*/34).string(message.keywords[i]);
                if (message.metadata != null && Object.hasOwnProperty.call(message, "metadata"))
                    for (let keys = Object.keys(message.metadata), i = 0; i < keys.length; ++i)
                        writer.uint32(/* id 5, wireType 2 =*/42).fork().uint32(/* id 1, wireType 2 =*/10).string(keys[i]).uint32(/* id 2, wireType 2 =*/18).string(message.metadata[keys[i]]).ldelim();
                return writer;
            };

            /**
             * Encodes the specified ClusterSummaryResponse message, length delimited. Does not implicitly {@link yorha.retrieval.ClusterSummaryResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @static
             * @param {yorha.retrieval.IClusterSummaryResponse} message ClusterSummaryResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ClusterSummaryResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ClusterSummaryResponse message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.ClusterSummaryResponse} ClusterSummaryResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ClusterSummaryResponse.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.ClusterSummaryResponse(), key, value;
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.clusterId = reader.int32();
                            break;
                        }
                    case 2: {
                            message.summary = reader.string();
                            break;
                        }
                    case 3: {
                            if (!(message.patterns && message.patterns.length))
                                message.patterns = [];
                            message.patterns.push(reader.string());
                            break;
                        }
                    case 4: {
                            if (!(message.keywords && message.keywords.length))
                                message.keywords = [];
                            message.keywords.push(reader.string());
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
             * Decodes a ClusterSummaryResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.ClusterSummaryResponse} ClusterSummaryResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ClusterSummaryResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ClusterSummaryResponse message.
             * @function verify
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ClusterSummaryResponse.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.clusterId != null && message.hasOwnProperty("clusterId"))
                    if (!$util.isInteger(message.clusterId))
                        return "clusterId: integer expected";
                if (message.summary != null && message.hasOwnProperty("summary"))
                    if (!$util.isString(message.summary))
                        return "summary: string expected";
                if (message.patterns != null && message.hasOwnProperty("patterns")) {
                    if (!Array.isArray(message.patterns))
                        return "patterns: array expected";
                    for (let i = 0; i < message.patterns.length; ++i)
                        if (!$util.isString(message.patterns[i]))
                            return "patterns: string[] expected";
                }
                if (message.keywords != null && message.hasOwnProperty("keywords")) {
                    if (!Array.isArray(message.keywords))
                        return "keywords: array expected";
                    for (let i = 0; i < message.keywords.length; ++i)
                        if (!$util.isString(message.keywords[i]))
                            return "keywords: string[] expected";
                }
                if (message.metadata != null && message.hasOwnProperty("metadata")) {
                    if (!$util.isObject(message.metadata))
                        return "metadata: object expected";
                    let key = Object.keys(message.metadata);
                    for (let i = 0; i < key.length; ++i)
                        if (!$util.isString(message.metadata[key[i]]))
                            return "metadata: string{k:string} expected";
                }
                return null;
            };

            /**
             * Creates a ClusterSummaryResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.ClusterSummaryResponse} ClusterSummaryResponse
             */
            ClusterSummaryResponse.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.ClusterSummaryResponse)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.ClusterSummaryResponse();
                if (object.clusterId != null)
                    message.clusterId = object.clusterId | 0;
                if (object.summary != null)
                    message.summary = String(object.summary);
                if (object.patterns) {
                    if (!Array.isArray(object.patterns))
                        throw TypeError(".yorha.retrieval.ClusterSummaryResponse.patterns: array expected");
                    message.patterns = [];
                    for (let i = 0; i < object.patterns.length; ++i)
                        message.patterns[i] = String(object.patterns[i]);
                }
                if (object.keywords) {
                    if (!Array.isArray(object.keywords))
                        throw TypeError(".yorha.retrieval.ClusterSummaryResponse.keywords: array expected");
                    message.keywords = [];
                    for (let i = 0; i < object.keywords.length; ++i)
                        message.keywords[i] = String(object.keywords[i]);
                }
                if (object.metadata) {
                    if (typeof object.metadata !== "object")
                        throw TypeError(".yorha.retrieval.ClusterSummaryResponse.metadata: object expected");
                    message.metadata = {};
                    for (let keys = Object.keys(object.metadata), i = 0; i < keys.length; ++i) {
                        if (keys[i] === "__proto__")
                            $util.makeProp(message.metadata, keys[i]);
                        message.metadata[keys[i]] = String(object.metadata[keys[i]]);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a ClusterSummaryResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @static
             * @param {yorha.retrieval.ClusterSummaryResponse} message ClusterSummaryResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ClusterSummaryResponse.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.patterns = [];
                    object.keywords = [];
                }
                if (options.objects || options.defaults)
                    object.metadata = {};
                if (options.defaults) {
                    object.clusterId = 0;
                    object.summary = "";
                }
                if (message.clusterId != null && message.hasOwnProperty("clusterId"))
                    object.clusterId = message.clusterId;
                if (message.summary != null && message.hasOwnProperty("summary"))
                    object.summary = message.summary;
                if (message.patterns && message.patterns.length) {
                    object.patterns = [];
                    for (let j = 0; j < message.patterns.length; ++j)
                        object.patterns[j] = message.patterns[j];
                }
                if (message.keywords && message.keywords.length) {
                    object.keywords = [];
                    for (let j = 0; j < message.keywords.length; ++j)
                        object.keywords[j] = message.keywords[j];
                }
                let keys2;
                if (message.metadata && (keys2 = Object.keys(message.metadata)).length) {
                    object.metadata = {};
                    for (let j = 0; j < keys2.length; ++j) {
                        if (keys2[j] === "__proto__")
                            $util.makeProp(object.metadata, keys2[j]);
                        object.metadata[keys2[j]] = message.metadata[keys2[j]];
                    }
                }
                return object;
            };

            /**
             * Converts this ClusterSummaryResponse to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ClusterSummaryResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ClusterSummaryResponse
             * @function getTypeUrl
             * @memberof yorha.retrieval.ClusterSummaryResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ClusterSummaryResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.ClusterSummaryResponse";
            };

            return ClusterSummaryResponse;
        })();

        retrieval.AstExpansionRequest = (function() {

            /**
             * Properties of an AstExpansionRequest.
             * @memberof yorha.retrieval
             * @interface IAstExpansionRequest
             * @property {string|null} [symbol] AstExpansionRequest symbol
             * @property {string|null} [filePath] AstExpansionRequest filePath
             * @property {number|null} [depth] AstExpansionRequest depth
             */

            /**
             * Constructs a new AstExpansionRequest.
             * @memberof yorha.retrieval
             * @classdesc Represents an AstExpansionRequest.
             * @implements IAstExpansionRequest
             * @constructor
             * @param {yorha.retrieval.IAstExpansionRequest=} [properties] Properties to set
             */
            function AstExpansionRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * AstExpansionRequest symbol.
             * @member {string} symbol
             * @memberof yorha.retrieval.AstExpansionRequest
             * @instance
             */
            AstExpansionRequest.prototype.symbol = "";

            /**
             * AstExpansionRequest filePath.
             * @member {string} filePath
             * @memberof yorha.retrieval.AstExpansionRequest
             * @instance
             */
            AstExpansionRequest.prototype.filePath = "";

            /**
             * AstExpansionRequest depth.
             * @member {number} depth
             * @memberof yorha.retrieval.AstExpansionRequest
             * @instance
             */
            AstExpansionRequest.prototype.depth = 0;

            /**
             * Creates a new AstExpansionRequest instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.AstExpansionRequest
             * @static
             * @param {yorha.retrieval.IAstExpansionRequest=} [properties] Properties to set
             * @returns {yorha.retrieval.AstExpansionRequest} AstExpansionRequest instance
             */
            AstExpansionRequest.create = function create(properties) {
                return new AstExpansionRequest(properties);
            };

            /**
             * Encodes the specified AstExpansionRequest message. Does not implicitly {@link yorha.retrieval.AstExpansionRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.AstExpansionRequest
             * @static
             * @param {yorha.retrieval.IAstExpansionRequest} message AstExpansionRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AstExpansionRequest.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.symbol != null && Object.hasOwnProperty.call(message, "symbol"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.symbol);
                if (message.filePath != null && Object.hasOwnProperty.call(message, "filePath"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.filePath);
                if (message.depth != null && Object.hasOwnProperty.call(message, "depth"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.depth);
                return writer;
            };

            /**
             * Encodes the specified AstExpansionRequest message, length delimited. Does not implicitly {@link yorha.retrieval.AstExpansionRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.AstExpansionRequest
             * @static
             * @param {yorha.retrieval.IAstExpansionRequest} message AstExpansionRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AstExpansionRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an AstExpansionRequest message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.AstExpansionRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.AstExpansionRequest} AstExpansionRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AstExpansionRequest.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.AstExpansionRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.symbol = reader.string();
                            break;
                        }
                    case 2: {
                            message.filePath = reader.string();
                            break;
                        }
                    case 3: {
                            message.depth = reader.int32();
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
             * Decodes an AstExpansionRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.AstExpansionRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.AstExpansionRequest} AstExpansionRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AstExpansionRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an AstExpansionRequest message.
             * @function verify
             * @memberof yorha.retrieval.AstExpansionRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            AstExpansionRequest.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.symbol != null && message.hasOwnProperty("symbol"))
                    if (!$util.isString(message.symbol))
                        return "symbol: string expected";
                if (message.filePath != null && message.hasOwnProperty("filePath"))
                    if (!$util.isString(message.filePath))
                        return "filePath: string expected";
                if (message.depth != null && message.hasOwnProperty("depth"))
                    if (!$util.isInteger(message.depth))
                        return "depth: integer expected";
                return null;
            };

            /**
             * Creates an AstExpansionRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.AstExpansionRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.AstExpansionRequest} AstExpansionRequest
             */
            AstExpansionRequest.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.AstExpansionRequest)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.AstExpansionRequest();
                if (object.symbol != null)
                    message.symbol = String(object.symbol);
                if (object.filePath != null)
                    message.filePath = String(object.filePath);
                if (object.depth != null)
                    message.depth = object.depth | 0;
                return message;
            };

            /**
             * Creates a plain object from an AstExpansionRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.AstExpansionRequest
             * @static
             * @param {yorha.retrieval.AstExpansionRequest} message AstExpansionRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            AstExpansionRequest.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.symbol = "";
                    object.filePath = "";
                    object.depth = 0;
                }
                if (message.symbol != null && message.hasOwnProperty("symbol"))
                    object.symbol = message.symbol;
                if (message.filePath != null && message.hasOwnProperty("filePath"))
                    object.filePath = message.filePath;
                if (message.depth != null && message.hasOwnProperty("depth"))
                    object.depth = message.depth;
                return object;
            };

            /**
             * Converts this AstExpansionRequest to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.AstExpansionRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            AstExpansionRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for AstExpansionRequest
             * @function getTypeUrl
             * @memberof yorha.retrieval.AstExpansionRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            AstExpansionRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.AstExpansionRequest";
            };

            return AstExpansionRequest;
        })();

        retrieval.AstExpansionResponse = (function() {

            /**
             * Properties of an AstExpansionResponse.
             * @memberof yorha.retrieval
             * @interface IAstExpansionResponse
             * @property {Array.<yorha.retrieval.IAstNode>|null} [neighbors] AstExpansionResponse neighbors
             * @property {Array.<yorha.retrieval.IAstEdge>|null} [edges] AstExpansionResponse edges
             */

            /**
             * Constructs a new AstExpansionResponse.
             * @memberof yorha.retrieval
             * @classdesc Represents an AstExpansionResponse.
             * @implements IAstExpansionResponse
             * @constructor
             * @param {yorha.retrieval.IAstExpansionResponse=} [properties] Properties to set
             */
            function AstExpansionResponse(properties) {
                this.neighbors = [];
                this.edges = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * AstExpansionResponse neighbors.
             * @member {Array.<yorha.retrieval.IAstNode>} neighbors
             * @memberof yorha.retrieval.AstExpansionResponse
             * @instance
             */
            AstExpansionResponse.prototype.neighbors = $util.emptyArray;

            /**
             * AstExpansionResponse edges.
             * @member {Array.<yorha.retrieval.IAstEdge>} edges
             * @memberof yorha.retrieval.AstExpansionResponse
             * @instance
             */
            AstExpansionResponse.prototype.edges = $util.emptyArray;

            /**
             * Creates a new AstExpansionResponse instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.AstExpansionResponse
             * @static
             * @param {yorha.retrieval.IAstExpansionResponse=} [properties] Properties to set
             * @returns {yorha.retrieval.AstExpansionResponse} AstExpansionResponse instance
             */
            AstExpansionResponse.create = function create(properties) {
                return new AstExpansionResponse(properties);
            };

            /**
             * Encodes the specified AstExpansionResponse message. Does not implicitly {@link yorha.retrieval.AstExpansionResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.AstExpansionResponse
             * @static
             * @param {yorha.retrieval.IAstExpansionResponse} message AstExpansionResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AstExpansionResponse.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.neighbors != null && message.neighbors.length)
                    for (let i = 0; i < message.neighbors.length; ++i)
                        $root.yorha.retrieval.AstNode.encode(message.neighbors[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.edges != null && message.edges.length)
                    for (let i = 0; i < message.edges.length; ++i)
                        $root.yorha.retrieval.AstEdge.encode(message.edges[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), q + 1).ldelim();
                return writer;
            };

            /**
             * Encodes the specified AstExpansionResponse message, length delimited. Does not implicitly {@link yorha.retrieval.AstExpansionResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.AstExpansionResponse
             * @static
             * @param {yorha.retrieval.IAstExpansionResponse} message AstExpansionResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AstExpansionResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an AstExpansionResponse message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.AstExpansionResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.AstExpansionResponse} AstExpansionResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AstExpansionResponse.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.AstExpansionResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.neighbors && message.neighbors.length))
                                message.neighbors = [];
                            message.neighbors.push($root.yorha.retrieval.AstNode.decode(reader, reader.uint32(), undefined, long + 1));
                            break;
                        }
                    case 2: {
                            if (!(message.edges && message.edges.length))
                                message.edges = [];
                            message.edges.push($root.yorha.retrieval.AstEdge.decode(reader, reader.uint32(), undefined, long + 1));
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
             * Decodes an AstExpansionResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.AstExpansionResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.AstExpansionResponse} AstExpansionResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AstExpansionResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an AstExpansionResponse message.
             * @function verify
             * @memberof yorha.retrieval.AstExpansionResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            AstExpansionResponse.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.neighbors != null && message.hasOwnProperty("neighbors")) {
                    if (!Array.isArray(message.neighbors))
                        return "neighbors: array expected";
                    for (let i = 0; i < message.neighbors.length; ++i) {
                        let error = $root.yorha.retrieval.AstNode.verify(message.neighbors[i], long + 1);
                        if (error)
                            return "neighbors." + error;
                    }
                }
                if (message.edges != null && message.hasOwnProperty("edges")) {
                    if (!Array.isArray(message.edges))
                        return "edges: array expected";
                    for (let i = 0; i < message.edges.length; ++i) {
                        let error = $root.yorha.retrieval.AstEdge.verify(message.edges[i], long + 1);
                        if (error)
                            return "edges." + error;
                    }
                }
                return null;
            };

            /**
             * Creates an AstExpansionResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.AstExpansionResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.AstExpansionResponse} AstExpansionResponse
             */
            AstExpansionResponse.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.AstExpansionResponse)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.AstExpansionResponse();
                if (object.neighbors) {
                    if (!Array.isArray(object.neighbors))
                        throw TypeError(".yorha.retrieval.AstExpansionResponse.neighbors: array expected");
                    message.neighbors = [];
                    for (let i = 0; i < object.neighbors.length; ++i) {
                        if (typeof object.neighbors[i] !== "object")
                            throw TypeError(".yorha.retrieval.AstExpansionResponse.neighbors: object expected");
                        message.neighbors[i] = $root.yorha.retrieval.AstNode.fromObject(object.neighbors[i], long + 1);
                    }
                }
                if (object.edges) {
                    if (!Array.isArray(object.edges))
                        throw TypeError(".yorha.retrieval.AstExpansionResponse.edges: array expected");
                    message.edges = [];
                    for (let i = 0; i < object.edges.length; ++i) {
                        if (typeof object.edges[i] !== "object")
                            throw TypeError(".yorha.retrieval.AstExpansionResponse.edges: object expected");
                        message.edges[i] = $root.yorha.retrieval.AstEdge.fromObject(object.edges[i], long + 1);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from an AstExpansionResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.AstExpansionResponse
             * @static
             * @param {yorha.retrieval.AstExpansionResponse} message AstExpansionResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            AstExpansionResponse.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.neighbors = [];
                    object.edges = [];
                }
                if (message.neighbors && message.neighbors.length) {
                    object.neighbors = [];
                    for (let j = 0; j < message.neighbors.length; ++j)
                        object.neighbors[j] = $root.yorha.retrieval.AstNode.toObject(message.neighbors[j], options, q + 1);
                }
                if (message.edges && message.edges.length) {
                    object.edges = [];
                    for (let j = 0; j < message.edges.length; ++j)
                        object.edges[j] = $root.yorha.retrieval.AstEdge.toObject(message.edges[j], options, q + 1);
                }
                return object;
            };

            /**
             * Converts this AstExpansionResponse to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.AstExpansionResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            AstExpansionResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for AstExpansionResponse
             * @function getTypeUrl
             * @memberof yorha.retrieval.AstExpansionResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            AstExpansionResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.AstExpansionResponse";
            };

            return AstExpansionResponse;
        })();

        retrieval.AstNode = (function() {

            /**
             * Properties of an AstNode.
             * @memberof yorha.retrieval
             * @interface IAstNode
             * @property {string|null} [id] AstNode id
             * @property {string|null} [symbol] AstNode symbol
             * @property {string|null} [kind] AstNode kind
             * @property {string|null} [filePath] AstNode filePath
             */

            /**
             * Constructs a new AstNode.
             * @memberof yorha.retrieval
             * @classdesc Represents an AstNode.
             * @implements IAstNode
             * @constructor
             * @param {yorha.retrieval.IAstNode=} [properties] Properties to set
             */
            function AstNode(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * AstNode id.
             * @member {string} id
             * @memberof yorha.retrieval.AstNode
             * @instance
             */
            AstNode.prototype.id = "";

            /**
             * AstNode symbol.
             * @member {string} symbol
             * @memberof yorha.retrieval.AstNode
             * @instance
             */
            AstNode.prototype.symbol = "";

            /**
             * AstNode kind.
             * @member {string} kind
             * @memberof yorha.retrieval.AstNode
             * @instance
             */
            AstNode.prototype.kind = "";

            /**
             * AstNode filePath.
             * @member {string} filePath
             * @memberof yorha.retrieval.AstNode
             * @instance
             */
            AstNode.prototype.filePath = "";

            /**
             * Creates a new AstNode instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.AstNode
             * @static
             * @param {yorha.retrieval.IAstNode=} [properties] Properties to set
             * @returns {yorha.retrieval.AstNode} AstNode instance
             */
            AstNode.create = function create(properties) {
                return new AstNode(properties);
            };

            /**
             * Encodes the specified AstNode message. Does not implicitly {@link yorha.retrieval.AstNode.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.AstNode
             * @static
             * @param {yorha.retrieval.IAstNode} message AstNode message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AstNode.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                if (message.symbol != null && Object.hasOwnProperty.call(message, "symbol"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.symbol);
                if (message.kind != null && Object.hasOwnProperty.call(message, "kind"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.kind);
                if (message.filePath != null && Object.hasOwnProperty.call(message, "filePath"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.filePath);
                return writer;
            };

            /**
             * Encodes the specified AstNode message, length delimited. Does not implicitly {@link yorha.retrieval.AstNode.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.AstNode
             * @static
             * @param {yorha.retrieval.IAstNode} message AstNode message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AstNode.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an AstNode message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.AstNode
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.AstNode} AstNode
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AstNode.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.AstNode();
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
                            message.symbol = reader.string();
                            break;
                        }
                    case 3: {
                            message.kind = reader.string();
                            break;
                        }
                    case 4: {
                            message.filePath = reader.string();
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
             * Decodes an AstNode message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.AstNode
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.AstNode} AstNode
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AstNode.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an AstNode message.
             * @function verify
             * @memberof yorha.retrieval.AstNode
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            AstNode.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.id != null && message.hasOwnProperty("id"))
                    if (!$util.isString(message.id))
                        return "id: string expected";
                if (message.symbol != null && message.hasOwnProperty("symbol"))
                    if (!$util.isString(message.symbol))
                        return "symbol: string expected";
                if (message.kind != null && message.hasOwnProperty("kind"))
                    if (!$util.isString(message.kind))
                        return "kind: string expected";
                if (message.filePath != null && message.hasOwnProperty("filePath"))
                    if (!$util.isString(message.filePath))
                        return "filePath: string expected";
                return null;
            };

            /**
             * Creates an AstNode message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.AstNode
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.AstNode} AstNode
             */
            AstNode.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.AstNode)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.AstNode();
                if (object.id != null)
                    message.id = String(object.id);
                if (object.symbol != null)
                    message.symbol = String(object.symbol);
                if (object.kind != null)
                    message.kind = String(object.kind);
                if (object.filePath != null)
                    message.filePath = String(object.filePath);
                return message;
            };

            /**
             * Creates a plain object from an AstNode message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.AstNode
             * @static
             * @param {yorha.retrieval.AstNode} message AstNode
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            AstNode.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.id = "";
                    object.symbol = "";
                    object.kind = "";
                    object.filePath = "";
                }
                if (message.id != null && message.hasOwnProperty("id"))
                    object.id = message.id;
                if (message.symbol != null && message.hasOwnProperty("symbol"))
                    object.symbol = message.symbol;
                if (message.kind != null && message.hasOwnProperty("kind"))
                    object.kind = message.kind;
                if (message.filePath != null && message.hasOwnProperty("filePath"))
                    object.filePath = message.filePath;
                return object;
            };

            /**
             * Converts this AstNode to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.AstNode
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            AstNode.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for AstNode
             * @function getTypeUrl
             * @memberof yorha.retrieval.AstNode
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            AstNode.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.AstNode";
            };

            return AstNode;
        })();

        retrieval.AstEdge = (function() {

            /**
             * Properties of an AstEdge.
             * @memberof yorha.retrieval
             * @interface IAstEdge
             * @property {string|null} [sourceId] AstEdge sourceId
             * @property {string|null} [targetId] AstEdge targetId
             * @property {string|null} [edgeType] AstEdge edgeType
             */

            /**
             * Constructs a new AstEdge.
             * @memberof yorha.retrieval
             * @classdesc Represents an AstEdge.
             * @implements IAstEdge
             * @constructor
             * @param {yorha.retrieval.IAstEdge=} [properties] Properties to set
             */
            function AstEdge(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * AstEdge sourceId.
             * @member {string} sourceId
             * @memberof yorha.retrieval.AstEdge
             * @instance
             */
            AstEdge.prototype.sourceId = "";

            /**
             * AstEdge targetId.
             * @member {string} targetId
             * @memberof yorha.retrieval.AstEdge
             * @instance
             */
            AstEdge.prototype.targetId = "";

            /**
             * AstEdge edgeType.
             * @member {string} edgeType
             * @memberof yorha.retrieval.AstEdge
             * @instance
             */
            AstEdge.prototype.edgeType = "";

            /**
             * Creates a new AstEdge instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.AstEdge
             * @static
             * @param {yorha.retrieval.IAstEdge=} [properties] Properties to set
             * @returns {yorha.retrieval.AstEdge} AstEdge instance
             */
            AstEdge.create = function create(properties) {
                return new AstEdge(properties);
            };

            /**
             * Encodes the specified AstEdge message. Does not implicitly {@link yorha.retrieval.AstEdge.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.AstEdge
             * @static
             * @param {yorha.retrieval.IAstEdge} message AstEdge message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AstEdge.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.sourceId != null && Object.hasOwnProperty.call(message, "sourceId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.sourceId);
                if (message.targetId != null && Object.hasOwnProperty.call(message, "targetId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.targetId);
                if (message.edgeType != null && Object.hasOwnProperty.call(message, "edgeType"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.edgeType);
                return writer;
            };

            /**
             * Encodes the specified AstEdge message, length delimited. Does not implicitly {@link yorha.retrieval.AstEdge.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.AstEdge
             * @static
             * @param {yorha.retrieval.IAstEdge} message AstEdge message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AstEdge.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an AstEdge message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.AstEdge
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.AstEdge} AstEdge
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AstEdge.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.AstEdge();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.sourceId = reader.string();
                            break;
                        }
                    case 2: {
                            message.targetId = reader.string();
                            break;
                        }
                    case 3: {
                            message.edgeType = reader.string();
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
             * Decodes an AstEdge message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.AstEdge
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.AstEdge} AstEdge
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AstEdge.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an AstEdge message.
             * @function verify
             * @memberof yorha.retrieval.AstEdge
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            AstEdge.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.sourceId != null && message.hasOwnProperty("sourceId"))
                    if (!$util.isString(message.sourceId))
                        return "sourceId: string expected";
                if (message.targetId != null && message.hasOwnProperty("targetId"))
                    if (!$util.isString(message.targetId))
                        return "targetId: string expected";
                if (message.edgeType != null && message.hasOwnProperty("edgeType"))
                    if (!$util.isString(message.edgeType))
                        return "edgeType: string expected";
                return null;
            };

            /**
             * Creates an AstEdge message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.AstEdge
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.AstEdge} AstEdge
             */
            AstEdge.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.AstEdge)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.AstEdge();
                if (object.sourceId != null)
                    message.sourceId = String(object.sourceId);
                if (object.targetId != null)
                    message.targetId = String(object.targetId);
                if (object.edgeType != null)
                    message.edgeType = String(object.edgeType);
                return message;
            };

            /**
             * Creates a plain object from an AstEdge message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.AstEdge
             * @static
             * @param {yorha.retrieval.AstEdge} message AstEdge
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            AstEdge.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.sourceId = "";
                    object.targetId = "";
                    object.edgeType = "";
                }
                if (message.sourceId != null && message.hasOwnProperty("sourceId"))
                    object.sourceId = message.sourceId;
                if (message.targetId != null && message.hasOwnProperty("targetId"))
                    object.targetId = message.targetId;
                if (message.edgeType != null && message.hasOwnProperty("edgeType"))
                    object.edgeType = message.edgeType;
                return object;
            };

            /**
             * Converts this AstEdge to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.AstEdge
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            AstEdge.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for AstEdge
             * @function getTypeUrl
             * @memberof yorha.retrieval.AstEdge
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            AstEdge.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.AstEdge";
            };

            return AstEdge;
        })();

        retrieval.SemanticAstPacketRequest = (function() {

            /**
             * Properties of a SemanticAstPacketRequest.
             * @memberof yorha.retrieval
             * @interface ISemanticAstPacketRequest
             * @property {yorha.shared.IAtlasRequestContextV2|null} [atlasContext] SemanticAstPacketRequest atlasContext
             * @property {string|null} [sourceRef] SemanticAstPacketRequest sourceRef
             * @property {string|null} [packetKey] SemanticAstPacketRequest packetKey
             * @property {number|null} [limit] SemanticAstPacketRequest limit
             */

            /**
             * Constructs a new SemanticAstPacketRequest.
             * @memberof yorha.retrieval
             * @classdesc Represents a SemanticAstPacketRequest.
             * @implements ISemanticAstPacketRequest
             * @constructor
             * @param {yorha.retrieval.ISemanticAstPacketRequest=} [properties] Properties to set
             */
            function SemanticAstPacketRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SemanticAstPacketRequest atlasContext.
             * @member {yorha.shared.IAtlasRequestContextV2|null|undefined} atlasContext
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @instance
             */
            SemanticAstPacketRequest.prototype.atlasContext = null;

            /**
             * SemanticAstPacketRequest sourceRef.
             * @member {string} sourceRef
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @instance
             */
            SemanticAstPacketRequest.prototype.sourceRef = "";

            /**
             * SemanticAstPacketRequest packetKey.
             * @member {string} packetKey
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @instance
             */
            SemanticAstPacketRequest.prototype.packetKey = "";

            /**
             * SemanticAstPacketRequest limit.
             * @member {number} limit
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @instance
             */
            SemanticAstPacketRequest.prototype.limit = 0;

            /**
             * Creates a new SemanticAstPacketRequest instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @static
             * @param {yorha.retrieval.ISemanticAstPacketRequest=} [properties] Properties to set
             * @returns {yorha.retrieval.SemanticAstPacketRequest} SemanticAstPacketRequest instance
             */
            SemanticAstPacketRequest.create = function create(properties) {
                return new SemanticAstPacketRequest(properties);
            };

            /**
             * Encodes the specified SemanticAstPacketRequest message. Does not implicitly {@link yorha.retrieval.SemanticAstPacketRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @static
             * @param {yorha.retrieval.ISemanticAstPacketRequest} message SemanticAstPacketRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SemanticAstPacketRequest.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.atlasContext != null && Object.hasOwnProperty.call(message, "atlasContext"))
                    $root.yorha.shared.AtlasRequestContextV2.encode(message.atlasContext, writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.sourceRef != null && Object.hasOwnProperty.call(message, "sourceRef"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.sourceRef);
                if (message.packetKey != null && Object.hasOwnProperty.call(message, "packetKey"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.packetKey);
                if (message.limit != null && Object.hasOwnProperty.call(message, "limit"))
                    writer.uint32(/* id 4, wireType 0 =*/32).int32(message.limit);
                return writer;
            };

            /**
             * Encodes the specified SemanticAstPacketRequest message, length delimited. Does not implicitly {@link yorha.retrieval.SemanticAstPacketRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @static
             * @param {yorha.retrieval.ISemanticAstPacketRequest} message SemanticAstPacketRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SemanticAstPacketRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SemanticAstPacketRequest message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.SemanticAstPacketRequest} SemanticAstPacketRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SemanticAstPacketRequest.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.SemanticAstPacketRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.atlasContext = $root.yorha.shared.AtlasRequestContextV2.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 2: {
                            message.sourceRef = reader.string();
                            break;
                        }
                    case 3: {
                            message.packetKey = reader.string();
                            break;
                        }
                    case 4: {
                            message.limit = reader.int32();
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
             * Decodes a SemanticAstPacketRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.SemanticAstPacketRequest} SemanticAstPacketRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SemanticAstPacketRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SemanticAstPacketRequest message.
             * @function verify
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SemanticAstPacketRequest.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.atlasContext != null && message.hasOwnProperty("atlasContext")) {
                    let error = $root.yorha.shared.AtlasRequestContextV2.verify(message.atlasContext, long + 1);
                    if (error)
                        return "atlasContext." + error;
                }
                if (message.sourceRef != null && message.hasOwnProperty("sourceRef"))
                    if (!$util.isString(message.sourceRef))
                        return "sourceRef: string expected";
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    if (!$util.isString(message.packetKey))
                        return "packetKey: string expected";
                if (message.limit != null && message.hasOwnProperty("limit"))
                    if (!$util.isInteger(message.limit))
                        return "limit: integer expected";
                return null;
            };

            /**
             * Creates a SemanticAstPacketRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.SemanticAstPacketRequest} SemanticAstPacketRequest
             */
            SemanticAstPacketRequest.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.SemanticAstPacketRequest)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.SemanticAstPacketRequest();
                if (object.atlasContext != null) {
                    if (typeof object.atlasContext !== "object")
                        throw TypeError(".yorha.retrieval.SemanticAstPacketRequest.atlasContext: object expected");
                    message.atlasContext = $root.yorha.shared.AtlasRequestContextV2.fromObject(object.atlasContext, long + 1);
                }
                if (object.sourceRef != null)
                    message.sourceRef = String(object.sourceRef);
                if (object.packetKey != null)
                    message.packetKey = String(object.packetKey);
                if (object.limit != null)
                    message.limit = object.limit | 0;
                return message;
            };

            /**
             * Creates a plain object from a SemanticAstPacketRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @static
             * @param {yorha.retrieval.SemanticAstPacketRequest} message SemanticAstPacketRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SemanticAstPacketRequest.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.atlasContext = null;
                    object.sourceRef = "";
                    object.packetKey = "";
                    object.limit = 0;
                }
                if (message.atlasContext != null && message.hasOwnProperty("atlasContext"))
                    object.atlasContext = $root.yorha.shared.AtlasRequestContextV2.toObject(message.atlasContext, options, q + 1);
                if (message.sourceRef != null && message.hasOwnProperty("sourceRef"))
                    object.sourceRef = message.sourceRef;
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    object.packetKey = message.packetKey;
                if (message.limit != null && message.hasOwnProperty("limit"))
                    object.limit = message.limit;
                return object;
            };

            /**
             * Converts this SemanticAstPacketRequest to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SemanticAstPacketRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SemanticAstPacketRequest
             * @function getTypeUrl
             * @memberof yorha.retrieval.SemanticAstPacketRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SemanticAstPacketRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.SemanticAstPacketRequest";
            };

            return SemanticAstPacketRequest;
        })();

        retrieval.SemanticAstPacketResponse = (function() {

            /**
             * Properties of a SemanticAstPacketResponse.
             * @memberof yorha.retrieval
             * @interface ISemanticAstPacketResponse
             * @property {Array.<yorha.retrieval.ISemanticAstPacket>|null} [packets] SemanticAstPacketResponse packets
             * @property {yorha.shared.IAtlasToolReceiptV2|null} [receipt] SemanticAstPacketResponse receipt
             */

            /**
             * Constructs a new SemanticAstPacketResponse.
             * @memberof yorha.retrieval
             * @classdesc Represents a SemanticAstPacketResponse.
             * @implements ISemanticAstPacketResponse
             * @constructor
             * @param {yorha.retrieval.ISemanticAstPacketResponse=} [properties] Properties to set
             */
            function SemanticAstPacketResponse(properties) {
                this.packets = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SemanticAstPacketResponse packets.
             * @member {Array.<yorha.retrieval.ISemanticAstPacket>} packets
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @instance
             */
            SemanticAstPacketResponse.prototype.packets = $util.emptyArray;

            /**
             * SemanticAstPacketResponse receipt.
             * @member {yorha.shared.IAtlasToolReceiptV2|null|undefined} receipt
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @instance
             */
            SemanticAstPacketResponse.prototype.receipt = null;

            /**
             * Creates a new SemanticAstPacketResponse instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @static
             * @param {yorha.retrieval.ISemanticAstPacketResponse=} [properties] Properties to set
             * @returns {yorha.retrieval.SemanticAstPacketResponse} SemanticAstPacketResponse instance
             */
            SemanticAstPacketResponse.create = function create(properties) {
                return new SemanticAstPacketResponse(properties);
            };

            /**
             * Encodes the specified SemanticAstPacketResponse message. Does not implicitly {@link yorha.retrieval.SemanticAstPacketResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @static
             * @param {yorha.retrieval.ISemanticAstPacketResponse} message SemanticAstPacketResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SemanticAstPacketResponse.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.packets != null && message.packets.length)
                    for (let i = 0; i < message.packets.length; ++i)
                        $root.yorha.retrieval.SemanticAstPacket.encode(message.packets[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.receipt != null && Object.hasOwnProperty.call(message, "receipt"))
                    $root.yorha.shared.AtlasToolReceiptV2.encode(message.receipt, writer.uint32(/* id 2, wireType 2 =*/18).fork(), q + 1).ldelim();
                return writer;
            };

            /**
             * Encodes the specified SemanticAstPacketResponse message, length delimited. Does not implicitly {@link yorha.retrieval.SemanticAstPacketResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @static
             * @param {yorha.retrieval.ISemanticAstPacketResponse} message SemanticAstPacketResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SemanticAstPacketResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SemanticAstPacketResponse message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.SemanticAstPacketResponse} SemanticAstPacketResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SemanticAstPacketResponse.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.SemanticAstPacketResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.packets && message.packets.length))
                                message.packets = [];
                            message.packets.push($root.yorha.retrieval.SemanticAstPacket.decode(reader, reader.uint32(), undefined, long + 1));
                            break;
                        }
                    case 2: {
                            message.receipt = $root.yorha.shared.AtlasToolReceiptV2.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Decodes a SemanticAstPacketResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.SemanticAstPacketResponse} SemanticAstPacketResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SemanticAstPacketResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SemanticAstPacketResponse message.
             * @function verify
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SemanticAstPacketResponse.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.packets != null && message.hasOwnProperty("packets")) {
                    if (!Array.isArray(message.packets))
                        return "packets: array expected";
                    for (let i = 0; i < message.packets.length; ++i) {
                        let error = $root.yorha.retrieval.SemanticAstPacket.verify(message.packets[i], long + 1);
                        if (error)
                            return "packets." + error;
                    }
                }
                if (message.receipt != null && message.hasOwnProperty("receipt")) {
                    let error = $root.yorha.shared.AtlasToolReceiptV2.verify(message.receipt, long + 1);
                    if (error)
                        return "receipt." + error;
                }
                return null;
            };

            /**
             * Creates a SemanticAstPacketResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.SemanticAstPacketResponse} SemanticAstPacketResponse
             */
            SemanticAstPacketResponse.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.SemanticAstPacketResponse)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.SemanticAstPacketResponse();
                if (object.packets) {
                    if (!Array.isArray(object.packets))
                        throw TypeError(".yorha.retrieval.SemanticAstPacketResponse.packets: array expected");
                    message.packets = [];
                    for (let i = 0; i < object.packets.length; ++i) {
                        if (typeof object.packets[i] !== "object")
                            throw TypeError(".yorha.retrieval.SemanticAstPacketResponse.packets: object expected");
                        message.packets[i] = $root.yorha.retrieval.SemanticAstPacket.fromObject(object.packets[i], long + 1);
                    }
                }
                if (object.receipt != null) {
                    if (typeof object.receipt !== "object")
                        throw TypeError(".yorha.retrieval.SemanticAstPacketResponse.receipt: object expected");
                    message.receipt = $root.yorha.shared.AtlasToolReceiptV2.fromObject(object.receipt, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a SemanticAstPacketResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @static
             * @param {yorha.retrieval.SemanticAstPacketResponse} message SemanticAstPacketResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SemanticAstPacketResponse.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.packets = [];
                if (options.defaults)
                    object.receipt = null;
                if (message.packets && message.packets.length) {
                    object.packets = [];
                    for (let j = 0; j < message.packets.length; ++j)
                        object.packets[j] = $root.yorha.retrieval.SemanticAstPacket.toObject(message.packets[j], options, q + 1);
                }
                if (message.receipt != null && message.hasOwnProperty("receipt"))
                    object.receipt = $root.yorha.shared.AtlasToolReceiptV2.toObject(message.receipt, options, q + 1);
                return object;
            };

            /**
             * Converts this SemanticAstPacketResponse to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SemanticAstPacketResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SemanticAstPacketResponse
             * @function getTypeUrl
             * @memberof yorha.retrieval.SemanticAstPacketResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SemanticAstPacketResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.SemanticAstPacketResponse";
            };

            return SemanticAstPacketResponse;
        })();

        retrieval.SemanticAstPacket = (function() {

            /**
             * Properties of a SemanticAstPacket.
             * @memberof yorha.retrieval
             * @interface ISemanticAstPacket
             * @property {string|null} [workspaceId] SemanticAstPacket workspaceId
             * @property {string|null} [workspaceRevision] SemanticAstPacket workspaceRevision
             * @property {string|null} [packetKey] SemanticAstPacket packetKey
             * @property {string|null} [packetRevision] SemanticAstPacket packetRevision
             * @property {string|null} [sourceRef] SemanticAstPacket sourceRef
             * @property {string|null} [sourceRevision] SemanticAstPacket sourceRevision
             * @property {string|null} [contentHash] SemanticAstPacket contentHash
             * @property {string|null} [chunkId] SemanticAstPacket chunkId
             * @property {string|null} [treeNodeId] SemanticAstPacket treeNodeId
             * @property {string|null} [nodeKind] SemanticAstPacket nodeKind
             * @property {string|null} [qualifiedSymbol] SemanticAstPacket qualifiedSymbol
             * @property {string|null} [parentTreeNodeId] SemanticAstPacket parentTreeNodeId
             * @property {number|Long|null} [byteStart] SemanticAstPacket byteStart
             * @property {number|Long|null} [byteEnd] SemanticAstPacket byteEnd
             * @property {string|null} [parserName] SemanticAstPacket parserName
             * @property {string|null} [parserRevision] SemanticAstPacket parserRevision
             * @property {string|null} [grammarRevision] SemanticAstPacket grammarRevision
             * @property {string|null} [astContentHash] SemanticAstPacket astContentHash
             */

            /**
             * Constructs a new SemanticAstPacket.
             * @memberof yorha.retrieval
             * @classdesc Represents a SemanticAstPacket.
             * @implements ISemanticAstPacket
             * @constructor
             * @param {yorha.retrieval.ISemanticAstPacket=} [properties] Properties to set
             */
            function SemanticAstPacket(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SemanticAstPacket workspaceId.
             * @member {string} workspaceId
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.workspaceId = "";

            /**
             * SemanticAstPacket workspaceRevision.
             * @member {string} workspaceRevision
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.workspaceRevision = "";

            /**
             * SemanticAstPacket packetKey.
             * @member {string} packetKey
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.packetKey = "";

            /**
             * SemanticAstPacket packetRevision.
             * @member {string} packetRevision
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.packetRevision = "";

            /**
             * SemanticAstPacket sourceRef.
             * @member {string} sourceRef
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.sourceRef = "";

            /**
             * SemanticAstPacket sourceRevision.
             * @member {string} sourceRevision
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.sourceRevision = "";

            /**
             * SemanticAstPacket contentHash.
             * @member {string} contentHash
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.contentHash = "";

            /**
             * SemanticAstPacket chunkId.
             * @member {string} chunkId
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.chunkId = "";

            /**
             * SemanticAstPacket treeNodeId.
             * @member {string} treeNodeId
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.treeNodeId = "";

            /**
             * SemanticAstPacket nodeKind.
             * @member {string} nodeKind
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.nodeKind = "";

            /**
             * SemanticAstPacket qualifiedSymbol.
             * @member {string} qualifiedSymbol
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.qualifiedSymbol = "";

            /**
             * SemanticAstPacket parentTreeNodeId.
             * @member {string} parentTreeNodeId
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.parentTreeNodeId = "";

            /**
             * SemanticAstPacket byteStart.
             * @member {number|Long} byteStart
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.byteStart = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * SemanticAstPacket byteEnd.
             * @member {number|Long} byteEnd
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.byteEnd = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * SemanticAstPacket parserName.
             * @member {string} parserName
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.parserName = "";

            /**
             * SemanticAstPacket parserRevision.
             * @member {string} parserRevision
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.parserRevision = "";

            /**
             * SemanticAstPacket grammarRevision.
             * @member {string} grammarRevision
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.grammarRevision = "";

            /**
             * SemanticAstPacket astContentHash.
             * @member {string} astContentHash
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             */
            SemanticAstPacket.prototype.astContentHash = "";

            /**
             * Creates a new SemanticAstPacket instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.SemanticAstPacket
             * @static
             * @param {yorha.retrieval.ISemanticAstPacket=} [properties] Properties to set
             * @returns {yorha.retrieval.SemanticAstPacket} SemanticAstPacket instance
             */
            SemanticAstPacket.create = function create(properties) {
                return new SemanticAstPacket(properties);
            };

            /**
             * Encodes the specified SemanticAstPacket message. Does not implicitly {@link yorha.retrieval.SemanticAstPacket.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.SemanticAstPacket
             * @static
             * @param {yorha.retrieval.ISemanticAstPacket} message SemanticAstPacket message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SemanticAstPacket.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.workspaceId != null && Object.hasOwnProperty.call(message, "workspaceId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.workspaceId);
                if (message.workspaceRevision != null && Object.hasOwnProperty.call(message, "workspaceRevision"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.workspaceRevision);
                if (message.packetKey != null && Object.hasOwnProperty.call(message, "packetKey"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.packetKey);
                if (message.packetRevision != null && Object.hasOwnProperty.call(message, "packetRevision"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.packetRevision);
                if (message.sourceRef != null && Object.hasOwnProperty.call(message, "sourceRef"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.sourceRef);
                if (message.sourceRevision != null && Object.hasOwnProperty.call(message, "sourceRevision"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.sourceRevision);
                if (message.contentHash != null && Object.hasOwnProperty.call(message, "contentHash"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.contentHash);
                if (message.chunkId != null && Object.hasOwnProperty.call(message, "chunkId"))
                    writer.uint32(/* id 8, wireType 2 =*/66).string(message.chunkId);
                if (message.treeNodeId != null && Object.hasOwnProperty.call(message, "treeNodeId"))
                    writer.uint32(/* id 9, wireType 2 =*/74).string(message.treeNodeId);
                if (message.nodeKind != null && Object.hasOwnProperty.call(message, "nodeKind"))
                    writer.uint32(/* id 10, wireType 2 =*/82).string(message.nodeKind);
                if (message.qualifiedSymbol != null && Object.hasOwnProperty.call(message, "qualifiedSymbol"))
                    writer.uint32(/* id 11, wireType 2 =*/90).string(message.qualifiedSymbol);
                if (message.parentTreeNodeId != null && Object.hasOwnProperty.call(message, "parentTreeNodeId"))
                    writer.uint32(/* id 12, wireType 2 =*/98).string(message.parentTreeNodeId);
                if (message.byteStart != null && Object.hasOwnProperty.call(message, "byteStart"))
                    writer.uint32(/* id 13, wireType 0 =*/104).int64(message.byteStart);
                if (message.byteEnd != null && Object.hasOwnProperty.call(message, "byteEnd"))
                    writer.uint32(/* id 14, wireType 0 =*/112).int64(message.byteEnd);
                if (message.parserName != null && Object.hasOwnProperty.call(message, "parserName"))
                    writer.uint32(/* id 15, wireType 2 =*/122).string(message.parserName);
                if (message.parserRevision != null && Object.hasOwnProperty.call(message, "parserRevision"))
                    writer.uint32(/* id 16, wireType 2 =*/130).string(message.parserRevision);
                if (message.grammarRevision != null && Object.hasOwnProperty.call(message, "grammarRevision"))
                    writer.uint32(/* id 17, wireType 2 =*/138).string(message.grammarRevision);
                if (message.astContentHash != null && Object.hasOwnProperty.call(message, "astContentHash"))
                    writer.uint32(/* id 18, wireType 2 =*/146).string(message.astContentHash);
                return writer;
            };

            /**
             * Encodes the specified SemanticAstPacket message, length delimited. Does not implicitly {@link yorha.retrieval.SemanticAstPacket.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.SemanticAstPacket
             * @static
             * @param {yorha.retrieval.ISemanticAstPacket} message SemanticAstPacket message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SemanticAstPacket.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SemanticAstPacket message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.SemanticAstPacket
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.SemanticAstPacket} SemanticAstPacket
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SemanticAstPacket.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.SemanticAstPacket();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.workspaceId = reader.string();
                            break;
                        }
                    case 2: {
                            message.workspaceRevision = reader.string();
                            break;
                        }
                    case 3: {
                            message.packetKey = reader.string();
                            break;
                        }
                    case 4: {
                            message.packetRevision = reader.string();
                            break;
                        }
                    case 5: {
                            message.sourceRef = reader.string();
                            break;
                        }
                    case 6: {
                            message.sourceRevision = reader.string();
                            break;
                        }
                    case 7: {
                            message.contentHash = reader.string();
                            break;
                        }
                    case 8: {
                            message.chunkId = reader.string();
                            break;
                        }
                    case 9: {
                            message.treeNodeId = reader.string();
                            break;
                        }
                    case 10: {
                            message.nodeKind = reader.string();
                            break;
                        }
                    case 11: {
                            message.qualifiedSymbol = reader.string();
                            break;
                        }
                    case 12: {
                            message.parentTreeNodeId = reader.string();
                            break;
                        }
                    case 13: {
                            message.byteStart = reader.int64();
                            break;
                        }
                    case 14: {
                            message.byteEnd = reader.int64();
                            break;
                        }
                    case 15: {
                            message.parserName = reader.string();
                            break;
                        }
                    case 16: {
                            message.parserRevision = reader.string();
                            break;
                        }
                    case 17: {
                            message.grammarRevision = reader.string();
                            break;
                        }
                    case 18: {
                            message.astContentHash = reader.string();
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
             * Decodes a SemanticAstPacket message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.SemanticAstPacket
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.SemanticAstPacket} SemanticAstPacket
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SemanticAstPacket.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SemanticAstPacket message.
             * @function verify
             * @memberof yorha.retrieval.SemanticAstPacket
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SemanticAstPacket.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.workspaceId != null && message.hasOwnProperty("workspaceId"))
                    if (!$util.isString(message.workspaceId))
                        return "workspaceId: string expected";
                if (message.workspaceRevision != null && message.hasOwnProperty("workspaceRevision"))
                    if (!$util.isString(message.workspaceRevision))
                        return "workspaceRevision: string expected";
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    if (!$util.isString(message.packetKey))
                        return "packetKey: string expected";
                if (message.packetRevision != null && message.hasOwnProperty("packetRevision"))
                    if (!$util.isString(message.packetRevision))
                        return "packetRevision: string expected";
                if (message.sourceRef != null && message.hasOwnProperty("sourceRef"))
                    if (!$util.isString(message.sourceRef))
                        return "sourceRef: string expected";
                if (message.sourceRevision != null && message.hasOwnProperty("sourceRevision"))
                    if (!$util.isString(message.sourceRevision))
                        return "sourceRevision: string expected";
                if (message.contentHash != null && message.hasOwnProperty("contentHash"))
                    if (!$util.isString(message.contentHash))
                        return "contentHash: string expected";
                if (message.chunkId != null && message.hasOwnProperty("chunkId"))
                    if (!$util.isString(message.chunkId))
                        return "chunkId: string expected";
                if (message.treeNodeId != null && message.hasOwnProperty("treeNodeId"))
                    if (!$util.isString(message.treeNodeId))
                        return "treeNodeId: string expected";
                if (message.nodeKind != null && message.hasOwnProperty("nodeKind"))
                    if (!$util.isString(message.nodeKind))
                        return "nodeKind: string expected";
                if (message.qualifiedSymbol != null && message.hasOwnProperty("qualifiedSymbol"))
                    if (!$util.isString(message.qualifiedSymbol))
                        return "qualifiedSymbol: string expected";
                if (message.parentTreeNodeId != null && message.hasOwnProperty("parentTreeNodeId"))
                    if (!$util.isString(message.parentTreeNodeId))
                        return "parentTreeNodeId: string expected";
                if (message.byteStart != null && message.hasOwnProperty("byteStart"))
                    if (!$util.isInteger(message.byteStart) && !(message.byteStart && $util.isInteger(message.byteStart.low) && $util.isInteger(message.byteStart.high)))
                        return "byteStart: integer|Long expected";
                if (message.byteEnd != null && message.hasOwnProperty("byteEnd"))
                    if (!$util.isInteger(message.byteEnd) && !(message.byteEnd && $util.isInteger(message.byteEnd.low) && $util.isInteger(message.byteEnd.high)))
                        return "byteEnd: integer|Long expected";
                if (message.parserName != null && message.hasOwnProperty("parserName"))
                    if (!$util.isString(message.parserName))
                        return "parserName: string expected";
                if (message.parserRevision != null && message.hasOwnProperty("parserRevision"))
                    if (!$util.isString(message.parserRevision))
                        return "parserRevision: string expected";
                if (message.grammarRevision != null && message.hasOwnProperty("grammarRevision"))
                    if (!$util.isString(message.grammarRevision))
                        return "grammarRevision: string expected";
                if (message.astContentHash != null && message.hasOwnProperty("astContentHash"))
                    if (!$util.isString(message.astContentHash))
                        return "astContentHash: string expected";
                return null;
            };

            /**
             * Creates a SemanticAstPacket message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.SemanticAstPacket
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.SemanticAstPacket} SemanticAstPacket
             */
            SemanticAstPacket.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.SemanticAstPacket)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.SemanticAstPacket();
                if (object.workspaceId != null)
                    message.workspaceId = String(object.workspaceId);
                if (object.workspaceRevision != null)
                    message.workspaceRevision = String(object.workspaceRevision);
                if (object.packetKey != null)
                    message.packetKey = String(object.packetKey);
                if (object.packetRevision != null)
                    message.packetRevision = String(object.packetRevision);
                if (object.sourceRef != null)
                    message.sourceRef = String(object.sourceRef);
                if (object.sourceRevision != null)
                    message.sourceRevision = String(object.sourceRevision);
                if (object.contentHash != null)
                    message.contentHash = String(object.contentHash);
                if (object.chunkId != null)
                    message.chunkId = String(object.chunkId);
                if (object.treeNodeId != null)
                    message.treeNodeId = String(object.treeNodeId);
                if (object.nodeKind != null)
                    message.nodeKind = String(object.nodeKind);
                if (object.qualifiedSymbol != null)
                    message.qualifiedSymbol = String(object.qualifiedSymbol);
                if (object.parentTreeNodeId != null)
                    message.parentTreeNodeId = String(object.parentTreeNodeId);
                if (object.byteStart != null)
                    if ($util.Long)
                        message.byteStart = $util.Long.fromValue(object.byteStart, false);
                    else if (typeof object.byteStart === "string")
                        message.byteStart = parseInt(object.byteStart, 10);
                    else if (typeof object.byteStart === "number")
                        message.byteStart = object.byteStart;
                    else if (typeof object.byteStart === "object")
                        message.byteStart = new $util.LongBits(object.byteStart.low >>> 0, object.byteStart.high >>> 0).toNumber();
                if (object.byteEnd != null)
                    if ($util.Long)
                        message.byteEnd = $util.Long.fromValue(object.byteEnd, false);
                    else if (typeof object.byteEnd === "string")
                        message.byteEnd = parseInt(object.byteEnd, 10);
                    else if (typeof object.byteEnd === "number")
                        message.byteEnd = object.byteEnd;
                    else if (typeof object.byteEnd === "object")
                        message.byteEnd = new $util.LongBits(object.byteEnd.low >>> 0, object.byteEnd.high >>> 0).toNumber();
                if (object.parserName != null)
                    message.parserName = String(object.parserName);
                if (object.parserRevision != null)
                    message.parserRevision = String(object.parserRevision);
                if (object.grammarRevision != null)
                    message.grammarRevision = String(object.grammarRevision);
                if (object.astContentHash != null)
                    message.astContentHash = String(object.astContentHash);
                return message;
            };

            /**
             * Creates a plain object from a SemanticAstPacket message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.SemanticAstPacket
             * @static
             * @param {yorha.retrieval.SemanticAstPacket} message SemanticAstPacket
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SemanticAstPacket.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.workspaceId = "";
                    object.workspaceRevision = "";
                    object.packetKey = "";
                    object.packetRevision = "";
                    object.sourceRef = "";
                    object.sourceRevision = "";
                    object.contentHash = "";
                    object.chunkId = "";
                    object.treeNodeId = "";
                    object.nodeKind = "";
                    object.qualifiedSymbol = "";
                    object.parentTreeNodeId = "";
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.byteStart = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : typeof BigInt !== "undefined" && options.longs === BigInt ? long.toBigInt() : long;
                    } else
                        object.byteStart = options.longs === String ? "0" : typeof BigInt !== "undefined" && options.longs === BigInt ? BigInt("0") : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.byteEnd = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : typeof BigInt !== "undefined" && options.longs === BigInt ? long.toBigInt() : long;
                    } else
                        object.byteEnd = options.longs === String ? "0" : typeof BigInt !== "undefined" && options.longs === BigInt ? BigInt("0") : 0;
                    object.parserName = "";
                    object.parserRevision = "";
                    object.grammarRevision = "";
                    object.astContentHash = "";
                }
                if (message.workspaceId != null && message.hasOwnProperty("workspaceId"))
                    object.workspaceId = message.workspaceId;
                if (message.workspaceRevision != null && message.hasOwnProperty("workspaceRevision"))
                    object.workspaceRevision = message.workspaceRevision;
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    object.packetKey = message.packetKey;
                if (message.packetRevision != null && message.hasOwnProperty("packetRevision"))
                    object.packetRevision = message.packetRevision;
                if (message.sourceRef != null && message.hasOwnProperty("sourceRef"))
                    object.sourceRef = message.sourceRef;
                if (message.sourceRevision != null && message.hasOwnProperty("sourceRevision"))
                    object.sourceRevision = message.sourceRevision;
                if (message.contentHash != null && message.hasOwnProperty("contentHash"))
                    object.contentHash = message.contentHash;
                if (message.chunkId != null && message.hasOwnProperty("chunkId"))
                    object.chunkId = message.chunkId;
                if (message.treeNodeId != null && message.hasOwnProperty("treeNodeId"))
                    object.treeNodeId = message.treeNodeId;
                if (message.nodeKind != null && message.hasOwnProperty("nodeKind"))
                    object.nodeKind = message.nodeKind;
                if (message.qualifiedSymbol != null && message.hasOwnProperty("qualifiedSymbol"))
                    object.qualifiedSymbol = message.qualifiedSymbol;
                if (message.parentTreeNodeId != null && message.hasOwnProperty("parentTreeNodeId"))
                    object.parentTreeNodeId = message.parentTreeNodeId;
                if (message.byteStart != null && message.hasOwnProperty("byteStart"))
                    if (typeof BigInt !== "undefined" && options.longs === BigInt)
                        object.byteStart = typeof message.byteStart === "number" ? BigInt(message.byteStart) : $util.Long.fromBits(message.byteStart.low >>> 0, message.byteStart.high >>> 0, false).toBigInt();
                    else if (typeof message.byteStart === "number")
                        object.byteStart = options.longs === String ? String(message.byteStart) : message.byteStart;
                    else
                        object.byteStart = options.longs === String ? $util.Long.prototype.toString.call(message.byteStart) : options.longs === Number ? new $util.LongBits(message.byteStart.low >>> 0, message.byteStart.high >>> 0).toNumber() : message.byteStart;
                if (message.byteEnd != null && message.hasOwnProperty("byteEnd"))
                    if (typeof BigInt !== "undefined" && options.longs === BigInt)
                        object.byteEnd = typeof message.byteEnd === "number" ? BigInt(message.byteEnd) : $util.Long.fromBits(message.byteEnd.low >>> 0, message.byteEnd.high >>> 0, false).toBigInt();
                    else if (typeof message.byteEnd === "number")
                        object.byteEnd = options.longs === String ? String(message.byteEnd) : message.byteEnd;
                    else
                        object.byteEnd = options.longs === String ? $util.Long.prototype.toString.call(message.byteEnd) : options.longs === Number ? new $util.LongBits(message.byteEnd.low >>> 0, message.byteEnd.high >>> 0).toNumber() : message.byteEnd;
                if (message.parserName != null && message.hasOwnProperty("parserName"))
                    object.parserName = message.parserName;
                if (message.parserRevision != null && message.hasOwnProperty("parserRevision"))
                    object.parserRevision = message.parserRevision;
                if (message.grammarRevision != null && message.hasOwnProperty("grammarRevision"))
                    object.grammarRevision = message.grammarRevision;
                if (message.astContentHash != null && message.hasOwnProperty("astContentHash"))
                    object.astContentHash = message.astContentHash;
                return object;
            };

            /**
             * Converts this SemanticAstPacket to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.SemanticAstPacket
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SemanticAstPacket.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SemanticAstPacket
             * @function getTypeUrl
             * @memberof yorha.retrieval.SemanticAstPacket
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SemanticAstPacket.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.SemanticAstPacket";
            };

            return SemanticAstPacket;
        })();

        retrieval.PacketRegistryRequest = (function() {

            /**
             * Properties of a PacketRegistryRequest.
             * @memberof yorha.retrieval
             * @interface IPacketRegistryRequest
             * @property {yorha.shared.IAtlasRequestContextV2|null} [atlasContext] PacketRegistryRequest atlasContext
             * @property {string|null} [sourceRef] PacketRegistryRequest sourceRef
             * @property {string|null} [packetKey] PacketRegistryRequest packetKey
             * @property {number|null} [limit] PacketRegistryRequest limit
             */

            /**
             * Constructs a new PacketRegistryRequest.
             * @memberof yorha.retrieval
             * @classdesc Represents a PacketRegistryRequest.
             * @implements IPacketRegistryRequest
             * @constructor
             * @param {yorha.retrieval.IPacketRegistryRequest=} [properties] Properties to set
             */
            function PacketRegistryRequest(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * PacketRegistryRequest atlasContext.
             * @member {yorha.shared.IAtlasRequestContextV2|null|undefined} atlasContext
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @instance
             */
            PacketRegistryRequest.prototype.atlasContext = null;

            /**
             * PacketRegistryRequest sourceRef.
             * @member {string} sourceRef
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @instance
             */
            PacketRegistryRequest.prototype.sourceRef = "";

            /**
             * PacketRegistryRequest packetKey.
             * @member {string} packetKey
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @instance
             */
            PacketRegistryRequest.prototype.packetKey = "";

            /**
             * PacketRegistryRequest limit.
             * @member {number} limit
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @instance
             */
            PacketRegistryRequest.prototype.limit = 0;

            /**
             * Creates a new PacketRegistryRequest instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @static
             * @param {yorha.retrieval.IPacketRegistryRequest=} [properties] Properties to set
             * @returns {yorha.retrieval.PacketRegistryRequest} PacketRegistryRequest instance
             */
            PacketRegistryRequest.create = function create(properties) {
                return new PacketRegistryRequest(properties);
            };

            /**
             * Encodes the specified PacketRegistryRequest message. Does not implicitly {@link yorha.retrieval.PacketRegistryRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @static
             * @param {yorha.retrieval.IPacketRegistryRequest} message PacketRegistryRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PacketRegistryRequest.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.atlasContext != null && Object.hasOwnProperty.call(message, "atlasContext"))
                    $root.yorha.shared.AtlasRequestContextV2.encode(message.atlasContext, writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.sourceRef != null && Object.hasOwnProperty.call(message, "sourceRef"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.sourceRef);
                if (message.packetKey != null && Object.hasOwnProperty.call(message, "packetKey"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.packetKey);
                if (message.limit != null && Object.hasOwnProperty.call(message, "limit"))
                    writer.uint32(/* id 4, wireType 0 =*/32).int32(message.limit);
                return writer;
            };

            /**
             * Encodes the specified PacketRegistryRequest message, length delimited. Does not implicitly {@link yorha.retrieval.PacketRegistryRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @static
             * @param {yorha.retrieval.IPacketRegistryRequest} message PacketRegistryRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PacketRegistryRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a PacketRegistryRequest message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.PacketRegistryRequest} PacketRegistryRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            PacketRegistryRequest.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.PacketRegistryRequest();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.atlasContext = $root.yorha.shared.AtlasRequestContextV2.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 2: {
                            message.sourceRef = reader.string();
                            break;
                        }
                    case 3: {
                            message.packetKey = reader.string();
                            break;
                        }
                    case 4: {
                            message.limit = reader.int32();
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
             * Decodes a PacketRegistryRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.PacketRegistryRequest} PacketRegistryRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            PacketRegistryRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a PacketRegistryRequest message.
             * @function verify
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            PacketRegistryRequest.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.atlasContext != null && message.hasOwnProperty("atlasContext")) {
                    let error = $root.yorha.shared.AtlasRequestContextV2.verify(message.atlasContext, long + 1);
                    if (error)
                        return "atlasContext." + error;
                }
                if (message.sourceRef != null && message.hasOwnProperty("sourceRef"))
                    if (!$util.isString(message.sourceRef))
                        return "sourceRef: string expected";
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    if (!$util.isString(message.packetKey))
                        return "packetKey: string expected";
                if (message.limit != null && message.hasOwnProperty("limit"))
                    if (!$util.isInteger(message.limit))
                        return "limit: integer expected";
                return null;
            };

            /**
             * Creates a PacketRegistryRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.PacketRegistryRequest} PacketRegistryRequest
             */
            PacketRegistryRequest.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.PacketRegistryRequest)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.PacketRegistryRequest();
                if (object.atlasContext != null) {
                    if (typeof object.atlasContext !== "object")
                        throw TypeError(".yorha.retrieval.PacketRegistryRequest.atlasContext: object expected");
                    message.atlasContext = $root.yorha.shared.AtlasRequestContextV2.fromObject(object.atlasContext, long + 1);
                }
                if (object.sourceRef != null)
                    message.sourceRef = String(object.sourceRef);
                if (object.packetKey != null)
                    message.packetKey = String(object.packetKey);
                if (object.limit != null)
                    message.limit = object.limit | 0;
                return message;
            };

            /**
             * Creates a plain object from a PacketRegistryRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @static
             * @param {yorha.retrieval.PacketRegistryRequest} message PacketRegistryRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            PacketRegistryRequest.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.atlasContext = null;
                    object.sourceRef = "";
                    object.packetKey = "";
                    object.limit = 0;
                }
                if (message.atlasContext != null && message.hasOwnProperty("atlasContext"))
                    object.atlasContext = $root.yorha.shared.AtlasRequestContextV2.toObject(message.atlasContext, options, q + 1);
                if (message.sourceRef != null && message.hasOwnProperty("sourceRef"))
                    object.sourceRef = message.sourceRef;
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    object.packetKey = message.packetKey;
                if (message.limit != null && message.hasOwnProperty("limit"))
                    object.limit = message.limit;
                return object;
            };

            /**
             * Converts this PacketRegistryRequest to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            PacketRegistryRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for PacketRegistryRequest
             * @function getTypeUrl
             * @memberof yorha.retrieval.PacketRegistryRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            PacketRegistryRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.PacketRegistryRequest";
            };

            return PacketRegistryRequest;
        })();

        retrieval.PacketRegistryResponse = (function() {

            /**
             * Properties of a PacketRegistryResponse.
             * @memberof yorha.retrieval
             * @interface IPacketRegistryResponse
             * @property {Array.<yorha.retrieval.IPacketRegistryEntry>|null} [entries] PacketRegistryResponse entries
             * @property {yorha.shared.IAtlasToolReceiptV2|null} [receipt] PacketRegistryResponse receipt
             */

            /**
             * Constructs a new PacketRegistryResponse.
             * @memberof yorha.retrieval
             * @classdesc Represents a PacketRegistryResponse.
             * @implements IPacketRegistryResponse
             * @constructor
             * @param {yorha.retrieval.IPacketRegistryResponse=} [properties] Properties to set
             */
            function PacketRegistryResponse(properties) {
                this.entries = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * PacketRegistryResponse entries.
             * @member {Array.<yorha.retrieval.IPacketRegistryEntry>} entries
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @instance
             */
            PacketRegistryResponse.prototype.entries = $util.emptyArray;

            /**
             * PacketRegistryResponse receipt.
             * @member {yorha.shared.IAtlasToolReceiptV2|null|undefined} receipt
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @instance
             */
            PacketRegistryResponse.prototype.receipt = null;

            /**
             * Creates a new PacketRegistryResponse instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @static
             * @param {yorha.retrieval.IPacketRegistryResponse=} [properties] Properties to set
             * @returns {yorha.retrieval.PacketRegistryResponse} PacketRegistryResponse instance
             */
            PacketRegistryResponse.create = function create(properties) {
                return new PacketRegistryResponse(properties);
            };

            /**
             * Encodes the specified PacketRegistryResponse message. Does not implicitly {@link yorha.retrieval.PacketRegistryResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @static
             * @param {yorha.retrieval.IPacketRegistryResponse} message PacketRegistryResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PacketRegistryResponse.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.entries != null && message.entries.length)
                    for (let i = 0; i < message.entries.length; ++i)
                        $root.yorha.retrieval.PacketRegistryEntry.encode(message.entries[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.receipt != null && Object.hasOwnProperty.call(message, "receipt"))
                    $root.yorha.shared.AtlasToolReceiptV2.encode(message.receipt, writer.uint32(/* id 2, wireType 2 =*/18).fork(), q + 1).ldelim();
                return writer;
            };

            /**
             * Encodes the specified PacketRegistryResponse message, length delimited. Does not implicitly {@link yorha.retrieval.PacketRegistryResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @static
             * @param {yorha.retrieval.IPacketRegistryResponse} message PacketRegistryResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PacketRegistryResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a PacketRegistryResponse message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.PacketRegistryResponse} PacketRegistryResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            PacketRegistryResponse.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.PacketRegistryResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.entries && message.entries.length))
                                message.entries = [];
                            message.entries.push($root.yorha.retrieval.PacketRegistryEntry.decode(reader, reader.uint32(), undefined, long + 1));
                            break;
                        }
                    case 2: {
                            message.receipt = $root.yorha.shared.AtlasToolReceiptV2.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Decodes a PacketRegistryResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.PacketRegistryResponse} PacketRegistryResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            PacketRegistryResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a PacketRegistryResponse message.
             * @function verify
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            PacketRegistryResponse.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.entries != null && message.hasOwnProperty("entries")) {
                    if (!Array.isArray(message.entries))
                        return "entries: array expected";
                    for (let i = 0; i < message.entries.length; ++i) {
                        let error = $root.yorha.retrieval.PacketRegistryEntry.verify(message.entries[i], long + 1);
                        if (error)
                            return "entries." + error;
                    }
                }
                if (message.receipt != null && message.hasOwnProperty("receipt")) {
                    let error = $root.yorha.shared.AtlasToolReceiptV2.verify(message.receipt, long + 1);
                    if (error)
                        return "receipt." + error;
                }
                return null;
            };

            /**
             * Creates a PacketRegistryResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.PacketRegistryResponse} PacketRegistryResponse
             */
            PacketRegistryResponse.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.PacketRegistryResponse)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.PacketRegistryResponse();
                if (object.entries) {
                    if (!Array.isArray(object.entries))
                        throw TypeError(".yorha.retrieval.PacketRegistryResponse.entries: array expected");
                    message.entries = [];
                    for (let i = 0; i < object.entries.length; ++i) {
                        if (typeof object.entries[i] !== "object")
                            throw TypeError(".yorha.retrieval.PacketRegistryResponse.entries: object expected");
                        message.entries[i] = $root.yorha.retrieval.PacketRegistryEntry.fromObject(object.entries[i], long + 1);
                    }
                }
                if (object.receipt != null) {
                    if (typeof object.receipt !== "object")
                        throw TypeError(".yorha.retrieval.PacketRegistryResponse.receipt: object expected");
                    message.receipt = $root.yorha.shared.AtlasToolReceiptV2.fromObject(object.receipt, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a PacketRegistryResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @static
             * @param {yorha.retrieval.PacketRegistryResponse} message PacketRegistryResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            PacketRegistryResponse.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.entries = [];
                if (options.defaults)
                    object.receipt = null;
                if (message.entries && message.entries.length) {
                    object.entries = [];
                    for (let j = 0; j < message.entries.length; ++j)
                        object.entries[j] = $root.yorha.retrieval.PacketRegistryEntry.toObject(message.entries[j], options, q + 1);
                }
                if (message.receipt != null && message.hasOwnProperty("receipt"))
                    object.receipt = $root.yorha.shared.AtlasToolReceiptV2.toObject(message.receipt, options, q + 1);
                return object;
            };

            /**
             * Converts this PacketRegistryResponse to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            PacketRegistryResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for PacketRegistryResponse
             * @function getTypeUrl
             * @memberof yorha.retrieval.PacketRegistryResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            PacketRegistryResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.PacketRegistryResponse";
            };

            return PacketRegistryResponse;
        })();

        retrieval.PacketRegistryEntry = (function() {

            /**
             * Properties of a PacketRegistryEntry.
             * @memberof yorha.retrieval
             * @interface IPacketRegistryEntry
             * @property {string|null} [schema] PacketRegistryEntry schema
             * @property {string|null} [workspaceId] PacketRegistryEntry workspaceId
             * @property {string|null} [workspaceRevision] PacketRegistryEntry workspaceRevision
             * @property {string|null} [packetKey] PacketRegistryEntry packetKey
             * @property {string|null} [packetRevision] PacketRegistryEntry packetRevision
             * @property {string|null} [sourceRef] PacketRegistryEntry sourceRef
             * @property {string|null} [sourceRevision] PacketRegistryEntry sourceRevision
             * @property {string|null} [contentHash] PacketRegistryEntry contentHash
             * @property {Array.<yorha.retrieval.IPacketRegistryLane>|null} [lanes] PacketRegistryEntry lanes
             * @property {string|null} [registryRevision] PacketRegistryEntry registryRevision
             */

            /**
             * Constructs a new PacketRegistryEntry.
             * @memberof yorha.retrieval
             * @classdesc Represents a PacketRegistryEntry.
             * @implements IPacketRegistryEntry
             * @constructor
             * @param {yorha.retrieval.IPacketRegistryEntry=} [properties] Properties to set
             */
            function PacketRegistryEntry(properties) {
                this.lanes = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * PacketRegistryEntry schema.
             * @member {string} schema
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             */
            PacketRegistryEntry.prototype.schema = "";

            /**
             * PacketRegistryEntry workspaceId.
             * @member {string} workspaceId
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             */
            PacketRegistryEntry.prototype.workspaceId = "";

            /**
             * PacketRegistryEntry workspaceRevision.
             * @member {string} workspaceRevision
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             */
            PacketRegistryEntry.prototype.workspaceRevision = "";

            /**
             * PacketRegistryEntry packetKey.
             * @member {string} packetKey
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             */
            PacketRegistryEntry.prototype.packetKey = "";

            /**
             * PacketRegistryEntry packetRevision.
             * @member {string} packetRevision
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             */
            PacketRegistryEntry.prototype.packetRevision = "";

            /**
             * PacketRegistryEntry sourceRef.
             * @member {string} sourceRef
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             */
            PacketRegistryEntry.prototype.sourceRef = "";

            /**
             * PacketRegistryEntry sourceRevision.
             * @member {string} sourceRevision
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             */
            PacketRegistryEntry.prototype.sourceRevision = "";

            /**
             * PacketRegistryEntry contentHash.
             * @member {string} contentHash
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             */
            PacketRegistryEntry.prototype.contentHash = "";

            /**
             * PacketRegistryEntry lanes.
             * @member {Array.<yorha.retrieval.IPacketRegistryLane>} lanes
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             */
            PacketRegistryEntry.prototype.lanes = $util.emptyArray;

            /**
             * PacketRegistryEntry registryRevision.
             * @member {string} registryRevision
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             */
            PacketRegistryEntry.prototype.registryRevision = "";

            /**
             * Creates a new PacketRegistryEntry instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @static
             * @param {yorha.retrieval.IPacketRegistryEntry=} [properties] Properties to set
             * @returns {yorha.retrieval.PacketRegistryEntry} PacketRegistryEntry instance
             */
            PacketRegistryEntry.create = function create(properties) {
                return new PacketRegistryEntry(properties);
            };

            /**
             * Encodes the specified PacketRegistryEntry message. Does not implicitly {@link yorha.retrieval.PacketRegistryEntry.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @static
             * @param {yorha.retrieval.IPacketRegistryEntry} message PacketRegistryEntry message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PacketRegistryEntry.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.schema != null && Object.hasOwnProperty.call(message, "schema"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.schema);
                if (message.workspaceId != null && Object.hasOwnProperty.call(message, "workspaceId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.workspaceId);
                if (message.workspaceRevision != null && Object.hasOwnProperty.call(message, "workspaceRevision"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.workspaceRevision);
                if (message.packetKey != null && Object.hasOwnProperty.call(message, "packetKey"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.packetKey);
                if (message.packetRevision != null && Object.hasOwnProperty.call(message, "packetRevision"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.packetRevision);
                if (message.sourceRef != null && Object.hasOwnProperty.call(message, "sourceRef"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.sourceRef);
                if (message.sourceRevision != null && Object.hasOwnProperty.call(message, "sourceRevision"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.sourceRevision);
                if (message.contentHash != null && Object.hasOwnProperty.call(message, "contentHash"))
                    writer.uint32(/* id 8, wireType 2 =*/66).string(message.contentHash);
                if (message.lanes != null && message.lanes.length)
                    for (let i = 0; i < message.lanes.length; ++i)
                        $root.yorha.retrieval.PacketRegistryLane.encode(message.lanes[i], writer.uint32(/* id 9, wireType 2 =*/74).fork(), q + 1).ldelim();
                if (message.registryRevision != null && Object.hasOwnProperty.call(message, "registryRevision"))
                    writer.uint32(/* id 10, wireType 2 =*/82).string(message.registryRevision);
                return writer;
            };

            /**
             * Encodes the specified PacketRegistryEntry message, length delimited. Does not implicitly {@link yorha.retrieval.PacketRegistryEntry.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @static
             * @param {yorha.retrieval.IPacketRegistryEntry} message PacketRegistryEntry message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PacketRegistryEntry.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a PacketRegistryEntry message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.PacketRegistryEntry} PacketRegistryEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            PacketRegistryEntry.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.PacketRegistryEntry();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.schema = reader.string();
                            break;
                        }
                    case 2: {
                            message.workspaceId = reader.string();
                            break;
                        }
                    case 3: {
                            message.workspaceRevision = reader.string();
                            break;
                        }
                    case 4: {
                            message.packetKey = reader.string();
                            break;
                        }
                    case 5: {
                            message.packetRevision = reader.string();
                            break;
                        }
                    case 6: {
                            message.sourceRef = reader.string();
                            break;
                        }
                    case 7: {
                            message.sourceRevision = reader.string();
                            break;
                        }
                    case 8: {
                            message.contentHash = reader.string();
                            break;
                        }
                    case 9: {
                            if (!(message.lanes && message.lanes.length))
                                message.lanes = [];
                            message.lanes.push($root.yorha.retrieval.PacketRegistryLane.decode(reader, reader.uint32(), undefined, long + 1));
                            break;
                        }
                    case 10: {
                            message.registryRevision = reader.string();
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
             * Decodes a PacketRegistryEntry message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.PacketRegistryEntry} PacketRegistryEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            PacketRegistryEntry.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a PacketRegistryEntry message.
             * @function verify
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            PacketRegistryEntry.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.schema != null && message.hasOwnProperty("schema"))
                    if (!$util.isString(message.schema))
                        return "schema: string expected";
                if (message.workspaceId != null && message.hasOwnProperty("workspaceId"))
                    if (!$util.isString(message.workspaceId))
                        return "workspaceId: string expected";
                if (message.workspaceRevision != null && message.hasOwnProperty("workspaceRevision"))
                    if (!$util.isString(message.workspaceRevision))
                        return "workspaceRevision: string expected";
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    if (!$util.isString(message.packetKey))
                        return "packetKey: string expected";
                if (message.packetRevision != null && message.hasOwnProperty("packetRevision"))
                    if (!$util.isString(message.packetRevision))
                        return "packetRevision: string expected";
                if (message.sourceRef != null && message.hasOwnProperty("sourceRef"))
                    if (!$util.isString(message.sourceRef))
                        return "sourceRef: string expected";
                if (message.sourceRevision != null && message.hasOwnProperty("sourceRevision"))
                    if (!$util.isString(message.sourceRevision))
                        return "sourceRevision: string expected";
                if (message.contentHash != null && message.hasOwnProperty("contentHash"))
                    if (!$util.isString(message.contentHash))
                        return "contentHash: string expected";
                if (message.lanes != null && message.hasOwnProperty("lanes")) {
                    if (!Array.isArray(message.lanes))
                        return "lanes: array expected";
                    for (let i = 0; i < message.lanes.length; ++i) {
                        let error = $root.yorha.retrieval.PacketRegistryLane.verify(message.lanes[i], long + 1);
                        if (error)
                            return "lanes." + error;
                    }
                }
                if (message.registryRevision != null && message.hasOwnProperty("registryRevision"))
                    if (!$util.isString(message.registryRevision))
                        return "registryRevision: string expected";
                return null;
            };

            /**
             * Creates a PacketRegistryEntry message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.PacketRegistryEntry} PacketRegistryEntry
             */
            PacketRegistryEntry.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.PacketRegistryEntry)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.PacketRegistryEntry();
                if (object.schema != null)
                    message.schema = String(object.schema);
                if (object.workspaceId != null)
                    message.workspaceId = String(object.workspaceId);
                if (object.workspaceRevision != null)
                    message.workspaceRevision = String(object.workspaceRevision);
                if (object.packetKey != null)
                    message.packetKey = String(object.packetKey);
                if (object.packetRevision != null)
                    message.packetRevision = String(object.packetRevision);
                if (object.sourceRef != null)
                    message.sourceRef = String(object.sourceRef);
                if (object.sourceRevision != null)
                    message.sourceRevision = String(object.sourceRevision);
                if (object.contentHash != null)
                    message.contentHash = String(object.contentHash);
                if (object.lanes) {
                    if (!Array.isArray(object.lanes))
                        throw TypeError(".yorha.retrieval.PacketRegistryEntry.lanes: array expected");
                    message.lanes = [];
                    for (let i = 0; i < object.lanes.length; ++i) {
                        if (typeof object.lanes[i] !== "object")
                            throw TypeError(".yorha.retrieval.PacketRegistryEntry.lanes: object expected");
                        message.lanes[i] = $root.yorha.retrieval.PacketRegistryLane.fromObject(object.lanes[i], long + 1);
                    }
                }
                if (object.registryRevision != null)
                    message.registryRevision = String(object.registryRevision);
                return message;
            };

            /**
             * Creates a plain object from a PacketRegistryEntry message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @static
             * @param {yorha.retrieval.PacketRegistryEntry} message PacketRegistryEntry
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            PacketRegistryEntry.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.lanes = [];
                if (options.defaults) {
                    object.schema = "";
                    object.workspaceId = "";
                    object.workspaceRevision = "";
                    object.packetKey = "";
                    object.packetRevision = "";
                    object.sourceRef = "";
                    object.sourceRevision = "";
                    object.contentHash = "";
                    object.registryRevision = "";
                }
                if (message.schema != null && message.hasOwnProperty("schema"))
                    object.schema = message.schema;
                if (message.workspaceId != null && message.hasOwnProperty("workspaceId"))
                    object.workspaceId = message.workspaceId;
                if (message.workspaceRevision != null && message.hasOwnProperty("workspaceRevision"))
                    object.workspaceRevision = message.workspaceRevision;
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    object.packetKey = message.packetKey;
                if (message.packetRevision != null && message.hasOwnProperty("packetRevision"))
                    object.packetRevision = message.packetRevision;
                if (message.sourceRef != null && message.hasOwnProperty("sourceRef"))
                    object.sourceRef = message.sourceRef;
                if (message.sourceRevision != null && message.hasOwnProperty("sourceRevision"))
                    object.sourceRevision = message.sourceRevision;
                if (message.contentHash != null && message.hasOwnProperty("contentHash"))
                    object.contentHash = message.contentHash;
                if (message.lanes && message.lanes.length) {
                    object.lanes = [];
                    for (let j = 0; j < message.lanes.length; ++j)
                        object.lanes[j] = $root.yorha.retrieval.PacketRegistryLane.toObject(message.lanes[j], options, q + 1);
                }
                if (message.registryRevision != null && message.hasOwnProperty("registryRevision"))
                    object.registryRevision = message.registryRevision;
                return object;
            };

            /**
             * Converts this PacketRegistryEntry to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            PacketRegistryEntry.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for PacketRegistryEntry
             * @function getTypeUrl
             * @memberof yorha.retrieval.PacketRegistryEntry
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            PacketRegistryEntry.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.PacketRegistryEntry";
            };

            return PacketRegistryEntry;
        })();

        retrieval.PacketRegistryLane = (function() {

            /**
             * Properties of a PacketRegistryLane.
             * @memberof yorha.retrieval
             * @interface IPacketRegistryLane
             * @property {string|null} [laneId] PacketRegistryLane laneId
             * @property {string|null} [kind] PacketRegistryLane kind
             * @property {string|null} [owner] PacketRegistryLane owner
             * @property {string|null} [status] PacketRegistryLane status
             * @property {string|null} [representationId] PacketRegistryLane representationId
             * @property {string|null} [representationRevision] PacketRegistryLane representationRevision
             * @property {string|null} [modelRevision] PacketRegistryLane modelRevision
             * @property {string|null} [collection] PacketRegistryLane collection
             * @property {string|null} [vectorName] PacketRegistryLane vectorName
             * @property {Array.<string>|null} [tags] PacketRegistryLane tags
             * @property {string|null} [indexAlgorithm] PacketRegistryLane indexAlgorithm
             * @property {string|null} [indexRevision] PacketRegistryLane indexRevision
             * @property {string|null} [projectionChecksum] PacketRegistryLane projectionChecksum
             * @property {string|null} [writePolicy] PacketRegistryLane writePolicy
             */

            /**
             * Constructs a new PacketRegistryLane.
             * @memberof yorha.retrieval
             * @classdesc Represents a PacketRegistryLane.
             * @implements IPacketRegistryLane
             * @constructor
             * @param {yorha.retrieval.IPacketRegistryLane=} [properties] Properties to set
             */
            function PacketRegistryLane(properties) {
                this.tags = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * PacketRegistryLane laneId.
             * @member {string} laneId
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.laneId = "";

            /**
             * PacketRegistryLane kind.
             * @member {string} kind
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.kind = "";

            /**
             * PacketRegistryLane owner.
             * @member {string} owner
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.owner = "";

            /**
             * PacketRegistryLane status.
             * @member {string} status
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.status = "";

            /**
             * PacketRegistryLane representationId.
             * @member {string} representationId
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.representationId = "";

            /**
             * PacketRegistryLane representationRevision.
             * @member {string} representationRevision
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.representationRevision = "";

            /**
             * PacketRegistryLane modelRevision.
             * @member {string} modelRevision
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.modelRevision = "";

            /**
             * PacketRegistryLane collection.
             * @member {string} collection
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.collection = "";

            /**
             * PacketRegistryLane vectorName.
             * @member {string} vectorName
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.vectorName = "";

            /**
             * PacketRegistryLane tags.
             * @member {Array.<string>} tags
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.tags = $util.emptyArray;

            /**
             * PacketRegistryLane indexAlgorithm.
             * @member {string} indexAlgorithm
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.indexAlgorithm = "";

            /**
             * PacketRegistryLane indexRevision.
             * @member {string} indexRevision
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.indexRevision = "";

            /**
             * PacketRegistryLane projectionChecksum.
             * @member {string} projectionChecksum
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.projectionChecksum = "";

            /**
             * PacketRegistryLane writePolicy.
             * @member {string} writePolicy
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             */
            PacketRegistryLane.prototype.writePolicy = "";

            /**
             * Creates a new PacketRegistryLane instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.PacketRegistryLane
             * @static
             * @param {yorha.retrieval.IPacketRegistryLane=} [properties] Properties to set
             * @returns {yorha.retrieval.PacketRegistryLane} PacketRegistryLane instance
             */
            PacketRegistryLane.create = function create(properties) {
                return new PacketRegistryLane(properties);
            };

            /**
             * Encodes the specified PacketRegistryLane message. Does not implicitly {@link yorha.retrieval.PacketRegistryLane.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.PacketRegistryLane
             * @static
             * @param {yorha.retrieval.IPacketRegistryLane} message PacketRegistryLane message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PacketRegistryLane.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.laneId != null && Object.hasOwnProperty.call(message, "laneId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.laneId);
                if (message.kind != null && Object.hasOwnProperty.call(message, "kind"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.kind);
                if (message.owner != null && Object.hasOwnProperty.call(message, "owner"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.owner);
                if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.status);
                if (message.representationId != null && Object.hasOwnProperty.call(message, "representationId"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.representationId);
                if (message.representationRevision != null && Object.hasOwnProperty.call(message, "representationRevision"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.representationRevision);
                if (message.modelRevision != null && Object.hasOwnProperty.call(message, "modelRevision"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.modelRevision);
                if (message.collection != null && Object.hasOwnProperty.call(message, "collection"))
                    writer.uint32(/* id 8, wireType 2 =*/66).string(message.collection);
                if (message.vectorName != null && Object.hasOwnProperty.call(message, "vectorName"))
                    writer.uint32(/* id 9, wireType 2 =*/74).string(message.vectorName);
                if (message.tags != null && message.tags.length)
                    for (let i = 0; i < message.tags.length; ++i)
                        writer.uint32(/* id 10, wireType 2 =*/82).string(message.tags[i]);
                if (message.indexAlgorithm != null && Object.hasOwnProperty.call(message, "indexAlgorithm"))
                    writer.uint32(/* id 11, wireType 2 =*/90).string(message.indexAlgorithm);
                if (message.indexRevision != null && Object.hasOwnProperty.call(message, "indexRevision"))
                    writer.uint32(/* id 12, wireType 2 =*/98).string(message.indexRevision);
                if (message.projectionChecksum != null && Object.hasOwnProperty.call(message, "projectionChecksum"))
                    writer.uint32(/* id 13, wireType 2 =*/106).string(message.projectionChecksum);
                if (message.writePolicy != null && Object.hasOwnProperty.call(message, "writePolicy"))
                    writer.uint32(/* id 14, wireType 2 =*/114).string(message.writePolicy);
                return writer;
            };

            /**
             * Encodes the specified PacketRegistryLane message, length delimited. Does not implicitly {@link yorha.retrieval.PacketRegistryLane.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.PacketRegistryLane
             * @static
             * @param {yorha.retrieval.IPacketRegistryLane} message PacketRegistryLane message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            PacketRegistryLane.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a PacketRegistryLane message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.PacketRegistryLane
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.PacketRegistryLane} PacketRegistryLane
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            PacketRegistryLane.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.PacketRegistryLane();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.laneId = reader.string();
                            break;
                        }
                    case 2: {
                            message.kind = reader.string();
                            break;
                        }
                    case 3: {
                            message.owner = reader.string();
                            break;
                        }
                    case 4: {
                            message.status = reader.string();
                            break;
                        }
                    case 5: {
                            message.representationId = reader.string();
                            break;
                        }
                    case 6: {
                            message.representationRevision = reader.string();
                            break;
                        }
                    case 7: {
                            message.modelRevision = reader.string();
                            break;
                        }
                    case 8: {
                            message.collection = reader.string();
                            break;
                        }
                    case 9: {
                            message.vectorName = reader.string();
                            break;
                        }
                    case 10: {
                            if (!(message.tags && message.tags.length))
                                message.tags = [];
                            message.tags.push(reader.string());
                            break;
                        }
                    case 11: {
                            message.indexAlgorithm = reader.string();
                            break;
                        }
                    case 12: {
                            message.indexRevision = reader.string();
                            break;
                        }
                    case 13: {
                            message.projectionChecksum = reader.string();
                            break;
                        }
                    case 14: {
                            message.writePolicy = reader.string();
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
             * Decodes a PacketRegistryLane message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.PacketRegistryLane
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.PacketRegistryLane} PacketRegistryLane
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            PacketRegistryLane.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a PacketRegistryLane message.
             * @function verify
             * @memberof yorha.retrieval.PacketRegistryLane
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            PacketRegistryLane.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.laneId != null && message.hasOwnProperty("laneId"))
                    if (!$util.isString(message.laneId))
                        return "laneId: string expected";
                if (message.kind != null && message.hasOwnProperty("kind"))
                    if (!$util.isString(message.kind))
                        return "kind: string expected";
                if (message.owner != null && message.hasOwnProperty("owner"))
                    if (!$util.isString(message.owner))
                        return "owner: string expected";
                if (message.status != null && message.hasOwnProperty("status"))
                    if (!$util.isString(message.status))
                        return "status: string expected";
                if (message.representationId != null && message.hasOwnProperty("representationId"))
                    if (!$util.isString(message.representationId))
                        return "representationId: string expected";
                if (message.representationRevision != null && message.hasOwnProperty("representationRevision"))
                    if (!$util.isString(message.representationRevision))
                        return "representationRevision: string expected";
                if (message.modelRevision != null && message.hasOwnProperty("modelRevision"))
                    if (!$util.isString(message.modelRevision))
                        return "modelRevision: string expected";
                if (message.collection != null && message.hasOwnProperty("collection"))
                    if (!$util.isString(message.collection))
                        return "collection: string expected";
                if (message.vectorName != null && message.hasOwnProperty("vectorName"))
                    if (!$util.isString(message.vectorName))
                        return "vectorName: string expected";
                if (message.tags != null && message.hasOwnProperty("tags")) {
                    if (!Array.isArray(message.tags))
                        return "tags: array expected";
                    for (let i = 0; i < message.tags.length; ++i)
                        if (!$util.isString(message.tags[i]))
                            return "tags: string[] expected";
                }
                if (message.indexAlgorithm != null && message.hasOwnProperty("indexAlgorithm"))
                    if (!$util.isString(message.indexAlgorithm))
                        return "indexAlgorithm: string expected";
                if (message.indexRevision != null && message.hasOwnProperty("indexRevision"))
                    if (!$util.isString(message.indexRevision))
                        return "indexRevision: string expected";
                if (message.projectionChecksum != null && message.hasOwnProperty("projectionChecksum"))
                    if (!$util.isString(message.projectionChecksum))
                        return "projectionChecksum: string expected";
                if (message.writePolicy != null && message.hasOwnProperty("writePolicy"))
                    if (!$util.isString(message.writePolicy))
                        return "writePolicy: string expected";
                return null;
            };

            /**
             * Creates a PacketRegistryLane message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.PacketRegistryLane
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.PacketRegistryLane} PacketRegistryLane
             */
            PacketRegistryLane.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.PacketRegistryLane)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.PacketRegistryLane();
                if (object.laneId != null)
                    message.laneId = String(object.laneId);
                if (object.kind != null)
                    message.kind = String(object.kind);
                if (object.owner != null)
                    message.owner = String(object.owner);
                if (object.status != null)
                    message.status = String(object.status);
                if (object.representationId != null)
                    message.representationId = String(object.representationId);
                if (object.representationRevision != null)
                    message.representationRevision = String(object.representationRevision);
                if (object.modelRevision != null)
                    message.modelRevision = String(object.modelRevision);
                if (object.collection != null)
                    message.collection = String(object.collection);
                if (object.vectorName != null)
                    message.vectorName = String(object.vectorName);
                if (object.tags) {
                    if (!Array.isArray(object.tags))
                        throw TypeError(".yorha.retrieval.PacketRegistryLane.tags: array expected");
                    message.tags = [];
                    for (let i = 0; i < object.tags.length; ++i)
                        message.tags[i] = String(object.tags[i]);
                }
                if (object.indexAlgorithm != null)
                    message.indexAlgorithm = String(object.indexAlgorithm);
                if (object.indexRevision != null)
                    message.indexRevision = String(object.indexRevision);
                if (object.projectionChecksum != null)
                    message.projectionChecksum = String(object.projectionChecksum);
                if (object.writePolicy != null)
                    message.writePolicy = String(object.writePolicy);
                return message;
            };

            /**
             * Creates a plain object from a PacketRegistryLane message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.PacketRegistryLane
             * @static
             * @param {yorha.retrieval.PacketRegistryLane} message PacketRegistryLane
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            PacketRegistryLane.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.tags = [];
                if (options.defaults) {
                    object.laneId = "";
                    object.kind = "";
                    object.owner = "";
                    object.status = "";
                    object.representationId = "";
                    object.representationRevision = "";
                    object.modelRevision = "";
                    object.collection = "";
                    object.vectorName = "";
                    object.indexAlgorithm = "";
                    object.indexRevision = "";
                    object.projectionChecksum = "";
                    object.writePolicy = "";
                }
                if (message.laneId != null && message.hasOwnProperty("laneId"))
                    object.laneId = message.laneId;
                if (message.kind != null && message.hasOwnProperty("kind"))
                    object.kind = message.kind;
                if (message.owner != null && message.hasOwnProperty("owner"))
                    object.owner = message.owner;
                if (message.status != null && message.hasOwnProperty("status"))
                    object.status = message.status;
                if (message.representationId != null && message.hasOwnProperty("representationId"))
                    object.representationId = message.representationId;
                if (message.representationRevision != null && message.hasOwnProperty("representationRevision"))
                    object.representationRevision = message.representationRevision;
                if (message.modelRevision != null && message.hasOwnProperty("modelRevision"))
                    object.modelRevision = message.modelRevision;
                if (message.collection != null && message.hasOwnProperty("collection"))
                    object.collection = message.collection;
                if (message.vectorName != null && message.hasOwnProperty("vectorName"))
                    object.vectorName = message.vectorName;
                if (message.tags && message.tags.length) {
                    object.tags = [];
                    for (let j = 0; j < message.tags.length; ++j)
                        object.tags[j] = message.tags[j];
                }
                if (message.indexAlgorithm != null && message.hasOwnProperty("indexAlgorithm"))
                    object.indexAlgorithm = message.indexAlgorithm;
                if (message.indexRevision != null && message.hasOwnProperty("indexRevision"))
                    object.indexRevision = message.indexRevision;
                if (message.projectionChecksum != null && message.hasOwnProperty("projectionChecksum"))
                    object.projectionChecksum = message.projectionChecksum;
                if (message.writePolicy != null && message.hasOwnProperty("writePolicy"))
                    object.writePolicy = message.writePolicy;
                return object;
            };

            /**
             * Converts this PacketRegistryLane to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.PacketRegistryLane
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            PacketRegistryLane.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for PacketRegistryLane
             * @function getTypeUrl
             * @memberof yorha.retrieval.PacketRegistryLane
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            PacketRegistryLane.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.PacketRegistryLane";
            };

            return PacketRegistryLane;
        })();

        retrieval.TopologyRequest = (function() {

            /**
             * Properties of a TopologyRequest.
             * @memberof yorha.retrieval
             * @interface ITopologyRequest
             * @property {string|null} [query] TopologyRequest query
             * @property {number|null} [bmuRow] TopologyRequest bmuRow
             * @property {number|null} [bmuCol] TopologyRequest bmuCol
             * @property {number|null} [radius] TopologyRequest radius
             * @property {Array.<string>|null} [ids] TopologyRequest ids
             * @property {Array.<string>|null} [tags] TopologyRequest tags
             * @property {string|null} [createdAfter] TopologyRequest createdAfter
             * @property {string|null} [updatedAfter] TopologyRequest updatedAfter
             */

            /**
             * Constructs a new TopologyRequest.
             * @memberof yorha.retrieval
             * @classdesc Represents a TopologyRequest.
             * @implements ITopologyRequest
             * @constructor
             * @param {yorha.retrieval.ITopologyRequest=} [properties] Properties to set
             */
            function TopologyRequest(properties) {
                this.ids = [];
                this.tags = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * TopologyRequest query.
             * @member {string} query
             * @memberof yorha.retrieval.TopologyRequest
             * @instance
             */
            TopologyRequest.prototype.query = "";

            /**
             * TopologyRequest bmuRow.
             * @member {number} bmuRow
             * @memberof yorha.retrieval.TopologyRequest
             * @instance
             */
            TopologyRequest.prototype.bmuRow = 0;

            /**
             * TopologyRequest bmuCol.
             * @member {number} bmuCol
             * @memberof yorha.retrieval.TopologyRequest
             * @instance
             */
            TopologyRequest.prototype.bmuCol = 0;

            /**
             * TopologyRequest radius.
             * @member {number} radius
             * @memberof yorha.retrieval.TopologyRequest
             * @instance
             */
            TopologyRequest.prototype.radius = 0;

            /**
             * TopologyRequest ids.
             * @member {Array.<string>} ids
             * @memberof yorha.retrieval.TopologyRequest
             * @instance
             */
            TopologyRequest.prototype.ids = $util.emptyArray;

            /**
             * TopologyRequest tags.
             * @member {Array.<string>} tags
             * @memberof yorha.retrieval.TopologyRequest
             * @instance
             */
            TopologyRequest.prototype.tags = $util.emptyArray;

            /**
             * TopologyRequest createdAfter.
             * @member {string} createdAfter
             * @memberof yorha.retrieval.TopologyRequest
             * @instance
             */
            TopologyRequest.prototype.createdAfter = "";

            /**
             * TopologyRequest updatedAfter.
             * @member {string} updatedAfter
             * @memberof yorha.retrieval.TopologyRequest
             * @instance
             */
            TopologyRequest.prototype.updatedAfter = "";

            /**
             * Creates a new TopologyRequest instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.TopologyRequest
             * @static
             * @param {yorha.retrieval.ITopologyRequest=} [properties] Properties to set
             * @returns {yorha.retrieval.TopologyRequest} TopologyRequest instance
             */
            TopologyRequest.create = function create(properties) {
                return new TopologyRequest(properties);
            };

            /**
             * Encodes the specified TopologyRequest message. Does not implicitly {@link yorha.retrieval.TopologyRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.TopologyRequest
             * @static
             * @param {yorha.retrieval.ITopologyRequest} message TopologyRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TopologyRequest.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.query != null && Object.hasOwnProperty.call(message, "query"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.query);
                if (message.bmuRow != null && Object.hasOwnProperty.call(message, "bmuRow"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.bmuRow);
                if (message.bmuCol != null && Object.hasOwnProperty.call(message, "bmuCol"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.bmuCol);
                if (message.radius != null && Object.hasOwnProperty.call(message, "radius"))
                    writer.uint32(/* id 4, wireType 0 =*/32).int32(message.radius);
                if (message.ids != null && message.ids.length)
                    for (let i = 0; i < message.ids.length; ++i)
                        writer.uint32(/* id 5, wireType 2 =*/42).string(message.ids[i]);
                if (message.tags != null && message.tags.length)
                    for (let i = 0; i < message.tags.length; ++i)
                        writer.uint32(/* id 6, wireType 2 =*/50).string(message.tags[i]);
                if (message.createdAfter != null && Object.hasOwnProperty.call(message, "createdAfter"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.createdAfter);
                if (message.updatedAfter != null && Object.hasOwnProperty.call(message, "updatedAfter"))
                    writer.uint32(/* id 8, wireType 2 =*/66).string(message.updatedAfter);
                return writer;
            };

            /**
             * Encodes the specified TopologyRequest message, length delimited. Does not implicitly {@link yorha.retrieval.TopologyRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.TopologyRequest
             * @static
             * @param {yorha.retrieval.ITopologyRequest} message TopologyRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TopologyRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a TopologyRequest message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.TopologyRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.TopologyRequest} TopologyRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TopologyRequest.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.TopologyRequest();
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
                            message.bmuRow = reader.int32();
                            break;
                        }
                    case 3: {
                            message.bmuCol = reader.int32();
                            break;
                        }
                    case 4: {
                            message.radius = reader.int32();
                            break;
                        }
                    case 5: {
                            if (!(message.ids && message.ids.length))
                                message.ids = [];
                            message.ids.push(reader.string());
                            break;
                        }
                    case 6: {
                            if (!(message.tags && message.tags.length))
                                message.tags = [];
                            message.tags.push(reader.string());
                            break;
                        }
                    case 7: {
                            message.createdAfter = reader.string();
                            break;
                        }
                    case 8: {
                            message.updatedAfter = reader.string();
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
             * Decodes a TopologyRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.TopologyRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.TopologyRequest} TopologyRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TopologyRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a TopologyRequest message.
             * @function verify
             * @memberof yorha.retrieval.TopologyRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            TopologyRequest.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.query != null && message.hasOwnProperty("query"))
                    if (!$util.isString(message.query))
                        return "query: string expected";
                if (message.bmuRow != null && message.hasOwnProperty("bmuRow"))
                    if (!$util.isInteger(message.bmuRow))
                        return "bmuRow: integer expected";
                if (message.bmuCol != null && message.hasOwnProperty("bmuCol"))
                    if (!$util.isInteger(message.bmuCol))
                        return "bmuCol: integer expected";
                if (message.radius != null && message.hasOwnProperty("radius"))
                    if (!$util.isInteger(message.radius))
                        return "radius: integer expected";
                if (message.ids != null && message.hasOwnProperty("ids")) {
                    if (!Array.isArray(message.ids))
                        return "ids: array expected";
                    for (let i = 0; i < message.ids.length; ++i)
                        if (!$util.isString(message.ids[i]))
                            return "ids: string[] expected";
                }
                if (message.tags != null && message.hasOwnProperty("tags")) {
                    if (!Array.isArray(message.tags))
                        return "tags: array expected";
                    for (let i = 0; i < message.tags.length; ++i)
                        if (!$util.isString(message.tags[i]))
                            return "tags: string[] expected";
                }
                if (message.createdAfter != null && message.hasOwnProperty("createdAfter"))
                    if (!$util.isString(message.createdAfter))
                        return "createdAfter: string expected";
                if (message.updatedAfter != null && message.hasOwnProperty("updatedAfter"))
                    if (!$util.isString(message.updatedAfter))
                        return "updatedAfter: string expected";
                return null;
            };

            /**
             * Creates a TopologyRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.TopologyRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.TopologyRequest} TopologyRequest
             */
            TopologyRequest.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.TopologyRequest)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.TopologyRequest();
                if (object.query != null)
                    message.query = String(object.query);
                if (object.bmuRow != null)
                    message.bmuRow = object.bmuRow | 0;
                if (object.bmuCol != null)
                    message.bmuCol = object.bmuCol | 0;
                if (object.radius != null)
                    message.radius = object.radius | 0;
                if (object.ids) {
                    if (!Array.isArray(object.ids))
                        throw TypeError(".yorha.retrieval.TopologyRequest.ids: array expected");
                    message.ids = [];
                    for (let i = 0; i < object.ids.length; ++i)
                        message.ids[i] = String(object.ids[i]);
                }
                if (object.tags) {
                    if (!Array.isArray(object.tags))
                        throw TypeError(".yorha.retrieval.TopologyRequest.tags: array expected");
                    message.tags = [];
                    for (let i = 0; i < object.tags.length; ++i)
                        message.tags[i] = String(object.tags[i]);
                }
                if (object.createdAfter != null)
                    message.createdAfter = String(object.createdAfter);
                if (object.updatedAfter != null)
                    message.updatedAfter = String(object.updatedAfter);
                return message;
            };

            /**
             * Creates a plain object from a TopologyRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.TopologyRequest
             * @static
             * @param {yorha.retrieval.TopologyRequest} message TopologyRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            TopologyRequest.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.ids = [];
                    object.tags = [];
                }
                if (options.defaults) {
                    object.query = "";
                    object.bmuRow = 0;
                    object.bmuCol = 0;
                    object.radius = 0;
                    object.createdAfter = "";
                    object.updatedAfter = "";
                }
                if (message.query != null && message.hasOwnProperty("query"))
                    object.query = message.query;
                if (message.bmuRow != null && message.hasOwnProperty("bmuRow"))
                    object.bmuRow = message.bmuRow;
                if (message.bmuCol != null && message.hasOwnProperty("bmuCol"))
                    object.bmuCol = message.bmuCol;
                if (message.radius != null && message.hasOwnProperty("radius"))
                    object.radius = message.radius;
                if (message.ids && message.ids.length) {
                    object.ids = [];
                    for (let j = 0; j < message.ids.length; ++j)
                        object.ids[j] = message.ids[j];
                }
                if (message.tags && message.tags.length) {
                    object.tags = [];
                    for (let j = 0; j < message.tags.length; ++j)
                        object.tags[j] = message.tags[j];
                }
                if (message.createdAfter != null && message.hasOwnProperty("createdAfter"))
                    object.createdAfter = message.createdAfter;
                if (message.updatedAfter != null && message.hasOwnProperty("updatedAfter"))
                    object.updatedAfter = message.updatedAfter;
                return object;
            };

            /**
             * Converts this TopologyRequest to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.TopologyRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            TopologyRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for TopologyRequest
             * @function getTypeUrl
             * @memberof yorha.retrieval.TopologyRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            TopologyRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.TopologyRequest";
            };

            return TopologyRequest;
        })();

        retrieval.TopologyResponse = (function() {

            /**
             * Properties of a TopologyResponse.
             * @memberof yorha.retrieval
             * @interface ITopologyResponse
             * @property {Array.<yorha.retrieval.ISearchChunkResult>|null} [neighbors] TopologyResponse neighbors
             * @property {string|null} [somMetadataJson] TopologyResponse somMetadataJson
             * @property {yorha.retrieval.IRetrievalClusterMetadata|null} [clusterMetadata] TopologyResponse clusterMetadata
             */

            /**
             * Constructs a new TopologyResponse.
             * @memberof yorha.retrieval
             * @classdesc Represents a TopologyResponse.
             * @implements ITopologyResponse
             * @constructor
             * @param {yorha.retrieval.ITopologyResponse=} [properties] Properties to set
             */
            function TopologyResponse(properties) {
                this.neighbors = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * TopologyResponse neighbors.
             * @member {Array.<yorha.retrieval.ISearchChunkResult>} neighbors
             * @memberof yorha.retrieval.TopologyResponse
             * @instance
             */
            TopologyResponse.prototype.neighbors = $util.emptyArray;

            /**
             * TopologyResponse somMetadataJson.
             * @member {string} somMetadataJson
             * @memberof yorha.retrieval.TopologyResponse
             * @instance
             */
            TopologyResponse.prototype.somMetadataJson = "";

            /**
             * TopologyResponse clusterMetadata.
             * @member {yorha.retrieval.IRetrievalClusterMetadata|null|undefined} clusterMetadata
             * @memberof yorha.retrieval.TopologyResponse
             * @instance
             */
            TopologyResponse.prototype.clusterMetadata = null;

            /**
             * Creates a new TopologyResponse instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.TopologyResponse
             * @static
             * @param {yorha.retrieval.ITopologyResponse=} [properties] Properties to set
             * @returns {yorha.retrieval.TopologyResponse} TopologyResponse instance
             */
            TopologyResponse.create = function create(properties) {
                return new TopologyResponse(properties);
            };

            /**
             * Encodes the specified TopologyResponse message. Does not implicitly {@link yorha.retrieval.TopologyResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.TopologyResponse
             * @static
             * @param {yorha.retrieval.ITopologyResponse} message TopologyResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TopologyResponse.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.neighbors != null && message.neighbors.length)
                    for (let i = 0; i < message.neighbors.length; ++i)
                        $root.yorha.retrieval.SearchChunkResult.encode(message.neighbors[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.somMetadataJson != null && Object.hasOwnProperty.call(message, "somMetadataJson"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.somMetadataJson);
                if (message.clusterMetadata != null && Object.hasOwnProperty.call(message, "clusterMetadata"))
                    $root.yorha.retrieval.RetrievalClusterMetadata.encode(message.clusterMetadata, writer.uint32(/* id 3, wireType 2 =*/26).fork(), q + 1).ldelim();
                return writer;
            };

            /**
             * Encodes the specified TopologyResponse message, length delimited. Does not implicitly {@link yorha.retrieval.TopologyResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.TopologyResponse
             * @static
             * @param {yorha.retrieval.ITopologyResponse} message TopologyResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TopologyResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a TopologyResponse message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.TopologyResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.TopologyResponse} TopologyResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TopologyResponse.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.TopologyResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.neighbors && message.neighbors.length))
                                message.neighbors = [];
                            message.neighbors.push($root.yorha.retrieval.SearchChunkResult.decode(reader, reader.uint32(), undefined, long + 1));
                            break;
                        }
                    case 2: {
                            message.somMetadataJson = reader.string();
                            break;
                        }
                    case 3: {
                            message.clusterMetadata = $root.yorha.retrieval.RetrievalClusterMetadata.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Decodes a TopologyResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.TopologyResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.TopologyResponse} TopologyResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TopologyResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a TopologyResponse message.
             * @function verify
             * @memberof yorha.retrieval.TopologyResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            TopologyResponse.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.neighbors != null && message.hasOwnProperty("neighbors")) {
                    if (!Array.isArray(message.neighbors))
                        return "neighbors: array expected";
                    for (let i = 0; i < message.neighbors.length; ++i) {
                        let error = $root.yorha.retrieval.SearchChunkResult.verify(message.neighbors[i], long + 1);
                        if (error)
                            return "neighbors." + error;
                    }
                }
                if (message.somMetadataJson != null && message.hasOwnProperty("somMetadataJson"))
                    if (!$util.isString(message.somMetadataJson))
                        return "somMetadataJson: string expected";
                if (message.clusterMetadata != null && message.hasOwnProperty("clusterMetadata")) {
                    let error = $root.yorha.retrieval.RetrievalClusterMetadata.verify(message.clusterMetadata, long + 1);
                    if (error)
                        return "clusterMetadata." + error;
                }
                return null;
            };

            /**
             * Creates a TopologyResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.TopologyResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.TopologyResponse} TopologyResponse
             */
            TopologyResponse.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.TopologyResponse)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.TopologyResponse();
                if (object.neighbors) {
                    if (!Array.isArray(object.neighbors))
                        throw TypeError(".yorha.retrieval.TopologyResponse.neighbors: array expected");
                    message.neighbors = [];
                    for (let i = 0; i < object.neighbors.length; ++i) {
                        if (typeof object.neighbors[i] !== "object")
                            throw TypeError(".yorha.retrieval.TopologyResponse.neighbors: object expected");
                        message.neighbors[i] = $root.yorha.retrieval.SearchChunkResult.fromObject(object.neighbors[i], long + 1);
                    }
                }
                if (object.somMetadataJson != null)
                    message.somMetadataJson = String(object.somMetadataJson);
                if (object.clusterMetadata != null) {
                    if (typeof object.clusterMetadata !== "object")
                        throw TypeError(".yorha.retrieval.TopologyResponse.clusterMetadata: object expected");
                    message.clusterMetadata = $root.yorha.retrieval.RetrievalClusterMetadata.fromObject(object.clusterMetadata, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a TopologyResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.TopologyResponse
             * @static
             * @param {yorha.retrieval.TopologyResponse} message TopologyResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            TopologyResponse.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.neighbors = [];
                if (options.defaults) {
                    object.somMetadataJson = "";
                    object.clusterMetadata = null;
                }
                if (message.neighbors && message.neighbors.length) {
                    object.neighbors = [];
                    for (let j = 0; j < message.neighbors.length; ++j)
                        object.neighbors[j] = $root.yorha.retrieval.SearchChunkResult.toObject(message.neighbors[j], options, q + 1);
                }
                if (message.somMetadataJson != null && message.hasOwnProperty("somMetadataJson"))
                    object.somMetadataJson = message.somMetadataJson;
                if (message.clusterMetadata != null && message.hasOwnProperty("clusterMetadata"))
                    object.clusterMetadata = $root.yorha.retrieval.RetrievalClusterMetadata.toObject(message.clusterMetadata, options, q + 1);
                return object;
            };

            /**
             * Converts this TopologyResponse to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.TopologyResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            TopologyResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for TopologyResponse
             * @function getTypeUrl
             * @memberof yorha.retrieval.TopologyResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            TopologyResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.TopologyResponse";
            };

            return TopologyResponse;
        })();

        retrieval.ResearchContextRequest = (function() {

            /**
             * Properties of a ResearchContextRequest.
             * @memberof yorha.retrieval
             * @interface IResearchContextRequest
             * @property {string|null} [query] ResearchContextRequest query
             * @property {number|null} [limit] ResearchContextRequest limit
             * @property {Array.<string>|null} [sourceFilter] ResearchContextRequest sourceFilter
             * @property {number|null} [scoreThreshold] ResearchContextRequest scoreThreshold
             * @property {Array.<number>|null} [queryEmbedding] ResearchContextRequest queryEmbedding
             * @property {Array.<string>|null} [ids] ResearchContextRequest ids
             * @property {Array.<string>|null} [tags] ResearchContextRequest tags
             * @property {Array.<string>|null} [clusterIds] ResearchContextRequest clusterIds
             * @property {Array.<number>|null} [somClusters] ResearchContextRequest somClusters
             * @property {string|null} [createdAfter] ResearchContextRequest createdAfter
             * @property {string|null} [updatedAfter] ResearchContextRequest updatedAfter
             */

            /**
             * Constructs a new ResearchContextRequest.
             * @memberof yorha.retrieval
             * @classdesc Represents a ResearchContextRequest.
             * @implements IResearchContextRequest
             * @constructor
             * @param {yorha.retrieval.IResearchContextRequest=} [properties] Properties to set
             */
            function ResearchContextRequest(properties) {
                this.sourceFilter = [];
                this.queryEmbedding = [];
                this.ids = [];
                this.tags = [];
                this.clusterIds = [];
                this.somClusters = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ResearchContextRequest query.
             * @member {string} query
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.query = "";

            /**
             * ResearchContextRequest limit.
             * @member {number} limit
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.limit = 0;

            /**
             * ResearchContextRequest sourceFilter.
             * @member {Array.<string>} sourceFilter
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.sourceFilter = $util.emptyArray;

            /**
             * ResearchContextRequest scoreThreshold.
             * @member {number} scoreThreshold
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.scoreThreshold = 0;

            /**
             * ResearchContextRequest queryEmbedding.
             * @member {Array.<number>} queryEmbedding
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.queryEmbedding = $util.emptyArray;

            /**
             * ResearchContextRequest ids.
             * @member {Array.<string>} ids
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.ids = $util.emptyArray;

            /**
             * ResearchContextRequest tags.
             * @member {Array.<string>} tags
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.tags = $util.emptyArray;

            /**
             * ResearchContextRequest clusterIds.
             * @member {Array.<string>} clusterIds
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.clusterIds = $util.emptyArray;

            /**
             * ResearchContextRequest somClusters.
             * @member {Array.<number>} somClusters
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.somClusters = $util.emptyArray;

            /**
             * ResearchContextRequest createdAfter.
             * @member {string} createdAfter
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.createdAfter = "";

            /**
             * ResearchContextRequest updatedAfter.
             * @member {string} updatedAfter
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             */
            ResearchContextRequest.prototype.updatedAfter = "";

            /**
             * Creates a new ResearchContextRequest instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.ResearchContextRequest
             * @static
             * @param {yorha.retrieval.IResearchContextRequest=} [properties] Properties to set
             * @returns {yorha.retrieval.ResearchContextRequest} ResearchContextRequest instance
             */
            ResearchContextRequest.create = function create(properties) {
                return new ResearchContextRequest(properties);
            };

            /**
             * Encodes the specified ResearchContextRequest message. Does not implicitly {@link yorha.retrieval.ResearchContextRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.ResearchContextRequest
             * @static
             * @param {yorha.retrieval.IResearchContextRequest} message ResearchContextRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ResearchContextRequest.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.query != null && Object.hasOwnProperty.call(message, "query"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.query);
                if (message.limit != null && Object.hasOwnProperty.call(message, "limit"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.limit);
                if (message.sourceFilter != null && message.sourceFilter.length)
                    for (let i = 0; i < message.sourceFilter.length; ++i)
                        writer.uint32(/* id 3, wireType 2 =*/26).string(message.sourceFilter[i]);
                if (message.scoreThreshold != null && Object.hasOwnProperty.call(message, "scoreThreshold"))
                    writer.uint32(/* id 4, wireType 5 =*/37).float(message.scoreThreshold);
                if (message.queryEmbedding != null && message.queryEmbedding.length) {
                    writer.uint32(/* id 5, wireType 2 =*/42).fork();
                    for (let i = 0; i < message.queryEmbedding.length; ++i)
                        writer.float(message.queryEmbedding[i]);
                    writer.ldelim();
                }
                if (message.ids != null && message.ids.length)
                    for (let i = 0; i < message.ids.length; ++i)
                        writer.uint32(/* id 6, wireType 2 =*/50).string(message.ids[i]);
                if (message.tags != null && message.tags.length)
                    for (let i = 0; i < message.tags.length; ++i)
                        writer.uint32(/* id 7, wireType 2 =*/58).string(message.tags[i]);
                if (message.clusterIds != null && message.clusterIds.length)
                    for (let i = 0; i < message.clusterIds.length; ++i)
                        writer.uint32(/* id 8, wireType 2 =*/66).string(message.clusterIds[i]);
                if (message.somClusters != null && message.somClusters.length) {
                    writer.uint32(/* id 9, wireType 2 =*/74).fork();
                    for (let i = 0; i < message.somClusters.length; ++i)
                        writer.int32(message.somClusters[i]);
                    writer.ldelim();
                }
                if (message.createdAfter != null && Object.hasOwnProperty.call(message, "createdAfter"))
                    writer.uint32(/* id 10, wireType 2 =*/82).string(message.createdAfter);
                if (message.updatedAfter != null && Object.hasOwnProperty.call(message, "updatedAfter"))
                    writer.uint32(/* id 11, wireType 2 =*/90).string(message.updatedAfter);
                return writer;
            };

            /**
             * Encodes the specified ResearchContextRequest message, length delimited. Does not implicitly {@link yorha.retrieval.ResearchContextRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.ResearchContextRequest
             * @static
             * @param {yorha.retrieval.IResearchContextRequest} message ResearchContextRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ResearchContextRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ResearchContextRequest message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.ResearchContextRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.ResearchContextRequest} ResearchContextRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ResearchContextRequest.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.ResearchContextRequest();
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
                            if (!(message.sourceFilter && message.sourceFilter.length))
                                message.sourceFilter = [];
                            message.sourceFilter.push(reader.string());
                            break;
                        }
                    case 4: {
                            message.scoreThreshold = reader.float();
                            break;
                        }
                    case 5: {
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
                    case 6: {
                            if (!(message.ids && message.ids.length))
                                message.ids = [];
                            message.ids.push(reader.string());
                            break;
                        }
                    case 7: {
                            if (!(message.tags && message.tags.length))
                                message.tags = [];
                            message.tags.push(reader.string());
                            break;
                        }
                    case 8: {
                            if (!(message.clusterIds && message.clusterIds.length))
                                message.clusterIds = [];
                            message.clusterIds.push(reader.string());
                            break;
                        }
                    case 9: {
                            if (!(message.somClusters && message.somClusters.length))
                                message.somClusters = [];
                            if ((tag & 7) === 2) {
                                let end2 = reader.uint32() + reader.pos;
                                while (reader.pos < end2)
                                    message.somClusters.push(reader.int32());
                            } else
                                message.somClusters.push(reader.int32());
                            break;
                        }
                    case 10: {
                            message.createdAfter = reader.string();
                            break;
                        }
                    case 11: {
                            message.updatedAfter = reader.string();
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
             * Decodes a ResearchContextRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.ResearchContextRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.ResearchContextRequest} ResearchContextRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ResearchContextRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ResearchContextRequest message.
             * @function verify
             * @memberof yorha.retrieval.ResearchContextRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ResearchContextRequest.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.query != null && message.hasOwnProperty("query"))
                    if (!$util.isString(message.query))
                        return "query: string expected";
                if (message.limit != null && message.hasOwnProperty("limit"))
                    if (!$util.isInteger(message.limit))
                        return "limit: integer expected";
                if (message.sourceFilter != null && message.hasOwnProperty("sourceFilter")) {
                    if (!Array.isArray(message.sourceFilter))
                        return "sourceFilter: array expected";
                    for (let i = 0; i < message.sourceFilter.length; ++i)
                        if (!$util.isString(message.sourceFilter[i]))
                            return "sourceFilter: string[] expected";
                }
                if (message.scoreThreshold != null && message.hasOwnProperty("scoreThreshold"))
                    if (typeof message.scoreThreshold !== "number")
                        return "scoreThreshold: number expected";
                if (message.queryEmbedding != null && message.hasOwnProperty("queryEmbedding")) {
                    if (!Array.isArray(message.queryEmbedding))
                        return "queryEmbedding: array expected";
                    for (let i = 0; i < message.queryEmbedding.length; ++i)
                        if (typeof message.queryEmbedding[i] !== "number")
                            return "queryEmbedding: number[] expected";
                }
                if (message.ids != null && message.hasOwnProperty("ids")) {
                    if (!Array.isArray(message.ids))
                        return "ids: array expected";
                    for (let i = 0; i < message.ids.length; ++i)
                        if (!$util.isString(message.ids[i]))
                            return "ids: string[] expected";
                }
                if (message.tags != null && message.hasOwnProperty("tags")) {
                    if (!Array.isArray(message.tags))
                        return "tags: array expected";
                    for (let i = 0; i < message.tags.length; ++i)
                        if (!$util.isString(message.tags[i]))
                            return "tags: string[] expected";
                }
                if (message.clusterIds != null && message.hasOwnProperty("clusterIds")) {
                    if (!Array.isArray(message.clusterIds))
                        return "clusterIds: array expected";
                    for (let i = 0; i < message.clusterIds.length; ++i)
                        if (!$util.isString(message.clusterIds[i]))
                            return "clusterIds: string[] expected";
                }
                if (message.somClusters != null && message.hasOwnProperty("somClusters")) {
                    if (!Array.isArray(message.somClusters))
                        return "somClusters: array expected";
                    for (let i = 0; i < message.somClusters.length; ++i)
                        if (!$util.isInteger(message.somClusters[i]))
                            return "somClusters: integer[] expected";
                }
                if (message.createdAfter != null && message.hasOwnProperty("createdAfter"))
                    if (!$util.isString(message.createdAfter))
                        return "createdAfter: string expected";
                if (message.updatedAfter != null && message.hasOwnProperty("updatedAfter"))
                    if (!$util.isString(message.updatedAfter))
                        return "updatedAfter: string expected";
                return null;
            };

            /**
             * Creates a ResearchContextRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.ResearchContextRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.ResearchContextRequest} ResearchContextRequest
             */
            ResearchContextRequest.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.ResearchContextRequest)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.ResearchContextRequest();
                if (object.query != null)
                    message.query = String(object.query);
                if (object.limit != null)
                    message.limit = object.limit | 0;
                if (object.sourceFilter) {
                    if (!Array.isArray(object.sourceFilter))
                        throw TypeError(".yorha.retrieval.ResearchContextRequest.sourceFilter: array expected");
                    message.sourceFilter = [];
                    for (let i = 0; i < object.sourceFilter.length; ++i)
                        message.sourceFilter[i] = String(object.sourceFilter[i]);
                }
                if (object.scoreThreshold != null)
                    message.scoreThreshold = Number(object.scoreThreshold);
                if (object.queryEmbedding) {
                    if (!Array.isArray(object.queryEmbedding))
                        throw TypeError(".yorha.retrieval.ResearchContextRequest.queryEmbedding: array expected");
                    message.queryEmbedding = [];
                    for (let i = 0; i < object.queryEmbedding.length; ++i)
                        message.queryEmbedding[i] = Number(object.queryEmbedding[i]);
                }
                if (object.ids) {
                    if (!Array.isArray(object.ids))
                        throw TypeError(".yorha.retrieval.ResearchContextRequest.ids: array expected");
                    message.ids = [];
                    for (let i = 0; i < object.ids.length; ++i)
                        message.ids[i] = String(object.ids[i]);
                }
                if (object.tags) {
                    if (!Array.isArray(object.tags))
                        throw TypeError(".yorha.retrieval.ResearchContextRequest.tags: array expected");
                    message.tags = [];
                    for (let i = 0; i < object.tags.length; ++i)
                        message.tags[i] = String(object.tags[i]);
                }
                if (object.clusterIds) {
                    if (!Array.isArray(object.clusterIds))
                        throw TypeError(".yorha.retrieval.ResearchContextRequest.clusterIds: array expected");
                    message.clusterIds = [];
                    for (let i = 0; i < object.clusterIds.length; ++i)
                        message.clusterIds[i] = String(object.clusterIds[i]);
                }
                if (object.somClusters) {
                    if (!Array.isArray(object.somClusters))
                        throw TypeError(".yorha.retrieval.ResearchContextRequest.somClusters: array expected");
                    message.somClusters = [];
                    for (let i = 0; i < object.somClusters.length; ++i)
                        message.somClusters[i] = object.somClusters[i] | 0;
                }
                if (object.createdAfter != null)
                    message.createdAfter = String(object.createdAfter);
                if (object.updatedAfter != null)
                    message.updatedAfter = String(object.updatedAfter);
                return message;
            };

            /**
             * Creates a plain object from a ResearchContextRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.ResearchContextRequest
             * @static
             * @param {yorha.retrieval.ResearchContextRequest} message ResearchContextRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ResearchContextRequest.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.sourceFilter = [];
                    object.queryEmbedding = [];
                    object.ids = [];
                    object.tags = [];
                    object.clusterIds = [];
                    object.somClusters = [];
                }
                if (options.defaults) {
                    object.query = "";
                    object.limit = 0;
                    object.scoreThreshold = 0;
                    object.createdAfter = "";
                    object.updatedAfter = "";
                }
                if (message.query != null && message.hasOwnProperty("query"))
                    object.query = message.query;
                if (message.limit != null && message.hasOwnProperty("limit"))
                    object.limit = message.limit;
                if (message.sourceFilter && message.sourceFilter.length) {
                    object.sourceFilter = [];
                    for (let j = 0; j < message.sourceFilter.length; ++j)
                        object.sourceFilter[j] = message.sourceFilter[j];
                }
                if (message.scoreThreshold != null && message.hasOwnProperty("scoreThreshold"))
                    object.scoreThreshold = options.json && !isFinite(message.scoreThreshold) ? String(message.scoreThreshold) : message.scoreThreshold;
                if (message.queryEmbedding && message.queryEmbedding.length) {
                    object.queryEmbedding = [];
                    for (let j = 0; j < message.queryEmbedding.length; ++j)
                        object.queryEmbedding[j] = options.json && !isFinite(message.queryEmbedding[j]) ? String(message.queryEmbedding[j]) : message.queryEmbedding[j];
                }
                if (message.ids && message.ids.length) {
                    object.ids = [];
                    for (let j = 0; j < message.ids.length; ++j)
                        object.ids[j] = message.ids[j];
                }
                if (message.tags && message.tags.length) {
                    object.tags = [];
                    for (let j = 0; j < message.tags.length; ++j)
                        object.tags[j] = message.tags[j];
                }
                if (message.clusterIds && message.clusterIds.length) {
                    object.clusterIds = [];
                    for (let j = 0; j < message.clusterIds.length; ++j)
                        object.clusterIds[j] = message.clusterIds[j];
                }
                if (message.somClusters && message.somClusters.length) {
                    object.somClusters = [];
                    for (let j = 0; j < message.somClusters.length; ++j)
                        object.somClusters[j] = message.somClusters[j];
                }
                if (message.createdAfter != null && message.hasOwnProperty("createdAfter"))
                    object.createdAfter = message.createdAfter;
                if (message.updatedAfter != null && message.hasOwnProperty("updatedAfter"))
                    object.updatedAfter = message.updatedAfter;
                return object;
            };

            /**
             * Converts this ResearchContextRequest to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.ResearchContextRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ResearchContextRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ResearchContextRequest
             * @function getTypeUrl
             * @memberof yorha.retrieval.ResearchContextRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ResearchContextRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.ResearchContextRequest";
            };

            return ResearchContextRequest;
        })();

        retrieval.ResearchContextChunk = (function() {

            /**
             * Properties of a ResearchContextChunk.
             * @memberof yorha.retrieval
             * @interface IResearchContextChunk
             * @property {string|null} [id] ResearchContextChunk id
             * @property {string|null} [chunkId] ResearchContextChunk chunkId
             * @property {string|null} [source] ResearchContextChunk source
             * @property {string|null} [url] ResearchContextChunk url
             * @property {string|null} [title] ResearchContextChunk title
             * @property {string|null} [body] ResearchContextChunk body
             * @property {number|null} [score] ResearchContextChunk score
             * @property {Array.<string>|null} [semanticTags] ResearchContextChunk semanticTags
             * @property {Array.<string>|null} [tags] ResearchContextChunk tags
             * @property {yorha.retrieval.IRetrievalSourceMetadata|null} [sourceMetadata] ResearchContextChunk sourceMetadata
             * @property {yorha.retrieval.IRetrievalScoreMetadata|null} [scoreMetadata] ResearchContextChunk scoreMetadata
             * @property {yorha.retrieval.IRetrievalClusterMetadata|null} [clusterMetadata] ResearchContextChunk clusterMetadata
             * @property {yorha.retrieval.ITransportTimestamps|null} [timestamps] ResearchContextChunk timestamps
             */

            /**
             * Constructs a new ResearchContextChunk.
             * @memberof yorha.retrieval
             * @classdesc Represents a ResearchContextChunk.
             * @implements IResearchContextChunk
             * @constructor
             * @param {yorha.retrieval.IResearchContextChunk=} [properties] Properties to set
             */
            function ResearchContextChunk(properties) {
                this.semanticTags = [];
                this.tags = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ResearchContextChunk id.
             * @member {string} id
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.id = "";

            /**
             * ResearchContextChunk chunkId.
             * @member {string} chunkId
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.chunkId = "";

            /**
             * ResearchContextChunk source.
             * @member {string} source
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.source = "";

            /**
             * ResearchContextChunk url.
             * @member {string} url
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.url = "";

            /**
             * ResearchContextChunk title.
             * @member {string} title
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.title = "";

            /**
             * ResearchContextChunk body.
             * @member {string} body
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.body = "";

            /**
             * ResearchContextChunk score.
             * @member {number} score
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.score = 0;

            /**
             * ResearchContextChunk semanticTags.
             * @member {Array.<string>} semanticTags
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.semanticTags = $util.emptyArray;

            /**
             * ResearchContextChunk tags.
             * @member {Array.<string>} tags
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.tags = $util.emptyArray;

            /**
             * ResearchContextChunk sourceMetadata.
             * @member {yorha.retrieval.IRetrievalSourceMetadata|null|undefined} sourceMetadata
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.sourceMetadata = null;

            /**
             * ResearchContextChunk scoreMetadata.
             * @member {yorha.retrieval.IRetrievalScoreMetadata|null|undefined} scoreMetadata
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.scoreMetadata = null;

            /**
             * ResearchContextChunk clusterMetadata.
             * @member {yorha.retrieval.IRetrievalClusterMetadata|null|undefined} clusterMetadata
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.clusterMetadata = null;

            /**
             * ResearchContextChunk timestamps.
             * @member {yorha.retrieval.ITransportTimestamps|null|undefined} timestamps
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             */
            ResearchContextChunk.prototype.timestamps = null;

            /**
             * Creates a new ResearchContextChunk instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.ResearchContextChunk
             * @static
             * @param {yorha.retrieval.IResearchContextChunk=} [properties] Properties to set
             * @returns {yorha.retrieval.ResearchContextChunk} ResearchContextChunk instance
             */
            ResearchContextChunk.create = function create(properties) {
                return new ResearchContextChunk(properties);
            };

            /**
             * Encodes the specified ResearchContextChunk message. Does not implicitly {@link yorha.retrieval.ResearchContextChunk.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.ResearchContextChunk
             * @static
             * @param {yorha.retrieval.IResearchContextChunk} message ResearchContextChunk message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ResearchContextChunk.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                if (message.chunkId != null && Object.hasOwnProperty.call(message, "chunkId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.chunkId);
                if (message.source != null && Object.hasOwnProperty.call(message, "source"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.source);
                if (message.url != null && Object.hasOwnProperty.call(message, "url"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.url);
                if (message.title != null && Object.hasOwnProperty.call(message, "title"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.title);
                if (message.body != null && Object.hasOwnProperty.call(message, "body"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.body);
                if (message.score != null && Object.hasOwnProperty.call(message, "score"))
                    writer.uint32(/* id 7, wireType 5 =*/61).float(message.score);
                if (message.semanticTags != null && message.semanticTags.length)
                    for (let i = 0; i < message.semanticTags.length; ++i)
                        writer.uint32(/* id 8, wireType 2 =*/66).string(message.semanticTags[i]);
                if (message.tags != null && message.tags.length)
                    for (let i = 0; i < message.tags.length; ++i)
                        writer.uint32(/* id 9, wireType 2 =*/74).string(message.tags[i]);
                if (message.sourceMetadata != null && Object.hasOwnProperty.call(message, "sourceMetadata"))
                    $root.yorha.retrieval.RetrievalSourceMetadata.encode(message.sourceMetadata, writer.uint32(/* id 10, wireType 2 =*/82).fork(), q + 1).ldelim();
                if (message.scoreMetadata != null && Object.hasOwnProperty.call(message, "scoreMetadata"))
                    $root.yorha.retrieval.RetrievalScoreMetadata.encode(message.scoreMetadata, writer.uint32(/* id 11, wireType 2 =*/90).fork(), q + 1).ldelim();
                if (message.clusterMetadata != null && Object.hasOwnProperty.call(message, "clusterMetadata"))
                    $root.yorha.retrieval.RetrievalClusterMetadata.encode(message.clusterMetadata, writer.uint32(/* id 12, wireType 2 =*/98).fork(), q + 1).ldelim();
                if (message.timestamps != null && Object.hasOwnProperty.call(message, "timestamps"))
                    $root.yorha.retrieval.TransportTimestamps.encode(message.timestamps, writer.uint32(/* id 13, wireType 2 =*/106).fork(), q + 1).ldelim();
                return writer;
            };

            /**
             * Encodes the specified ResearchContextChunk message, length delimited. Does not implicitly {@link yorha.retrieval.ResearchContextChunk.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.ResearchContextChunk
             * @static
             * @param {yorha.retrieval.IResearchContextChunk} message ResearchContextChunk message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ResearchContextChunk.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ResearchContextChunk message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.ResearchContextChunk
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.ResearchContextChunk} ResearchContextChunk
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ResearchContextChunk.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.ResearchContextChunk();
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
                            message.chunkId = reader.string();
                            break;
                        }
                    case 3: {
                            message.source = reader.string();
                            break;
                        }
                    case 4: {
                            message.url = reader.string();
                            break;
                        }
                    case 5: {
                            message.title = reader.string();
                            break;
                        }
                    case 6: {
                            message.body = reader.string();
                            break;
                        }
                    case 7: {
                            message.score = reader.float();
                            break;
                        }
                    case 8: {
                            if (!(message.semanticTags && message.semanticTags.length))
                                message.semanticTags = [];
                            message.semanticTags.push(reader.string());
                            break;
                        }
                    case 9: {
                            if (!(message.tags && message.tags.length))
                                message.tags = [];
                            message.tags.push(reader.string());
                            break;
                        }
                    case 10: {
                            message.sourceMetadata = $root.yorha.retrieval.RetrievalSourceMetadata.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 11: {
                            message.scoreMetadata = $root.yorha.retrieval.RetrievalScoreMetadata.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 12: {
                            message.clusterMetadata = $root.yorha.retrieval.RetrievalClusterMetadata.decode(reader, reader.uint32(), undefined, long + 1);
                            break;
                        }
                    case 13: {
                            message.timestamps = $root.yorha.retrieval.TransportTimestamps.decode(reader, reader.uint32(), undefined, long + 1);
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
             * Decodes a ResearchContextChunk message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.ResearchContextChunk
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.ResearchContextChunk} ResearchContextChunk
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ResearchContextChunk.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ResearchContextChunk message.
             * @function verify
             * @memberof yorha.retrieval.ResearchContextChunk
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ResearchContextChunk.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.id != null && message.hasOwnProperty("id"))
                    if (!$util.isString(message.id))
                        return "id: string expected";
                if (message.chunkId != null && message.hasOwnProperty("chunkId"))
                    if (!$util.isString(message.chunkId))
                        return "chunkId: string expected";
                if (message.source != null && message.hasOwnProperty("source"))
                    if (!$util.isString(message.source))
                        return "source: string expected";
                if (message.url != null && message.hasOwnProperty("url"))
                    if (!$util.isString(message.url))
                        return "url: string expected";
                if (message.title != null && message.hasOwnProperty("title"))
                    if (!$util.isString(message.title))
                        return "title: string expected";
                if (message.body != null && message.hasOwnProperty("body"))
                    if (!$util.isString(message.body))
                        return "body: string expected";
                if (message.score != null && message.hasOwnProperty("score"))
                    if (typeof message.score !== "number")
                        return "score: number expected";
                if (message.semanticTags != null && message.hasOwnProperty("semanticTags")) {
                    if (!Array.isArray(message.semanticTags))
                        return "semanticTags: array expected";
                    for (let i = 0; i < message.semanticTags.length; ++i)
                        if (!$util.isString(message.semanticTags[i]))
                            return "semanticTags: string[] expected";
                }
                if (message.tags != null && message.hasOwnProperty("tags")) {
                    if (!Array.isArray(message.tags))
                        return "tags: array expected";
                    for (let i = 0; i < message.tags.length; ++i)
                        if (!$util.isString(message.tags[i]))
                            return "tags: string[] expected";
                }
                if (message.sourceMetadata != null && message.hasOwnProperty("sourceMetadata")) {
                    let error = $root.yorha.retrieval.RetrievalSourceMetadata.verify(message.sourceMetadata, long + 1);
                    if (error)
                        return "sourceMetadata." + error;
                }
                if (message.scoreMetadata != null && message.hasOwnProperty("scoreMetadata")) {
                    let error = $root.yorha.retrieval.RetrievalScoreMetadata.verify(message.scoreMetadata, long + 1);
                    if (error)
                        return "scoreMetadata." + error;
                }
                if (message.clusterMetadata != null && message.hasOwnProperty("clusterMetadata")) {
                    let error = $root.yorha.retrieval.RetrievalClusterMetadata.verify(message.clusterMetadata, long + 1);
                    if (error)
                        return "clusterMetadata." + error;
                }
                if (message.timestamps != null && message.hasOwnProperty("timestamps")) {
                    let error = $root.yorha.retrieval.TransportTimestamps.verify(message.timestamps, long + 1);
                    if (error)
                        return "timestamps." + error;
                }
                return null;
            };

            /**
             * Creates a ResearchContextChunk message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.ResearchContextChunk
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.ResearchContextChunk} ResearchContextChunk
             */
            ResearchContextChunk.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.ResearchContextChunk)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.ResearchContextChunk();
                if (object.id != null)
                    message.id = String(object.id);
                if (object.chunkId != null)
                    message.chunkId = String(object.chunkId);
                if (object.source != null)
                    message.source = String(object.source);
                if (object.url != null)
                    message.url = String(object.url);
                if (object.title != null)
                    message.title = String(object.title);
                if (object.body != null)
                    message.body = String(object.body);
                if (object.score != null)
                    message.score = Number(object.score);
                if (object.semanticTags) {
                    if (!Array.isArray(object.semanticTags))
                        throw TypeError(".yorha.retrieval.ResearchContextChunk.semanticTags: array expected");
                    message.semanticTags = [];
                    for (let i = 0; i < object.semanticTags.length; ++i)
                        message.semanticTags[i] = String(object.semanticTags[i]);
                }
                if (object.tags) {
                    if (!Array.isArray(object.tags))
                        throw TypeError(".yorha.retrieval.ResearchContextChunk.tags: array expected");
                    message.tags = [];
                    for (let i = 0; i < object.tags.length; ++i)
                        message.tags[i] = String(object.tags[i]);
                }
                if (object.sourceMetadata != null) {
                    if (typeof object.sourceMetadata !== "object")
                        throw TypeError(".yorha.retrieval.ResearchContextChunk.sourceMetadata: object expected");
                    message.sourceMetadata = $root.yorha.retrieval.RetrievalSourceMetadata.fromObject(object.sourceMetadata, long + 1);
                }
                if (object.scoreMetadata != null) {
                    if (typeof object.scoreMetadata !== "object")
                        throw TypeError(".yorha.retrieval.ResearchContextChunk.scoreMetadata: object expected");
                    message.scoreMetadata = $root.yorha.retrieval.RetrievalScoreMetadata.fromObject(object.scoreMetadata, long + 1);
                }
                if (object.clusterMetadata != null) {
                    if (typeof object.clusterMetadata !== "object")
                        throw TypeError(".yorha.retrieval.ResearchContextChunk.clusterMetadata: object expected");
                    message.clusterMetadata = $root.yorha.retrieval.RetrievalClusterMetadata.fromObject(object.clusterMetadata, long + 1);
                }
                if (object.timestamps != null) {
                    if (typeof object.timestamps !== "object")
                        throw TypeError(".yorha.retrieval.ResearchContextChunk.timestamps: object expected");
                    message.timestamps = $root.yorha.retrieval.TransportTimestamps.fromObject(object.timestamps, long + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a ResearchContextChunk message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.ResearchContextChunk
             * @static
             * @param {yorha.retrieval.ResearchContextChunk} message ResearchContextChunk
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ResearchContextChunk.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.semanticTags = [];
                    object.tags = [];
                }
                if (options.defaults) {
                    object.id = "";
                    object.chunkId = "";
                    object.source = "";
                    object.url = "";
                    object.title = "";
                    object.body = "";
                    object.score = 0;
                    object.sourceMetadata = null;
                    object.scoreMetadata = null;
                    object.clusterMetadata = null;
                    object.timestamps = null;
                }
                if (message.id != null && message.hasOwnProperty("id"))
                    object.id = message.id;
                if (message.chunkId != null && message.hasOwnProperty("chunkId"))
                    object.chunkId = message.chunkId;
                if (message.source != null && message.hasOwnProperty("source"))
                    object.source = message.source;
                if (message.url != null && message.hasOwnProperty("url"))
                    object.url = message.url;
                if (message.title != null && message.hasOwnProperty("title"))
                    object.title = message.title;
                if (message.body != null && message.hasOwnProperty("body"))
                    object.body = message.body;
                if (message.score != null && message.hasOwnProperty("score"))
                    object.score = options.json && !isFinite(message.score) ? String(message.score) : message.score;
                if (message.semanticTags && message.semanticTags.length) {
                    object.semanticTags = [];
                    for (let j = 0; j < message.semanticTags.length; ++j)
                        object.semanticTags[j] = message.semanticTags[j];
                }
                if (message.tags && message.tags.length) {
                    object.tags = [];
                    for (let j = 0; j < message.tags.length; ++j)
                        object.tags[j] = message.tags[j];
                }
                if (message.sourceMetadata != null && message.hasOwnProperty("sourceMetadata"))
                    object.sourceMetadata = $root.yorha.retrieval.RetrievalSourceMetadata.toObject(message.sourceMetadata, options, q + 1);
                if (message.scoreMetadata != null && message.hasOwnProperty("scoreMetadata"))
                    object.scoreMetadata = $root.yorha.retrieval.RetrievalScoreMetadata.toObject(message.scoreMetadata, options, q + 1);
                if (message.clusterMetadata != null && message.hasOwnProperty("clusterMetadata"))
                    object.clusterMetadata = $root.yorha.retrieval.RetrievalClusterMetadata.toObject(message.clusterMetadata, options, q + 1);
                if (message.timestamps != null && message.hasOwnProperty("timestamps"))
                    object.timestamps = $root.yorha.retrieval.TransportTimestamps.toObject(message.timestamps, options, q + 1);
                return object;
            };

            /**
             * Converts this ResearchContextChunk to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.ResearchContextChunk
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ResearchContextChunk.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ResearchContextChunk
             * @function getTypeUrl
             * @memberof yorha.retrieval.ResearchContextChunk
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ResearchContextChunk.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.ResearchContextChunk";
            };

            return ResearchContextChunk;
        })();

        retrieval.ResearchContextResponse = (function() {

            /**
             * Properties of a ResearchContextResponse.
             * @memberof yorha.retrieval
             * @interface IResearchContextResponse
             * @property {Array.<yorha.retrieval.IResearchContextChunk>|null} [research] ResearchContextResponse research
             * @property {number|null} [totalMs] ResearchContextResponse totalMs
             */

            /**
             * Constructs a new ResearchContextResponse.
             * @memberof yorha.retrieval
             * @classdesc Represents a ResearchContextResponse.
             * @implements IResearchContextResponse
             * @constructor
             * @param {yorha.retrieval.IResearchContextResponse=} [properties] Properties to set
             */
            function ResearchContextResponse(properties) {
                this.research = [];
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ResearchContextResponse research.
             * @member {Array.<yorha.retrieval.IResearchContextChunk>} research
             * @memberof yorha.retrieval.ResearchContextResponse
             * @instance
             */
            ResearchContextResponse.prototype.research = $util.emptyArray;

            /**
             * ResearchContextResponse totalMs.
             * @member {number} totalMs
             * @memberof yorha.retrieval.ResearchContextResponse
             * @instance
             */
            ResearchContextResponse.prototype.totalMs = 0;

            /**
             * Creates a new ResearchContextResponse instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.ResearchContextResponse
             * @static
             * @param {yorha.retrieval.IResearchContextResponse=} [properties] Properties to set
             * @returns {yorha.retrieval.ResearchContextResponse} ResearchContextResponse instance
             */
            ResearchContextResponse.create = function create(properties) {
                return new ResearchContextResponse(properties);
            };

            /**
             * Encodes the specified ResearchContextResponse message. Does not implicitly {@link yorha.retrieval.ResearchContextResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.ResearchContextResponse
             * @static
             * @param {yorha.retrieval.IResearchContextResponse} message ResearchContextResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ResearchContextResponse.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.research != null && message.research.length)
                    for (let i = 0; i < message.research.length; ++i)
                        $root.yorha.retrieval.ResearchContextChunk.encode(message.research[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
                if (message.totalMs != null && Object.hasOwnProperty.call(message, "totalMs"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.totalMs);
                return writer;
            };

            /**
             * Encodes the specified ResearchContextResponse message, length delimited. Does not implicitly {@link yorha.retrieval.ResearchContextResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.retrieval.ResearchContextResponse
             * @static
             * @param {yorha.retrieval.IResearchContextResponse} message ResearchContextResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ResearchContextResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ResearchContextResponse message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.retrieval.ResearchContextResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.retrieval.ResearchContextResponse} ResearchContextResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ResearchContextResponse.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.retrieval.ResearchContextResponse();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            if (!(message.research && message.research.length))
                                message.research = [];
                            message.research.push($root.yorha.retrieval.ResearchContextChunk.decode(reader, reader.uint32(), undefined, long + 1));
                            break;
                        }
                    case 2: {
                            message.totalMs = reader.float();
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
             * Decodes a ResearchContextResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.retrieval.ResearchContextResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.retrieval.ResearchContextResponse} ResearchContextResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ResearchContextResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ResearchContextResponse message.
             * @function verify
             * @memberof yorha.retrieval.ResearchContextResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ResearchContextResponse.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.research != null && message.hasOwnProperty("research")) {
                    if (!Array.isArray(message.research))
                        return "research: array expected";
                    for (let i = 0; i < message.research.length; ++i) {
                        let error = $root.yorha.retrieval.ResearchContextChunk.verify(message.research[i], long + 1);
                        if (error)
                            return "research." + error;
                    }
                }
                if (message.totalMs != null && message.hasOwnProperty("totalMs"))
                    if (typeof message.totalMs !== "number")
                        return "totalMs: number expected";
                return null;
            };

            /**
             * Creates a ResearchContextResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.ResearchContextResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.ResearchContextResponse} ResearchContextResponse
             */
            ResearchContextResponse.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.ResearchContextResponse)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.ResearchContextResponse();
                if (object.research) {
                    if (!Array.isArray(object.research))
                        throw TypeError(".yorha.retrieval.ResearchContextResponse.research: array expected");
                    message.research = [];
                    for (let i = 0; i < object.research.length; ++i) {
                        if (typeof object.research[i] !== "object")
                            throw TypeError(".yorha.retrieval.ResearchContextResponse.research: object expected");
                        message.research[i] = $root.yorha.retrieval.ResearchContextChunk.fromObject(object.research[i], long + 1);
                    }
                }
                if (object.totalMs != null)
                    message.totalMs = Number(object.totalMs);
                return message;
            };

            /**
             * Creates a plain object from a ResearchContextResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.ResearchContextResponse
             * @static
             * @param {yorha.retrieval.ResearchContextResponse} message ResearchContextResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ResearchContextResponse.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.research = [];
                if (options.defaults)
                    object.totalMs = 0;
                if (message.research && message.research.length) {
                    object.research = [];
                    for (let j = 0; j < message.research.length; ++j)
                        object.research[j] = $root.yorha.retrieval.ResearchContextChunk.toObject(message.research[j], options, q + 1);
                }
                if (message.totalMs != null && message.hasOwnProperty("totalMs"))
                    object.totalMs = options.json && !isFinite(message.totalMs) ? String(message.totalMs) : message.totalMs;
                return object;
            };

            /**
             * Converts this ResearchContextResponse to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.ResearchContextResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ResearchContextResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ResearchContextResponse
             * @function getTypeUrl
             * @memberof yorha.retrieval.ResearchContextResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ResearchContextResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.retrieval.ResearchContextResponse";
            };

            return ResearchContextResponse;
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new HealthRequest instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.HealthRequest
             * @static
             * @param {yorha.retrieval.IHealthRequest=} [properties] Properties to set
             * @returns {yorha.retrieval.HealthRequest} HealthRequest instance
             */
            HealthRequest.create = function create(properties) {
                return new HealthRequest(properties);
            };

            /**
             * Encodes the specified HealthRequest message. Does not implicitly {@link yorha.retrieval.HealthRequest.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.HealthRequest
             * @static
             * @param {yorha.retrieval.IHealthRequest} message HealthRequest message or plain object to encode
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
            HealthRequest.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a HealthRequest message.
             * @function verify
             * @memberof yorha.retrieval.HealthRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            HealthRequest.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.service != null && message.hasOwnProperty("service"))
                    if (!$util.isString(message.service))
                        return "service: string expected";
                return null;
            };

            /**
             * Creates a HealthRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.HealthRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.HealthRequest} HealthRequest
             */
            HealthRequest.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.HealthRequest)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.HealthRequest();
                if (object.service != null)
                    message.service = String(object.service);
                return message;
            };

            /**
             * Creates a plain object from a HealthRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.HealthRequest
             * @static
             * @param {yorha.retrieval.HealthRequest} message HealthRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            HealthRequest.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults)
                    object.service = "";
                if (message.service != null && message.hasOwnProperty("service"))
                    object.service = message.service;
                return object;
            };

            /**
             * Converts this HealthRequest to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.HealthRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            HealthRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
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
             * Creates a new HealthResponse instance using the specified properties.
             * @function create
             * @memberof yorha.retrieval.HealthResponse
             * @static
             * @param {yorha.retrieval.IHealthResponse=} [properties] Properties to set
             * @returns {yorha.retrieval.HealthResponse} HealthResponse instance
             */
            HealthResponse.create = function create(properties) {
                return new HealthResponse(properties);
            };

            /**
             * Encodes the specified HealthResponse message. Does not implicitly {@link yorha.retrieval.HealthResponse.verify|verify} messages.
             * @function encode
             * @memberof yorha.retrieval.HealthResponse
             * @static
             * @param {yorha.retrieval.IHealthResponse} message HealthResponse message or plain object to encode
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
            HealthResponse.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
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
                        reader.skipType(tag & 7, long);
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
             * Verifies a HealthResponse message.
             * @function verify
             * @memberof yorha.retrieval.HealthResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            HealthResponse.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.status != null && message.hasOwnProperty("status"))
                    if (!$util.isString(message.status))
                        return "status: string expected";
                if (message.pgvectorConnected != null && message.hasOwnProperty("pgvectorConnected"))
                    if (typeof message.pgvectorConnected !== "boolean")
                        return "pgvectorConnected: boolean expected";
                if (message.qdrantConnected != null && message.hasOwnProperty("qdrantConnected"))
                    if (typeof message.qdrantConnected !== "boolean")
                        return "qdrantConnected: boolean expected";
                if (message.redisConnected != null && message.hasOwnProperty("redisConnected"))
                    if (typeof message.redisConnected !== "boolean")
                        return "redisConnected: boolean expected";
                if (message.embeddingServiceUp != null && message.hasOwnProperty("embeddingServiceUp"))
                    if (typeof message.embeddingServiceUp !== "boolean")
                        return "embeddingServiceUp: boolean expected";
                if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                    if (!$util.isInteger(message.timestamp) && !(message.timestamp && $util.isInteger(message.timestamp.low) && $util.isInteger(message.timestamp.high)))
                        return "timestamp: integer|Long expected";
                return null;
            };

            /**
             * Creates a HealthResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.retrieval.HealthResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.retrieval.HealthResponse} HealthResponse
             */
            HealthResponse.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.retrieval.HealthResponse)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.retrieval.HealthResponse();
                if (object.status != null)
                    message.status = String(object.status);
                if (object.pgvectorConnected != null)
                    message.pgvectorConnected = Boolean(object.pgvectorConnected);
                if (object.qdrantConnected != null)
                    message.qdrantConnected = Boolean(object.qdrantConnected);
                if (object.redisConnected != null)
                    message.redisConnected = Boolean(object.redisConnected);
                if (object.embeddingServiceUp != null)
                    message.embeddingServiceUp = Boolean(object.embeddingServiceUp);
                if (object.timestamp != null)
                    if ($util.Long)
                        message.timestamp = $util.Long.fromValue(object.timestamp, false);
                    else if (typeof object.timestamp === "string")
                        message.timestamp = parseInt(object.timestamp, 10);
                    else if (typeof object.timestamp === "number")
                        message.timestamp = object.timestamp;
                    else if (typeof object.timestamp === "object")
                        message.timestamp = new $util.LongBits(object.timestamp.low >>> 0, object.timestamp.high >>> 0).toNumber();
                return message;
            };

            /**
             * Creates a plain object from a HealthResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.retrieval.HealthResponse
             * @static
             * @param {yorha.retrieval.HealthResponse} message HealthResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            HealthResponse.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.status = "";
                    object.pgvectorConnected = false;
                    object.qdrantConnected = false;
                    object.redisConnected = false;
                    object.embeddingServiceUp = false;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.timestamp = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : typeof BigInt !== "undefined" && options.longs === BigInt ? long.toBigInt() : long;
                    } else
                        object.timestamp = options.longs === String ? "0" : typeof BigInt !== "undefined" && options.longs === BigInt ? BigInt("0") : 0;
                }
                if (message.status != null && message.hasOwnProperty("status"))
                    object.status = message.status;
                if (message.pgvectorConnected != null && message.hasOwnProperty("pgvectorConnected"))
                    object.pgvectorConnected = message.pgvectorConnected;
                if (message.qdrantConnected != null && message.hasOwnProperty("qdrantConnected"))
                    object.qdrantConnected = message.qdrantConnected;
                if (message.redisConnected != null && message.hasOwnProperty("redisConnected"))
                    object.redisConnected = message.redisConnected;
                if (message.embeddingServiceUp != null && message.hasOwnProperty("embeddingServiceUp"))
                    object.embeddingServiceUp = message.embeddingServiceUp;
                if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                    if (typeof BigInt !== "undefined" && options.longs === BigInt)
                        object.timestamp = typeof message.timestamp === "number" ? BigInt(message.timestamp) : $util.Long.fromBits(message.timestamp.low >>> 0, message.timestamp.high >>> 0, false).toBigInt();
                    else if (typeof message.timestamp === "number")
                        object.timestamp = options.longs === String ? String(message.timestamp) : message.timestamp;
                    else
                        object.timestamp = options.longs === String ? $util.Long.prototype.toString.call(message.timestamp) : options.longs === Number ? new $util.LongBits(message.timestamp.low >>> 0, message.timestamp.high >>> 0).toNumber() : message.timestamp;
                return object;
            };

            /**
             * Converts this HealthResponse to JSON.
             * @function toJSON
             * @memberof yorha.retrieval.HealthResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            HealthResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
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

    yorha.shared = (function() {

        /**
         * Namespace shared.
         * @memberof yorha
         * @namespace
         */
        const shared = {};

        shared.RunIds = (function() {

            /**
             * Properties of a RunIds.
             * @memberof yorha.shared
             * @interface IRunIds
             * @property {string|null} [runId] RunIds runId
             * @property {string|null} [chunkId] RunIds chunkId
             * @property {string|null} [groupId] RunIds groupId
             * @property {string|null} [symbolId] RunIds symbolId
             * @property {string|null} [errorHash] RunIds errorHash
             * @property {string|null} [contentHash] RunIds contentHash
             * @property {string|null} [embeddingModel] RunIds embeddingModel
             * @property {number|null} [embeddingDim] RunIds embeddingDim
             */

            /**
             * Constructs a new RunIds.
             * @memberof yorha.shared
             * @classdesc Represents a RunIds.
             * @implements IRunIds
             * @constructor
             * @param {yorha.shared.IRunIds=} [properties] Properties to set
             */
            function RunIds(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * RunIds runId.
             * @member {string} runId
             * @memberof yorha.shared.RunIds
             * @instance
             */
            RunIds.prototype.runId = "";

            /**
             * RunIds chunkId.
             * @member {string} chunkId
             * @memberof yorha.shared.RunIds
             * @instance
             */
            RunIds.prototype.chunkId = "";

            /**
             * RunIds groupId.
             * @member {string} groupId
             * @memberof yorha.shared.RunIds
             * @instance
             */
            RunIds.prototype.groupId = "";

            /**
             * RunIds symbolId.
             * @member {string} symbolId
             * @memberof yorha.shared.RunIds
             * @instance
             */
            RunIds.prototype.symbolId = "";

            /**
             * RunIds errorHash.
             * @member {string} errorHash
             * @memberof yorha.shared.RunIds
             * @instance
             */
            RunIds.prototype.errorHash = "";

            /**
             * RunIds contentHash.
             * @member {string} contentHash
             * @memberof yorha.shared.RunIds
             * @instance
             */
            RunIds.prototype.contentHash = "";

            /**
             * RunIds embeddingModel.
             * @member {string} embeddingModel
             * @memberof yorha.shared.RunIds
             * @instance
             */
            RunIds.prototype.embeddingModel = "";

            /**
             * RunIds embeddingDim.
             * @member {number} embeddingDim
             * @memberof yorha.shared.RunIds
             * @instance
             */
            RunIds.prototype.embeddingDim = 0;

            /**
             * Creates a new RunIds instance using the specified properties.
             * @function create
             * @memberof yorha.shared.RunIds
             * @static
             * @param {yorha.shared.IRunIds=} [properties] Properties to set
             * @returns {yorha.shared.RunIds} RunIds instance
             */
            RunIds.create = function create(properties) {
                return new RunIds(properties);
            };

            /**
             * Encodes the specified RunIds message. Does not implicitly {@link yorha.shared.RunIds.verify|verify} messages.
             * @function encode
             * @memberof yorha.shared.RunIds
             * @static
             * @param {yorha.shared.IRunIds} message RunIds message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RunIds.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.runId != null && Object.hasOwnProperty.call(message, "runId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.runId);
                if (message.chunkId != null && Object.hasOwnProperty.call(message, "chunkId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.chunkId);
                if (message.groupId != null && Object.hasOwnProperty.call(message, "groupId"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.groupId);
                if (message.symbolId != null && Object.hasOwnProperty.call(message, "symbolId"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.symbolId);
                if (message.errorHash != null && Object.hasOwnProperty.call(message, "errorHash"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.errorHash);
                if (message.contentHash != null && Object.hasOwnProperty.call(message, "contentHash"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.contentHash);
                if (message.embeddingModel != null && Object.hasOwnProperty.call(message, "embeddingModel"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.embeddingModel);
                if (message.embeddingDim != null && Object.hasOwnProperty.call(message, "embeddingDim"))
                    writer.uint32(/* id 8, wireType 0 =*/64).int32(message.embeddingDim);
                return writer;
            };

            /**
             * Encodes the specified RunIds message, length delimited. Does not implicitly {@link yorha.shared.RunIds.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.shared.RunIds
             * @static
             * @param {yorha.shared.IRunIds} message RunIds message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RunIds.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a RunIds message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.shared.RunIds
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.shared.RunIds} RunIds
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RunIds.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.shared.RunIds();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.runId = reader.string();
                            break;
                        }
                    case 2: {
                            message.chunkId = reader.string();
                            break;
                        }
                    case 3: {
                            message.groupId = reader.string();
                            break;
                        }
                    case 4: {
                            message.symbolId = reader.string();
                            break;
                        }
                    case 5: {
                            message.errorHash = reader.string();
                            break;
                        }
                    case 6: {
                            message.contentHash = reader.string();
                            break;
                        }
                    case 7: {
                            message.embeddingModel = reader.string();
                            break;
                        }
                    case 8: {
                            message.embeddingDim = reader.int32();
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
             * Decodes a RunIds message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.shared.RunIds
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.shared.RunIds} RunIds
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RunIds.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a RunIds message.
             * @function verify
             * @memberof yorha.shared.RunIds
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            RunIds.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.runId != null && message.hasOwnProperty("runId"))
                    if (!$util.isString(message.runId))
                        return "runId: string expected";
                if (message.chunkId != null && message.hasOwnProperty("chunkId"))
                    if (!$util.isString(message.chunkId))
                        return "chunkId: string expected";
                if (message.groupId != null && message.hasOwnProperty("groupId"))
                    if (!$util.isString(message.groupId))
                        return "groupId: string expected";
                if (message.symbolId != null && message.hasOwnProperty("symbolId"))
                    if (!$util.isString(message.symbolId))
                        return "symbolId: string expected";
                if (message.errorHash != null && message.hasOwnProperty("errorHash"))
                    if (!$util.isString(message.errorHash))
                        return "errorHash: string expected";
                if (message.contentHash != null && message.hasOwnProperty("contentHash"))
                    if (!$util.isString(message.contentHash))
                        return "contentHash: string expected";
                if (message.embeddingModel != null && message.hasOwnProperty("embeddingModel"))
                    if (!$util.isString(message.embeddingModel))
                        return "embeddingModel: string expected";
                if (message.embeddingDim != null && message.hasOwnProperty("embeddingDim"))
                    if (!$util.isInteger(message.embeddingDim))
                        return "embeddingDim: integer expected";
                return null;
            };

            /**
             * Creates a RunIds message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.shared.RunIds
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.shared.RunIds} RunIds
             */
            RunIds.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.shared.RunIds)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.shared.RunIds();
                if (object.runId != null)
                    message.runId = String(object.runId);
                if (object.chunkId != null)
                    message.chunkId = String(object.chunkId);
                if (object.groupId != null)
                    message.groupId = String(object.groupId);
                if (object.symbolId != null)
                    message.symbolId = String(object.symbolId);
                if (object.errorHash != null)
                    message.errorHash = String(object.errorHash);
                if (object.contentHash != null)
                    message.contentHash = String(object.contentHash);
                if (object.embeddingModel != null)
                    message.embeddingModel = String(object.embeddingModel);
                if (object.embeddingDim != null)
                    message.embeddingDim = object.embeddingDim | 0;
                return message;
            };

            /**
             * Creates a plain object from a RunIds message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.shared.RunIds
             * @static
             * @param {yorha.shared.RunIds} message RunIds
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            RunIds.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.runId = "";
                    object.chunkId = "";
                    object.groupId = "";
                    object.symbolId = "";
                    object.errorHash = "";
                    object.contentHash = "";
                    object.embeddingModel = "";
                    object.embeddingDim = 0;
                }
                if (message.runId != null && message.hasOwnProperty("runId"))
                    object.runId = message.runId;
                if (message.chunkId != null && message.hasOwnProperty("chunkId"))
                    object.chunkId = message.chunkId;
                if (message.groupId != null && message.hasOwnProperty("groupId"))
                    object.groupId = message.groupId;
                if (message.symbolId != null && message.hasOwnProperty("symbolId"))
                    object.symbolId = message.symbolId;
                if (message.errorHash != null && message.hasOwnProperty("errorHash"))
                    object.errorHash = message.errorHash;
                if (message.contentHash != null && message.hasOwnProperty("contentHash"))
                    object.contentHash = message.contentHash;
                if (message.embeddingModel != null && message.hasOwnProperty("embeddingModel"))
                    object.embeddingModel = message.embeddingModel;
                if (message.embeddingDim != null && message.hasOwnProperty("embeddingDim"))
                    object.embeddingDim = message.embeddingDim;
                return object;
            };

            /**
             * Converts this RunIds to JSON.
             * @function toJSON
             * @memberof yorha.shared.RunIds
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            RunIds.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for RunIds
             * @function getTypeUrl
             * @memberof yorha.shared.RunIds
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            RunIds.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.shared.RunIds";
            };

            return RunIds;
        })();

        shared.AtlasRequestContextV2 = (function() {

            /**
             * Properties of an AtlasRequestContextV2.
             * @memberof yorha.shared
             * @interface IAtlasRequestContextV2
             * @property {string|null} [toolCallId] AtlasRequestContextV2 toolCallId
             * @property {string|null} [runId] AtlasRequestContextV2 runId
             * @property {string|null} [workspaceId] AtlasRequestContextV2 workspaceId
             * @property {string|null} [workspaceRevision] AtlasRequestContextV2 workspaceRevision
             * @property {string|null} [packetKey] AtlasRequestContextV2 packetKey
             * @property {string|null} [packetRevision] AtlasRequestContextV2 packetRevision
             */

            /**
             * Constructs a new AtlasRequestContextV2.
             * @memberof yorha.shared
             * @classdesc Represents an AtlasRequestContextV2.
             * @implements IAtlasRequestContextV2
             * @constructor
             * @param {yorha.shared.IAtlasRequestContextV2=} [properties] Properties to set
             */
            function AtlasRequestContextV2(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * AtlasRequestContextV2 toolCallId.
             * @member {string} toolCallId
             * @memberof yorha.shared.AtlasRequestContextV2
             * @instance
             */
            AtlasRequestContextV2.prototype.toolCallId = "";

            /**
             * AtlasRequestContextV2 runId.
             * @member {string} runId
             * @memberof yorha.shared.AtlasRequestContextV2
             * @instance
             */
            AtlasRequestContextV2.prototype.runId = "";

            /**
             * AtlasRequestContextV2 workspaceId.
             * @member {string} workspaceId
             * @memberof yorha.shared.AtlasRequestContextV2
             * @instance
             */
            AtlasRequestContextV2.prototype.workspaceId = "";

            /**
             * AtlasRequestContextV2 workspaceRevision.
             * @member {string} workspaceRevision
             * @memberof yorha.shared.AtlasRequestContextV2
             * @instance
             */
            AtlasRequestContextV2.prototype.workspaceRevision = "";

            /**
             * AtlasRequestContextV2 packetKey.
             * @member {string} packetKey
             * @memberof yorha.shared.AtlasRequestContextV2
             * @instance
             */
            AtlasRequestContextV2.prototype.packetKey = "";

            /**
             * AtlasRequestContextV2 packetRevision.
             * @member {string} packetRevision
             * @memberof yorha.shared.AtlasRequestContextV2
             * @instance
             */
            AtlasRequestContextV2.prototype.packetRevision = "";

            /**
             * Creates a new AtlasRequestContextV2 instance using the specified properties.
             * @function create
             * @memberof yorha.shared.AtlasRequestContextV2
             * @static
             * @param {yorha.shared.IAtlasRequestContextV2=} [properties] Properties to set
             * @returns {yorha.shared.AtlasRequestContextV2} AtlasRequestContextV2 instance
             */
            AtlasRequestContextV2.create = function create(properties) {
                return new AtlasRequestContextV2(properties);
            };

            /**
             * Encodes the specified AtlasRequestContextV2 message. Does not implicitly {@link yorha.shared.AtlasRequestContextV2.verify|verify} messages.
             * @function encode
             * @memberof yorha.shared.AtlasRequestContextV2
             * @static
             * @param {yorha.shared.IAtlasRequestContextV2} message AtlasRequestContextV2 message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AtlasRequestContextV2.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.toolCallId != null && Object.hasOwnProperty.call(message, "toolCallId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.toolCallId);
                if (message.runId != null && Object.hasOwnProperty.call(message, "runId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.runId);
                if (message.workspaceId != null && Object.hasOwnProperty.call(message, "workspaceId"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.workspaceId);
                if (message.workspaceRevision != null && Object.hasOwnProperty.call(message, "workspaceRevision"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.workspaceRevision);
                if (message.packetKey != null && Object.hasOwnProperty.call(message, "packetKey"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.packetKey);
                if (message.packetRevision != null && Object.hasOwnProperty.call(message, "packetRevision"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.packetRevision);
                return writer;
            };

            /**
             * Encodes the specified AtlasRequestContextV2 message, length delimited. Does not implicitly {@link yorha.shared.AtlasRequestContextV2.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.shared.AtlasRequestContextV2
             * @static
             * @param {yorha.shared.IAtlasRequestContextV2} message AtlasRequestContextV2 message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AtlasRequestContextV2.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an AtlasRequestContextV2 message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.shared.AtlasRequestContextV2
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.shared.AtlasRequestContextV2} AtlasRequestContextV2
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AtlasRequestContextV2.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.shared.AtlasRequestContextV2();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.toolCallId = reader.string();
                            break;
                        }
                    case 2: {
                            message.runId = reader.string();
                            break;
                        }
                    case 3: {
                            message.workspaceId = reader.string();
                            break;
                        }
                    case 4: {
                            message.workspaceRevision = reader.string();
                            break;
                        }
                    case 5: {
                            message.packetKey = reader.string();
                            break;
                        }
                    case 6: {
                            message.packetRevision = reader.string();
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
             * Decodes an AtlasRequestContextV2 message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.shared.AtlasRequestContextV2
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.shared.AtlasRequestContextV2} AtlasRequestContextV2
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AtlasRequestContextV2.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an AtlasRequestContextV2 message.
             * @function verify
             * @memberof yorha.shared.AtlasRequestContextV2
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            AtlasRequestContextV2.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.toolCallId != null && message.hasOwnProperty("toolCallId"))
                    if (!$util.isString(message.toolCallId))
                        return "toolCallId: string expected";
                if (message.runId != null && message.hasOwnProperty("runId"))
                    if (!$util.isString(message.runId))
                        return "runId: string expected";
                if (message.workspaceId != null && message.hasOwnProperty("workspaceId"))
                    if (!$util.isString(message.workspaceId))
                        return "workspaceId: string expected";
                if (message.workspaceRevision != null && message.hasOwnProperty("workspaceRevision"))
                    if (!$util.isString(message.workspaceRevision))
                        return "workspaceRevision: string expected";
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    if (!$util.isString(message.packetKey))
                        return "packetKey: string expected";
                if (message.packetRevision != null && message.hasOwnProperty("packetRevision"))
                    if (!$util.isString(message.packetRevision))
                        return "packetRevision: string expected";
                return null;
            };

            /**
             * Creates an AtlasRequestContextV2 message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.shared.AtlasRequestContextV2
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.shared.AtlasRequestContextV2} AtlasRequestContextV2
             */
            AtlasRequestContextV2.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.shared.AtlasRequestContextV2)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.shared.AtlasRequestContextV2();
                if (object.toolCallId != null)
                    message.toolCallId = String(object.toolCallId);
                if (object.runId != null)
                    message.runId = String(object.runId);
                if (object.workspaceId != null)
                    message.workspaceId = String(object.workspaceId);
                if (object.workspaceRevision != null)
                    message.workspaceRevision = String(object.workspaceRevision);
                if (object.packetKey != null)
                    message.packetKey = String(object.packetKey);
                if (object.packetRevision != null)
                    message.packetRevision = String(object.packetRevision);
                return message;
            };

            /**
             * Creates a plain object from an AtlasRequestContextV2 message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.shared.AtlasRequestContextV2
             * @static
             * @param {yorha.shared.AtlasRequestContextV2} message AtlasRequestContextV2
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            AtlasRequestContextV2.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.toolCallId = "";
                    object.runId = "";
                    object.workspaceId = "";
                    object.workspaceRevision = "";
                    object.packetKey = "";
                    object.packetRevision = "";
                }
                if (message.toolCallId != null && message.hasOwnProperty("toolCallId"))
                    object.toolCallId = message.toolCallId;
                if (message.runId != null && message.hasOwnProperty("runId"))
                    object.runId = message.runId;
                if (message.workspaceId != null && message.hasOwnProperty("workspaceId"))
                    object.workspaceId = message.workspaceId;
                if (message.workspaceRevision != null && message.hasOwnProperty("workspaceRevision"))
                    object.workspaceRevision = message.workspaceRevision;
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    object.packetKey = message.packetKey;
                if (message.packetRevision != null && message.hasOwnProperty("packetRevision"))
                    object.packetRevision = message.packetRevision;
                return object;
            };

            /**
             * Converts this AtlasRequestContextV2 to JSON.
             * @function toJSON
             * @memberof yorha.shared.AtlasRequestContextV2
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            AtlasRequestContextV2.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for AtlasRequestContextV2
             * @function getTypeUrl
             * @memberof yorha.shared.AtlasRequestContextV2
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            AtlasRequestContextV2.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.shared.AtlasRequestContextV2";
            };

            return AtlasRequestContextV2;
        })();

        shared.AtlasToolReceiptV2 = (function() {

            /**
             * Properties of an AtlasToolReceiptV2.
             * @memberof yorha.shared
             * @interface IAtlasToolReceiptV2
             * @property {string|null} [schema] AtlasToolReceiptV2 schema
             * @property {string|null} [toolCallId] AtlasToolReceiptV2 toolCallId
             * @property {string|null} [toolName] AtlasToolReceiptV2 toolName
             * @property {string|null} [runId] AtlasToolReceiptV2 runId
             * @property {string|null} [workspaceId] AtlasToolReceiptV2 workspaceId
             * @property {string|null} [workspaceRevision] AtlasToolReceiptV2 workspaceRevision
             * @property {string|null} [packetKey] AtlasToolReceiptV2 packetKey
             * @property {string|null} [packetRevision] AtlasToolReceiptV2 packetRevision
             * @property {boolean|null} [succeeded] AtlasToolReceiptV2 succeeded
             * @property {number|null} [retrievalConfidence] AtlasToolReceiptV2 retrievalConfidence
             * @property {number|null} [evidenceCount] AtlasToolReceiptV2 evidenceCount
             * @property {string|null} [validationStatus] AtlasToolReceiptV2 validationStatus
             * @property {string|null} [outputChecksum] AtlasToolReceiptV2 outputChecksum
             * @property {string|null} [errorCode] AtlasToolReceiptV2 errorCode
             * @property {boolean|null} [canonicalAuthority] AtlasToolReceiptV2 canonicalAuthority
             * @property {boolean|null} [writesPerformed] AtlasToolReceiptV2 writesPerformed
             * @property {string|null} [receiptId] AtlasToolReceiptV2 receiptId
             * @property {string|null} [receiptChecksum] AtlasToolReceiptV2 receiptChecksum
             */

            /**
             * Constructs a new AtlasToolReceiptV2.
             * @memberof yorha.shared
             * @classdesc Represents an AtlasToolReceiptV2.
             * @implements IAtlasToolReceiptV2
             * @constructor
             * @param {yorha.shared.IAtlasToolReceiptV2=} [properties] Properties to set
             */
            function AtlasToolReceiptV2(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * AtlasToolReceiptV2 schema.
             * @member {string} schema
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.schema = "";

            /**
             * AtlasToolReceiptV2 toolCallId.
             * @member {string} toolCallId
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.toolCallId = "";

            /**
             * AtlasToolReceiptV2 toolName.
             * @member {string} toolName
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.toolName = "";

            /**
             * AtlasToolReceiptV2 runId.
             * @member {string} runId
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.runId = "";

            /**
             * AtlasToolReceiptV2 workspaceId.
             * @member {string} workspaceId
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.workspaceId = "";

            /**
             * AtlasToolReceiptV2 workspaceRevision.
             * @member {string} workspaceRevision
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.workspaceRevision = "";

            /**
             * AtlasToolReceiptV2 packetKey.
             * @member {string} packetKey
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.packetKey = "";

            /**
             * AtlasToolReceiptV2 packetRevision.
             * @member {string} packetRevision
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.packetRevision = "";

            /**
             * AtlasToolReceiptV2 succeeded.
             * @member {boolean} succeeded
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.succeeded = false;

            /**
             * AtlasToolReceiptV2 retrievalConfidence.
             * @member {number|null|undefined} retrievalConfidence
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.retrievalConfidence = null;

            /**
             * AtlasToolReceiptV2 evidenceCount.
             * @member {number} evidenceCount
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.evidenceCount = 0;

            /**
             * AtlasToolReceiptV2 validationStatus.
             * @member {string} validationStatus
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.validationStatus = "";

            /**
             * AtlasToolReceiptV2 outputChecksum.
             * @member {string|null|undefined} outputChecksum
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.outputChecksum = null;

            /**
             * AtlasToolReceiptV2 errorCode.
             * @member {string|null|undefined} errorCode
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.errorCode = null;

            /**
             * AtlasToolReceiptV2 canonicalAuthority.
             * @member {boolean} canonicalAuthority
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.canonicalAuthority = false;

            /**
             * AtlasToolReceiptV2 writesPerformed.
             * @member {boolean} writesPerformed
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.writesPerformed = false;

            /**
             * AtlasToolReceiptV2 receiptId.
             * @member {string} receiptId
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.receiptId = "";

            /**
             * AtlasToolReceiptV2 receiptChecksum.
             * @member {string} receiptChecksum
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            AtlasToolReceiptV2.prototype.receiptChecksum = "";

            // OneOf field names bound to virtual getters and setters
            let $oneOfFields;

            /**
             * AtlasToolReceiptV2 _retrievalConfidence.
             * @member {"retrievalConfidence"|undefined} _retrievalConfidence
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            Object.defineProperty(AtlasToolReceiptV2.prototype, "_retrievalConfidence", {
                get: $util.oneOfGetter($oneOfFields = ["retrievalConfidence"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * AtlasToolReceiptV2 _outputChecksum.
             * @member {"outputChecksum"|undefined} _outputChecksum
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            Object.defineProperty(AtlasToolReceiptV2.prototype, "_outputChecksum", {
                get: $util.oneOfGetter($oneOfFields = ["outputChecksum"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * AtlasToolReceiptV2 _errorCode.
             * @member {"errorCode"|undefined} _errorCode
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             */
            Object.defineProperty(AtlasToolReceiptV2.prototype, "_errorCode", {
                get: $util.oneOfGetter($oneOfFields = ["errorCode"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new AtlasToolReceiptV2 instance using the specified properties.
             * @function create
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @static
             * @param {yorha.shared.IAtlasToolReceiptV2=} [properties] Properties to set
             * @returns {yorha.shared.AtlasToolReceiptV2} AtlasToolReceiptV2 instance
             */
            AtlasToolReceiptV2.create = function create(properties) {
                return new AtlasToolReceiptV2(properties);
            };

            /**
             * Encodes the specified AtlasToolReceiptV2 message. Does not implicitly {@link yorha.shared.AtlasToolReceiptV2.verify|verify} messages.
             * @function encode
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @static
             * @param {yorha.shared.IAtlasToolReceiptV2} message AtlasToolReceiptV2 message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AtlasToolReceiptV2.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.schema != null && Object.hasOwnProperty.call(message, "schema"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.schema);
                if (message.toolCallId != null && Object.hasOwnProperty.call(message, "toolCallId"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.toolCallId);
                if (message.toolName != null && Object.hasOwnProperty.call(message, "toolName"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.toolName);
                if (message.runId != null && Object.hasOwnProperty.call(message, "runId"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.runId);
                if (message.workspaceId != null && Object.hasOwnProperty.call(message, "workspaceId"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.workspaceId);
                if (message.workspaceRevision != null && Object.hasOwnProperty.call(message, "workspaceRevision"))
                    writer.uint32(/* id 6, wireType 2 =*/50).string(message.workspaceRevision);
                if (message.packetKey != null && Object.hasOwnProperty.call(message, "packetKey"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.packetKey);
                if (message.packetRevision != null && Object.hasOwnProperty.call(message, "packetRevision"))
                    writer.uint32(/* id 8, wireType 2 =*/66).string(message.packetRevision);
                if (message.succeeded != null && Object.hasOwnProperty.call(message, "succeeded"))
                    writer.uint32(/* id 9, wireType 0 =*/72).bool(message.succeeded);
                if (message.retrievalConfidence != null && Object.hasOwnProperty.call(message, "retrievalConfidence"))
                    writer.uint32(/* id 10, wireType 5 =*/85).float(message.retrievalConfidence);
                if (message.evidenceCount != null && Object.hasOwnProperty.call(message, "evidenceCount"))
                    writer.uint32(/* id 11, wireType 0 =*/88).int32(message.evidenceCount);
                if (message.validationStatus != null && Object.hasOwnProperty.call(message, "validationStatus"))
                    writer.uint32(/* id 12, wireType 2 =*/98).string(message.validationStatus);
                if (message.outputChecksum != null && Object.hasOwnProperty.call(message, "outputChecksum"))
                    writer.uint32(/* id 13, wireType 2 =*/106).string(message.outputChecksum);
                if (message.errorCode != null && Object.hasOwnProperty.call(message, "errorCode"))
                    writer.uint32(/* id 14, wireType 2 =*/114).string(message.errorCode);
                if (message.canonicalAuthority != null && Object.hasOwnProperty.call(message, "canonicalAuthority"))
                    writer.uint32(/* id 15, wireType 0 =*/120).bool(message.canonicalAuthority);
                if (message.writesPerformed != null && Object.hasOwnProperty.call(message, "writesPerformed"))
                    writer.uint32(/* id 16, wireType 0 =*/128).bool(message.writesPerformed);
                if (message.receiptId != null && Object.hasOwnProperty.call(message, "receiptId"))
                    writer.uint32(/* id 17, wireType 2 =*/138).string(message.receiptId);
                if (message.receiptChecksum != null && Object.hasOwnProperty.call(message, "receiptChecksum"))
                    writer.uint32(/* id 18, wireType 2 =*/146).string(message.receiptChecksum);
                return writer;
            };

            /**
             * Encodes the specified AtlasToolReceiptV2 message, length delimited. Does not implicitly {@link yorha.shared.AtlasToolReceiptV2.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @static
             * @param {yorha.shared.IAtlasToolReceiptV2} message AtlasToolReceiptV2 message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AtlasToolReceiptV2.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an AtlasToolReceiptV2 message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.shared.AtlasToolReceiptV2} AtlasToolReceiptV2
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AtlasToolReceiptV2.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.shared.AtlasToolReceiptV2();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.schema = reader.string();
                            break;
                        }
                    case 2: {
                            message.toolCallId = reader.string();
                            break;
                        }
                    case 3: {
                            message.toolName = reader.string();
                            break;
                        }
                    case 4: {
                            message.runId = reader.string();
                            break;
                        }
                    case 5: {
                            message.workspaceId = reader.string();
                            break;
                        }
                    case 6: {
                            message.workspaceRevision = reader.string();
                            break;
                        }
                    case 7: {
                            message.packetKey = reader.string();
                            break;
                        }
                    case 8: {
                            message.packetRevision = reader.string();
                            break;
                        }
                    case 9: {
                            message.succeeded = reader.bool();
                            break;
                        }
                    case 10: {
                            message.retrievalConfidence = reader.float();
                            break;
                        }
                    case 11: {
                            message.evidenceCount = reader.int32();
                            break;
                        }
                    case 12: {
                            message.validationStatus = reader.string();
                            break;
                        }
                    case 13: {
                            message.outputChecksum = reader.string();
                            break;
                        }
                    case 14: {
                            message.errorCode = reader.string();
                            break;
                        }
                    case 15: {
                            message.canonicalAuthority = reader.bool();
                            break;
                        }
                    case 16: {
                            message.writesPerformed = reader.bool();
                            break;
                        }
                    case 17: {
                            message.receiptId = reader.string();
                            break;
                        }
                    case 18: {
                            message.receiptChecksum = reader.string();
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
             * Decodes an AtlasToolReceiptV2 message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.shared.AtlasToolReceiptV2} AtlasToolReceiptV2
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AtlasToolReceiptV2.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an AtlasToolReceiptV2 message.
             * @function verify
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            AtlasToolReceiptV2.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                let properties = {};
                if (message.schema != null && message.hasOwnProperty("schema"))
                    if (!$util.isString(message.schema))
                        return "schema: string expected";
                if (message.toolCallId != null && message.hasOwnProperty("toolCallId"))
                    if (!$util.isString(message.toolCallId))
                        return "toolCallId: string expected";
                if (message.toolName != null && message.hasOwnProperty("toolName"))
                    if (!$util.isString(message.toolName))
                        return "toolName: string expected";
                if (message.runId != null && message.hasOwnProperty("runId"))
                    if (!$util.isString(message.runId))
                        return "runId: string expected";
                if (message.workspaceId != null && message.hasOwnProperty("workspaceId"))
                    if (!$util.isString(message.workspaceId))
                        return "workspaceId: string expected";
                if (message.workspaceRevision != null && message.hasOwnProperty("workspaceRevision"))
                    if (!$util.isString(message.workspaceRevision))
                        return "workspaceRevision: string expected";
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    if (!$util.isString(message.packetKey))
                        return "packetKey: string expected";
                if (message.packetRevision != null && message.hasOwnProperty("packetRevision"))
                    if (!$util.isString(message.packetRevision))
                        return "packetRevision: string expected";
                if (message.succeeded != null && message.hasOwnProperty("succeeded"))
                    if (typeof message.succeeded !== "boolean")
                        return "succeeded: boolean expected";
                if (message.retrievalConfidence != null && message.hasOwnProperty("retrievalConfidence")) {
                    properties._retrievalConfidence = 1;
                    if (typeof message.retrievalConfidence !== "number")
                        return "retrievalConfidence: number expected";
                }
                if (message.evidenceCount != null && message.hasOwnProperty("evidenceCount"))
                    if (!$util.isInteger(message.evidenceCount))
                        return "evidenceCount: integer expected";
                if (message.validationStatus != null && message.hasOwnProperty("validationStatus"))
                    if (!$util.isString(message.validationStatus))
                        return "validationStatus: string expected";
                if (message.outputChecksum != null && message.hasOwnProperty("outputChecksum")) {
                    properties._outputChecksum = 1;
                    if (!$util.isString(message.outputChecksum))
                        return "outputChecksum: string expected";
                }
                if (message.errorCode != null && message.hasOwnProperty("errorCode")) {
                    properties._errorCode = 1;
                    if (!$util.isString(message.errorCode))
                        return "errorCode: string expected";
                }
                if (message.canonicalAuthority != null && message.hasOwnProperty("canonicalAuthority"))
                    if (typeof message.canonicalAuthority !== "boolean")
                        return "canonicalAuthority: boolean expected";
                if (message.writesPerformed != null && message.hasOwnProperty("writesPerformed"))
                    if (typeof message.writesPerformed !== "boolean")
                        return "writesPerformed: boolean expected";
                if (message.receiptId != null && message.hasOwnProperty("receiptId"))
                    if (!$util.isString(message.receiptId))
                        return "receiptId: string expected";
                if (message.receiptChecksum != null && message.hasOwnProperty("receiptChecksum"))
                    if (!$util.isString(message.receiptChecksum))
                        return "receiptChecksum: string expected";
                return null;
            };

            /**
             * Creates an AtlasToolReceiptV2 message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.shared.AtlasToolReceiptV2} AtlasToolReceiptV2
             */
            AtlasToolReceiptV2.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.shared.AtlasToolReceiptV2)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.shared.AtlasToolReceiptV2();
                if (object.schema != null)
                    message.schema = String(object.schema);
                if (object.toolCallId != null)
                    message.toolCallId = String(object.toolCallId);
                if (object.toolName != null)
                    message.toolName = String(object.toolName);
                if (object.runId != null)
                    message.runId = String(object.runId);
                if (object.workspaceId != null)
                    message.workspaceId = String(object.workspaceId);
                if (object.workspaceRevision != null)
                    message.workspaceRevision = String(object.workspaceRevision);
                if (object.packetKey != null)
                    message.packetKey = String(object.packetKey);
                if (object.packetRevision != null)
                    message.packetRevision = String(object.packetRevision);
                if (object.succeeded != null)
                    message.succeeded = Boolean(object.succeeded);
                if (object.retrievalConfidence != null)
                    message.retrievalConfidence = Number(object.retrievalConfidence);
                if (object.evidenceCount != null)
                    message.evidenceCount = object.evidenceCount | 0;
                if (object.validationStatus != null)
                    message.validationStatus = String(object.validationStatus);
                if (object.outputChecksum != null)
                    message.outputChecksum = String(object.outputChecksum);
                if (object.errorCode != null)
                    message.errorCode = String(object.errorCode);
                if (object.canonicalAuthority != null)
                    message.canonicalAuthority = Boolean(object.canonicalAuthority);
                if (object.writesPerformed != null)
                    message.writesPerformed = Boolean(object.writesPerformed);
                if (object.receiptId != null)
                    message.receiptId = String(object.receiptId);
                if (object.receiptChecksum != null)
                    message.receiptChecksum = String(object.receiptChecksum);
                return message;
            };

            /**
             * Creates a plain object from an AtlasToolReceiptV2 message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @static
             * @param {yorha.shared.AtlasToolReceiptV2} message AtlasToolReceiptV2
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            AtlasToolReceiptV2.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.schema = "";
                    object.toolCallId = "";
                    object.toolName = "";
                    object.runId = "";
                    object.workspaceId = "";
                    object.workspaceRevision = "";
                    object.packetKey = "";
                    object.packetRevision = "";
                    object.succeeded = false;
                    object.evidenceCount = 0;
                    object.validationStatus = "";
                    object.canonicalAuthority = false;
                    object.writesPerformed = false;
                    object.receiptId = "";
                    object.receiptChecksum = "";
                }
                if (message.schema != null && message.hasOwnProperty("schema"))
                    object.schema = message.schema;
                if (message.toolCallId != null && message.hasOwnProperty("toolCallId"))
                    object.toolCallId = message.toolCallId;
                if (message.toolName != null && message.hasOwnProperty("toolName"))
                    object.toolName = message.toolName;
                if (message.runId != null && message.hasOwnProperty("runId"))
                    object.runId = message.runId;
                if (message.workspaceId != null && message.hasOwnProperty("workspaceId"))
                    object.workspaceId = message.workspaceId;
                if (message.workspaceRevision != null && message.hasOwnProperty("workspaceRevision"))
                    object.workspaceRevision = message.workspaceRevision;
                if (message.packetKey != null && message.hasOwnProperty("packetKey"))
                    object.packetKey = message.packetKey;
                if (message.packetRevision != null && message.hasOwnProperty("packetRevision"))
                    object.packetRevision = message.packetRevision;
                if (message.succeeded != null && message.hasOwnProperty("succeeded"))
                    object.succeeded = message.succeeded;
                if (message.retrievalConfidence != null && message.hasOwnProperty("retrievalConfidence")) {
                    object.retrievalConfidence = options.json && !isFinite(message.retrievalConfidence) ? String(message.retrievalConfidence) : message.retrievalConfidence;
                    if (options.oneofs)
                        object._retrievalConfidence = "retrievalConfidence";
                }
                if (message.evidenceCount != null && message.hasOwnProperty("evidenceCount"))
                    object.evidenceCount = message.evidenceCount;
                if (message.validationStatus != null && message.hasOwnProperty("validationStatus"))
                    object.validationStatus = message.validationStatus;
                if (message.outputChecksum != null && message.hasOwnProperty("outputChecksum")) {
                    object.outputChecksum = message.outputChecksum;
                    if (options.oneofs)
                        object._outputChecksum = "outputChecksum";
                }
                if (message.errorCode != null && message.hasOwnProperty("errorCode")) {
                    object.errorCode = message.errorCode;
                    if (options.oneofs)
                        object._errorCode = "errorCode";
                }
                if (message.canonicalAuthority != null && message.hasOwnProperty("canonicalAuthority"))
                    object.canonicalAuthority = message.canonicalAuthority;
                if (message.writesPerformed != null && message.hasOwnProperty("writesPerformed"))
                    object.writesPerformed = message.writesPerformed;
                if (message.receiptId != null && message.hasOwnProperty("receiptId"))
                    object.receiptId = message.receiptId;
                if (message.receiptChecksum != null && message.hasOwnProperty("receiptChecksum"))
                    object.receiptChecksum = message.receiptChecksum;
                return object;
            };

            /**
             * Converts this AtlasToolReceiptV2 to JSON.
             * @function toJSON
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            AtlasToolReceiptV2.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for AtlasToolReceiptV2
             * @function getTypeUrl
             * @memberof yorha.shared.AtlasToolReceiptV2
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            AtlasToolReceiptV2.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.shared.AtlasToolReceiptV2";
            };

            return AtlasToolReceiptV2;
        })();

        shared.ArtifactRef = (function() {

            /**
             * Properties of an ArtifactRef.
             * @memberof yorha.shared
             * @interface IArtifactRef
             * @property {string|null} [runId] ArtifactRef runId
             * @property {string|null} [relativePath] ArtifactRef relativePath
             * @property {string|null} [format] ArtifactRef format
             * @property {number|Long|null} [sizeBytes] ArtifactRef sizeBytes
             * @property {string|null} [contentHash] ArtifactRef contentHash
             * @property {number|Long|null} [createdAtUnix] ArtifactRef createdAtUnix
             */

            /**
             * Constructs a new ArtifactRef.
             * @memberof yorha.shared
             * @classdesc Represents an ArtifactRef.
             * @implements IArtifactRef
             * @constructor
             * @param {yorha.shared.IArtifactRef=} [properties] Properties to set
             */
            function ArtifactRef(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ArtifactRef runId.
             * @member {string} runId
             * @memberof yorha.shared.ArtifactRef
             * @instance
             */
            ArtifactRef.prototype.runId = "";

            /**
             * ArtifactRef relativePath.
             * @member {string} relativePath
             * @memberof yorha.shared.ArtifactRef
             * @instance
             */
            ArtifactRef.prototype.relativePath = "";

            /**
             * ArtifactRef format.
             * @member {string} format
             * @memberof yorha.shared.ArtifactRef
             * @instance
             */
            ArtifactRef.prototype.format = "";

            /**
             * ArtifactRef sizeBytes.
             * @member {number|Long} sizeBytes
             * @memberof yorha.shared.ArtifactRef
             * @instance
             */
            ArtifactRef.prototype.sizeBytes = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * ArtifactRef contentHash.
             * @member {string} contentHash
             * @memberof yorha.shared.ArtifactRef
             * @instance
             */
            ArtifactRef.prototype.contentHash = "";

            /**
             * ArtifactRef createdAtUnix.
             * @member {number|Long} createdAtUnix
             * @memberof yorha.shared.ArtifactRef
             * @instance
             */
            ArtifactRef.prototype.createdAtUnix = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Creates a new ArtifactRef instance using the specified properties.
             * @function create
             * @memberof yorha.shared.ArtifactRef
             * @static
             * @param {yorha.shared.IArtifactRef=} [properties] Properties to set
             * @returns {yorha.shared.ArtifactRef} ArtifactRef instance
             */
            ArtifactRef.create = function create(properties) {
                return new ArtifactRef(properties);
            };

            /**
             * Encodes the specified ArtifactRef message. Does not implicitly {@link yorha.shared.ArtifactRef.verify|verify} messages.
             * @function encode
             * @memberof yorha.shared.ArtifactRef
             * @static
             * @param {yorha.shared.IArtifactRef} message ArtifactRef message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ArtifactRef.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.runId != null && Object.hasOwnProperty.call(message, "runId"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.runId);
                if (message.relativePath != null && Object.hasOwnProperty.call(message, "relativePath"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.relativePath);
                if (message.format != null && Object.hasOwnProperty.call(message, "format"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.format);
                if (message.sizeBytes != null && Object.hasOwnProperty.call(message, "sizeBytes"))
                    writer.uint32(/* id 4, wireType 0 =*/32).int64(message.sizeBytes);
                if (message.contentHash != null && Object.hasOwnProperty.call(message, "contentHash"))
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.contentHash);
                if (message.createdAtUnix != null && Object.hasOwnProperty.call(message, "createdAtUnix"))
                    writer.uint32(/* id 6, wireType 0 =*/48).int64(message.createdAtUnix);
                return writer;
            };

            /**
             * Encodes the specified ArtifactRef message, length delimited. Does not implicitly {@link yorha.shared.ArtifactRef.verify|verify} messages.
             * @function encodeDelimited
             * @memberof yorha.shared.ArtifactRef
             * @static
             * @param {yorha.shared.IArtifactRef} message ArtifactRef message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ArtifactRef.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an ArtifactRef message from the specified reader or buffer.
             * @function decode
             * @memberof yorha.shared.ArtifactRef
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {yorha.shared.ArtifactRef} ArtifactRef
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ArtifactRef.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.yorha.shared.ArtifactRef();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.runId = reader.string();
                            break;
                        }
                    case 2: {
                            message.relativePath = reader.string();
                            break;
                        }
                    case 3: {
                            message.format = reader.string();
                            break;
                        }
                    case 4: {
                            message.sizeBytes = reader.int64();
                            break;
                        }
                    case 5: {
                            message.contentHash = reader.string();
                            break;
                        }
                    case 6: {
                            message.createdAtUnix = reader.int64();
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
             * Decodes an ArtifactRef message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof yorha.shared.ArtifactRef
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {yorha.shared.ArtifactRef} ArtifactRef
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ArtifactRef.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an ArtifactRef message.
             * @function verify
             * @memberof yorha.shared.ArtifactRef
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ArtifactRef.verify = function verify(message, long) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    return "maximum nesting depth exceeded";
                if (message.runId != null && message.hasOwnProperty("runId"))
                    if (!$util.isString(message.runId))
                        return "runId: string expected";
                if (message.relativePath != null && message.hasOwnProperty("relativePath"))
                    if (!$util.isString(message.relativePath))
                        return "relativePath: string expected";
                if (message.format != null && message.hasOwnProperty("format"))
                    if (!$util.isString(message.format))
                        return "format: string expected";
                if (message.sizeBytes != null && message.hasOwnProperty("sizeBytes"))
                    if (!$util.isInteger(message.sizeBytes) && !(message.sizeBytes && $util.isInteger(message.sizeBytes.low) && $util.isInteger(message.sizeBytes.high)))
                        return "sizeBytes: integer|Long expected";
                if (message.contentHash != null && message.hasOwnProperty("contentHash"))
                    if (!$util.isString(message.contentHash))
                        return "contentHash: string expected";
                if (message.createdAtUnix != null && message.hasOwnProperty("createdAtUnix"))
                    if (!$util.isInteger(message.createdAtUnix) && !(message.createdAtUnix && $util.isInteger(message.createdAtUnix.low) && $util.isInteger(message.createdAtUnix.high)))
                        return "createdAtUnix: integer|Long expected";
                return null;
            };

            /**
             * Creates an ArtifactRef message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof yorha.shared.ArtifactRef
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {yorha.shared.ArtifactRef} ArtifactRef
             */
            ArtifactRef.fromObject = function fromObject(object, long) {
                if (object instanceof $root.yorha.shared.ArtifactRef)
                    return object;
                if (long === undefined)
                    long = 0;
                if (long > $util.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let message = new $root.yorha.shared.ArtifactRef();
                if (object.runId != null)
                    message.runId = String(object.runId);
                if (object.relativePath != null)
                    message.relativePath = String(object.relativePath);
                if (object.format != null)
                    message.format = String(object.format);
                if (object.sizeBytes != null)
                    if ($util.Long)
                        message.sizeBytes = $util.Long.fromValue(object.sizeBytes, false);
                    else if (typeof object.sizeBytes === "string")
                        message.sizeBytes = parseInt(object.sizeBytes, 10);
                    else if (typeof object.sizeBytes === "number")
                        message.sizeBytes = object.sizeBytes;
                    else if (typeof object.sizeBytes === "object")
                        message.sizeBytes = new $util.LongBits(object.sizeBytes.low >>> 0, object.sizeBytes.high >>> 0).toNumber();
                if (object.contentHash != null)
                    message.contentHash = String(object.contentHash);
                if (object.createdAtUnix != null)
                    if ($util.Long)
                        message.createdAtUnix = $util.Long.fromValue(object.createdAtUnix, false);
                    else if (typeof object.createdAtUnix === "string")
                        message.createdAtUnix = parseInt(object.createdAtUnix, 10);
                    else if (typeof object.createdAtUnix === "number")
                        message.createdAtUnix = object.createdAtUnix;
                    else if (typeof object.createdAtUnix === "object")
                        message.createdAtUnix = new $util.LongBits(object.createdAtUnix.low >>> 0, object.createdAtUnix.high >>> 0).toNumber();
                return message;
            };

            /**
             * Creates a plain object from an ArtifactRef message. Also converts values to other types if specified.
             * @function toObject
             * @memberof yorha.shared.ArtifactRef
             * @static
             * @param {yorha.shared.ArtifactRef} message ArtifactRef
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ArtifactRef.toObject = function toObject(message, options, q) {
                if (!options)
                    options = {};
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.runId = "";
                    object.relativePath = "";
                    object.format = "";
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.sizeBytes = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : typeof BigInt !== "undefined" && options.longs === BigInt ? long.toBigInt() : long;
                    } else
                        object.sizeBytes = options.longs === String ? "0" : typeof BigInt !== "undefined" && options.longs === BigInt ? BigInt("0") : 0;
                    object.contentHash = "";
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.createdAtUnix = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : typeof BigInt !== "undefined" && options.longs === BigInt ? long.toBigInt() : long;
                    } else
                        object.createdAtUnix = options.longs === String ? "0" : typeof BigInt !== "undefined" && options.longs === BigInt ? BigInt("0") : 0;
                }
                if (message.runId != null && message.hasOwnProperty("runId"))
                    object.runId = message.runId;
                if (message.relativePath != null && message.hasOwnProperty("relativePath"))
                    object.relativePath = message.relativePath;
                if (message.format != null && message.hasOwnProperty("format"))
                    object.format = message.format;
                if (message.sizeBytes != null && message.hasOwnProperty("sizeBytes"))
                    if (typeof BigInt !== "undefined" && options.longs === BigInt)
                        object.sizeBytes = typeof message.sizeBytes === "number" ? BigInt(message.sizeBytes) : $util.Long.fromBits(message.sizeBytes.low >>> 0, message.sizeBytes.high >>> 0, false).toBigInt();
                    else if (typeof message.sizeBytes === "number")
                        object.sizeBytes = options.longs === String ? String(message.sizeBytes) : message.sizeBytes;
                    else
                        object.sizeBytes = options.longs === String ? $util.Long.prototype.toString.call(message.sizeBytes) : options.longs === Number ? new $util.LongBits(message.sizeBytes.low >>> 0, message.sizeBytes.high >>> 0).toNumber() : message.sizeBytes;
                if (message.contentHash != null && message.hasOwnProperty("contentHash"))
                    object.contentHash = message.contentHash;
                if (message.createdAtUnix != null && message.hasOwnProperty("createdAtUnix"))
                    if (typeof BigInt !== "undefined" && options.longs === BigInt)
                        object.createdAtUnix = typeof message.createdAtUnix === "number" ? BigInt(message.createdAtUnix) : $util.Long.fromBits(message.createdAtUnix.low >>> 0, message.createdAtUnix.high >>> 0, false).toBigInt();
                    else if (typeof message.createdAtUnix === "number")
                        object.createdAtUnix = options.longs === String ? String(message.createdAtUnix) : message.createdAtUnix;
                    else
                        object.createdAtUnix = options.longs === String ? $util.Long.prototype.toString.call(message.createdAtUnix) : options.longs === Number ? new $util.LongBits(message.createdAtUnix.low >>> 0, message.createdAtUnix.high >>> 0).toNumber() : message.createdAtUnix;
                return object;
            };

            /**
             * Converts this ArtifactRef to JSON.
             * @function toJSON
             * @memberof yorha.shared.ArtifactRef
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ArtifactRef.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ArtifactRef
             * @function getTypeUrl
             * @memberof yorha.shared.ArtifactRef
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ArtifactRef.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/yorha.shared.ArtifactRef";
            };

            return ArtifactRef;
        })();

        return shared;
    })();

    return yorha;
})();

export { $root as default };
