// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: {
        id: string;
        email: string;
        name: string;
        role: "admin" | "user" | "detective";
      } | null;
      session: {
        id: string;
        userId: string;
        expiresAt: Date;
      } | null;
    }
    interface PageData {
      user?: App.Locals["user"];
      session?: App.Locals["session"];
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
