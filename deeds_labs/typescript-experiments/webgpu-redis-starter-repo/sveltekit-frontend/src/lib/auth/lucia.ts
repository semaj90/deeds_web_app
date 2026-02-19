// Lucia v3 Authentication Setup for SvelteKit 2
import { Lucia } from "lucia";
import { dev } from "$app/environment";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { db } from "$lib/server/db";
import { userTable, sessionTable } from "$lib/server/db/schema";

// Lucia v3 configuration
const adapter = new DrizzlePostgreSQLAdapter(db, sessionTable, userTable);

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		attributes: {
			secure: !dev,
			sameSite: "strict",
			httpOnly: true,
			path: "/"
		}
	},
	getUserAttributes: (attributes) => {
		return {
			email: attributes.email,
			name: attributes.name,
			role: attributes.role,
			organizationId: attributes.organizationId,
			preferences: attributes.preferences,
			createdAt: attributes.createdAt
		};
	}
});

declare module "lucia" {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: {
			email: string;
			name: string;
			role: "user" | "admin" | "lawyer" | "paralegal";
			organizationId?: string;
			preferences: {
				aiModel: "gemma3" | "gemma-local" | "crew-ai";
				maxTokens: number;
				temperature: number;
				enableCache: boolean;
				enableRL: boolean;
			};
			createdAt: Date;
		};
	}
}

// User management utilities
export class UserManager {
  static async createUser(
    email: string,
    password: string,
    name: string,
    role: "user" | "lawyer" | "paralegal" = "user"
  ) {
    const passwordHash = await Bun.password.hash(password);

    const [user] = await db
      .insert(userTable)
      .values({
        email,
        passwordHash,
        name,
        role,
        preferences: {
          aiModel: "gemma3",
          maxTokens: 1024,
          temperature: 0.7,
          enableCache: true,
          enableRL: true,
        },
      })
      .returning();

    return user;
  }

  static async verifyPassword(email: string, password: string) {
    const user = await db.query.userTable.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    });

    if (!user) return null;

    const validPassword = await Bun.password.verify(
      password,
      user.passwordHash
    );
    return validPassword ? user : null;
  }

  static async getUserCases(userId: string) {
    const cases = await db.query.caseTable.findMany({
      where: (cases, { eq }) => eq(cases.userId, userId),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
          limit: 50,
        },
        embeddings: true,
      },
    });

    return cases;
  }

  static async updateUserPreferences(
    userId: string,
    newPreferences: Partial<DatabaseUserAttributes["preferences"]>
  ) {
    const user = await db.query.userTable.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
      columns: {
        preferences: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const updatedPreferences = { ...user.preferences, ...newPreferences };

    await db
      .update(userTable)
      .set({
        preferences: updatedPreferences,
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, userId));
  }
}