import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { appConfig } from "../config/env";
import type { ClaimDetailsResponse } from "../types/claim";

export class ClaimPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimPdfError";
  }
}

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '"': "&quot;",
        "&": "&amp;",
        "'": "&#39;",
        "<": "&lt;",
        ">": "&gt;",
      })[character] ?? character
  );

const formatAmount = (value: number | null | undefined): string =>
  `INR ${(value ?? 0).toFixed(2)}`;

const formatDistance = (value: number): string =>
  `${value.toFixed(2)} KM`;

const buildClaimHtml = ({
  claim,
  travels,
}: ClaimDetailsResponse): string => {
  const rows =
    travels.length > 0
      ? travels
          .map(
            (travel) => `
              <tr>
                <td>${escapeHtml(travel.patient_name ?? "Not recorded")}</td>
                <td>${escapeHtml(travel.from_address)}</td>
                <td>${escapeHtml(travel.to_address)}</td>
                <td>${escapeHtml(travel.transport_mode)}</td>
                <td>${formatDistance(travel.total_km)}</td>
                <td>${formatAmount(travel.travel_fare)}</td>
                <td>${travel.patient_visited ? "Yes" : "No"}</td>
                <td>${escapeHtml(travel.status)}</td>
              </tr>
            `
          )
          .join("")
      : `
          <tr>
            <td colspan="8" class="empty">No travel entries are linked to this claim.</td>
          </tr>
        `;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 28px; }
          body {
            color: #1f2937;
            font-family: Arial, sans-serif;
            font-size: 11px;
            margin: 0;
          }
          header {
            background: #1B5E20;
            color: #ffffff;
            padding: 20px;
          }
          h1 { font-size: 21px; margin: 0 0 5px; }
          .subtitle { margin: 0; opacity: 0.9; }
          .summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin: 20px 0;
          }
          .metric {
            background: #F8F9FA;
            border: 1px solid #e5e7eb;
            padding: 12px;
          }
          .label {
            color: #6b7280;
            display: block;
            font-size: 9px;
            font-weight: bold;
            margin-bottom: 5px;
            text-transform: uppercase;
          }
          .value { font-size: 13px; font-weight: bold; }
          h2 { color: #1B5E20; font-size: 15px; margin: 24px 0 10px; }
          table {
            border-collapse: collapse;
            table-layout: fixed;
            width: 100%;
          }
          th {
            background: #e8f5e9;
            color: #1B5E20;
            font-size: 9px;
            text-align: left;
          }
          td, th {
            border: 1px solid #d1d5db;
            overflow-wrap: anywhere;
            padding: 7px;
            vertical-align: top;
          }
          .empty { color: #6b7280; padding: 18px; text-align: center; }
          footer {
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            margin-top: 24px;
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        <header>
          <h1>Travel Allowance Claim</h1>
          <p class="subtitle">Claim #${claim.id} | ${escapeHtml(
            claim.claim_date
          )}</p>
        </header>
        <section class="summary">
          <div class="metric"><span class="label">Status</span><span class="value">${escapeHtml(
            claim.status
          )}</span></div>
          <div class="metric"><span class="label">Total Distance</span><span class="value">${formatDistance(
            claim.total_km
          )}</span></div>
          <div class="metric"><span class="label">Per KM Rate</span><span class="value">${formatAmount(
            claim.per_km_rate
          )}</span></div>
          <div class="metric"><span class="label">Travel Total</span><span class="value">${formatAmount(
            claim.travel_total
          )}</span></div>
          <div class="metric"><span class="label">Daily Allowance</span><span class="value">${formatAmount(
            claim.daily_allowance
          )}</span></div>
          <div class="metric"><span class="label">Grand Total</span><span class="value">${formatAmount(
            claim.grand_total
          )}</span></div>
        </section>
        <h2>Travel Entries</h2>
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>From</th>
              <th>To</th>
              <th>Mode</th>
              <th>Distance</th>
              <th>Fare</th>
              <th>Visited</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <footer>
          Generated ${escapeHtml(new Date().toLocaleString("en-IN"))}
        </footer>
      </body>
    </html>
  `;
};

export const exportClaimPdf = async (
  details: ClaimDetailsResponse
): Promise<string> => {
  if (!appConfig.features.reportExports) {
    throw new ClaimPdfError(
      "PDF export is disabled for this environment."
    );
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new ClaimPdfError(
      "File sharing is unavailable on this device."
    );
  }

  let generatedFile: File | null = null;
  let reportFile: File | null = null;

  try {
    const result = await Print.printToFileAsync({
      html: buildClaimHtml(details),
    });

    if (result.numberOfPages < 1) {
      throw new ClaimPdfError(
        "The PDF renderer did not create a printable page."
      );
    }

    generatedFile = new File(result.uri);

    if (!generatedFile.exists || generatedFile.size <= 0) {
      throw new ClaimPdfError(
        "The PDF renderer did not create a valid file."
      );
    }

    const safeDate = details.claim.claim_date
      .slice(0, 10)
      .replace(/[^0-9-]/g, "_");
    reportFile = new File(
      Paths.cache,
      `claim_${details.claim.id}_${safeDate}.pdf`
    );

    if (reportFile.exists) {
      reportFile.delete();
    }

    generatedFile.move(reportFile);
    await Sharing.shareAsync(reportFile.uri, {
      dialogTitle: "Share Claim PDF",
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
    });

    return reportFile.name;
  } catch (error) {
    if (error instanceof ClaimPdfError) {
      throw error;
    }

    throw new ClaimPdfError(
      "The claim PDF could not be generated. Please try again."
    );
  } finally {
    for (const file of [generatedFile, reportFile]) {
      try {
        if (file?.exists) {
          file.delete();
        }
      } catch {
        // Temporary cleanup must not replace the export result.
      }
    }
  }
};
