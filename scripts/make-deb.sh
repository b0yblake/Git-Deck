#!/usr/bin/env bash
# Wraps release/linux-unpacked into a .deb with dpkg-deb alone. electron-builder's
# own deb target downloads fpm from GitHub, which fails behind TLS inspection.
set -euo pipefail

version=$(node -p "require('./package.json').version")
output="release/GitDeck-${version}-amd64.deb"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
chmod 755 "$stage"

mkdir -p "$stage/DEBIAN" "$stage/opt" "$stage/usr/bin" \
  "$stage/usr/share/applications" "$stage/usr/share/pixmaps"

cp -r --no-preserve=ownership release/linux-unpacked "$stage/opt/GitDeck"
# Ubuntu 24.04 restricts unprivileged user namespaces, so Chromium falls back to
# this helper and aborts at launch unless it is setuid root.
chmod 4755 "$stage/opt/GitDeck/chrome-sandbox"
ln -s /opt/GitDeck/gitdeck "$stage/usr/bin/gitdeck"
cp build/icon.png "$stage/usr/share/pixmaps/gitdeck.png"

cat > "$stage/usr/share/applications/gitdeck.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=GitDeck
Comment=Terminal workspace manager
Exec=/opt/GitDeck/gitdeck %U
Icon=gitdeck
Terminal=false
Categories=Development;
EOF

cat > "$stage/DEBIAN/control" <<EOF
Package: gitdeck
Version: ${version}
Architecture: amd64
Maintainer: GitDeck <noreply@gitdeck.invalid>
Section: devel
Priority: optional
Depends: libgtk-3-0t64 | libgtk-3-0, libnss3, libgbm1, libasound2t64 | libasound2, iproute2
Description: Project-aware terminal workspace manager for developers
EOF

dpkg-deb --root-owner-group --build "$stage" "$output"
