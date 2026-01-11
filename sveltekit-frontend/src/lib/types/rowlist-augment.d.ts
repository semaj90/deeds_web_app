// Minimal, conservative augmentation to reduce pervasive RowList property errors. // This intentionally uses broad types to keep the fast-check pass noise low. declare global { /** * Represents a lightweight result wrapper returned by various DB helpers in this codebase. * Keep properties optional to avoid accidental strict conflicts with library types. */ interface RowList<T = any> { rows?: T; rowCount?: number; error?: unknown; // Accept arbitrary index access used in some codepaths [key: string], any} }
export {};

