import http from 'http';
import { db } from '../src/lib/db.js';
import { signSessionToken } from '../src/lib/auth.js';

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;

const TEST_USER = {
  id: 'usr_f3_live_verifier',
  email: 'f3verifier@contriblens.dev',
  name: 'F3 Live Verifier',
  role: 'contributor',
  settings: {
    theme: 'black-hole',
    fontSize: 'medium',
    fontFamily: 'sans',
    reducedMotion: false,
    strictRedaction: true,
    geminiGroundingPolicy: true,
  },
  createdAt: new Date().toISOString(),
};

const token = signSessionToken({
  id: TEST_USER.id,
  email: TEST_USER.email,
  name: TEST_USER.name,
});

const headers = {
  'Content-Type': 'application/json',
  Cookie: `contriblens_session=${token}`,
};

async function req(path, method = 'GET', body = null) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, ok: res.ok, json: JSON.parse(text) };
  } catch {
    return { status: res.status, ok: res.ok, text };
  }
}

async function main() {
  console.log('--- F3 Live Manual Sync Walkthrough Verification ---');

  // Ensure test user in DB
  db.saveUser(TEST_USER);

  // 1. Initial State Check
  console.log('Step 1: Check initial user profile & clear previous test data if any');
  const clearRes = await req('/api/profile', 'DELETE');
  console.log('✓ Cleared previous data, status:', clearRes.status);

  // 2. Scan repository: POST /api/scans
  console.log('Step 2: Trigger live scan for expressjs/express');
  const scanRes = await req('/api/scans', 'POST', {
    repositoryUrl: 'https://github.com/expressjs/express',
    scope: 'partial',
    checks: ['dependency', 'github-actions', 'health'],
  });
  console.log('✓ Scan status:', scanRes.status, 'scanId:', scanRes.json?.scan?.id);
  const scan = scanRes.json?.scan;
  if (!scan) throw new Error('Scan failed to create: ' + JSON.stringify(scanRes));

  // 3. Dashboard reflects
  console.log('Step 3: Verify dashboard endpoints reflect the newly active scan');
  const [scansListRes, routesRes, findingsRes, profileRes] = await Promise.all([
    req('/api/scans'),
    req(`/api/routes?scanId=${scan.id}`),
    req(`/api/findings?scanId=${scan.id}`),
    req('/api/profile'),
  ]);

  console.log('✓ Scans list returned:', scansListRes.json?.scans?.length, 'scans');
  console.log('✓ Routes list returned:', routesRes.json?.routes?.length, 'routes');
  console.log('✓ Findings list returned:', findingsRes.json?.findings?.length, 'findings');

  const initialRoutes = routesRes.json?.routes || [];
  if (initialRoutes.length === 0) throw new Error('No routes returned for active scan');

  const targetRoute = initialRoutes[0];
  console.log('✓ Target route selected for status walkthrough:', targetRoute.id, 'status:', targetRoute.status);

  // 4. Route status progression on route details: not-started -> in-progress -> needs-review -> completed
  console.log('Step 4: Transition route status not-started -> in-progress');
  const p1 = await req(`/api/routes/${targetRoute.id}`, 'PATCH', { status: 'in-progress' });
  console.log('✓ in-progress status:', p1.status, p1.json?.route?.status);

  const p2 = await req(`/api/routes/${targetRoute.id}`, 'PATCH', { status: 'needs-review' });
  console.log('✓ needs-review status:', p2.status, p2.json?.route?.status);

  const p3 = await req(`/api/routes/${targetRoute.id}`, 'PATCH', { status: 'completed' });
  console.log('✓ completed status:', p3.status, p3.json?.route?.status);

  // 5. Dashboard updates reflect route completion
  console.log('Step 5: Verify dashboard reflects completed route');
  const updatedRoutesRes = await req(`/api/routes?scanId=${scan.id}`);
  const updatedRoutes = updatedRoutesRes.json?.routes || [];
  const completedCount = updatedRoutes.filter((r) => r.status === 'completed').length;
  console.log('✓ Completed routes count in workspace:', completedCount);
  if (completedCount !== 1) throw new Error(`Expected 1 completed route, got ${completedCount}`);

  // 6. Draft created
  console.log('Step 6: Create maintainer issue draft for route');
  const draftRes = await req('/api/drafts', 'POST', { routeId: targetRoute.id });
  console.log('✓ Draft created status:', draftRes.status, 'draftId:', draftRes.json?.draft?.id, 'generatedBy:', draftRes.json?.draft?.generatedBy);
  const createdDraft = draftRes.json?.draft;
  if (!createdDraft) throw new Error('Failed to generate draft: ' + JSON.stringify(draftRes));

  // 7. Drafts list updates
  console.log('Step 7: Verify drafts list returns newly created draft');
  const draftsListRes = await req(`/api/drafts?scanId=${scan.id}`);
  const drafts = draftsListRes.json?.drafts || [];
  const foundDraft = drafts.find((d) => d.id === createdDraft.id);
  console.log('✓ Draft found in list:', Boolean(foundDraft), 'title:', foundDraft?.title);
  if (!foundDraft) throw new Error('Created draft not present in drafts list');

  // 8. Activity stream updates
  console.log('Step 8: Verify dashboard activity stream contains draft_generated event');
  const updatedProfileRes = await req('/api/profile');
  const activities = updatedProfileRes.json?.activities || [];
  const draftActivity = activities.find((a) => a.type === 'draft_generated');
  console.log('✓ Draft generated activity event in activity stream:', Boolean(draftActivity), 'desc:', draftActivity?.description);
  if (!draftActivity) throw new Error('Draft generated activity not in profile activity stream');

  // 9. Refresh preserves everything
  console.log('Step 9: Simulate full browser refresh (independent parallel refetch)');
  const [refreshedScans, refreshedRoutes2, refreshedDrafts, refreshedProfile] = await Promise.all([
    req('/api/scans'),
    req(`/api/routes?scanId=${scan.id}`),
    req(`/api/drafts?scanId=${scan.id}`),
    req('/api/profile'),
  ]);

  if (refreshedScans.json?.scans?.length < 1) throw new Error('Scans lost after refresh');
  if (refreshedRoutes2.json?.routes?.find((r) => r.id === targetRoute.id)?.status !== 'completed') {
    throw new Error('Route completed state lost after refresh');
  }
  if (!refreshedDrafts.json?.drafts?.find((d) => d.id === createdDraft.id)) {
    throw new Error('Draft lost after refresh');
  }
  console.log('✓ All states persistently preserved after simulated refresh!');

  console.log('\n=== ALL 9 WALKTHROUGH STEPS PASSED WITH 100% SUCCESS ===\n');
}

main().catch((err) => {
  console.error('Walkthrough verification failed:', err);
  process.exit(1);
});
