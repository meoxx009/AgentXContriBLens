"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ContribLensLogo from "@/components/ContribLensLogo";
import { AppProvider, useApp } from "@/components/AppContext";
import {
  LayoutDashboard,
  Search,
  ShieldAlert,
  GitPullRequest,
  FileText,
  User,
  Terminal,
} from "lucide-react";
import { throttleRaf } from "@/lib/throttle";

function AppLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useApp();
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);

  // Scroll listener: capsule gains stronger shadow when window.scrollY > 8
  // rAF-throttled with throttleRaf (requestAnimationFrame), removed on unmount, disabled under reduced motion
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      return;
    }

    const throttledScroll = throttleRaf(() => {
      setIsScrolled(window.scrollY > 8);
    });

    window.addEventListener("scroll", throttledScroll, { passive: true });
    throttledScroll();

    return () => {
      window.removeEventListener("scroll", throttledScroll);
      throttledScroll.cancel();
    };
  }, []);

  const navItems = [
    { name: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
    { name: "Scan Repository", href: "/app/scan", icon: Search },
    { name: "Live Agent Log", href: "/app/agent", icon: Terminal },
    { name: "Findings", href: "/app/findings", icon: ShieldAlert },
    { name: "Contributions + Stack", href: "/app/contributions", icon: GitPullRequest },
    { name: "Issue Drafts", href: "/app/issue-drafts", icon: FileText },
    { name: "Profile", href: "/app/profile", icon: User },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-transparent text-textPrimary">
        {/* Floating Horizontal Glass Navigation Bar (DESIGN.md §9 - never a sidebar) */}
        <header className="fixed top-3 top-[max(0.75rem,env(safe-area-inset-top))] inset-x-0 z-40 px-3 sm:px-6 pointer-events-none transition-all duration-200">
          {/* Main Floating Nav Capsule */}
          <div
            className={`max-w-6xl mx-auto rounded-full glass-nav-capsule px-4 sm:px-6 h-14 flex items-center justify-between pointer-events-auto transition-all duration-200 ${
              isScrolled
                ? "shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_24px_rgba(255,109,31,0.12)] border-platinumSilver/35"
                : ""
            }`}
          >
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <ContribLensLogo size={28} />
            </Link>

            {/* Horizontal Nav Links (desktop & tablet) */}
            <nav className="hidden md:flex items-center gap-1 overflow-x-auto no-scrollbar">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative px-2.5 lg:px-3.5 py-1.5 text-xs font-medium tracking-wide flex items-center gap-1.5 lg:gap-2 rounded-full whitespace-nowrap transition-all press-spring ${
                      isActive
                        ? "text-sustainableLinen bg-white/10 shadow-sm"
                        : "text-textMuted hover:text-sustainableLinen hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-electricTangerine" : "text-textMuted"}`} />
                    <span>{item.name}</span>
                    {isActive && (
                      <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-lemonChiffon rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Mobile (<md) Secondary Horizontal Scroll Rail (Detached Capsule Strip) */}
          <div
            data-testid="app-mobile-nav-rail"
            className="md:hidden mt-2 max-w-6xl mx-auto pointer-events-auto px-1"
          >
            <div className="glass-capsule rounded-full px-2 py-1 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-lg">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`min-h-[44px] px-3.5 py-2 text-xs font-medium whitespace-nowrap flex items-center gap-1.5 rounded-full shrink-0 transition-colors press-spring touch-manipulation ${
                      isActive
                        ? "bg-white/10 text-sustainableLinen font-semibold shadow-sm"
                        : "text-textMuted hover:text-sustainableLinen"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-electricTangerine" : "text-textMuted"}`} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </header>

        {/* Main App Content View with top padding to prevent floating nav overlap */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 md:pt-24 pt-[calc(max(0.75rem,env(safe-area-inset-top))+7.5rem)] md:pt-[calc(max(0.75rem,env(safe-area-inset-top))+5rem)] pb-[max(2rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayoutInner>{children}</AppLayoutInner>;
}
