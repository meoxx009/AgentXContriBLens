import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Global Reference Background System', () => {
  const tokensPath = path.join(process.cwd(), 'src', 'styles', 'tokens.css');
  const layoutPath = path.join(process.cwd(), 'src', 'app', 'layout.tsx');
  const appLayoutPath = path.join(process.cwd(), 'src', 'app', 'app', 'layout.tsx');
  const landingPath = path.join(process.cwd(), 'src', 'app', 'page.tsx');
  const loginPath = path.join(process.cwd(), 'src', 'app', 'login', 'page.tsx');
  const signupPath = path.join(process.cwd(), 'src', 'app', 'signup', 'page.tsx');

  const tokensCss = fs.readFileSync(tokensPath, 'utf-8');
  const rootLayoutTsx = fs.readFileSync(layoutPath, 'utf-8');
  const appLayoutTsx = fs.readFileSync(appLayoutPath, 'utf-8');
  const landingTsx = fs.readFileSync(landingPath, 'utf-8');
  const loginTsx = fs.readFileSync(loginPath, 'utf-8');
  const signupTsx = fs.readFileSync(signupPath, 'utf-8');

  it('1. defines centralized reference background tokens in tokens.css', () => {
    expect(tokensCss).toContain('--bg-reference-base');
    expect(tokensCss).toContain('--bg-burnt-orange-glow');
    expect(tokensCss).toContain('--bg-warm-ivory-glow');
    expect(tokensCss).toContain('--bg-smoky-grey-glow');
  });

  it('2. implements .app-reference-background with fixed, non-blocking viewport positioning', () => {
    expect(tokensCss).toContain('.app-reference-background');
    expect(tokensCss).toContain('position: fixed');
    expect(tokensCss).toContain('pointer-events: none');
    expect(tokensCss).toContain('z-index: -10');
  });

  it('3. uses strictly the reference color palette: near-black, burnt orange, smoky grey, warm ivory', () => {
    // Verifies the gradient layers use the authorized palette tokens
    expect(tokensCss).toContain('var(--bg-burnt-orange-glow)');
    expect(tokensCss).toContain('var(--bg-warm-ivory-glow)');
    expect(tokensCss).toContain('var(--bg-smoky-grey-glow)');

    // Ensure no forbidden vibrant colors are introduced into background tokens
    const bgSection = tokensCss.slice(tokensCss.indexOf('--bg-reference-base'), tokensCss.indexOf('.app-reference-background'));
    expect(bgSection).not.toMatch(/blue|purple|magenta|cyan|pink|violet|green/i);
  });

  it('4. embeds the global fixed reference background element in RootLayout', () => {
    expect(rootLayoutTsx).toContain('app-reference-background');
    expect(rootLayoutTsx).toContain('aria-hidden="true"');
  });

  it('5. ensures shell layouts across public and authenticated routes do not obscure the background with opaque bg-black', () => {
    expect(appLayoutTsx).not.toContain('<div className="min-h-screen flex flex-col bg-black');
    expect(landingTsx).not.toContain('<div className="flex flex-col min-h-screen w-full bg-black');
    expect(loginTsx).not.toContain('<div className="min-h-screen bg-black');
    expect(signupTsx).not.toContain('<div className="min-h-screen bg-black');
  });

  it('6. ensures background has zero pointer events to prevent blocking user clicks or focus', () => {
    expect(tokensCss).toContain('pointer-events: none');
  });
});
