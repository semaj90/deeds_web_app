import * as $protobuf from 'protobufjs';
import Long = require('long');
/** Namespace legal. */
export namespace legal {
 /** Namespace api. */
 namespace api {
 /** Properties of a User. */
 interface IUser {
 /** User id */
 id?: string | null;

 /** User email */
 email?: string | null;

 /** User name */
 name?: string | null;

 /** User roles */
 roles?: string[] | null;

 /** User createdAt */
 createdAt?: google.protobuf.ITimestamp: null;

 /** User updatedAt */
 updatedAt?: google.protobuf.ITimestamp: null;

 /** User preferences */
 preferences?: legal.api.IUserPreferences: null;
 }

 /** Represents a User. */
 class User implements IUser {
 /**
 * Constructs a new User.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IUser);

 /** User id. */
 public id: string;

 /** User email. */
 public email: string;

 /** User name. */
 public name: string;

 /** User roles. */
 public roles: string[];

 /** User createdAt. */
 public createdAt?: google.protobuf.ITimestamp: null;

 /** User updatedAt. */
 public updatedAt?: google.protobuf.ITimestamp: null;

 /** User preferences. */
 public preferences?: legal.api.IUserPreferences: null;

 /**
 * Creates a new User instance using the specified properties.
 * @param [properties] Properties to set
 * @returns User instance
 */
 public static create(properties?: legal.api.IUser): legal.api.User;

 /**
 * Encodes the specified User message. Does not implicitly {@link legal.api.User.verify|verify} messages.
 * @param message User message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(message: legal.api.IUser, writer?: $protobuf.Writer): $protobuf.Writer;

 /**
 * Encodes the specified User message, length delimited. Does not implicitly {@link legal.api.User.verify|verify} messages.
 * @param message User message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IUser,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a User message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns User
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(reader: $protobuf.Reader | Uint8Array, length?: number): legal.api.User;

 /**
 * Decodes a User message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns User
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.User;

 /**
 * Verifies a User message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a User message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns User
 */
 public static fromObject(object: { [k: string]: any }): legal.api.User;

 /**
 * Creates a plain object from a User message. Also converts values to other types if specified.
 * @param message User
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.User,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this User to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for User
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a UserPreferences. */
 interface IUserPreferences {
 /** UserPreferences theme */
 theme?: string | null;

 /** UserPreferences language */
 language?: string | null;

 /** UserPreferences notificationsEnabled */
 notificationsEnabled?: boolean | null;

 /** UserPreferences analyticsOptIn */
 analyticsOptIn?: boolean | null;
 }

 /** Represents a UserPreferences. */
 class UserPreferences implements IUserPreferences {
 /**
 * Constructs a new UserPreferences.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IUserPreferences);

 /** UserPreferences theme. */
 public theme: string;

 /** UserPreferences language. */
 public language: string;

 /** UserPreferences notificationsEnabled. */
 public notificationsEnabled: boolean;

 /** UserPreferences analyticsOptIn. */
 public analyticsOptIn: boolean;

 /**
 * Creates a new UserPreferences instance using the specified properties.
 * @param [properties] Properties to set
 * @returns UserPreferences instance
 */
 public static create(properties?: legal.api.IUserPreferences): legal.api.UserPreferences;

 /**
 * Encodes the specified UserPreferences message. Does not implicitly {@link legal.api.UserPreferences.verify|verify} messages.
 * @param message UserPreferences message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IUserPreferences,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified UserPreferences message, length delimited. Does not implicitly {@link legal.api.UserPreferences.verify|verify} messages.
 * @param message UserPreferences message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IUserPreferences,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a UserPreferences message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns UserPreferences
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.UserPreferences;

 /**
 * Decodes a UserPreferences message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns UserPreferences
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.UserPreferences;

 /**
 * Verifies a UserPreferences message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a UserPreferences message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns UserPreferences
 */
 public static fromObject(object: { [k: string]: any }): legal.api.UserPreferences;

 /**
 * Creates a plain object from a UserPreferences message. Also converts values to other types if specified.
 * @param message UserPreferences
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.UserPreferences,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this UserPreferences to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for UserPreferences
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of an AuthRequest. */
 interface IAuthRequest {
 /** AuthRequest email */
 email?: string | null;

 /** AuthRequest password */
 password?: string | null;

 /** AuthRequest rememberMe */
 rememberMe?: boolean | null;

 /** AuthRequest clientInfo */
 clientInfo?: string | null;
 }

 /** Represents an AuthRequest. */
 class AuthRequest implements IAuthRequest {
 /**
 * Constructs a new AuthRequest.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IAuthRequest);

 /** AuthRequest email. */
 public email: string;

 /** AuthRequest password. */
 public password: string;

 /** AuthRequest rememberMe. */
 public rememberMe: boolean;

 /** AuthRequest clientInfo. */
 public clientInfo: string;

 /**
 * Creates a new AuthRequest instance using the specified properties.
 * @param [properties] Properties to set
 * @returns AuthRequest instance
 */
 public static create(properties?: legal.api.IAuthRequest): legal.api.AuthRequest;

 /**
 * Encodes the specified AuthRequest message. Does not implicitly {@link legal.api.AuthRequest.verify|verify} messages.
 * @param message AuthRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IAuthRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified AuthRequest message, length delimited. Does not implicitly {@link legal.api.AuthRequest.verify|verify} messages.
 * @param message AuthRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IAuthRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes an AuthRequest message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns AuthRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.AuthRequest;

 /**
 * Decodes an AuthRequest message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns AuthRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.AuthRequest;

 /**
 * Verifies an AuthRequest message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates an AuthRequest message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns AuthRequest
 */
 public static fromObject(object: { [k: string]: any }): legal.api.AuthRequest;

 /**
 * Creates a plain object from an AuthRequest message. Also converts values to other types if specified.
 * @param message AuthRequest
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.AuthRequest,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this AuthRequest to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for AuthRequest
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of an AuthResponse. */
 interface IAuthResponse {
 /** AuthResponse success */
 success?: boolean | null;

 /** AuthResponse token */
 token?: string | null;

 /** AuthResponse user */
 user?: legal.api.IUser: null;

 /** AuthResponse errorMessage */
 errorMessage?: string | null;

 /** AuthResponse expiresAt */
 expiresAt?: number | Long: null;
 }

 /** Represents an AuthResponse. */
 class AuthResponse implements IAuthResponse {
 /**
 * Constructs a new AuthResponse.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IAuthResponse);

 /** AuthResponse success. */
 public success: boolean;

 /** AuthResponse token. */
 public token: string;

 /** AuthResponse user. */
 public user?: legal.api.IUser: null;

 /** AuthResponse errorMessage. */
 public errorMessage: string;

 /** AuthResponse expiresAt. */
 public expiresAt: number | Long;

 /**
 * Creates a new AuthResponse instance using the specified properties.
 * @param [properties] Properties to set
 * @returns AuthResponse instance
 */
 public static create(properties?: legal.api.IAuthResponse): legal.api.AuthResponse;

 /**
 * Encodes the specified AuthResponse message. Does not implicitly {@link legal.api.AuthResponse.verify|verify} messages.
 * @param message AuthResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IAuthResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified AuthResponse message, length delimited. Does not implicitly {@link legal.api.AuthResponse.verify|verify} messages.
 * @param message AuthResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IAuthResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes an AuthResponse message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns AuthResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.AuthResponse;

 /**
 * Decodes an AuthResponse message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns AuthResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.AuthResponse;

 /**
 * Verifies an AuthResponse message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates an AuthResponse message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns AuthResponse
 */
 public static fromObject(object: { [k: string]: any }): legal.api.AuthResponse;

 /**
 * Creates a plain object from an AuthResponse message. Also converts values to other types if specified.
 * @param message AuthResponse
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.AuthResponse,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this AuthResponse to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for AuthResponse
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a LegalDocument. */
 interface ILegalDocument {
 /** LegalDocument id */
 id?: string | null;

 /** LegalDocument title */
 title?: string | null;

 /** LegalDocument content */
 content?: string | null;

 /** LegalDocument fileUrl */
 fileUrl?: string | null;

 /** LegalDocument type */
 type?: legal.api.DocumentType: null;

 /** LegalDocument tags */
 tags?: string[] | null;

 /** LegalDocument metadata */
 metadata?: legal.api.IDocumentMetadata: null;

 /** LegalDocument createdAt */
 createdAt?: google.protobuf.ITimestamp: null;

 /** LegalDocument updatedAt */
 updatedAt?: google.protobuf.ITimestamp: null;

 /** LegalDocument ownerId */
 ownerId?: string | null;

 /** LegalDocument collaboratorIds */
 collaboratorIds?: string[] | null;

 /** LegalDocument status */
 status?: legal.api.DocumentStatus: null;

 /** LegalDocument securityLevel */
 securityLevel?: legal.api.SecurityLevel: null;
 }

 /** Represents a LegalDocument. */
 class LegalDocument implements ILegalDocument {
 /**
 * Constructs a new LegalDocument.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ILegalDocument);

 /** LegalDocument id. */
 public id: string;

 /** LegalDocument title. */
 public title: string;

 /** LegalDocument content. */
 public content: string;

 /** LegalDocument fileUrl. */
 public fileUrl: string;

 /** LegalDocument type. */
 public type: legal.api.DocumentType;

 /** LegalDocument tags. */
 public tags: string[];

 /** LegalDocument metadata. */
 public metadata?: legal.api.IDocumentMetadata: null;

 /** LegalDocument createdAt. */
 public createdAt?: google.protobuf.ITimestamp: null;

 /** LegalDocument updatedAt. */
 public updatedAt?: google.protobuf.ITimestamp: null;

 /** LegalDocument ownerId. */
 public ownerId: string;

 /** LegalDocument collaboratorIds. */
 public collaboratorIds: string[];

 /** LegalDocument status. */
 public status: legal.api.DocumentStatus;

 /** LegalDocument securityLevel. */
 public securityLevel: legal.api.SecurityLevel;

 /**
 * Creates a new LegalDocument instance using the specified properties.
 * @param [properties] Properties to set
 * @returns LegalDocument instance
 */
 public static create(properties?: legal.api.ILegalDocument): legal.api.LegalDocument;

 /**
 * Encodes the specified LegalDocument message. Does not implicitly {@link legal.api.LegalDocument.verify|verify} messages.
 * @param message LegalDocument message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ILegalDocument,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified LegalDocument message, length delimited. Does not implicitly {@link legal.api.LegalDocument.verify|verify} messages.
 * @param message LegalDocument message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ILegalDocument,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a LegalDocument message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns LegalDocument
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.LegalDocument;

 /**
 * Decodes a LegalDocument message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns LegalDocument
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.LegalDocument;

 /**
 * Verifies a LegalDocument message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a LegalDocument message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns LegalDocument
 */
 public static fromObject(object: { [k: string]: any }): legal.api.LegalDocument;

