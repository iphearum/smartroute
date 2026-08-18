#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BACKEND_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
MAPS_DIR="$BACKEND_DIR/maps"
SOURCE_DIR="$MAPS_DIR/greater-mekong-routing-sources"
OUTPUT_PATH="$MAPS_DIR/greater-mekong-latest.osm.pbf"
REFRESH=false

usage() {
  echo "Usage: $0 [--refresh] [output.osm.pbf]"
  echo "Builds a routing-only Greater Mekong PBF for GraphHopper."
}

for argument in "$@"; do
  case "$argument" in
    --refresh) REFRESH=true ;;
    --help|-h)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $argument" >&2
      usage >&2
      exit 2
      ;;
    *) OUTPUT_PATH="$argument" ;;
  esac
done

mkdir -p -- "$SOURCE_DIR"
case "$(realpath -m -- "$OUTPUT_PATH")" in
  "$MAPS_DIR"/*) ;;
  *)
    echo "Output must stay inside $MAPS_DIR" >&2
    exit 1
    ;;
esac

download_extract() {
  name="$1"
  url="$2"
  target="$SOURCE_DIR/$name-latest.osm.pbf"
  partial="$target.part"
  partial_checksum="$partial.md5"
  expected="$(curl --fail --silent --show-error --location --retry 4 --retry-all-errors "$url.md5" | awk 'NR == 1 { print $1 }')"

  if [ -z "$expected" ]; then
    echo "Could not read checksum for $url" >&2
    exit 1
  fi
  if [ "$REFRESH" = false ] && [ -s "$target" ] && [ "$(md5sum "$target" | awk '{ print $1 }')" = "$expected" ]; then
    echo "Using current $target"
    return
  fi

  if [ -s "$partial" ] && { [ ! -f "$partial_checksum" ] || [ "$(cat "$partial_checksum")" != "$expected" ]; }; then
    rm -f -- "$partial" "$partial_checksum"
  fi
  printf '%s\n' "$expected" >"$partial_checksum"
  echo "Downloading $url"
  curl --fail --location --retry 4 --retry-all-errors --continue-at - --output "$partial" "$url"
  actual="$(md5sum "$partial" | awk '{ print $1 }')"
  if [ "$actual" != "$expected" ]; then
    echo "Checksum mismatch for $url" >&2
    exit 1
  fi
  mv -f -- "$partial" "$target"
  rm -f -- "$partial_checksum"
}

download_extract cambodia https://download.geofabrik.de/asia/cambodia-latest.osm.pbf
download_extract laos https://download.geofabrik.de/asia/laos-latest.osm.pbf
download_extract myanmar https://download.geofabrik.de/asia/myanmar-latest.osm.pbf
download_extract thailand https://download.geofabrik.de/asia/thailand-latest.osm.pbf
download_extract vietnam https://download.geofabrik.de/asia/vietnam-latest.osm.pbf
download_extract china-guangxi https://download.geofabrik.de/asia/china/guangxi-latest.osm.pbf
download_extract china-yunnan https://download.geofabrik.de/asia/china/yunnan-latest.osm.pbf

TEMP_PATH="$(mktemp --tmpdir="$MAPS_DIR" .greater-mekong.XXXXXX.osm.pbf)"
cleanup() {
  rm -f -- "$TEMP_PATH"
}
trap cleanup EXIT

if command -v osmium >/dev/null 2>&1; then
  osmium merge \
    "$SOURCE_DIR/cambodia-latest.osm.pbf" \
    "$SOURCE_DIR/laos-latest.osm.pbf" \
    "$SOURCE_DIR/myanmar-latest.osm.pbf" \
    "$SOURCE_DIR/thailand-latest.osm.pbf" \
    "$SOURCE_DIR/vietnam-latest.osm.pbf" \
    "$SOURCE_DIR/china-guangxi-latest.osm.pbf" \
    "$SOURCE_DIR/china-yunnan-latest.osm.pbf" \
    --output "$TEMP_PATH" --overwrite
  osmium fileinfo --extended "$TEMP_PATH" >/dev/null
else
  image="smartroute-osmium-tool:bookworm"
  docker build --quiet --tag "$image" --file "$BACKEND_DIR/graphhopper/osmium-tool.Dockerfile" "$BACKEND_DIR/graphhopper" >/dev/null
  docker run --rm --user "$(id -u):$(id -g)" --volume "$MAPS_DIR:/data" "$image" merge \
    /data/greater-mekong-routing-sources/cambodia-latest.osm.pbf \
    /data/greater-mekong-routing-sources/laos-latest.osm.pbf \
    /data/greater-mekong-routing-sources/myanmar-latest.osm.pbf \
    /data/greater-mekong-routing-sources/thailand-latest.osm.pbf \
    /data/greater-mekong-routing-sources/vietnam-latest.osm.pbf \
    /data/greater-mekong-routing-sources/china-guangxi-latest.osm.pbf \
    /data/greater-mekong-routing-sources/china-yunnan-latest.osm.pbf \
    --output "/data/$(basename -- "$TEMP_PATH")" --overwrite
  docker run --rm --user "$(id -u):$(id -g)" --volume "$MAPS_DIR:/data:ro" "$image" fileinfo \
    --extended "/data/$(basename -- "$TEMP_PATH")" >/dev/null
fi

mv -f -- "$TEMP_PATH" "$OUTPUT_PATH"
trap - EXIT
echo "Built routing input $OUTPUT_PATH ($(du -h "$OUTPUT_PATH" | cut -f1))"
