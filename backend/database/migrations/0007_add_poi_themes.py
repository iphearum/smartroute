from tortoise import migrations
from tortoise.migrations import operations as ops
import functools
from json import dumps, loads
from tortoise import fields
from tortoise.indexes import Index

# Exact port of the icons/colors/priorities/matching regex fragments that
# used to be hardcoded in frontend/src/features/map/components/map-canvas.tsx
# (poiIcons / poiAppearance / poiPriority) and the .poi-{key} rules in
# frontend/src/app/globals.css, so the map renders identically after cutover.
POI_THEMES = [
    dict(key="medical", label="Medical", priority=0, match_order=3,
         color="#dc2626", soft_color="#fee2e2",
         icon_svg='<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
         keywords=["hospital", "clinic", "doctor", "dentist", "pharmacy", "health"]),
    dict(key="transit", label="Transit", priority=1, match_order=9,
         color="#0891b2", soft_color="#cffafe",
         icon_svg='<path d="M5 4h14v12H5V4Zm3 15h8M8 8h8M8 13h.01M16 13h.01"/>',
         keywords=["bus", "station", "transit", "ferry", "platform"]),
    dict(key="fuel", label="Fuel", priority=2, match_order=5,
         color="#475569", soft_color="#e2e8f0",
         icon_svg='<path d="M5 3h10v18H5V3Zm2 3h6v5H7V6Zm8 1h3l2 3v8a2 2 0 0 1-4 0v-5"/>',
         keywords=["fuel", "charging"]),
    dict(key="government", label="Government", priority=3, match_order=11,
         color="#1e40af", soft_color="#dbeafe",
         icon_svg='<path d="M12 3 3 9h18L12 3Z M5 9v10M9 9v10M15 9v10M19 9v10M3 21h18"/>',
         keywords=["government", "police", "townhall", "courthouse", "diplomatic", "prison", "fire_station", "gouvernment"]),
    dict(key="shopping", label="Shopping", priority=4, match_order=4,
         color="#0284c7", soft_color="#e0f2fe",
         icon_svg='<path d="M5 8h14l-1 13H6L5 8Zm3 1V6a4 4 0 0 1 8 0v3"/>',
         keywords=["shop", "mall", "market", "supermarket", "convenience", "clothes", "furniture", "gift", "variety_store", "department_store"]),
    dict(key="hotel", label="Hotel", priority=5, match_order=2,
         color="#7c3aed", soft_color="#f3e8ff",
         icon_svg='<path d="M3 20V7m18 13V11a3 3 0 0 0-3-3h-7v8M3 16h18M6 11h5V7a2 2 0 0 0-2-2H6v6Z"/>',
         keywords=["hotel", "guest", "hostel", "motel"]),
    dict(key="education", label="Education", priority=6, match_order=6,
         color="#4f46e5", soft_color="#e0e7ff",
         icon_svg='<path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v5c3 3 9 3 12 0v-5M22 9v7"/>',
         keywords=["school", "college", "university", "library", "educational_institution", "kindergarten"]),
    dict(key="automotive", label="Automotive", priority=7, match_order=12,
         color="#57534e", soft_color="#e7e5e4",
         icon_svg='<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8Z"/>',
         keywords=["car_repair", r"\bcar\b", "motorcycle", "car_wash", "tyres", "car_parts"]),
    dict(key="finance", label="Finance", priority=8, match_order=7,
         color="#0f766e", soft_color="#ccfbf1",
         icon_svg='<path d="m3 9 9-5 9 5M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M3 21h18"/>',
         keywords=["bank", "atm", "finance", "bureau_de_change"]),
    dict(key="attraction", label="Attraction", priority=9, match_order=14,
         color="#ca8a04", soft_color="#fef9c3",
         icon_svg='<path d="M12 2l2.6 6.6L21 9l-5 4.6L17.4 21 12 17.3 6.6 21 8 13.6 3 9l6.4-.4L12 2Z"/>',
         keywords=["attraction", "monument", "viewpoint", "museum", "gallery", "artwork", "memorial", "castle", "theme_park", "zoo"]),
    dict(key="fitness", label="Fitness", priority=10, match_order=15,
         color="#65a30d", soft_color="#ecfccb",
         icon_svg='<path d="M4 9v6M2 10v4M20 9v6M22 10v4M8 12h8M6 8v8M18 8v8"/>',
         keywords=["fitness_centre", "sports_centre", "stadium", "swimming_pool", "golf_course", r"\bpitch\b"]),
    dict(key="beauty", label="Beauty", priority=11, match_order=13,
         color="#db2777", soft_color="#fce7f3",
         icon_svg='<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
         keywords=["hairdresser", "massage", "beauty", "cosmetics", "spa", "sauna"]),
    dict(key="electronics", label="Electronics", priority=12, match_order=16,
         color="#4338ca", soft_color="#e0e7ff",
         icon_svg='<path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15h4"/>',
         keywords=["mobile_phone", "electronics", "computer", "hifi", "camera", "telecommunication"]),
    dict(key="park", label="Park", priority=13, match_order=8,
         color="#16a34a", soft_color="#dcfce7",
         icon_svg='<path d="M12 3 7 10h3l-5 7h6v4h2v-4h6l-5-7h3l-5-7Z"/>',
         keywords=["park", "garden", "playground", "nature"]),
    dict(key="worship", label="Worship", priority=14, match_order=10,
         color="#92400e", soft_color="#fde8d0",
         icon_svg='<path d="M12 2v3M9 9a3 3 0 0 1 6 0v2H9V9Z M5 21V11h14v10M3 21h18"/>',
         keywords=["place_of_worship", "temple", "pagoda", "church", "mosque"]),
    dict(key="food", label="Food", priority=15, match_order=0,
         color="#e85d04", soft_color="#fff1e8",
         icon_svg='<path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M16 3v18M16 3c3 2 4 5 4 8h-4"/>',
         keywords=["restaurant", "fast_food", "food", r"bar\b", "pub", "bakery", "nightclub", "casino"]),
    dict(key="cafe", label="Cafe", priority=16, match_order=1,
         color="#a16207", soft_color="#fef3c7",
         icon_svg='<path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 2h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2"/>',
         keywords=["cafe", "coffee"]),
    dict(key="place", label="Place", priority=17, match_order=17,
         color="#087f5b", soft_color="#d9f2e7",
         icon_svg='<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-8 3a3 3 0 0 0 0-6 3 3 0 0 0 0 6Z"/>',
         keywords=[]),
]


