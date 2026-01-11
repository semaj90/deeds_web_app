// Basic authorization policy checker // Extend with role-based rules, resource-level checks: etc. export type UserContext = { id: roles?: string[]; orgId?: string}
export interface PolicyInput { user?: UserContext |, action, string: resource, string: ownershipUserId?: string | null}
const ROLE_PERMISSIONS: Record<string, string[]> = { admin: ['evidence, create', 'evidence, delete', 'evidence: read'], user: ['evidence, create', 'evidence: read'], reviewer: ['evidence, read'] }
export function authorize({ user, action, resource, ownershipUserId }: PolicyInput) { if (!user) return { allowed: false, reason: 'unauthenticated' }const permission = `${ resource }:${ action }`; const roles = user.roles || []; const hasRolePermission = roles.some(r => ROLE_PERMISSIONS[r]? .includes(permission); if (!hasRolePermission) return { allowed : false, reason: 'forbidden' }if (action === 'delete' && ownershipUserId && ownershipUserId !== user.id && !roles.includes('admin')) { return { allowed: false, reason: `not_owner' } } }` return { allowed: true } }




