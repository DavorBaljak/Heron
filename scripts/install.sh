#!/usr/bin/env bash
# Heron installer for Linux/macOS. Safe to re-run — every step is skipped if
# already done. Only real dependency this script assumes is a POSIX shell;
# it brings up Docker itself rather than requiring it pre-installed.
set -euo pipefail

cd "$(dirname "$0")/.."

DC="docker compose"

info()  { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
warn()  { printf '\033[1;33m!! %s\033[0m\n' "$1"; }
die()   { printf '\033[1;31mError: %s\033[0m\n' "$1" >&2; exit 1; }

# --- 1. Docker: check, install if missing, start if not running -----------

install_docker_linux() {
    warn "Docker not found. Installing it via Docker's official convenience script (requires sudo)."
    read -r -p "Proceed with 'curl -fsSL https://get.docker.com | sudo sh'? [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]] || die "Docker is required — install it manually and re-run this script."
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER" || true
    warn "Added $USER to the docker group — if 'docker info' still needs sudo below, that's expected until you log out/in; this script falls back to sudo automatically."
}

ensure_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        case "$(uname -s)" in
            Linux) install_docker_linux ;;
            Darwin) die "Docker not found. Install Docker Desktop for Mac (https://www.docker.com/products/docker-desktop/), start it, then re-run this script." ;;
            *) die "Docker not found. Install Docker for your OS and re-run this script." ;;
        esac
    fi

    if docker info >/dev/null 2>&1; then
        return
    fi

    case "$(uname -s)" in
        Linux)
            info "Starting the Docker daemon..."
            sudo systemctl enable --now docker 2>/dev/null || sudo service docker start 2>/dev/null || true
            sleep 2
            if docker info >/dev/null 2>&1; then
                return
            fi
            if sudo docker info >/dev/null 2>&1; then
                warn "Docker only responds via sudo right now (group membership needs a fresh login). Using sudo for the rest of this script."
                DC="sudo docker compose"
                return
            fi
            die "Could not start the Docker daemon. Try rebooting or starting it manually, then re-run this script."
            ;;
        Darwin)
            die "Docker Desktop is installed but not running. Start it from Applications, wait for it to finish starting, then re-run this script."
            ;;
    esac
}

info "Checking Docker"
ensure_docker
echo "Docker is ready ($($DC version --short 2>/dev/null || echo OK))."

# --- 2. .env: Anthropic API key --------------------------------------------

if [[ ! -f .env ]]; then
    info "Setting up .env"
    cp .env.example .env
    read -r -p "Enter your Anthropic API key: " api_key
    [[ -n "$api_key" ]] || die "An Anthropic API key is required."
    # Portable in-place sed (no -i suffix quirk between GNU/BSD sed).
    sed "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$api_key|" .env > .env.tmp && mv .env.tmp .env
    echo "Saved to .env."
else
    info ".env already exists — skipping Anthropic key prompt (delete .env to redo this)."
fi

# --- 3. Build images (no loxone-mock — this is for a real Miniserver) -----

info "Building Heron images (this can take a few minutes the first time)"
$DC build heron-agent gateway dashboard

# --- 4/5. Loxone connection setup (agent + gateway + dashboard, separate configs) --

if [[ ! -f ./data/agent/loxone-config.json ]]; then
    info "Loxone connection setup — agent"
    $DC run --rm heron-agent node packages/agent/dist/setup.js
else
    info "Agent's Loxone connection already configured — skipping (delete data/agent/loxone-config.json to redo)."
fi

if [[ ! -f ./data/gateway/loxone-config.json ]]; then
    info "Loxone connection setup — gateway"
    $DC run --rm -e HERON_LOXONE_CONFIG_PATH=/app/packages/gateway/data/loxone-config.json gateway node packages/agent/dist/setup.js
else
    info "Gateway's Loxone connection already configured — skipping (delete data/gateway/loxone-config.json to redo)."
fi

if [[ ! -f ./data/dashboard/loxone-config.json ]]; then
    info "Loxone connection setup — dashboard"
    $DC run --rm -e HERON_LOXONE_CONFIG_PATH=/app/packages/dashboard/data/loxone-config.json dashboard node packages/agent/dist/setup.js
else
    info "Dashboard's Loxone connection already configured — skipping (delete data/dashboard/loxone-config.json to redo)."
fi

# --- 6. Start ---------------------------------------------------------------

info "Starting Heron"
$DC up -d heron-agent gateway dashboard

# --- 7. Print what the phone/browser need -----------------------------------

info "Done"
lan_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
[[ -n "$lan_ip" ]] || lan_ip=$(ipconfig getifaddr en0 2>/dev/null || echo "<this-machine's-LAN-IP>")
echo "Gateway address for the Android app: ${lan_ip}:8190"
echo "Dashboard: http://${lan_ip}:8191"
echo
echo "Pairing token:"
$DC logs gateway 2>&1 | grep -A1 "Pairing token" | tail -2
