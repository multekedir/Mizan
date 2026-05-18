#Requires -Version 5.1
<#
.SYNOPSIS
  Mizan Windows helper — install, dev, and deploy without Make or Bash.

.EXAMPLE
  .\scripts\windows\mizan.ps1 install
  .\scripts\windows\mizan.ps1 dev
  .\scripts\windows\mizan.ps1 dev-ui
  .\scripts\windows\mizan.ps1 start
  .\scripts\windows\mizan.ps1 stop
#>
param(
    [Parameter(Position = 0)]
    [ValidateSet('help', 'install', 'build', 'dev', 'dev-ui', 'start', 'start-backend', 'start-frontend', 'stop')]
    [string]$Command = 'help',

    [int]$BackendPort = $(if ($env:BACKEND_PORT) { [int]$env:BACKEND_PORT } else { 8000 }),
    [int]$ServePort = $(if ($env:SERVE_PORT) { [int]$env:SERVE_PORT } else { 3000 }),
    [int]$VitePort = $(if ($env:VITE_PORT) { [int]$env:VITE_PORT } else { 5173 }),
    [string]$BackendHost = $(if ($env:BACKEND_HOST) { $env:BACKEND_HOST } else { '127.0.0.1' })
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BackendDir = Join-Path $Root 'backend'
$FrontendLog = Join-Path $Root '.frontend.log'
$BackendLog = Join-Path $Root '.backend.log'
$FrontendPidFile = Join-Path $Root '.frontend.pid'
$BackendPidFile = Join-Path $Root '.backend.pid'

function Write-Info([string]$Message) { Write-Host "[mizan] $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[mizan] $Message" -ForegroundColor Yellow }
function Write-Err([string]$Message) { Write-Host "[mizan] $Message" -ForegroundColor Red }

function Assert-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Err "$Name was not found. $Hint"
        exit 1
    }
}

function Get-PythonExe {
    foreach ($candidate in @('python', 'py', 'python3')) {
        if (-not (Get-Command $candidate -ErrorAction SilentlyContinue)) { continue }
        if ($candidate -eq 'py') {
            try {
                $version = & py -3 -c "import sys; print(sys.version_info[:2])" 2>$null
                if ($LASTEXITCODE -eq 0) { return @{ Exe = 'py'; Args = @('-3') } }
            } catch { continue }
        } else {
            try {
                & $candidate -c "import sys" 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) { return @{ Exe = $candidate; Args = @() } }
            } catch { continue }
        }
    }
    return $null
}

function Invoke-Python {
    param([hashtable]$Python, [string[]]$ScriptArgs)
    $all = @($Python.Args + $ScriptArgs)
    & $Python.Exe @all
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Python command failed (exit $LASTEXITCODE)" }
}

function Get-VenvPython {
    $venvPy = Join-Path $BackendDir '.venv\Scripts\python.exe'
    if (Test-Path $venvPy) { return $venvPy }
    return $null
}

