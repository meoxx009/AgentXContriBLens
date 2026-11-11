import { execSync } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';

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

console.log('--- Verifying F5 Smart Recommendations in Chrome Headless ---');

// 1. Finding Detail View
const findingHtml = dumpDom('http://localhost:3000/app/findings/demo-finding-1', 'finding-f5-dump.html');
const hasRecStrip = findingHtml.includes('recommendation-strip');
const hasPriorityLabel = findingHtml.includes('Fix this now') || findingHtml.includes('Good next step');
const hasWhatToLearn = findingHtml.includes('What to learn first:');
const hasReadGuide = findingHtml.includes('Read Guide');

console.log('Finding Detail Recommendation Strip:', hasRecStrip ? 'PASS' : 'FAIL');
console.log('Finding Priority Label:', hasPriorityLabel ? 'PASS' : 'FAIL');
console.log('Finding What to Learn First:', hasWhatToLearn ? 'PASS' : 'FAIL');
console.log('Finding Read Guide Link:', hasReadGuide ? 'PASS' : 'FAIL');

// 2. Scan View (with ?demo=true to trigger demo scan result)
const scanHtml = dumpDom('http://localhost:3000/app/scan?demo=true', 'scan-f5-dump.html');
const hasScanPage = scanHtml.includes('Scan Public Repository') || scanHtml.includes('express');
console.log('Scan Page Accessible:', hasScanPage ? 'PASS' : 'FAIL');

// 3. Dashboard View
const dashboardHtml = dumpDom('http://localhost:3000/app/dashboard', 'dash-f5-dump.html');
console.log('Dashboard HTML length:', dashboardHtml.length);
console.log('Dashboard HTML snippet:', dashboardHtml.slice(0, 500));
const hasDashPanel = dashboardHtml.includes('recommended-for-you-panel') || dashboardHtml.includes('Recommended for you');
const hasEmptyOrTop3 = dashboardHtml.includes('Run a scan to get personalized next steps') || dashboardHtml.includes('Top ') || dashboardHtml.includes('Deterministic Scoring');
console.log('Dashboard Recommended Panel:', hasDashPanel ? 'PASS' : 'FAIL');
console.log('Dashboard Empty Guidance or Recommendations:', hasEmptyOrTop3 ? 'PASS' : 'FAIL');

if (hasRecStrip && hasPriorityLabel && hasWhatToLearn && hasReadGuide && hasDashPanel) {
  console.log('\nAll F5 DOM assertions verified successfully in Chrome!');
  process.exit(0);
} else {
  console.log('\nSome F5 DOM assertions were missing.');
  process.exit(1);
}
