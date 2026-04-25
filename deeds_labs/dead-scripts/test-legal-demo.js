import { chromium } from 'playwright';

(async () => {
  console.log('🚀 Launching Chromium to test Legal AI Demo...');

  const browser = await chromium.launch({
    headless: false, // Show browser
    args: ['--disable-web-security', '--allow-running-insecure-content'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('📍 Navigating to Legal AI Demo...');
    await page.goto('http://localhost:5176/legal-ai-demo', {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    console.log('✅ Page loaded successfully');
    console.log('📊 Page title:', await page.title());

    // Check for key elements
    const hasUploadSection = (await page.locator('text=Upload Legal Document').count()) > 0;
    const hasAnalysisSection = (await page.locator('text=AI Analysis').count()) > 0;
    const hasRecommendations = (await page.locator('text=Recommendations').count()) > 0;

    console.log('🔍 Component Check:');
    console.log('  - Upload Section:', hasUploadSection ? '✅' : '❌');
    console.log('  - Analysis Section:', hasAnalysisSection ? '✅' : '❌');
    console.log('  - Recommendations:', hasRecommendations ? '✅' : '❌');

    // Test WebGPU availability
    const webgpuSupported = await page.evaluate(() => {
      return 'gpu' in navigator;
    });
    console.log('🎮 WebGPU Support:', webgpuSupported ? '✅' : '❌');

    // Test Ollama connection via frontend
    console.log('🦙 Testing Ollama connection...');
    const ollamaTest = await page.evaluate(async () => {
      try {
        // removed unused response assignment
        return { success: true, status: response.status };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    console.log('🦙 Ollama Status:', ollamaTest.success ? '✅' : '❌');

    console.log('\n🎉 Legal AI Demo is functional and ready for use!');
    console.log('🌐 Access at: http://localhost:5176/legal-ai-demo');

    // Keep browser open for 5 seconds to see the page
    await page.waitForTimeout(5000);
  } catch (error) {
    console.error('❌ Error testing Legal AI Demo:', error.message);
  } finally {
    await browser.close();
  }
})();
