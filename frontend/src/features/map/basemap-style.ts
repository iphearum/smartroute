import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

export const worldBasemapLayerId = "world-basemap";
export const basemapMode =
  process.env.NEXT_PUBLIC_MAP_BASEMAP_MODE === "hybrid" ? "hybrid" : "online";
export const complexTextPluginUrl =
  "https://cdn.jsdelivr.net/gh/wipfli/maplibre-gl-complex-text@45c5aa1920093d39324640a417b3c4ebd530bc6d/dist/maplibre-gl-complex-text.js";
export const complexTextGlyphsUrl =
  "https://cdn.jsdelivr.net/gh/wipfli/pgf-glyph-ranges@96cbacf2e76adaf0f111d8d082379ee018d0010a/font/NotoSansMultiscript-Regular-v1/{range}.pbf";

const cartoVoyagerTiles =
  "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
const cartoAttribution =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> © <a href="https://carto.com/attributions">CARTO</a>';
const labelFont = ["Noto Sans Regular"];
const labelHalo = {
  "text-halo-color": "rgba(248, 250, 247, 0.96)",
  "text-halo-width": 1.6,
  "text-halo-blur": 0.4,
} as const;

export function onlineBasemapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      world: {
        type: "raster",
        tiles: [cartoVoyagerTiles],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 20,
        attribution: cartoAttribution,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#eef2eb" },
      },
      {
        id: worldBasemapLayerId,
        type: "raster",
        source: "world",
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
}

const roadWidth: ExpressionSpecification = [
  "interpolate",
  ["exponential", 1.45],
  ["zoom"],
  6,
  0.4,
  12,
  1.5,
  16,
  7,
  20,
  24,
];
const roadCasingWidth: ExpressionSpecification = [
  "interpolate",
  ["exponential", 1.45],
  ["zoom"],
  6,
  2.4,
  12,
  3.5,
  16,
  9,
  20,
  26,
];

export function localBasemapStyle(pmtilesUrl: string): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      world: {
        type: "raster",
        tiles: [cartoVoyagerTiles],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 20,
        attribution: cartoAttribution,
      },
      osm: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#eef2eb" },
      },
      {
        id: worldBasemapLayerId,
        type: "raster",
        source: "world",
        minzoom: 0,
        maxzoom: 20,
        layout: { visibility: "none" },
      },
      {
        id: "landcover",
        type: "fill",
        source: "osm",
        "source-layer": "landcover",
        paint: { "fill-color": "#dce9d5", "fill-opacity": 0.7 },
      },
      {
        id: "landuse",
        type: "fill",
        source: "osm",
        "source-layer": "landuse",
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            "residential",
            "#e8e6df",
            "industrial",
            "#e4e1df",
            "cemetery",
            "#dce8d7",
            "hospital",
            "#eadfdf",
            "school",
            "#eee8d6",
            "#e3eadc",
          ],
          "fill-opacity": 0.75,
        },
      },
      {
        id: "parks",
        type: "fill",
        source: "osm",
        "source-layer": "park",
        paint: { "fill-color": "#cfe5c7", "fill-opacity": 0.85 },
      },
      {
        id: "water",
        type: "fill",
        source: "osm",
        "source-layer": "water",
        paint: { "fill-color": "#b9dce5" },
      },
      {
        id: "waterways",
        type: "line",
        source: "osm",
        "source-layer": "waterway",
        paint: {
          "line-color": "#9acdd9",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 3],
        },
      },
      {
        id: "buildings",
        type: "fill",
        source: "osm",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": "#d7d1c9",
          "fill-outline-color": "#c5beb5",
          "fill-opacity": 0.85,
        },
      },
      {
        id: "road-casing",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 6,
        paint: {
          "line-color": "#d2cfc8",
          "line-width": roadCasingWidth,
          "line-opacity": 0.9,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      },
      {
        id: "roads",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 6,
        paint: {
          "line-color": [
            "match",
            ["get", "class"],
            "motorway",
            "#f1bd75",
            "trunk",
            "#f4ca88",
            "primary",
            "#f7d89e",
            "secondary",
            "#f8e1b7",
            "#ffffff",
          ],
          "line-width": roadWidth,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      },
      {
        id: "boundaries",
        type: "line",
        source: "osm",
        "source-layer": "boundary",
        paint: {
          "line-color": "#8a9a91",
          "line-width": 1,
          "line-dasharray": [3, 3],
          "line-opacity": 0.6,
        },
      },
      {
        id: "water-labels",
        type: "symbol",
        source: "osm",
        "source-layer": "water_name",
        minzoom: 12,
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 350,
          "text-field": ["get", "name:latin"],
          "text-font": labelFont,
          "text-size": 11,
          "text-max-angle": 30,
          "text-padding": 8,
        },
        paint: {
          "text-color": "#4c8796",
          ...labelHalo,
        },
      },
      {
        id: "road-labels-major",
        type: "symbol",
        source: "osm",
        "source-layer": "transportation_name",
        minzoom: 8,
        filter: [
          "in",
          ["get", "class"],
          [
            "literal",
            ["motorway", "trunk", "primary", "secondary", "tertiary"],
          ],
        ],
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 280,
          "text-field": ["coalesce", ["get", "name:latin"], ["get", "ref"]],
          "text-font": labelFont,
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 15, 13],
          "text-max-angle": 30,
          "text-padding": 10,
          "text-rotation-alignment": "map",
        },
        paint: {
          "text-color": "#68756e",
          ...labelHalo,
        },
      },
      {
        id: "road-labels-minor",
        type: "symbol",
        source: "osm",
        "source-layer": "transportation_name",
        minzoom: 13,
        filter: [
          "!",
          [
            "in",
            ["get", "class"],
            [
              "literal",
              ["motorway", "trunk", "primary", "secondary", "tertiary"],
            ],
          ],
        ],
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 360,
          "text-field": ["coalesce", ["get", "name:latin"], ["get", "ref"]],
          "text-font": labelFont,
          "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9.5, 17, 12],
          "text-max-angle": 35,
          "text-padding": 12,
          "text-rotation-alignment": "map",
        },
        paint: {
          "text-color": "#829089",
          ...labelHalo,
        },
      },
      {
        id: "place-labels-region",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        minzoom: 4,
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["country", "state", "city"]],
        ],
        layout: {
          "text-field": ["get", "name:latin"],
          "text-font": labelFont,
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 12, 12, 18],
          "text-max-width": 10,
          "text-padding": 18,
        },
        paint: {
          "text-color": "#40554b",
          ...labelHalo,
          "text-halo-width": 2,
        },
      },
      {
        id: "place-labels-local",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        minzoom: 9,
        filter: [
          "in",
          ["get", "class"],
          [
            "literal",
            [
              "town",
              "village",
              "hamlet",
              "suburb",
              "neighbourhood",
              "quarter",
              "locality",
            ],
          ],
        ],
        layout: {
          "text-field": ["get", "name:latin"],
          "text-font": labelFont,
          "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 15, 14],
          "text-max-width": 12,
          "text-padding": 12,
        },
        paint: {
          "text-color": "#53685e",
          ...labelHalo,
          "text-halo-width": 2,
        },
      },
    ],
  };
}
