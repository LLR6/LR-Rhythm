#!/usr/bin/env bash
# Dependency-free Android build with official SDK tools; requires JDK17 and SDK35.
set -euo pipefail
cd "$(dirname "$0")/.."
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
: "${SDK:?Set ANDROID_SDK_ROOT to an Android SDK containing platform 35 and build-tools 35.0.0}"
TOOLS="$SDK/build-tools/35.0.0"
PLATFORM="$SDK/platforms/android-35/android.jar"
OUT=build/direct
mkdir -p "$OUT/res" "$OUT/java" "$OUT/classes" "$OUT/dex" "$OUT/apk"
"$TOOLS/aapt2" compile --dir app/src/main/res -o "$OUT/res/resources.zip"
"$TOOLS/aapt2" link -o "$OUT/app-unsigned.apk" -I "$PLATFORM" --manifest app/src/main/AndroidManifest.xml --java "$OUT/java" --min-sdk-version 26 --target-sdk-version 35 --version-code 1 --version-name 0.1.0 -A app/src/main/assets "$OUT/res/resources.zip"
find app/src/main/java "$OUT/java" -name '*.java' -print > "$OUT/sources.txt"
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$PLATFORM:$TOOLS/core-lambda-stubs.jar" -d "$OUT/classes" @"$OUT/sources.txt"
jar cf "$OUT/classes.jar" -C "$OUT/classes" .
"$TOOLS/d8" --lib "$PLATFORM" --min-api 26 --output "$OUT/dex" "$OUT/classes.jar"
python3 - "$OUT" <<'PY'
import zipfile,sys,pathlib
out=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(out/'app-unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
    for p in sorted((out/'dex').glob('*.dex')):z.write(p,p.name)
PY
"$TOOLS/zipalign" -f 4 "$OUT/app-unsigned.apk" "$OUT/app-aligned.apk"
: "${LR_KEYSTORE_PATH:?Set LR_KEYSTORE_PATH; do not commit signing keys}"
: "${LR_KEYSTORE_PASSWORD:?Set LR_KEYSTORE_PASSWORD}"
: "${LR_KEY_ALIAS:=lr-rhythm}"
export LR_KEYSTORE_PASSWORD
"$TOOLS/apksigner" sign --ks "$LR_KEYSTORE_PATH" --ks-key-alias "$LR_KEY_ALIAS" --ks-pass env:LR_KEYSTORE_PASSWORD --key-pass env:LR_KEYSTORE_PASSWORD --out "$OUT/apk/LR-Rhythm-v0.1.0.apk" "$OUT/app-aligned.apk"
"$TOOLS/apksigner" verify --verbose "$OUT/apk/LR-Rhythm-v0.1.0.apk"
echo "APK: $PWD/$OUT/apk/LR-Rhythm-v0.1.0.apk"
