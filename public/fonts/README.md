# ContriBLens OSS — Font Assets & Licensing Guide

This directory is designated for the licensed webfont files for **Berkelium Sans** and **Ferdinand**, following the ContriBLens OSS typography system.

---

## 1. Font Specifications & Official Sources

### Font A — Berkelium Sans (Modern Sans-Serif Family)
- **Role:** Primary Heading Hierarchy (`H1`–`H6`, section titles, card headers, modal titles).
- **Official Source:** [UICreative — Berkelium Sans Modern Sans Serif Family](https://uicreative.net/products/berkelium-sans-modern-sans-serif-family)
- **Required File Formats:** `.woff2` (recommended for production performance), `.woff`, or `.ttf`.
- **Expected File Naming:**
  - `BerkeliumSans-Regular.woff2` (Weight: 400)
  - `BerkeliumSans-Medium.woff2` (Weight: 500)
  - `BerkeliumSans-SemiBold.woff2` (Weight: 600)
  - `BerkeliumSans-Bold.woff2` (Weight: 700)

### Font B — Ferdinand (Elegant Display Serif Font)
- **Role:** Dedicated Showcase Display Elements (Featured landing-page showcase titles, editorial highlights).
- **Official Source:** [UICreative — Ferdinand Elegant Serif Font](https://uicreative.net/products/ferdinand-elegant-serif-font)
- **Required File Formats:** `.woff2`, `.woff`, or `.ttf`.
- **Expected File Naming:**
  - `Ferdinand-Regular.woff2` (Weight: 400)
  - `Ferdinand-SemiBold.woff2` (Weight: 600)
  - `Ferdinand-Bold.woff2` (Weight: 700)

---

## 2. Licensing Compliance

- Both **Berkelium Sans** and **Ferdinand** are proprietary commercial typefaces designed by UICreative.
- In compliance with open-source and intellectual property standards, commercial font binaries are **not committed to public repositories** without a valid web/app deployment license.
- When an authorized license is obtained, place the font files directly into this directory (`public/fonts/`).
- The `@font-face` configuration in `src/app/globals.css` will immediately and automatically bind the loaded font files with `font-display: swap`.

---

## 3. High-Quality Fallback Stack

In the absence of the commercial binary assets or during network load, the application seamlessly resolves to the engineered fallback stacks:
- **Heading Fallback Stack:**
  `'Berkelium Sans', 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif`
- **Showcase Fallback Stack:**
  `'Ferdinand', 'Playfair Display', Georgia, Cambria, 'Times New Roman', serif`
- **Body Stack:**
  `'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Technical Stack:**
  `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
