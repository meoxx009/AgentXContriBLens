// scripts/test-real-scan.mjs
const BASE_URL = 'http://localhost:3000';

async function testRealScan() {
  // 1. Login with smoke test account
  const testEmail = `smoke_scan_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  console.log('--- 1. Registering test user ---');
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      passwordConfirmation: testPassword,
      acceptedTerms: true,
      name: 'Scan Tester',
    }),
  });
  if (!signupRes.ok) {
    const err = await signupRes.text();
    throw new Error(`Signup failed: ${signupRes.status} ${err}`);
  }
  const sessionCookie = signupRes.headers.get('set-cookie');
  console.log('Authenticated cookie acquired');

  console.log('--- 2. Triggering real scan of expressjs/express (partial scope) ---');
  const scanStart = Date.now();
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

  const scanElapsed = ((Date.now() - scanStart) / 1000).toFixed(2);
  const scanData = await scanRes.json();
  console.log(`Scan response (${scanElapsed}s):`, scanRes.status, {
    ok: scanData.ok,
    scanId: scanData.scan?.id,
    repoName: scanData.scan?.repoName,
    readinessScore: scanData.scan?.readinessScore,
    status: scanData.scan?.status,
    totalFiles: scanData.scan?.totalFiles,
    filesSkipped: scanData.scan?.filesSkipped,
    findingsCount: scanData.findings?.length,
    warnings: scanData.scan?.warnings || scanData.warnings,
  });

  if (!scanRes.ok) {
    console.error('Scan error data:', scanData);
  } else {
    console.log('Real Scan successfully completed and verified!');
  }
}

testRealScan().catch(err => {
  console.error('Real scan error:', err);
  process.exit(1);
});
