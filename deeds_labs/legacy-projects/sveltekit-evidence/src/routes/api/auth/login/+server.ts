// Authentication endpoint - integrates with QUIC server
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/db";
import { users, sessions } from "$lib/db/schema";
import { eq } from "drizzle-orm";
import { quicClient } from "$lib/services/quicClient";
import bcrypt from "bcrypt";

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return json({ error: "Email and password required" }, { status: 400 });
    }

    // Find user in local database
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Verify password
    if (user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return json({ error: "Invalid credentials" }, { status: 401 });
      }
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    const [session] = await db
      .insert(sessions)
      .values({
        id: sessionId,
        userId: user.id,
        expiresAt,
      })
      .returning();

    // Sync with QUIC authentication server
    try {
      const quicAuth = await quicClient.login(email, password);
      if (quicAuth) {
        quicClient.setSession(quicAuth.session.token);
      }
    } catch (error) {
      console.warn("QUIC auth sync failed:", error);
      // Continue with local auth
    }

    // Set session cookie
    cookies.set("session", sessionId, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // Update last login
    await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, user.id));

    return json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return json({ error: "Login failed" }, { status: 500 });
  }
};
