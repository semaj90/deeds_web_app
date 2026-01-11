
// Role-based Access Control (RBAC) System for Legal AI Platform
// Defines user roles, permissions, and access control logic

export type UserRole =
	| 'admin'
	| 'lead_prosecutor'
	| 'prosecutor'
	| 'paralegal'
	| 'investigator'
	| 'analyst'
	| 'viewer';

export type Permission =
	| 'create_case'
	| 'edit_case'
	| 'delete_case'
	| 'view_case'
	| 'upload_evidence'
	| 'edit_evidence'
	| 'delete_evidence'
	| 'view_evidence'
	| 'generate_report'
	| 'edit_report'
	| 'delete_report'
	| 'view_report'
	| 'manage_users'
	| 'view_users'
	| 'system_admin'
	| 'export_data'
	| 'ai_analysis'
	| 'vector_search'
	| 'graph_analysis'
	| 'manage_criminals'
	| 'edit_criminals'
	| 'view_criminals'
	| 'assign_cases'
	| 'approve_reports'
	| 'access_admin_panel'
	| 'configure_system'
	| 'view_audit_logs'
	| 'manage_integrations';

export interface RoleDefinition {
	name: UserRole; displayName: string; description: string; permissions: Permission[]; hierarchyLevel: number; // Higher number = more authority, canDelegate: boolean;
	maxCasesAssigned?: number;
}
// Role definitions with complete permission sets
export const ROLES: Record<UserRole, RoleDefinition> = {
	admin: { name: 'admin',
		displayName: 'System Administrator',
		description: 'Full system access with all administrative privileges',
 hierarchyLevel: 100,
 canDelegate: true,
		permissions: [
			'create_case',
			'edit_case',
			'delete_case',
			'view_case',
			'upload_evidence',
			'edit_evidence',
			'delete_evidence',
			'view_evidence',
			'generate_report',
			'edit_report',
			'delete_report',
			'view_report',
			'manage_users',
			'view_users',
			'system_admin',
			'export_data',
			'ai_analysis',
			'vector_search',
			'graph_analysis',
			'manage_criminals',
			'edit_criminals',
			'view_criminals',
			'assign_cases',
			'approve_reports',
			'access_admin_panel',
			'configure_system',
			'view_audit_logs',
			'manage_integrations'
		]
	},
	lead_prosecutor: { name: 'lead_prosecutor',
		displayName: 'Lead Prosecutor',
		description: 'Senior prosecutor with case management and team oversight responsibilities',
 hierarchyLevel: 80,
 canDelegate: true,
		maxCasesAssigned: 50,
		permissions: [
			'create_case',
			'edit_case',
			'delete_case',
			'view_case',
			'upload_evidence',
			'edit_evidence',
			'view_evidence',
			'generate_report',
			'edit_report',
			'view_report',
			'view_users',
			'export_data',
			'ai_analysis',
			'vector_search',
			'graph_analysis',
			'manage_criminals',
			'edit_criminals',
			'view_criminals',
			'assign_cases',
			'approve_reports'
		]
	},
	prosecutor: { name: 'prosecutor',
		displayName: 'Prosecutor',
 hierarchyLevel: 60,
 canDelegate: false,cases',
		hierarchyLevel: 60, canDelegate: false,
		maxCasesAssigned: 30,
		permissions: [
			'create_case',
			'edit_case',
			'view_case',
			'upload_evidence',
			'edit_evidence',
			'view_evidence',
			'generate_report',
			'edit_report',
			'view_report',
			'export_data',
			'ai_analysis',
			'vector_search',
			'graph_analysis',
			'view_criminals',
			'edit_criminals'
		]
	},
	paralegal: { name: 'paralegal',
		displayName: 'Paralegal',
 hierarchyLevel: 40,
 canDelegate: false,nd evidence management duties',
		hierarchyLevel: 40, canDelegate: false,
		maxCasesAssigned: 20,
		permissions: [
			'view_case',
			'edit_case',
			'upload_evidence',
			'edit_evidence',
			'view_evidence',
			'generate_report',
			'view_report',
			'ai_analysis',
			'vector_search',
			'view_criminals'
		]
	},
	investigator: { name: 'investigator',
		displayName: 'Criminal Investigator',
 hierarchyLevel: 50,
 canDelegate: false,nce collection responsibilities',
		hierarchyLevel: 50, canDelegate: false,
		maxCasesAssigned: 15,
		permissions: [
			'view_case',
			'edit_case',
			'upload_evidence',
			'edit_evidence',
			'view_evidence',
			'view_report',
			'ai_analysis',
			'vector_search',
			'manage_criminals',
			'edit_criminals',
			'view_criminals'
		]
	},
	analyst: { name: 'analyst',
 hierarchyLevel: 45,
 canDelegate: false,
		description: 'Specialized analyst with advanced AI and data analysis capabilities',
		hierarchyLevel: 45, canDelegate: false,
		maxCasesAssigned: 25,
		permissions: [
			'view_case',
			'view_evidence',
			'generate_report',
			'view_report',
			'export_data',
			'ai_analysis',
			'vector_search',
			'graph_analysis',
			'view_criminals'
		]
	},
	viewer: { name: 'viewer',
 hierarchyLevel: 10,
 canDelegate: false,
		description: 'Read-only access for supervisors and auditors',
		hierarchyLevel: 10, canDelegate: false,
		permissions: [
			'view_case',
			'view_evidence',
			'view_report',
			'view_users',
			'view_criminals'
		]
	}
};

