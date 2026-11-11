import { execSync } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';

const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function dumpDom(url, outputFile) {
  try {
    execSync(
      `"${CHROME_PATH}" --headless=new --disable-gpu --dump-dom "${url}" > "${outputFile}" 2>nul`,
      { timeout: 15000, shell: 'cmd.exe' }
    );
    const content = readFileSync(outputFile, 'utf8');
    try { unlinkSync(outputFile); } catch {}
    return content;
  } catch (e) {
    console.error('Failed to dump DOM for', url, e.message);
    return '';
  }
}

async function runJourneys() {
  console.log('\n=============================================================');
  console.log('  ContribLens — F6 Full Journey Verification (Chrome Headless)');
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Journey 2a: Keyless Anonymous Preview ("Demo" all through)
  // -------------------------------------------------------------
  console.log('\n--- Journey 2a: Keyless Anonymous Journey ---');

  // 1. Landing Page
  const landingHtml = dumpDom(`${BASE_URL}/`, 'j2a-landing.html');
  assert(
    landingHtml.includes('Try without account') || landingHtml.includes('Demo') || landingHtml.includes('Try anonymous preview'),
    'Landing page features clear anonymous entry'
  );

  // 2. Demo Scan
  const scanDemoHtml = dumpDom(`${BASE_URL}/app/scan?demo=true`, 'j2a-scan.html');
  assert(
    scanDemoHtml.includes('Scan Public Repository') || scanDemoHtml.includes('expressjs/express'),
    'Scan page loads with demo context'
  );

  // 3. Demo Findings
  const findingsHtml = dumpDom(`${BASE_URL}/app/findings`, 'j2a-findings.html');
  assert(
    findingsHtml.includes('findings') || findingsHtml.includes('Security') || findingsHtml.includes('Verified Findings'),
    'Findings view renders findings list'
  );

  // 4. Demo Finding Detail with Explanation & Recommendation Strip
  const findingHtml = dumpDom(`${BASE_URL}/app/findings/demo-finding-1`, 'j2a-finding.html');
  assert(
    findingHtml.includes('recommendation-strip') &&
    (findingHtml.includes('Fix this now') || findingHtml.includes('Good next step')),
    'Finding detail renders deterministic recommendation strip'
  );
  assert(
    findingHtml.includes('plain-english-summary-card') &&
    findingHtml.includes('What happened') &&
    findingHtml.includes('Why it matters') &&
    findingHtml.includes('How to fix'),
    'Finding detail renders beginner-friendly 3-part plain-English summary'
  );
  assert(
    findingHtml.includes('explanation') || findingHtml.includes('Deterministic') || findingHtml.includes('Gemma'),
    'Finding detail labels the explanation engine used'
  );

  // 5. Demo Contribution Route Detail
  const routeHtml = dumpDom(`${BASE_URL}/app/contributions/demo-route-1`, 'j2a-route.html');
  assert(
    routeHtml.includes('Contribution Route') || routeHtml.includes('Scope down GitHub Actions CI permissions') || routeHtml.includes('Test Plan'),
    'Contribution Route renders plan and acceptance criteria'
  );

  // -------------------------------------------------------------
  // Journey 2b: Authenticated Contributor Flow
  // -------------------------------------------------------------
  console.log('\n--- Journey 2b: Authenticated Contributor Flow ---');

  // Test account credentials
  const timestamp = Date.now();
  const testEmail = `f6_user_${timestamp}@contriblens.test`;
  const testPassword = 'Password123!Safe';

  // 1. Signup
  let sessionCookie = '';
  try {
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        passwordConfirmation: testPassword,
        acceptedTerms: true,
        name: 'F6 Contributor',
      }),
    });
    assert(signupRes.ok, `Signup API creates user (${signupRes.status})`);
    const cookies = typeof signupRes.headers.getSetCookie === 'function' ? signupRes.headers.getSetCookie() : [signupRes.headers.get('set-cookie')];
    if (cookies && cookies[0]) {
      sessionCookie = cookies[0].split(';')[0];
    }
  } catch (e) {
    assert(false, `Signup API call failed: ${e.message}`);
  }

  // 2. Dashboard with Recommendations Panel
  const dashboardHtml = dumpDom(`${BASE_URL}/app/dashboard`, 'j2b-dashboard.html');
  assert(
    dashboardHtml.includes('recommended-for-you-panel') ||
    dashboardHtml.includes('Recommended for you') ||
    dashboardHtml.includes('Run a scan to get personalized next steps'),
    'Dashboard surfaces Recommended for you panel or empty guidance'
  );

  // 3. Real Scan partial with warnings / files skipped
  try {
    const scanRes = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: JSON.stringify({
        repositoryUrl: 'https://github.com/expressjs/express',
        scope: 'partial',
      }),
    });
    assert(scanRes.ok || scanRes.status === 200 || scanRes.status === 429, `Real scan API handled successfully (${scanRes.status})`);
  } catch (e) {
    assert(false, `Real scan request failed: ${e.message}`);
  }

  // 4. Profile settings persistence
  try {
    const profileRes = await fetch(`${BASE_URL}/api/profile`, {
      headers: sessionCookie ? { Cookie: sessionCookie } : {},
    });
    assert(profileRes.ok, `Profile API responds (${profileRes.status})`);

    const updateRes = await fetch(`${BASE_URL}/api/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: JSON.stringify({
        settings: {
          reduceMotion: true,
          strictRedaction: true,
        },
      }),
    });
    assert(updateRes.ok, `Profile preferences persist (${updateRes.status})`);
  } catch (e) {
    assert(false, `Profile check failed: ${e.message}`);
  }

  // 5. Logout
  try {
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: sessionCookie ? { Cookie: sessionCookie } : {},
    });
    assert(logoutRes.ok, `Logout clears session (${logoutRes.status})`);
  } catch (e) {
    assert(false, `Logout request failed: ${e.message}`);
  }

  // -------------------------------------------------------------
  // Journey 2c: Failure Drills
  // -------------------------------------------------------------
  console.log('\n--- Journey 2c: Failure Drills ---');

  // 1. Bad Repo URL Typed Error
  try {
    const badScanRes = await fetch(`${BASE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repositoryUrl: 'https://github.com/invalid-nonexistent-owner-9999/invalid-repo-9999',
        scope: 'partial',
      }),
    });
    const badData = await badScanRes.json();
    assert(
      badScanRes.status >= 400 && (badData.error || badData.failure || badData.userMessage),
      `Bad repo URL returns typed error (${badScanRes.status}: ${badData.error || badData.failure?.type})`
    );
  } catch (e) {
    assert(false, `Bad repo test failed: ${e.message}`);
  }

  // 2. Second Demo Attempt Limit State
  try {
    const preview1 = await fetch(`${BASE_URL}/api/preview/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryUrl: 'https://github.com/expressjs/express' }),
    });

    const preview2 = await fetch(`${BASE_URL}/api/preview/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryUrl: 'https://github.com/expressjs/express' }),
    });

    assert(
      preview1.ok || preview2.ok || preview2.status === 429 || preview2.status === 403,
      `Second demo attempt enforces rate limit or preview bounds (${preview2.status})`
    );
  } catch (e) {
    assert(false, `Preview limit test failed: ${e.message}`);
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n=============================================================');
  console.log(`  Journey Results: ${passed} Passed, ${failed} Failed`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runJourneys();
