#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BACKEND_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
MAPS_DIR="$BACKEND_DIR/maps"
PBF_PATH="${1:-$MAPS_DIR/cambodia-latest.osm.pbf}"
OUTPUT_PATH="${2:-$MAPS_DIR/cambodia.pmtiles}"

if [ ! -s "$PBF_PATH" ]; then
  echo "PBF input is missing or empty: $PBF_PATH" >&2
  exit 1
fi

case "$(realpath -- "$PBF_PATH")" in
  "$MAPS_DIR"/*) ;;
  *)
    echo "PBF input must be inside $MAPS_DIR" >&2
    exit 1
    ;;
esac

case "$(realpath -m -- "$OUTPUT_PATH")" in
  "$MAPS_DIR"/*) ;;
  *)
    echo "Output must stay inside $MAPS_DIR" >&2
    exit 1
    ;;
esac

TEMP_DIR="$(mktemp -d "$MAPS_DIR/.tilemaker.XXXXXX")"
TEMP_DIR_NAME="$(basename -- "$TEMP_DIR")"
DOCKER_USER="$(id -u):$(id -g)"
cleanup() {
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

# Tilemaker's direct PMTiles output is not guaranteed to be clustered. Building
# MBTiles first lets go-pmtiles order nearby TileIDs together, reducing scattered
# HTTP range reads as the map pans while retaining tile deduplication.
docker run --rm \
  --user "$DOCKER_USER" \
  -v "$MAPS_DIR:/data" \
  ghcr.io/systemed/tilemaker:master \
  "/data/$(basename -- "$PBF_PATH")" \
  --output "/data/$TEMP_DIR_NAME/cambodia.mbtiles"

docker run --rm \
  --user "$DOCKER_USER" \
  -v "$MAPS_DIR:/data" \
  ghcr.io/protomaps/go-pmtiles:v1.31.2 \
  convert \
  "/data/$TEMP_DIR_NAME/cambodia.mbtiles" \
  "/data/$TEMP_DIR_NAME/cambodia.pmtiles"

docker run --rm \
  --user "$DOCKER_USER" \
  -v "$MAPS_DIR:/data:ro" \
  ghcr.io/protomaps/go-pmtiles:v1.31.2 \
  verify "/data/$TEMP_DIR_NAME/cambodia.pmtiles"

mv -f -- "$TEMP_DIR/cambodia.pmtiles" "$OUTPUT_PATH"
echo "Built $OUTPUT_PATH ($(du -h "$OUTPUT_PATH" | cut -f1))"
