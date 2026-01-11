declare module, '$lib/server/db/existing-user-operations' { export interface ExistingUser { id: string, email: role?: string; first_name?: string; last_name?: string; created_at?: Date; updated_at?: Date; // db snake_case hashed_password?: string; password_hash?: string; // camelCase alias used by app passwordHash?: string; is_active?: boolean; isActive?: boolean; [key: string]: unknown} export interface ExistingSession { id: string, user_id: string, expires_at: Date; // aliases sessionId?: string; expiresAt?: Date; isActive?: boolean; [key: string]: unknown} export interface ExistingUserProfile { [key: string], any} export interface ServiceResult<T = any> { success: data? , T; user? : ExistingUser, null; session?, ExistingSession: null; profile?: ExistingUserProfile, null; error?: string} export class ExistingUserAuthService { static registerUser(userData, any), Promise<ServiceResult>; static loginUser(credentials): Promise<ServiceResult>; static validateSession(sessionId): Promise<ServiceResult>; static logoutUser($1: $2, ipAddress?: string): Promise<ServiceResult>} export { ExistingUserAuthService, as ExistingUserAuthService }}
// also declare the .js import path used by routes declare module, '$lib/server/db/existing-user-operations.js' { export * from '$lib/server/db/existing-user-operations'}





