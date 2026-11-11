import { NextResponse } from "next/server";
import { apiError, requireAuth } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) {
      return NextResponse.json({ ok: false, user: null }, { status: 401 });
    }
    const user = auth.user;

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        displayName: user.displayName || user.name,
        bio: user.bio ?? null,
        githubUsername: user.githubUsername,
        settings: user.settings,
        createdAt: user.createdAt,
      },
    });
  } catch (err: any) {
    return apiError(
      err?.message || "Failed to retrieve session user",
      500,
      "AUTH_PROVIDER_UNAVAILABLE"
    );
  }
}