 /**
 * Creates a plain object from a LegalDocument message. Also converts values to other types if specified.
 * @param message LegalDocument
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.LegalDocument,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this LegalDocument to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for LegalDocument
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** DocumentType enum. */
 enum DocumentType {
 DOCUMENT_TYPE_UNKNOWN = 0,
 DOCUMENT_TYPE_CONTRACT = 1,
 DOCUMENT_TYPE_BRIEF = 2,
 DOCUMENT_TYPE_EVIDENCE = 3,
 DOCUMENT_TYPE_CITATION = 4,
 DOCUMENT_TYPE_RULING = 5,
 DOCUMENT_TYPE_MOTION = 6,
 DOCUMENT_TYPE_PLEADING = 7,
 DOCUMENT_TYPE_CORRESPONDENCE = 8,
 }

 /** DocumentStatus enum. */
 enum DocumentStatus {
 DOCUMENT_STATUS_DRAFT = 0,
 DOCUMENT_STATUS_REVIEW = 1,
 DOCUMENT_STATUS_APPROVED = 2,
 DOCUMENT_STATUS_ARCHIVED = 3,
 DOCUMENT_STATUS_DELETED = 4,
 }

 /** SecurityLevel enum. */
 enum SecurityLevel {
 SECURITY_LEVEL_PUBLIC = 0,
 SECURITY_LEVEL_INTERNAL = 1,
 SECURITY_LEVEL_CONFIDENTIAL = 2,
 SECURITY_LEVEL_RESTRICTED = 3,
 }

 /** Properties of a DocumentMetadata. */
 interface IDocumentMetadata {
 /** DocumentMetadata jurisdiction */
 jurisdiction?: string | null;

 /** DocumentMetadata courtLevel */
 courtLevel?: string | null;

 /** DocumentMetadata parties */
 parties?: legal.api.IParty[] | null;

 /** DocumentMetadata practiceAreas */
 practiceAreas?: string[] | null;

 /** DocumentMetadata confidenceScore */
 confidenceScore?: number | null;

 /** DocumentMetadata riskLevel */
 riskLevel?: string | null;

 /** DocumentMetadata keyTerms */
 keyTerms?: string[] | null;

 /** DocumentMetadata citations */
 citations?: legal.api.ILegalCitation[] | null;

 /** DocumentMetadata caseInfo */
 caseInfo?: legal.api.ICaseInformation: null;
 }

 /** Represents a DocumentMetadata. */
 class DocumentMetadata implements IDocumentMetadata {
 /**
 * Constructs a new DocumentMetadata.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IDocumentMetadata);

 /** DocumentMetadata jurisdiction. */
 public jurisdiction: string;

 /** DocumentMetadata courtLevel. */
 public courtLevel: string;

 /** DocumentMetadata parties. */
 public parties: legal.api.IParty[];

 /** DocumentMetadata practiceAreas. */
 public practiceAreas: string[];

 /** DocumentMetadata confidenceScore. */
 public confidenceScore: number;

 /** DocumentMetadata riskLevel. */
 public riskLevel: string;

 /** DocumentMetadata keyTerms. */
 public keyTerms: string[];

 /** DocumentMetadata citations. */
 public citations: legal.api.ILegalCitation[];

 /** DocumentMetadata caseInfo. */
 public caseInfo?: legal.api.ICaseInformation: null;

 /**
 * Creates a new DocumentMetadata instance using the specified properties.
 * @param [properties] Properties to set
 * @returns DocumentMetadata instance
 */
 public static create(properties?: legal.api.IDocumentMetadata): legal.api.DocumentMetadata;

 /**
 * Encodes the specified DocumentMetadata message. Does not implicitly {@link legal.api.DocumentMetadata.verify|verify} messages.
 * @param message DocumentMetadata message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IDocumentMetadata,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified DocumentMetadata message, length delimited. Does not implicitly {@link legal.api.DocumentMetadata.verify|verify} messages.
 * @param message DocumentMetadata message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IDocumentMetadata,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a DocumentMetadata message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns DocumentMetadata
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.DocumentMetadata;

 /**
 * Decodes a DocumentMetadata message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns DocumentMetadata
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.DocumentMetadata;

 /**
 * Verifies a DocumentMetadata message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a DocumentMetadata message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns DocumentMetadata
 */
 public static fromObject(object: { [k: string]: any }): legal.api.DocumentMetadata;

 /**
 * Creates a plain object from a DocumentMetadata message. Also converts values to other types if specified.
 * @param message DocumentMetadata
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.DocumentMetadata,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this DocumentMetadata to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for DocumentMetadata
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a Party. */
 interface IParty {
 /** Party name */
 name?: string | null;

 /** Party role */
 role?: string | null;

 /** Party type */
 type?: string | null;

 /** Party contact */
 contact?: legal.api.IContactInfo: null;
 }

 /** Represents a Party. */
 class Party implements IParty {
 /**
 * Constructs a new Party.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IParty);

 /** Party name. */
 public name: string;

 /** Party role. */
 public role: string;

 /** Party type. */
 public type: string;

 /** Party contact. */
 public contact?: legal.api.IContactInfo: null;

 /**
 * Creates a new Party instance using the specified properties.
 * @param [properties] Properties to set
 * @returns Party instance
 */
 public static create(properties?: legal.api.IParty): legal.api.Party;

 /**
 * Encodes the specified Party message. Does not implicitly {@link legal.api.Party.verify|verify} messages.
 * @param message Party message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(message: legal.api.IParty, writer?: $protobuf.Writer): $protobuf.Writer;

 /**
 * Encodes the specified Party message, length delimited. Does not implicitly {@link legal.api.Party.verify|verify} messages.
 * @param message Party message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IParty,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a Party message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns Party
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(reader: $protobuf.Reader | Uint8Array, length?: number): legal.api.Party;

 /**
 * Decodes a Party message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns Party
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.Party;

 /**
 * Verifies a Party message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a Party message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns Party
 */
 public static fromObject(object: { [k: string]: any }): legal.api.Party;

 /**
 * Creates a plain object from a Party message. Also converts values to other types if specified.
 * @param message Party
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.Party,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this Party to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for Party
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a ContactInfo. */
 interface IContactInfo {
 /** ContactInfo address */
 address?: string | null;

 /** ContactInfo phone */
 phone?: string | null;

 /** ContactInfo email */
 email?: string | null;

 /** ContactInfo lawFirm */
 lawFirm?: string | null;
 }

 /** Represents a ContactInfo. */
 class ContactInfo implements IContactInfo {
 /**
 * Constructs a new ContactInfo.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IContactInfo);

 /** ContactInfo address. */
 public address: string;

 /** ContactInfo phone. */
 public phone: string;

 /** ContactInfo email. */
 public email: string;

 /** ContactInfo lawFirm. */
 public lawFirm: string;

 /**
 * Creates a new ContactInfo instance using the specified properties.
 * @param [properties] Properties to set
 * @returns ContactInfo instance
 */
 public static create(properties?: legal.api.IContactInfo): legal.api.ContactInfo;

 /**
 * Encodes the specified ContactInfo message. Does not implicitly {@link legal.api.ContactInfo.verify|verify} messages.
 * @param message ContactInfo message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IContactInfo,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified ContactInfo message, length delimited. Does not implicitly {@link legal.api.ContactInfo.verify|verify} messages.
 * @param message ContactInfo message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IContactInfo,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a ContactInfo message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns ContactInfo
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.ContactInfo;

 /**
 * Decodes a ContactInfo message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns ContactInfo
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.ContactInfo;

 /**
 * Verifies a ContactInfo message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a ContactInfo message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns ContactInfo
 */
 public static fromObject(object: { [k: string]: any }): legal.api.ContactInfo;

 /**
 * Creates a plain object from a ContactInfo message. Also converts values to other types if specified.
 * @param message ContactInfo
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.ContactInfo,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this ContactInfo to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for ContactInfo
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a LegalCitation. */
 interface ILegalCitation {
 /** LegalCitation citationText */
 citationText?: string | null;

 /** LegalCitation source */
 source?: string | null;

 /** LegalCitation url */
 url?: string | null;

 /** LegalCitation type */
 type?: legal.api.CitationType: null;
 }

 /** Represents a LegalCitation. */
 class LegalCitation implements ILegalCitation {
 /**
 * Constructs a new LegalCitation.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ILegalCitation);

 /** LegalCitation citationText. */
 public citationText: string;

 /** LegalCitation source. */
 public source: string;

 /** LegalCitation url. */
 public url: string;

 /** LegalCitation type. */
 public type: legal.api.CitationType;

 /**
 * Creates a new LegalCitation instance using the specified properties.
 * @param [properties] Properties to set
 * @returns LegalCitation instance
 */
 public static create(properties?: legal.api.ILegalCitation): legal.api.LegalCitation;

 /**
 * Encodes the specified LegalCitation message. Does not implicitly {@link legal.api.LegalCitation.verify|verify} messages.
 * @param message LegalCitation message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ILegalCitation,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified LegalCitation message, length delimited. Does not implicitly {@link legal.api.LegalCitation.verify|verify} messages.
 * @param message LegalCitation message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ILegalCitation,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a LegalCitation message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns LegalCitation
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.LegalCitation;

 /**
 * Decodes a LegalCitation message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns LegalCitation
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.LegalCitation;

 /**
 * Verifies a LegalCitation message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a LegalCitation message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns LegalCitation
 */
 public static fromObject(object: { [k: string]: any }): legal.api.LegalCitation;

 /**
 * Creates a plain object from a LegalCitation message. Also converts values to other types if specified.
 * @param message LegalCitation
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.LegalCitation,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this LegalCitation to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for LegalCitation
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** CitationType enum. */
 enum CitationType {
 CITATION_TYPE_CASE_LAW = 0,
 CITATION_TYPE_STATUTE = 1,
 CITATION_TYPE_REGULATION = 2,
 CITATION_TYPE_SECONDARY = 3,
 }

 /** Properties of a CaseInformation. */
 interface ICaseInformation {
 /** CaseInformation caseNumber */
 caseNumber?: string | null;

 /** CaseInformation courtName */
 courtName?: string | null;

 /** CaseInformation filingDate */
 filingDate?: google.protobuf.ITimestamp: null;

 /** CaseInformation status */
 status?: legal.api.CaseStatus: null;

 /** CaseInformation judges */
 judges?: string[] | null;
 }

 /** Represents a CaseInformation. */
 class CaseInformation implements ICaseInformation {
 /**
 * Constructs a new CaseInformation.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ICaseInformation);

 /** CaseInformation caseNumber. */
 public caseNumber: string;

 /** CaseInformation courtName. */
 public courtName: string;

 /** CaseInformation filingDate. */
 public filingDate?: google.protobuf.ITimestamp: null;

 /** CaseInformation status. */
 public status: legal.api.CaseStatus;

 /** CaseInformation judges. */
 public judges: string[];

 /**
 * Creates a new CaseInformation instance using the specified properties.
 * @param [properties] Properties to set
 * @returns CaseInformation instance
 */
 public static create(properties?: legal.api.ICaseInformation): legal.api.CaseInformation;

 /**
 * Encodes the specified CaseInformation message. Does not implicitly {@link legal.api.CaseInformation.verify|verify} messages.
 * @param message CaseInformation message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ICaseInformation,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified CaseInformation message, length delimited. Does not implicitly {@link legal.api.CaseInformation.verify|verify} messages.
 * @param message CaseInformation message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ICaseInformation,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a CaseInformation message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns CaseInformation
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.CaseInformation;

 /**
 * Decodes a CaseInformation message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns CaseInformation
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.CaseInformation;

 /**
 * Verifies a CaseInformation message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a CaseInformation message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns CaseInformation
 */
 public static fromObject(object: { [k: string]: any }): legal.api.CaseInformation;