function Test-VenvHealthy([string]$VenvPython) {
    if (-not (Test-Path $VenvPython)) { return $false }
    try {
        & $VenvPython -c "import sys" 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Ensure-BackendVenv([hashtable]$Python, [switch]$Quiet) {
    $venvDir = Join-Path $BackendDir '.venv'
    $venvPy = Join-Path $venvDir 'Scripts\python.exe'

    if ((Test-Path $venvDir) -and -not (Test-VenvHealthy $venvPy)) {
        Write-Warn 'Stale virtual environment detected — recreating...'
        Remove-Item -Recurse -Force $venvDir
    }

    if (-not (Test-Path $venvDir)) {
        Write-Info 'Creating Python virtual environment...'
        Invoke-Python $Python @('-m', 'venv', $venvDir)
    }

    $pipArgs = @('-m', 'pip', 'install', '--upgrade', 'pip')
    if ($Quiet) { $pipArgs += '-q' }
    & $venvPy @pipArgs
    if ($LASTEXITCODE -ne 0) { throw 'pip upgrade failed' }

    $reqArgs = @('-m', 'pip', 'install')
    if ($Quiet) { $reqArgs += '-q' }
    $reqArgs += '-r', (Join-Path $BackendDir 'requirements.txt')
    & $venvPy @reqArgs
    if ($LASTEXITCODE -ne 0) { throw 'pip install requirements failed' }

    New-Item -ItemType Directory -Force -Path (Join-Path $BackendDir 'data') | Out-Null
    return $venvPy
}

function Stop-ProcessByPidFile([string]$PidFile, [string]$Label) {
    if (-not (Test-Path $PidFile)) { return }
    $storedPid = Get-Content -Raw $PidFile | ForEach-Object { $_.Trim() }
    if ($storedPid -match '^\d+$') {
        $proc = Get-Process -Id ([int]$storedPid) -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Info "Stopping $Label (PID $storedPid)..."
            Stop-Process -Id ([int]$storedPid) -Force -ErrorAction SilentlyContinue
        } else {
            Write-Warn "$Label was not running."
        }
    }
    Remove-Item -Force $PidFile -ErrorAction SilentlyContinue
}

function Stop-ListenersOnPort([int]$Port) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $connections) {
            $procId = $conn.OwningProcess
            if ($procId -and $procId -gt 0) {
                Write-Warn "Port $Port is in use; stopping PID $procId..."
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        # Get-NetTCPConnection may be unavailable; ignore.
    }
}

