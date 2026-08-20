"""Track place lifecycle and scheduled branch closures."""

from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0011_add_shop_operations")]
    initial = False

    operations = [
        ops.RunSQL(
            """
            ALTER TABLE map_places ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';
            ALTER TABLE map_places ADD COLUMN IF NOT EXISTS moved_to_place_id BIGINT NULL
                REFERENCES map_places(id) ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS map_places_status ON map_places (status, active);

            CREATE TABLE IF NOT EXISTS branch_schedules (
                id BIGSERIAL PRIMARY KEY,
                branch_id BIGINT NOT NULL REFERENCES shop_branches(id) ON DELETE CASCADE,
                kind VARCHAR(32) NOT NULL DEFAULT 'closure',
                title VARCHAR(255) NOT NULL,
                starts_at TIMESTAMPTZ NOT NULL,
                ends_at TIMESTAMPTZ NOT NULL,
                all_day BOOLEAN NOT NULL DEFAULT TRUE,
                is_closed BOOLEAN NOT NULL DEFAULT TRUE,
                notes TEXT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS branch_schedules_lookup
                ON branch_schedules (branch_id, active, starts_at, ends_at);
            """,
            """
            DROP TABLE IF EXISTS branch_schedules;
            ALTER TABLE map_places DROP COLUMN IF EXISTS moved_to_place_id;
            ALTER TABLE map_places DROP COLUMN IF EXISTS status;
            """,
        ),
    ]