 /**
 * Creates a plain object from a CaseInformation message. Also converts values to other types if specified.
 * @param message CaseInformation
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.CaseInformation,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this CaseInformation to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for CaseInformation
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** CaseStatus enum. */
 enum CaseStatus {
 CASE_STATUS_PENDING = 0,
 CASE_STATUS_ACTIVE = 1,
 CASE_STATUS_SETTLED = 2,
 CASE_STATUS_DISMISSED = 3,
 CASE_STATUS_DECIDED = 4,
 CASE_STATUS_APPEALED = 5,
 }

 /** Properties of a SearchRequest. */
 interface ISearchRequest {
 /** SearchRequest query */
 query?: string | null;

 /** SearchRequest filters */
 filters?: legal.api.ISearchFilter[] | null;

 /** SearchRequest limit */
 limit?: number | null;

 /** SearchRequest offset */
 offset?: number | null;

 /** SearchRequest type */
 type?: legal.api.SearchType: null;

 /** SearchRequest includeEmbeddings */
 includeEmbeddings?: boolean | null;

 /** SearchRequest sort */
 sort?: legal.api.ISortOptions: null;

 /** SearchRequest userId */
 userId?: string | null;
 }

 /** Represents a SearchRequest. */
 class SearchRequest implements ISearchRequest {
 /**
 * Constructs a new SearchRequest.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ISearchRequest);

 /** SearchRequest query. */
 public query: string;

 /** SearchRequest filters. */
 public filters: legal.api.ISearchFilter[];

 /** SearchRequest limit. */
 public limit: number;

 /** SearchRequest offset. */
 public offset: number;

 /** SearchRequest type. */
 public type: legal.api.SearchType;

 /** SearchRequest includeEmbeddings. */
 public includeEmbeddings: boolean;

 /** SearchRequest sort. */
 public sort?: legal.api.ISortOptions: null;

 /** SearchRequest userId. */
 public userId: string;

 /**
 * Creates a new SearchRequest instance using the specified properties.
 * @param [properties] Properties to set
 * @returns SearchRequest instance
 */
 public static create(properties?: legal.api.ISearchRequest): legal.api.SearchRequest;

 /**
 * Encodes the specified SearchRequest message. Does not implicitly {@link legal.api.SearchRequest.verify|verify} messages.
 * @param message SearchRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ISearchRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified SearchRequest message, length delimited. Does not implicitly {@link legal.api.SearchRequest.verify|verify} messages.
 * @param message SearchRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ISearchRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a SearchRequest message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns SearchRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.SearchRequest;

 /**
 * Decodes a SearchRequest message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns SearchRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.SearchRequest;

 /**
 * Verifies a SearchRequest message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a SearchRequest message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns SearchRequest
 */
 public static fromObject(object: { [k: string]: any }): legal.api.SearchRequest;

 /**
 * Creates a plain object from a SearchRequest message. Also converts values to other types if specified.
 * @param message SearchRequest
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.SearchRequest,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this SearchRequest to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for SearchRequest
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a SearchFilter. */
 interface ISearchFilter {
 /** SearchFilter field */
 field?: string | null;

 /** SearchFilter operator */
 operator?: string | null;

 /** SearchFilter values */
 values?: string[] | null;
 }

 /** Represents a SearchFilter. */
 class SearchFilter implements ISearchFilter {
 /**
 * Constructs a new SearchFilter.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ISearchFilter);

 /** SearchFilter field. */
 public field: string;

 /** SearchFilter operator. */
 public operator: string;

 /** SearchFilter values. */
 public values: string[];

 /**
 * Creates a new SearchFilter instance using the specified properties.
 * @param [properties] Properties to set
 * @returns SearchFilter instance
 */
 public static create(properties?: legal.api.ISearchFilter): legal.api.SearchFilter;

 /**
 * Encodes the specified SearchFilter message. Does not implicitly {@link legal.api.SearchFilter.verify|verify} messages.
 * @param message SearchFilter message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ISearchFilter,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified SearchFilter message, length delimited. Does not implicitly {@link legal.api.SearchFilter.verify|verify} messages.
 * @param message SearchFilter message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ISearchFilter,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a SearchFilter message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns SearchFilter
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.SearchFilter;

 /**
 * Decodes a SearchFilter message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns SearchFilter
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.SearchFilter;

 /**
 * Verifies a SearchFilter message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a SearchFilter message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns SearchFilter
 */
 public static fromObject(object: { [k: string]: any }): legal.api.SearchFilter;

 /**
 * Creates a plain object from a SearchFilter message. Also converts values to other types if specified.
 * @param message SearchFilter
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.SearchFilter,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this SearchFilter to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for SearchFilter
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a SortOptions. */
 interface ISortOptions {
 /** SortOptions field */
 field?: string | null;

 /** SortOptions descending */
 descending?: boolean | null;
 }

 /** Represents a SortOptions. */
 class SortOptions implements ISortOptions {
 /**
 * Constructs a new SortOptions.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ISortOptions);

 /** SortOptions field. */
 public field: string;

 /** SortOptions descending. */
 public descending: boolean;

 /**
 * Creates a new SortOptions instance using the specified properties.
 * @param [properties] Properties to set
 * @returns SortOptions instance
 */
 public static create(properties?: legal.api.ISortOptions): legal.api.SortOptions;

 /**
 * Encodes the specified SortOptions message. Does not implicitly {@link legal.api.SortOptions.verify|verify} messages.
 * @param message SortOptions message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ISortOptions,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified SortOptions message, length delimited. Does not implicitly {@link legal.api.SortOptions.verify|verify} messages.
 * @param message SortOptions message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ISortOptions,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a SortOptions message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns SortOptions
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.SortOptions;

 /**
 * Decodes a SortOptions message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns SortOptions
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.SortOptions;

 /**
 * Verifies a SortOptions message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a SortOptions message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns SortOptions
 */
 public static fromObject(object: { [k: string]: any }): legal.api.SortOptions;

 /**
 * Creates a plain object from a SortOptions message. Also converts values to other types if specified.
 * @param message SortOptions
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.SortOptions,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this SortOptions to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for SortOptions
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** SearchType enum. */
 enum SearchType {
 SEARCH_TYPE_FULL_TEXT = 0,
 SEARCH_TYPE_SEMANTIC = 1,
 SEARCH_TYPE_VECTOR = 2,
 SEARCH_TYPE_HYBRID = 3,
 SEARCH_TYPE_LEGAL_CITATION = 4,
 }

 /** Properties of a SearchResponse. */
 interface ISearchResponse {
 /** SearchResponse results */
 results?: legal.api.ISearchResult[] | null;

 /** SearchResponse totalCount */
 totalCount?: number | null;

 /** SearchResponse maxScore */
 maxScore?: number | null;

 /** SearchResponse queryId */
 queryId?: string | null;

 /** SearchResponse processingTimeMs */
 processingTimeMs?: number | null;

 /** SearchResponse metadata */
 metadata?: legal.api.ISearchMetadata: null;
 }

 /** Represents a SearchResponse. */
 class SearchResponse implements ISearchResponse {
 /**
 * Constructs a new SearchResponse.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ISearchResponse);

 /** SearchResponse results. */
 public results: legal.api.ISearchResult[];

 /** SearchResponse totalCount. */
 public totalCount: number;

 /** SearchResponse maxScore. */
 public maxScore: number;

 /** SearchResponse queryId. */
 public queryId: string;

 /** SearchResponse processingTimeMs. */
 public processingTimeMs: number;

 /** SearchResponse metadata. */
 public metadata?: legal.api.ISearchMetadata: null;

 /**
 * Creates a new SearchResponse instance using the specified properties.
 * @param [properties] Properties to set
 * @returns SearchResponse instance
 */
 public static create(properties?: legal.api.ISearchResponse): legal.api.SearchResponse;

 /**
 * Encodes the specified SearchResponse message. Does not implicitly {@link legal.api.SearchResponse.verify|verify} messages.
 * @param message SearchResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ISearchResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified SearchResponse message, length delimited. Does not implicitly {@link legal.api.SearchResponse.verify|verify} messages.
 * @param message SearchResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ISearchResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a SearchResponse message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns SearchResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.SearchResponse;

 /**
 * Decodes a SearchResponse message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns SearchResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.SearchResponse;

 /**
 * Verifies a SearchResponse message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a SearchResponse message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns SearchResponse
 */
 public static fromObject(object: { [k: string]: any }): legal.api.SearchResponse;

 /**
 * Creates a plain object from a SearchResponse message. Also converts values to other types if specified.
 * @param message SearchResponse
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.SearchResponse,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this SearchResponse to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for SearchResponse
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a SearchResult. */
 interface ISearchResult {
 /** SearchResult document */
 document?: legal.api.ILegalDocument: null;

 /** SearchResult score */
 score?: number | null;

 /** SearchResult highlights */
 highlights?: string[] | null;

 /** SearchResult similarity */
 similarity?: legal.api.IVectorSimilarity: null;

 /** SearchResult excerpt */
 excerpt?: string | null;

 /** SearchResult relatedCitations */
 relatedCitations?: legal.api.ILegalCitation[] | null;
 }

 /** Represents a SearchResult. */
 class SearchResult implements ISearchResult {
 /**
 * Constructs a new SearchResult.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ISearchResult);

 /** SearchResult document. */
 public document?: legal.api.ILegalDocument: null;

 /** SearchResult score. */
 public score: number;

 /** SearchResult highlights. */
 public highlights: string[];

 /** SearchResult similarity. */
 public similarity?: legal.api.IVectorSimilarity: null;

 /** SearchResult excerpt. */
 public excerpt: string;

 /** SearchResult relatedCitations. */
 public relatedCitations: legal.api.ILegalCitation[];

 /**
 * Creates a new SearchResult instance using the specified properties.
 * @param [properties] Properties to set
 * @returns SearchResult instance
 */
 public static create(properties?: legal.api.ISearchResult): legal.api.SearchResult;

 /**
 * Encodes the specified SearchResult message. Does not implicitly {@link legal.api.SearchResult.verify|verify} messages.
 * @param message SearchResult message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ISearchResult,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified SearchResult message, length delimited. Does not implicitly {@link legal.api.SearchResult.verify|verify} messages.
 * @param message SearchResult message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ISearchResult,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a SearchResult message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns SearchResult
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.SearchResult;

 /**
 * Decodes a SearchResult message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns SearchResult
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.SearchResult;

 /**
 * Verifies a SearchResult message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a SearchResult message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns SearchResult
 */
 public static fromObject(object: { [k: string]: any }): legal.api.SearchResult;

 /**
 * Creates a plain object from a SearchResult message. Also converts values to other types if specified.
 * @param message SearchResult
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.SearchResult,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this SearchResult to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for SearchResult
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a VectorSimilarity. */
 interface IVectorSimilarity {
 /** VectorSimilarity cosineSimilarity */
 cosineSimilarity?: number | null;

