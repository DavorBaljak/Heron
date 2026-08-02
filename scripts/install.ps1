# Heron installer for Windows. Safe to re-run -- every step is skipped if
# already done. Brings up Docker Desktop itself rather than requiring it
# pre-installed; the one thing it can't fully automate is Docker Desktop's
# own first-run setup (WSL2 backend / EULA), which needs one manual click
# the very first time Docker Desktop itself is installed.

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Info($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Warn($msg)  { Write-Host "!! $msg" -ForegroundColor Yellow }
function Die($msg)   { Write-Host "Error: $msg" -ForegroundColor Red; exit 1 }

# --- 1. Docker: check, install if missing, start if not running -----------

function Test-DockerRunning {
    try { docker info *> $null; return $true } catch { return $false }
}

Info "Checking Docker"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Warn "Docker not found. Installing Docker Desktop via winget."
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Die "winget is not available. Install Docker Desktop manually from https://www.docker.com/products/docker-desktop/ and re-run this script."
    }
    winget install -e --id Docker.DockerDesktop
    Warn "Docker Desktop was just installed. It needs one manual first-run step (accepting terms / enabling the WSL2 backend) -- please launch it from the Start menu now, finish that setup, then re-run this script."
    exit 1
}

if (-not (Test-DockerRunning)) {
    Info "Docker Desktop isn't running -- starting it"
    $dockerDesktop = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktop) {
        Start-Process $dockerDesktop
    }
    $timeoutSec = 90
    $elapsed = 0
    while (-not (Test-DockerRunning) -and $elapsed -lt $timeoutSec) {
        Start-Sleep -Seconds 3
        $elapsed += 3
    }
    if (-not (Test-DockerRunning)) {
        Die "Docker Desktop didn't come up within $timeoutSec s. Start it manually from the Start menu, wait until it's ready, then re-run this script."
    }
}

Write-Host "Docker is ready."

# --- 2. .env: Anthropic API key --------------------------------------------

if (-not (Test-Path ".env")) {
    Info "Setting up .env"
    Copy-Item ".env.example" ".env"
    $apiKey = Read-Host "Enter your Anthropic API key"
    if ([string]::IsNullOrWhiteSpace($apiKey)) { Die "An Anthropic API key is required." }
    (Get-Content ".env") -replace '^ANTHROPIC_API_KEY=.*', "ANTHROPIC_API_KEY=$apiKey" | Set-Content ".env"
    Write-Host "Saved to .env."
} else {
    Info ".env already exists -- skipping Anthropic key prompt (delete .env to redo this)."
}

# --- 3. Build images (no loxone-mock -- this is for a real Miniserver) -----

Info "Building Heron images (this can take a few minutes the first time)"
docker compose build heron-agent gateway

# --- 4/5. Loxone connection setup (agent + gateway, separate configs) -----

if (-not (Test-Path "./data/agent/loxone-config.json")) {
    Info "Loxone connection setup -- agent"
    docker compose run --rm heron-agent node packages/agent/dist/setup.js
} else {
    Info "Agent's Loxone connection already configured -- skipping (delete data/agent/loxone-config.json to redo)."
}

if (-not (Test-Path "./data/gateway/loxone-config.json")) {
    Info "Loxone connection setup -- gateway"
    docker compose run --rm -e HERON_LOXONE_CONFIG_PATH=/app/packages/gateway/data/loxone-config.json gateway node packages/agent/dist/setup.js
} else {
    Info "Gateway's Loxone connection already configured -- skipping (delete data/gateway/loxone-config.json to redo)."
}

# --- 6. Start ---------------------------------------------------------------

Info "Starting Heron"
docker compose up -d heron-agent gateway

# --- 7. Print what the phone needs -----------------------------------------

Info "Done"
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback|vEthernet" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
Write-Host "Gateway address for the Android app: ${lanIp}:8190"
Write-Host ""
Write-Host "Pairing token:"
docker compose logs gateway 2>&1 | Select-String -Pattern "Pairing token" -Context 0,1
