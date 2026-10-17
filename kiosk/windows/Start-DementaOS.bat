@echo off
rem Opens Dementa OS full screen (kiosk mode) with no browser bars.
rem To leave kiosk mode press Alt+F4.

rem ---- Change this to your Dementa OS address ----
set "DEMENTA_URL=https://practices-surprising-enjoy-corrected.trycloudflare.com"
rem -------------------------------------------------

rem Separate browser profile so kiosk mode works even if the browser is already open.
set "PROFILE=%LOCALAPPDATA%\DementaOS\browser-profile"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if exist "%CHROME%" (
  start "" "%CHROME%" --kiosk "%DEMENTA_URL%" --user-data-dir="%PROFILE%" --no-first-run --disable-session-crashed-bubble --overscroll-history-navigation=0
  exit /b
)

rem Microsoft Edge is built into Windows 10 and 11.
start "" msedge --kiosk "%DEMENTA_URL%" --edge-kiosk-type=fullscreen --user-data-dir="%PROFILE%" --no-first-run
