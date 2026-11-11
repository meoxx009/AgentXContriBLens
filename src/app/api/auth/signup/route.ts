import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  hashPassword,
  validateEmail,
  signSessionToken,
  AUTH_COOKIE_NAME,
  getSessionCookieOptions,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { isSupabaseConfigured, getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON request payload.", code: "AUTH_INVALID_INPUT" },
        { status: 400 }
      );
    }
    const { email, password, passwordConfirmation, acceptedTerms } = body || {};

    if (!email || !validateEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Please provide a valid email address.", code: "AUTH_INVALID_INPUT" },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 8 characters long.", code: "AUTH_INVALID_INPUT" },
        { status: 400 }
      );
    }

    if (password !== passwordConfirmation) {
      return NextResponse.json(
        { ok: false, error: "Password confirmation does not match.", code: "AUTH_INVALID_INPUT" },
        { status: 400 }
      );
    }

    if (!acceptedTerms) {
      return NextResponse.json(
        { ok: false, error: "You must accept the terms of service and privacy notice.", code: "AUTH_INVALID_INPUT" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const cleanEmail = email.trim().toLowerCase();
    const existing = db.getUserByEmail(cleanEmail);
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "An account with this email already exists.", code: "AUTH_INVALID_INPUT" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    const userId = uuidv4();
    const name = cleanEmail.split("@")[0];

    // Try Supabase auth if configured
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseServerClient();
        if (client) {
          const { error: sbError } = await client.auth.admin.createUser({
            email: cleanEmail,
            password: password,
            email_confirm: true,
            user_metadata: { name },
          });
          if (sbError) {
            console.warn("Supabase auth creation note:", sbError.message);
          }
        }
      } catch (err) {
        console.warn("Supabase user creation fallback to local:", err);
      }
    }

    // Save user in local persistence
    const newUser = {
      id: userId,
      email: cleanEmail,
      name,
      passwordHash,
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    db.createUser(newUser);

    const sessionToken = signSessionToken({
      userId,
      email: cleanEmail,
      name,
    });

    const response = NextResponse.json({
      ok: true,
      user: {
        id: userId,
        email: cleanEmail,
        name,
      },
    });

    response.cookies.set({
      ...getSessionCookieOptions(),
      value: sessionToken,
    });

    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Signup failed";
    return NextResponse.json(
      { ok: false, error: msg, code: "AUTH_PROVIDER_UNAVAILABLE" },
      { status: 500 }
    );
  }
}
