import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Shared design tokens ────────────────────────────────────────────────────
const PRIMARY   = [37, 99, 235]   // blue-600
const LIGHT_BG  = [241, 245, 249] // slate-100
const DARK_TEXT = [30, 41, 59]    // slate-800
const MUTED     = [100, 116, 139] // slate-500
const WHITE     = [255, 255, 255]

function drawHeader(doc, title, subtitle, pageW) {
  doc.setFillColor(...PRIMARY)
  doc.rect(0, 0, pageW, 26, "F")
  doc.setTextColor(...WHITE)
  doc.setFontSize(15)
  doc.setFont("helvetica", "bold")
  doc.text(title, 14, 11)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(subtitle, 14, 19)
}

function drawFooter(doc, pageW) {
  const pageH = doc.internal.pageSize.height
  doc.setFillColor(...PRIMARY)
  doc.rect(0, pageH - 12, pageW, 12, "F")
  doc.setTextColor(...WHITE)
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.text(`Generated on ${new Date().toLocaleString()}`, 14, pageH - 4)
  doc.text("Travel Allowance Management System", pageW - 14, pageH - 4, { align: "right" })
}

// ─── 1. Schedule List PDF (enhanced) ─────────────────────────────────────────
export const exportSchedulePdf = (title, schedules) => {
  const doc = new jsPDF({ orientation: "landscape" })
  const pageW = doc.internal.pageSize.width

  drawHeader(doc, title, `Exported on: ${new Date().toLocaleDateString()}  |  Total Records: ${schedules.length}`, pageW)

  autoTable(doc, {
    startY: 32,
    head: [["#", "Patient Name", "Doctor Name", "Therapist Name", "Treatment Name", "Priority", "Status"]],
    body: schedules.map((s, i) => [
      String(i + 1),
      s.patient_name || "-",
      s.doctor_name || "-",
      s.therapist_name || "-",
      s.treatment_name || "-",
      s.priority || "-",
      s.status || "-",
    ]),
    styles: { fontSize: 8, cellPadding: 3, textColor: DARK_TEXT },
    headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: { 0: { cellWidth: 10 } },
    margin: { left: 14, right: 14 },
  })

  drawFooter(doc, pageW)
  doc.save(`${title}-${new Date().toISOString().substring(0, 10)}.pdf`)
}

