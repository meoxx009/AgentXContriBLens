# ContribLens v2 — UI/UX & Design System (Winning-Level Spec)

**Status:** Visual + interaction source of truth · All UI copy in English · Dark theme is the default experience.

This is the single source of truth for the visual and interaction system. Antigravity must follow this spec exactly — exact hex values, exact effect recipes, exact section structure. Do not introduce a second design system. Do not use neon lime, indigo/mint palettes, rainbow gradients, or screenshots-as-UI.

---

## 1. Design Direction (what "winning level" means here)

- Premium black-luxury canvas with controlled atmospheric depth (smoky glows) — never flat dead black.
- **Liquid glass** material on header, menu and major panels — translucent, layered, with edge highlights and fallbacks.
- One memorable accent (Electric Tangerine) + warm cream content surfaces (Linen/Cotton) + metallic Platinum Silver reflections + Pale Lavender AI/learning accents.
- Practical widgets, generous spacing, restrained premium motion that explains the product journey.
- Fully accessible, keyboard-first, reduced-motion aware, mobile-perfect.

## 2. Color Tokens (locked)

```css
:root {
  /* Structure */
  --color-black: #000000;            /* page base */
  --color-black-hole: #222222;       /* cards, panels, glass base */
  --color-coffee-bean: #2D120D;      /* warm deep surfaces, dark glass fallback */
  --color-rosewood: #6B0B0C;         /* CRITICAL / destructive only */

  /* Accents */
  --color-electric-tangerine: #FF6D1F; /* primary accent: active, progress, focus, toggle-ON, icon emphasis */
  --color-lemon-chiffon: #FFF8CA;      /* CTA pills w/ black text, key highlights */
  --color-botticelli: #CDE3E8;         /* safe/info states, data cues, secondary icons */

  /* Reference support tokens (from approved reference analysis) */
  --color-mocha-brown: #6F4E37;      /* warm atmospheric glows, secondary surfaces, editorial depth */
  --color-platinum-silver: #E5E4E2;  /* metallic reflections, neutral borders, quiet info surfaces, toggle track */
  --color-pale-lavender: #E6E0F0;    /* AI explanation / learning / route accents — sparingly */

  /* Content surfaces */
  --color-sustainable-linen: #FAF3E1; /* issue drafts, light document panels */
  --color-recycled-cotton: #F5E7C6;   /* secondary content surfaces, route nodes */

  /* Text */
  --color-text-primary: #F5F3ED;
  --color-text-secondary: #F5E7C6;
  --color-text-muted: #AAA9A1;
  --color-border: rgba(245, 243, 237, 0.14);
  --color-border-strong: rgba(245, 243, 237, 0.22);
}
```

### 1.1 Usage mapping (exact, per element)

| Element | Token / recipe |
|---|---|
| Primary CTA (Start Scan, Generate Route) | Electric Tangerine fill, black text, soft tangerine glow shadow |
| Secondary CTA (Sign up, Export) | Lemon Chiffon fill, black text |
| Ghost/secondary button | transparent glass, 1px Platinum Silver border, Linen text |
| Toggle ON | Electric Tangerine knob, Platinum Silver track at 40% |
| Toggle OFF | Black Hole knob, Coffee Bean track |
| Active nav underline | Lemon Chiffon 2px underline; hover accent Electric Tangerine |
| Icons — safe/info | Botticelli #CDE3E8 |
| Icons — emphasis/active | Electric Tangerine |
| Icons — AI/learning/contribution | Pale Lavender |
| Severity: critical | Rosewood #6B0B0C (fill) |
| Severity: high | Electric Tangerine |
| Severity: medium/low | Botticelli / Platinum Silver |
| Primary text on dark | Sustainable Linen #FAF3E1 |
| Secondary text | Recycled Cotton #F5E7C6 |
| Muted text | #AAA9A1 |
| Danger/destructive | Rosewood (only critical/security states) |

