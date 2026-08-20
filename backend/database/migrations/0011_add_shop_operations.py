"""Persist POS orders, staff, and payroll runs."""

from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0010_auto_20260820_1052")]
    initial = False

    operations = [
        ops.RunSQL(
            """
            CREATE TABLE IF NOT EXISTS commerce_orders (
                id BIGSERIAL PRIMARY KEY,
                business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                branch_id BIGINT NOT NULL REFERENCES shop_branches(id) ON DELETE CASCADE,
                order_number VARCHAR(40) NOT NULL UNIQUE,
                order_type VARCHAR(32) NOT NULL DEFAULT 'dine_in',
                status VARCHAR(32) NOT NULL DEFAULT 'preparing',
                subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
                tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
                total NUMERIC(14, 2) NOT NULL DEFAULT 0,
                metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS commerce_orders_business_created
                ON commerce_orders (business_id, created_at);
            CREATE INDEX IF NOT EXISTS commerce_orders_branch_status
                ON commerce_orders (branch_id, status);

            CREATE TABLE IF NOT EXISTS commerce_order_items (
                id BIGSERIAL PRIMARY KEY,
                order_id BIGINT NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
                variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
                product_name VARCHAR(255) NOT NULL,
                variant_title VARCHAR(255),
                quantity INTEGER NOT NULL,
                unit_price NUMERIC(14, 2) NOT NULL,
                line_total NUMERIC(14, 2) NOT NULL
            );
            CREATE INDEX IF NOT EXISTS commerce_order_items_order ON commerce_order_items (order_id);
            CREATE INDEX IF NOT EXISTS commerce_order_items_variant ON commerce_order_items (variant_id);

            CREATE TABLE IF NOT EXISTS staff_members (
                id BIGSERIAL PRIMARY KEY,
                business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                role VARCHAR(120) NOT NULL DEFAULT 'Staff',
                hourly_rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
                hours_this_week NUMERIC(8, 2) NOT NULL DEFAULT 0,
                clocked_in BOOLEAN NOT NULL DEFAULT FALSE,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS staff_members_business_active
                ON staff_members (business_id, active);

            CREATE TABLE IF NOT EXISTS payroll_runs (
                id BIGSERIAL PRIMARY KEY,
                business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                total NUMERIC(14, 2) NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'paid',
                paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
            );
            CREATE INDEX IF NOT EXISTS payroll_runs_business_paid
                ON payroll_runs (business_id, paid_at);
            """,
            """
            DROP TABLE IF EXISTS payroll_runs;
            DROP TABLE IF EXISTS staff_members;
            DROP TABLE IF EXISTS commerce_order_items;
            DROP TABLE IF EXISTS commerce_orders;
            """,
        ),
    ]
