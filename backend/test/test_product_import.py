import io
from decimal import Decimal

import pytest

from app.support.product_import import ProductImportError, map_columns, parse_products


def csv_bytes(text: str) -> bytes:
    return text.encode("utf-8")


def xlsx_bytes(rows: list[list]) -> bytes:
    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_map_columns_accepts_alias_spellings():
    mapping, ignored = map_columns(["Product Name", "Unit Price", "QTY", "Colour"])
    assert mapping["name"] == 0
    assert mapping["price"] == 1
    assert mapping["quantity"] == 2
    assert ignored == ["Colour"]


def test_parse_products_reads_a_basic_csv():
    payload = csv_bytes("name,price,category,qty\nKuy Teav,3.50,food,20\nIced Coffee,1.50,cafe,60\n")
    preview = parse_products("menu.csv", payload)
    assert preview.valid_count == 2
    assert preview.errors == []
    first = preview.rows[0]
    assert first.name == "Kuy Teav"
    assert first.price == Decimal("3.50")
    assert first.category == "food"
    assert first.quantity == 20


def test_parse_products_reads_xlsx():
    payload = xlsx_bytes([
        ["Name", "Price", "SKU"],
        ["Lort Cha", 3.0, "lc-01"],
    ])
    preview = parse_products("menu.xlsx", payload)
    assert preview.valid_count == 1
    assert preview.rows[0].name == "Lort Cha"
    assert preview.rows[0].price == Decimal("3")
    assert preview.rows[0].sku == "LC-01"


def test_parse_products_tolerates_currency_and_thousand_separators():
    payload = csv_bytes("name,price\nFamily Set,\"$1,250.00\"\n")
    preview = parse_products("menu.csv", payload)
    assert preview.rows[0].price == Decimal("1250.00")


def test_parse_products_collects_row_errors_without_failing_the_file():
    payload = csv_bytes(
        "name,price\n"
        "Good Item,3.50\n"
        ",2.00\n"
        "No Price,\n"
        "Bad Price,abc\n"
    )
    preview = parse_products("menu.csv", payload)
    assert preview.valid_count == 1
    assert [error["row"] for error in preview.errors] == [3, 4, 5]
    assert "Missing product name" in preview.errors[0]["message"]


def test_parse_products_rejects_duplicate_sku_within_file():
    payload = csv_bytes("name,price,sku\nA,1.00,DUP\nB,2.00,dup\n")
    preview = parse_products("menu.csv", payload)
    assert preview.valid_count == 1
    assert "Duplicate SKU" in preview.errors[0]["message"]


def test_parse_products_rejects_compare_at_price_below_price():
    payload = csv_bytes("name,price,compare at price\nA,5.00,3.00\n")
    preview = parse_products("menu.csv", payload)
    assert preview.valid_count == 0
    assert "lower than price" in preview.errors[0]["message"]


def test_parse_products_rejects_negative_price():
    payload = csv_bytes("name,price\nA,-1.00\n")
    preview = parse_products("menu.csv", payload)
    assert preview.valid_count == 0
    assert "cannot be negative" in preview.errors[0]["message"]


def test_parse_products_requires_name_and_price_columns():
    with pytest.raises(ProductImportError, match="Missing required column"):
        parse_products("menu.csv", csv_bytes("item,cost\nA,1\n"))


def test_parse_products_rejects_legacy_xls():
    with pytest.raises(ProductImportError, match="Legacy .xls"):
        parse_products("menu.xls", b"\xd0\xcf\x11\xe0rubbish")


def test_parse_products_rejects_empty_file():
    with pytest.raises(ProductImportError, match="empty"):
        parse_products("menu.csv", b"   ")


def test_parse_products_skips_blank_rows():
    payload = csv_bytes("name,price\nA,1.00\n\n\nB,2.00\n")
    preview = parse_products("menu.csv", payload)
    assert preview.valid_count == 2


def test_parse_products_handles_semicolon_delimited_csv():
    payload = csv_bytes("name;price;category\nNum Banh Chok;2.50;food\n")
    preview = parse_products("menu.csv", payload)
    assert preview.valid_count == 1
    assert preview.rows[0].name == "Num Banh Chok"
