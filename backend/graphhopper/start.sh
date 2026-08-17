#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAPHHOPPER_VERSION="${GRAPHHOPPER_VERSION:-11.0}"
GRAPHHOPPER_JAR="$SCRIPT_DIR/graphhopper-web-$GRAPHHOPPER_VERSION.jar"
PBF_PATH="$SCRIPT_DIR/../maps/cambodia-latest.osm.pbf"

if [[ ! -s "$PBF_PATH" ]]; then
  echo "Missing or empty Cambodia PBF: $PBF_PATH" >&2
  exit 1
fi

if [[ ! -s "$GRAPHHOPPER_JAR" ]]; then
  curl --fail --location --output "$GRAPHHOPPER_JAR" \
    "https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/$GRAPHHOPPER_VERSION/graphhopper-web-$GRAPHHOPPER_VERSION.jar"
fi

cd "$SCRIPT_DIR"
exec java ${JAVA_OPTS:--Xms1g -Xmx4g} -jar "$GRAPHHOPPER_JAR" server config.yml

