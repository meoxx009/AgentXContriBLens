import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signSessionToken, AUTH_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getAuthRedirectFromParams } from "@/lib/auth-redirect";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const destination = getAuthRedirectFromParams(requestUrl.searchParams, "/app/scan");

  if (code && isSupabaseConfigured()) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.session?.user) {
        const sbUser = data.session.user;
        const email = sbUser.email || `contributor_${sbUser.id.substring(0, 8)}@users.noreply.github.com`;
        const name =
          sbUser.user_metadata?.full_name ||
          sbUser.user_metadata?.name ||
          sbUser.user_metadata?.user_name ||
          email.split("@")[0] ||
          "GitHub Contributor";
        const githubUsername = sbUser.user_metadata?.user_name || sbUser.user_metadata?.preferred_username;
        const githubId = sbUser.user_metadata?.sub || sbUser.id;

        let user = db.getUserById(sbUser.id) || db.getUserByEmail(email);
        if (!user) {
          user = db.createUser({
            id: sbUser.id,
            email,
            name,
            githubId,
            githubUsername,
            createdAt: new Date().toISOString(),
          });
        } else {
          if (githubUsername && !user.githubUsername) user.githubUsername = githubUsername;
          if (githubId && !user.githubId) user.githubId = githubId;
          db.saveUser(user);
        }

        const sessionToken = signSessionToken({
          userId: user.id,
          email: user.email,
          name: user.name,
        });

        const response = NextResponse.redirect(new URL(destination, requestUrl.origin));
        response.cookies.set({
          ...getSessionCookieOptions(),
          value: sessionToken,
        });

        return response;
      }
    } catch (err) {
      console.error("Server OAuth code exchange error:", err);
    }
  }

  // Redirect to login if code exchange not possible or failed
  return NextResponse.redirect(new URL("/login?error=oauth_failed", requestUrl.origin));
}
