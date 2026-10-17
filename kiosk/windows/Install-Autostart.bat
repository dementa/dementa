@echo off
rem Makes Dementa OS open full screen every time this user signs in to Windows.
rem Double-click to install. No administrator rights needed.

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /Y "%~dp0Start-DementaOS.bat" "%STARTUP%\Start-DementaOS.bat" >nul

if errorlevel 1 (
  echo Could not install. Make sure Start-DementaOS.bat is in the same folder as this file.
) else (
  echo Done! Dementa OS will now open full screen when Windows starts.
  echo To remove it, run Uninstall-Autostart.bat
)
pause