 /** VectorSimilarity euclideanDistance */
 euclideanDistance?: number | null;

 /** VectorSimilarity embeddingDimension */
 embeddingDimension?: number | null;

 /** VectorSimilarity modelUsed */
 modelUsed?: string | null;
 }

 /** Represents a VectorSimilarity. */
 class VectorSimilarity implements IVectorSimilarity {
 /**
 * Constructs a new VectorSimilarity.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IVectorSimilarity);

 /** VectorSimilarity cosineSimilarity. */
 public cosineSimilarity: number;

 /** VectorSimilarity euclideanDistance. */
 public euclideanDistance: number;

 /** VectorSimilarity embeddingDimension. */
 public embeddingDimension: number;

 /** VectorSimilarity modelUsed. */
 public modelUsed: string;

 /**
 * Creates a new VectorSimilarity instance using the specified properties.
 * @param [properties] Properties to set
 * @returns VectorSimilarity instance
 */
 public static create(properties?: legal.api.IVectorSimilarity): legal.api.VectorSimilarity;

 /**
 * Encodes the specified VectorSimilarity message. Does not implicitly {@link legal.api.VectorSimilarity.verify|verify} messages.
 * @param message VectorSimilarity message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IVectorSimilarity,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified VectorSimilarity message, length delimited. Does not implicitly {@link legal.api.VectorSimilarity.verify|verify} messages.
 * @param message VectorSimilarity message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IVectorSimilarity,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a VectorSimilarity message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns VectorSimilarity
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.VectorSimilarity;

 /**
 * Decodes a VectorSimilarity message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns VectorSimilarity
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.VectorSimilarity;

 /**
 * Verifies a VectorSimilarity message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a VectorSimilarity message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns VectorSimilarity
 */
 public static fromObject(object: { [k: string]: any }): legal.api.VectorSimilarity;

 /**
 * Creates a plain object from a VectorSimilarity message. Also converts values to other types if specified.
 * @param message VectorSimilarity
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.VectorSimilarity,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this VectorSimilarity to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for VectorSimilarity
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a SearchMetadata. */
 interface ISearchMetadata {
 /** SearchMetadata suggestedQueries */
 suggestedQueries?: string[] | null;

 /** SearchMetadata facets */
 facets?: legal.api.ISearchFacet[] | null;

 /** SearchMetadata hasMoreResults */
 hasMoreResults?: boolean | null;
 }

 /** Represents a SearchMetadata. */
 class SearchMetadata implements ISearchMetadata {
 /**
 * Constructs a new SearchMetadata.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ISearchMetadata);

 /** SearchMetadata suggestedQueries. */
 public suggestedQueries: string[];

 /** SearchMetadata facets. */
 public facets: legal.api.ISearchFacet[];

 /** SearchMetadata hasMoreResults. */
 public hasMoreResults: boolean;

 /**
 * Creates a new SearchMetadata instance using the specified properties.
 * @param [properties] Properties to set
 * @returns SearchMetadata instance
 */
 public static create(properties?: legal.api.ISearchMetadata): legal.api.SearchMetadata;

 /**
 * Encodes the specified SearchMetadata message. Does not implicitly {@link legal.api.SearchMetadata.verify|verify} messages.
 * @param message SearchMetadata message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ISearchMetadata,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified SearchMetadata message, length delimited. Does not implicitly {@link legal.api.SearchMetadata.verify|verify} messages.
 * @param message SearchMetadata message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ISearchMetadata,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a SearchMetadata message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns SearchMetadata
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.SearchMetadata;

 /**
 * Decodes a SearchMetadata message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns SearchMetadata
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.SearchMetadata;

 /**
 * Verifies a SearchMetadata message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a SearchMetadata message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns SearchMetadata
 */
 public static fromObject(object: { [k: string]: any }): legal.api.SearchMetadata;

 /**
 * Creates a plain object from a SearchMetadata message. Also converts values to other types if specified.
 * @param message SearchMetadata
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.SearchMetadata,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this SearchMetadata to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for SearchMetadata
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a SearchFacet. */
 interface ISearchFacet {
 /** SearchFacet field */
 field?: string | null;

 /** SearchFacet values */
 values?: legal.api.IFacetValue[] | null;
 }

 /** Represents a SearchFacet. */
 class SearchFacet implements ISearchFacet {
 /**
 * Constructs a new SearchFacet.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ISearchFacet);

 /** SearchFacet field. */
 public field: string;

 /** SearchFacet values. */
 public values: legal.api.IFacetValue[];

 /**
 * Creates a new SearchFacet instance using the specified properties.
 * @param [properties] Properties to set
 * @returns SearchFacet instance
 */
 public static create(properties?: legal.api.ISearchFacet): legal.api.SearchFacet;

 /**
 * Encodes the specified SearchFacet message. Does not implicitly {@link legal.api.SearchFacet.verify|verify} messages.
 * @param message SearchFacet message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ISearchFacet,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified SearchFacet message, length delimited. Does not implicitly {@link legal.api.SearchFacet.verify|verify} messages.
 * @param message SearchFacet message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ISearchFacet,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a SearchFacet message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns SearchFacet
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.SearchFacet;

 /**
 * Decodes a SearchFacet message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns SearchFacet
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.SearchFacet;

 /**
 * Verifies a SearchFacet message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a SearchFacet message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns SearchFacet
 */
 public static fromObject(object: { [k: string]: any }): legal.api.SearchFacet;

 /**
 * Creates a plain object from a SearchFacet message. Also converts values to other types if specified.
 * @param message SearchFacet
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.SearchFacet,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this SearchFacet to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for SearchFacet
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a FacetValue. */
 interface IFacetValue {
 /** FacetValue value */
 value?: string | null;

 /** FacetValue count */
 count?: number | null;
 }

 /** Represents a FacetValue. */
 class FacetValue implements IFacetValue {
 /**
 * Constructs a new FacetValue.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IFacetValue);

 /** FacetValue value. */
 public value: string;

 /** FacetValue count. */
 public count: number;

 /**
 * Creates a new FacetValue instance using the specified properties.
 * @param [properties] Properties to set
 * @returns FacetValue instance
 */
 public static create(properties?: legal.api.IFacetValue): legal.api.FacetValue;

 /**
 * Encodes the specified FacetValue message. Does not implicitly {@link legal.api.FacetValue.verify|verify} messages.
 * @param message FacetValue message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IFacetValue,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified FacetValue message, length delimited. Does not implicitly {@link legal.api.FacetValue.verify|verify} messages.
 * @param message FacetValue message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IFacetValue,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a FacetValue message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns FacetValue
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.FacetValue;

 /**
 * Decodes a FacetValue message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns FacetValue
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.FacetValue;

 /**
 * Verifies a FacetValue message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a FacetValue message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns FacetValue
 */
 public static fromObject(object: { [k: string]: any }): legal.api.FacetValue;

 /**
 * Creates a plain object from a FacetValue message. Also converts values to other types if specified.
 * @param message FacetValue
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.FacetValue,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this FacetValue to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for FacetValue
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a ChatMessage. */
 interface IChatMessage {
 /** ChatMessage id */
 id?: string | null;

 /** ChatMessage sessionId */
 sessionId?: string | null;

 /** ChatMessage userId */
 userId?: string | null;

 /** ChatMessage content */
 content?: string | null;

 /** ChatMessage type */
 type?: legal.api.MessageType: null;

 /** ChatMessage attachments */
 attachments?: legal.api.IAttachment[] | null;

 /** ChatMessage timestamp */
 timestamp?: google.protobuf.ITimestamp: null;

 /** ChatMessage metadata */
 metadata?: legal.api.IMessageMetadata: null;
 }

 /** Represents a ChatMessage. */
 class ChatMessage implements IChatMessage {
 /**
 * Constructs a new ChatMessage.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IChatMessage);

 /** ChatMessage id. */
 public id: string;

 /** ChatMessage sessionId. */
 public sessionId: string;

 /** ChatMessage userId. */
 public userId: string;

 /** ChatMessage content. */
 public content: string;

 /** ChatMessage type. */
 public type: legal.api.MessageType;

 /** ChatMessage attachments. */
 public attachments: legal.api.IAttachment[];

 /** ChatMessage timestamp. */
 public timestamp?: google.protobuf.ITimestamp: null;

 /** ChatMessage metadata. */
 public metadata?: legal.api.IMessageMetadata: null;

 /**
 * Creates a new ChatMessage instance using the specified properties.
 * @param [properties] Properties to set
 * @returns ChatMessage instance
 */
 public static create(properties?: legal.api.IChatMessage): legal.api.ChatMessage;

 /**
 * Encodes the specified ChatMessage message. Does not implicitly {@link legal.api.ChatMessage.verify|verify} messages.
 * @param message ChatMessage message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IChatMessage,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified ChatMessage message, length delimited. Does not implicitly {@link legal.api.ChatMessage.verify|verify} messages.
 * @param message ChatMessage message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IChatMessage,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a ChatMessage message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns ChatMessage
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.ChatMessage;

 /**
 * Decodes a ChatMessage message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns ChatMessage
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.ChatMessage;

 /**
 * Verifies a ChatMessage message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a ChatMessage message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns ChatMessage
 */
 public static fromObject(object: { [k: string]: any }): legal.api.ChatMessage;

 /**
 * Creates a plain object from a ChatMessage message. Also converts values to other types if specified.
 * @param message ChatMessage
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.ChatMessage,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this ChatMessage to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for ChatMessage
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** MessageType enum. */
 enum MessageType {
 MESSAGE_TYPE_USER = 0,
 MESSAGE_TYPE_ASSISTANT = 1,
 MESSAGE_TYPE_SYSTEM = 2,
 MESSAGE_TYPE_ERROR = 3,
 MESSAGE_TYPE_FUNCTION_CALL = 4,
 }

 /** Properties of a MessageMetadata. */
 interface IMessageMetadata {
 /** MessageMetadata modelUsed */
 modelUsed?: string | null;

 /** MessageMetadata tokensUsed */
 tokensUsed?: number | null;

 /** MessageMetadata processingTimeMs */
 processingTimeMs?: number | null;

 /** MessageMetadata sourceDocuments */
 sourceDocuments?: string[] | null;

 /** MessageMetadata confidenceScore */
 confidenceScore?: number | null;
 }

 /** Represents a MessageMetadata. */
 class MessageMetadata implements IMessageMetadata {
 /**
 * Constructs a new MessageMetadata.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IMessageMetadata);

 /** MessageMetadata modelUsed. */
 public modelUsed: string;

 /** MessageMetadata tokensUsed. */
 public tokensUsed: number;

 /** MessageMetadata processingTimeMs. */
 public processingTimeMs: number;

 /** MessageMetadata sourceDocuments. */
 public sourceDocuments: string[];

 /** MessageMetadata confidenceScore. */
 public confidenceScore: number;

 /**
 * Creates a new MessageMetadata instance using the specified properties.
 * @param [properties] Properties to set
 * @returns MessageMetadata instance
 */
 public static create(properties?: legal.api.IMessageMetadata): legal.api.MessageMetadata;

