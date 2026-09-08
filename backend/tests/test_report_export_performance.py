from datetime import datetime, timezone
from time import perf_counter

from app.services.report_export_service import (
    TabularReportSpec,
    build_tabular_report_response,
)


SPEC = TabularReportSpec(
    title="Report export scale test",
    filename_prefix="scale-test",
    sheet_name="Rows",
    headers=("Role", "Record ID", "Date", "Status", "Amount"),
    pdf_columns=(0, 1, 2, 3, 4),
    pdf_widths_mm=(35, 35, 45, 35, 35),
    currency_columns=(5,),
)
SNAPSHOT = datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc)


def _rows(count: int) -> list[list[object]]:
    return [
        ["Therapist" if index % 2 else "Doctor", index, "2026-09-04", "approved", 125.5]
        for index in range(count)
    ]


def _render(export_format: str, rows: list[list[object]]):
    started = perf_counter()
    response = build_tabular_report_response(
        rows,
        metadata=[("Snapshot", SNAPSHOT.isoformat())],
        export_format=export_format,
        snapshot=SNAPSHOT,
        spec=SPEC,
        row_limit=25_000,
        pdf_row_limit=2_000,
    )
    return response, perf_counter() - started


def test_maximum_csv_and_xlsx_exports_complete_within_guardrail():
    rows = _rows(25_000)
    csv_response, csv_seconds = _render("csv", rows)
    xlsx_response, xlsx_seconds = _render("xlsx", rows)

    assert csv_response.body.startswith(b"\xef\xbb\xbf")
    assert xlsx_response.body.startswith(b"PK")
    assert csv_response.headers["x-report-row-count"] == "25000"
    assert xlsx_response.headers["x-report-row-count"] == "25000"
    assert csv_seconds < 5
    assert xlsx_seconds < 20


def test_maximum_pdf_export_completes_within_guardrail():
    response, elapsed_seconds = _render("pdf", _rows(2_000))

    assert response.body.startswith(b"%PDF")
    assert response.headers["x-report-row-count"] == "2000"
    assert elapsed_seconds < 20
