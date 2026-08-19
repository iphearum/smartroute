"""DEPRECATED: Downloading province graphs as GraphML files is no longer supported.

The SmartRoute architecture now uses GraphHopper + OSM PBF exclusively for routing.
GraphML-based local graph loading has been removed from the runtime.
"""

from __future__ import annotations

import sys

def _deprecated():
    print(
        "ERROR: download_cambodia_maps.py is deprecated.\n"
        "SmartRoute now uses GraphHopper + OSM PBF for all routing.\n"
        "GraphML files are no longer generated or used by the backend.\n"
        "Please use GraphHopper directly for map data management.",
        file=sys.stderr,
    )
    sys.exit(1)


async def run(*args, **kwargs) -> None:
    _deprecated()


if __name__ == "__main__":
    _deprecated()
