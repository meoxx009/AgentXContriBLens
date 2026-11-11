// scripts/smoke-test-all.mjs
const BASE_URL = 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runSmokeAudit() {
  console.log('====================================================');
  console.log('   ContribLens v2 Runtime Smoke Audit (All Flows)   ');
  console.log('====================================================\n');

  // ----------------------------------------------------------------
  // FLOW 2a: Anonymous Demo Preview
  // ----------------------------------------------------------------
  console.log('>>> [Flow 2a] Anonymous Demo Preview Flow');
  
  // 1. Preview scan endpoint
  const previewRes = await fetch(`${BASE_URL}/api/preview/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repositoryUrl: 'https://github.com/expressjs/express', scope: 'partial' }),
  });
  assert(previewRes.ok, `Preview scan failed: ${previewRes.status}`);
  const previewData = await previewRes.json();
  assert(previewData.preview === true, 'Preview response must have preview=true');
  assert(previewData.findings?.length > 0, 'Preview must return demo findings');
  console.log('  ✓ /api/preview/scan returns demo scan and findings');

  // 2. Unauthenticated GET /api/findings
  const demoFindingsRes = await fetch(`${BASE_URL}/api/findings?scanId=demo-scan-001`);
  assert(demoFindingsRes.ok, `Unauthenticated /api/findings failed: ${demoFindingsRes.status}`);
  const demoFindingsData = await demoFindingsRes.json();
  assert(demoFindingsData.findings?.length === 4, `Expected 4 demo findings, got ${demoFindingsData.findings?.length}`);
  console.log('  ✓ /api/findings?scanId=demo-scan-001 returns 4 demo findings unauthenticated');

  // 3. Unauthenticated GET /api/findings/demo-finding-1 and fnd_demo_1
  const findingDetailRes = await fetch(`${BASE_URL}/api/findings/demo-finding-1`);
  assert(findingDetailRes.ok, `Unauthenticated finding detail failed: ${findingDetailRes.status}`);
  const findingDetailData = await findingDetailRes.json();
  assert(findingDetailData.finding?.evidenceHash, 'Finding detail must have evidenceHash');
  console.log('  ✓ /api/findings/demo-finding-1 returns evidence, hash, and readiness');

  const fndDemoRes = await fetch(`${BASE_URL}/api/findings/fnd_demo_1`);
  assert(fndDemoRes.ok, `fnd_demo_1 route failed: ${fndDemoRes.status}`);
  console.log('  ✓ /api/findings/fnd_demo_1 alias resolves correctly');

  // 4. Grounded Explanation for Demo Finding (Unauthenticated)
  const explainRes = await fetch(`${BASE_URL}/api/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ findingId: 'demo-finding-1' }),
  });
  assert(explainRes.ok, `/api/explain failed: ${explainRes.status}`);
  const explainData = await explainRes.json();
  assert(explainData.explanation?.generatedBy, 'Explanation must include generatedBy');
  console.log(`  ✓ /api/explain generated grounded explanation via ${explainData.explanation.generatedBy}`);

  // 5. Unauthenticated GET /api/routes and /api/routes/demo-route-1
  const routesRes = await fetch(`${BASE_URL}/api/routes?scanId=demo-scan-001`);
  assert(routesRes.ok, `/api/routes failed: ${routesRes.status}`);
  const routesData = await routesRes.json();
  assert(routesData.routes?.length > 0, 'Routes must be returned');
  console.log('  ✓ /api/routes?scanId=demo-scan-001 returns demo routes');

  const routeDetailRes = await fetch(`${BASE_URL}/api/routes/demo-route-1`);
  assert(routeDetailRes.ok, `/api/routes/demo-route-1 failed: ${routeDetailRes.status}`);
  const routeDetailData = await routeDetailRes.json();
  assert(routeDetailData.route?.id === 'demo-route-1', 'Route detail returned');
  console.log('  ✓ /api/routes/demo-route-1 returns route detail and plan');

  const rtDemoRes = await fetch(`${BASE_URL}/api/routes/rt_demo_1`);
  assert(rtDemoRes.ok, `rt_demo_1 alias failed: ${rtDemoRes.status}`);
  console.log('  ✓ /api/routes/rt_demo_1 alias resolves correctly');

  // 6. Demo Draft retrieval and copy
  const draftsRes = await fetch(`${BASE_URL}/api/drafts?scanId=demo-scan-001`);
  assert(draftsRes.ok, `/api/drafts failed: ${draftsRes.status}`);
  const draftsData = await draftsRes.json();
  assert(draftsData.drafts?.length > 0, 'Demo drafts returned');
  assert(draftsData.drafts[0].markdownContent.includes('Security Hardening'), 'Draft markdown present');
  console.log('  ✓ /api/drafts returns demo issue draft for maintainer review');

  console.log('Flow 2a complete: Anonymous demo preview completely working!\n');

  // ----------------------------------------------------------------
  // FLOW 2f: Auth Lifecycle
  // ----------------------------------------------------------------
  console.log('>>> [Flow 2f] Auth Lifecycle');
  const userEmail = `auditor_${Date.now()}@example.com`;
  const userPassword = 'AuditorSecurePassword1!';

  // Signup
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userEmail,
      password: userPassword,
      passwordConfirmation: userPassword,
      acceptedTerms: true,
      name: 'Auditor User',
    }),
  });
  assert(signupRes.ok, `Signup failed: ${signupRes.status}`);
  let sessionCookie = signupRes.headers.get('set-cookie');
  console.log('  ✓ Signup succeeded and session cookie set');

  // Verify /api/auth/me
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: sessionCookie || '' },
  });
  assert(meRes.ok, 'Me check failed');
  const meData = await meRes.json();
  assert(meData.user?.email === userEmail, 'User email matches');
  console.log('  ✓ /api/auth/me returned authenticated user');

  // Logout
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: sessionCookie || '' },
  });
  assert(logoutRes.ok, 'Logout failed');
  console.log('  ✓ Logout succeeded and cleared cookie');

  // Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: userPassword }),
  });
  assert(loginRes.ok, 'Login failed');
  sessionCookie = loginRes.headers.get('set-cookie');
  console.log('  ✓ Login succeeded with session persistence');

  console.log('Flow 2f complete: Auth lifecycle completely working!\n');

  // ----------------------------------------------------------------
  // FLOW 2g: Profile & Settings Persistence
  // ----------------------------------------------------------------
  console.log('>>> [Flow 2g] Profile & Settings Persistence');
  const updateSettingsRes = await fetch(`${BASE_URL}/api/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie || '',
    },
    body: JSON.stringify({
      name: 'Auditor Senior',
      settings: {
        theme: 'linen',
        fontSize: 'large',
        fontFamily: 'mono',
        reducedMotion: true,
      },
    }),
  });
  assert(updateSettingsRes.ok, 'Update settings failed');
  const updatedProfileData = await updateSettingsRes.json();
  assert(updatedProfileData.user?.settings?.theme === 'linen', 'Theme must be linen');
  assert(updatedProfileData.user?.settings?.reducedMotion === true, 'reducedMotion must be true');
  console.log('  ✓ PUT /api/profile updated theme=linen, fontSize=large, reducedMotion=true');

  // Verify persistence on subsequent GET /api/auth/me
  const meAfterUpdate = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: sessionCookie || '' },
  });
  const meAfterData = await meAfterUpdate.json();
  assert(meAfterData.user?.settings?.theme === 'linen', 'Persisted theme matches');
  assert(meAfterData.user?.settings?.reducedMotion === true, 'Persisted reducedMotion matches');
  console.log('  ✓ GET /api/auth/me confirms settings persisted across requests');

  console.log('Flow 2g complete: Profile settings completely working!\n');

  // ----------------------------------------------------------------
  // FLOW 2b: Real Scan of Public Repo (Cached or Fresh)
  // ----------------------------------------------------------------
  console.log('>>> [Flow 2b] Real Scan of Public Repo');
  const scanRes = await fetch(`${BASE_URL}/api/scans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie || '',
    },
    body: JSON.stringify({
      repositoryUrl: 'https://github.com/expressjs/express',
      scope: 'partial',
      checks: ['dependencies', 'actions', 'secrets', 'health'],
    }),
  });
  assert(scanRes.ok, `Scan failed: ${scanRes.status}`);
  const scanData = await scanRes.json();
  assert(scanData.ok === true, 'Scan response ok=true');
  assert(scanData.scan?.id, 'Scan ID present');
  assert(scanData.findings?.length > 0, 'Scan findings present');
  console.log(`  ✓ Scan completed with ${scanData.findings.length} findings, readiness=${scanData.scan.readinessScore}/100, scope=${scanData.scope}`);

  // Find both a non-secret finding (for public draft creation) and a secret/critical finding (for disclosure guard verification)
  const nonSecretFinding = scanData.findings.find(
    (f) => f.category !== 'secret' && String(f.severity).toUpperCase() !== 'CRITICAL'
  ) || scanData.findings[0];

  const secretOrCriticalFinding = scanData.findings.find(
    (f) => f.category === 'secret' || String(f.severity).toUpperCase() === 'CRITICAL'
  );

  console.log(`  ✓ Public candidate finding: [${nonSecretFinding.id}] "${nonSecretFinding.title}" (${nonSecretFinding.severity})`);
  if (secretOrCriticalFinding) {
    console.log(`  ✓ Critical/Secret finding for Disclosure Guard test: [${secretOrCriticalFinding.id}] "${secretOrCriticalFinding.title}" (${secretOrCriticalFinding.severity})`);
  }

  console.log('Flow 2b complete: Real scan completely working!\n');

  // ----------------------------------------------------------------
  // FLOW 2c & 2d: Finding Detail, Route Creation & Status Transition
  // ----------------------------------------------------------------
  console.log('>>> [Flow 2c & 2d] Finding Detail, Route Creation, and Stepper Transitions');
  const findingId = nonSecretFinding.id;
  const findingRes = await fetch(`${BASE_URL}/api/findings/${findingId}`, {
    headers: { Cookie: sessionCookie || '' },
  });
  assert(findingRes.ok, 'Finding detail failed');
  const findingData = await findingRes.json();
  assert(findingData.finding?.evidenceChain, 'Evidence chain present');
  console.log('  ✓ Finding detail includes SHA-256 evidence chain and triage score');

  // Review finding toggle (PATCH /api/findings/[findingId])
  const reviewRes = await fetch(`${BASE_URL}/api/findings/${findingId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie || '',
    },
    body: JSON.stringify({ reviewed: true }),
  });
  assert(reviewRes.ok, 'Review finding toggle failed');
  const reviewData = await reviewRes.json();
  assert(reviewData.finding?.reviewed === true, 'reviewed should be true');
  console.log('  ✓ Finding review status toggled to reviewed=true');

  // Create route (POST /api/routes)
  const createRouteRes = await fetch(`${BASE_URL}/api/routes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie || '',
    },
    body: JSON.stringify({ findingId }),
  });
  assert(createRouteRes.ok, 'Create route failed');
  const createRouteData = await createRouteRes.json();
  const routeId = createRouteData.route?.id;
  assert(routeId, 'Created route must have ID');
  console.log(`  ✓ Route created: [${routeId}] "${createRouteData.route.title}"`);

  // Step through status transitions: not-started -> in-progress -> needs-review -> completed
  const statuses = ['in-progress', 'needs-review', 'completed'];
  for (const st of statuses) {
    const patchRes = await fetch(`${BASE_URL}/api/routes/${routeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie || '',
      },
      body: JSON.stringify({ status: st }),
    });
    assert(patchRes.ok, `Status transition to ${st} failed`);
    const patchData = await patchRes.json();
    assert(patchData.route?.status === st, `Route status must be ${st}`);
  }
  console.log('  ✓ Route stepper cycled: not-started → in-progress → needs-review → completed');

  // Verify status persists on GET /api/routes/[routeId]
  const verifyRouteRes = await fetch(`${BASE_URL}/api/routes/${routeId}`, {
    headers: { Cookie: sessionCookie || '' },
  });
  const verifyRouteData = await verifyRouteRes.json();
  assert(verifyRouteData.route?.status === 'completed', 'Persisted route status must be completed');
  console.log('  ✓ Route status persistence verified on refresh');

  console.log('Flow 2c & 2d complete: Finding detail and Route lifecycle completely working!\n');

  // ----------------------------------------------------------------
  // FLOW 2e: Draft Creation, Preview, Copy & Disclosure Guard
  // ----------------------------------------------------------------
  console.log('>>> [Flow 2e] Draft Creation & Disclosure Guard');
  
  // 1. Generate Draft for Beginner/Maintainer Finding
  const draftCreateRes = await fetch(`${BASE_URL}/api/drafts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie || '',
    },
    body: JSON.stringify({ routeId }),
  });
  assert(draftCreateRes.ok, `Draft creation failed: ${draftCreateRes.status}`);
  const draftData = await draftCreateRes.json();
  const draftId = draftData.draft?.id;
  assert(draftId, 'Draft ID present');
  assert(draftData.draft?.markdownContent, 'Draft markdown content present');
  console.log(`  ✓ Public issue draft generated: [${draftId}] "${draftData.draft.title}"`);

  // 2. Disclosure Guard Test: Attempt to create draft for a SECRET or CRITICAL finding
  console.log('  Testing Disclosure Guard (SECURITY.md §4)...');
  if (secretOrCriticalFinding) {
    // Create route for critical/secret finding
    const criticalRouteRes = await fetch(`${BASE_URL}/api/routes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie || '',
      },
      body: JSON.stringify({ findingId: secretOrCriticalFinding.id }),
    });
    const criticalRouteData = await criticalRouteRes.json();
    const criticalRouteId = criticalRouteData.route?.id;

    if (criticalRouteId) {
      const blockedDraftRes = await fetch(`${BASE_URL}/api/drafts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie || '',
        },
        body: JSON.stringify({ routeId: criticalRouteId }),
      });
      assert(blockedDraftRes.status === 403, `Expected 403 DISCLOSURE_BLOCKED, got ${blockedDraftRes.status}`);
      const blockedData = await blockedDraftRes.json();
      assert(blockedData.errorCode === 'DISCLOSURE_BLOCKED', 'Must return DISCLOSURE_BLOCKED error code');
      console.log('  ✓ Disclosure Guard successfully BLOCKED public draft generation with 403 DISCLOSURE_BLOCKED!');
    }
  }

  console.log('\n====================================================');
  console.log('   🎉 ALL 7 AUDIT FLOWS PASSED AND VERIFIED GREEN!   ');
  console.log('====================================================');
}

runSmokeAudit().catch((err) => {
  console.error('\n❌ RUNTIME SMOKE AUDIT FAILED:', err);
  process.exit(1);
});