// ─── 2. Claim Detail PDF ──────────────────────────────────────────────────────
// role: "therapist" | "admin"  — admin version includes approval/signature block
export const exportClaimDetailPdf = (claim, travels, role = "therapist") => {
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.width

  // Header bar
  doc.setFillColor(...PRIMARY)
  doc.rect(0, 0, pageW, 28, "F")
  doc.setTextColor(...WHITE)
  doc.setFontSize(15)
  doc.setFont("helvetica", "bold")
  doc.text("TRAVEL ALLOWANCE CLAIM", 14, 12)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text("Travel Allowance Management System", 14, 20)

  // Status pill (top right)
  const statusColors = { approved: [22, 163, 74], rejected: [220, 38, 38], pending: [217, 119, 6] }
  const sColor = statusColors[claim.status?.toLowerCase()] || statusColors.pending
  doc.setFillColor(...sColor)
  doc.roundedRect(pageW - 56, 7, 42, 14, 3, 3, "F")
  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...WHITE)
  doc.text((claim.status || "pending").toUpperCase(), pageW - 35, 15, { align: "center" })

  // ── Meta info block ──────────────────────────────────────────────────────
  let y = 34
  doc.setFillColor(...LIGHT_BG)
  doc.rect(14, y, pageW - 28, 30, "F")

  const infoItems = [
    { label: "Therapist",       value: claim.therapist_name || "-" },
    { label: "Claim Date",      value: String(claim.claim_date || "-") },
    { label: "Claim ID",        value: `#${claim.id}` },
    { label: "Patients Visited",value: String(claim.patient_count ?? 0) },
  ]
  infoItems.forEach((item, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const ix = 14 + col * ((pageW - 28) / 2) + 4
    const iy = y + 8 + row * 14
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...MUTED)
    doc.text(item.label.toUpperCase(), ix, iy)
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...DARK_TEXT)
    doc.text(item.value, ix, iy + 7)
  })

  // ── Travel entries table ─────────────────────────────────────────────────
  y = 70
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...DARK_TEXT)
  doc.text("Travel Entries", 14, y)

  autoTable(doc, {
    startY: y + 4,
    head: [["#", "Date", "Patient", "Transport", "From → To", "KM", "₹/KM", "Fare (₹)", "Bill (₹)"]],
    body: travels.map((t, i) => [
      String(i + 1),
      t.travel_date ? String(t.travel_date).substring(0, 10) : "-",
      t.patient_name || "-",
      t.transport_mode || "-",
      `${t.from_address}\n→ ${t.to_address}`,
      String(t.total_km ?? 0),
      `₹${t.per_km_rate ?? 0}`,
      `₹${(t.travel_fare ?? 0).toFixed(2)}`,
      t.bill_amount ? `₹${t.bill_amount}` : "-",
    ]),
    styles: { fontSize: 7.5, cellPadding: 3, textColor: DARK_TEXT, overflow: "linebreak" },
    headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 20 },
      2: { cellWidth: 25 },
      3: { cellWidth: 20 },
      4: { cellWidth: 52 },
      5: { cellWidth: 12 },
      6: { cellWidth: 14 },
      7: { cellWidth: 18 },
      8: { cellWidth: 14 },
    },
    margin: { left: 14, right: 14 },
  })

  // ── Financial summary box ────────────────────────────────────────────────
  const afterTableY = doc.lastAutoTable.finalY + 8
  const boxX = pageW - 100
  const boxW = 86

  doc.setFillColor(...LIGHT_BG)
  doc.rect(boxX, afterTableY, boxW, 48, "F")
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...DARK_TEXT)
  doc.text("Financial Summary", boxX + 4, afterTableY + 9)

  const financials = [
    { label: "Per KM Rate",      value: `₹${claim.per_km_rate ?? 0}` },
    { label: "Travel Total",     value: `₹${(claim.travel_total ?? 0).toFixed(2)}` },
    { label: "Daily Allowance",  value: `₹${(claim.daily_allowance ?? 0).toFixed(2)}` },
  ]
  financials.forEach((item, i) => {
    const ry = afterTableY + 18 + i * 9
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(item.label, boxX + 4, ry)
    doc.setTextColor(...DARK_TEXT)
    doc.text(item.value, boxX + boxW - 4, ry, { align: "right" })
  })

  // Grand total highlight bar
  const gtY = afterTableY + 44
  doc.setFillColor(...PRIMARY)
  doc.rect(boxX, gtY - 7, boxW, 11, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  doc.text("Grand Total", boxX + 4, gtY)
  doc.text(`₹${(claim.grand_total ?? 0).toFixed(2)}`, boxX + boxW - 4, gtY, { align: "right" })

  // ── Admin approval / signature block ─────────────────────────────────────
  if (role === "admin") {
    const sigY = afterTableY + 58
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...MUTED)
    doc.text("Approved By: ___________________________________", 14, sigY)
    doc.text(`Date: _______________________`, 14, sigY + 12)
    doc.text("Signature: ___________________________________", boxX, sigY)
  }

  drawFooter(doc, pageW)

  const safeName = (claim.therapist_name || "Therapist").replace(/\s+/g, "-")
  doc.save(`Claim-${safeName}-${claim.claim_date || "Date"}.pdf`)
}

