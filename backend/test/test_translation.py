from app.support.translation import (
    BATCH_SEPARATOR,
    TranslationOptions,
    TranslationService,
    chunk_text,
    languages_for_country,
    localize_places,
)


class FakeEngine:
    def __init__(self, calls):
        self.calls = calls

    def translate(self, text):
        self.calls.append(text)
        return BATCH_SEPARATOR.join(f"ខ្មែរ:{item}" for item in text.split(BATCH_SEPARATOR))


def service(calls, max_chars=20):
    return TranslationService(
        TranslationOptions(max_chars=max_chars, max_retries=1, concurrency=2, min_interval=0),
        engine_factory=lambda _source, _target: FakeEngine(calls),
    )


def test_country_base_language():
    assert languages_for_country("cambodia")[:2] == ("km", "en")
    assert languages_for_country("unknown") == ("en",)


def test_large_text_chunks_stay_under_provider_limit():
    chunks = chunk_text("First sentence. " + "word " * 20, max_chars=24)
    assert len(chunks) > 1
    assert all(len(chunk) <= 24 for chunk in chunks)


def test_batch_translation_deduplicates_and_preserves_order():
    calls = []
    translated = service(calls, max_chars=500).translate_many(["Market", "Hospital", "Market"], "km")
    assert translated == ["ខ្មែរ:Market", "ខ្មែរ:Hospital", "ខ្មែរ:Market"]
    assert calls == [f"Market{BATCH_SEPARATOR}Hospital"]


def test_localize_places_prefers_native_name_and_translates_missing_address():
    calls = []
    places = [{
        "name": "Olympic Market",
        "address": "Phnom Penh",
        "metadata": {"name_km": "ផ្សារអូឡាំពិក", "name_en": "Olympic Market"},
    }]
    localize_places(places, "cambodia", service(calls))
    assert places[0]["name"] == "ផ្សារអូឡាំពិក"
    assert places[0]["metadata"]["translations"]["name"]["en"] == "Olympic Market"
    assert places[0]["address"] == "ខ្មែរ:Phnom Penh"
    assert calls == ["Phnom Penh"]


def test_existing_translations_are_not_requested_again():
    calls = []
    places = [{
        "name": "Old name",
        "metadata": {"translations": {"name": {"km": "ឈ្មោះ"}, "address": {}}},
    }]
    localize_places(places, "cambodia", service(calls))
    assert places[0]["name"] == "ឈ្មោះ"
    assert calls == []
