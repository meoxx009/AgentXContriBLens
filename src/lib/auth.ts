import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { User } from "@/types";
import { db } from "./db";
import { getSupabaseServerClient, isSupabaseConfigured } from "./supabase";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "contriblens-local-jwt-secret-key-32-chars-min";
const AUTH_COOKIE_NAME = "contriblens_session";

export function getSessionCookieOptions() {
  return {
    name: AUTH_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

export function validateEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function hashPasswordSync(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function comparePasswordSync(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return comparePassword(password, hash);
}

export function verifyPasswordSync(password: string, hash: string): boolean {
  return comparePasswordSync(password, hash);
}

export function signSessionToken(user: { id?: string; userId?: string; email: string; name: string }): string {
  const userId = user.userId || user.id || "";
  return jwt.sign(
    {
      userId,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET);
    return false;
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") return true;
    return false;
  }
}

export async function getCurrentUser(req?: Request): Promise<User | null> {
  try {
    let token: string | undefined;

    // 1. If req is provided, check its Cookie or Authorization header directly
    if (req) {
      const cookieHeader = req.headers.get("cookie") || req.headers.get("Cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
        if (match) token = match[1];
      }
      if (!token) {
        const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7).trim();
        }
      }
    }

    // 2. Otherwise try next/headers
    if (!token) {
      try {
        const { cookies, headers } = await import("next/headers");
        const cookieStore = await cookies();
        token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

        if (!token) {
          const headerStore = await headers();
          const authHeader = headerStore.get("authorization") || headerStore.get("Authorization");
          if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7).trim();
          }
        }
      } catch {
        // cookies() or headers() called outside request context (e.g. in tests)
      }
    }

    if (!token) return null;

    const session = verifySessionToken(token);
    if (!session || !session.userId) return null;

    // 1. Try local DB by ID or by email
    let localUser = db.getUserById(session.userId);
    if (!localUser && session.email) {
      localUser = db.getUserByEmail(session.email);
    }
    if (localUser) return localUser;

    // 2. Cold instance / Supabase resolution: check if Supabase has user profile
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseServerClient();
        if (client) {
          const { data, error } = await client
            .from("profiles")
            .select("*")
            .eq("id", session.userId)
            .maybeSingle();

          if (!error && data) {
            localUser = db.createUser({
              id: data.id,
              email: data.email || session.email,
              name: data.full_name || data.name || session.name || session.email.split("@")[0] || "Contributor",
              createdAt: data.created_at || new Date().toISOString(),
              settings: data.settings || undefined,
            });
            return localUser;
          }
        }
      } catch (err) {
        console.debug("Supabase user resolution fallback warning:", err);
      }
    }

    // 3. Self-heal: If session JWT is cryptographically valid and signed with JWT_SECRET,
    // restore the user record in DB so sessions are resilient across server restarts and DB wipes
    if (session.userId && session.email) {
      localUser = db.createUser({
        id: session.userId,
        email: session.email,
        name: session.name || session.email.split("@")[0] || "Contributor",
        createdAt: new Date().toISOString(),
      });
      return localUser;
    }

    return null;
  } catch (error) {
    console.error("Error reading current user session:", error);
    return null;
  }
}

export { AUTH_COOKIE_NAME, JWT_SECRET };
