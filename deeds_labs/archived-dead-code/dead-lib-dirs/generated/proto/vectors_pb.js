/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const cyber_elephant = $root.cyber_elephant = (() => {

    /**
     * Namespace cyber_elephant.
     * @exports cyber_elephant
     * @namespace
     */
    const cyber_elephant = {};

    cyber_elephant.DocumentVector = (function() {

        /**
         * Properties of a DocumentVector.
         * @memberof cyber_elephant
         * @interface IDocumentVector
         * @property {string|null} [id] DocumentVector id
         * @property {string|null} [title] DocumentVector title
         * @property {string|null} [contentSnippet] DocumentVector contentSnippet
         * @property {Array.<number>|null} [embedding] DocumentVector embedding
         * @property {cyber_elephant.IProjectedPoint|null} [projected_3d] DocumentVector projected_3d
         * @property {string|null} [documentType] DocumentVector documentType
         * @property {Object.<string,string>|null} [metadata] DocumentVector metadata
         */

        /**
         * Constructs a new DocumentVector.
         * @memberof cyber_elephant
         * @classdesc Represents a DocumentVector.
         * @implements IDocumentVector
         * @constructor
         * @param {cyber_elephant.IDocumentVector=} [properties] Properties to set
         */
        function DocumentVector(properties) {
            this.embedding = [];
            this.metadata = {};
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * DocumentVector id.
         * @member {string} id
         * @memberof cyber_elephant.DocumentVector
         * @instance
         */
        DocumentVector.prototype.id = "";

        /**
         * DocumentVector title.
         * @member {string} title
         * @memberof cyber_elephant.DocumentVector
         * @instance
         */
        DocumentVector.prototype.title = "";

        /**
         * DocumentVector contentSnippet.
         * @member {string} contentSnippet
         * @memberof cyber_elephant.DocumentVector
         * @instance
         */
        DocumentVector.prototype.contentSnippet = "";

        /**
         * DocumentVector embedding.
         * @member {Array.<number>} embedding
         * @memberof cyber_elephant.DocumentVector
         * @instance
         */
        DocumentVector.prototype.embedding = $util.emptyArray;

        /**
         * DocumentVector projected_3d.
         * @member {cyber_elephant.IProjectedPoint|null|undefined} projected_3d
         * @memberof cyber_elephant.DocumentVector
         * @instance
         */
        DocumentVector.prototype.projected_3d = null;

        /**
         * DocumentVector documentType.
         * @member {string} documentType
         * @memberof cyber_elephant.DocumentVector
         * @instance
         */
        DocumentVector.prototype.documentType = "";

        /**
         * DocumentVector metadata.
         * @member {Object.<string,string>} metadata
         * @memberof cyber_elephant.DocumentVector
         * @instance
         */
        DocumentVector.prototype.metadata = $util.emptyObject;

        /**
         * Encodes the specified DocumentVector message. Does not implicitly {@link cyber_elephant.DocumentVector.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.DocumentVector
         * @static
         * @param {cyber_elephant.IDocumentVector} message DocumentVector message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DocumentVector.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            if (message.title != null && Object.hasOwnProperty.call(message, "title"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.title);
            if (message.contentSnippet != null && Object.hasOwnProperty.call(message, "contentSnippet"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.contentSnippet);
            if (message.embedding != null && message.embedding.length) {
                writer.uint32(/* id 4, wireType 2 =*/34).fork();
                for (let i = 0; i < message.embedding.length; ++i)
                    writer.float(message.embedding[i]);
                writer.ldelim();
            }
            if (message.projected_3d != null && Object.hasOwnProperty.call(message, "projected_3d"))
                $root.cyber_elephant.ProjectedPoint.encode(message.projected_3d, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
            if (message.documentType != null && Object.hasOwnProperty.call(message, "documentType"))
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.documentType);
            if (message.metadata != null && Object.hasOwnProperty.call(message, "metadata"))
                for (let keys = Object.keys(message.metadata), i = 0; i < keys.length; ++i)
                    writer.uint32(/* id 7, wireType 2 =*/58).fork().uint32(/* id 1, wireType 2 =*/10).string(keys[i]).uint32(/* id 2, wireType 2 =*/18).string(message.metadata[keys[i]]).ldelim();
            return writer;
        };

        /**
         * Encodes the specified DocumentVector message, length delimited. Does not implicitly {@link cyber_elephant.DocumentVector.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.DocumentVector
         * @static
         * @param {cyber_elephant.IDocumentVector} message DocumentVector message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DocumentVector.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a DocumentVector message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.DocumentVector
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.DocumentVector} DocumentVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DocumentVector.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.DocumentVector(), key, value;
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
                        message.title = reader.string();
                        break;
                    }
                case 3: {
                        message.contentSnippet = reader.string();
                        break;
                    }
                case 4: {
                        if (!(message.embedding && message.embedding.length))
                            message.embedding = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.embedding.push(reader.float());
                        } else
                            message.embedding.push(reader.float());
                        break;
                    }
                case 5: {
                        message.projected_3d = $root.cyber_elephant.ProjectedPoint.decode(reader, reader.uint32());
                        break;
                    }
                case 6: {
                        message.documentType = reader.string();
                        break;
                    }
                case 7: {
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
                                reader.skipType(tag2 & 7);
                                break;
                            }
                        }
                        message.metadata[key] = value;
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
         * Decodes a DocumentVector message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.DocumentVector
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.DocumentVector} DocumentVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DocumentVector.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for DocumentVector
         * @function getTypeUrl
         * @memberof cyber_elephant.DocumentVector
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        DocumentVector.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.DocumentVector";
        };

        return DocumentVector;
    })();

    cyber_elephant.ProjectedPoint = (function() {

        /**
         * Properties of a ProjectedPoint.
         * @memberof cyber_elephant
         * @interface IProjectedPoint
         * @property {number|null} [x] ProjectedPoint x
         * @property {number|null} [y] ProjectedPoint y
         * @property {number|null} [z] ProjectedPoint z
         * @property {number|null} [confidence] ProjectedPoint confidence
         */

        /**
         * Constructs a new ProjectedPoint.
         * @memberof cyber_elephant
         * @classdesc Represents a ProjectedPoint.
         * @implements IProjectedPoint
         * @constructor
         * @param {cyber_elephant.IProjectedPoint=} [properties] Properties to set
         */
        function ProjectedPoint(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ProjectedPoint x.
         * @member {number} x
         * @memberof cyber_elephant.ProjectedPoint
         * @instance
         */
        ProjectedPoint.prototype.x = 0;

        /**
         * ProjectedPoint y.
         * @member {number} y
         * @memberof cyber_elephant.ProjectedPoint
         * @instance
         */
        ProjectedPoint.prototype.y = 0;

        /**
         * ProjectedPoint z.
         * @member {number} z
         * @memberof cyber_elephant.ProjectedPoint
         * @instance
         */
        ProjectedPoint.prototype.z = 0;

        /**
         * ProjectedPoint confidence.
         * @member {number} confidence
         * @memberof cyber_elephant.ProjectedPoint
         * @instance
         */
        ProjectedPoint.prototype.confidence = 0;

        /**
         * Encodes the specified ProjectedPoint message. Does not implicitly {@link cyber_elephant.ProjectedPoint.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.ProjectedPoint
         * @static
         * @param {cyber_elephant.IProjectedPoint} message ProjectedPoint message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ProjectedPoint.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.x != null && Object.hasOwnProperty.call(message, "x"))
                writer.uint32(/* id 1, wireType 5 =*/13).float(message.x);
            if (message.y != null && Object.hasOwnProperty.call(message, "y"))
                writer.uint32(/* id 2, wireType 5 =*/21).float(message.y);
            if (message.z != null && Object.hasOwnProperty.call(message, "z"))
                writer.uint32(/* id 3, wireType 5 =*/29).float(message.z);
            if (message.confidence != null && Object.hasOwnProperty.call(message, "confidence"))
                writer.uint32(/* id 4, wireType 5 =*/37).float(message.confidence);
            return writer;
        };

        /**
         * Encodes the specified ProjectedPoint message, length delimited. Does not implicitly {@link cyber_elephant.ProjectedPoint.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.ProjectedPoint
         * @static
         * @param {cyber_elephant.IProjectedPoint} message ProjectedPoint message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ProjectedPoint.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a ProjectedPoint message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.ProjectedPoint
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.ProjectedPoint} ProjectedPoint
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ProjectedPoint.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.ProjectedPoint();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.x = reader.float();
                        break;
                    }
                case 2: {
                        message.y = reader.float();
                        break;
                    }
                case 3: {
                        message.z = reader.float();
                        break;
                    }
                case 4: {
                        message.confidence = reader.float();
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
         * Decodes a ProjectedPoint message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.ProjectedPoint
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.ProjectedPoint} ProjectedPoint
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ProjectedPoint.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for ProjectedPoint
         * @function getTypeUrl
         * @memberof cyber_elephant.ProjectedPoint
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ProjectedPoint.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.ProjectedPoint";
        };

        return ProjectedPoint;
    })();

    cyber_elephant.DocumentCluster = (function() {

        /**
         * Properties of a DocumentCluster.
         * @memberof cyber_elephant
         * @interface IDocumentCluster
         * @property {string|null} [id] DocumentCluster id
         * @property {string|null} [name] DocumentCluster name
         * @property {cyber_elephant.IProjectedPoint|null} [centroid] DocumentCluster centroid
         * @property {Array.<string>|null} [documentIds] DocumentCluster documentIds
         * @property {number|null} [density] DocumentCluster density
         * @property {string|null} [clusterType] DocumentCluster clusterType
         */

        /**
         * Constructs a new DocumentCluster.
         * @memberof cyber_elephant
         * @classdesc Represents a DocumentCluster.
         * @implements IDocumentCluster
         * @constructor
         * @param {cyber_elephant.IDocumentCluster=} [properties] Properties to set
         */
        function DocumentCluster(properties) {
            this.documentIds = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * DocumentCluster id.
         * @member {string} id
         * @memberof cyber_elephant.DocumentCluster
         * @instance
         */
        DocumentCluster.prototype.id = "";

        /**
         * DocumentCluster name.
         * @member {string} name
         * @memberof cyber_elephant.DocumentCluster
         * @instance
         */
        DocumentCluster.prototype.name = "";

        /**
         * DocumentCluster centroid.
         * @member {cyber_elephant.IProjectedPoint|null|undefined} centroid
         * @memberof cyber_elephant.DocumentCluster
         * @instance
         */
        DocumentCluster.prototype.centroid = null;

        /**
         * DocumentCluster documentIds.
         * @member {Array.<string>} documentIds
         * @memberof cyber_elephant.DocumentCluster
         * @instance
         */
        DocumentCluster.prototype.documentIds = $util.emptyArray;

        /**
         * DocumentCluster density.
         * @member {number} density
         * @memberof cyber_elephant.DocumentCluster
         * @instance
         */
        DocumentCluster.prototype.density = 0;

        /**
         * DocumentCluster clusterType.
         * @member {string} clusterType
         * @memberof cyber_elephant.DocumentCluster
         * @instance
         */
        DocumentCluster.prototype.clusterType = "";

        /**
         * Encodes the specified DocumentCluster message. Does not implicitly {@link cyber_elephant.DocumentCluster.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.DocumentCluster
         * @static
         * @param {cyber_elephant.IDocumentCluster} message DocumentCluster message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DocumentCluster.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            if (message.name != null && Object.hasOwnProperty.call(message, "name"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.name);
            if (message.centroid != null && Object.hasOwnProperty.call(message, "centroid"))
                $root.cyber_elephant.ProjectedPoint.encode(message.centroid, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            if (message.documentIds != null && message.documentIds.length)
                for (let i = 0; i < message.documentIds.length; ++i)
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.documentIds[i]);
            if (message.density != null && Object.hasOwnProperty.call(message, "density"))
                writer.uint32(/* id 5, wireType 5 =*/45).float(message.density);
            if (message.clusterType != null && Object.hasOwnProperty.call(message, "clusterType"))
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.clusterType);
            return writer;
        };

        /**
         * Encodes the specified DocumentCluster message, length delimited. Does not implicitly {@link cyber_elephant.DocumentCluster.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.DocumentCluster
         * @static
         * @param {cyber_elephant.IDocumentCluster} message DocumentCluster message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DocumentCluster.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a DocumentCluster message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.DocumentCluster
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.DocumentCluster} DocumentCluster
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DocumentCluster.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.DocumentCluster();
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
                        message.name = reader.string();
                        break;
                    }
                case 3: {
                        message.centroid = $root.cyber_elephant.ProjectedPoint.decode(reader, reader.uint32());
                        break;
                    }
                case 4: {
                        if (!(message.documentIds && message.documentIds.length))
                            message.documentIds = [];
                        message.documentIds.push(reader.string());
                        break;
                    }
                case 5: {
                        message.density = reader.float();
                        break;
                    }
                case 6: {
                        message.clusterType = reader.string();
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
         * Decodes a DocumentCluster message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.DocumentCluster
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.DocumentCluster} DocumentCluster
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DocumentCluster.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for DocumentCluster
         * @function getTypeUrl
         * @memberof cyber_elephant.DocumentCluster
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        DocumentCluster.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.DocumentCluster";
        };

        return DocumentCluster;
    })();

    cyber_elephant.VectorQuery = (function() {

        /**
         * Properties of a VectorQuery.
         * @memberof cyber_elephant
         * @interface IVectorQuery
         * @property {string|null} [queryText] VectorQuery queryText
         * @property {Array.<number>|null} [queryEmbedding] VectorQuery queryEmbedding
         * @property {number|null} [limit] VectorQuery limit
         * @property {number|null} [threshold] VectorQuery threshold
         * @property {Array.<string>|null} [documentTypes] VectorQuery documentTypes
         * @property {Object.<string,string>|null} [filters] VectorQuery filters
         */

        /**
         * Constructs a new VectorQuery.
         * @memberof cyber_elephant
         * @classdesc Represents a VectorQuery.
         * @implements IVectorQuery
         * @constructor
         * @param {cyber_elephant.IVectorQuery=} [properties] Properties to set
         */
        function VectorQuery(properties) {
            this.queryEmbedding = [];
            this.documentTypes = [];
            this.filters = {};
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * VectorQuery queryText.
         * @member {string} queryText
         * @memberof cyber_elephant.VectorQuery
         * @instance
         */
        VectorQuery.prototype.queryText = "";

        /**
         * VectorQuery queryEmbedding.
         * @member {Array.<number>} queryEmbedding
         * @memberof cyber_elephant.VectorQuery
         * @instance
         */
        VectorQuery.prototype.queryEmbedding = $util.emptyArray;

        /**
         * VectorQuery limit.
         * @member {number} limit
         * @memberof cyber_elephant.VectorQuery
         * @instance
         */
        VectorQuery.prototype.limit = 0;

        /**
         * VectorQuery threshold.
         * @member {number} threshold
         * @memberof cyber_elephant.VectorQuery
         * @instance
         */
        VectorQuery.prototype.threshold = 0;

        /**
         * VectorQuery documentTypes.
         * @member {Array.<string>} documentTypes
         * @memberof cyber_elephant.VectorQuery
         * @instance
         */
        VectorQuery.prototype.documentTypes = $util.emptyArray;

        /**
         * VectorQuery filters.
         * @member {Object.<string,string>} filters
         * @memberof cyber_elephant.VectorQuery
         * @instance
         */
        VectorQuery.prototype.filters = $util.emptyObject;

        /**
         * Encodes the specified VectorQuery message. Does not implicitly {@link cyber_elephant.VectorQuery.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.VectorQuery
         * @static
         * @param {cyber_elephant.IVectorQuery} message VectorQuery message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        VectorQuery.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.queryText != null && Object.hasOwnProperty.call(message, "queryText"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.queryText);
            if (message.queryEmbedding != null && message.queryEmbedding.length) {
                writer.uint32(/* id 2, wireType 2 =*/18).fork();
                for (let i = 0; i < message.queryEmbedding.length; ++i)
                    writer.float(message.queryEmbedding[i]);
                writer.ldelim();
            }
            if (message.limit != null && Object.hasOwnProperty.call(message, "limit"))
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.limit);
            if (message.threshold != null && Object.hasOwnProperty.call(message, "threshold"))
                writer.uint32(/* id 4, wireType 5 =*/37).float(message.threshold);
            if (message.documentTypes != null && message.documentTypes.length)
                for (let i = 0; i < message.documentTypes.length; ++i)
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.documentTypes[i]);
            if (message.filters != null && Object.hasOwnProperty.call(message, "filters"))
                for (let keys = Object.keys(message.filters), i = 0; i < keys.length; ++i)
                    writer.uint32(/* id 6, wireType 2 =*/50).fork().uint32(/* id 1, wireType 2 =*/10).string(keys[i]).uint32(/* id 2, wireType 2 =*/18).string(message.filters[keys[i]]).ldelim();
            return writer;
        };

        /**
         * Encodes the specified VectorQuery message, length delimited. Does not implicitly {@link cyber_elephant.VectorQuery.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.VectorQuery
         * @static
         * @param {cyber_elephant.IVectorQuery} message VectorQuery message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        VectorQuery.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a VectorQuery message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.VectorQuery
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.VectorQuery} VectorQuery
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        VectorQuery.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.VectorQuery(), key, value;
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.queryText = reader.string();
                        break;
                    }
                case 2: {
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
                case 3: {
                        message.limit = reader.int32();
                        break;
                    }
                case 4: {
                        message.threshold = reader.float();
                        break;
                    }
                case 5: {
                        if (!(message.documentTypes && message.documentTypes.length))
                            message.documentTypes = [];
                        message.documentTypes.push(reader.string());
                        break;
                    }
                case 6: {
                        if (message.filters === $util.emptyObject)
                            message.filters = {};
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
                                reader.skipType(tag2 & 7);
                                break;
                            }
                        }
                        message.filters[key] = value;
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
         * Decodes a VectorQuery message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.VectorQuery
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.VectorQuery} VectorQuery
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        VectorQuery.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for VectorQuery
         * @function getTypeUrl
         * @memberof cyber_elephant.VectorQuery
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        VectorQuery.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.VectorQuery";
        };

        return VectorQuery;
    })();

    cyber_elephant.VectorSearchResponse = (function() {

        /**
         * Properties of a VectorSearchResponse.
         * @memberof cyber_elephant
         * @interface IVectorSearchResponse
         * @property {Array.<cyber_elephant.IDocumentVector>|null} [documents] VectorSearchResponse documents
         * @property {Array.<cyber_elephant.IDocumentCluster>|null} [clusters] VectorSearchResponse clusters
         * @property {cyber_elephant.IQueryStatistics|null} [stats] VectorSearchResponse stats
         * @property {string|null} [sessionId] VectorSearchResponse sessionId
         */

        /**
         * Constructs a new VectorSearchResponse.
         * @memberof cyber_elephant
         * @classdesc Represents a VectorSearchResponse.
         * @implements IVectorSearchResponse
         * @constructor
         * @param {cyber_elephant.IVectorSearchResponse=} [properties] Properties to set
         */
        function VectorSearchResponse(properties) {
            this.documents = [];
            this.clusters = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * VectorSearchResponse documents.
         * @member {Array.<cyber_elephant.IDocumentVector>} documents
         * @memberof cyber_elephant.VectorSearchResponse
         * @instance
         */
        VectorSearchResponse.prototype.documents = $util.emptyArray;

        /**
         * VectorSearchResponse clusters.
         * @member {Array.<cyber_elephant.IDocumentCluster>} clusters
         * @memberof cyber_elephant.VectorSearchResponse
         * @instance
         */
        VectorSearchResponse.prototype.clusters = $util.emptyArray;

        /**
         * VectorSearchResponse stats.
         * @member {cyber_elephant.IQueryStatistics|null|undefined} stats
         * @memberof cyber_elephant.VectorSearchResponse
         * @instance
         */
        VectorSearchResponse.prototype.stats = null;

        /**
         * VectorSearchResponse sessionId.
         * @member {string} sessionId
         * @memberof cyber_elephant.VectorSearchResponse
         * @instance
         */
        VectorSearchResponse.prototype.sessionId = "";

        /**
         * Encodes the specified VectorSearchResponse message. Does not implicitly {@link cyber_elephant.VectorSearchResponse.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.VectorSearchResponse
         * @static
         * @param {cyber_elephant.IVectorSearchResponse} message VectorSearchResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        VectorSearchResponse.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.documents != null && message.documents.length)
                for (let i = 0; i < message.documents.length; ++i)
                    $root.cyber_elephant.DocumentVector.encode(message.documents[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.clusters != null && message.clusters.length)
                for (let i = 0; i < message.clusters.length; ++i)
                    $root.cyber_elephant.DocumentCluster.encode(message.clusters[i], writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.stats != null && Object.hasOwnProperty.call(message, "stats"))
                $root.cyber_elephant.QueryStatistics.encode(message.stats, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            if (message.sessionId != null && Object.hasOwnProperty.call(message, "sessionId"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.sessionId);
            return writer;
        };

        /**
         * Encodes the specified VectorSearchResponse message, length delimited. Does not implicitly {@link cyber_elephant.VectorSearchResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.VectorSearchResponse
         * @static
         * @param {cyber_elephant.IVectorSearchResponse} message VectorSearchResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        VectorSearchResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a VectorSearchResponse message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.VectorSearchResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.VectorSearchResponse} VectorSearchResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        VectorSearchResponse.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.VectorSearchResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.documents && message.documents.length))
                            message.documents = [];
                        message.documents.push($root.cyber_elephant.DocumentVector.decode(reader, reader.uint32()));
                        break;
                    }
                case 2: {
                        if (!(message.clusters && message.clusters.length))
                            message.clusters = [];
                        message.clusters.push($root.cyber_elephant.DocumentCluster.decode(reader, reader.uint32()));
                        break;
                    }
                case 3: {
                        message.stats = $root.cyber_elephant.QueryStatistics.decode(reader, reader.uint32());
                        break;
                    }
                case 4: {
                        message.sessionId = reader.string();
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
         * Decodes a VectorSearchResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.VectorSearchResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.VectorSearchResponse} VectorSearchResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        VectorSearchResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for VectorSearchResponse
         * @function getTypeUrl
         * @memberof cyber_elephant.VectorSearchResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        VectorSearchResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.VectorSearchResponse";
        };

        return VectorSearchResponse;
    })();

    cyber_elephant.QueryStatistics = (function() {

        /**
         * Properties of a QueryStatistics.
         * @memberof cyber_elephant
         * @interface IQueryStatistics
         * @property {number|null} [totalDocuments] QueryStatistics totalDocuments
         * @property {number|null} [processedDocuments] QueryStatistics processedDocuments
         * @property {number|null} [processingTimeMs] QueryStatistics processingTimeMs
         * @property {number|null} [embeddingTimeMs] QueryStatistics embeddingTimeMs
         * @property {number|null} [searchTimeMs] QueryStatistics searchTimeMs
         * @property {string|null} [algorithmUsed] QueryStatistics algorithmUsed
         */

        /**
         * Constructs a new QueryStatistics.
         * @memberof cyber_elephant
         * @classdesc Represents a QueryStatistics.
         * @implements IQueryStatistics
         * @constructor
         * @param {cyber_elephant.IQueryStatistics=} [properties] Properties to set
         */
        function QueryStatistics(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * QueryStatistics totalDocuments.
         * @member {number} totalDocuments
         * @memberof cyber_elephant.QueryStatistics
         * @instance
         */
        QueryStatistics.prototype.totalDocuments = 0;

        /**
         * QueryStatistics processedDocuments.
         * @member {number} processedDocuments
         * @memberof cyber_elephant.QueryStatistics
         * @instance
         */
        QueryStatistics.prototype.processedDocuments = 0;

        /**
         * QueryStatistics processingTimeMs.
         * @member {number} processingTimeMs
         * @memberof cyber_elephant.QueryStatistics
         * @instance
         */
        QueryStatistics.prototype.processingTimeMs = 0;

        /**
         * QueryStatistics embeddingTimeMs.
         * @member {number} embeddingTimeMs
         * @memberof cyber_elephant.QueryStatistics
         * @instance
         */
        QueryStatistics.prototype.embeddingTimeMs = 0;

        /**
         * QueryStatistics searchTimeMs.
         * @member {number} searchTimeMs
         * @memberof cyber_elephant.QueryStatistics
         * @instance
         */
        QueryStatistics.prototype.searchTimeMs = 0;

        /**
         * QueryStatistics algorithmUsed.
         * @member {string} algorithmUsed
         * @memberof cyber_elephant.QueryStatistics
         * @instance
         */
        QueryStatistics.prototype.algorithmUsed = "";

        /**
         * Encodes the specified QueryStatistics message. Does not implicitly {@link cyber_elephant.QueryStatistics.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.QueryStatistics
         * @static
         * @param {cyber_elephant.IQueryStatistics} message QueryStatistics message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        QueryStatistics.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.totalDocuments != null && Object.hasOwnProperty.call(message, "totalDocuments"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.totalDocuments);
            if (message.processedDocuments != null && Object.hasOwnProperty.call(message, "processedDocuments"))
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.processedDocuments);
            if (message.processingTimeMs != null && Object.hasOwnProperty.call(message, "processingTimeMs"))
                writer.uint32(/* id 3, wireType 5 =*/29).float(message.processingTimeMs);
            if (message.embeddingTimeMs != null && Object.hasOwnProperty.call(message, "embeddingTimeMs"))
                writer.uint32(/* id 4, wireType 5 =*/37).float(message.embeddingTimeMs);
            if (message.searchTimeMs != null && Object.hasOwnProperty.call(message, "searchTimeMs"))
                writer.uint32(/* id 5, wireType 5 =*/45).float(message.searchTimeMs);
            if (message.algorithmUsed != null && Object.hasOwnProperty.call(message, "algorithmUsed"))
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.algorithmUsed);
            return writer;
        };

        /**
         * Encodes the specified QueryStatistics message, length delimited. Does not implicitly {@link cyber_elephant.QueryStatistics.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.QueryStatistics
         * @static
         * @param {cyber_elephant.IQueryStatistics} message QueryStatistics message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        QueryStatistics.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a QueryStatistics message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.QueryStatistics
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.QueryStatistics} QueryStatistics
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        QueryStatistics.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.QueryStatistics();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.totalDocuments = reader.int32();
                        break;
                    }
                case 2: {
                        message.processedDocuments = reader.int32();
                        break;
                    }
                case 3: {
                        message.processingTimeMs = reader.float();
                        break;
                    }
                case 4: {
                        message.embeddingTimeMs = reader.float();
                        break;
                    }
                case 5: {
                        message.searchTimeMs = reader.float();
                        break;
                    }
                case 6: {
                        message.algorithmUsed = reader.string();
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
         * Decodes a QueryStatistics message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.QueryStatistics
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.QueryStatistics} QueryStatistics
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        QueryStatistics.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for QueryStatistics
         * @function getTypeUrl
         * @memberof cyber_elephant.QueryStatistics
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        QueryStatistics.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.QueryStatistics";
        };

        return QueryStatistics;
    })();

    cyber_elephant.DocumentBatch = (function() {

        /**
         * Properties of a DocumentBatch.
         * @memberof cyber_elephant
         * @interface IDocumentBatch
         * @property {Array.<cyber_elephant.IDocumentVector>|null} [documents] DocumentBatch documents
         * @property {string|null} [batchId] DocumentBatch batchId
         * @property {cyber_elephant.IProcessingOptions|null} [options] DocumentBatch options
         */

        /**
         * Constructs a new DocumentBatch.
         * @memberof cyber_elephant
         * @classdesc Represents a DocumentBatch.
         * @implements IDocumentBatch
         * @constructor
         * @param {cyber_elephant.IDocumentBatch=} [properties] Properties to set
         */
        function DocumentBatch(properties) {
            this.documents = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * DocumentBatch documents.
         * @member {Array.<cyber_elephant.IDocumentVector>} documents
         * @memberof cyber_elephant.DocumentBatch
         * @instance
         */
        DocumentBatch.prototype.documents = $util.emptyArray;

        /**
         * DocumentBatch batchId.
         * @member {string} batchId
         * @memberof cyber_elephant.DocumentBatch
         * @instance
         */
        DocumentBatch.prototype.batchId = "";

        /**
         * DocumentBatch options.
         * @member {cyber_elephant.IProcessingOptions|null|undefined} options
         * @memberof cyber_elephant.DocumentBatch
         * @instance
         */
        DocumentBatch.prototype.options = null;

        /**
         * Encodes the specified DocumentBatch message. Does not implicitly {@link cyber_elephant.DocumentBatch.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.DocumentBatch
         * @static
         * @param {cyber_elephant.IDocumentBatch} message DocumentBatch message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DocumentBatch.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.documents != null && message.documents.length)
                for (let i = 0; i < message.documents.length; ++i)
                    $root.cyber_elephant.DocumentVector.encode(message.documents[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.batchId != null && Object.hasOwnProperty.call(message, "batchId"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.batchId);
            if (message.options != null && Object.hasOwnProperty.call(message, "options"))
                $root.cyber_elephant.ProcessingOptions.encode(message.options, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified DocumentBatch message, length delimited. Does not implicitly {@link cyber_elephant.DocumentBatch.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.DocumentBatch
         * @static
         * @param {cyber_elephant.IDocumentBatch} message DocumentBatch message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DocumentBatch.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a DocumentBatch message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.DocumentBatch
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.DocumentBatch} DocumentBatch
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DocumentBatch.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.DocumentBatch();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.documents && message.documents.length))
                            message.documents = [];
                        message.documents.push($root.cyber_elephant.DocumentVector.decode(reader, reader.uint32()));
                        break;
                    }
                case 2: {
                        message.batchId = reader.string();
                        break;
                    }
                case 3: {
                        message.options = $root.cyber_elephant.ProcessingOptions.decode(reader, reader.uint32());
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
         * Decodes a DocumentBatch message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.DocumentBatch
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.DocumentBatch} DocumentBatch
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DocumentBatch.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for DocumentBatch
         * @function getTypeUrl
         * @memberof cyber_elephant.DocumentBatch
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        DocumentBatch.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.DocumentBatch";
        };

        return DocumentBatch;
    })();

    cyber_elephant.ProcessingOptions = (function() {

        /**
         * Properties of a ProcessingOptions.
         * @memberof cyber_elephant
         * @interface IProcessingOptions
         * @property {boolean|null} [useGpuAcceleration] ProcessingOptions useGpuAcceleration
         * @property {boolean|null} [enableClustering] ProcessingOptions enableClustering
         * @property {number|null} [clusterThreshold] ProcessingOptions clusterThreshold
         * @property {string|null} [embeddingModel] ProcessingOptions embeddingModel
         * @property {number|null} [maxDimensions] ProcessingOptions maxDimensions
         */

        /**
         * Constructs a new ProcessingOptions.
         * @memberof cyber_elephant
         * @classdesc Represents a ProcessingOptions.
         * @implements IProcessingOptions
         * @constructor
         * @param {cyber_elephant.IProcessingOptions=} [properties] Properties to set
         */
        function ProcessingOptions(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ProcessingOptions useGpuAcceleration.
         * @member {boolean} useGpuAcceleration
         * @memberof cyber_elephant.ProcessingOptions
         * @instance
         */
        ProcessingOptions.prototype.useGpuAcceleration = false;

        /**
         * ProcessingOptions enableClustering.
         * @member {boolean} enableClustering
         * @memberof cyber_elephant.ProcessingOptions
         * @instance
         */
        ProcessingOptions.prototype.enableClustering = false;

        /**
         * ProcessingOptions clusterThreshold.
         * @member {number} clusterThreshold
         * @memberof cyber_elephant.ProcessingOptions
         * @instance
         */
        ProcessingOptions.prototype.clusterThreshold = 0;

        /**
         * ProcessingOptions embeddingModel.
         * @member {string} embeddingModel
         * @memberof cyber_elephant.ProcessingOptions
         * @instance
         */
        ProcessingOptions.prototype.embeddingModel = "";

        /**
         * ProcessingOptions maxDimensions.
         * @member {number} maxDimensions
         * @memberof cyber_elephant.ProcessingOptions
         * @instance
         */
        ProcessingOptions.prototype.maxDimensions = 0;

        /**
         * Encodes the specified ProcessingOptions message. Does not implicitly {@link cyber_elephant.ProcessingOptions.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.ProcessingOptions
         * @static
         * @param {cyber_elephant.IProcessingOptions} message ProcessingOptions message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ProcessingOptions.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.useGpuAcceleration != null && Object.hasOwnProperty.call(message, "useGpuAcceleration"))
                writer.uint32(/* id 1, wireType 0 =*/8).bool(message.useGpuAcceleration);
            if (message.enableClustering != null && Object.hasOwnProperty.call(message, "enableClustering"))
                writer.uint32(/* id 2, wireType 0 =*/16).bool(message.enableClustering);
            if (message.clusterThreshold != null && Object.hasOwnProperty.call(message, "clusterThreshold"))
                writer.uint32(/* id 3, wireType 5 =*/29).float(message.clusterThreshold);
            if (message.embeddingModel != null && Object.hasOwnProperty.call(message, "embeddingModel"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.embeddingModel);
            if (message.maxDimensions != null && Object.hasOwnProperty.call(message, "maxDimensions"))
                writer.uint32(/* id 5, wireType 0 =*/40).int32(message.maxDimensions);
            return writer;
        };

        /**
         * Encodes the specified ProcessingOptions message, length delimited. Does not implicitly {@link cyber_elephant.ProcessingOptions.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.ProcessingOptions
         * @static
         * @param {cyber_elephant.IProcessingOptions} message ProcessingOptions message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ProcessingOptions.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a ProcessingOptions message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.ProcessingOptions
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.ProcessingOptions} ProcessingOptions
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ProcessingOptions.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.ProcessingOptions();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.useGpuAcceleration = reader.bool();
                        break;
                    }
                case 2: {
                        message.enableClustering = reader.bool();
                        break;
                    }
                case 3: {
                        message.clusterThreshold = reader.float();
                        break;
                    }
                case 4: {
                        message.embeddingModel = reader.string();
                        break;
                    }
                case 5: {
                        message.maxDimensions = reader.int32();
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
         * Decodes a ProcessingOptions message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.ProcessingOptions
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.ProcessingOptions} ProcessingOptions
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ProcessingOptions.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for ProcessingOptions
         * @function getTypeUrl
         * @memberof cyber_elephant.ProcessingOptions
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ProcessingOptions.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.ProcessingOptions";
        };

        return ProcessingOptions;
    })();

    cyber_elephant.SystemStatus = (function() {

        /**
         * Properties of a SystemStatus.
         * @memberof cyber_elephant
         * @interface ISystemStatus
         * @property {boolean|null} [healthy] SystemStatus healthy
         * @property {string|null} [version] SystemStatus version
         * @property {cyber_elephant.ISystemMetrics|null} [metrics] SystemStatus metrics
         * @property {Array.<string>|null} [availableModels] SystemStatus availableModels
         * @property {boolean|null} [gpuAvailable] SystemStatus gpuAvailable
         */

        /**
         * Constructs a new SystemStatus.
         * @memberof cyber_elephant
         * @classdesc Represents a SystemStatus.
         * @implements ISystemStatus
         * @constructor
         * @param {cyber_elephant.ISystemStatus=} [properties] Properties to set
         */
        function SystemStatus(properties) {
            this.availableModels = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SystemStatus healthy.
         * @member {boolean} healthy
         * @memberof cyber_elephant.SystemStatus
         * @instance
         */
        SystemStatus.prototype.healthy = false;

        /**
         * SystemStatus version.
         * @member {string} version
         * @memberof cyber_elephant.SystemStatus
         * @instance
         */
        SystemStatus.prototype.version = "";

        /**
         * SystemStatus metrics.
         * @member {cyber_elephant.ISystemMetrics|null|undefined} metrics
         * @memberof cyber_elephant.SystemStatus
         * @instance
         */
        SystemStatus.prototype.metrics = null;

        /**
         * SystemStatus availableModels.
         * @member {Array.<string>} availableModels
         * @memberof cyber_elephant.SystemStatus
         * @instance
         */
        SystemStatus.prototype.availableModels = $util.emptyArray;

        /**
         * SystemStatus gpuAvailable.
         * @member {boolean} gpuAvailable
         * @memberof cyber_elephant.SystemStatus
         * @instance
         */
        SystemStatus.prototype.gpuAvailable = false;

        /**
         * Encodes the specified SystemStatus message. Does not implicitly {@link cyber_elephant.SystemStatus.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.SystemStatus
         * @static
         * @param {cyber_elephant.ISystemStatus} message SystemStatus message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SystemStatus.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.healthy != null && Object.hasOwnProperty.call(message, "healthy"))
                writer.uint32(/* id 1, wireType 0 =*/8).bool(message.healthy);
            if (message.version != null && Object.hasOwnProperty.call(message, "version"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.version);
            if (message.metrics != null && Object.hasOwnProperty.call(message, "metrics"))
                $root.cyber_elephant.SystemMetrics.encode(message.metrics, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            if (message.availableModels != null && message.availableModels.length)
                for (let i = 0; i < message.availableModels.length; ++i)
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.availableModels[i]);
            if (message.gpuAvailable != null && Object.hasOwnProperty.call(message, "gpuAvailable"))
                writer.uint32(/* id 5, wireType 0 =*/40).bool(message.gpuAvailable);
            return writer;
        };

        /**
         * Encodes the specified SystemStatus message, length delimited. Does not implicitly {@link cyber_elephant.SystemStatus.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.SystemStatus
         * @static
         * @param {cyber_elephant.ISystemStatus} message SystemStatus message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SystemStatus.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a SystemStatus message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.SystemStatus
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.SystemStatus} SystemStatus
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SystemStatus.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.SystemStatus();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.healthy = reader.bool();
                        break;
                    }
                case 2: {
                        message.version = reader.string();
                        break;
                    }
                case 3: {
                        message.metrics = $root.cyber_elephant.SystemMetrics.decode(reader, reader.uint32());
                        break;
                    }
                case 4: {
                        if (!(message.availableModels && message.availableModels.length))
                            message.availableModels = [];
                        message.availableModels.push(reader.string());
                        break;
                    }
                case 5: {
                        message.gpuAvailable = reader.bool();
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
         * Decodes a SystemStatus message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.SystemStatus
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.SystemStatus} SystemStatus
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SystemStatus.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for SystemStatus
         * @function getTypeUrl
         * @memberof cyber_elephant.SystemStatus
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SystemStatus.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.SystemStatus";
        };

        return SystemStatus;
    })();

    cyber_elephant.SystemMetrics = (function() {

        /**
         * Properties of a SystemMetrics.
         * @memberof cyber_elephant
         * @interface ISystemMetrics
         * @property {number|null} [totalDocuments] SystemMetrics totalDocuments
         * @property {number|null} [activeClusters] SystemMetrics activeClusters
         * @property {number|null} [avgQueryTimeMs] SystemMetrics avgQueryTimeMs
         * @property {number|null} [memoryUsageMb] SystemMetrics memoryUsageMb
         * @property {number|null} [cpuUsagePercent] SystemMetrics cpuUsagePercent
         * @property {number|null} [gpuUsagePercent] SystemMetrics gpuUsagePercent
         */

        /**
         * Constructs a new SystemMetrics.
         * @memberof cyber_elephant
         * @classdesc Represents a SystemMetrics.
         * @implements ISystemMetrics
         * @constructor
         * @param {cyber_elephant.ISystemMetrics=} [properties] Properties to set
         */
        function SystemMetrics(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SystemMetrics totalDocuments.
         * @member {number} totalDocuments
         * @memberof cyber_elephant.SystemMetrics
         * @instance
         */
        SystemMetrics.prototype.totalDocuments = 0;

        /**
         * SystemMetrics activeClusters.
         * @member {number} activeClusters
         * @memberof cyber_elephant.SystemMetrics
         * @instance
         */
        SystemMetrics.prototype.activeClusters = 0;

        /**
         * SystemMetrics avgQueryTimeMs.
         * @member {number} avgQueryTimeMs
         * @memberof cyber_elephant.SystemMetrics
         * @instance
         */
        SystemMetrics.prototype.avgQueryTimeMs = 0;

        /**
         * SystemMetrics memoryUsageMb.
         * @member {number} memoryUsageMb
         * @memberof cyber_elephant.SystemMetrics
         * @instance
         */
        SystemMetrics.prototype.memoryUsageMb = 0;

        /**
         * SystemMetrics cpuUsagePercent.
         * @member {number} cpuUsagePercent
         * @memberof cyber_elephant.SystemMetrics
         * @instance
         */
        SystemMetrics.prototype.cpuUsagePercent = 0;

        /**
         * SystemMetrics gpuUsagePercent.
         * @member {number} gpuUsagePercent
         * @memberof cyber_elephant.SystemMetrics
         * @instance
         */
        SystemMetrics.prototype.gpuUsagePercent = 0;

        /**
         * Encodes the specified SystemMetrics message. Does not implicitly {@link cyber_elephant.SystemMetrics.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.SystemMetrics
         * @static
         * @param {cyber_elephant.ISystemMetrics} message SystemMetrics message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SystemMetrics.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.totalDocuments != null && Object.hasOwnProperty.call(message, "totalDocuments"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.totalDocuments);
            if (message.activeClusters != null && Object.hasOwnProperty.call(message, "activeClusters"))
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.activeClusters);
            if (message.avgQueryTimeMs != null && Object.hasOwnProperty.call(message, "avgQueryTimeMs"))
                writer.uint32(/* id 3, wireType 5 =*/29).float(message.avgQueryTimeMs);
            if (message.memoryUsageMb != null && Object.hasOwnProperty.call(message, "memoryUsageMb"))
                writer.uint32(/* id 4, wireType 5 =*/37).float(message.memoryUsageMb);
            if (message.cpuUsagePercent != null && Object.hasOwnProperty.call(message, "cpuUsagePercent"))
                writer.uint32(/* id 5, wireType 5 =*/45).float(message.cpuUsagePercent);
            if (message.gpuUsagePercent != null && Object.hasOwnProperty.call(message, "gpuUsagePercent"))
                writer.uint32(/* id 6, wireType 5 =*/53).float(message.gpuUsagePercent);
            return writer;
        };

        /**
         * Encodes the specified SystemMetrics message, length delimited. Does not implicitly {@link cyber_elephant.SystemMetrics.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.SystemMetrics
         * @static
         * @param {cyber_elephant.ISystemMetrics} message SystemMetrics message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SystemMetrics.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a SystemMetrics message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.SystemMetrics
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.SystemMetrics} SystemMetrics
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SystemMetrics.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.SystemMetrics();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.totalDocuments = reader.int32();
                        break;
                    }
                case 2: {
                        message.activeClusters = reader.int32();
                        break;
                    }
                case 3: {
                        message.avgQueryTimeMs = reader.float();
                        break;
                    }
                case 4: {
                        message.memoryUsageMb = reader.float();
                        break;
                    }
                case 5: {
                        message.cpuUsagePercent = reader.float();
                        break;
                    }
                case 6: {
                        message.gpuUsagePercent = reader.float();
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
         * Decodes a SystemMetrics message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.SystemMetrics
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.SystemMetrics} SystemMetrics
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SystemMetrics.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for SystemMetrics
         * @function getTypeUrl
         * @memberof cyber_elephant.SystemMetrics
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SystemMetrics.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.SystemMetrics";
        };

        return SystemMetrics;
    })();

    cyber_elephant.CyberElephantService = (function() {

        /**
         * Constructs a new CyberElephantService service.
         * @memberof cyber_elephant
         * @classdesc Represents a CyberElephantService
         * @extends $protobuf.rpc.Service
         * @constructor
         * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
         * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
         * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
         */
        function CyberElephantService(rpcImpl, requestDelimited, responseDelimited) {
            $protobuf.rpc.Service.call(this, rpcImpl, requestDelimited, responseDelimited);
        }

        (CyberElephantService.prototype = Object.create($protobuf.rpc.Service.prototype)).constructor = CyberElephantService;

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#processDocuments}.
         * @memberof cyber_elephant.CyberElephantService
         * @typedef ProcessDocumentsCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {cyber_elephant.VectorSearchResponse} [response] VectorSearchResponse
         */

        /**
         * Calls ProcessDocuments.
         * @function processDocuments
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IDocumentBatch} request DocumentBatch message or plain object
         * @param {cyber_elephant.CyberElephantService.ProcessDocumentsCallback} callback Node-style callback called with the error, if any, and VectorSearchResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(CyberElephantService.prototype.processDocuments = function processDocuments(request, callback) {
            return this.rpcCall(processDocuments, $root.cyber_elephant.DocumentBatch, $root.cyber_elephant.VectorSearchResponse, request, callback);
        }, "name", { value: "ProcessDocuments" });

        /**
         * Calls ProcessDocuments.
         * @function processDocuments
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IDocumentBatch} request DocumentBatch message or plain object
         * @returns {Promise<cyber_elephant.VectorSearchResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#searchSimilar}.
         * @memberof cyber_elephant.CyberElephantService
         * @typedef SearchSimilarCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {cyber_elephant.VectorSearchResponse} [response] VectorSearchResponse
         */

        /**
         * Calls SearchSimilar.
         * @function searchSimilar
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IVectorQuery} request VectorQuery message or plain object
         * @param {cyber_elephant.CyberElephantService.SearchSimilarCallback} callback Node-style callback called with the error, if any, and VectorSearchResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(CyberElephantService.prototype.searchSimilar = function searchSimilar(request, callback) {
            return this.rpcCall(searchSimilar, $root.cyber_elephant.VectorQuery, $root.cyber_elephant.VectorSearchResponse, request, callback);
        }, "name", { value: "SearchSimilar" });

        /**
         * Calls SearchSimilar.
         * @function searchSimilar
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IVectorQuery} request VectorQuery message or plain object
         * @returns {Promise<cyber_elephant.VectorSearchResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#getDocumentById}.
         * @memberof cyber_elephant.CyberElephantService
         * @typedef GetDocumentByIdCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {cyber_elephant.DocumentVector} [response] DocumentVector
         */

        /**
         * Calls GetDocumentById.
         * @function getDocumentById
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IDocumentIdRequest} request DocumentIdRequest message or plain object
         * @param {cyber_elephant.CyberElephantService.GetDocumentByIdCallback} callback Node-style callback called with the error, if any, and DocumentVector
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(CyberElephantService.prototype.getDocumentById = function getDocumentById(request, callback) {
            return this.rpcCall(getDocumentById, $root.cyber_elephant.DocumentIdRequest, $root.cyber_elephant.DocumentVector, request, callback);
        }, "name", { value: "GetDocumentById" });

        /**
         * Calls GetDocumentById.
         * @function getDocumentById
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IDocumentIdRequest} request DocumentIdRequest message or plain object
         * @returns {Promise<cyber_elephant.DocumentVector>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#getClusters}.
         * @memberof cyber_elephant.CyberElephantService
         * @typedef GetClustersCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {cyber_elephant.ClusterResponse} [response] ClusterResponse
         */

        /**
         * Calls GetClusters.
         * @function getClusters
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IClusterRequest} request ClusterRequest message or plain object
         * @param {cyber_elephant.CyberElephantService.GetClustersCallback} callback Node-style callback called with the error, if any, and ClusterResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(CyberElephantService.prototype.getClusters = function getClusters(request, callback) {
            return this.rpcCall(getClusters, $root.cyber_elephant.ClusterRequest, $root.cyber_elephant.ClusterResponse, request, callback);
        }, "name", { value: "GetClusters" });

        /**
         * Calls GetClusters.
         * @function getClusters
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IClusterRequest} request ClusterRequest message or plain object
         * @returns {Promise<cyber_elephant.ClusterResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#updateClusters}.
         * @memberof cyber_elephant.CyberElephantService
         * @typedef UpdateClustersCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {cyber_elephant.ClusterResponse} [response] ClusterResponse
         */

        /**
         * Calls UpdateClusters.
         * @function updateClusters
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IClusterUpdateRequest} request ClusterUpdateRequest message or plain object
         * @param {cyber_elephant.CyberElephantService.UpdateClustersCallback} callback Node-style callback called with the error, if any, and ClusterResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(CyberElephantService.prototype.updateClusters = function updateClusters(request, callback) {
            return this.rpcCall(updateClusters, $root.cyber_elephant.ClusterUpdateRequest, $root.cyber_elephant.ClusterResponse, request, callback);
        }, "name", { value: "UpdateClusters" });

        /**
         * Calls UpdateClusters.
         * @function updateClusters
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IClusterUpdateRequest} request ClusterUpdateRequest message or plain object
         * @returns {Promise<cyber_elephant.ClusterResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#getStatus}.
         * @memberof cyber_elephant.CyberElephantService
         * @typedef GetStatusCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {cyber_elephant.SystemStatus} [response] SystemStatus
         */

        /**
         * Calls GetStatus.
         * @function getStatus
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IStatusRequest} request StatusRequest message or plain object
         * @param {cyber_elephant.CyberElephantService.GetStatusCallback} callback Node-style callback called with the error, if any, and SystemStatus
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(CyberElephantService.prototype.getStatus = function getStatus(request, callback) {
            return this.rpcCall(getStatus, $root.cyber_elephant.StatusRequest, $root.cyber_elephant.SystemStatus, request, callback);
        }, "name", { value: "GetStatus" });

        /**
         * Calls GetStatus.
         * @function getStatus
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IStatusRequest} request StatusRequest message or plain object
         * @returns {Promise<cyber_elephant.SystemStatus>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link cyber_elephant.CyberElephantService#healthCheck}.
         * @memberof cyber_elephant.CyberElephantService
         * @typedef HealthCheckCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {cyber_elephant.HealthResponse} [response] HealthResponse
         */

        /**
         * Calls HealthCheck.
         * @function healthCheck
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IHealthRequest} request HealthRequest message or plain object
         * @param {cyber_elephant.CyberElephantService.HealthCheckCallback} callback Node-style callback called with the error, if any, and HealthResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(CyberElephantService.prototype.healthCheck = function healthCheck(request, callback) {
            return this.rpcCall(healthCheck, $root.cyber_elephant.HealthRequest, $root.cyber_elephant.HealthResponse, request, callback);
        }, "name", { value: "HealthCheck" });

        /**
         * Calls HealthCheck.
         * @function healthCheck
         * @memberof cyber_elephant.CyberElephantService
         * @instance
         * @param {cyber_elephant.IHealthRequest} request HealthRequest message or plain object
         * @returns {Promise<cyber_elephant.HealthResponse>} Promise
         * @variation 2
         */

        return CyberElephantService;
    })();

    cyber_elephant.DocumentIdRequest = (function() {

        /**
         * Properties of a DocumentIdRequest.
         * @memberof cyber_elephant
         * @interface IDocumentIdRequest
         * @property {string|null} [id] DocumentIdRequest id
         */

        /**
         * Constructs a new DocumentIdRequest.
         * @memberof cyber_elephant
         * @classdesc Represents a DocumentIdRequest.
         * @implements IDocumentIdRequest
         * @constructor
         * @param {cyber_elephant.IDocumentIdRequest=} [properties] Properties to set
         */
        function DocumentIdRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * DocumentIdRequest id.
         * @member {string} id
         * @memberof cyber_elephant.DocumentIdRequest
         * @instance
         */
        DocumentIdRequest.prototype.id = "";

        /**
         * Encodes the specified DocumentIdRequest message. Does not implicitly {@link cyber_elephant.DocumentIdRequest.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.DocumentIdRequest
         * @static
         * @param {cyber_elephant.IDocumentIdRequest} message DocumentIdRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DocumentIdRequest.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            return writer;
        };

        /**
         * Encodes the specified DocumentIdRequest message, length delimited. Does not implicitly {@link cyber_elephant.DocumentIdRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.DocumentIdRequest
         * @static
         * @param {cyber_elephant.IDocumentIdRequest} message DocumentIdRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DocumentIdRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a DocumentIdRequest message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.DocumentIdRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.DocumentIdRequest} DocumentIdRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DocumentIdRequest.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.DocumentIdRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.id = reader.string();
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
         * Decodes a DocumentIdRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.DocumentIdRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.DocumentIdRequest} DocumentIdRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DocumentIdRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for DocumentIdRequest
         * @function getTypeUrl
         * @memberof cyber_elephant.DocumentIdRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        DocumentIdRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.DocumentIdRequest";
        };

        return DocumentIdRequest;
    })();

    cyber_elephant.ClusterRequest = (function() {

        /**
         * Properties of a ClusterRequest.
         * @memberof cyber_elephant
         * @interface IClusterRequest
         * @property {string|null} [clusterId] ClusterRequest clusterId
         * @property {boolean|null} [includeDocuments] ClusterRequest includeDocuments
         */

        /**
         * Constructs a new ClusterRequest.
         * @memberof cyber_elephant
         * @classdesc Represents a ClusterRequest.
         * @implements IClusterRequest
         * @constructor
         * @param {cyber_elephant.IClusterRequest=} [properties] Properties to set
         */
        function ClusterRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ClusterRequest clusterId.
         * @member {string} clusterId
         * @memberof cyber_elephant.ClusterRequest
         * @instance
         */
        ClusterRequest.prototype.clusterId = "";

        /**
         * ClusterRequest includeDocuments.
         * @member {boolean} includeDocuments
         * @memberof cyber_elephant.ClusterRequest
         * @instance
         */
        ClusterRequest.prototype.includeDocuments = false;

        /**
         * Encodes the specified ClusterRequest message. Does not implicitly {@link cyber_elephant.ClusterRequest.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.ClusterRequest
         * @static
         * @param {cyber_elephant.IClusterRequest} message ClusterRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ClusterRequest.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.clusterId != null && Object.hasOwnProperty.call(message, "clusterId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.clusterId);
            if (message.includeDocuments != null && Object.hasOwnProperty.call(message, "includeDocuments"))
                writer.uint32(/* id 2, wireType 0 =*/16).bool(message.includeDocuments);
            return writer;
        };

        /**
         * Encodes the specified ClusterRequest message, length delimited. Does not implicitly {@link cyber_elephant.ClusterRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.ClusterRequest
         * @static
         * @param {cyber_elephant.IClusterRequest} message ClusterRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ClusterRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a ClusterRequest message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.ClusterRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.ClusterRequest} ClusterRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ClusterRequest.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.ClusterRequest();
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
                        message.includeDocuments = reader.bool();
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
         * Decodes a ClusterRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.ClusterRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.ClusterRequest} ClusterRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ClusterRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for ClusterRequest
         * @function getTypeUrl
         * @memberof cyber_elephant.ClusterRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ClusterRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.ClusterRequest";
        };

        return ClusterRequest;
    })();

    cyber_elephant.ClusterResponse = (function() {

        /**
         * Properties of a ClusterResponse.
         * @memberof cyber_elephant
         * @interface IClusterResponse
         * @property {Array.<cyber_elephant.IDocumentCluster>|null} [clusters] ClusterResponse clusters
         * @property {cyber_elephant.IQueryStatistics|null} [stats] ClusterResponse stats
         */

        /**
         * Constructs a new ClusterResponse.
         * @memberof cyber_elephant
         * @classdesc Represents a ClusterResponse.
         * @implements IClusterResponse
         * @constructor
         * @param {cyber_elephant.IClusterResponse=} [properties] Properties to set
         */
        function ClusterResponse(properties) {
            this.clusters = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ClusterResponse clusters.
         * @member {Array.<cyber_elephant.IDocumentCluster>} clusters
         * @memberof cyber_elephant.ClusterResponse
         * @instance
         */
        ClusterResponse.prototype.clusters = $util.emptyArray;

        /**
         * ClusterResponse stats.
         * @member {cyber_elephant.IQueryStatistics|null|undefined} stats
         * @memberof cyber_elephant.ClusterResponse
         * @instance
         */
        ClusterResponse.prototype.stats = null;

        /**
         * Encodes the specified ClusterResponse message. Does not implicitly {@link cyber_elephant.ClusterResponse.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.ClusterResponse
         * @static
         * @param {cyber_elephant.IClusterResponse} message ClusterResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ClusterResponse.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.clusters != null && message.clusters.length)
                for (let i = 0; i < message.clusters.length; ++i)
                    $root.cyber_elephant.DocumentCluster.encode(message.clusters[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.stats != null && Object.hasOwnProperty.call(message, "stats"))
                $root.cyber_elephant.QueryStatistics.encode(message.stats, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified ClusterResponse message, length delimited. Does not implicitly {@link cyber_elephant.ClusterResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.ClusterResponse
         * @static
         * @param {cyber_elephant.IClusterResponse} message ClusterResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ClusterResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a ClusterResponse message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.ClusterResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.ClusterResponse} ClusterResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ClusterResponse.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.ClusterResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.clusters && message.clusters.length))
                            message.clusters = [];
                        message.clusters.push($root.cyber_elephant.DocumentCluster.decode(reader, reader.uint32()));
                        break;
                    }
                case 2: {
                        message.stats = $root.cyber_elephant.QueryStatistics.decode(reader, reader.uint32());
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
         * Decodes a ClusterResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.ClusterResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.ClusterResponse} ClusterResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ClusterResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for ClusterResponse
         * @function getTypeUrl
         * @memberof cyber_elephant.ClusterResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ClusterResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.ClusterResponse";
        };

        return ClusterResponse;
    })();

    cyber_elephant.ClusterUpdateRequest = (function() {

        /**
         * Properties of a ClusterUpdateRequest.
         * @memberof cyber_elephant
         * @interface IClusterUpdateRequest
         * @property {string|null} [clusterId] ClusterUpdateRequest clusterId
         * @property {cyber_elephant.IProcessingOptions|null} [options] ClusterUpdateRequest options
         */

        /**
         * Constructs a new ClusterUpdateRequest.
         * @memberof cyber_elephant
         * @classdesc Represents a ClusterUpdateRequest.
         * @implements IClusterUpdateRequest
         * @constructor
         * @param {cyber_elephant.IClusterUpdateRequest=} [properties] Properties to set
         */
        function ClusterUpdateRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ClusterUpdateRequest clusterId.
         * @member {string} clusterId
         * @memberof cyber_elephant.ClusterUpdateRequest
         * @instance
         */
        ClusterUpdateRequest.prototype.clusterId = "";

        /**
         * ClusterUpdateRequest options.
         * @member {cyber_elephant.IProcessingOptions|null|undefined} options
         * @memberof cyber_elephant.ClusterUpdateRequest
         * @instance
         */
        ClusterUpdateRequest.prototype.options = null;

        /**
         * Encodes the specified ClusterUpdateRequest message. Does not implicitly {@link cyber_elephant.ClusterUpdateRequest.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.ClusterUpdateRequest
         * @static
         * @param {cyber_elephant.IClusterUpdateRequest} message ClusterUpdateRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ClusterUpdateRequest.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.clusterId != null && Object.hasOwnProperty.call(message, "clusterId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.clusterId);
            if (message.options != null && Object.hasOwnProperty.call(message, "options"))
                $root.cyber_elephant.ProcessingOptions.encode(message.options, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified ClusterUpdateRequest message, length delimited. Does not implicitly {@link cyber_elephant.ClusterUpdateRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.ClusterUpdateRequest
         * @static
         * @param {cyber_elephant.IClusterUpdateRequest} message ClusterUpdateRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ClusterUpdateRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a ClusterUpdateRequest message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.ClusterUpdateRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.ClusterUpdateRequest} ClusterUpdateRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ClusterUpdateRequest.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.ClusterUpdateRequest();
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
                        message.options = $root.cyber_elephant.ProcessingOptions.decode(reader, reader.uint32());
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
         * Decodes a ClusterUpdateRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.ClusterUpdateRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.ClusterUpdateRequest} ClusterUpdateRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ClusterUpdateRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for ClusterUpdateRequest
         * @function getTypeUrl
         * @memberof cyber_elephant.ClusterUpdateRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ClusterUpdateRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.ClusterUpdateRequest";
        };

        return ClusterUpdateRequest;
    })();

    cyber_elephant.StatusRequest = (function() {

        /**
         * Properties of a StatusRequest.
         * @memberof cyber_elephant
         * @interface IStatusRequest
         * @property {boolean|null} [includeMetrics] StatusRequest includeMetrics
         */

        /**
         * Constructs a new StatusRequest.
         * @memberof cyber_elephant
         * @classdesc Represents a StatusRequest.
         * @implements IStatusRequest
         * @constructor
         * @param {cyber_elephant.IStatusRequest=} [properties] Properties to set
         */
        function StatusRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * StatusRequest includeMetrics.
         * @member {boolean} includeMetrics
         * @memberof cyber_elephant.StatusRequest
         * @instance
         */
        StatusRequest.prototype.includeMetrics = false;

        /**
         * Encodes the specified StatusRequest message. Does not implicitly {@link cyber_elephant.StatusRequest.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.StatusRequest
         * @static
         * @param {cyber_elephant.IStatusRequest} message StatusRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        StatusRequest.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.includeMetrics != null && Object.hasOwnProperty.call(message, "includeMetrics"))
                writer.uint32(/* id 1, wireType 0 =*/8).bool(message.includeMetrics);
            return writer;
        };

        /**
         * Encodes the specified StatusRequest message, length delimited. Does not implicitly {@link cyber_elephant.StatusRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.StatusRequest
         * @static
         * @param {cyber_elephant.IStatusRequest} message StatusRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        StatusRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a StatusRequest message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.StatusRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.StatusRequest} StatusRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        StatusRequest.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.StatusRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.includeMetrics = reader.bool();
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
         * Decodes a StatusRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof cyber_elephant.StatusRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.StatusRequest} StatusRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        StatusRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Gets the default type url for StatusRequest
         * @function getTypeUrl
         * @memberof cyber_elephant.StatusRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        StatusRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.StatusRequest";
        };

        return StatusRequest;
    })();

    cyber_elephant.HealthRequest = (function() {

        /**
         * Properties of a HealthRequest.
         * @memberof cyber_elephant
         * @interface IHealthRequest
         * @property {string|null} [component] HealthRequest component
         */

        /**
         * Constructs a new HealthRequest.
         * @memberof cyber_elephant
         * @classdesc Represents a HealthRequest.
         * @implements IHealthRequest
         * @constructor
         * @param {cyber_elephant.IHealthRequest=} [properties] Properties to set
         */
        function HealthRequest(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * HealthRequest component.
         * @member {string} component
         * @memberof cyber_elephant.HealthRequest
         * @instance
         */
        HealthRequest.prototype.component = "";

        /**
         * Encodes the specified HealthRequest message. Does not implicitly {@link cyber_elephant.HealthRequest.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.HealthRequest
         * @static
         * @param {cyber_elephant.IHealthRequest} message HealthRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HealthRequest.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.component != null && Object.hasOwnProperty.call(message, "component"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.component);
            return writer;
        };

        /**
         * Encodes the specified HealthRequest message, length delimited. Does not implicitly {@link cyber_elephant.HealthRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.HealthRequest
         * @static
         * @param {cyber_elephant.IHealthRequest} message HealthRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HealthRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a HealthRequest message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.HealthRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.HealthRequest} HealthRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        HealthRequest.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.HealthRequest();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.component = reader.string();
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
         * @memberof cyber_elephant.HealthRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.HealthRequest} HealthRequest
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
         * @memberof cyber_elephant.HealthRequest
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        HealthRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.HealthRequest";
        };

        return HealthRequest;
    })();

    cyber_elephant.HealthResponse = (function() {

        /**
         * Properties of a HealthResponse.
         * @memberof cyber_elephant
         * @interface IHealthResponse
         * @property {boolean|null} [healthy] HealthResponse healthy
         * @property {string|null} [status] HealthResponse status
         * @property {Object.<string,string>|null} [details] HealthResponse details
         */

        /**
         * Constructs a new HealthResponse.
         * @memberof cyber_elephant
         * @classdesc Represents a HealthResponse.
         * @implements IHealthResponse
         * @constructor
         * @param {cyber_elephant.IHealthResponse=} [properties] Properties to set
         */
        function HealthResponse(properties) {
            this.details = {};
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * HealthResponse healthy.
         * @member {boolean} healthy
         * @memberof cyber_elephant.HealthResponse
         * @instance
         */
        HealthResponse.prototype.healthy = false;

        /**
         * HealthResponse status.
         * @member {string} status
         * @memberof cyber_elephant.HealthResponse
         * @instance
         */
        HealthResponse.prototype.status = "";

        /**
         * HealthResponse details.
         * @member {Object.<string,string>} details
         * @memberof cyber_elephant.HealthResponse
         * @instance
         */
        HealthResponse.prototype.details = $util.emptyObject;

        /**
         * Encodes the specified HealthResponse message. Does not implicitly {@link cyber_elephant.HealthResponse.verify|verify} messages.
         * @function encode
         * @memberof cyber_elephant.HealthResponse
         * @static
         * @param {cyber_elephant.IHealthResponse} message HealthResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HealthResponse.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.healthy != null && Object.hasOwnProperty.call(message, "healthy"))
                writer.uint32(/* id 1, wireType 0 =*/8).bool(message.healthy);
            if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.status);
            if (message.details != null && Object.hasOwnProperty.call(message, "details"))
                for (let keys = Object.keys(message.details), i = 0; i < keys.length; ++i)
                    writer.uint32(/* id 3, wireType 2 =*/26).fork().uint32(/* id 1, wireType 2 =*/10).string(keys[i]).uint32(/* id 2, wireType 2 =*/18).string(message.details[keys[i]]).ldelim();
            return writer;
        };

        /**
         * Encodes the specified HealthResponse message, length delimited. Does not implicitly {@link cyber_elephant.HealthResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof cyber_elephant.HealthResponse
         * @static
         * @param {cyber_elephant.IHealthResponse} message HealthResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        HealthResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a HealthResponse message from the specified reader or buffer.
         * @function decode
         * @memberof cyber_elephant.HealthResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {cyber_elephant.HealthResponse} HealthResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        HealthResponse.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.cyber_elephant.HealthResponse(), key, value;
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.healthy = reader.bool();
                        break;
                    }
                case 2: {
                        message.status = reader.string();
                        break;
                    }
                case 3: {
                        if (message.details === $util.emptyObject)
                            message.details = {};
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
                                reader.skipType(tag2 & 7);
                                break;
                            }
                        }
                        message.details[key] = value;
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
         * @memberof cyber_elephant.HealthResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {cyber_elephant.HealthResponse} HealthResponse
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
         * @memberof cyber_elephant.HealthResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        HealthResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/cyber_elephant.HealthResponse";
        };

        return HealthResponse;
    })();

    return cyber_elephant;
})();

export { $root as default };
