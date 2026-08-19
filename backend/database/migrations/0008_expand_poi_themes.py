from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

# Coarse group per existing theme key, for future filter-UI/analytics use --
# independent of the per-theme icon/color/matching config.
THEME_GROUPS = {
    "food": "food_drink",
    "cafe": "food_drink",
    "hotel": "lodging",
    "medical": "health",
    "shopping": "shopping",
    "fuel": "transport",
    "education": "education",
    "finance": "finance",
    "park": "nature",
    "transit": "transport",
    "worship": "worship",
    "government": "civic",
    "automotive": "transport",
    "beauty": "lifestyle",
    "attraction": "culture",
    "fitness": "lifestyle",
    "electronics": "tech",
    "place": "other",
}

# Extra keyword fragments folded into existing themes -- categories in
# map_places that were previously falling through to the generic "place"
# pin despite clearly belonging to an existing theme.
KEYWORD_ADDITIONS = {
    "medical": ["optician", "optometrist"],
    "government": ["post_office", "public_building", "information", "community_centre"],
    "worship": ["grave_yard", "cemetery"],
    "shopping": [
        "beverages", "shoes", "books", "jewelry", "greengrocer", "florist",
        "toys", "baby_goods", "hardware", "butcher", "chemist", "stationery",
        "second_hand", "houseware",
    ],
    "food": ["ice_cream", "food_court", "deli", "seafood"],
    "attraction": ["cinema", "theatre", "arts_centre", "exhibition_centre"],
    "transit": [
        "parking", "taxi", "car_rental", "bicycle_rental",
        "motorcycle_rental", "motorcycle_parking", "boat_rental",
    ],
}

# Fixes for pre-existing unbounded-substring collisions surfaced while
# auditing map_places against the expanded taxonomy: bare "park"/"pub" and
# transit's bare "station" were swallowing unrelated categories (parking
# lots and theme parks into the nature "park" theme instead of
# transit/attraction; "public_building" into "food" via "pub"; and
# "fire_station" into "transit" ahead of government's own "fire_station"
# keyword). "station" is dropped outright rather than word-bounded --
# "bus_station" still resolves to transit via the existing "bus" keyword.
KEYWORD_REPLACEMENTS = {
    "park": {"park": r"\bpark\b"},
    "food": {"pub": r"\bpub\b"},
}
KEYWORD_REMOVALS = {
    "transit": ["station"],
}

# New themes, appended after the existing 18 in match order -- they only
# ever catch a place nothing earlier matched, so this can't regress any
# existing classification.
NEW_THEMES = [
    dict(key="office", label="Offices & Services", priority=18, match_order=18,
         color="#334155", soft_color="#e2e8f0", group="business",
         icon_svg='<path d="M3 8h18v11H3V8Zm5-3h8a1 1 0 0 1 1 1v2H7V6a1 1 0 0 1 1-1ZM3 13h18"/>',
         keywords=[
             "company", r"\boffice\b", r"\bngo\b", "estate_agent", "travel_agen",
             "lawyer", "insurance", "architect", "engineer", "coworking",
             "consulting", "logistics", "association", "advertising_agency",
         ]),
    dict(key="services", label="Services", priority=19, match_order=19,
         color="#b45309", soft_color="#fef3c7", group="business",
         icon_svg='<path d="M6 3v6M3 6h6M14 14l7 7M14 14a4 4 0 1 1 4-6.9L15 10l1 1 2.9-3A4 4 0 0 1 14 14Z"/>',
         keywords=[
             "laundry", "dry_clean", "tailor", "dressmaker", "shoemaker",
             "watchmaker", "copyshop", "printing", "locksmith",
         ]),
    dict(key="housing", label="Housing", priority=20, match_order=20,
         color="#78716c", soft_color="#f5f5f4", group="housing",
         icon_svg='<path d="M4 21V6l8-3 8 3v15M4 21h16M9 21v-6h2v6M13 21v-6h2v6M8 9h1M8 12h1M15 9h1M15 12h1"/>',
         keywords=["apartment", "residential"]),
]


async def expand_poi_themes(apps, schema_editor):
    poi_theme = apps.get_model("models.PoiTheme")
    for key, group in THEME_GROUPS.items():
        await poi_theme.filter(key=key).update(group=group)
    for key, additions in KEYWORD_ADDITIONS.items():
        theme = await poi_theme.get_or_none(key=key)
        if theme is None:
            continue
        theme.keywords = [*theme.keywords, *additions]
        await theme.save(update_fields=["keywords"])
    for key, replacements in KEYWORD_REPLACEMENTS.items():
        theme = await poi_theme.get_or_none(key=key)
        if theme is None:
            continue
        theme.keywords = [replacements.get(kw, kw) for kw in theme.keywords]
        await theme.save(update_fields=["keywords"])
    for key, removals in KEYWORD_REMOVALS.items():
        theme = await poi_theme.get_or_none(key=key)
        if theme is None:
            continue
        theme.keywords = [kw for kw in theme.keywords if kw not in removals]
        await theme.save(update_fields=["keywords"])
    await poi_theme.bulk_create([poi_theme(**theme) for theme in NEW_THEMES])


class Migration(migrations.Migration):
    dependencies = [('models', '0007_add_poi_themes')]

    initial = False

    operations = [
        ops.AddField(
            model_name='PoiTheme',
            name='group',
            field=fields.CharField(default='other', db_default='other', max_length=40),
        ),
        ops.RunPython(
            expand_poi_themes,
            reverse_code=ops.RunPython.noop,
        ),
    ]
