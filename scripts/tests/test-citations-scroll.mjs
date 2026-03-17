import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import playwright from 'playwright';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const URL = process.env.CITATIONS_URL ?? 'http://localhost:5173/citations';
const SCREENSHOT_PATH = join(SCRIPT_DIR, 'citations-enhanced.png');

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

// Bypass onboarding
await page.addInitScript(() => {
  localStorage.setItem('deeds-onboarding-completed', 'true');
  localStorage.setItem('deeds-onboarding-step', '9');
});

await page.route('**/api/onboarding', (route) => {
  if (route.request().method() === 'PATCH') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasCompletedOnboarding: true, onboardingStep: 9 }) });
});

// Inject mock citation data so the UI has visible cards even when DB is empty
await page.addInitScript(() => {
  const MOCK = {
    success: true,
    citations: [
      {
        id: 'c1', citationType: 'statute', formattedCitation: '18 U.S.C. § 1030',
        quotedText: 'Whoever intentionally accesses a computer without authorization…',
        legalPrinciple: 'Computer Fraud and Abuse Act — unauthorized access prohibition.',
        relevanceScore: 0.95, isKeyAuthority: true,
        documentTitle: 'CFAA', caseTitle: null,
        sourceUrl: 'https://uscode.house.gov/view.xhtml?req=18+U.S.C.+1030',
        jurisdiction: 'Federal', createdAt: '2024-01-15T00:00:00Z',
      },
      {
        id: 'c2', citationType: 'case_law', formattedCitation: 'Van Buren v. United States, 593 U.S. 374 (2021)',
        quotedText: '"An individual "exceeds authorized access" when he accesses a computer with authorization but then obtains information he is not entitled to obtain."',
        legalPrinciple: 'Defined the scope of "exceeds authorized access" under the CFAA.',
        relevanceScore: 0.91, isKeyAuthority: true,
        documentTitle: null, caseTitle: 'Van Buren v. United States',
        sourceUrl: 'https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf',
        jurisdiction: 'Federal', createdAt: '2021-06-03T00:00:00Z',
      },
      {
        id: 'c3', citationType: 'regulation', formattedCitation: '45 CFR § 164.502',
        quotedText: 'A covered entity may not use or disclose protected health information, except as permitted or required…',
        legalPrinciple: 'HIPAA Privacy Rule — general rules for uses and disclosures of PHI.',
        relevanceScore: 0.87, isKeyAuthority: false,
        documentTitle: 'HIPAA Privacy Rule', caseTitle: null,
        sourceUrl: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.502',
        jurisdiction: 'Fed. Reg.', createdAt: '2013-03-26T00:00:00Z',
      },
      {
        id: 'c4', citationType: 'statute', formattedCitation: 'Cal. Pen. Code § 502',
        quotedText: 'It is the intent of the Legislature in enacting this section to expand the degree of protection afforded to individuals…',
        legalPrinciple: 'California Comprehensive Computer Data Access and Fraud Act.',
        relevanceScore: 0.83, isKeyAuthority: false,
        documentTitle: 'CA CCDA', caseTitle: null,
        sourceUrl: null,
        jurisdiction: 'CA', createdAt: '2022-09-30T00:00:00Z',
      },
      {
        id: 'c5', citationType: 'case_law', formattedCitation: 'Carpenter v. United States, 585 U.S. 296 (2018)',
        quotedText: 'When the Government accesses historical CSLI, it achieves near perfect surveillance of the citizenry.',
        legalPrinciple: 'Fourth Amendment protection extends to cell-site location information; requires warrant.',
        relevanceScore: 0.78, isKeyAuthority: true,
        documentTitle: null, caseTitle: 'Carpenter v. United States',
        sourceUrl: null,
        jurisdiction: 'Federal', createdAt: '2018-06-22T00:00:00Z',
      },
      {
        id: 'c6', citationType: 'regulation', formattedCitation: '17 CFR § 240.10b-5',
        quotedText: 'It shall be unlawful for any person, directly or indirectly, by the use of any means or instrumentality…',
        legalPrinciple: 'SEC Rule 10b-5 — securities fraud prohibition.',
        relevanceScore: 0.74, isKeyAuthority: false,
        documentTitle: 'SEC Rule 10b-5', caseTitle: null,
        sourceUrl: 'https://www.law.cornell.edu/cfr/text/17/240.10b-5',
        jurisdiction: 'Fed. Reg.', createdAt: '1948-05-21T00:00:00Z',
      },
    ]
  };
  // Intercept fetch after page JS loads
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes('/api/citations') && !url.includes('/api/citations/')) {
      return new Response(JSON.stringify(MOCK), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    return originalFetch(input, init);
  };
});

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });

  // Hide onboarding wizard if present
  await page.addStyleTag({ content: '.wizard-overlay, [aria-label^="Setup Wizard"], .toast-container { display: none !important; }' });

  // Wait for page structure
  await page.waitForTimeout(600);

  // Scroll down slowly to load lazy elements
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'smooth' }));
  await page.waitForTimeout(400);

  // Scroll back to top for screenshot
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.waitForTimeout(300);

  // Full-page screenshot captures the entire scrollable content
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  console.log('✅ Citations scrollable screenshot saved:', SCREENSHOT_PATH);

  // Log visible corpus tabs
  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).filter(b => ['All Sources','Statutes','Case Law','Regulations','Exec. Orders','Treaties','Glossary'].includes(b.textContent?.trim() ?? '')).map(b => b.textContent?.trim())
  );
  console.log('Corpus tabs found:', tabs);
} catch (err) {
  console.log('❌ Error:', err.message);
} finally {
  await browser.close();
}
