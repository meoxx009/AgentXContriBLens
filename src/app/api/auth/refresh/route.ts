import { NextResponse } from "next/server";
import { getCurrentUser, signSessionToken, getSessionCookieOptions } from "@/lib/auth";
import { isSupabaseConfigured, getSupabaseServerClient } from "@/lib/supabase";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional for simple session refresh
    }

    const { supabaseToken } = body || {};

    // 1. If a refreshed Supabase token was passed from browser SDK
    if (supabaseToken && isSupabaseConfigured()) {
      try {
        const client = getSupabaseServerClient();
        if (client) {
          const { data: { user: sbUser }, error } = await client.auth.getUser(supabaseToken);
          if (!error && sbUser) {
            const email = sbUser.email || `contributor_${sbUser.id.substring(0, 8)}@example.com`;
            const name =
              sbUser.user_metadata?.full_name ||
              sbUser.user_metadata?.name ||
              email.split("@")[0] ||
              "Contributor";

            let user = db.getUserById(sbUser.id) || db.getUserByEmail(email);
            if (!user) {
              user = db.createUser({
                id: sbUser.id,
                email,
                name,
                githubUsername: sbUser.user_metadata?.user_name,
                githubId: sbUser.user_metadata?.sub || sbUser.id,
                createdAt: new Date().toISOString(),
              });
            }

            const freshToken = signSessionToken({
              userId: user.id,
              email: user.email,
              name: user.name,
            });

            const res = NextResponse.json({
              ok: true,
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                settings: user.settings,
              },
            });
            res.cookies.set({
              ...getSessionCookieOptions(),
              value: freshToken,
            });
            return res;
          }
        }
      } catch (err) {
        console.warn("Supabase token refresh sync error:", err);
      }
    }

    // 2. Standard session refresh using existing session cookie / bearer token
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: "Session expired or invalid. Please sign in again.",
          code: "AUTH_SESSION_EXPIRED",
        },
        { status: 401 }
      );
    }

    // Extend session with a freshly signed token
    const refreshedToken = signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        settings: user.settings,
      },
    });

    res.cookies.set({
      ...getSessionCookieOptions(),
      value: refreshedToken,
    });

    return res;
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Failed to refresh session",
        code: "AUTH_PROVIDER_UNAVAILABLE",
      },
      { status: 500 }
    );
  }
}