 /**
 * Encodes the specified MessageMetadata message. Does not implicitly {@link legal.api.MessageMetadata.verify|verify} messages.
 * @param message MessageMetadata message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IMessageMetadata,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified MessageMetadata message, length delimited. Does not implicitly {@link legal.api.MessageMetadata.verify|verify} messages.
 * @param message MessageMetadata message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IMessageMetadata,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a MessageMetadata message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns MessageMetadata
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.MessageMetadata;

 /**
 * Decodes a MessageMetadata message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns MessageMetadata
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.MessageMetadata;

 /**
 * Verifies a MessageMetadata message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a MessageMetadata message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns MessageMetadata
 */
 public static fromObject(object: { [k: string]: any }): legal.api.MessageMetadata;

 /**
 * Creates a plain object from a MessageMetadata message. Also converts values to other types if specified.
 * @param message MessageMetadata
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.MessageMetadata,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this MessageMetadata to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for MessageMetadata
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a ChatRequest. */
 interface IChatRequest {
 /** ChatRequest sessionId */
 sessionId?: string | null;

 /** ChatRequest userId */
 userId?: string | null;

 /** ChatRequest message */
 message?: string | null;

 /** ChatRequest context */
 context?: legal.api.IChatContext: null;

 /** ChatRequest options */
 options?: legal.api.IChatOptions: null;
 }

 /** Represents a ChatRequest. */
 class ChatRequest implements IChatRequest {
 /**
 * Constructs a new ChatRequest.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IChatRequest);

 /** ChatRequest sessionId. */
 public sessionId: string;

 /** ChatRequest userId. */
 public userId: string;

 /** ChatRequest message. */
 public message: string;

 /** ChatRequest context. */
 public context?: legal.api.IChatContext: null;

 /** ChatRequest options. */
 public options?: legal.api.IChatOptions: null;

 /**
 * Creates a new ChatRequest instance using the specified properties.
 * @param [properties] Properties to set
 * @returns ChatRequest instance
 */
 public static create(properties?: legal.api.IChatRequest): legal.api.ChatRequest;

 /**
 * Encodes the specified ChatRequest message. Does not implicitly {@link legal.api.ChatRequest.verify|verify} messages.
 * @param message ChatRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IChatRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified ChatRequest message, length delimited. Does not implicitly {@link legal.api.ChatRequest.verify|verify} messages.
 * @param message ChatRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IChatRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a ChatRequest message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns ChatRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.ChatRequest;

 /**
 * Decodes a ChatRequest message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns ChatRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.ChatRequest;

 /**
 * Verifies a ChatRequest message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a ChatRequest message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns ChatRequest
 */
 public static fromObject(object: { [k: string]: any }): legal.api.ChatRequest;

 /**
 * Creates a plain object from a ChatRequest message. Also converts values to other types if specified.
 * @param message ChatRequest
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.ChatRequest,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this ChatRequest to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for ChatRequest
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a ChatContext. */
 interface IChatContext {
 /** ChatContext documentIds */
 documentIds?: string[] | null;

 /** ChatContext caseId */
 caseId?: string | null;

 /** ChatContext previousMessageIds */
 previousMessageIds?: string[] | null;

 /** ChatContext variables */
 variables?: { [k: string]: string } | null;
 }

 /** Represents a ChatContext. */
 class ChatContext implements IChatContext {
 /**
 * Constructs a new ChatContext.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IChatContext);

 /** ChatContext documentIds. */
 public documentIds: string[];

 /** ChatContext caseId. */
 public caseId: string;

 /** ChatContext previousMessageIds. */
 public previousMessageIds: string[];

 /** ChatContext variables. */
 public variables: { [k: string]: string };

 /**
 * Creates a new ChatContext instance using the specified properties.
 * @param [properties] Properties to set
 * @returns ChatContext instance
 */
 public static create(properties?: legal.api.IChatContext): legal.api.ChatContext;

 /**
 * Encodes the specified ChatContext message. Does not implicitly {@link legal.api.ChatContext.verify|verify} messages.
 * @param message ChatContext message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IChatContext,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified ChatContext message, length delimited. Does not implicitly {@link legal.api.ChatContext.verify|verify} messages.
 * @param message ChatContext message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IChatContext,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a ChatContext message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns ChatContext
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.ChatContext;

 /**
 * Decodes a ChatContext message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns ChatContext
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.ChatContext;

 /**
 * Verifies a ChatContext message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a ChatContext message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns ChatContext
 */
 public static fromObject(object: { [k: string]: any }): legal.api.ChatContext;

 /**
 * Creates a plain object from a ChatContext message. Also converts values to other types if specified.
 * @param message ChatContext
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.ChatContext,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this ChatContext to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for ChatContext
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a ChatOptions. */
 interface IChatOptions {
 /** ChatOptions model */
 model?: string | null;

 /** ChatOptions temperature */
 temperature?: number | null;

 /** ChatOptions maxTokens */
 maxTokens?: number | null;

 /** ChatOptions stream */
 stream?: boolean | null;

 /** ChatOptions includeSources */
 includeSources?: boolean | null;
 }

 /** Represents a ChatOptions. */
 class ChatOptions implements IChatOptions {
 /**
 * Constructs a new ChatOptions.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IChatOptions);

 /** ChatOptions model. */
 public model: string;

 /** ChatOptions temperature. */
 public temperature: number;

 /** ChatOptions maxTokens. */
 public maxTokens: number;

 /** ChatOptions stream. */
 public stream: boolean;

 /** ChatOptions includeSources. */
 public includeSources: boolean;

 /**
 * Creates a new ChatOptions instance using the specified properties.
 * @param [properties] Properties to set
 * @returns ChatOptions instance
 */
 public static create(properties?: legal.api.IChatOptions): legal.api.ChatOptions;

 /**
 * Encodes the specified ChatOptions message. Does not implicitly {@link legal.api.ChatOptions.verify|verify} messages.
 * @param message ChatOptions message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IChatOptions,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified ChatOptions message, length delimited. Does not implicitly {@link legal.api.ChatOptions.verify|verify} messages.
 * @param message ChatOptions message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IChatOptions,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a ChatOptions message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns ChatOptions
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.ChatOptions;

 /**
 * Decodes a ChatOptions message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns ChatOptions
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.ChatOptions;

 /**
 * Verifies a ChatOptions message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a ChatOptions message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns ChatOptions
 */
 public static fromObject(object: { [k: string]: any }): legal.api.ChatOptions;

 /**
 * Creates a plain object from a ChatOptions message. Also converts values to other types if specified.
 * @param message ChatOptions
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.ChatOptions,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this ChatOptions to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for ChatOptions
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a ChatResponse. */
 interface IChatResponse {
 /** ChatResponse response */
 response?: string | null;

 /** ChatResponse sources */
 sources?: string[] | null;

 /** ChatResponse confidence */
 confidence?: number | null;

 /** ChatResponse modelUsed */
 modelUsed?: string | null;

 /** ChatResponse tokensUsed */
 tokensUsed?: number | null;

 /** ChatResponse citations */
 citations?: legal.api.ILegalCitation[] | null;

 /** ChatResponse actionItems */
 actionItems?: legal.api.IActionItem[] | null;
 }

 /** Represents a ChatResponse. */
 class ChatResponse implements IChatResponse {
 /**
 * Constructs a new ChatResponse.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IChatResponse);

 /** ChatResponse response. */
 public response: string;

 /** ChatResponse sources. */
 public sources: string[];

 /** ChatResponse confidence. */
 public confidence: number;

 /** ChatResponse modelUsed. */
 public modelUsed: string;

 /** ChatResponse tokensUsed. */
 public tokensUsed: number;

 /** ChatResponse citations. */
 public citations: legal.api.ILegalCitation[];

 /** ChatResponse actionItems. */
 public actionItems: legal.api.IActionItem[];

 /**
 * Creates a new ChatResponse instance using the specified properties.
 * @param [properties] Properties to set
 * @returns ChatResponse instance
 */
 public static create(properties?: legal.api.IChatResponse): legal.api.ChatResponse;

 /**
 * Encodes the specified ChatResponse message. Does not implicitly {@link legal.api.ChatResponse.verify|verify} messages.
 * @param message ChatResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IChatResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified ChatResponse message, length delimited. Does not implicitly {@link legal.api.ChatResponse.verify|verify} messages.
 * @param message ChatResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IChatResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a ChatResponse message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns ChatResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.ChatResponse;

 /**
 * Decodes a ChatResponse message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns ChatResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.ChatResponse;

 /**
 * Verifies a ChatResponse message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a ChatResponse message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns ChatResponse
 */
 public static fromObject(object: { [k: string]: any }): legal.api.ChatResponse;

 /**
 * Creates a plain object from a ChatResponse message. Also converts values to other types if specified.
 * @param message ChatResponse
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.ChatResponse,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this ChatResponse to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for ChatResponse
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of an ActionItem. */
 interface IActionItem {
 /** ActionItem description */
 description?: string | null;

 /** ActionItem priority */
 priority?: legal.api.ActionPriority: null;

 /** ActionItem dueDate */
 dueDate?: google.protobuf.ITimestamp: null;

 /** ActionItem assignedTo */
 assignedTo?: string | null;
 }

 /** Represents an ActionItem. */
 class ActionItem implements IActionItem {
 /**
 * Constructs a new ActionItem.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IActionItem);

 /** ActionItem description. */
 public description: string;

 /** ActionItem priority. */
 public priority: legal.api.ActionPriority;

 /** ActionItem dueDate. */
 public dueDate?: google.protobuf.ITimestamp: null;

 /** ActionItem assignedTo. */
 public assignedTo: string;

 /**
 * Creates a new ActionItem instance using the specified properties.
 * @param [properties] Properties to set
 * @returns ActionItem instance
 */
 public static create(properties?: legal.api.IActionItem): legal.api.ActionItem;

 /**
 * Encodes the specified ActionItem message. Does not implicitly {@link legal.api.ActionItem.verify|verify} messages.
 * @param message ActionItem message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IActionItem,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified ActionItem message, length delimited. Does not implicitly {@link legal.api.ActionItem.verify|verify} messages.
 * @param message ActionItem message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IActionItem,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes an ActionItem message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns ActionItem
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.ActionItem;

 /**
 * Decodes an ActionItem message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns ActionItem
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.ActionItem;

 /**
 * Verifies an ActionItem message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates an ActionItem message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns ActionItem
 */
 public static fromObject(object: { [k: string]: any }): legal.api.ActionItem;

 /**
 * Creates a plain object from an ActionItem message. Also converts values to other types if specified.
 * @param message ActionItem
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.ActionItem,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this ActionItem to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for ActionItem
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** ActionPriority enum. */
 enum ActionPriority {
 ACTION_PRIORITY_LOW = 0,
 ACTION_PRIORITY_MEDIUM = 1,
 ACTION_PRIORITY_HIGH = 2,
 ACTION_PRIORITY_CRITICAL = 3,
 }

 /** Properties of an Attachment. */
 interface IAttachment {
 /** Attachment filename */
 filename?: string | null;

 /** Attachment contentType */
 contentType?: string | null;

 /** Attachment size */
 size?: number | Long: null;

 /** Attachment url */
 url?: string | null;

 /** Attachment checksum */
 checksum?: string | null;
 }

