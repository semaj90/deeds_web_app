// Comprehensive Deeds App Test & Setup Script
// This script sets up Docker, PostgreSQL, Drizzle Studio, and runs all tests with traces

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Deeds App Complete Setup...\n');

// Create test report
const reportFile = 'TEST_REPORT.txt';
let report = [];

function addToReport(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    report.push(logMessage);
}

function saveReport() {
    fs.writeFileSync(reportFile, report.join('\n'));
    console.log(`\n📊 Report saved to: ${reportFile}`);
}

async function runCommand(command, description, directory = process.cwd()) {
    addToReport(`🔧 ${description}`);
    addToReport(`   Command: ${command}`);
    addToReport(`   Directory: ${directory}`);
    
    try {
        const result = execSync(command, { 
            cwd: directory, 
            stdio: 'pipe',
            encoding: 'utf8',
            timeout: 300000 // 5 minutes timeout
        });
        addToReport(`   ✅ Success: ${result.substring(0, 200)}...`);
        return { success: true, output: result };
    } catch (error) {
        addToReport(`   ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function main() {
    try {
        // Step 1: Check Prerequisites
        addToReport('='.repeat(80));
        addToReport('STEP 1: Checking Prerequisites');
        addToReport('='.repeat(80));
        
        const dockerCheck = await runCommand('docker --version', 'Checking Docker installation');
        if (!dockerCheck.success) {
            addToReport('❌ Docker not found. Please install Docker Desktop first.');
            saveReport();
            return;
        }

        await runCommand('node --version', 'Checking Node.js installation');
        await runCommand('npm --version', 'Checking npm installation');

        // Step 2: Create Docker Compose if needed
        addToReport('='.repeat(80));
        addToReport('STEP 2: Docker Setup');
        addToReport('='.repeat(80));
        
        if (!fs.existsSync('docker-compose.yml')) {
            addToReport('📝 Creating docker-compose.yml...');
            const dockerCompose = `version: '3.8'
services:
  postgres:
    image: postgres:15
    container_name: deeds_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: prosecutor_db
      POSTGRES_INITDB_ARGS: "--encoding=UTF-8 --lc-collate=C --lc-ctype=C"
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
`;
            fs.writeFileSync('docker-compose.yml', dockerCompose);
            addToReport('✅ docker-compose.yml created');
        }

        // Step 3: Start PostgreSQL
        addToReport('='.repeat(80));
        addToReport('STEP 3: Starting PostgreSQL with Docker');
        addToReport('='.repeat(80));

        await runCommand('docker-compose down', 'Stopping any existing containers');
        await runCommand('docker-compose up -d postgres', 'Starting PostgreSQL container');
        
        // Wait for PostgreSQL to be ready
        addToReport('⏳ Waiting for PostgreSQL to be ready...');
        for (let i = 0; i < 30; i++) {
            const healthCheck = await runCommand('docker-compose exec -T postgres pg_isready -U postgres', 'Checking PostgreSQL health');
            if (healthCheck.success) {
                addToReport('✅ PostgreSQL is ready!');
                break;
            }
            addToReport(`   Attempt ${i + 1}/30 - waiting...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Step 4: Install Dependencies
        addToReport('='.repeat(80));
        addToReport('STEP 4: Installing Dependencies');
        addToReport('='.repeat(80));
        
        await runCommand('npm install', 'Installing root dependencies');
        await runCommand('npm install', 'Installing frontend dependencies', './web-app/sveltekit-frontend');

        // Step 5: Database Migration
        addToReport('='.repeat(80));
        addToReport('STEP 5: Database Migration');
        addToReport('='.repeat(80));
        
        await runCommand('npx drizzle-kit push', 'Pushing database schema');
        await runCommand('npx drizzle-kit migrate', 'Running database migrations');

        // Step 6: Start Background Services
        addToReport('='.repeat(80));
        addToReport('STEP 6: Starting Background Services');
        addToReport('='.repeat(80));
        
        // Start Drizzle Studio
        addToReport('🎛️ Starting Drizzle Studio...');
        const drizzleStudio = spawn('npx', ['drizzle-kit', 'studio'], {
            cwd: './web-app/sveltekit-frontend',
            detached: true,
            stdio: 'ignore'
        });
        drizzleStudio.unref();
        addToReport('✅ Drizzle Studio started');

        // Start Dev Server
        addToReport('🌐 Starting Development Server...');
        const devServer = spawn('npm', ['run', 'dev'], {
            cwd: './web-app/sveltekit-frontend',
            detached: true,
            stdio: 'ignore'
        });
        devServer.unref();
        addToReport('✅ Development server started');
        
        // Wait for services to start
        await new Promise(resolve => setTimeout(resolve, 20000));

        // Step 7: Run Node.js Tests
        addToReport('='.repeat(80));
        addToReport('STEP 7: Running Node.js Tests');
        addToReport('='.repeat(80));
        
        const testDir = './web-app/sveltekit-frontend/tests';
        if (fs.existsSync(testDir)) {
            const testFiles = fs.readdirSync(testDir).filter(file => 
                file.endsWith('.js') && file.startsWith('test-')
            );
            
            for (const testFile of testFiles) {
                await runCommand(`node tests/${testFile}`, `Running ${testFile}`, './web-app/sveltekit-frontend');
            }
        }

        // Step 8: Run Playwright Tests with Full Traces
        addToReport('='.repeat(80));
        addToReport('STEP 8: Running Playwright Tests with Traces');
        addToReport('='.repeat(80));
        
        // Install Playwright browsers
        await runCommand('npx playwright install', 'Installing Playwright browsers', './web-app/sveltekit-frontend');
        
        // Run tests with traces and HTML reporter
        const playwrightResult = await runCommand(
            'npx playwright test --trace=on --reporter=html --workers=1 --timeout=60000',
            'Running Playwright tests with traces',
            './web-app/sveltekit-frontend'
        );

        addToReport(`Playwright tests result: ${playwrightResult.success ? 'PASSED' : 'FAILED'}`);
        if (!playwrightResult.success) {
            addToReport('Test failures detected - check HTML report for details');
        }

        // Step 9: Build Check
        addToReport('='.repeat(80));
        addToReport('STEP 9: Production Build Check');
        addToReport('='.repeat(80));
        
        const buildResult = await runCommand('npm run build', 'Testing production build', './web-app/sveltekit-frontend');
        addToReport(`Build result: ${buildResult.success ? 'SUCCESS' : 'FAILED'}`);

        // Step 10: Connection Tests
        addToReport('='.repeat(80));
        addToReport('STEP 10: Connection Tests');
        addToReport('='.repeat(80));
        
        // Test database connection
        await runCommand('docker-compose exec -T postgres psql -U postgres -d prosecutor_db -c "SELECT version();"', 'Testing database connection');
        
        // Step 11: Final Status Report
        addToReport('='.repeat(80));
        addToReport('FINAL STATUS REPORT');
        addToReport('='.repeat(80));
        
        addToReport('🎉 Setup Complete! Services Status:');
        addToReport('');
        addToReport('🐘 PostgreSQL:        localhost:5432 (postgres/postgres)');
        addToReport('🎛️ Drizzle Studio:    https://local.drizzle.studio');
        addToReport('🌐 Dev Server:        http://localhost:5173');
        addToReport('📊 Test Report:       http://localhost:9323');
        addToReport('');
        addToReport('📋 Test Results Summary:');
        addToReport(`   Node.js Tests:     ${testFiles ? 'COMPLETED' : 'SKIPPED'}`);
        addToReport(`   Playwright Tests:  ${playwrightResult.success ? 'PASSED' : 'FAILED'}`);
        addToReport(`   Production Build:  ${buildResult.success ? 'SUCCESS' : 'FAILED'}`);
        addToReport('');
        addToReport('🔗 Quick Access:');
        addToReport('   View App:          http://localhost:5173');
        addToReport('   Database Studio:   https://local.drizzle.studio');
        addToReport('   Test Results:      http://localhost:9323');
        addToReport('   Full Report:       TEST_REPORT.txt');
        addToReport('');
        addToReport('🛠️ Troubleshooting:');
        addToReport('   Stop services:     docker-compose down');
        addToReport('   View logs:         docker-compose logs postgres');
        addToReport('   Restart DB:        docker-compose restart postgres');

    } catch (error) {
        addToReport(`💥 Setup failed with error: ${error.message}`);
        addToReport(`Stack trace: ${error.stack}`);
    } finally {
        saveReport();
        addToReport('📄 Complete report saved to TEST_REPORT.txt');
    }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
    addToReport('🛑 Setup interrupted by user');
    saveReport();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    addToReport(`💥 Uncaught exception: ${error.message}`);
    saveReport();
    process.exit(1);
});

// Start the process
main();