// ─── 3. Claims List PDF ───────────────────────────────────────────────────────
export const exportClaimsListPdf = (title, claims) => {
  const doc = new jsPDF({ orientation: "landscape" })
  const pageW = doc.internal.pageSize.width

  drawHeader(
    doc,
    title,
    `Exported on: ${new Date().toLocaleDateString()}  |  Total Claims: ${claims.length}`,
    pageW
  )

  const body = claims.map((c, i) => [
    String(i + 1),
    String(c.claim_date || "-"),
    c.therapist_name || "-",
    String(c.total_km ?? 0),
    `₹${c.per_km_rate ?? 0}`,
    `₹${(c.travel_total ?? 0).toFixed(2)}`,
    `₹${(c.daily_allowance ?? 0).toFixed(2)}`,
    `₹${(c.grand_total ?? 0).toFixed(2)}`,
    String(c.patient_count ?? 0),
    (c.status || "pending").toUpperCase(),
  ])

  // Totals row
  const totals = claims.reduce(
    (acc, c) => ({
      km:        acc.km        + (c.total_km        ?? 0),
      travel:    acc.travel    + (c.travel_total     ?? 0),
      allowance: acc.allowance + (c.daily_allowance  ?? 0),
      grand:     acc.grand     + (c.grand_total      ?? 0),
      patients:  acc.patients  + (c.patient_count    ?? 0),
    }),
    { km: 0, travel: 0, allowance: 0, grand: 0, patients: 0 }
  )
  body.push([
    "", "TOTALS", "",
    totals.km.toFixed(2), "",
    `₹${totals.travel.toFixed(2)}`,
    `₹${totals.allowance.toFixed(2)}`,
    `₹${totals.grand.toFixed(2)}`,
    String(totals.patients), "",
  ])

  autoTable(doc, {
    startY: 32,
    head: [["#", "Date", "Therapist", "Total KM", "₹/KM", "Travel Total", "Daily Allow.", "Grand Total", "Patients", "Status"]],
    body,
    styles: { fontSize: 8, cellPadding: 3, textColor: DARK_TEXT },
    headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT_BG },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = "bold"
        data.cell.styles.fillColor = [219, 234, 254] // blue-100
        data.cell.styles.textColor = [30, 64, 175]   // blue-800
      }
    },
    margin: { left: 14, right: 14 },
  })

  drawFooter(doc, pageW)
  doc.save(`${title.replace(/\s+/g, "-")}-${new Date().toISOString().substring(0, 10)}.pdf`)
}

// ─── 4. Schedule Detail PDF ───────────────────────────────────────────────────
export const exportScheduleDetailPdf = (schedule) => {
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.width

  drawHeader(doc, "Schedule Details", `Exported on: ${new Date().toLocaleDateString()}`, pageW)

  let y = 34
  const section = (label, color = PRIMARY) => {
    doc.setFillColor(...color)
    doc.rect(14, y, 4, 12, "F")
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...DARK_TEXT)
    doc.text(label, 21, y + 8)
    y += 16
  }
  const field = (label, value) => {
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...MUTED)
    doc.text(label.toUpperCase(), 14, y)
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...DARK_TEXT)
    doc.text(String(value || "-"), 14, y + 7)
    y += 14
  }
  const field2 = (items) => {
    const colW = (pageW - 28) / items.length
    items.forEach((item, i) => {
      const x = 14 + i * colW
      doc.setFontSize(7.5)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(...MUTED)
      doc.text(item.label.toUpperCase(), x, y)
      doc.setFontSize(9)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...DARK_TEXT)
      doc.text(String(item.value || "-"), x, y + 7)
    })
    y += 14
  }

  // Patient
  section("Patient Information", [59, 130, 246])
  field("Patient Name", schedule.patient_name)
  field("Address", schedule.patient_address)

  // Assignment
  section("Assignment Configuration", [20, 184, 166])
  field2([
    { label: "Doctor",    value: schedule.doctor_name    || `ID: ${schedule.doctor_id}` },
    { label: "Therapist", value: schedule.therapist_name || `ID: ${schedule.therapist_id}` },
    { label: "Priority",  value: schedule.priority },
    { label: "Status",    value: schedule.status },
  ])

  // Treatment
  section("Treatment Information", [34, 197, 94])
  field2([
    { label: "Treatment Name", value: schedule.treatment_name },
    { label: "Medicines",      value: schedule.medicines },
  ])
  field("Special Instructions", schedule.instructions)

  // Schedule Logistics
  section("Schedule Logistics", [99, 102, 241])
  field2([
    { label: "Schedule Type", value: schedule.schedule_type === "one_time" ? "One Time Visit" : "Recurring" },
    { label: "In Time",  value: schedule.in_time },
    { label: "Out Time", value: schedule.out_time },
  ])
  if (schedule.schedule_type === "one_time") {
    field("Treatment Date", schedule.treatment_date)
  } else {
    field2([
      { label: "Start Date", value: schedule.start_date },
      { label: "End Date",   value: schedule.end_date },
    ])
  }

  // Outcome (only if present)
  if (schedule.completion_notes || schedule.missed_reason) {
    section("Outcome Notes", [249, 115, 22])
    if (schedule.completion_notes) field("Completion Notes", schedule.completion_notes)
    if (schedule.missed_reason)    field("Missed Reason",    schedule.missed_reason)
  }

  drawFooter(doc, pageW)
  const safeName = (schedule.patient_name || "Schedule").replace(/\s+/g, "-")
  doc.save(`Schedule-${safeName}-${schedule.treatment_date || schedule.start_date || "Date"}.pdf`)
}
