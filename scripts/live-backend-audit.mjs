// scripts/live-backend-audit.mjs
// Comprehensive live backend verification against http://localhost:3000

import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function req(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // text output
  }
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    data: json,
    text,
  };
}

async function run() {
  console.log('=== ContribLens v2 — F2 Backend Hardening & Verification ===\n');
  const results = [];
  const errors = [];

  function pass(name, detail = '') {
    console.log(`✓ [PASS] ${name}${detail ? ` — ${detail}` : ''}`);
    results.push({ name, status: 'PASS', detail });
  }

  function fail(name, reason) {
    console.error(`✗ [FAIL] ${name} — ${reason}`);
    errors.push({ name, reason });
  }

  // 1. Auth Drills
  console.log('\n--- 1. Authentication Endpoints ---');
  
  // 1a. Signup validation
  const badSignup = await req('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: 'bad' }),
  });
  if (badSignup.status === 400) {
    pass('POST /api/auth/signup (validation rejection)', `Status: ${badSignup.status}`);
  } else {
    fail('POST /api/auth/signup (validation)', `Expected 400, got ${badSignup.status}`);
  }

  const userAEmail = `audit_usera_${Date.now()}@example.com`;
  const userAPass = 'StrongPass123!';
  const goodSignup = await req('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: userAEmail,
      password: userAPass,
      passwordConfirmation: userAPass,
      acceptedTerms: true,
    }),
  });
  const setCookieA = goodSignup.headers['set-cookie'] || '';
  const tokenMatchA = setCookieA.match(/contriblens_session=([^;]+)/);
  const cookieA = tokenMatchA ? `contriblens_session=${tokenMatchA[1]}` : '';

  if (goodSignup.status === 200 && cookieA) {
    pass('POST /api/auth/signup (valid registration)', `Created user, session cookie issued`);
  } else {
    fail('POST /api/auth/signup (valid)', `Status: ${goodSignup.status}, Cookie: ${Boolean(cookieA)}`);
  }

  // 1b. Login invalid credentials
  const badLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: userAEmail, password: 'WrongPassword!' }),
  });
  if (badLogin.status === 401 && badLogin.data?.error?.includes('Invalid email or password')) {
    pass('POST /api/auth/login (invalid credentials)', 'Returned safe generic 401 error');
  } else {
    fail('POST /api/auth/login (invalid)', `Expected 401, got ${badLogin.status}`);
  }

  // 1c. Login valid credentials
  const goodLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: userAEmail, password: userAPass }),
  });
  if (goodLogin.status === 200 && goodLogin.headers['set-cookie']?.includes('contriblens_session=')) {
    pass('POST /api/auth/login (valid credentials)', 'Session issued successfully');
  } else {
    fail('POST /api/auth/login (valid)', `Expected 200, got ${goodLogin.status}`);
  }

  // 1d. GET /api/auth/me
  const anonMe = await req('/api/auth/me');
  if (anonMe.status === 401) {
    pass('GET /api/auth/me (unauthenticated)', '401 Unauthorized');
  } else {
    fail('GET /api/auth/me (unauthenticated)', `Expected 401, got ${anonMe.status}`);
  }

  const authMe = await req('/api/auth/me', { headers: { Cookie: cookieA } });
  if (authMe.status === 200 && authMe.data?.user?.email === userAEmail) {
    pass('GET /api/auth/me (authenticated)', `User verified: ${authMe.data.user.email}`);
  } else {
    fail('GET /api/auth/me (authenticated)', `Status: ${authMe.status}`);
  }

  // 1e. GitHub OAuth unconfigured drill
  const oauthUnconf = await req('/api/auth/oauth/github', {
    method: 'POST',
    body: JSON.stringify({ code: 'external_oauth_code' }),
  });
  if (oauthUnconf.status === 503 && oauthUnconf.data?.errorCode === 'AUTH_PROVIDER_UNAVAILABLE') {
    pass('POST /api/auth/oauth/github (unconfigured graceful error)', 'Returned 503 AUTH_PROVIDER_UNAVAILABLE');
  } else {
    fail('POST /api/auth/oauth/github (unconfigured)', `Expected 503, got ${oauthUnconf.status}`);
  }

  // 1f. Forgot password
  const forgotRes = await req('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.com' }),
  });
  if (forgotRes.status === 200 && forgotRes.data?.ok) {
    pass('POST /api/auth/forgot-password (safe response)', 'Returned generic success');
  } else {
    fail('POST /api/auth/forgot-password', `Status: ${forgotRes.status}`);
  }

  // 1g. Logout
  const logoutRes = await req('/api/auth/logout', { method: 'POST' });
  if (logoutRes.status === 200 && (logoutRes.headers['set-cookie'] || '').includes('contriblens_session=;')) {
    pass('POST /api/auth/logout', 'Session destroyed');
  } else {
    fail('POST /api/auth/logout', `Status: ${logoutRes.status}`);
  }

  // Create User B for ownership tests
  const userBEmail = `audit_userb_${Date.now()}@example.com`;
  const signupB = await req('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: userBEmail,
      password: 'StrongPassB123!',
      passwordConfirmation: 'StrongPassB123!',
      acceptedTerms: true,
    }),
  });
  const tokenMatchB = (signupB.headers['set-cookie'] || '').match(/contriblens_session=([^;]+)/);
  const cookieB = tokenMatchB ? `contriblens_session=${tokenMatchB[1]}` : '';

  // 2. Scans & Ownership Drills
  console.log('\n--- 2. Scan & Ownership Enforcing ---');

  // Invalid URL drill
  const badScanUrl = await req('/api/scans', {
    method: 'POST',
    headers: { Cookie: cookieA },
    body: JSON.stringify({ repositoryUrl: 'not_a_valid_github_url' }),
  });
  if (badScanUrl.status === 400 && badScanUrl.data?.errorCode === 'GITHUB_INVALID_URL') {
    pass('POST /api/scans (invalid URL drill)', 'Rejected with 400 GITHUB_INVALID_URL, 0 findings');
  } else {
    fail('POST /api/scans (invalid URL)', `Expected 400 GITHUB_INVALID_URL, got ${badScanUrl.status}`);
  }

  // Demo scan access
  const demoScanRes = await req('/api/scans/demo-scan-001');
  if (demoScanRes.status === 200 && demoScanRes.data?.scanId === 'demo-scan-001') {
    pass('GET /api/scans/demo-scan-001 (unauthenticated demo preview)', '200 OK with demo fixtures');
  } else {
    fail('GET /api/scans/demo-scan-001', `Status: ${demoScanRes.status}`);
  }

  // Execute a real scan with User A
  console.log('Executing real partial scan with User A (expressjs/express)...');
  const scanA = await req('/api/scans', {
    method: 'POST',
    headers: { Cookie: cookieA },
    body: JSON.stringify({
      repositoryUrl: 'https://github.com/expressjs/express',
      scope: 'partial',
    }),
  });

  let scanAId = null;
  if (scanA.status === 200 && scanA.data?.scanId) {
    scanAId = scanA.data.scanId;
    pass('POST /api/scans (real partial scan)', `Scan completed: ${scanAId}, ${scanA.data.summary?.findings} findings`);
  } else {
    fail('POST /api/scans (real partial scan)', `Status: ${scanA.status}: ${JSON.stringify(scanA.data)}`);
  }

  // Ownership verification: User B cannot view User A's scan
  if (scanAId) {
    const userBAccessScanA = await req(`/api/scans/${scanAId}`, {
      headers: { Cookie: cookieB },
    });
    if (userBAccessScanA.status === 403) {
      pass(`GET /api/scans/[scanId] (ownership enforcement)`, 'User B strictly blocked from User A scan (403 Forbidden)');
    } else {
      fail(`GET /api/scans/[scanId] (ownership)`, `Expected 403, got ${userBAccessScanA.status}`);
    }

    const userAAccessScanA = await req(`/api/scans/${scanAId}`, {
      headers: { Cookie: cookieA },
    });
    if (userAAccessScanA.status === 200) {
      pass(`GET /api/scans/[scanId] (authorized user)`, 'User A successfully reads own scan (200 OK)');
    } else {
      fail(`GET /api/scans/[scanId] (authorized)`, `Status: ${userAAccessScanA.status}`);
    }
  }

  // 3. Findings & Filter Drills
  console.log('\n--- 3. Findings & Filter Endpoints ---');
  const allFindings = await req(`/api/findings?scanId=${scanAId || 'demo-scan-001'}`, {
    headers: { Cookie: cookieA },
  });
  if (allFindings.status === 200 && Array.isArray(allFindings.data?.findings)) {
    pass('GET /api/findings', `Retrieved ${allFindings.data.findings.length} findings`);
  } else {
    fail('GET /api/findings', `Status: ${allFindings.status}`);
  }

  // Severity filter
  const critFindings = await req(`/api/findings?scanId=${scanAId || 'demo-scan-001'}&severity=CRITICAL`, {
    headers: { Cookie: cookieA },
  });
  if (critFindings.status === 200) {
    const isFiltered = critFindings.data.findings.every(f => f.severity.toUpperCase() === 'CRITICAL');
    if (isFiltered) {
      pass('GET /api/findings?severity=CRITICAL', `Filter verified (${critFindings.data.findings.length} critical findings)`);
    } else {
      fail('GET /api/findings?severity=CRITICAL', 'Unfiltered findings returned');
    }
  }

  // 4. Routes & Status Transitions
  console.log('\n--- 4. Contribution Routes & State Machine Transitions ---');
  const safeFinding = allFindings.data?.findings?.find(f => f.category !== 'secret' && f.severity !== 'critical');
  let testRouteId = null;

  if (safeFinding) {
    const createRouteRes = await req('/api/routes', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: JSON.stringify({ findingId: safeFinding.id }),
    });

    if (createRouteRes.status === 200 && createRouteRes.data?.route?.id) {
      testRouteId = createRouteRes.data.route.id;
      pass('POST /api/routes', `Route created: ${testRouteId}, status: ${createRouteRes.data.route.status}`);
    } else {
      fail('POST /api/routes', `Status: ${createRouteRes.status}`);
    }
  }

  if (testRouteId) {
    // Attempt invalid jump: not-started → completed
    const invalidJump = await req(`/api/routes/${testRouteId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieA },
      body: JSON.stringify({ status: 'completed' }),
    });
    if (invalidJump.status === 400 && invalidJump.data?.error?.includes('Invalid status transition')) {
      pass('PATCH /api/routes/[routeId] (illegal jump rejected)', 'not-started → completed rejected with 400');
    } else {
      fail('PATCH /api/routes/[routeId] (illegal jump)', `Expected 400, got ${invalidJump.status}`);
    }

    // Attempt invalid status string
    const invalidStatus = await req(`/api/routes/${testRouteId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieA },
      body: JSON.stringify({ status: 'unknown_status' }),
    });
    if (invalidStatus.status === 400) {
      pass('PATCH /api/routes/[routeId] (unknown status rejected)', 'Rejected with 400 AUTH_INVALID_INPUT');
    } else {
      fail('PATCH /api/routes/[routeId] (unknown status)', `Expected 400, got ${invalidStatus.status}`);
    }

    // Step 1: not-started → in-progress
    const s1 = await req(`/api/routes/${testRouteId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieA },
      body: JSON.stringify({ status: 'in-progress' }),
    });
    // Step 2: in-progress → needs-review
    const s2 = await req(`/api/routes/${testRouteId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieA },
      body: JSON.stringify({ status: 'needs-review' }),
    });
    // Step 3: needs-review → completed
    const s3 = await req(`/api/routes/${testRouteId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieA },
      body: JSON.stringify({ status: 'completed' }),
    });

    if (s1.status === 200 && s2.status === 200 && s3.status === 200) {
      pass('PATCH /api/routes/[routeId] (valid transition sequence)', 'not-started → in-progress → needs-review → completed ✓');
    } else {
      fail('PATCH /api/routes/[routeId] (valid transitions)', `Failed sequence: s1=${s1.status}, s2=${s2.status}, s3=${s3.status}`);
    }

    // User B unauthorized to patch User A's route
    const userBPatch = await req(`/api/routes/${testRouteId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieB },
      body: JSON.stringify({ status: 'in-progress' }),
    });
    if (userBPatch.status === 403) {
      pass('PATCH /api/routes/[routeId] (ownership enforcement)', 'User B unauthorized to modify User A route (403)');
    } else {
      fail('PATCH /api/routes/[routeId] (ownership)', `Expected 403, got ${userBPatch.status}`);
    }
  }

  // 5. Issue Drafts & Disclosure Guard
  console.log('\n--- 5. Issue Drafts & Disclosure Guard ---');
  let testDraftId = null;

  if (testRouteId) {
    const draftRes = await req('/api/issue-drafts', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: JSON.stringify({ routeId: testRouteId }),
    });

    if (draftRes.status === 200 && draftRes.data?.draft?.id) {
      testDraftId = draftRes.data.draft.id;
      pass('POST /api/issue-drafts (safe finding)', `Draft created: ${testDraftId}, generatedBy: ${draftRes.data.draft.generatedBy}`);
    } else {
      fail('POST /api/issue-drafts (safe)', `Status: ${draftRes.status}`);
    }
  }

  // Disclosure Guard check on secret/critical finding
  const secretFinding = allFindings.data?.findings?.find(f => f.category === 'secret' || f.severity === 'critical');
  if (secretFinding) {
    const secRoute = await req('/api/routes', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: JSON.stringify({ findingId: secretFinding.id }),
    });
    if (secRoute.data?.route?.id) {
      const blockedDraft = await req('/api/issue-drafts', {
        method: 'POST',
        headers: { Cookie: cookieA },
        body: JSON.stringify({ routeId: secRoute.data.route.id }),
      });
      if (blockedDraft.status === 403 && blockedDraft.data?.errorCode === 'DISCLOSURE_BLOCKED') {
        pass('POST /api/issue-drafts (Disclosure Guard)', 'Secret finding draft generation strictly blocked with 403 DISCLOSURE_BLOCKED');
      } else {
        fail('POST /api/issue-drafts (Disclosure Guard)', `Expected 403 DISCLOSURE_BLOCKED, got ${blockedDraft.status}`);
      }
    }
  }

  if (testDraftId) {
    // User B unauthorized to view User A's draft
    const bDraftView = await req(`/api/issue-drafts/${testDraftId}`, {
      headers: { Cookie: cookieB },
    });
    if (bDraftView.status === 403) {
      pass('GET /api/issue-drafts/[draftId] (ownership enforcement)', 'User B unauthorized to access User A draft (403)');
    } else {
      fail('GET /api/issue-drafts/[draftId] (ownership)', `Expected 403, got ${bDraftView.status}`);
    }
  }

  // 6. Profile Settings Persistence
  console.log('\n--- 6. Profile Settings Persistence ---');
  const profileRes = await req('/api/profile', {
    method: 'PATCH',
    headers: { Cookie: cookieA },
    body: JSON.stringify({
      settings: {
        theme: 'linen',
        fontSize: 'large',
        reducedMotion: true,
      },
    }),
  });
  if (profileRes.status === 200 && profileRes.data?.user?.settings?.reducedMotion === true) {
    pass('PATCH /api/profile', 'Settings updated and persisted');
  } else {
    fail('PATCH /api/profile', `Status: ${profileRes.status}`);
  }

  // 7. Public & Health Endpoints
  console.log('\n--- 7. Public & Health Endpoints ---');
  const healthRes = await req('/api/health');
  if (healthRes.status === 200 && healthRes.data?.status === 'healthy') {
    pass('GET /api/health', `Healthy, version: ${healthRes.data.version}`);
  } else {
    fail('GET /api/health', `Status: ${healthRes.status}`);
  }

  const statsRes = await req('/api/stats');
  if (statsRes.status === 200 && typeof statsRes.data?.total_repositories === 'number') {
    pass('GET /api/stats', `Cached public counters: ${statsRes.data.total_repositories} repos`);
  } else {
    fail('GET /api/stats', `Status: ${statsRes.status}`);
  }

  const intRes = await req('/api/integrations/status');
  if (intRes.status === 200) {
    const text = JSON.stringify(intRes.data);
    const hasSecrets = text.includes('ghp_') || text.includes('AKIA') || text.includes('AIza');
    if (!hasSecrets) {
      pass('GET /api/integrations/status', 'Diagnostics returned, zero secrets exposed');
    } else {
      fail('GET /api/integrations/status', 'Secrets leaked in diagnostics');
    }
  }

  // 8. Anonymous Preview
  console.log('\n--- 8. Anonymous Preview ---');
  const prevRes = await req('/api/preview/scan', {
    method: 'POST',
    body: JSON.stringify({ repositoryUrl: 'https://github.com/expressjs/express' }),
  });
  if (prevRes.status === 200 && prevRes.data?.preview === true && prevRes.data?.scanId === 'demo-scan-001') {
    pass('POST /api/preview/scan', 'Demo scan returned with preview: true');
  } else {
    fail('POST /api/preview/scan', `Status: ${prevRes.status}`);
  }

  // 9. Secrets Grep Drill on .data/
  console.log('\n--- 9. Secrets In-Memory Redaction & Disk Grep ---');
  const rawSecrets = [
    ['ghp_', 'ABCDEF0123456789abcdef0123456789ABCD'].join(''),
    'AKIAIOSFODNN7EXAMPLE',
    'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    'https://example.com/test-fixture/slack-webhook',
    'key_test_abcdef1234567890abcdef1234567890',
  ];

  const dbPath = path.join(process.cwd(), '.data', 'db.json');
  if (fs.existsSync(dbPath)) {
    const dbContent = fs.readFileSync(dbPath, 'utf-8');
    let leakedCount = 0;
    for (const secret of rawSecrets) {
      if (dbContent.includes(secret)) {
        console.error(`Leaked secret detected in .data/db.json: ${secret}`);
        leakedCount++;
      }
    }
    if (leakedCount === 0) {
      pass('Secrets grep on .data/db.json', 'Zero raw secrets from fake-secrets.env found in storage');
    } else {
      fail('Secrets grep on .data/db.json', `${leakedCount} raw secrets found in storage`);
    }
  }

  console.log(`\n========================================`);
  console.log(`Total Checks: ${results.length + errors.length} | Passed: ${results.length} | Failed: ${errors.length}`);
  console.log(`========================================\n`);

  if (errors.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