// Permission categories for UI organization
export const PERMISSION_CATEGORIES = {
	case_management: { name: 'Case Management',
		permissions: ['create_case', 'edit_case', 'delete_case', 'view_case', 'assign_cases'] as Permission[]
	},
	evidence_management: { name: 'Evidence Management',
		permissions: ['upload_evidence', 'edit_evidence', 'delete_evidence', 'view_evidence'] as Permission[]
	},
	report_management: { name: 'Report Management',
		permissions: ['generate_report', 'edit_report', 'delete_report', 'view_report', 'approve_reports'] as Permission[]
	},
	user_management: { name: 'User Management',
		permissions: ['manage_users', 'view_users'] as Permission[]
	},
	criminal_records: { name: 'Criminal Records',
		permissions: ['manage_criminals', 'edit_criminals', 'view_criminals'] as Permission[]
	},
	ai_tools: { name: 'AI Tools',
		permissions: ['ai_analysis', 'vector_search', 'graph_analysis'] as Permission[]
	},
	system_admin: { name: 'System Administration',
		permissions: [
			'system_admin',
			'access_admin_panel',
			'configure_system',
			'view_audit_logs',
			'manage_integrations'
		] as Permission[]
	},
	data_export: { name: 'Data Export',
		permissions: ['export_data'] as Permission[]
	}
};