function Wait-ForUrl {
    param(
        [string]$Url,
        [string]$Label,
        [string]$LogFile,
        [switch]$Fatal
    )
    Write-Info "Waiting for $Label..."
    for ($i = 1; $i -le 20; $i++) {
        try {
            $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            Write-Info "$Label is healthy."
            return
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if ($Fatal) {
        Write-Err "$Label did not respond after 20s. See $LogFile"
        exit 1
    }
    Write-Warn "$Label did not respond after 20s. Check $LogFile"
}

function Show-Help {
    Write-Host ''
    Write-Host '  Mizan (Windows)'
    Write-Host ''
    Write-Host '  Ports (override: $env:BACKEND_PORT=8001; .\mizan.ps1 dev)'
    Write-Host "    Frontend (dev)   $VitePort     dev-ui"
    Write-Host "    Frontend (prod)  $ServePort     start"
    Write-Host "    Backend (API)    $BackendPort     dev"
    Write-Host ''
    Write-Host '  Commands'
    Write-Host '    install          npm ci + Python venv + pip deps'
    Write-Host '    build            npm run build'
    Write-Host "    dev              API on :$BackendPort (foreground, reload)"
    Write-Host "    dev-ui           Vite UI on :$VitePort (foreground)"
    Write-Host '    start            build + run UI + API (background)'
    Write-Host '    start-backend    API only (background)'
    Write-Host '    start-frontend   UI only (background)'
    Write-Host '    stop             stop background UI + API'
    Write-Host ''
    Write-Host '  Examples'
    Write-Host '    .\scripts\windows\mizan.ps1 install'
    Write-Host '    .\scripts\windows\mizan.ps1 dev          # terminal 1'
    Write-Host '    .\scripts\windows\mizan.ps1 dev-ui       # terminal 2'
    Write-Host '    .\scripts\windows\mizan.ps1 start'
    Write-Host ''
}

function Invoke-Install {
    Assert-Command 'node' 'Install Node.js LTS from https://nodejs.org/'
    Assert-Command 'npm' 'npm ships with Node.js — reinstall Node.js if missing.'

    $python = Get-PythonExe
    if (-not $python) {
        Write-Err 'Python 3.11+ not found. Install from https://www.python.org/downloads/windows/ and check "Add python.exe to PATH".'
        exit 1
    }

    Write-Info "Node $(node --version) / npm $(npm --version)"
    $pyVerArgs = $python.Args + @('-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    $pyVer = (& $python.Exe @pyVerArgs | Select-Object -Last 1).ToString().Trim()
    Write-Info "Python $pyVer"

    Push-Location $Root
    try {
        Write-Info 'Installing frontend dependencies (npm ci)...'
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

        Write-Info 'Setting up backend virtual environment...'
        Ensure-BackendVenv $python -Quiet

        $envExample = Join-Path $Root '.env.example'
        $envLocal = Join-Path $Root '.env.local'
        if ((Test-Path $envExample) -and -not (Test-Path $envLocal)) {
            Copy-Item $envExample $envLocal
            Write-Info 'Created .env.local from .env.example'
        }

        Write-Info 'Installation complete.'
        Write-Host ''
        Write-Host '  Next: open two terminals'
        Write-Host "    1) .\scripts\windows\mizan.ps1 dev      →  http://${BackendHost}:$BackendPort"
        Write-Host "    2) .\scripts\windows\mizan.ps1 dev-ui   →  http://localhost:$VitePort"
        Write-Host ''
    } finally {
        Pop-Location
    }
}

function Invoke-Build {
    Assert-Command 'npm' 'Run install first.'
    Push-Location $Root
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
    } finally {
        Pop-Location
    }
}

function Invoke-DevBackend {
    $python = Get-PythonExe
    if (-not $python) {
        Write-Err 'Python not found. Run: .\scripts\windows\mizan.ps1 install'
        exit 1
    }

    $venvPy = Ensure-BackendVenv $python -Quiet
    Push-Location $BackendDir
    try {
        Write-Host ''
        Write-Host "  Listening on port $BackendPort"
        Write-Host "  Mizan API  →  http://${BackendHost}:$BackendPort"
        Write-Host "  Health     →  http://${BackendHost}:$BackendPort/health"
        Write-Host "  Mizan UI   →  http://localhost:$VitePort  (mizan.ps1 dev-ui)"
        Write-Host "               http://localhost:$ServePort  (mizan.ps1 start)"
        Write-Host ''
        & $venvPy -m uvicorn main:app --reload --host $BackendHost --port $BackendPort
    } finally {
        Pop-Location
    }
}

function Invoke-DevUi {
    Assert-Command 'npm' 'Run install first.'
    Push-Location $Root
    try {
        $env:VITE_PORT = "$VitePort"
        Write-Host ''
        Write-Host "  Listening on port $VitePort"
        Write-Host "  Mizan UI  →  http://localhost:$VitePort"
        Write-Host "  (API: run mizan.ps1 dev in another terminal on port $BackendPort)"
        Write-Host ''
        npm run dev -- --port $VitePort
    } finally {
        Pop-Location
    }
}

function Invoke-Deploy {
    param(
        [bool]$DoFrontend = $true,
        [bool]$DoBackend = $true
    )

    Assert-Command 'node' 'Install Node.js LTS from https://nodejs.org/'
    Assert-Command 'npm' 'npm ships with Node.js.'

    $python = Get-PythonExe
    if ($DoBackend -and -not $python) {
        Write-Err 'Python not found. Run: .\scripts\windows\mizan.ps1 install'
        exit 1
    }

    Write-Host ''
    Write-Host '  Ports'
    if ($DoFrontend) { Write-Host "    UI (frontend, port $ServePort)  →  http://${BackendHost}:$ServePort" }
    if ($DoBackend) { Write-Host "    API (backend)  →  http://${BackendHost}:$BackendPort" }
    Write-Host ''

    Stop-ProcessByPidFile $FrontendPidFile 'frontend'
    Stop-ProcessByPidFile $BackendPidFile 'backend'

    if ($DoFrontend) {
        Push-Location $Root
        try {
            Write-Info 'Installing frontend dependencies...'
            npm ci --silent
            if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

            Write-Info 'Installing serve...'
            npm install --silent --no-audit --no-save serve
            if ($LASTEXITCODE -ne 0) { throw 'npm install serve failed' }

            $env:VITE_ASSISTANT_URL = "http://${BackendHost}:$BackendPort"
            Write-Info 'Building frontend...'
            npm run build
            if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }

            $serve = Join-Path $Root 'node_modules\.bin\serve.cmd'
            if (-not (Test-Path $serve)) { $serve = Join-Path $Root 'node_modules\.bin\serve' }
            if (-not (Test-Path $serve)) { throw "serve not found at $serve" }

            Stop-ListenersOnPort $ServePort
            if (Test-Path $FrontendLog) { Remove-Item $FrontendLog -Force }

            Write-Info "Starting frontend on port $ServePort..."
            $listen = "tcp://${BackendHost}:$ServePort"
            $proc = Start-Process -FilePath $serve -ArgumentList @('-s', 'dist', '-l', $listen) `
                -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
                -RedirectStandardOutput $FrontendLog -RedirectStandardError $FrontendLog
            $proc.Id | Out-File -FilePath $FrontendPidFile -Encoding ascii -NoNewline
            Write-Info "Frontend PID $($proc.Id) → http://${BackendHost}:$ServePort"
            Start-Sleep -Seconds 1
            if ($proc.HasExited) {
                Write-Err "Frontend failed to start. See $FrontendLog"
                exit 1
            }
        } finally {
            Pop-Location
        }
    }

    if ($DoBackend) {
        $venvPy = Ensure-BackendVenv $python -Quiet
        Push-Location $BackendDir
        try {
            if (Get-Command 'ollama' -ErrorAction SilentlyContinue) {
                Write-Info "Ollama: $(ollama --version 2>$null)"
            } else {
                Write-Warn 'ollama not found in PATH — AI responses will fail until Ollama is installed.'
            }

            Stop-ListenersOnPort $BackendPort
            if (Test-Path $BackendLog) { Remove-Item $BackendLog -Force }

            Write-Info "Starting backend on port $BackendPort..."
            $proc = Start-Process -FilePath $venvPy -ArgumentList @(
                '-m', 'uvicorn', 'main:app',
                '--host', $BackendHost,
                '--port', "$BackendPort"
            ) -WorkingDirectory $BackendDir -WindowStyle Hidden -PassThru `
                -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendLog
            $proc.Id | Out-File -FilePath $BackendPidFile -Encoding ascii -NoNewline
            Write-Info "Backend PID $($proc.Id) → http://${BackendHost}:$BackendPort"
            Start-Sleep -Seconds 1
            if ($proc.HasExited) {
                Write-Err "Backend failed to start. See $BackendLog"
                exit 1
            }
        } finally {
            Pop-Location
        }
    }

    if ($DoFrontend) {
        Wait-ForUrl -Url "http://${BackendHost}:$ServePort" -Label 'frontend' -LogFile $FrontendLog
    }
    if ($DoBackend) {
        Wait-ForUrl -Url "http://${BackendHost}:$BackendPort/health" -Label 'backend' -LogFile $BackendLog -Fatal
    }

    Write-Host ''
    Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Green
    Write-Host ' Mizan is running' -ForegroundColor Green
    Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Green
    if ($DoFrontend) { Write-Host "  UI on port $ServePort  →  http://${BackendHost}:$ServePort  (log: $FrontendLog)" }
    if ($DoBackend) { Write-Host "  API on port $BackendPort  →  http://${BackendHost}:$BackendPort  (log: $BackendLog)" }
    Write-Host '  Stop      →  .\scripts\windows\mizan.ps1 stop'
    Write-Host ''
}

switch ($Command) {
    'help' { Show-Help }
    'install' { Invoke-Install }
    'build' { Invoke-Build }
    'dev' { Invoke-DevBackend }
    'dev-ui' { Invoke-DevUi }
    'start' { Invoke-Deploy -DoFrontend $true -DoBackend $true }
    'start-backend' { Invoke-Deploy -DoFrontend $false -DoBackend $true }
    'start-frontend' { Invoke-Deploy -DoFrontend $true -DoBackend $false }
    'stop' {
        Write-Info 'Stopping Mizan processes...'
        Stop-ProcessByPidFile $FrontendPidFile 'frontend'
        Stop-ProcessByPidFile $BackendPidFile 'backend'
        Write-Info 'Stopped.'
    }
    default { Show-Help }
}
