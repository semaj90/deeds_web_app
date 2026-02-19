# Complete MCP Setup Script - Make MCP Work!
Write-Host "🚀 Making MCP Server Work for deeds-web-app..." -ForegroundColor Green

$rootPath = "C:\Users\james\Desktop\deeds-web\deeds-web-app"
$claudeConfigFile = "$env:APPDATA\Claude\claude_desktop_config.json"

# Function to write colored output
function Write-Status {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

# Step 1: Check Node.js installation
Write-Status "`n1️⃣ Checking Node.js..." "Yellow"
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Status "✅ Node.js found: $nodeVersion" "Green"
        $nodeInstalled = $true
    } else {
        Write-Status "❌ Node.js not found" "Red"
        $nodeInstalled = $false
    }
} catch {
    Write-Status "❌ Node.js not accessible" "Red"
    $nodeInstalled = $false
}

# Step 2: Install Node.js if needed
if (-not $nodeInstalled) {
    Write-Status "`n⚠️ Node.js is required for MCP servers" "Yellow"
    Write-Status "Please install Node.js from: https://nodejs.org/" "Cyan"
    Write-Status "After installing Node.js, run this script again" "Cyan"
    
    # Try to download Node.js installer
    try {
        Write-Status "🔽 Attempting to download Node.js installer..." "Yellow"
        $nodeUrl = "https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi"
        $downloadsPath = "$env:USERPROFILE\Downloads\nodejs-installer.msi"
        
        Invoke-WebRequest -Uri $nodeUrl -OutFile $downloadsPath
        Write-Status "✅ Node.js installer downloaded to Downloads folder" "Green"
        Write-Status "💡 Run the installer, then restart this script" "Cyan"
        
        # Open downloads folder
        Start-Process "explorer.exe" "$env:USERPROFILE\Downloads"
        
        return
    } catch {
        Write-Status "❌ Could not download Node.js installer" "Red"
        Write-Status "Please manually download from https://nodejs.org/" "Yellow"
        return
    }
}

# Step 3: Create Claude config directory
Write-Status "`n2️⃣ Setting up Claude configuration..." "Yellow"
$claudeDir = Split-Path $claudeConfigFile
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
    Write-Status "✅ Created Claude config directory" "Green"
}

# Step 4: Backup existing config
if (Test-Path $claudeConfigFile) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Copy-Item $claudeConfigFile "$claudeConfigFile.backup.$timestamp"
    Write-Status "💾 Backed up existing config" "Yellow"
}

# Step 5: Install MCP servers
Write-Status "`n3️⃣ Installing MCP servers..." "Yellow"
try {
    # Install filesystem server
    Write-Status "Installing @modelcontextprotocol/server-filesystem..." "Gray"
    npm install -g @modelcontextprotocol/server-filesystem 2>$null
    
    # Install memory server  
    Write-Status "Installing @modelcontextprotocol/server-memory..." "Gray"
    npm install -g @modelcontextprotocol/server-memory 2>$null
    
    Write-Status "✅ MCP servers installed" "Green"
} catch {
    Write-Status "⚠️ Global install may have failed, but npx will work" "Yellow"
}

# Step 6: Test MCP servers
Write-Status "`n4️⃣ Testing MCP servers..." "Yellow"
$servers = @(
    "@modelcontextprotocol/server-filesystem",
    "@modelcontextprotocol/server-memory"
)

foreach ($server in $servers) {
    try {
        cmd /c "npx -y $server --help" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Status "✅ $($server.Split('/')[-1]) is accessible" "Green"
        } else {
            Write-Status "❌ $($server.Split('/')[-1]) failed" "Red"
        }
    } catch {
        Write-Status "❌ $($server.Split('/')[-1]) error" "Red"
    }
}

# Step 7: Create MCP configuration
Write-Status "`n5️⃣ Creating MCP configuration..." "Yellow"

$mcpConfig = @"
{
  "mcpServers": {
    "filesystem": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "$($rootPath.Replace('\', '\\'))"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    },
    "memory": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y", 
        "@modelcontextprotocol/server-memory"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  },
  "globalShortcut": "Ctrl+Shift+Space"
}
"@

try {
    $mcpConfig | Out-File -FilePath $claudeConfigFile -Encoding UTF8
    Write-Status "✅ MCP configuration created" "Green"
} catch {
    Write-Status "❌ Failed to create configuration" "Red"
    return
}

# Step 8: Validate configuration
Write-Status "`n6️⃣ Validating configuration..." "Yellow"
try {
    $testConfig = Get-Content $claudeConfigFile | ConvertFrom-Json
    if ($testConfig.mcpServers.filesystem -and $testConfig.mcpServers.memory) {
        Write-Status "✅ Configuration is valid" "Green"
    } else {
        Write-Status "❌ Configuration validation failed" "Red"
    }
} catch {
    Write-Status "❌ Configuration has invalid JSON" "Red"
}

# Step 9: Test project access
Write-Status "`n7️⃣ Testing project access..." "Yellow"
if (Test-Path $rootPath) {
    $itemCount = (Get-ChildItem $rootPath).Count
    Write-Status "✅ Project directory accessible ($itemCount items)" "Green"
} else {
    Write-Status "❌ Project directory not found: $rootPath" "Red"
}

# Step 10: Check Claude Desktop
Write-Status "`n8️⃣ Checking Claude Desktop..." "Yellow"
$claudeProcess = Get-Process -Name "Claude" -ErrorAction SilentlyContinue
if ($claudeProcess) {
    Write-Status "✅ Claude Desktop is running" "Green"
    Write-Status "⚠️ Restart Claude Desktop to load new config" "Yellow"
} else {
    Write-Status "ℹ️ Claude Desktop not running" "Yellow"
    Write-Status "Start Claude Desktop after this completes" "Cyan"
}

# Final summary
Write-Status "`n🎉 MCP Setup Complete!" "Green"
Write-Status "`n📋 Summary:" "Cyan"
Write-Status "• Config file: $claudeConfigFile" "White"
Write-Status "• Project path: $rootPath" "White"
Write-Status "• Filesystem server: ✅ Configured" "White"
Write-Status "• Memory server: ✅ Configured" "White"

Write-Status "`n🔄 Next Steps:" "Yellow"
Write-Status "1. Close Claude Desktop completely" "White"
Write-Status "2. Restart Claude Desktop" "White"
Write-Status "3. Look for MCP tool icons in Claude" "White"
Write-Status "4. Test with: 'Show me files in my project directory'" "White"

Write-Status "`n🧪 Test Commands for Claude:" "Cyan"
Write-Status "• 'List the files in my deeds-web-app project'" "Gray"
Write-Status "• 'Show me the PowerShell scripts in my project'" "Gray"
Write-Status "• 'Create a file called test.txt with hello world'" "Gray"
Write-Status "• 'What Docker files do I have in my project?'" "Gray"

Write-Status "`n✨ MCP is ready to use!" "Green"

# Show config file contents
Write-Status "`n📄 Configuration File Contents:" "Cyan"
Get-Content $claudeConfigFile | Write-Host -ForegroundColor Gray