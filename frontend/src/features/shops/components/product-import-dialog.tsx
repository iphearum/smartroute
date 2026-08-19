"use client";
import { useRef, useState } from "react";
import { ApiError } from "@/shared/api/http";
import { Icon } from "@/shared/ui/icon";
import { toast } from "@/shared/ui/toast";
import { commerceApi } from "../api/commerce-api";
import type { ImportPreviewResult } from "../domain/commerce-types";

const COLUMN_LABELS: Record<string, string> = {
  name: "Product name",
  price: "Price",
  sku: "SKU",
  compare_at_price: "Compare-at price",
  category: "Category",
  description: "Description",
  quantity: "Quantity",
  variant_title: "Variant",
};

const TEMPLATE_HEADERS = [
  "name",
  "price",
  "sku",
  "category",
  "quantity",
  "compare_at_price",
  "variant_title",
  "description",
];

function templateCsv() {
  return (
    `${TEMPLATE_HEADERS.join(",")}\n` +
    "Kuy Teav (Pork),3.50,KT-PORK,food,20,4.00,Regular,Pork noodle soup\n" +
    "Iced Coffee,1.50,IC-01,cafe,60,,,\n"
  );
}

export function ProductImportDialog({
  businessId,
  branchId,
  onClose,
  onImported,
}: {
  businessId: number;
  branchId?: number;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<ImportPreviewResult | null>(null),
    [busy, setBusy] = useState(false),
    [fileError, setFileError] = useState<string | null>(null),
    [dragging, setDragging] = useState(false),
    [withStock, setWithStock] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = async (chosen: File) => {
    setFile(chosen);
    setPreview(null);
    setFileError(null);
    setBusy(true);
    try {
      setPreview(await commerceApi.previewProductImport(businessId, chosen));
    } catch (err) {
      setFileError(
        err instanceof ApiError ? err.message : "Could not read that file",
      );
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await commerceApi.commitProductImport(
        businessId,
        file,
        withStock ? branchId : undefined,
      );
      const parts = [
        `${result.created_products} product(s)`,
        `${result.created_variants} variant(s)`,
      ];
      if (result.stocked_variants) parts.push(`${result.stocked_variants} stocked`);
      toast.success(`Imported ${parts.join(", ")}`);
      if (result.skipped.length)
        toast.error(`${result.skipped.length} row(s) skipped — see details`);
      onImported();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Import failed",
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(
      new Blob([templateCsv()], { type: "text/csv" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "product-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="import-overlay" role="dialog" aria-modal="true" aria-label="Import products">
      <div className="import-dialog liquid-card liquid-popover">
        <header className="import-dialog-header">
          <strong className="text-sm">Import products</strong>
          <button onClick={onClose} aria-label="Close import" className="shop-edit-shop">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>

        <div className="import-dialog-body">
          <div
            className={`import-dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files[0];
              if (dropped) void choose(dropped);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
            }}
          >
            <Icon name="box" className="h-6 w-6" />
            <strong>{file ? file.name : "Drop a CSV or XLSX file"}</strong>
            <span>or click to browse · max 5MB</span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xlsm"
              className="sr-only"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) void choose(chosen);
              }}
            />
          </div>

          <button className="import-template-link" onClick={downloadTemplate}>
            <Icon name="database" className="h-3.5 w-3.5" />
            Download CSV template
          </button>

          {busy && !preview && <p className="place-detail-empty">Reading file…</p>}
          {fileError && <p className="import-file-error">{fileError}</p>}

          {preview && (
            <>
              <div className="import-summary">
                <span className="import-stat import-stat-ok">
                  {preview.valid_count} ready
                </span>
                {preview.errors.length > 0 && (
                  <span className="import-stat import-stat-bad">
                    {preview.errors.length} with problems
                  </span>
                )}
              </div>

              <div className="import-columns">
                <span className="import-columns-label">Detected columns</span>
                {Object.entries(preview.columns).map(([logical, header]) => (
                  <span key={logical} className="import-column-chip">
                    {COLUMN_LABELS[logical] ?? logical}
                    <small>← {header}</small>
                  </span>
                ))}
                {preview.ignored_columns.map((header) => (
                  <span key={header} className="import-column-chip import-column-ignored">
                    {header}
                    <small>ignored</small>
                  </span>
                ))}
              </div>

              {preview.rows.length > 0 && (
                <div className="import-table-wrap">
                  <table className="import-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Name</th>
                        <th>Price</th>
                        <th>SKU</th>
                        <th>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr key={row.row}>
                          <td>{row.row}</td>
                          <td>{row.name}</td>
                          <td>${Number(row.price).toFixed(2)}</td>
                          <td>{row.sku || "—"}</td>
                          <td>{row.quantity ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.valid_count > preview.rows.length && (
                    <p className="place-detail-empty px-1 pt-2">
                      Showing the first {preview.rows.length} of {preview.valid_count} valid rows.
                    </p>
                  )}
                </div>
              )}

              {preview.errors.length > 0 && (
                <details className="import-errors">
                  <summary>{preview.errors.length} row(s) will be skipped</summary>
                  <ul>
                    {preview.errors.slice(0, 30).map((error, index) => (
                      <li key={`${error.row}-${index}`}>
                        Row {error.row}: {error.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {branchId !== undefined &&
                Object.hasOwn(preview.columns, "quantity") && (
                  <label className="import-stock-toggle">
                    <input
                      type="checkbox"
                      checked={withStock}
                      onChange={(event) => setWithStock(event.target.checked)}
                    />
                    Also set branch stock from the quantity column
                  </label>
                )}
            </>
          )}
        </div>

        <footer className="import-dialog-footer">
          <button className="pos-tab" onClick={onClose}>
            Cancel
          </button>
          <button
            className="place-detail-add"
            disabled={busy || !preview || preview.valid_count === 0}
            onClick={() => void commit()}
          >
            {busy
              ? "Importing…"
              : preview
                ? `Import ${preview.valid_count} item(s)`
                : "Import"}
          </button>
        </footer>
      </div>
    </div>
  );
}
