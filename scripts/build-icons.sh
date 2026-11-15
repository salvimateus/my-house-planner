#!/usr/bin/env bash
# Rasterizes docs/images/logo.svg into the PWA icons, the Apple touch icon and the README logo.
# Needs ImageMagick (`convert`). Run from any folder: bash scripts/build-icons.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
logo="$root/docs/images/logo.svg"
bg="#B8532E"

mkdir -p "$root/public/icons"

# Transparent corners around the rounded square.
render() {
  convert -background none -density 1536 "$logo" -resize "${1}x${1}" "PNG32:$2"
}

render 192 "$root/public/icons/pwa-192.png"
render 512 "$root/public/icons/pwa-512.png"
render 256 "$root/docs/images/logo.png"

# Maskable: full-bleed brand color, the mark inside the 80% safe circle.
convert -background none -density 1536 "$logo" -resize 340x340 \
  -background "$bg" -gravity center -extent 512x512 -flatten "PNG24:$root/public/icons/maskable-512.png"

# Apple applies its own rounded mask and shows black under transparency: fill the corners.
convert -background none -density 1536 "$logo" -resize 196x196 -gravity center -crop 180x180+0+0 +repage \
  -background "$bg" -flatten "PNG24:$root/public/apple-touch-icon.png"
