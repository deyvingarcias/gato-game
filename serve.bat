@echo off
echo Starting SquishPets dev server...
echo Open: http://localhost:3000
echo Press Ctrl+C to stop.
echo.

python -m http.server 3000 2>nul
if %errorlevel% neq 0 (
  python3 -m http.server 3000 2>nul
  if %errorlevel% neq 0 (
    echo Python not found. Trying Node...
    npx serve . --listen 3000
  )
)
