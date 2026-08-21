from tortoise import migrations
from tortoise import fields
from tortoise.migrations import operations as ops
from tortoise.indexes import Index


class Migration(migrations.Migration):
    dependencies = [("models", "0012_add_place_lifecycle_and_branch_schedules")]
    initial = False

    operations = [
        ops.CreateModel(
            name="AssistantSession",
            fields=[
                ("id", fields.CharField(default=None, max_length=36, primary_key=True, unique=True)),
                ("owner_key", fields.CharField(max_length=128)),
                ("title", fields.CharField(default="New chat", max_length=160)),
                ("messages", fields.JSONField(default=list, source_field="messages_json")),
                ("expires_at", fields.DatetimeField()),
                ("created_at", fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={"table": "assistant_sessions", "app": "models", "pk_attr": "id"},
            bases=["Model"],
        ),
        ops.AddIndex(model_name="AssistantSession", index=Index(fields=["owner_key", "updated_at"])),
        ops.AddIndex(model_name="AssistantSession", index=Index(fields=["owner_key", "expires_at"])),
    ]
