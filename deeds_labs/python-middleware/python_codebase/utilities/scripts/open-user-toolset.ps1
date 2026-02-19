param(
  [string]$UserPromptPath = "$env:APPDATA\Code\User\prompts\1st.toolsets.jsonc"
)

if (-Not (Test-Path $UserPromptPath)) {
  Write-Host "User toolset file not found:" $UserPromptPath -ForegroundColor Yellow
  Write-Host "Please open VS Code user prompts folder and repair or remove the incomplete JSON." -ForegroundColor Yellow
  exit 1
}

Write-Host "Opening user toolset file for inspection:" $UserPromptPath
Start-Process -FilePath "notepad.exe" -ArgumentList $UserPromptPath