**Rules:** black/Black Hole is the structural base; tangerine is the single memorable accent; never neon lime, indigo, mint or rainbow gradients; decorative color never reduces legibility; all colors as semantic CSS variables in ONE tokens file — no hard-coded hex in components.

### 3. Typography

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; /* code/evidence */
```

- Headings: large, light-to-medium weight, generous line-height (h1 clamp(2.5rem → 3.75rem)).
- Body: concise, muted (#AAA9A1 on dark, Coffee Bean on Linen).
- Labels: 11–12px uppercase, letter-spacing 0.08em.
- Code/evidence: monospace, Botticelli-tinted.
- Type scale: 12/14/16/20/28/36/44/60px.

### 4. Spacing & shape

- 8px base grid (4px for dense controls); card padding 24–32px; section rhythm 96–128px vertical on desktop, 48–64px mobile.
- Radii: pills 999px; cards 16px; inputs/rows 10px; accordions 10px.
- Shadows: `0 8px 32px rgba(0,0,0,.45)` cards; `0 0 24px rgba(255,109,31,.18)` tangerine glow on primary CTA.

## 5. Smoky Ambient Background (app-wide — signature look)

Layered radial-gradient "smoke" over Pure Black, used on landing AND authenticated app (one continuous material language):

```css
.page-atmosphere {
  background:
    radial-gradient(600px 400px at 50% 8%,  rgba(255,109,31,.12), transparent 70%),  /* tangerine top glow */
    radial-gradient(800px 500px at 15% 55%, rgba(111,78,55,.16), transparent 65%),   /* mocha brown */
    radial-gradient(400px 300px at 85% 30%, rgba(230,224,240,.06), transparent 70%), /* pale lavender */
    #000000;
}
/* grain: SVG feTurbulence noise overlay, opacity .04, pointer-events none */
/* drift: transform translate3d + opacity keyframes, 18–30s, ease-in-out, alternate */
```

Rules: smoke is depth — readable text always sits on glass panels or plain black; drift disabled under `prefers-reduced-motion`; never behind dense text without a glass panel; grain ≤ 4% opacity; no large texture images (CSS/SVG only).

## 6. Liquid Glass System (menu bar + panels — mandatory)

Reusable primitives: `GlassHeader / GlassNav`, `GlassPanel`, `GlassPill / GlassBadge`, `GlassButton`, `GlassStepRail`, `GlassMetricCard`.

**Recipe (dark glass):**

```css
.liquid-glass {
  background: rgba(34, 34, 34, 0.55);          /* Black Hole, controlled alpha */
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  border: 1px solid rgba(245, 243, 237, 0.14);
  box-shadow:
    inset 0 1px 0 rgba(245,243,237,.18),        /* top-edge reflected light */
    0 8px 32px rgba(0,0,0,.45),
    0 0 24px rgba(255,109,31,.06);              /* restrained ambient glow */
  border-radius: 16px;
}
/* No-backdrop-filter fallback: opaque #222222 (or #2D120D), same border/shadow/hierarchy */
```

**Where it appears (mandatory):** public sticky header · feature/menu rail · hero product preview frame · trust/security callouts · FAQ accordions · final CTA panel · authenticated top nav · major dashboard/finding/contribution panels. Never blur the whole page.

## 7. Landing Page — Sections A–J (winning-level structure)

| Section | Spec |
|---|---|
| **A Header** | Glass sticky nav; active link = Lemon Chiffon underline; Sign up = Lemon Chiffon pill; Login = ghost. Mobile: horizontal scroll, no sidebar |
| **B Hero** | Left: headline **"Security findings → beginner pull requests"**, sub: "Paste any public repo. Get verified findings, a plain-English explanation, and a beginner-ready PR plan with tests and skills." CTAs: "Scan a repo → get a PR plan" (Lemon Chiffon pill) + "Try without account" (glass pill). Right: animated glass scan dashboard preview, labelled **Demo**. Background: tangerine arc glow + smoky atmosphere + faded GitHub/git/code cards falling slowly (decorative, never over text) |
| **C Trust strip** | "Zero code execution · Secrets redacted · OSV-verified · Evidence hashed (SHA-256)" — glass pills |
| **D How it works** | 4 glass steps: Scan → Verify → Understand → Contribute (GlassStepRail, numbered, connected) |
| **E Interactive preview** | Animated scan→findings→route→draft journey; honest demo labels; clickable stage switcher |
| **F Feature grid** | 6 glass cards: Evidence-first, Beginner PR plans, Skills Gap, OSV-verified, Maintainer-safe drafts, Keyless demo |
| **G Safety** | "Code verifies. AI explains. Human approves." + disclosure guard mention |
| **H FAQ** | Glass accordions (keyboard + aria-expanded) |
| **I Final CTA** | Glass panel: "Find your first contribution in 2 minutes" + primary CTA + "Try without account" |
| **J Footer** | Links: Privacy, Safety, Security, GitHub repo, docs |

## 8. Auth Screens

Dark premium layout, orange ambient top glow, centered glass card. Signup: email, password, confirm, terms (phone field hidden in v2). Login: email + password + "Continue with GitHub". States: idle/focused/invalid/validating/submitting/success/server-error — inline errors only.

## 9. Authenticated Shell

Sticky horizontal glass nav: Dashboard | Scan Repository | Findings | Contributions + Stack | Issue Drafts | Profile. Active = Lemon Chiffon underline; hover = tangerine accent; surface = translucent Black Hole glass; small screens scroll horizontally (never a sidebar). Profile dropdown: account, appearance, sign out.

## 10. Page-Specific Specs

- **Dashboard:** glass metric cards (GlassMetricCard), recent repos with scan-diff badge, activity stream, next-task card — hierarchy: primary metric > next action > context. Empty states attractive with CTA.
- **Scan:** large URL input (glass), scope toggle Partial/Deep, read-only safety card, animated 6-stage step rail (done = Lemon Chiffon check, active = tangerine pulse, pending = muted).
- **Findings:** split view; selected card = tangerine border; CRITICAL uses Rosewood; evidence block monospace on Botticelli-tinted surface; explanation card labelled with engine ("✦ Gemma explanation" / "Deterministic explanation"); Skills Gap panel uses Pale Lavender accents.
- **Contributions + Stack:** stack chips (Botticelli/Linen borders), Impact & Route Graph nodes (Linen/Cotton/Botticelli), active route card with acceptance criteria + test plan + progress stepper.
- **Drafts:** dark workspace + Sustainable Linen Markdown sheet; Copy MD + Export; badge "Maintainer review required".
- **Profile:** glass cards; FAQ-style safety accordion; Export All Data (Botticelli) / Clear History (Rosewood).
- **/stats:** public, smoky hero with live counters (repos scanned, findings verified, PR plans).

## 11. Motion System

- Hero: slow glow drift (24s), scan beam sweep (2.4s, ease-in-out), falling code cards (8–14s loop), count-up metrics.
- App: page fade/slide 240ms cubic-bezier(0.22,1,0.36,1); progress bars; route-node reveal stagger 60ms; toggle spring.
- All motion: transform/opacity only; `prefers-reduced-motion` + Profile toggle disables non-essential motion; motion never the only state signal.

## 12. Component States (every interactive element)

default · hover · focus-visible (Lemon Chiffon/Botticelli ring) · pressed · disabled · loading (skeleton/spinner + label) · success · error · empty (attractive, with next action).

## 13. Accessibility

Keyboard nav across glass menu + accordions; visible focus rings; labels bound to controls; `aria-live` scan progress; `aria-expanded/controls` on accordions; contrast AA for every palette pair; color never the only severity indicator; screen-reader announcements for scan progress.

## 14. Performance Rules

CSS/SVG-only effects (no texture images); `will-change: transform` sparingly; lazy-load below-fold sections; no layout-shifting animations; hero interactive within 1s on 3G-fast.
