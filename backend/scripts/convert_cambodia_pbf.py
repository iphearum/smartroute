"""Read Cambodia province boundaries from OSM PBF for runtime boundary detection.

Note: GraphML file generation and conversion to GraphML format has been removed.
SmartRoute now uses OSM PBF directly with GraphHopper for all routing operations.
This module provides province-boundary loading only.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.support.cambodia import REGIONS, province_name

BACKEND_DIR = Path(__file__).resolve().parents[1]
MAPS_DIR = BACKEND_DIR / "maps"
DEFAULT_PBF = MAPS_DIR / "cambodia-latest.osm.pbf"
REGION_ALIASES = {
    "banteay_meanchey": {"Bantey Meanchey"},
    "preah_sihanouk": {"Khaet Preah Sihanouk"},
    "tboung_khmum": {"Tbong Khmum"},
}


def _pyrosm():
    try:
        from pyrosm import OSM
    except ImportError as exc:
        raise RuntimeError(
            "Pyrosm is required for local PBF conversion. Run: pip install -r requirements.txt"
        ) from exc
    return OSM


def _normalized(value: Any) -> str:
    text = str(value or "").casefold().replace("province", "")
    return re.sub(r"[^a-z0-9]+", "", text)


def load_province_boundaries(pbf_path: Path) -> dict[str, Any]:
    """Read Cambodia's level-4 administrative province polygons locally."""
    OSM = _pyrosm()
    reader = OSM(str(pbf_path), keep_metadata=False)
    boundaries = reader.get_boundaries(
        extra_attributes=["admin_level", "name:en", "name:km"],
    )
    if boundaries is None or boundaries.empty:
        raise RuntimeError("The PBF contains no admin-level 4 Cambodia boundaries")
    boundaries = boundaries[boundaries["admin_level"].astype(str).str.replace(".0", "", regex=False).eq("4")]
    if len(boundaries) != len(REGIONS):
        raise RuntimeError(
            f"Expected {len(REGIONS)} Cambodia admin-level 4 boundaries, found {len(boundaries)}"
        )

    resolved: dict[str, Any] = {}
    for slug, display_name in REGIONS.items():
        expected_names = {
            display_name, province_name(display_name), slug,
            *REGION_ALIASES.get(slug, set()),
        }
        expected = {_normalized(value) for value in expected_names}
        matches = []
        for _, row in boundaries.iterrows():
            names = {_normalized(row.get(key)) for key in ("name", "name:en")}
            if expected & names:
                matches.append(row.get("geometry"))
        matches = [geometry for geometry in matches if geometry is not None and not geometry.is_empty]
        if len(matches) != 1:
            available = sorted(str(value) for value in boundaries["name:en"].dropna().unique())
            raise RuntimeError(
                f"Expected one boundary for {display_name}, found {len(matches)}. "
                f"Available level-4 name:en values: {', '.join(available)}"
            )
        resolved[slug] = matches[0]
    return resolved


async def run(pbf_path: Path, *args, **kwargs) -> None:
    raise RuntimeError(
        "PBF-to-GraphML conversion is no longer supported. "
        "SmartRoute routes exclusively through GraphHopper + OSM PBF."
    )


if __name__ == "__main__":
    import sys
    print(
        "ERROR: convert_cambodia_pbf.py conversion mode is deprecated.\n"
        "SmartRoute now uses GraphHopper + OSM PBF exclusively for routing.\n"
        "To use province boundary detection, call load_province_boundaries() programmatically.",
        file=sys.stderr,
    )
    sys.exit(1)
