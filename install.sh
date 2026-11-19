#!/bin/sh
# omcp installer — downloads a prebuilt binary from GitHub Releases.
set -eu

REPO="${OMCP_REPO:-muhnazih029/omcp}"
INSTALL_DIR="${OMCP_INSTALL_DIR:-${HOME}/.local/bin}"

if [ -n "${OMCP_BASE_URL:-}" ]; then
  BASE_URL="$OMCP_BASE_URL"
elif [ -n "${OMCP_VERSION:-}" ]; then
  BASE_URL="https://github.com/${REPO}/releases/download/v${OMCP_VERSION}"
else
  BASE_URL="https://github.com/${REPO}/releases/latest/download"
fi

fail() {
  echo "omcp: $1" >&2
  exit 1
}

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) fail "unsupported operating system: $(uname -s) (Linux and macOS only)" ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) fail "unsupported architecture: $(uname -m)" ;;
esac

asset="omcp-${os}-${arch}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

download() {
  url=$1
  dest=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url"
  else
    fail "curl or wget is required"
  fi
}

echo "Downloading ${asset}…"
download "${BASE_URL}/${asset}" "${tmp}/${asset}" || fail "could not download ${asset} from ${BASE_URL}"

if download "${BASE_URL}/SHA256SUMS" "${tmp}/SHA256SUMS" 2>/dev/null; then
  expected=$(awk -v name="$asset" '$2 == name { print $1; exit }' "${tmp}/SHA256SUMS")
  if [ -n "$expected" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
      actual=$(sha256sum "${tmp}/${asset}" | awk '{ print $1 }')
    elif command -v shasum >/dev/null 2>&1; then
      actual=$(shasum -a 256 "${tmp}/${asset}" | awk '{ print $1 }')
    fi
    if [ -n "${actual:-}" ] && [ "$expected" != "$actual" ]; then
      fail "checksum mismatch for ${asset}"
    fi
  fi
else
  echo "omcp: checksum file unavailable, skipping verification" >&2
fi

[ -d "$INSTALL_DIR" ] || mkdir -p "$INSTALL_DIR" || fail "cannot create $INSTALL_DIR"
[ -w "$INSTALL_DIR" ] || fail "$INSTALL_DIR is not writable (set OMCP_INSTALL_DIR to another directory)"

install -m 0755 "${tmp}/${asset}" "${INSTALL_DIR}/omcp"
echo "Installed ${INSTALL_DIR}/omcp"

version=$("${INSTALL_DIR}/omcp" version 2>/dev/null || true)
[ -n "$version" ] && echo "$version"

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*)
    echo "Run \`omcp\` to get started."
    ;;
  *)
    echo "Add it to your PATH:"
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    ;;
esac
