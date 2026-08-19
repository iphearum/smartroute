from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0005_add_users_table')]

    initial = False

    operations = [
        ops.AddIndex(
            model_name='Place',
            index=Index(fields=['latitude', 'longitude']),
        ),
    ]