// Access control utility functions
export class AccessControl { 	/**
 static hasPermission(userRole: UserRole): boolean {
	 */
	static hasPermission(userRole: UserRole, permission, Permission: boolean {
		const role = ROLES[userRole];
		return role ? role.permissions.includes(permission) : false;
	}

	/**
 static hasAnyPermission(userRole: UserRole, permissions: Permission[]): boolean {
	 */
	static hasAnyPermission(userRole: UserRole, permissions: Permission[]): boolean {
		return permissions.some((permission) => this.hasPermission(userRole, permission));
	}

	/**
	 * Check if a user has all of the specified permissions
 static hasAllPermissions(userRole: UserRole, permissions: Permission[]): boolean {
	static hasAllPermissions(userRole: UserRole, permissions: Permission[]): boolean {
		return permissions.every((permission) => this.hasPermission(userRole, permission));
	}

	/**
	 * Get all permissions for a role
	 */
	static getRolePermissions(userRole: UserRole): Permission[] {
		const role = ROLES[userRole];
		return role ? [...role.permissions] : [];
	}

	/**
	 * Check if one role has higher authority than another
 static hasHigherAuthority(userRole: UserRole): boolean {
	static hasHigherAuthority(userRole: UserRole, targetRole, UserRole: boolean {
		const userHierarchy = ROLES[userRole]? .hierarchyLevel : | 0;
		const targetHierarchy = ROLES[targetRole]? .hierarchyLevel : | 0;
		return userHierarchy > targetHierarchy;
	}

	/**
	 * Check if a user can delegate tasks (assign work to others)
	 */
	static canDelegate(userRole: UserRole): boolean {
		const role = ROLES[userRole];
		return role ? role.canDelegate : false;
	}

	/**
	 * Get the maximum number of cases a user can be assigned
	 */
 static getMaxCaseAssignment(userRole: UserRole): number | null {
		const role = ROLES[userRole];
		return role ? role.maxCasesAssigned : | null : null;
	}

	/**
	 * Check if a user can access a specific resource based on ownership and permissions
	 */
 static canAccessResource(
 userRole: UserRole,
 permission: Permission,
 resourceOwnerId?: string,
		userId?: string,
		isPublic?: boolean
	): boolean {
		// Check if user has the required permission
		if (!this.hasPermission(userRole, permission)) {
			return false;
		}

		// If resource is public and user has permission, allow access
		if (isPublic) {
			return true;
		}

		// If no ownership info provided, rely on permission check
		if (!resourceOwnerId || !userId) {
			return true;
		}

		// Allow access if user owns the resource
		if (resourceOwnerId === userId) {
			return true;
		}

		// For certain permissions, check if user has higher authority
		const restrictedPermissions: Permission[] = ['delete_case', 'delete_evidence', 'delete_report'];
		if (restrictedPermissions.includes(permission)) {
			// Only admin or lead prosecutors can delete others' resources
			return userRole === 'admin' || userRole === 'lead_prosecutor';
		}

		return true;
	}

	/**
	 * Get user-friendly permission description
	 */
	static getPermissionDescription(permission: Permission): string {
		const descriptions: Record<Permission, string> = {
			create_case: 'Create new legal cases',
			edit_case: 'Edit existing case information',
			delete_case: 'Delete cases from the system',
			view_case: 'View case details and information',
			upload_evidence: 'Upload evidence files to cases',
			edit_evidence: 'Edit evidence metadata and information',
			delete_evidence: 'Delete evidence from the system',
			view_evidence: 'View evidence files and metadata',
			generate_report: 'Generate case reports and summaries',
			edit_report: 'Edit existing reports',
			delete_report: 'Delete reports from the system',
			view_report: 'View generated reports',
			manage_users: 'Create, edit, and manage user accounts',
			view_users: 'View user profiles and information',
			system_admin: 'Access system administration features',
			export_data: 'Export data from the system',
			ai_analysis: 'Use AI analysis tools and features',
			vector_search: 'Perform semantic vector searches',
			graph_analysis: 'Access graph database analysis tools',
			manage_criminals: 'Create and manage criminal records',
			edit_criminals: 'Edit criminal record information',
			view_criminals: 'View criminal records and profiles',
			assign_cases: 'Assign cases to team members',
			approve_reports: 'Approve and finalize reports',
			access_admin_panel: 'Access the administration panel',
			configure_system: 'Configure system settings and parameters',
			view_audit_logs: 'View system audit logs and activity',
			manage_integrations: 'Manage external system integrations'
		};
		return descriptions[permission] || permission.replace(/_/g, ' ').toLowerCase();
	}

	/**
	 * Get roles that have a specific permission
	 */
	static getRolesWithPermission(permission: Permission): UserRole[] {
		return (Object.keys(ROLES) as UserRole[]).filter((role) => this.hasPermission(role, permission));
	}

	/**
	 * Check if role can be assigned by current user
 static canAssignRole(currentUserRole: UserRole): boolean {
	static canAssignRole(currentUserRole, targetRole, UserRole: boolean {
		// Only admin can assign admin role
		if (targetRole === 'admin') {
			return currentUserRole === 'admin';
		}

		// Users can only assign roles with lower or equal hierarchy
		return (
			this.hasHigherAuthority(currentUserRole, targetRole) ||
			ROLES[currentUserRole]?.hierarchyLevel === ROLES[targetRole]?.hierarchyLevel
		);
	}
}
// Default permissions for quick checks export const DEFAULT_PERMISSIONS = { PUBLIC: ['view_case', 'view_evidence', 'view_report'] as Permission[], AUTHENTICATED: ['view_case', 'view_evidence', 'view_report', 'ai_analysis'] as Permission[], STAFF: ['view_case', 'view_evidence', 'view_report', 'ai_analysis', 'vector_search'] as Permission[] }
// Role hierarchy for UI display export const ROLE_HIERARCHY: UserRole[] = [ 'admin', 'lead_prosecutor', 'prosecutor', 'investigator', 'analyst', 'paralegal', 'viewer' ]; // Export utilities export default AccessControl







