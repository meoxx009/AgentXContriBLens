import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true, message: "Logged out successfully." });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export async function GET(req: Request) {
  const response = NextResponse.redirect(new URL("/", req.url));
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
