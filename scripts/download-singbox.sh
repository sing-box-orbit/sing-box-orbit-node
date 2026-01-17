#!/bin/bash

# Download sing-box binary for local development
# Usage: ./scripts/download-singbox.sh

set -e

# Get latest version from GitHub API if not specified
if [ -z "$SINGBOX_VERSION" ]; then
    echo "Fetching latest sing-box version..."
    VERSION=$(curl -s https://api.github.com/repos/SagerNet/sing-box/releases/latest | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')
    if [ -z "$VERSION" ]; then
        echo "Failed to fetch latest version, falling back to 1.10.0"
        VERSION="1.10.0"
    fi
else
    VERSION="$SINGBOX_VERSION"
fi

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture
case "$ARCH" in
    x86_64)
        ARCH="amd64"
        ;;
    aarch64|arm64)
        ARCH="arm64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

# Map OS
case "$OS" in
    darwin)
        OS="darwin"
        ;;
    linux)
        OS="linux"
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$PROJECT_DIR/bin"
FILENAME="sing-box-${VERSION}-${OS}-${ARCH}"
URL="https://github.com/SagerNet/sing-box/releases/download/v${VERSION}/${FILENAME}.tar.gz"

echo "Downloading sing-box v${VERSION} for ${OS}-${ARCH}..."
echo "URL: $URL"

# Create bin directory
mkdir -p "$BIN_DIR"

# Download and extract
curl -L "$URL" -o "/tmp/${FILENAME}.tar.gz"
tar -xzf "/tmp/${FILENAME}.tar.gz" -C /tmp
mv "/tmp/${FILENAME}/sing-box" "$BIN_DIR/sing-box"
chmod +x "$BIN_DIR/sing-box"

# Cleanup
rm -rf "/tmp/${FILENAME}" "/tmp/${FILENAME}.tar.gz"

echo "sing-box installed to $BIN_DIR/sing-box"
"$BIN_DIR/sing-box" version
