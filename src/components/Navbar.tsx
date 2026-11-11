"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ContribLensMark from "./ContribLensMark";
import { useApp } from "@/components/AppContext";
import { ArrowRight, Menu, X } from "lucide-react";
import { throttleRaf } from "@/lib/throttle";

export default function Navbar() {
  const pathname = usePathname();
  const { user, openAuthModal } = useApp();
  const [activeSection, setActiveSection] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // Track active section for public landing page
  useEffect(() => {
    if (pathname !== "/") {
      setActiveSection("");
      return;
    }

    const sections = ["process", "features", "safety", "faqs"];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-25% 0px -50% 0px" }
    );

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [pathname]);

  const navLinks = [
    { name: "Process", href: "/#process", id: "process" },
    { name: "Features", href: "/#features", id: "features" },
    { name: "Safety", href: "/#safety", id: "safety" },
    { name: "FAQs", href: "/#faqs", id: "faqs" },
  ];

  return (
    <>
      {/* Floating Capsule Header */}
      <header className="fixed top-3 top-[max(0.75rem,env(safe-area-inset-top))] inset-x-0 z-40 px-3 sm:px-6 pointer-events-none transition-all duration-200">
        <div
          className={`max-w-5xl mx-auto rounded-full glass-nav-capsule px-3.5 sm:px-6 h-14 flex items-center justify-between pointer-events-auto transition-all duration-200 w-full overflow-hidden ${
            isScrolled
              ? "shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_24px_rgba(255,109,31,0.12)] border-platinumSilver/35"
              : ""
          }`}
        >
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <ContribLensMark size={26} />
            <span className="font-extrabold tracking-tight text-base sm:text-lg text-sustainableLinen leading-none">
              Contrib<span className="text-electricTangerine">Lens</span>
            </span>
          </Link>

          {/* Desktop Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((link) => {
              const isActive = pathname === "/" && activeSection === link.id;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`relative px-3.5 py-1.5 text-xs font-medium tracking-wide transition-colors ${
                    isActive
                      ? "text-sustainableLinen"
                      : "text-textMuted hover:text-electricTangerine"
                  }`}
                >
                  {link.name}
                  {isActive && (
                    <span className="absolute bottom-0 left-3.5 right-3.5 h-[2px] bg-lemonChiffon rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Desktop Right Action CTAs */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {user ? (
              <Link
                href="/app/dashboard"
                className="px-4 py-1.5 text-xs font-bold bg-lemonChiffon text-black rounded-full hover:bg-lemonChiffon-hover transition-colors shadow-sm inline-flex items-center gap-1.5 press-spring"
              >
                Dashboard
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={(e) => {
                    e.preventDefault();
                    openAuthModal({ initialMode: "login" });
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium text-textMuted hover:text-sustainableLinen transition-colors rounded-full hover:bg-white/5"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  onClick={(e) => {
                    e.preventDefault();
                    openAuthModal({ initialMode: "signup" });
                  }}
                  className="px-4 py-1.5 text-xs font-bold bg-lemonChiffon text-black rounded-full hover:bg-lemonChiffon-hover transition-colors shadow-sm inline-flex items-center gap-1.5 press-spring"
                >
                  Sign up
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile (<md) In-Capsule Horizontal Scroll Rail */}
          <div
            data-testid="mobile-nav-rail"
            className="flex md:hidden items-center gap-1 overflow-x-auto no-scrollbar mx-1 sm:mx-2 py-1 flex-1 min-w-0"
          >
            {navLinks.map((link) => {
              const isActive = pathname === "/" && activeSection === link.id;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`relative min-h-[44px] px-3 py-2 text-xs font-medium whitespace-nowrap rounded-full transition-colors shrink-0 flex items-center press-spring touch-manipulation ${
                    isActive
                      ? "text-sustainableLinen bg-white/10"
                      : "text-textMuted hover:text-sustainableLinen hover:bg-white/5"
                  }`}
                >
                  {link.name}
                  {isActive && (
                    <span className="absolute bottom-1 left-2.5 right-2.5 h-[2px] bg-lemonChiffon rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Mobile Right Action Buttons (Sign up pill on sm, hamburger always on <md) */}
          <div className="flex md:hidden items-center gap-1 shrink-0">
            <Link
              href="/signup"
              className="hidden sm:inline-flex px-3.5 py-2 min-h-[44px] text-xs font-bold bg-lemonChiffon text-black rounded-full hover:bg-lemonChiffon-hover shadow-sm items-center press-spring touch-manipulation"
            >
              Sign up
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-textMuted hover:text-sustainableLinen rounded-full hover:bg-white/5 transition-colors press-spring touch-manipulation"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Detached Glass Dropdown Panel (Never a sidebar) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed top-[calc(max(0.75rem,env(safe-area-inset-top))+4.25rem)] inset-x-4 max-w-sm mx-auto glass-panel rounded-2xl p-4 shadow-2xl z-50 pointer-events-auto border border-platinumSilver/20">
          <div className="flex flex-col space-y-1.5">
            {navLinks.map((link) => {
              const isActive = pathname === "/" && activeSection === link.id;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`min-h-[44px] px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors flex items-center justify-between press-spring touch-manipulation ${
                    isActive
                      ? "bg-white/10 text-sustainableLinen"
                      : "text-textMuted hover:text-sustainableLinen hover:bg-white/5"
                  }`}
                >
                  <span>{link.name}</span>
                  {isActive && (
                    <span className="w-2 h-2 rounded-full bg-lemonChiffon" />
                  )}
                </Link>
              );
            })}
            <Link
              href="/stats"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[44px] px-3.5 py-2.5 text-sm font-medium text-botticelli hover:text-sustainableLinen hover:bg-white/5 rounded-xl transition-colors flex items-center press-spring touch-manipulation"
            >
              Public Stats
            </Link>
            <div className="pt-2 mt-1 border-t border-platinumSilver/10 flex items-center justify-between gap-3">
              {user ? (
                <Link
                  href="/app/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-h-[44px] flex-1 px-4 py-2 text-xs font-bold bg-lemonChiffon text-black rounded-full hover:bg-lemonChiffon-hover transition-colors flex items-center justify-center press-spring touch-manipulation"
                >
                  Dashboard →
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={(e) => {
                      e.preventDefault();
                      setMobileMenuOpen(false);
                      openAuthModal({ initialMode: "login" });
                    }}
                    className="min-h-[44px] flex-1 px-4 py-2 text-xs font-semibold text-textMuted hover:text-sustainableLinen rounded-full hover:bg-white/5 flex items-center justify-center press-spring touch-manipulation"
                  >
                    Login
                  </Link>
                  <Link
                    href="/signup"
                    onClick={(e) => {
                      e.preventDefault();
                      setMobileMenuOpen(false);
                      openAuthModal({ initialMode: "signup" });
                    }}
                    className="min-h-[44px] flex-1 px-4 py-2 text-xs font-bold bg-lemonChiffon text-black rounded-full hover:bg-lemonChiffon-hover transition-colors flex items-center justify-center press-spring touch-manipulation"
                  >
                    Sign up →
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
