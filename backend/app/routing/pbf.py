"""Build a province road graph directly from an OSM PBF extract."""

from __future__ import annotations

from pathlib import Path

import networkx as nx

from scripts.convert_cambodia_pbf import load_province_boundaries

BASE_DIR = Path(__file__).resolve().parents[2]
MAPS_DIR = BASE_DIR / "maps"
DEFAULT_PBF_PATH = MAPS_DIR / "cambodia-latest.osm.pbf"


def empty_graph() -> nx.MultiDiGraph:
    return nx.MultiDiGraph()


def load_region_graph_from_pbf(country: str, province: str,
                               pbf_path: Path = DEFAULT_PBF_PATH) -> nx.MultiDiGraph:
    if not pbf_path.is_file():
        raise FileNotFoundError(f"OSM PBF not found: {pbf_path}")

    boundaries = load_province_boundaries(pbf_path)
    polygon = boundaries.get(province)
    if polygon is None:
        raise ValueError(f"No boundary found in {pbf_path} for {country}/{province}")

    try:
        from pyrosm import OSM
    except ImportError as exc:  # pragma: no cover - environment dependency
        raise RuntimeError(
            "Pyrosm is required for local OSM PBF routing. Install requirements.txt"
        ) from exc

    reader = OSM(str(pbf_path), bounding_box=polygon, keep_metadata=False)
    nodes, edges = reader.get_network(network_type="driving", nodes=True)
    if nodes is None or edges is None or nodes.empty or edges.empty:
        raise RuntimeError(f"No driving network found in {pbf_path} for {country}/{province}")

    graph = OSM.to_graph(
        nodes, edges, graph_type="networkx", network_type="driving",
        retain_all=True, osmnx_compatible=True, simplify=True,
    )
    if not graph.number_of_nodes() or not graph.number_of_edges():
        raise RuntimeError(f"PBF conversion produced an empty graph for {country}/{province}")
    return graph
