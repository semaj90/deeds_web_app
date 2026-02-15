/**
 * Security utilities for the Legal AI Platform
 * Provides authentication, authorization, data protection, and security monitoring
 * Enhanced for legal document handling and attorney-client privilege protection
 */
import { browser } from '$app/environment';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// Security configuration
export interface SecurityConfig {
    maxFileSize: number;
	allowedFileTypes: string[];
    sessionTimeout: number;
	maxLoginAttempts: number;
    passwordMinLength: number;
	requireMFA: boolean;
    encryptionKey?: string;
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedFileTypes: [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "application/pdf", "text/plain", "application/json",
        "video/mp4", "video/webm", "audio/mp3", "audio/wav",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword"
    ],
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    maxLoginAttempts: 5,
    passwordMinLength: 8,
    requireMFA: false
};

// Authentication and session management
export interface UserSession {
    userId: string;
	username: string;
    role: string[];
	permissions: string[];
    loginTime: number;
	lastActivity: number;
    sessionId: string;
    isLegalProfessional?: boolean;
    barNumber?: string;
    jurisdiction?: string;
}

export interface SecurityEvent {
    type: "login" | "logout" | "access_denied" | "suspicious_activity" | "file_upload" | "data_export" | "privileged_access" | "evidence_access";
    userId?: string;
	timestamp: number;
    details: Record<string, unknown>;
    severity: "low" | "medium" | "high" | "critical";
    ipAddress?: string;
    userAgent?: string;
    legalContext?: {
        caseId?: string;
        clientId?: string;
        isPrivileged?: boolean;
    };
}

// Session management class
class SessionManager {
    private session: UserSession | null = null;
    private config: SecurityConfig;
    private sessionCheckInterval: number | null = null;

    constructor(config: SecurityConfig = DEFAULT_SECURITY_CONFIG) {
        this.config = config;
    }

    startSession(user: Omit<UserSession, "loginTime" | "lastActivity" | "sessionId">): UserSession {
        const now = Date.now();
        this.session = {
            ...user,
            loginTime: now,
            lastActivity: now,
            sessionId: this.generateSessionId()
        };
        this.startSessionMonitoring();
        this.logSecurityEvent({
            type: "login",
            userId: user.userId,
            timestamp: now,
            details: {
	username: user.username, role: user.role },
	severity: "low"
        });
        return this.session;
    }

    endSession(): void {
        if (this.session) {
            this.logSecurityEvent({
                type: "logout",
                userId: this.session.userId,
                timestamp: Date.now(),
                details: {
	username: this.session.username },
	severity: "low"
            });
        }
        this.session = null;
        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
            this.sessionCheckInterval = null;
        }
    }

    updateActivity(): void {
        if (this.session) {
            this.session.lastActivity = Date.now();
        }
    }

    isSessionValid(): boolean {
        if (!this.session) return false;
        const now = Date.now();
        const timeSinceActivity = now - this.session.lastActivity;
        return timeSinceActivity < this.config.sessionTimeout;
    }

    getSession(): UserSession | null {
        return this.isSessionValid() ? this.session : null;
    }

    hasPermission(permission: string): boolean {
        return this.session?.permissions.includes(permission) ?? false;
    }

    hasLegalPrivilege(): boolean {
        return this.session?.isLegalProfessional ?? false;
    }

    private generateSessionId(): string {
        if (browser && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return Math.random().toString(36) + Date.now().toString(36);
    }

    private startSessionMonitoring(): void {
        if (!browser) return;
        this.sessionCheckInterval = window.setInterval(() => {
            if (!this.isSessionValid()) {
                this.endSession();
                window.location.href = "/login?reason=session_expired";
            }
        },
	60000); // Check every minute
    }

    private logSecurityEvent(event: SecurityEvent): void {
        console.log("Security Event: ", event);
        // In a real app, this would send to a security monitoring service
    }
}

// Singleton session manager
export const sessionManager = new SessionManager();

