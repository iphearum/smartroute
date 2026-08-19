"""Tortoise models, grouped by domain (Laravel's `app/Models`).

`__models__` is Tortoise's explicit discovery contract (see
`tortoise/apps.py::_discover_models`). Listing models here rather than
letting Tortoise scan `dir()` keeps registration deliberate: adding a model
file does nothing until it is exported below, and re-exported helper names
can never be mistaken for models.

The Tortoise *app label* stays `"models"` because every applied migration
records `('models', '000X_...')` dependencies and `'app': 'models'` options.
Renaming the label would orphan the existing migration history on databases
that already ran it -- only the Python module path moved.
"""

from __future__ import annotations

from app.models.commerce import (Business, InventoryItem, Product, ProductVariant,
                                 ShopBranch, Storefront)
from app.models.exchange_rate import ExchangeRate
from app.models.map import (CustomRoute, MapImage, MapRecord, MapRevision, RoadClosure,
                            default_travel_modes)
from app.models.place import OsmFeature, Place, PlaceMedia, PoiTheme, ThreeDAsset
from app.models.user import User

__models__ = [
    MapRecord, MapRevision, MapImage, CustomRoute, RoadClosure,
    Place, OsmFeature, ThreeDAsset, PlaceMedia, PoiTheme,
    User,
    Business, ShopBranch, Storefront, Product, ProductVariant, InventoryItem,
    ExchangeRate,
]

__all__ = [model.__name__ for model in __models__] + ["default_travel_modes"]
