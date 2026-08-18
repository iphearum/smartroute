# Place and commerce foundation

## Purpose and ownership

`map_places` is the canonical user-facing location table. A place can be:

- imported from OSM (`source=osm`);
- created by a merchant (`source=merchant`);
- created manually or by an administrator; or
- optionally linked to a renewable `osm_features` row through `osm_feature_id`.

Business-owned information is stored separately so replacing the Cambodia PBF
cannot overwrite storefronts, catalogs, inventory, media, or verification state.
GraphHopper remains responsible only for routing.

```text
osm_features ── optional source ──> map_places <── shop_branches ── businesses
                                      ├── place_media                 ├── storefronts
                                      └── three_d_assets              └── products
                                                                         └── variants
                                                                               └── inventory_items
```

Existing places are reusable: creating a branch requires a `place_id`, so an
imported market, restaurant, or shop can receive merchant information without
duplicating its coordinates. A business may have multiple branches, while the
unique `(business_id, place_id)` constraint prevents duplicate branches at the
same location.

## Initial API

```text
POST /commerce/businesses
GET  /commerce/businesses/{business_id}
POST /commerce/businesses/{business_id}/branches
POST /commerce/businesses/{business_id}/storefronts
POST /commerce/businesses/{business_id}/products
GET  /commerce/businesses/{business_id}/products
POST /commerce/products/{product_id}/variants
PUT  /commerce/branches/{branch_id}/inventory/{variant_id}
GET  /commerce/places/{place_id}
POST /commerce/places/{place_id}/media
```

The place profile combines location data, linked shops, media, and 3D models for
future map cards and detailed place pages. Product binaries, images, video, and
GLB/GLTF files stay in object storage; the database stores URLs and placement
metadata.

## Integrity rules

- Branches can reference active existing or merchant-created places.
- Inventory variants must belong to the same business as the branch.
- Available and reserved quantities cannot be negative; reserved cannot exceed available.
- SKU and storefront slug are unique.
- A linked OSM feature or 3D place must belong to the same registered map.
- Product prices use fixed-precision decimal fields rather than floats.
- Deleting a place is restricted while a shop branch references it.
- Removing an OSM feature or place clears optional OSM/3D links instead of deleting business data.

## Current boundary

This foundation intentionally does not implement authentication, checkout,
payments, orders, delivery assignment, reviews, or merchant moderation. Existing
write APIs in this project are trusted-administration APIs; authentication and
ownership authorization must be added before exposing commerce mutations to the
public internet. `owner_user_id` is an opaque future identity link, not an
authorization boundary yet.

## Next phases

1. Merchant authentication, membership, ownership checks, and verification.
2. Product/place media upload to object storage with MIME and size validation.
3. Public published-storefront and product search/read APIs.
4. Orders, payments, pickup, delivery zones, and GraphHopper delivery estimates.
5. Fleet telemetry and operations dashboard APIs.

Places can later support a verified multimodal routing feature by storing
explicit mobility capabilities such as parking, vehicle storage, or motorbike
rental. The current Suggested router compares direct car and motorbike
alternatives only; it does not infer transfer points from ordinary shops or
places.