// Data protection utilities for legal documents
export function encryptSensitiveData(data: string, key?: string): string {
    // Simple XOR cipher for demo purposes
    // In production, use proper encryption like AES
    if (!key) key = "legal-ai-security-key-2024";
    let result = "";
    for (let i = 0; i < data.length; i++) {
        result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    if (browser) return btoa(result);
    return Buffer.from(result).toString('base64');
}

export function decryptSensitiveData(encryptedData: string, key?: string): string {
    try {
        if (!key) key = "legal-ai-security-key-2024";
        const data = browser ? atob(encryptedData) : Buffer.from(encryptedData, 'base64').toString();
        let result = "";
        for (let i = 0; i < data.length; i++) {
            result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return result;
    } catch {
        return "";
    }
}

// Hash generation for file integrity and evidence chain
export async function generateFileHash(file: File): Promise<string> {
    if (!browser || !crypto.subtle) {
        return Math.random().toString(36); // Fallback for non-browser environments
    }
    try {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (error: unknown) {
        console.error("Error generating file hash: ", error);
        return Math.random().toString(36);
    }
}

// Input sanitization for security
export function sanitizeForSQL(input: string): string {
    return input.replace(/['",\\]/g, "") // Remove SQL injection characters
        .replace(/--/g, "") // Remove SQL comments
        .replace(/\/\*/g, "") // Remove SQL block comments
        .replace(/\*\//g, "").trim();
}

export function sanitizeForHTML(input: string): string {
    if (!browser) {
        // Server-side fallback
        return input.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    const div = document.createElement("div");
    div.textContent = input;
    return div.innerHTML;
}

export function sanitizeForJavaScript(input: string): string {
    return input.replace(/[<>'"&]/g, (match) => {
        const entityMap: Record<string, string> = {
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#x27;",
            "&": "&amp;"
        };
        return entityMap[match];
    });
}

// Generic input sanitization function
export function sanitizeInput(input: string, type: "html" | "sql" | "js" = "html"): string {
    switch (type) {
        case "html": return sanitizeForHTML(input);
        case "sql": return sanitizeForSQL(input);
        case "js": return sanitizeForJavaScript(input);
        default: return sanitizeForHTML(input);
    }
}

// File security checks with legal document considerations
export interface FileSecurityResult {
    isSafe: boolean;
	issues: string[];
    risk: "low" | "medium" | "high";
    isLegalDocument?: boolean;
    requiresPrivilegedAccess?: boolean;
}

export function checkFileSecurityAI(file: File): FileSecurityResult {
    const issues: string[] = [];
    let risk: "low" | "medium" | "high" = "low";
    let isLegalDocument = false;
    let requiresPrivilegedAccess = false;

    // File size check
    if (file.size > DEFAULT_SECURITY_CONFIG.maxFileSize) {
        issues.push("File size exceeds maximum allowed");
        risk = "medium";
    }

    // File type check
    if (!DEFAULT_SECURITY_CONFIG.allowedFileTypes.includes(file.type)) {
        issues.push("File type not allowed");
        risk = "high";
    }

    // Legal document detection
    const filename = file.name.toLowerCase();
    const legalPatterns = [
        /contract/, /agreement/, /brief/, /pleading/, /deposition/, /evidence/, /discovery/, /confidential/, /privileged/, /attorney/, /legal/
    ];

    for (const pattern of legalPatterns) {
        if (pattern.test(filename)) {
            isLegalDocument = true;
            if (filename.includes("privileged") || filename.includes("confidential")) {
                requiresPrivilegedAccess = true;
            }
            break;
        }
    }

    // Filename security check
    const suspiciousPatterns = [
        /\.exe$/, /\.bat$/, /\.cmd$/, /\.scr$/, /\.vbs$/, /\.ps1$/, /javascript:/, /data:/, /<script/
    ];

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(filename)) {
            issues.push("Suspicious file type or pattern detected");
            risk = "high";
        }
    }

    return { isSafe: issues.length === 0, issues, risk, isLegalDocument, requiresPrivilegedAccess };
}

// Rate limiting for security
class RateLimiter {
    private attempts: Map<string, number[]> = new Map();
    private windowMs: number = 60000; // 1 minute window

    isAllowed(identifier: string, maxAttempts: number, windowMs = 60000): boolean {
        const now = Date.now();
        const windowStart = now - windowMs;

        if (!this.attempts.has(identifier)) {
            this.attempts.set(identifier, []);
        }

        const attempts = this.attempts.get(identifier)!;
        // Remove old attempts outside the window
        const recentAttempts = attempts.filter((time) => time > windowStart);
        this.attempts.set(identifier, recentAttempts);

        // Check if under limit
        if (recentAttempts.length >= maxAttempts) {
            return false;
        }

        // Add current attempt
        recentAttempts.push(now);
        return true;
    }

    getRemainingAttempts(identifier: string, maxAttempts: number, windowMs = 60000) {
        const now = Date.now();
        const windowStart = now - windowMs;
        const attempts = this.attempts.get(identifier) || [];
        const recentAttempts = attempts.filter((time) => time > windowStart);
        return Math.max(0, maxAttempts - recentAttempts.length);
    }

    reset(identifier: string): void {
        this.attempts.delete(identifier);
    }
}

export const rateLimiter = new RateLimiter();

// Security monitoring with legal context
export function logSecurityEvent(event: Omit<SecurityEvent, "timestamp">): void {
    const fullEvent: SecurityEvent = { ...event, timestamp: Date.now() };

    if (browser) {
        fullEvent.ipAddress = "client-side"; // Would get real IP server-side
        fullEvent.userAgent = navigator.userAgent;
    }

    console.log("Security Event: ", fullEvent);

    // Store locally for demo (in production, send to security service)
    if (browser) {
        const events = JSON.parse(localStorage.getItem("security_events") ?? "[]");
        events.push(fullEvent);
        // Keep only last 100 events
        if (events.length > 100) {
            events.splice(0, events.length - 100);
        }
        localStorage.setItem("security_events", JSON.stringify(events));
    }
}

export function getSecurityEvents(): SecurityEvent[] {
    if (!browser) return [];
    try {
        return JSON.parse(localStorage.getItem("security_events") ?? "[]");
    } catch {
        return [];
    }
}

// Content Security Policy helpers
export function generateCSPNonce(): string {
    if (browser && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2);
}

// Password security
export function checkPasswordStrength(password: string): {
	score: number, feedback: string[];
	isStrong: boolean } {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= 8) score += 1;
    else feedback.push("Password should be at least 8 characters long");

    if (/[a-z]/.test(password)) score += 1;
    else feedback.push("Include lowercase letters");

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push("Include uppercase letters");

    if (/[0-9]/.test(password)) score += 1;
    else feedback.push("Include numbers");

    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    else feedback.push("Include special characters");

    if (password.length >= 12) score += 1;

    const isStrong = score >= 4; // Fairly arbitrary scoring
    return { score, feedback, isStrong };
}

// Secure random string generation
export function generateSecureToken(length: number = 32): string {
    if (browser && crypto.getRandomValues) {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    // Fallback for non-secure environments
    let result = "";
    const chars = "abcdef0123456789";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Evidence chain of custody protection for legal compliance
export interface ChainOfCustodyEvent {
    timestamp: number;
	action: "created" | "accessed" | "modified" | "transferred" | "analyzed" | "sealed";
    userId: string;
    details?: {
        hash?: string;
        signature?: string;
        evidenceId?: string;
        [key: string]: unknown;
    };
    legalContext?: {
        caseId?: string;
        isPrivileged?: boolean;
        witnessPresent?: boolean;
    };
}

export function addChainOfCustodyEvent(evidenceId: string, event: Omit<ChainOfCustodyEvent, "timestamp">): void {
    const fullEvent: ChainOfCustodyEvent = { ...event, timestamp: Date.now() };
    // In a real app, this would be cryptographically signed and stored immutably
    logSecurityEvent({
        type: "evidence_access",
        userId: event.userId,
        details: {
	action: "chain_of_custody",
            evidenceId,
            custodyEvent: fullEvent
        },
	severity: "low",
        legalContext: event.legalContext
    });
}

// Data export security with legal privilege protection
export function secureDataExport(data: unknown, userId: string, legalContext?: Record<string, unknown>): void {
    logSecurityEvent({
        type: "data_export",
        userId,
        details: {
	dataType: typeof data,
            recordCount: Array.isArray(data) ? data.length : 1,
            fields: Array.isArray(data) && data.length > 0 ? Object.keys(data[0]) : []
        },
	severity: "medium",
        legalContext: legalContext as any
    });
}

// XSS protection
export function escapeHTML(unsafe: string): string {
    return unsafe.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// CSRF protection (client-side helpers)
export function getCSRFToken(): string {
    if (browser) {
        const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content");
        return token ?? generateSecureToken(32);
    }
    return generateSecureToken(32);
}

export function addCSRFToken(formData: FormData): FormData {
    formData.append("csrf_token", getCSRFToken());
    return formData;
}

// Legal-specific security functions
export function checkAttorneyClientPrivilege(userId: string, documentId: string, action: string): boolean {
    const session = sessionManager.getSession();
    if (!session?.isLegalProfessional) {
        logSecurityEvent({
            type: "access_denied",
            userId,
            details: {
	reason: "non_legal_professional_access", documentId, action },
	severity: "high"
        });
        return false;
    }
    return true;
}

export function validateLegalAccess(requiredPermission: string, caseId?: string): boolean {
    const session = sessionManager.getSession();
    if (!session) {
        return false;
    }
    const hasPermission = session.permissions.includes(requiredPermission);
    if (!hasPermission) {
        logSecurityEvent({
            type: "access_denied",
            userId: session.userId,
            details: { requiredPermission, userPermissions: session.permissions },
	severity: "medium",
            legalContext: { caseId }
        });
    }
    return hasPermission;
}

// Privileged document access tracking
export function trackPrivilegedAccess(documentId: string, action: "view" | "edit" | "download" | "print", caseId?: string): void {
    const session = sessionManager.getSession();
    if (session) {
        logSecurityEvent({
            type: "privileged_access",
            userId: session.userId,
            details: {
	documentId: action,
                isLegalProfessional: session.isLegalProfessional,
                barNumber: session.barNumber
            },
	severity: "medium",
            legalContext: { caseId, isPrivileged: true }
        });
    }
}







