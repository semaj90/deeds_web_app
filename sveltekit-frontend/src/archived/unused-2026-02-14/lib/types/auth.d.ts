// Lucia authentication types
declare module 'lucia' {
	export interface CookieAttributes {
		httpOnly?: boolean;
		sameSite?: 'strict' | 'lax' | 'none';
		secure?: boolean;
		path?: string;
		maxAge?: number;
		expires?: Date;
	}

	export interface SessionCookieAttributesOptions {
		sameSite?: 'strict' | 'lax' | 'none';
		httpOnly?: boolean;
		secure?: boolean;
		path?: string;
	}

	export interface SessionCookie {
		name: string;
		value: string;
		attributes: CookieAttributes & { path: string };
	}

	export interface Lucia {
		createSessionCookie(sessionId: string): SessionCookie;
		createBlankSessionCookie(): SessionCookie;
	}
}

// SvelteKit cookie types compatibility
declare module '@sveltejs/kit' {
	export interface CookieSerializeOptions {
		path?: string;
		httpOnly?: boolean;
		sameSite?: 'strict' | 'lax' | 'none';
		secure?: boolean;
		maxAge?: number;
		expires?: Date;
	}
}

// Ensure the file is a module
export {};
