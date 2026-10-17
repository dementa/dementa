@echo off
rem Stops Dementa OS opening automatically when Windows starts.

del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Start-DementaOS.bat" 2>nul
echo Dementa OS will no longer open automatically at startup.
pause
