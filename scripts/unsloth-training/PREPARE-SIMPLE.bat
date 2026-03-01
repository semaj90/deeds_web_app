@echo off
echo.
echo Creating COLAB_PACKAGE.zip...
echo.

cd /d "%~dp0"

tar -a -c -f COLAB_PACKAGE.zip COLAB_PACKAGE

if exist COLAB_PACKAGE.zip (
    echo.
    echo SUCCESS! Created COLAB_PACKAGE.zip
    echo.
    echo Location: %CD%\COLAB_PACKAGE.zip
    echo.
    dir COLAB_PACKAGE.zip
    echo.
    echo NEXT: Upload this file to Google Drive
    echo.
) else (
    echo.
    echo Failed to create ZIP.
    echo.
    echo MANUAL METHOD:
    echo 1. Right-click on COLAB_PACKAGE folder
    echo 2. Send to -^> Compressed (zipped) folder
    echo.
)

pause
