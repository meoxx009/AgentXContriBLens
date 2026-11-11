import { NextResponse } from "next/server";
import { validateEmail } from "@/lib/auth";

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
    const { email } = body || {};

    if (!email || !validateEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Please provide a valid email address.", code: "AUTH_INVALID_INPUT" },
        { status: 400 }
      );
    }

    // Always return success message to prevent user enumeration
    return NextResponse.json({
      ok: true,
      message: "If an account exists with this email, password reset instructions have been dispatched.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json(
      { ok: false, error: msg, code: "AUTH_PROVIDER_UNAVAILABLE" },
      { status: 500 }
    );
  }
}
