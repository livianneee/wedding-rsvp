#!/usr/bin/env bash
# Downloads the design's images from Figma into ./assets
# Figma's asset links EXPIRE around 7 October 2026. Run this before then.
# Usage (from this folder):  bash fetch-assets.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p assets

C="https://www.figma.com/api/mcp/asset/5b3cf7f8-284f-4695-b00a-8d21a8f48254"  # Invitation Content frame
L="https://www.figma.com/api/mcp/asset/b016a64b-fa93-4a5b-9d92-7635abf409b2"  # Landing frame

files=(
  "$L/47d91.png|bg-landing.png"
  "$L/cb6fc.png|cover-kaya-nana.png"
  "$C/06055.png|bg-content.png"
  "$C/1539c.png|swan.png"
  "$C/ea458.png|ribbon.png"
  "$C/3cd75.png|groom.png"
  "$C/1c708.png|bride.png"
  "$C/de727.png|bg-save-the-date.png"
  "$C/dfb9e.png|kaya-nana-wed.png"
  "$C/3d0d2.png|deco-42.png"
  "$C/2d480.png|deco-43.png"
  "$C/8a3f1.png|table.png"
  "$C/46786.png|bg-gift-card.png"
  "$C/80407.png|kaya-nana-closing.png"
  "$C/d215d.svg|icon-schedule.svg"
  "$C/bb776.svg|icon-content-copy.svg"
  "$C/76022.svg|icon-arrow-drop-down.svg"
)

fail=0
for entry in "${files[@]}"; do
  url="${entry%%|*}"; name="${entry##*|}"
  if curl -fsSL "$url" -o "assets/$name" && [ -s "assets/$name" ]; then
    echo "  ok   $name"
  else
    echo "  FAIL $name"; fail=1
  fi
done

[ "$fail" -eq 0 ] && echo "All assets downloaded." || { echo "Some downloads failed (links may have expired). Re-run get_design_context in Figma for fresh links."; exit 1; }