async def seed_poi_themes(apps, schema_editor):
    poi_theme = apps.get_model("models.PoiTheme")
    await poi_theme.bulk_create([poi_theme(**theme) for theme in POI_THEMES])


class Migration(migrations.Migration):
    dependencies = [('models', '0006_add_place_lat_lon_index')]

    initial = False

    operations = [
        ops.CreateModel(
            name='PoiTheme',
            fields=[
                ('id', fields.BigIntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('key', fields.CharField(unique=True, max_length=40)),
                ('label', fields.CharField(max_length=60)),
                ('icon_svg', fields.TextField(unique=False)),
                ('color', fields.CharField(max_length=16)),
                ('soft_color', fields.CharField(max_length=16)),
                ('priority', fields.IntField()),
                ('match_order', fields.IntField()),
                ('keywords', fields.JSONField(source_field='keywords_json', default=list, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('active', fields.BooleanField(default=True)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'poi_themes', 'app': 'models', 'indexes': [Index(fields=['active', 'match_order'])], 'pk_attr': 'id', 'table_description': 'Icon/color/priority + matching rules for a POI category, editable without a redeploy.'},
            bases=['Model'],
        ),
        ops.RunPython(
            seed_poi_themes,
            reverse_code=ops.RunPython.noop,
        ),
    ]
