# Database migrations

SmartRoutePP uses Tortoise ORM's native reversible migrations. Migration files are
kept in `database/migrations` and use ordered names such as `0001_initial.py` and
`0002_add_place_type.py`.

Each generated operation contains both its forward schema state and enough state
for Tortoise to reverse it. Always run `migrate --dry-run` or `downgrade --dry-run`
before changing a shared database, and back up production data before dropping a
table or column.

The application does not create production tables automatically. Apply pending
migrations during deployment before starting the API.
