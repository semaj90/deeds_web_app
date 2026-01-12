# RabbitMQ Connection Test
# Tests all fallback configurations

Write-Host "🧪 Testing RabbitMQ Connection Fallback" -ForegroundColor Cyan
Write-Host "═" * 60
Write-Host ""

$testResults = @()

function Test-Connection {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Description
    )

    Write-Host "Testing: $Name" -ForegroundColor Yellow
    Write-Host "  URL: $Url" -ForegroundColor Gray

    try {
        # Test AMQP port
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connect = $tcpClient.BeginConnect("localhost", 5672, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(1000, $false)

        if ($wait) {
            $tcpClient.EndConnect($connect)
            $tcpClient.Close()

            Write-Host "  ✅ AMQP Port 5672: OPEN" -ForegroundColor Green

            # Test Management UI
            try {
                $cred = New-Object PSCredential("guest", (ConvertTo-SecureString "guest" -AsPlainText -Force))
                $response = Invoke-RestMethod -Uri "http://localhost:15672/api/overview" -Credential $cred -TimeoutSec 2 -ErrorAction SilentlyContinue
                Write-Host "  ✅ Management UI: ACCESSIBLE" -ForegroundColor Green
                Write-Host "  ℹ️  Version: $($response.rabbitmq_version)" -ForegroundColor Gray

                return @{
                    Name = $Name
                    Status = "SUCCESS"
                    Port = "Open"
                    ManagementUI = "Accessible"
                    Version = $response.rabbitmq_version
                }
            } catch {
                Write-Host "  ⚠️  Management UI: NOT ACCESSIBLE" -ForegroundColor Yellow
                return @{
                    Name = $Name
                    Status = "PARTIAL"
                    Port = "Open"
                    ManagementUI = "Not Accessible"
                }
            }
        } else {
            $tcpClient.Close()
            Write-Host "  ❌ AMQP Port 5672: CLOSED" -ForegroundColor Red
            return @{
                Name = $Name
                Status = "FAILED"
                Port = "Closed"
                ManagementUI = "N/A"
            }
        }
    } catch {
        Write-Host "  ❌ Connection Failed: $($_.Exception.Message)" -ForegroundColor Red
        return @{
            Name = $Name
            Status = "FAILED"
            Port = "Closed"
            Error = $_.Exception.Message
        }
    } finally {
        Write-Host ""
    }
}

# Test 1: Docker RabbitMQ
$testResults += Test-Connection `
    -Name "Docker RabbitMQ" `
    -Url "amqp://localhost:5672" `
    -Description "Default Docker container"

# Test 2: Native Windows RabbitMQ
$testResults += Test-Connection `
    -Name "Native Windows RabbitMQ" `
    -Url "amqp://guest:guest@localhost:5672/" `
    -Description "Windows service with guest credentials"

# Summary
Write-Host "═" * 60
Write-Host "📊 Test Summary" -ForegroundColor Cyan
Write-Host ""

$successCount = ($testResults | Where-Object { $_.Status -eq "SUCCESS" }).Count
$partialCount = ($testResults | Where-Object { $_.Status -eq "PARTIAL" }).Count
$failedCount = ($testResults | Where-Object { $_.Status -eq "FAILED" }).Count

foreach ($result in $testResults) {
    $icon = switch ($result.Status) {
        "SUCCESS" { "✅" }
        "PARTIAL" { "⚠️ " }
        "FAILED" { "❌" }
    }

    $color = switch ($result.Status) {
        "SUCCESS" { "Green" }
        "PARTIAL" { "Yellow" }
        "FAILED" { "Red" }
    }

    Write-Host "$icon $($result.Name): $($result.Status)" -ForegroundColor $color

    if ($result.Version) {
        Write-Host "   Version: $($result.Version)" -ForegroundColor Gray
    }

    if ($result.Error) {
        Write-Host "   Error: $($result.Error)" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Results: $successCount Success, $partialCount Partial, $failedCount Failed" -ForegroundColor Cyan
Write-Host ""

# Recommendations
if ($successCount -eq 0) {
    Write-Host "❌ No RabbitMQ instances detected!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To fix:" -ForegroundColor Yellow
    Write-Host "  Option 1 (Docker): .\scripts\setup-rabbitmq.ps1 -Docker" -ForegroundColor Gray
    Write-Host "  Option 2 (Native): .\scripts\setup-rabbitmq.ps1 -Native" -ForegroundColor Gray
} elseif ($successCount -eq 1) {
    Write-Host "✅ Connection available! The application will use automatic fallback." -ForegroundColor Green
} else {
    Write-Host "✅ Multiple RabbitMQ instances detected!" -ForegroundColor Green
    Write-Host "   The application will prefer Docker, then Native Windows." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Start dev server: npm run dev" -ForegroundColor Gray
Write-Host "  2. Test health check: Invoke-RestMethod http://localhost:5175/api/rabbitmq/publish" -ForegroundColor Gray
Write-Host "  3. Start worker: node workers/case-creation-worker.mjs" -ForegroundColor Gray
Write-Host ""
