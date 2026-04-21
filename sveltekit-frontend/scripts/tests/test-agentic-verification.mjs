const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const chalk = { cyan, green, red, yellow, dim, bold };

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';
const AUTH_HEADER = { 'Authorization': 'Bearer dev-only-service-token' };

async function testAgenticVerification() {
  console.log(chalk.bold('\n🧪 Testing Phase 5: Agentic Verification Loop'));
  
  // 1. Create a dummy component with a "fixable" error
  const samplePath = 'src/lib/server/ai/__verification_test.svelte';
  // Note: We don't write it here, we just tell the agent it exists and has an error.
  // The agent will use read_file to investigate.
  
  const payload = {
    error: "Identifier 'y' is not defined",
    filePath: 'src/routes/+page.svelte', // Use a real file so read_file works
    codeSnippet: 'let x = $state(10); let z = x + y;',
    framework: 'svelte5',
    topK: 1
  };

  console.log(`📡 Sending fix request for ${payload.filePath}...`);
  const t0 = Date.now();
  
  try {
    const res = await fetch(`${BASE_URL}/api/codeintel/fix`, {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.log(chalk.red(`❌ Request failed: ${res.status}`));
      const text = await res.text();
      console.log(text.slice(0, 200));
      process.exit(1);
    }

    const data = await res.json();
    const duration = Date.now() - t0;
    
    console.log(chalk.blue(`⏱️  Agent Loop Duration: ${(duration/1000).toFixed(1)}s`));
    
    if (data.recommendations?.length > 0) {
      const rec = data.recommendations[0];
      console.log(chalk.green(`✅ Received Recommendation: "${rec.title}"`));
      console.log(`   Verified: ${rec.verified ? chalk.bold.green('YES') : chalk.yellow('NO')}`);
      
      if (rec.verificationLogs) {
        console.log(chalk.dim(`   Logs: ${rec.verificationLogs.slice(0, 100)}...`));
      }
      
      if (rec.verified) {
        console.log(chalk.bold.green('\n🔥 SUCCESS: Agent successfully used the verification loop!'));
      } else {
        console.log(chalk.yellow('\n⚠️  WARNING: Agent returned a recommendation but it was NOT verified.'));
        console.log('   Check if svelte-check is installed and the agent has correct tool permissions.');
      }
    } else {
      console.log(chalk.red('❌ No recommendations returned.'));
    }

  } catch (err) {
    console.log(chalk.red(`❌ Error during test: ${err.message}`));
  }
}

testAgenticVerification();
