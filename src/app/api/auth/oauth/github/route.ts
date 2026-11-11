import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { signSessionToken, AUTH_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON request payload.", errorCode: "AUTH_INVALID_INPUT" },
        { status: 400 }
      );
    }

    const { code, state, supabaseUser, supabaseToken } = body || {};

    // 1. Direct Supabase Authenticated User Sync
    if (supabaseUser && typeof supabaseUser === "object") {
      const email = supabaseUser.email || `contributor_${(supabaseUser.id || uuidv4()).substring(0, 8)}@users.noreply.github.com`;
      const name = supabaseUser.name || supabaseUser.githubUsername || email.split("@")[0] || "GitHub Contributor";
      const githubUsername = supabaseUser.githubUsername || undefined;
      const githubId = supabaseUser.githubId || supabaseUser.id || `gh_${uuidv4().substring(0, 8)}`;

      let user = db.getUserById(supabaseUser.id) || db.getUserByEmail(email);
      if (!user) {
        user = db.createUser({
          id: supabaseUser.id || uuidv4(),
          email,
          name,
          githubId,
          githubUsername,
          createdAt: new Date().toISOString(),
        });
      } else {
        if (githubUsername && !user.githubUsername) {
          user.githubUsername = githubUsername;
        }
        if (githubId && !user.githubId) {
          user.githubId = githubId;
        }
        db.saveUser(user);
      }

      const sessionToken = signSessionToken({
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      const response = NextResponse.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          githubUsername: user.githubUsername,
        },
      });

      response.cookies.set({
        ...getSessionCookieOptions(),
        value: sessionToken,
      });

      return response;
    }

    const isSimulated = code === "mock_code";
    const isConfigured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

    if (!code && !isSimulated) {
      return NextResponse.json(
        { ok: false, error: "Authorization code is required.", errorCode: "AUTH_INVALID_INPUT" },
        { status: 400 }
      );
    }

    if (!isConfigured && !isSimulated) {
      return NextResponse.json(
        {
          ok: false,
          error: "GitHub OAuth is unconfigured in this environment. Please configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
          errorCode: "AUTH_PROVIDER_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    // For simulated GitHub OAuth (mock_code)
    const githubId = `gh_${uuidv4().substring(0, 8)}`;
    const email = `contributor_${githubId}@users.noreply.github.com`;
    const name = "GitHub Contributor";

    let user = db.getUserByGithubId(githubId);
    if (!user) {
      user = db.createUser({
        id: uuidv4(),
        email,
        name,
        githubId,
        githubUsername: "contributor",
        createdAt: new Date().toISOString(),
      });
    }

    const sessionToken = signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        githubUsername: user.githubUsername,
      },
    });

    response.cookies.set({
      ...getSessionCookieOptions(),
      value: sessionToken,
    });

    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "GitHub OAuth failed";
    return NextResponse.json(
      { ok: false, error: msg, errorCode: "AUTH_PROVIDER_UNAVAILABLE" },
      { status: 500 }
    );
  }
}
