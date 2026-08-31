#!/bin/bash
# Construit « Assistant OpenSpace.app » dans build/.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f assets/icon.icns ] || bash scripts/make-icon.sh

rm -rf build
npx @electron/packager . "Assistant OpenSpace" \
  --platform=darwin \
  --no-asar \
  --arch=arm64 \
  --icon=assets/icon.icns \
  --app-bundle-id=app.assistant-openspace \
  --app-category-type=public.app-category.productivity \
  --app-version="$(node -p "require('./package.json').version")" \
  --prune=true \
  --ignore="^/(scripts|build|assets/icon-1024\.png|assets/AppIcon\.iconset)" \
  --out=build \
  --overwrite

APP="build/Assistant OpenSpace-darwin-arm64/Assistant OpenSpace.app"

# @electron/packager ne pose plus l'icone .icns : on l'installe nous-memes.
cp assets/icon.icns "$APP/Contents/Resources/icon.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile icon" "$APP/Contents/Info.plist"
rm -f "$APP/Contents/Resources/electron.icns"

# Signature ad-hoc : obligatoire sur Apple Silicon apres modification du bundle.
codesign --force --deep --sign - "$APP"
codesign --verify --deep "$APP" && echo "signature ad-hoc OK"

echo "→ $APP"
