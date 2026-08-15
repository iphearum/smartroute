from services import settings


def test_postgresql_database_url(monkeypatch):
    monkeypatch.delenv("DB_URL", raising=False)
    monkeypatch.setenv("DB_CONNECTION", "pgsql")
    monkeypatch.setenv("DB_HOST", "db.internal")
    monkeypatch.setenv("DB_PORT", "5432")
    monkeypatch.setenv("DB_DATABASE", "smart route")
    monkeypatch.setenv("DB_USERNAME", "route@user")
    monkeypatch.setenv("DB_PASSWORD", "p@ss/word")

    assert settings._database_url() == (
        "postgres://route%40user:p%40ss%2Fword@db.internal:5432/smart%20route"
    )


def test_postgresql_aliases(monkeypatch):
    monkeypatch.delenv("DB_URL", raising=False)
    monkeypatch.setenv("DB_DATABASE", "smartroute")
    monkeypatch.setenv("DB_USERNAME", "postgres")
    monkeypatch.setenv("DB_PASSWORD", "")
    monkeypatch.delenv("DB_PORT", raising=False)

    for driver in ("pgsql", "postgres", "postgresql"):
        monkeypatch.setenv("DB_CONNECTION", driver)
        assert settings._database_url().startswith(
            "postgres://postgres:@127.0.0.1:5432/smartroute"
        )