 /** Represents an Attachment. */
 class Attachment implements IAttachment {
 /**
 * Constructs a new Attachment.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IAttachment);

 /** Attachment filename. */
 public filename: string;

 /** Attachment contentType. */
 public contentType: string;

 /** Attachment size. */
 public size: number | Long;

 /** Attachment url. */
 public url: string;

 /** Attachment checksum. */
 public checksum: string;

 /**
 * Creates a new Attachment instance using the specified properties.
 * @param [properties] Properties to set
 * @returns Attachment instance
 */
 public static create(properties?: legal.api.IAttachment): legal.api.Attachment;

 /**
 * Encodes the specified Attachment message. Does not implicitly {@link legal.api.Attachment.verify|verify} messages.
 * @param message Attachment message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IAttachment,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified Attachment message, length delimited. Does not implicitly {@link legal.api.Attachment.verify|verify} messages.
 * @param message Attachment message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IAttachment,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes an Attachment message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns Attachment
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.Attachment;

 /**
 * Decodes an Attachment message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns Attachment
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.Attachment;

 /**
 * Verifies an Attachment message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates an Attachment message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns Attachment
 */
 public static fromObject(object: { [k: string]: any }): legal.api.Attachment;

 /**
 * Creates a plain object from an Attachment message. Also converts values to other types if specified.
 * @param message Attachment
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.Attachment,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this Attachment to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for Attachment
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of an AnalysisRequest. */
 interface IAnalysisRequest {
 /** AnalysisRequest documentId */
 documentId?: string | null;

 /** AnalysisRequest type */
 type?: legal.api.AnalysisType: null;

 /** AnalysisRequest specificQueries */
 specificQueries?: string[] | null;

 /** AnalysisRequest options */
 options?: legal.api.IAnalysisOptions: null;

 /** AnalysisRequest userId */
 userId?: string | null;
 }

 /** Represents an AnalysisRequest. */
 class AnalysisRequest implements IAnalysisRequest {
 /**
 * Constructs a new AnalysisRequest.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IAnalysisRequest);

 /** AnalysisRequest documentId. */
 public documentId: string;

 /** AnalysisRequest type. */
 public type: legal.api.AnalysisType;

 /** AnalysisRequest specificQueries. */
 public specificQueries: string[];

 /** AnalysisRequest options. */
 public options?: legal.api.IAnalysisOptions: null;

 /** AnalysisRequest userId. */
 public userId: string;

 /**
 * Creates a new AnalysisRequest instance using the specified properties.
 * @param [properties] Properties to set
 * @returns AnalysisRequest instance
 */
 public static create(properties?: legal.api.IAnalysisRequest): legal.api.AnalysisRequest;

 /**
 * Encodes the specified AnalysisRequest message. Does not implicitly {@link legal.api.AnalysisRequest.verify|verify} messages.
 * @param message AnalysisRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IAnalysisRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified AnalysisRequest message, length delimited. Does not implicitly {@link legal.api.AnalysisRequest.verify|verify} messages.
 * @param message AnalysisRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IAnalysisRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes an AnalysisRequest message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns AnalysisRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.AnalysisRequest;

 /**
 * Decodes an AnalysisRequest message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns AnalysisRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.AnalysisRequest;

 /**
 * Verifies an AnalysisRequest message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates an AnalysisRequest message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns AnalysisRequest
 */
 public static fromObject(object: { [k: string]: any }): legal.api.AnalysisRequest;

 /**
 * Creates a plain object from an AnalysisRequest message. Also converts values to other types if specified.
 * @param message AnalysisRequest
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.AnalysisRequest,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this AnalysisRequest to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for AnalysisRequest
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** AnalysisType enum. */
 enum AnalysisType {
 ANALYSIS_TYPE_RISK_ASSESSMENT = 0,
 ANALYSIS_TYPE_CLAUSE_EXTRACTION = 1,
 ANALYSIS_TYPE_COMPLIANCE_CHECK = 2,
 ANALYSIS_TYPE_PRECEDENT_ANALYSIS = 3,
 ANALYSIS_TYPE_ENTITY_EXTRACTION = 4,
 ANALYSIS_TYPE_SENTIMENT_ANALYSIS = 5,
 }

 /** Properties of an AnalysisOptions. */
 interface IAnalysisOptions {
 /** AnalysisOptions jurisdiction */
 jurisdiction?: string | null;

 /** AnalysisOptions practiceAreas */
 practiceAreas?: string[] | null;

 /** AnalysisOptions confidenceThreshold */
 confidenceThreshold?: number | null;

 /** AnalysisOptions includeRecommendations */
 includeRecommendations?: boolean | null;
 }

 /** Represents an AnalysisOptions. */
 class AnalysisOptions implements IAnalysisOptions {
 /**
 * Constructs a new AnalysisOptions.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IAnalysisOptions);

 /** AnalysisOptions jurisdiction. */
 public jurisdiction: string;

 /** AnalysisOptions practiceAreas. */
 public practiceAreas: string[];

 /** AnalysisOptions confidenceThreshold. */
 public confidenceThreshold: number;

 /** AnalysisOptions includeRecommendations. */
 public includeRecommendations: boolean;

 /**
 * Creates a new AnalysisOptions instance using the specified properties.
 * @param [properties] Properties to set
 * @returns AnalysisOptions instance
 */
 public static create(properties?: legal.api.IAnalysisOptions): legal.api.AnalysisOptions;

 /**
 * Encodes the specified AnalysisOptions message. Does not implicitly {@link legal.api.AnalysisOptions.verify|verify} messages.
 * @param message AnalysisOptions message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IAnalysisOptions,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified AnalysisOptions message, length delimited. Does not implicitly {@link legal.api.AnalysisOptions.verify|verify} messages.
 * @param message AnalysisOptions message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IAnalysisOptions,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes an AnalysisOptions message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns AnalysisOptions
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.AnalysisOptions;

 /**
 * Decodes an AnalysisOptions message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns AnalysisOptions
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.AnalysisOptions;

 /**
 * Verifies an AnalysisOptions message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates an AnalysisOptions message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns AnalysisOptions
 */
 public static fromObject(object: { [k: string]: any }): legal.api.AnalysisOptions;

 /**
 * Creates a plain object from an AnalysisOptions message. Also converts values to other types if specified.
 * @param message AnalysisOptions
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.AnalysisOptions,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this AnalysisOptions to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for AnalysisOptions
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of an AnalysisResponse. */
 interface IAnalysisResponse {
 /** AnalysisResponse analysisId */
 analysisId?: string | null;

 /** AnalysisResponse type */
 type?: legal.api.AnalysisType: null;

 /** AnalysisResponse results */
 results?: legal.api.IAnalysisResult[] | null;

 /** AnalysisResponse overallConfidence */
 overallConfidence?: number | null;

 /** AnalysisResponse createdAt */
 createdAt?: google.protobuf.ITimestamp: null;

 /** AnalysisResponse recommendations */
 recommendations?: legal.api.IRecommendation[] | null;
 }

 /** Represents an AnalysisResponse. */
 class AnalysisResponse implements IAnalysisResponse {
 /**
 * Constructs a new AnalysisResponse.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IAnalysisResponse);

 /** AnalysisResponse analysisId. */
 public analysisId: string;

 /** AnalysisResponse type. */
 public type: legal.api.AnalysisType;

 /** AnalysisResponse results. */
 public results: legal.api.IAnalysisResult[];

 /** AnalysisResponse overallConfidence. */
 public overallConfidence: number;

 /** AnalysisResponse createdAt. */
 public createdAt?: google.protobuf.ITimestamp: null;

 /** AnalysisResponse recommendations. */
 public recommendations: legal.api.IRecommendation[];

 /**
 * Creates a new AnalysisResponse instance using the specified properties.
 * @param [properties] Properties to set
 * @returns AnalysisResponse instance
 */
 public static create(properties?: legal.api.IAnalysisResponse): legal.api.AnalysisResponse;

 /**
 * Encodes the specified AnalysisResponse message. Does not implicitly {@link legal.api.AnalysisResponse.verify|verify} messages.
 * @param message AnalysisResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IAnalysisResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified AnalysisResponse message, length delimited. Does not implicitly {@link legal.api.AnalysisResponse.verify|verify} messages.
 * @param message AnalysisResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IAnalysisResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes an AnalysisResponse message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns AnalysisResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.AnalysisResponse;

 /**
 * Decodes an AnalysisResponse message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns AnalysisResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.AnalysisResponse;

 /**
 * Verifies an AnalysisResponse message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates an AnalysisResponse message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns AnalysisResponse
 */
 public static fromObject(object: { [k: string]: any }): legal.api.AnalysisResponse;

 /**
 * Creates a plain object from an AnalysisResponse message. Also converts values to other types if specified.
 * @param message AnalysisResponse
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.AnalysisResponse,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this AnalysisResponse to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for AnalysisResponse
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of an AnalysisResult. */
 interface IAnalysisResult {
 /** AnalysisResult category */
 category?: string | null;

 /** AnalysisResult finding */
 finding?: string | null;

 /** AnalysisResult confidence */
 confidence?: number | null;

 /** AnalysisResult supportingText */
 supportingText?: string[] | null;

 /** AnalysisResult citations */
 citations?: legal.api.ILegalCitation[] | null;

 /** AnalysisResult riskLevel */
 riskLevel?: legal.api.RiskLevel: null;
 }

 /** Represents an AnalysisResult. */
 class AnalysisResult implements IAnalysisResult {
 /**
 * Constructs a new AnalysisResult.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IAnalysisResult);

 /** AnalysisResult category. */
 public category: string;

 /** AnalysisResult finding. */
 public finding: string;

 /** AnalysisResult confidence. */
 public confidence: number;

 /** AnalysisResult supportingText. */
 public supportingText: string[];

 /** AnalysisResult citations. */
 public citations: legal.api.ILegalCitation[];

 /** AnalysisResult riskLevel. */
 public riskLevel: legal.api.RiskLevel;

 /**
 * Creates a new AnalysisResult instance using the specified properties.
 * @param [properties] Properties to set
 * @returns AnalysisResult instance
 */
 public static create(properties?: legal.api.IAnalysisResult): legal.api.AnalysisResult;

 /**
 * Encodes the specified AnalysisResult message. Does not implicitly {@link legal.api.AnalysisResult.verify|verify} messages.
 * @param message AnalysisResult message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IAnalysisResult,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified AnalysisResult message, length delimited. Does not implicitly {@link legal.api.AnalysisResult.verify|verify} messages.
 * @param message AnalysisResult message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IAnalysisResult,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes an AnalysisResult message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns AnalysisResult
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.AnalysisResult;

 /**
 * Decodes an AnalysisResult message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns AnalysisResult
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.AnalysisResult;

 /**
 * Verifies an AnalysisResult message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates an AnalysisResult message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns AnalysisResult
 */
 public static fromObject(object: { [k: string]: any }): legal.api.AnalysisResult;

 /**
 * Creates a plain object from an AnalysisResult message. Also converts values to other types if specified.
 * @param message AnalysisResult
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.AnalysisResult,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this AnalysisResult to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for AnalysisResult
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** RiskLevel enum. */
 enum RiskLevel {
 RISK_LEVEL_LOW = 0,
 RISK_LEVEL_MEDIUM = 1,
 RISK_LEVEL_HIGH = 2,
 RISK_LEVEL_CRITICAL = 3,
 }

