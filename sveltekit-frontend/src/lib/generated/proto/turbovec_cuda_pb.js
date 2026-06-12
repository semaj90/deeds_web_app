/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const turbovec = $root.turbovec = (() => {

    /**
     * Namespace turbovec.
     * @exports turbovec
     * @namespace
     */
    const turbovec = {};

    turbovec.TurboVecCudaService = (function() {

        /**
         * Constructs a new TurboVecCudaService service.
         * @memberof turbovec
         * @classdesc Represents a TurboVecCudaService
         * @extends $protobuf.rpc.Service
         * @constructor
         * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
         * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
         * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
         */
        function TurboVecCudaService(rpcImpl, requestDelimited, responseDelimited) {
            $protobuf.rpc.Service.call(this, rpcImpl, requestDelimited, responseDelimited);
        }

        (TurboVecCudaService.prototype = Object.create($protobuf.rpc.Service.prototype)).constructor = TurboVecCudaService;

        /**
         * Callback as used by {@link turbovec.TurboVecCudaService#search}.
         * @memberof turbovec.TurboVecCudaService
         * @typedef SearchCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {turbovec.TurboSearchResponse} [response] TurboSearchResponse
         */

        /**
         * Calls Search.
         * @function search
         * @memberof turbovec.TurboVecCudaService
         * @instance
         * @param {turbovec.ITurboSearchRequest} request TurboSearchRequest message or plain object
         * @param {turbovec.TurboVecCudaService.SearchCallback} callback Node-style callback called with the error, if any, and TurboSearchResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(TurboVecCudaService.prototype.search = function search(request, callback) {
            return this.rpcCall(search, $root.turbovec.TurboSearchRequest, $root.turbovec.TurboSearchResponse, request, callback);
        }, "name", { value: "Search" });

        /**
         * Calls Search.
         * @function search
         * @memberof turbovec.TurboVecCudaService
         * @instance
         * @param {turbovec.ITurboSearchRequest} request TurboSearchRequest message or plain object
         * @returns {Promise<turbovec.TurboSearchResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link turbovec.TurboVecCudaService#transform}.
         * @memberof turbovec.TurboVecCudaService
         * @typedef TransformCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {turbovec.TransformResponse} [response] TransformResponse
         */

        /**
         * Calls Transform.
         * @function transform
         * @memberof turbovec.TurboVecCudaService
         * @instance
         * @param {turbovec.ITransformRequest} request TransformRequest message or plain object
         * @param {turbovec.TurboVecCudaService.TransformCallback} callback Node-style callback called with the error, if any, and TransformResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(TurboVecCudaService.prototype.transform = function transform(request, callback) {
            return this.rpcCall(transform, $root.turbovec.TransformRequest, $root.turbovec.TransformResponse, request, callback);
        }, "name", { value: "Transform" });

        /**
         * Calls Transform.
         * @function transform
         * @memberof turbovec.TurboVecCudaService
         * @instance
         * @param {turbovec.ITransformRequest} request TransformRequest message or plain object
         * @returns {Promise<turbovec.TransformResponse>} Promise
         * @variation 2
         */

        return TurboVecCudaService;
    })();

    turbovec.TurboSearchRequest = (function() {

        /**
         * Properties of a TurboSearchRequest.
         * @memberof turbovec
         * @interface ITurboSearchRequest
         * @property {Array.<number>|null} [queryVector] TurboSearchRequest queryVector
         * @property {number|null} [topK] TurboSearchRequest topK
         * @property {Array.<number>|null} [quaternionRot] TurboSearchRequest quaternionRot
         */

        /**
         * Constructs a new TurboSearchRequest.
         * @memberof turbovec
         * @classdesc Represents a TurboSearchRequest.
         * @implements ITurboSearchRequest
         * @constructor
         * @param {turbovec.ITurboSearchRequest=} [properties] Properties to set
         */
        function TurboSearchRequest(properties) {
            this.queryVector = [];
            this.quaternionRot = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TurboSearchRequest queryVector.
         * @member {Array.<number>} queryVector
         * @memberof turbovec.TurboSearchRequest
         * @instance
         */
        TurboSearchRequest.prototype.queryVector = $util.emptyArray;

        /**
         * TurboSearchRequest topK.
         * @member {number} topK
         * @memberof turbovec.TurboSearchRequest
         * @instance
         */
        TurboSearchRequest.prototype.topK = 0;

        /**
         * TurboSearchRequest quaternionRot.
         * @member {Array.<number>} quaternionRot
         * @memberof turbovec.TurboSearchRequest
         * @instance
         */
        TurboSearchRequest.prototype.quaternionRot = $util.emptyArray;

        /**
         * Encodes the specified TurboSearchRequest message. Does not implicitly {@link turbovec.TurboSearchRequest.verify|verify} messages.
         * @function encode
         * @memberof turbovec.TurboSearchRequest
         * @static
         * @param {turbovec.ITurboSearchRequest} message TurboSearchRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TurboSearchRequest.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.queryVector != null && message.queryVector.length) {
                writer.uint32(/* id 1, wireType 2 =*/10).fork();
                for (let i = 0; i < message.queryVector.length; ++i)
                    writer.float(message.queryVector[i]);
                writer.ldelim();
            }
            if (message.topK != null && Object.hasOwnProperty.call(message, "topK"))
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.topK);
            if (message.quaternionRot != null && message.quaternionRot.length) {
                writer.uint32(/* id 3, wireType 2 =*/26).fork();
                for (let i = 0; i < message.quaternionRot.length; ++i)
                    writer.float(message.quaternionRot[i]);
                writer.ldelim();
            }
            return writer;
        };

        /**
         * Encodes the specified TurboSearchRequest message, length delimited. Does not implicitly {@link turbovec.TurboSearchRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof turbovec.TurboSearchRequest
         * @static
         * @param {turbovec.ITurboSearchRequest} message TurboSearchRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TurboSearchRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a TurboSearchRequest message from the specified reader or buffer.
         * @function decode
         * @memberof turbovec.TurboSearchRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {turbovec.TurboSearchRequest} TurboSearchRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TurboSearchRequest.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.turbovec.TurboSearchRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.queryVector && message.queryVector.length))
                            message.queryVector = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.queryVector.push(reader.float());
                        } else
                            message.queryVector.push(reader.float());
                        break;
                    }
                case 2: {
                        message.topK = reader.int32();
                        break;
                    }
                case 3: {
                        if (!(message.quaternionRot && message.quaternionRot.length))
                            message.quaternionRot = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.quaternionRot.push(reader.float());
                        } else
                            message.quaternionRot.push(reader.float());
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
         * Decodes a TurboSearchRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof turbovec.TurboSearchRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {turbovec.TurboSearchRequest} TurboSearchRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TurboSearchRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for TurboSearchRequest
         * @function getTypeUrl
         * @memberof turbovec.TurboSearchRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TurboSearchRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/turbovec.TurboSearchRequest";
        };

        return TurboSearchRequest;
    })();

    turbovec.TurboSearchResponse = (function() {

        /**
         * Properties of a TurboSearchResponse.
         * @memberof turbovec
         * @interface ITurboSearchResponse
         * @property {Array.<turbovec.TurboSearchResponse.ICandidate>|null} [candidates] TurboSearchResponse candidates
         * @property {string|null} [backend] TurboSearchResponse backend
         */

        /**
         * Constructs a new TurboSearchResponse.
         * @memberof turbovec
         * @classdesc Represents a TurboSearchResponse.
         * @implements ITurboSearchResponse
         * @constructor
         * @param {turbovec.ITurboSearchResponse=} [properties] Properties to set
         */
        function TurboSearchResponse(properties) {
            this.candidates = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TurboSearchResponse candidates.
         * @member {Array.<turbovec.TurboSearchResponse.ICandidate>} candidates
         * @memberof turbovec.TurboSearchResponse
         * @instance
         */
        TurboSearchResponse.prototype.candidates = $util.emptyArray;

        /**
         * TurboSearchResponse backend.
         * @member {string} backend
         * @memberof turbovec.TurboSearchResponse
         * @instance
         */
        TurboSearchResponse.prototype.backend = "";

        /**
         * Encodes the specified TurboSearchResponse message. Does not implicitly {@link turbovec.TurboSearchResponse.verify|verify} messages.
         * @function encode
         * @memberof turbovec.TurboSearchResponse
         * @static
         * @param {turbovec.ITurboSearchResponse} message TurboSearchResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TurboSearchResponse.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.candidates != null && message.candidates.length)
                for (let i = 0; i < message.candidates.length; ++i)
                    $root.turbovec.TurboSearchResponse.Candidate.encode(message.candidates[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), q + 1).ldelim();
            if (message.backend != null && Object.hasOwnProperty.call(message, "backend"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.backend);
            return writer;
        };

        /**
         * Encodes the specified TurboSearchResponse message, length delimited. Does not implicitly {@link turbovec.TurboSearchResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof turbovec.TurboSearchResponse
         * @static
         * @param {turbovec.ITurboSearchResponse} message TurboSearchResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TurboSearchResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a TurboSearchResponse message from the specified reader or buffer.
         * @function decode
         * @memberof turbovec.TurboSearchResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {turbovec.TurboSearchResponse} TurboSearchResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TurboSearchResponse.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.turbovec.TurboSearchResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.candidates && message.candidates.length))
                            message.candidates = [];
                        message.candidates.push($root.turbovec.TurboSearchResponse.Candidate.decode(reader, reader.uint32(), undefined, long + 1));
                        break;
                    }
                case 2: {
                        message.backend = reader.string();
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
         * Decodes a TurboSearchResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof turbovec.TurboSearchResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {turbovec.TurboSearchResponse} TurboSearchResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TurboSearchResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for TurboSearchResponse
         * @function getTypeUrl
         * @memberof turbovec.TurboSearchResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TurboSearchResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/turbovec.TurboSearchResponse";
        };

        TurboSearchResponse.Candidate = (function() {

            /**
             * Properties of a Candidate.
             * @memberof turbovec.TurboSearchResponse
             * @interface ICandidate
             * @property {string|null} [id] Candidate id
             * @property {number|null} [score] Candidate score
             * @property {number|null} [clusterId] Candidate clusterId
             */

            /**
             * Constructs a new Candidate.
             * @memberof turbovec.TurboSearchResponse
             * @classdesc Represents a Candidate.
             * @implements ICandidate
             * @constructor
             * @param {turbovec.TurboSearchResponse.ICandidate=} [properties] Properties to set
             */
            function Candidate(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * Candidate id.
             * @member {string} id
             * @memberof turbovec.TurboSearchResponse.Candidate
             * @instance
             */
            Candidate.prototype.id = "";

            /**
             * Candidate score.
             * @member {number} score
             * @memberof turbovec.TurboSearchResponse.Candidate
             * @instance
             */
            Candidate.prototype.score = 0;

            /**
             * Candidate clusterId.
             * @member {number} clusterId
             * @memberof turbovec.TurboSearchResponse.Candidate
             * @instance
             */
            Candidate.prototype.clusterId = 0;

            /**
             * Encodes the specified Candidate message. Does not implicitly {@link turbovec.TurboSearchResponse.Candidate.verify|verify} messages.
             * @function encode
             * @memberof turbovec.TurboSearchResponse.Candidate
             * @static
             * @param {turbovec.TurboSearchResponse.ICandidate} message Candidate message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Candidate.encode = function encode(message, writer, q) {
                if (!writer)
                    writer = $Writer.create();
                if (q === undefined)
                    q = 0;
                if (q > $util.recursionLimit)
                    throw Error("max depth exceeded");
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                if (message.score != null && Object.hasOwnProperty.call(message, "score"))
                    writer.uint32(/* id 2, wireType 5 =*/21).float(message.score);
                if (message.clusterId != null && Object.hasOwnProperty.call(message, "clusterId"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.clusterId);
                return writer;
            };

            /**
             * Encodes the specified Candidate message, length delimited. Does not implicitly {@link turbovec.TurboSearchResponse.Candidate.verify|verify} messages.
             * @function encodeDelimited
             * @memberof turbovec.TurboSearchResponse.Candidate
             * @static
             * @param {turbovec.TurboSearchResponse.ICandidate} message Candidate message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Candidate.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a Candidate message from the specified reader or buffer.
             * @function decode
             * @memberof turbovec.TurboSearchResponse.Candidate
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {turbovec.TurboSearchResponse.Candidate} Candidate
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Candidate.decode = function decode(reader, length, error, long) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (long === undefined)
                    long = 0;
                if (long > $Reader.recursionLimit)
                    throw Error("maximum nesting depth exceeded");
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.turbovec.TurboSearchResponse.Candidate();
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
                            message.score = reader.float();
                            break;
                        }
                    case 3: {
                            message.clusterId = reader.int32();
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
             * Decodes a Candidate message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof turbovec.TurboSearchResponse.Candidate
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {turbovec.TurboSearchResponse.Candidate} Candidate
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Candidate.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Gets the default type url for Candidate
             * @function getTypeUrl
             * @memberof turbovec.TurboSearchResponse.Candidate
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            Candidate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/turbovec.TurboSearchResponse.Candidate";
            };

            return Candidate;
        })();

        return TurboSearchResponse;
    })();

    turbovec.TransformRequest = (function() {

        /**
         * Properties of a TransformRequest.
         * @memberof turbovec
         * @interface ITransformRequest
         * @property {Array.<number>|null} [vectors] TransformRequest vectors
         * @property {Array.<number>|null} [quaternionRot] TransformRequest quaternionRot
         */

        /**
         * Constructs a new TransformRequest.
         * @memberof turbovec
         * @classdesc Represents a TransformRequest.
         * @implements ITransformRequest
         * @constructor
         * @param {turbovec.ITransformRequest=} [properties] Properties to set
         */
        function TransformRequest(properties) {
            this.vectors = [];
            this.quaternionRot = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TransformRequest vectors.
         * @member {Array.<number>} vectors
         * @memberof turbovec.TransformRequest
         * @instance
         */
        TransformRequest.prototype.vectors = $util.emptyArray;

        /**
         * TransformRequest quaternionRot.
         * @member {Array.<number>} quaternionRot
         * @memberof turbovec.TransformRequest
         * @instance
         */
        TransformRequest.prototype.quaternionRot = $util.emptyArray;

        /**
         * Encodes the specified TransformRequest message. Does not implicitly {@link turbovec.TransformRequest.verify|verify} messages.
         * @function encode
         * @memberof turbovec.TransformRequest
         * @static
         * @param {turbovec.ITransformRequest} message TransformRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TransformRequest.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.vectors != null && message.vectors.length) {
                writer.uint32(/* id 1, wireType 2 =*/10).fork();
                for (let i = 0; i < message.vectors.length; ++i)
                    writer.float(message.vectors[i]);
                writer.ldelim();
            }
            if (message.quaternionRot != null && message.quaternionRot.length) {
                writer.uint32(/* id 2, wireType 2 =*/18).fork();
                for (let i = 0; i < message.quaternionRot.length; ++i)
                    writer.float(message.quaternionRot[i]);
                writer.ldelim();
            }
            return writer;
        };

        /**
         * Encodes the specified TransformRequest message, length delimited. Does not implicitly {@link turbovec.TransformRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof turbovec.TransformRequest
         * @static
         * @param {turbovec.ITransformRequest} message TransformRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TransformRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a TransformRequest message from the specified reader or buffer.
         * @function decode
         * @memberof turbovec.TransformRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {turbovec.TransformRequest} TransformRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TransformRequest.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.turbovec.TransformRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.vectors && message.vectors.length))
                            message.vectors = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.vectors.push(reader.float());
                        } else
                            message.vectors.push(reader.float());
                        break;
                    }
                case 2: {
                        if (!(message.quaternionRot && message.quaternionRot.length))
                            message.quaternionRot = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.quaternionRot.push(reader.float());
                        } else
                            message.quaternionRot.push(reader.float());
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
         * Decodes a TransformRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof turbovec.TransformRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {turbovec.TransformRequest} TransformRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TransformRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for TransformRequest
         * @function getTypeUrl
         * @memberof turbovec.TransformRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TransformRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/turbovec.TransformRequest";
        };

        return TransformRequest;
    })();

    turbovec.TransformResponse = (function() {

        /**
         * Properties of a TransformResponse.
         * @memberof turbovec
         * @interface ITransformResponse
         * @property {Array.<number>|null} [projectedVectors] TransformResponse projectedVectors
         */

        /**
         * Constructs a new TransformResponse.
         * @memberof turbovec
         * @classdesc Represents a TransformResponse.
         * @implements ITransformResponse
         * @constructor
         * @param {turbovec.ITransformResponse=} [properties] Properties to set
         */
        function TransformResponse(properties) {
            this.projectedVectors = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TransformResponse projectedVectors.
         * @member {Array.<number>} projectedVectors
         * @memberof turbovec.TransformResponse
         * @instance
         */
        TransformResponse.prototype.projectedVectors = $util.emptyArray;

        /**
         * Encodes the specified TransformResponse message. Does not implicitly {@link turbovec.TransformResponse.verify|verify} messages.
         * @function encode
         * @memberof turbovec.TransformResponse
         * @static
         * @param {turbovec.ITransformResponse} message TransformResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TransformResponse.encode = function encode(message, writer, q) {
            if (!writer)
                writer = $Writer.create();
            if (q === undefined)
                q = 0;
            if (q > $util.recursionLimit)
                throw Error("max depth exceeded");
            if (message.projectedVectors != null && message.projectedVectors.length) {
                writer.uint32(/* id 1, wireType 2 =*/10).fork();
                for (let i = 0; i < message.projectedVectors.length; ++i)
                    writer.float(message.projectedVectors[i]);
                writer.ldelim();
            }
            return writer;
        };

        /**
         * Encodes the specified TransformResponse message, length delimited. Does not implicitly {@link turbovec.TransformResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof turbovec.TransformResponse
         * @static
         * @param {turbovec.ITransformResponse} message TransformResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TransformResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a TransformResponse message from the specified reader or buffer.
         * @function decode
         * @memberof turbovec.TransformResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {turbovec.TransformResponse} TransformResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TransformResponse.decode = function decode(reader, length, error, long) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (long === undefined)
                long = 0;
            if (long > $Reader.recursionLimit)
                throw Error("maximum nesting depth exceeded");
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.turbovec.TransformResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.projectedVectors && message.projectedVectors.length))
                            message.projectedVectors = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.projectedVectors.push(reader.float());
                        } else
                            message.projectedVectors.push(reader.float());
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
         * Decodes a TransformResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof turbovec.TransformResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {turbovec.TransformResponse} TransformResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TransformResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for TransformResponse
         * @function getTypeUrl
         * @memberof turbovec.TransformResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TransformResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/turbovec.TransformResponse";
        };

        return TransformResponse;
    })();

    return turbovec;
})();

export { $root as default };
