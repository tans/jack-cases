#!/usr/bin/env bash
# fill-protocol — environment setup
#
# Verifies and (optionally) installs the dependencies required by fill-protocol:
#   - LibreOffice (only required for .doc → .docx conversion of legacy templates)
#   - Python packages: docxtpl, python-docx, pyyaml
#
# Usage:
#   bash setup.sh check         # report what is/isn't installed, do nothing
#   bash setup.sh install       # install everything that's missing (asks before each step)
#   bash setup.sh install --yes # install without prompting (for CI / Claude auto-install)
#   bash setup.sh               # equivalent to `check`

ACTION="${1:-check}"
AUTO_YES=false
[[ "${2:-}" == "--yes" ]] && AUTO_YES=true

# ---------- helpers ----------

prompt_yn() {
    if $AUTO_YES; then return 0; fi
    read -r -p "$1 [y/N] " answer
    [[ "$answer" =~ ^[Yy]$ ]]
}

detect_os() {
    case "$(uname -s)" in
        Darwin)  echo "macos" ;;
        Linux)
            if command -v apt-get >/dev/null 2>&1; then echo "debian"
            elif command -v dnf     >/dev/null 2>&1; then echo "fedora"
            elif command -v pacman  >/dev/null 2>&1; then echo "arch"
            else echo "linux-unknown"; fi
            ;;
        *) echo "unsupported" ;;
    esac
}

find_soffice() {
    for path in \
        "/Applications/LibreOffice.app/Contents/MacOS/soffice" \
        "/usr/bin/soffice" \
        "/opt/homebrew/bin/soffice"; do
        if [[ -x "$path" ]]; then echo "$path"; return 0; fi
    done
    if command -v soffice >/dev/null 2>&1; then
        command -v soffice; return 0
    fi
    return 1
}

# ---------- check ----------

OS=$(detect_os)
echo "Detected OS: $OS"
echo

# 1. LibreOffice
SOFFICE=$(find_soffice || true)
if [[ -n "$SOFFICE" ]]; then
    VER=$("$SOFFICE" --version 2>&1 | head -1 || echo "?")
    echo "✅ LibreOffice: $SOFFICE"
    echo "   $VER"
    SOFFICE_OK=true
else
    echo "❌ LibreOffice: not installed"
    echo "   (Only required for .doc → .docx conversion. .docx templates work without it.)"
    SOFFICE_OK=false
fi

# 2. Python packages
PYBIN="${PYTHON:-python3}"
echo
echo "Python: $($PYBIN --version 2>&1)"

PY_MISSING=()
for pkg in docx docxtpl yaml; do
    if $PYBIN -c "import $pkg" 2>/dev/null; then
        echo "✅ $pkg"
    else
        echo "❌ $pkg"
        PY_MISSING+=("$pkg")
    fi
done

# Map import-name → pip-name (function form for bash 3.2 compatibility — macOS default)
pipname_for() {
    case "$1" in
        docx)    echo "python-docx" ;;
        docxtpl) echo "docxtpl"    ;;
        yaml)    echo "pyyaml"     ;;
        *)       echo "$1"         ;;
    esac
}

if [[ "$ACTION" == "check" ]]; then
    echo
    if $SOFFICE_OK && [[ ${#PY_MISSING[@]} -eq 0 ]]; then
        echo "All dependencies present."
        exit 0
    else
        echo "Run \`bash setup.sh install\` to install missing dependencies."
        exit 1
    fi
fi

# ---------- install ----------

if [[ "$ACTION" != "install" ]]; then
    echo "Unknown action: $ACTION (use 'check' or 'install')"
    exit 2
fi

# Install LibreOffice if missing
if ! $SOFFICE_OK; then
    case "$OS" in
        macos)
            CMD="brew install --cask libreoffice"
            ;;
        debian)
            CMD="sudo apt-get install -y libreoffice"
            ;;
        fedora)
            CMD="sudo dnf install -y libreoffice"
            ;;
        arch)
            CMD="sudo pacman -S --needed libreoffice-fresh"
            ;;
        *)
            echo "❌ Cannot auto-install LibreOffice on $OS — install manually."
            exit 3
            ;;
    esac
    echo
    echo "About to install LibreOffice (~700 MB):"
    echo "  $CMD"
    if prompt_yn "Proceed?"; then
        eval "$CMD"
    else
        echo "Skipped LibreOffice install."
    fi
fi

# Install Python packages if missing
if [[ ${#PY_MISSING[@]} -gt 0 ]]; then
    PIP_PKGS=""
    for m in "${PY_MISSING[@]}"; do PIP_PKGS="$PIP_PKGS $(pipname_for "$m")"; done
    PIP_CMD="$PYBIN -m pip install --user --break-system-packages$PIP_PKGS"
    echo
    echo "About to install Python packages:"
    echo "  $PIP_CMD"
    if prompt_yn "Proceed?"; then
        eval "$PIP_CMD"
    else
        echo "Skipped Python package install."
    fi
fi

echo
echo "Re-running check…"
echo
exec bash "$0" check
