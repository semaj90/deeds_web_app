@echo off
echo ============================================
echo Gemma 3 12B Training Package Preparation
echo ============================================
echo.

echo Step 1: Verifying COLAB_PACKAGE contents...
echo.

cd /d "%~dp0COLAB_PACKAGE"

echo Files in package:
dir /b
echo.

echo Training datasets:
dir /b training-datasets
echo.

echo Step 2: Package verification...
powershell -Command "& {$files = Get-ChildItem -Recurse -File; $size = ($files | Measure-Object -Property Length -Sum).Sum / 1MB; Write-Host 'Total files:' $files.Count; Write-Host 'Total size:' ([math]::Round($size, 2)) 'MB'}"
echo.

echo Step 3: Creating ZIP archive...
echo This will create COLAB_PACKAGE.zip in the parent directory...
echo.

cd ..
powershell -Command "Compress-Archive -Path 'COLAB_PACKAGE' -DestinationPath 'COLAB_PACKAGE.zip' -Force"

if exist COLAB_PACKAGE.zip (
    echo.
    echo ============================================
    echo SUCCESS! Package created successfully!
    echo ============================================
    echo.
    echo File: COLAB_PACKAGE.zip
    powershell -Command "& {$size = (Get-Item 'COLAB_PACKAGE.zip').Length / 1MB; Write-Host 'Size:' ([math]::Round($size, 2)) 'MB'}"
    echo Location: %CD%\COLAB_PACKAGE.zip
    echo.
    echo NEXT STEPS:
    echo 1. Upload COLAB_PACKAGE.zip to Google Drive
    echo 2. Go to https://colab.research.google.com/
    echo 3. File - Open notebook - Google Drive
    echo 4. Select Gemma3_12B_Legal_Production.ipynb
    echo 5. Runtime - Change runtime type - A100 GPU
    echo 6. Run all cells
    echo.
    echo Training time: 4-6 hours
    echo Cost: ~$10-15 (Colab Pro+ A100)
    echo.
) else (
    echo.
    echo ERROR: Failed to create ZIP file
    echo.
    echo Manual alternative:
    echo 1. Right-click on COLAB_PACKAGE folder
    echo 2. Send to - Compressed (zipped) folder
    echo.
)

pause
