/**
 * Build Excel (.xlsx) and PDF files from a plain table on the device — the
 * Reports module exports. Same libraries as the web app (SheetJS, jsPDF +
 * AutoTable), all pure JS, so this ships over the air.
 *
 * Both return base64 for utils/fileExport.saveBase64File.
 *
 * jsPDF is loaded only when a PDF is actually built, after the latin1
 * TextDecoder shim (see utils/latin1TextDecoder) — its PNG helper needs that
 * encoding at load time, and a failure there must never take down the screen
 * that merely imports this file.
 */
import "./latin1TextDecoder";
import * as XLSX from "xlsx";

export type Table = (string | number | null | undefined)[][];

/** First row = header. Column widths follow the longest cell (capped). */
export function tableToXlsxBase64(table: Table, sheetName: string): string {
  const ws = XLSX.utils.aoa_to_sheet(table.map((r) => r.map((c) => (c == null ? "" : c))));
  const cols = table[0]?.length ?? 0;
  ws["!cols"] = Array.from({ length: cols }, (_, i) => ({
    wch: Math.min(48, Math.max(8, ...table.map((r) => String(r[i] ?? "").length))),
  }));
  const wb = XLSX.utils.book_new();
  // Sheet names: max 31 chars, no []:*?/\
  XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet1");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

/**
 * Landscape A4: title + one subtitle line, then the table with a repeating
 * header row and page numbers. Wide tables shrink to fit the page width.
 */
export async function tableToPdfBase64(table: Table, title: string, subtitle: string): Promise<string> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20, 20, 24);
  doc.text(title, margin, margin + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 122);
  doc.text(subtitle, margin, margin + 24);

  const [head = [], ...body] = table.map((r) => r.map((c) => (c == null ? "" : String(c))));
  const cols = head.length || 1;
  autoTable(doc, {
    head: [head],
    body,
    startY: margin + 36,
    margin: { left: margin, right: margin, bottom: margin + 6 },
    tableWidth: pageW - margin * 2,
    styles: {
      font: "helvetica",
      fontSize: cols > 12 ? 6 : cols > 8 ? 7 : 8,
      cellPadding: 3,
      overflow: "linebreak",
      textColor: [30, 30, 36],
      lineColor: [226, 226, 231],
      lineWidth: 0.4,
    },
    headStyles: { fillColor: [20, 20, 24], textColor: [244, 244, 246], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 246, 248] },
    didDrawPage: () => {
      const n = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 150);
      doc.text(`Page ${n}`, pageW - margin, doc.internal.pageSize.getHeight() - 14, { align: "right" });
    },
  });

  const uri = doc.output("datauristring");
  return uri.slice(uri.indexOf("base64,") + "base64,".length);
}
