# Map catalog

Regional data is organized as:

```text
maps/
  <country>/
    <province>/
      base/       # primary .graphml files
      overlays/   # custom roads and corrections
      images/     # optional file-based source images
```

`maps.db` is created automatically and stores the catalog, revision history, and
uploaded image data. GraphML stays on disk because road graphs are too large for
efficient BLOB storage. The database stores their paths and versions.

The default `my_phnom_penh.graphml` and its source copy live in
`cambodia/phnom_penh/base/`. Custom and composed graphs live in `overlays/`.
Non-empty GraphML files in the region's `overlays/` directory are composed into
the base automatically at startup. The default graph is registered as
`cambodia/phnom_penh` at startup.