 /** Properties of a Recommendation. */
 interface IRecommendation {
 /** Recommendation title */
 title?: string | null;

 /** Recommendation description */
 description?: string | null;

 /** Recommendation type */
 type?: legal.api.RecommendationType: null;

 /** Recommendation priority */
 priority?: legal.api.ActionPriority: null;

 /** Recommendation steps */
 steps?: string[] | null;
 }

 /** Represents a Recommendation. */
 class Recommendation implements IRecommendation {
 /**
 * Constructs a new Recommendation.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IRecommendation);

 /** Recommendation title. */
 public title: string;

 /** Recommendation description. */
 public description: string;

 /** Recommendation type. */
 public type: legal.api.RecommendationType;

 /** Recommendation priority. */
 public priority: legal.api.ActionPriority;

 /** Recommendation steps. */
 public steps: string[];

 /**
 * Creates a new Recommendation instance using the specified properties.
 * @param [properties] Properties to set
 * @returns Recommendation instance
 */
 public static create(properties?: legal.api.IRecommendation): legal.api.Recommendation;

 /**
 * Encodes the specified Recommendation message. Does not implicitly {@link legal.api.Recommendation.verify|verify} messages.
 * @param message Recommendation message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IRecommendation,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified Recommendation message, length delimited. Does not implicitly {@link legal.api.Recommendation.verify|verify} messages.
 * @param message Recommendation message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IRecommendation,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a Recommendation message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns Recommendation
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.Recommendation;

 /**
 * Decodes a Recommendation message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns Recommendation
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.Recommendation;

 /**
 * Verifies a Recommendation message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a Recommendation message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns Recommendation
 */
 public static fromObject(object: { [k: string]: any }): legal.api.Recommendation;

 /**
 * Creates a plain object from a Recommendation message. Also converts values to other types if specified.
 * @param message Recommendation
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.Recommendation,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this Recommendation to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for Recommendation
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** RecommendationType enum. */
 enum RecommendationType {
 RECOMMENDATION_TYPE_ACTION = 0,
 RECOMMENDATION_TYPE_RESEARCH = 1,
 RECOMMENDATION_TYPE_REVIEW = 2,
 RECOMMENDATION_TYPE_COMPLIANCE = 3,
 }

 /** Properties of a HealthCheckRequest. */
 interface IHealthCheckRequest {
 /** HealthCheckRequest service */
 service?: string | null;

 /** HealthCheckRequest includeDetails */
 includeDetails?: boolean | null;
 }

 /** Represents a HealthCheckRequest. */
 class HealthCheckRequest implements IHealthCheckRequest {
 /**
 * Constructs a new HealthCheckRequest.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IHealthCheckRequest);

 /** HealthCheckRequest service. */
 public service: string;

 /** HealthCheckRequest includeDetails. */
 public includeDetails: boolean;

 /**
 * Creates a new HealthCheckRequest instance using the specified properties.
 * @param [properties] Properties to set
 * @returns HealthCheckRequest instance
 */
 public static create(
 properties?: legal.api.IHealthCheckRequest
 ): legal.api.HealthCheckRequest;

 /**
 * Encodes the specified HealthCheckRequest message. Does not implicitly {@link legal.api.HealthCheckRequest.verify|verify} messages.
 * @param message HealthCheckRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IHealthCheckRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified HealthCheckRequest message, length delimited. Does not implicitly {@link legal.api.HealthCheckRequest.verify|verify} messages.
 * @param message HealthCheckRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IHealthCheckRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a HealthCheckRequest message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns HealthCheckRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.HealthCheckRequest;

 /**
 * Decodes a HealthCheckRequest message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns HealthCheckRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.HealthCheckRequest;

 /**
 * Verifies a HealthCheckRequest message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a HealthCheckRequest message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns HealthCheckRequest
 */
 public static fromObject(object: { [k: string]: any }): legal.api.HealthCheckRequest;

 /**
 * Creates a plain object from a HealthCheckRequest message. Also converts values to other types if specified.
 * @param message HealthCheckRequest
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.HealthCheckRequest,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this HealthCheckRequest to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for HealthCheckRequest
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a HealthCheckResponse. */
 interface IHealthCheckResponse {
 /** HealthCheckResponse healthy */
 healthy?: boolean | null;

 /** HealthCheckResponse status */
 status?: string | null;

 /** HealthCheckResponse details */
 details?: { [k: string]: string } | null;

 /** HealthCheckResponse timestamp */
 timestamp?: google.protobuf.ITimestamp: null;

 /** HealthCheckResponse version */
 version?: string | null;
 }

 /** Represents a HealthCheckResponse. */
 class HealthCheckResponse implements IHealthCheckResponse {
 /**
 * Constructs a new HealthCheckResponse.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IHealthCheckResponse);

 /** HealthCheckResponse healthy. */
 public healthy: boolean;

 /** HealthCheckResponse status. */
 public status: string;

 /** HealthCheckResponse details. */
 public details: { [k: string]: string };

 /** HealthCheckResponse timestamp. */
 public timestamp?: google.protobuf.ITimestamp: null;

 /** HealthCheckResponse version. */
 public version: string;

 /**
 * Creates a new HealthCheckResponse instance using the specified properties.
 * @param [properties] Properties to set
 * @returns HealthCheckResponse instance
 */
 public static create(
 properties?: legal.api.IHealthCheckResponse
 ): legal.api.HealthCheckResponse;

 /**
 * Encodes the specified HealthCheckResponse message. Does not implicitly {@link legal.api.HealthCheckResponse.verify|verify} messages.
 * @param message HealthCheckResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IHealthCheckResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified HealthCheckResponse message, length delimited. Does not implicitly {@link legal.api.HealthCheckResponse.verify|verify} messages.
 * @param message HealthCheckResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IHealthCheckResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a HealthCheckResponse message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns HealthCheckResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.HealthCheckResponse;

 /**
 * Decodes a HealthCheckResponse message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns HealthCheckResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.HealthCheckResponse;

 /**
 * Verifies a HealthCheckResponse message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a HealthCheckResponse message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns HealthCheckResponse
 */
 public static fromObject(object: { [k: string]: any }): legal.api.HealthCheckResponse;

 /**
 * Creates a plain object from a HealthCheckResponse message. Also converts values to other types if specified.
 * @param message HealthCheckResponse
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.HealthCheckResponse,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this HealthCheckResponse to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for HealthCheckResponse
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a SystemStatus. */
 interface ISystemStatus {
 /** SystemStatus serviceName */
 serviceName?: string | null;

 /** SystemStatus operational */
 operational?: boolean | null;

 /** SystemStatus cpuUsage */
 cpuUsage?: number | null;

 /** SystemStatus memoryUsage */
 memoryUsage?: number | null;

 /** SystemStatus activeConnections */
 activeConnections?: number | null;

 /** SystemStatus requestsPerMinute */
 requestsPerMinute?: number | Long: null;

 /** SystemStatus lastUpdated */
 lastUpdated?: google.protobuf.ITimestamp: null;
 }

 /** Represents a SystemStatus. */
 class SystemStatus implements ISystemStatus {
 /**
 * Constructs a new SystemStatus.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.ISystemStatus);

 /** SystemStatus serviceName. */
 public serviceName: string;

 /** SystemStatus operational. */
 public operational: boolean;

 /** SystemStatus cpuUsage. */
 public cpuUsage: number;

 /** SystemStatus memoryUsage. */
 public memoryUsage: number;

 /** SystemStatus activeConnections. */
 public activeConnections: number;

 /** SystemStatus requestsPerMinute. */
 public requestsPerMinute: number | Long;

 /** SystemStatus lastUpdated. */
 public lastUpdated?: google.protobuf.ITimestamp: null;

 /**
 * Creates a new SystemStatus instance using the specified properties.
 * @param [properties] Properties to set
 * @returns SystemStatus instance
 */
 public static create(properties?: legal.api.ISystemStatus): legal.api.SystemStatus;

 /**
 * Encodes the specified SystemStatus message. Does not implicitly {@link legal.api.SystemStatus.verify|verify} messages.
 * @param message SystemStatus message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.ISystemStatus,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified SystemStatus message, length delimited. Does not implicitly {@link legal.api.SystemStatus.verify|verify} messages.
 * @param message SystemStatus message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.ISystemStatus,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a SystemStatus message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns SystemStatus
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.SystemStatus;

 /**
 * Decodes a SystemStatus message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns SystemStatus
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.SystemStatus;

 /**
 * Verifies a SystemStatus message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a SystemStatus message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns SystemStatus
 */
 public static fromObject(object: { [k: string]: any }): legal.api.SystemStatus;

 /**
 * Creates a plain object from a SystemStatus message. Also converts values to other types if specified.
 * @param message SystemStatus
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.SystemStatus,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this SystemStatus to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for SystemStatus
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a BatchRequest. */
 interface IBatchRequest {
 /** BatchRequest batchId */
 batchId?: string | null;

 /** BatchRequest operations */
 operations?: legal.api.IBatchOperation[] | null;

 /** BatchRequest options */
 options?: legal.api.IBatchOptions: null;

 /** BatchRequest userId */
 userId?: string | null;
 }

 /** Represents a BatchRequest. */
 class BatchRequest implements IBatchRequest {
 /**
 * Constructs a new BatchRequest.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IBatchRequest);

 /** BatchRequest batchId. */
 public batchId: string;

 /** BatchRequest operations. */
 public operations: legal.api.IBatchOperation[];

 /** BatchRequest options. */
 public options?: legal.api.IBatchOptions: null;

 /** BatchRequest userId. */
 public userId: string;

 /**
 * Creates a new BatchRequest instance using the specified properties.
 * @param [properties] Properties to set
 * @returns BatchRequest instance
 */
 public static create(properties?: legal.api.IBatchRequest): legal.api.BatchRequest;

 /**
 * Encodes the specified BatchRequest message. Does not implicitly {@link legal.api.BatchRequest.verify|verify} messages.
 * @param message BatchRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IBatchRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified BatchRequest message, length delimited. Does not implicitly {@link legal.api.BatchRequest.verify|verify} messages.
 * @param message BatchRequest message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IBatchRequest,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a BatchRequest message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns BatchRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.BatchRequest;

 /**
 * Decodes a BatchRequest message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns BatchRequest
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.BatchRequest;

 /**
 * Verifies a BatchRequest message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a BatchRequest message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns BatchRequest
 */
 public static fromObject(object: { [k: string]: any }): legal.api.BatchRequest;

 /**
 * Creates a plain object from a BatchRequest message. Also converts values to other types if specified.
 * @param message BatchRequest
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.BatchRequest,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this BatchRequest to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for BatchRequest
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a BatchOperation. */
 interface IBatchOperation {
 /** BatchOperation operationId */
 operationId?: string | null;

 /** BatchOperation type */
 type?: string | null;

 /** BatchOperation parameters */
 parameters?: { [k: string]: string } | null;
 }

 /** Represents a BatchOperation. */
 class BatchOperation implements IBatchOperation {
 /**
 * Constructs a new BatchOperation.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IBatchOperation);

 /** BatchOperation operationId. */
 public operationId: string;

