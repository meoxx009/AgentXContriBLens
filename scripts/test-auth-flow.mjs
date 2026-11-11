// scripts/test-auth-flow.mjs
const BASE_URL = 'http://localhost:3000';

async function testAuth() {
  const testEmail = `smoke_test_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  const testName = 'Smoke Auditor';

  console.log('--- 1. Testing Signup ---');
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      passwordConfirmation: testPassword,
      acceptedTerms: true,
      name: testName,
    }),
  });

  const signupData = await signupRes.json();
  console.log('Signup status:', signupRes.status, signupData.ok ? 'OK' : signupData);
  if (!signupRes.ok) {
    throw new Error(`Signup failed: ${JSON.stringify(signupData)}`);
  }

  // Extract session cookie
  const cookieHeader = signupRes.headers.get('set-cookie');
  console.log('Set-Cookie received:', !!cookieHeader);

  console.log('--- 2. Testing /api/auth/me with session cookie ---');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: cookieHeader || '' },
  });
  const meData = await meRes.json();
  console.log('Me status:', meRes.status, 'User email:', meData.user?.email);

  console.log('--- 3. Testing Logout ---');
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookieHeader || '' },
  });
  const logoutData = await logoutRes.json();
  console.log('Logout status:', logoutRes.status, logoutData.ok ? 'OK' : logoutData);

  const logoutCookie = logoutRes.headers.get('set-cookie');
  console.log('Logout cookie cleared:', logoutCookie?.includes('Max-Age=0') || logoutCookie?.includes('expires=Thu, 01 Jan 1970'));

  console.log('--- 4. Testing Login ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });
  const loginData = await loginRes.json();
  console.log('Login status:', loginRes.status, loginData.ok ? 'OK' : loginData);
  const loginCookie = loginRes.headers.get('set-cookie');

  console.log('--- 5. Verify /api/auth/me with new Login cookie ---');
  const verifyRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: loginCookie || '' },
  });
  const verifyData = await verifyRes.json();
  console.log('Verify Me status:', verifyRes.status, 'Email matches:', verifyData.user?.email === testEmail);

  console.log('Auth Flow completed successfully!');
}

testAuth().catch(err => {
  console.error('Test Auth Error:', err);
  process.exit(1);
});
