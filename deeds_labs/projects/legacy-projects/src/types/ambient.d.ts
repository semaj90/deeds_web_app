// Pure ambient declarations — no top-level `export`/`import` so module augmentations are allowed.

// Global ambient module declarations to help focused type-checking during migration
declare module '$lib/*' {
  const anyValue: any;
  export default anyValue;
}

interface RegistrationData {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  department?: string;
  jurisdiction?: string;
  deviceInfo?: Record<string, unknown>;
  [key: string]: unknown;
}