 /** BatchOperation type. */
 public type: string;

 /** BatchOperation parameters. */
 public parameters: { [k: string]: string };

 /**
 * Creates a new BatchOperation instance using the specified properties.
 * @param [properties] Properties to set
 * @returns BatchOperation instance
 */
 public static create(properties?: legal.api.IBatchOperation): legal.api.BatchOperation;

 /**
 * Encodes the specified BatchOperation message. Does not implicitly {@link legal.api.BatchOperation.verify|verify} messages.
 * @param message BatchOperation message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IBatchOperation,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified BatchOperation message, length delimited. Does not implicitly {@link legal.api.BatchOperation.verify|verify} messages.
 * @param message BatchOperation message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IBatchOperation,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a BatchOperation message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns BatchOperation
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.BatchOperation;

 /**
 * Decodes a BatchOperation message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns BatchOperation
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): legal.api.BatchOperation;

 /**
 * Verifies a BatchOperation message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a BatchOperation message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns BatchOperation
 */
 public static fromObject(object: { [k: string]: any }): legal.api.BatchOperation;

 /**
 * Creates a plain object from a BatchOperation message. Also converts values to other types if specified.
 * @param message BatchOperation
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.BatchOperation,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this BatchOperation to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for BatchOperation
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a BatchOptions. */
 interface IBatchOptions {
 /** BatchOptions parallelExecution */
 parallelExecution?: boolean | null;

 /** BatchOptions maxConcurrency */
 maxConcurrency?: number | null;

 /** BatchOptions timeoutSeconds */
 timeoutSeconds?: number | null;

 /** BatchOptions continueOnError */
 continueOnError?: boolean | null;
 }

 /** Represents a BatchOptions. */
 class BatchOptions implements IBatchOptions {
 /**
 * Constructs a new BatchOptions.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IBatchOptions);

 /** BatchOptions parallelExecution. */
 public parallelExecution: boolean;

 /** BatchOptions maxConcurrency. */
 public maxConcurrency: number;

 /** BatchOptions timeoutSeconds. */
 public timeoutSeconds: number;

 /** BatchOptions continueOnError. */
 public continueOnError: boolean;

 /**
 * Creates a new BatchOptions instance using the specified properties.
 * @param [properties] Properties to set
 * @returns BatchOptions instance
 */
 public static create(properties?: legal.api.IBatchOptions): legal.api.BatchOptions;

 /**
 * Encodes the specified BatchOptions message. Does not implicitly {@link legal.api.BatchOptions.verify|verify} messages.
 * @param message BatchOptions message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IBatchOptions,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified BatchOptions message, length delimited. Does not implicitly {@link legal.api.BatchOptions.verify|verify} messages.
 * @param message BatchOptions message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IBatchOptions,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a BatchOptions message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns BatchOptions
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.BatchOptions;

 /**
 * Decodes a BatchOptions message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns BatchOptions
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.BatchOptions;

 /**
 * Verifies a BatchOptions message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a BatchOptions message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns BatchOptions
 */
 public static fromObject(object: { [k: string]: any }): legal.api.BatchOptions;

 /**
 * Creates a plain object from a BatchOptions message. Also converts values to other types if specified.
 * @param message BatchOptions
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.BatchOptions,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this BatchOptions to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for BatchOptions
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** Properties of a BatchResponse. */
 interface IBatchResponse {
 /** BatchResponse batchId */
 batchId?: string | null;

 /** BatchResponse status */
 status?: legal.api.BatchStatus: null;

 /** BatchResponse results */
 results?: legal.api.IBatchResult[] | null;

 /** BatchResponse startedAt */
 startedAt?: google.protobuf.ITimestamp: null;

 /** BatchResponse completedAt */
 completedAt?: google.protobuf.ITimestamp: null;

 /** BatchResponse errorMessage */
 errorMessage?: string | null;
 }

 /** Represents a BatchResponse. */
 class BatchResponse implements IBatchResponse {
 /**
 * Constructs a new BatchResponse.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IBatchResponse);

 /** BatchResponse batchId. */
 public batchId: string;

 /** BatchResponse status. */
 public status: legal.api.BatchStatus;

 /** BatchResponse results. */
 public results: legal.api.IBatchResult[];

 /** BatchResponse startedAt. */
 public startedAt?: google.protobuf.ITimestamp: null;

 /** BatchResponse completedAt. */
 public completedAt?: google.protobuf.ITimestamp: null;

 /** BatchResponse errorMessage. */
 public errorMessage: string;

 /**
 * Creates a new BatchResponse instance using the specified properties.
 * @param [properties] Properties to set
 * @returns BatchResponse instance
 */
 public static create(properties?: legal.api.IBatchResponse): legal.api.BatchResponse;

 /**
 * Encodes the specified BatchResponse message. Does not implicitly {@link legal.api.BatchResponse.verify|verify} messages.
 * @param message BatchResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IBatchResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified BatchResponse message, length delimited. Does not implicitly {@link legal.api.BatchResponse.verify|verify} messages.
 * @param message BatchResponse message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IBatchResponse,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a BatchResponse message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns BatchResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.BatchResponse;

 /**
 * Decodes a BatchResponse message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns BatchResponse
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.BatchResponse;

 /**
 * Verifies a BatchResponse message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a BatchResponse message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns BatchResponse
 */
 public static fromObject(object: { [k: string]: any }): legal.api.BatchResponse;

 /**
 * Creates a plain object from a BatchResponse message. Also converts values to other types if specified.
 * @param message BatchResponse
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.BatchResponse,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this BatchResponse to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for BatchResponse
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }

 /** BatchStatus enum. */
 enum BatchStatus {
 BATCH_STATUS_PENDING = 0,
 BATCH_STATUS_RUNNING = 1,
 BATCH_STATUS_COMPLETED = 2,
 BATCH_STATUS_FAILED = 3,
 BATCH_STATUS_CANCELLED = 4,
 }

 /** Properties of a BatchResult. */
 interface IBatchResult {
 /** BatchResult operationId */
 operationId?: string | null;

 /** BatchResult success */
 success?: boolean | null;

 /** BatchResult resultData */
 resultData?: string | null;

 /** BatchResult errorMessage */
 errorMessage?: string | null;

 /** BatchResult processingTimeMs */
 processingTimeMs?: number | null;
 }

 /** Represents a BatchResult. */
 class BatchResult implements IBatchResult {
 /**
 * Constructs a new BatchResult.
 * @param [properties] Properties to set
 */
 constructor(properties?: legal.api.IBatchResult);

 /** BatchResult operationId. */
 public operationId: string;

 /** BatchResult success. */
 public success: boolean;

 /** BatchResult resultData. */
 public resultData: string;

 /** BatchResult errorMessage. */
 public errorMessage: string;

 /** BatchResult processingTimeMs. */
 public processingTimeMs: number;

 /**
 * Creates a new BatchResult instance using the specified properties.
 * @param [properties] Properties to set
 * @returns BatchResult instance
 */
 public static create(properties?: legal.api.IBatchResult): legal.api.BatchResult;

 /**
 * Encodes the specified BatchResult message. Does not implicitly {@link legal.api.BatchResult.verify|verify} messages.
 * @param message BatchResult message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: legal.api.IBatchResult,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified BatchResult message, length delimited. Does not implicitly {@link legal.api.BatchResult.verify|verify} messages.
 * @param message BatchResult message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: legal.api.IBatchResult,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a BatchResult message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns BatchResult
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): legal.api.BatchResult;

 /**
 * Decodes a BatchResult message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns BatchResult
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): legal.api.BatchResult;

 /**
 * Verifies a BatchResult message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a BatchResult message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns BatchResult
 */
 public static fromObject(object: { [k: string]: any }): legal.api.BatchResult;

 /**
 * Creates a plain object from a BatchResult message. Also converts values to other types if specified.
 * @param message BatchResult
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: legal.api.BatchResult,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this BatchResult to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for BatchResult
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }
 }
}

/** Namespace google. */
export namespace google {
 /** Namespace protobuf. */
 namespace protobuf {
 /** Properties of a Timestamp. */
 interface ITimestamp {
 /** Timestamp seconds */
 seconds?: number | Long: null;

 /** Timestamp nanos */
 nanos?: number | null;
 }

 /** Represents a Timestamp. */
 class Timestamp implements ITimestamp {
 /**
 * Constructs a new Timestamp.
 * @param [properties] Properties to set
 */
 constructor(properties?: google.protobuf.ITimestamp);

 /** Timestamp seconds. */
 public seconds: number | Long;

 /** Timestamp nanos. */
 public nanos: number;

 /**
 * Creates a new Timestamp instance using the specified properties.
 * @param [properties] Properties to set
 * @returns Timestamp instance
 */
 public static create(properties?: google.protobuf.ITimestamp): google.protobuf.Timestamp;

 /**
 * Encodes the specified Timestamp message. Does not implicitly {@link google.protobuf.Timestamp.verify|verify} messages.
 * @param message Timestamp message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encode(
 message: google.protobuf.ITimestamp,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Encodes the specified Timestamp message, length delimited. Does not implicitly {@link google.protobuf.Timestamp.verify|verify} messages.
 * @param message Timestamp message or plain object to encode
 * @param [writer] Writer to encode to
 * @returns Writer
 */
 public static encodeDelimited(
 message: google.protobuf.ITimestamp,
 writer?: $protobuf.Writer
 ): $protobuf.Writer;

 /**
 * Decodes a Timestamp message from the specified reader or buffer.
 * @param reader Reader or buffer to decode from
 * @param [length] Message length if known beforehand
 * @returns Timestamp
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decode(
 reader: $protobuf.Reader | Uint8Array,
 length?: number
 ): google.protobuf.Timestamp;

 /**
 * Decodes a Timestamp message from the specified reader or buffer, length delimited.
 * @param reader Reader or buffer to decode from
 * @returns Timestamp
 * @throws {Error} If the payload is not a reader or valid buffer
 * @throws {$protobuf.util.ProtocolError} If required fields are missing
 */
 public static decodeDelimited(
 reader: $protobuf.Reader | Uint8Array
 ): google.protobuf.Timestamp;

 /**
 * Verifies a Timestamp message.
 * @param message Plain object to verify
 * @returns `null` if valid, otherwise the reason why it is not
 */
 public static verify(message: { [k: string]: any }): string | null;

 /**
 * Creates a Timestamp message from a plain object. Also converts values to their respective internal types.
 * @param object Plain object
 * @returns Timestamp
 */
 public static fromObject(object: { [k: string]: any }): google.protobuf.Timestamp;

 /**
 * Creates a plain object from a Timestamp message. Also converts values to other types if specified.
 * @param message Timestamp
 * @param [options] Conversion options
 * @returns Plain object
 */
 public static toObject(
 message: google.protobuf.Timestamp,
 options?: $protobuf.IConversionOptions
 ): { [k: string]: any };

 /**
 * Converts this Timestamp to JSON.
 * @returns JSON object
 */
 public toJSON(): { [k: string]: any };

 /**
 * Gets the default type url for Timestamp
 * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
 * @returns The default type url
 */
 public static getTypeUrl(typeUrlPrefix?: string): string;
 }
 }
}
