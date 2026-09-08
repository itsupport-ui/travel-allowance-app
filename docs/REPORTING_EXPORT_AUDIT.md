# Reporting and Export Audit

**Product:** Travel Allowance  
**Audit date:** 30 August 2026  
**Primary objective:** Deliver simple, trustworthy PDF, XLSX, and CSV reports for administrators, doctors, and therapists  
**Companion documents:** [Web and Mobile Product Audit](./PRODUCT_UX_UI_AUDIT.md) and [Complete Business Logic Audit](./BUSINESS_LOGIC_AUDIT.md)

## Current implementation status â€” 6 September 2026

**Latest reporting completion:** Doctor expense reports use reviewer-approved reimbursement amounts while retaining submitted fares as bill amounts. Incomplete export jobs never expose a download URL. Large snapshots are committed as queued jobs before rendering, processed in an independent database session, recover stale processing safely, and record queued/completed/failed events. Web and Android poll queued/processing jobs and provide distinct failure/expiry guidance. Android administrator and self-service report flows now explicitly offer **Save** through the system folder picker or **Share** through the system share sheet; temporary cache artifacts are validated and removed after delivery. Completed queued artifacts can now use a private S3-compatible bucket with encrypted writes, checksum validation, authorized proxy downloads, immutable bucket/key locators, and retention deletion; database storage remains the backward-compatible default. Administrator claim KPIs now include both professions and are contract-tested against the consolidated register for the same default scope. Automated scale gates render the supported maxima of 25,000 CSV/XLSX rows and 2,000 PDF rows within bounded budgets. An administrator-only operations health contract and web/Android panel expose queued, processing, stale, recent-failure, cleanup-backlog, and storage-readiness signals without infrastructure identifiers or report data. A daily production retention workflow is included.

This section supersedes earlier implementation counts and open-item statements below. The privacy-safe organization exception export remains unchanged, but it is no longer the only exception surface. A separate permission-protected location-exception review queue is now implemented on administrator web and Android: doctors/therapists submit fresh evidence and a reason, reviewers see the minimum decision evidence, must record a decision reason, and approve a one-time action or reject it. This operational queue intentionally remains separate from downloadable exports, whose default columns continue to exclude precise coordinates and free-text reasons.

The full backend suite passes **181 tests** and migration head is `0026_operational_follow_ups`. Location-exception review displays the immutable policy version and radius used for the decision; early-closure review supports `acknowledged` or `follow_up_required`; manual therapist travel and doctor expenses have separate revisioned approve/request-changes queues on web and Android; and consultation cancellation/rescheduling/follow-up now retains linked, versioned history used by the clinical-activity source records. Approved or cancelled manual financial exceptions are removed from the operational exception register, while downloadable exports continue to omit precise locations, proof paths, patients, remarks, free-text reasons, and consultation lifecycle reasons by default. The expense register now exposes privacy-safe category and exception-review status consistently across snapshot formats, and its currency mapping correctly targets reimbursable/bill amounts rather than the claim ID. Daily therapist and doctor claim submission now previews and commits through one shared server calculation path, reducing the risk that operational claim totals diverge before they reach the reporting snapshots. Staff, reimbursement/location-policy, and push-registration changes also join the centralized audit history without exposing contact, credential, push-token, or installation values. Staff-deactivation override request, decision, stale/expiry, consumption, and final access-change events are now available in that same authorized history. Android claim submissions can also enter the account-scoped secure offline queue; their stable operation IDs are reused on replay and appear as centralized audit correlation without placing payloads in the audit log.

Export lifecycle events now also write through to the centralized operational audit log for generation completion, idempotent reuse, generation failure, successful download, and expired-artifact failure. The event uses report type, scope, format, job/snapshot correlation, row count/size where applicable, actor, role, and outcome without exporting report rows or private source fields into the shared timeline. Authorized administrators can inspect and filter these events beside related clinical, attendance, financial, location, and scheduling changes on web/Android; the existing export-specific history/checksum/retry views remain the detailed delivery ledger. Objective organization and self-service performance summaries are now available in PDF, XLSX, and CSV. They expose workload, attendance, completed/missed clinical activity, travel/reimbursement, and claim totals without patient data or a composite score/ranking. A shared cross-domain follow-up queue now supports active-admin ownership, priority, due date, status, reasoned resolution, optimistic version checks, and audit history on web/Android; the four administrator exception-review queues now open a privacy-safe prefilled follow-up, while handoff from other source screens remains incremental UX work. Web lint/build pass, Android lint/TypeScript and **11 offline/export/draft-policy unit tests** pass, and **62 desktop/mobile-responsive Playwright checks** pass. Reporting/export priorities that remain open are production private-storage configuration and external alert routing, native Android export automation/device validation, stakeholder-defined composite KPI interpretations, deeper dashboard-to-export financial reconciliation, and additional source-screen shortcuts beyond the four administrator exception-review queues.

Administrator dashboard counts now use an organization-scoped, cross-profession contract for active staff, today's scheduled/completed/missed clinical activity, claims, and open follow-ups. Web and Android no longer present a therapist-self dashboard request as an organization total, and a backend contract test plus desktop/mobile-responsive browser checks protect the consolidated behavior.

Final repository verification on 6 September 2026 confirms 181 backend tests, 62 responsive browser checks, 11 mobile unit tests, web/mobile static checks, the web production build, and migration head `0026`. Web production dependencies audit clean and Expo Doctor passes 18/18 checks. Native Android save/share automation and production private-storage, worker, scheduler, retention, and alert configuration remain deployment acceptance work.

| Reporting recommendation | Current disposition |
|---|---|
| Privacy-safe organization exception register | **Implemented in PDF/XLSX/CSV** |
| Location-exception decision queue | **Implemented separately on administrator web/Android** |
| Early-closure decision queue | **Implemented separately on administrator web/Android without changing privacy-safe export defaults** |
| Manual therapist-travel decision queue | **Implemented separately on administrator web/Android with correction/resubmission history** |
| Doctor manual-expense review | **Implemented with category/review status in exports and unresolved-item claim blocking** |
| Central export audit visibility | **Implemented through write-through operational events plus existing detailed export history/checksum/retry records on web/Android** |
| Export operations health | **Implemented as an administrator-only API and web/Android status panel for queue, stale-job, failure, cleanup, and storage-readiness signals** |
| Objective staff performance reports | **Implemented for organization and self scope in PDF/XLSX/CSV without patient data or subjective rankings** |
| Cross-domain follow-up assignment and resolution | **Implemented as a permission-protected web/Android queue; automatic source-screen handoff remains incremental** |
| Exporting precise location evidence/reasons by default | **Intentionally excluded** |

## Implementation update â€” 31 August 2026

The Report Center now has five shared three-format families: consolidated claims, attendance/workdays, travel/expense detail, clinical activity, and an administrator operational-exception register. The exception register identifies open and early-ended workdays, active or missed sessions, rejected plans/claims, and manual financial entries, with record IDs, ageing, evidence presence, and a suggested next action. It deliberately excludes patient data, locations, clinical text, proof paths, and free-text reasons. Claims, attendance, expenses, and clinical activity are available for organization scope and doctor/therapist self scope; exceptions are organization-only. All families honor report-specific period/status/role/staff filters, prevent spreadsheet formula injection, cap oversized exports, and use one reusable tabular renderer. A preview persists exact privacy-safe rows plus report-specific summaries for 24 hours; PDF, XLSX, and CSV render from that immutable snapshot. Small exports use an idempotent retained job containing exact bytes, filename, MIME type, size, checksum, totals/summary, and expiry; all web and Android role surfaces create or reuse that job before download/share. Expired artifact bytes and snapshots share one idempotent retention service used by previews and a scheduler-ready CLI, while durable audit history is intentionally preserved. Privacy-safe lifecycle events record generation completion/reuse/conflict plus successful and authorized expired downloads; administrators see recent failures on web and Android. The complete backend suite passes **124 tests**, and migration head is `0014_report_export_events`. A queued worker/object store, production scheduler hookup, client automation, performance summaries, and true exception decision/override workflows remain open.

Playwright verifies that one administrator preview enables retained PDF, XLSX, and CSV artifacts with the correct server-delivered filenames at both desktop and mobile-responsive widths. It also verifies persistent expired-artifact guidance, preview recovery, individual-doctor scope, reasoned exception reviews, and permission-protected operational-audit filtering. The complete web suite has **36 passing checks**. Field-role export delivery, retry reuse, other failure modes, and native Android client automation remain open.

| Audit recommendation | Disposition |
|---|---|
| Therapist-only administrator claim data | **Resolved: therapist and doctor claims are consolidated** |
| Web has no downloads | **Resolved: PDF, XLSX, and CSV are available** |
| Excel shown as unavailable | **Resolved for administrator claim register** |
| Client-side CSV/XLSX generation | **Resolved: server generated** |
| Doctor individual claim statement | **Implemented on web and Android** |
| One immutable preview snapshot across PDF/XLSX/CSV | **Implemented for admin and field claim reports with 24-hour expiry** |
| Role-authorized catalogue and preview | **Implemented for claims, attendance/workdays, travel/expenses, clinical activity, and organization exceptions** |
| Doctor/therapist My Reports | **Implemented with custom dates, presets, and status on web/Android** |
| Snapshot expiry | **Implemented at 24 hours** |
| Opportunistic expired-row cleanup | **Implemented on preview** |
| Persistent export audit history and checksums | **Implemented with self/organization authorization** |
| Web field-user recent history and retry | **Implemented until snapshot expiry** |
| Web administrator organization history/retry | **Implemented with requester/checksum metadata** |
| Android field-user history/share-again | **Implemented until snapshot expiry** |
| Web/Android field and administrator history/retry | **Implemented with scope authorization** |
| Idempotent jobs and retained artifacts for bounded claim exports | **Implemented synchronously with 24-hour expiry** |
| Retention sweep | **Cleanup service, CLI, and daily GitHub Actions schedule are implemented; deployment must configure `PRODUCTION_DATABASE_URL`** |
| Queued large-export processing | **Implemented with durable job state, stale-worker recovery, client polling, and retry-safe reuse** |
| Private external object storage | **Implemented for completed queued artifacts through optional S3-compatible storage; deployment credentials, bucket policy, and monitoring remain environment work** |
| Attendance/workday organization and self reports | **Implemented on web/Android in PDF, XLSX, and CSV** |
| Travel/expense organization and self reports | **Implemented on web/Android in PDF, XLSX, and CSV** |
| Clinical activity organization and self reports | **Implemented for therapist treatments and doctor consultations/visits/plans on web/Android in PDF, XLSX, and CSV** |
| Organization exception register | **Implemented on web/Android in PDF, XLSX, and CSV; domain decision queues and the shared assignment/resolution follow-up queue are also implemented** |
| Individual staff export filter | **Implemented symmetrically on web/Android for doctors and therapists; selecting a role exposes only matching staff and invalidates the prior preview** |
| Objective performance-summary catalogue | **Implemented for administrators, doctors, and therapists; any composite score or ranking remains deferred until stakeholders approve its definition** |
| Automated client export-flow coverage | **Substantially implemented on web: the 60-check Playwright suite validates administrator and therapist/doctor self-service preview/download flows, PDF/XLSX/CSV delivery, shared snapshots, filenames, expiry recovery, role scoping, objective performance preview, operational claim readiness, related review queues, and audit filtering at desktop/mobile widths; native Android automation remains open** |

The detailed sections below preserve the original audit baseline. The implementation update and disposition table above are authoritative for current behavior.

## 1. Executive summary

Reporting now has a **cross-profession Report Center** for claims, attendance/workdays, travel/expenses, clinical activity, operational exceptions, and objective performance. Administrators can export organization-wide or role-filtered records, while doctors and therapists receive self-scoped reports. Every implemented family supports PDF/XLSX/CSV, report-specific previews, retained artifacts, and authorized history.

The remaining reporting work is primarily deployment and interpretation: production private-storage/worker/retention/alert configuration, native Android delivery validation, stakeholder-owned definitions for any composite KPI, and deeper reconciliation between dashboard time windows and export filters. Domain-specific decision queues and a shared owner/due-date/resolution follow-up queue now complement the privacy-safe exception export.

Web and Android administrators preview and download the consolidated claim register in all three required formats from one immutable snapshot. Field users have the same self-scoped preview/export flow. Large snapshots use durable queued processing; completed artifacts can use optional private S3-compatible storage, while database storage remains the backward-compatible default.

The recommended direction is a **server-owned Report Center** with one report catalogue, calculation path, permission model, and export pipeline. Administrators should receive organization-wide and role-specific reports. Doctors and therapists should receive a simpler â€œMy Reportsâ€ experience restricted to their own records. Web and mobile should preview and request the same report, then download or share the same server-generated artifact.

Reporting correctness depends on the underlying operational states. The former rejected-claim, business-date, mutable-rate, snapshot, and critical export-audit visibility gaps are now fixed and covered by tests. Remaining dashboard reconciliation, performance interpretation, override governance, and exception-policy work is tracked in the [Complete Business Logic Audit](./BUSINESS_LOGIC_AUDIT.md).

### Overall assessment

| Dimension | Assessment | Summary |
|---|---|---|
| Therapist document coverage | High | Claims, workdays, travel detail, treatment activity, and an objective self-performance summary have self-service PDF/XLSX/CSV; self-service exception reporting remains limited. |
| Doctor report coverage | High | Claims, workdays, expense detail, consultations, visits, treatment plans, and an objective self-performance summary have self-service and organization PDF/XLSX/CSV. |
| Administrator reporting | High for implemented catalogue | Claims, attendance/workdays, travel/expenses, clinical activity, operational exceptions, and objective staff performance include retained artifacts and organization history; shared exception assignment/resolution remains open. |
| Web export experience | High for implemented families | Admin and field exports support report-specific filters, preview, retained PDF/XLSX/CSV, progress feedback, and authorized history/retry. |
| Mobile export experience | High at code level for implemented families | All formats use the same retained server artifact and history flow, with explicit system-folder Save and system-sheet Share choices; physical Android validation remains open. |
| Data consistency | High for implemented exports | Preview and PDF/XLSX/CSV use the same immutable row snapshot; dashboard and broader operational-report reconciliation remain open. |
| Scalability | High at application level, deployment pending | Server filtering, row caps, immutable snapshots, durable queued processing, stale-job recovery, polling, retention, and optional private S3-compatible storage protect current reports; bucket deployment and production load evidence remain required. |
| Security and auditability | High for implemented exports | Current-role authorization, privacy-safe columns, expiry, checksums, immutable artifacts, successful-download audit history, and generation/download lifecycle events are implemented; broader security monitoring remains open. |
| Test confidence | High at backend/web-contract level | The full backend suite passes 181 tests, including cross-domain follow-up authorization/transitions/audit, performance reports, the five earlier report families, operations-health authorization/backlog classification, maximum-size CSV/XLSX/PDF rendering budgets, dashboard-to-register claim reconciliation, idempotent retention, optional private artifact storage, operational claim readiness, staff-deactivation governance, and request-correlation coverage; 62 Playwright checks cover the consolidated administrator dashboard, follow-up creation/resolution, preview-to-PDF/XLSX/CSV delivery, performance preview, health visibility, claim readiness, and staff override behavior at desktop/mobile widths, while 11 mobile tests cover queue date/expiry/deduplication/replay rules. Native Android automation remains open. |

### Highest-priority recommendations

1. Turn the implemented exception register into an assignable cross-domain follow-up workflow; keep the implemented performance report objective until stakeholders approve any composite score or ranking.
2. Enable the implemented private S3-compatible storage in production with least-privilege bucket access, then add worker/runtime monitoring and alerts.
3. Send the implemented failure lifecycle events to production monitoring and alert on repeated render, conflict, expiry, or download failures.
4. Add browser/Android automation for preview invalidation, expiry recovery, and PDF/XLSX/CSV delivery.
5. Validate the implemented Android Save/Share choices on representative OS versions and document folder-picker cancellation and permission behavior.
6. Complete report-specific permissions, privacy defaults, export audit logs, and automated client-flow coverage.
7. Add automated web/Android export-flow tests plus large-dataset, cleanup, and reconciliation coverage before broad rollout.

## 2. Evidence and scope

### Evidence levels

- **Code verified:** Confirmed in current pages, services, backend routers, schemas, models, configuration, or tests.
- **Previously live verified:** Role authentication, dashboards, and responsive shells were verified during the main product audit.
- **Live attempt inconclusive:** A new read-only deep-link check of the deployed reporting pages was attempted without activating exports, but the deployed service did not complete within the audit window. No runtime-only claim is based on that attempt.
- **Recommended:** Proposed target behavior that does not yet exist.

### Files and behaviors reviewed

- Web administrative Reports, therapist claim pages, doctor claim pages, schedule pages, PDF utility, and report services.
- Mobile administrative Reports, report dashboard/export panel, therapist claim detail PDF, doctor claim details/proof sharing, feature flags, file/print/share services, and report types.
- Backend administrative reporting, therapist claims, doctor claims/expenses/workdays/visits/consultations, permissions, schemas, and report tests.

### Safety and limitations

- No report was generated from deployed operational-style data.
- No claim, schedule, expense, attendance, consultation, or approval record was changed.
- No credentials, tokens, patient names, addresses, coordinates, clinical notes, receipts, or generated files are included here.
- Android native save/share behavior remains code-verified rather than device-verified because no emulator or device was attached.

## 3. What currently counts as a report

The product uses â€œreportâ€, â€œPDFâ€, â€œinvoiceâ€, â€œproofâ€, and â€œexportâ€ for different artifacts. These should be separated conceptually:

| Artifact | Purpose | Current examples | Should be treated as |
|---|---|---|---|
| Dashboard | Monitor aggregated activity | Admin Operational Reports | Interactive report preview |
| Statement | Explain a financial submission | Therapist claim-detail PDF | Formal report/document |
| List export | Analyze multiple records | Mobile admin therapist-claims CSV | Dataset export |
| Operational printout | Preserve a work list | Web schedule list PDFs | Transactional list, not an analytics report |
| Invoice/receipt/proof | Evidence attached to one entry | Travel invoices and doctor expense proofs | Source attachment, not a generated report |
| Report package | Summary, filters, totals, details, generation metadata | Not consistently implemented | Target reporting product |

Keeping these categories distinct prevents a receipt-download button from being mistaken for doctor reporting coverage.

## 4. Current capability matrix

Legend: **Yes** = implemented; **Partial** = limited format/scope or indirect access; **No** = not implemented.

### By role and platform

| Capability | Admin web | Admin mobile | Therapist web | Therapist mobile | Doctor web | Doctor mobile |
|---|---:|---:|---:|---:|---:|---:|
| View role dashboard metrics | Yes | Yes | Yes | Yes | Yes | Yes |
| View dedicated reporting dashboard | Yes | Yes | No | No | No | No |
| Filter reports by date | Yes | Yes | No | No | Partial lists | Partial lists |
| Filter by staff member | Therapist only | Therapist only | N/A | N/A | N/A | N/A |
| Filter by claim status | Therapist claims | Therapist claims | Partial lists | Partial lists | Partial lists | Partial lists |
| Organization PDF export | No | Therapist claims only | N/A | N/A | N/A | N/A |
| Organization CSV export | No | Therapist claims only | N/A | N/A | N/A | N/A |
| Organization XLSX export | No | No | N/A | N/A | N/A | N/A |
| Print report | No | Disabled/planned control | Browser can print manually | System share only | Browser can print manually | System share only |
| Own claim list PDF | No direct report | No direct report | Yes | No | No | No |
| Own claim-detail PDF | Admin therapist detail | No equivalent report | Yes | Yes | No | No |
| Claim/expense proof access | Therapist invoices and doctor proofs | Doctor proofs | Travel invoice | Travel invoice/share | Limited in own view | Yes, view/share receipt |
| Attendance/workday report | No | No | No | No | No | No |
| Schedule/treatment report | Legacy list PDFs on selected pages | Dashboard only | Completed/missed list PDFs | No period export | No | No |
| Consultation/visit/plan report | No | No | N/A | N/A | No | No |
| Expense/travel period report | Therapist aggregate only | Therapist aggregate only | No formal period report | No formal period report | No | No |
| Combined therapist + doctor reimbursement | No | No | N/A | N/A | N/A | N/A |
| Export history/status | No | No | No | No | No | No |

### Current formats

| Format | Current implementation | Main limitation |
|---|---|---|
| PDF | Web client PDFs for therapist claims/schedules; mobile therapist claim PDF; mobile admin therapist-claims PDF | Different templates and data sources; no doctor or web-admin report parity |
| CSV | Mobile admin therapist-claims export | Client-side, therapist-only, no web equivalent |
| XLSX | Not implemented | Excel appears as a disabled planned control on mobile |
| Print | Not implemented as a report action | Mobile displays a disabled planned control; browser printing is not a designed report |
| Source files | Travel invoices and doctor proof PDF/images | Evidence only; does not summarize records or calculations |

## 5. Current implementation flow

### Administrative report preview

1. Web/mobile requests `GET /admin-reports/overview`.
2. Backend aggregates `TreatmentSchedule`, `TravelEntry`, therapist `Claim`, and therapist `User` data.
3. Optional filters are date range, therapist, and therapist claim status.
4. Response includes KPIs, 14-day trends, claim-status counts, top therapists, recent therapist activity, and generated insights.

Doctor models are not queried. The endpoint cannot answer doctor-related reporting questions even though those records exist elsewhere in the backend.

### Mobile administrative CSV export

1. User expands/locates the export area and selects CSV.
2. Mobile requests all therapist claims from `GET /claims/all`.
3. Mobile filters the full list again by date, status, and therapist name.
4. Mobile builds a CSV in memory, writes a cache file, opens the system share sheet, and deletes the temporary file after the share interaction.

### Mobile administrative PDF export

1. Mobile separately requests the report summary and all therapist claims.
2. It applies its own row limits: 50,000 for CSV and 2,000 for PDF.
3. It builds HTML and renders a landscape PDF on the device.
4. It moves the file in cache, opens the share sheet, reports success, and deletes temporary files.

The PDF title is â€œAdministrative Claims Reportâ€, while part of its summary comes from broader treatment/travel metrics. It is not a complete copy of the interactive report: charts, top-therapist detail, recent activity, and insights are absent.

### Therapist documents

- Web can generate therapist claim list/detail PDFs and selected schedule list/detail PDFs using `jsPDF`.
- Mobile can generate and share a therapist claim-detail PDF using `expo-print` and `expo-sharing`.
- Travel invoice files can be downloaded/opened separately.
- No single therapist period report combines attendance, assigned/completed treatments, travel, allowances, and claims.

### Doctor documents

- Doctor claim lists, claim details, expenses, and proof-file endpoints exist.
- Mobile doctor claim details can download and share an individual expense proof.
- Admin web/mobile can retrieve proofs during doctor claim review.
- No doctor claim PDF, expense statement, activity report, attendance report, or aggregated doctor export exists.

## 6. What is working well

- The administrative overview already provides a useful summary/trend/activity response shape.
- Backend report tests verify filters, invalid date ranges, admin permission, and exclusion of patient details from the overview.
- Mobile CSV generation protects against spreadsheet formula injection.
- Mobile checks generated file existence/size and reports renderer, storage, and sharing failures separately.
- Mobile disables concurrent exports and applies explicit row limits.
- PDF/CSV filenames include the generation date.
- Feature flags allow exports to be disabled per mobile environment.
- Doctor proof downloads are authorization-protected and support PDF/image MIME types.
- The underlying doctor data needed for reporting is already modeled: workdays, consultations, visits, treatment plans, expenses, claims, and doctor identity.

These foundations can be reused, but they should be moved behind a shared reporting contract instead of extended independently on each client.

## 7. Confirmed implementation issues

### 7.1 Reporting is structurally therapist-only

`/admin-reports/overview` imports and queries therapist schedules, therapist travel, therapist claims, and therapist users. It does not import or query doctor workdays, consultations, visits, treatment plans, expenses, or claims.

**Impact:** administrator totals are incomplete if stakeholders interpret â€œOperational Reportsâ€ as organization-wide. Doctor workload and reimbursement remain invisible, and comparisons between roles are impossible.

### 7.2 Web report export is missing

**Current status: resolved for all implemented Report Center families.** Admin web now provides preview-gated PDF, XLSX, and CSV downloads for claims, attendance/workdays, travel/expenses, clinical activity, and operational exceptions. Approved performance summaries remain outside the catalogue.

The web Reports page renders filters, KPIs, a treatment trend, claim statuses, top therapists, and recent activity. It imports no export utility and renders no PDF, XLSX, CSV, Download, or Print control.

**Impact:** administrators must manually copy data, take screenshots, or depend on mobile for a subset of reporting. This is particularly inappropriate for spreadsheet analysis, finance review, and large-screen administrative work.

### 7.3 Doctor proof access is not doctor reporting

**Current status: partially resolved.** Doctors now have individual claim statements plus self-scoped claim, attendance/workday, and expense-detail reports on web/Android. Consultation, visit, treatment-plan, and performance reports remain open.

Doctor screens allow claim/expense inspection and, on mobile, proof sharing. Proof files are source evidence only. There is no generated document that explains claim total, included expenses, dates, visits, approvals, rejection reasons, or calculation rules.

**Impact:** doctors cannot produce a clear statement for personal records, reconciliation, or dispute resolution.

### 7.4 Preview and export can disagree

**Current status: resolved for all implemented Report Center families.** Preview creates a 24-hour immutable row snapshot and each format uses its snapshot ID. Administrator dashboard KPI reconciliation remains separate and is not claimed as resolved.

The interactive summary comes from `/admin-reports/overview`; exported rows come from `/claims/all` and are filtered in mobile code. The two requests can run at different times and use different filtering implementations.

**Impact:** a claim submitted or reviewed between calls can change totals. A user may see one figure on screen and another in the file without any snapshot timestamp explaining the difference.

### 7.5 Export generation is duplicated across clients

**Current status: resolved for shared tabular reports.** Claims, attendance/workdays, and travel/expenses use the same server-owned PDF/XLSX/CSV renderer across web and Android. Older document-specific claim/schedule PDFs remain separate templates by design.

Web uses `jsPDF`; mobile therapist PDF uses HTML plus `expo-print`; mobile admin PDF has a separate HTML template; CSV is another mobile-only implementation.

**Impact:** column names, totals, status formatting, privacy rules, fonts, page breaks, and fixes can diverge. Adding doctor reports would multiply this maintenance burden.

### 7.6 Mobile export is a share flow, not a download flow

The app relies on the operating-system share sheet and removes cached artifacts afterward. There is no persistent â€œDownloadedâ€, â€œSaved toâ€¦â€, â€œRecent exportsâ€, or â€œTry sharing againâ€ location in the app.

**Impact:** users must understand the share sheet and choose an external destination correctly. A success alert does not guarantee that the file was saved somewhere the user can later find.

### 7.7 The mobile feature flag can silently remove exports

The export panel is rendered only when `EXPO_PUBLIC_ENABLE_REPORT_EXPORTS` is true. When false, users see no explanation or disabled state. Preview builds explicitly enable it; production depends on external environment configuration.

**Impact:** builds can unexpectedly have different reporting capability, producing support confusion and inconsistent acceptance results.

### 7.8 `/claims/all` is not export-grade

**Current status: bypassed for new claim exports, legacy risk remains.** New Report Center and admin downloads use server-filtered, set-based claim queries with row limits; older consumers of `/claims/all` still inherit this endpoint's scaling characteristics.

The endpoint returns every therapist claim without pagination. It also queries travel entries separately for each claim to calculate patient count.

**Impact:** this N+1 query pattern and full-data transfer will become slow and memory-heavy as records grow. The 50,000-row mobile CSV limit does not protect the backend or network because all rows are fetched before validation.

### 7.9 Filters are too narrow and inconsistent

**Current status: substantially resolved for implemented families.** The Report Center uses server-owned date, report type, role, staff ID, and report-specific status filters for claims, workdays, expenses, clinical activity, and normalized exception categories. Performance-specific dimensions remain pending with the approved metric catalogue.

The original admin report filters covered only date, therapist, and therapist claim status, while mobile filtered export rows by name and the backend overview filtered by therapist ID.

**Impact:** users cannot answer common operational and finance questions reliably, and duplicate/similar names introduce avoidable filtering risk.

### 7.10 XLSX and Print are misleadingly present but unavailable

**Current status: resolved for the claim export controls.** XLSX is available and PDF is the printable format. Any future unavailable format should remain outside the primary action set.

The mobile export panel shows disabled Excel and Print controls labeled as planned.

**Impact:** permanently disabled actions add visual noise and create an expectation without a recovery path or delivery date. Hide unavailable formats or label them outside the primary action group.

### 7.11 Report definitions and calculations are undocumented

The UI does not explain which date drives each metric, whether cancellations include spelling variants, which allowance rate applies, when a claim enters a period, or whether â€œtodayâ€ uses server UTC or India time.

**Impact:** finance and operations users may interpret the same total differently. Disputes cannot be resolved from the report alone.

### 7.12 No export-specific audit trail

**Current status: substantially resolved.** The backend stores a retry-safe successful-artifact record per requester/snapshot/format and a separate privacy-safe lifecycle stream for generation completion/reuse/conflict, successful download, and authorized expired-download failure. Self events remain requester-scoped; organization events require reporting permission. Web/Android administrator screens surface recent failures. Unauthorized probing is deliberately not persisted in this product table and should be handled by infrastructure security logs.

There is no durable record of who generated a report, scope, filters, row count, snapshot time, format, checksum, expiry, or download attempts.

**Impact:** sensitive exports are hard to investigate, and financial reports cannot be reproduced confidently.

### 7.13 Privacy rules exist by convention, not by report policy

**Current status: substantially resolved for implemented Report Center families.** Each server-side report specification owns an explicit privacy-safe column set. The expense report excludes patient identity, addresses, coordinates, remarks, proof paths, and clinical notes; attendance excludes precise location; claim registers exclude patient identity; clinical activity excludes patients, diagnoses, notes, phone numbers, and locations. A formal organization-wide data-classification registry and review workflow remain open.

The administrative overview deliberately omitted patient details, which was positive. Older document-specific claim outputs and future clinical reports still require a centrally approved column policy.

**Impact:** future report additions could accidentally expose names, addresses, clinical notes, coordinates, phone numbers, or proof paths.

### 7.14 Reporting tests cover only the overview

**Current status: substantially resolved at backend level.** The complete suite passes **167 tests**. Focused Report Center coverage exercises combined doctor/therapist claims, workdays, travel/expenses, clinical activity, operational exceptions, report-specific filters and summaries, PDF/XLSX/CSV signatures, formula protection, privacy exclusions, immutable preview/download consistency, ownership, authorization, retained jobs, history, and expiry. Web automation covers the administrator export path and operational claim readiness at desktop/mobile-responsive widths; native Android export automation and large-dataset tests remain open.

Backend tests cover the therapist overview response and basic permissions. No automated client tests, doctor report tests, generated PDF/XLSX/CSV validation, snapshot consistency tests, large-dataset tests, or artifact authorization tests were found.

**Impact:** changes to totals, filters, templates, or file delivery can regress without detection.

## 8. Target reporting experience

### Administrator: Report Center

Add one first-level Report Center on web and mobile with:

1. Report catalogue grouped by Operations, Therapist, Doctor, Finance, and Exceptions.
2. Common date presets: Today, This week, This month, Previous month, Quarter, and Custom.
3. Role/staff/status filters appropriate to the selected report.
4. Preview showing applied filters, snapshot time, record count, totals, and privacy warning.
5. Format selection based on report capability.
6. Generate action with queued/processing/completed/failed state.
7. Direct Download on web and Save/Share on mobile.
8. A compact recent-generation status list; advanced history and scheduling can follow later.

### Doctor and therapist: My Reports

Do not add another bottom tab to already dense navigation. Expose My Reports from:

- A dashboard quick action.
- Claims/Expenses or Travel contextual actions.
- Profile/More for historical reports.

The flow should default to the current month and the signed-in user's own records. Staff and organization scope controls must not appear.

### Recommended generation flow

`Choose report â†’ apply filters â†’ preview snapshot â†’ choose PDF/XLSX/CSV â†’ Generate â†’ Download or Save/Share`

Important behaviors:

- Preserve filters when switching formats.
- Show estimated rows and warn before a large export.
- Display snapshot date/time and report timezone.
- Never show a success message until the artifact is available.
- If saving/sharing fails, keep the completed server artifact available until expiry.
- Allow retry without recalculating a completed snapshot.
- Explain zero-result exports before generating an empty file.

## 9. First-release report catalogue

### Organization-wide administrator reports

| Report | Core summary | Detail rows | PDF | XLSX | CSV |
|---|---|---|---:|---:|---:|
| Operational summary | Workdays, treatments, consultations, visits, travel, expenses, claims | Role-level totals and exceptions | Yes | Yes | No |
| Reimbursement summary | Therapist travel/allowance plus doctor expenses/claims | Staff, date, category, status, amount | Yes | Yes | Yes |
| Therapist performance | Attendance, assigned/completed/missed treatments, distance, claims | Therapist/day or therapist/period | Yes | Yes | Yes |
| Doctor activity | Attendance, consultations, visits, treatment plans, expenses, claims | Doctor/day or doctor/period | Yes | Yes | Yes |
| Claims review | Therapist and doctor claim counts, values, ageing, outcomes | One row per claim | Yes | Yes | Yes |
| Exceptions | Open workdays, active sessions, missed schedules, rejected plans/claims, missing proof | One row per exception | Yes | Yes | Yes |

### Doctor self-service reports

| Report | Contents | Recommended formats |
|---|---|---|
| My activity | Attendance, consultations, visits, plans, completed sessions | PDF, XLSX |
| My expenses | Date, linked visit, route, distance, mode, amount, proof status, claim status | PDF, XLSX, CSV |
| My claims | Claim date, included expenses, total, status, approval/rejection information | PDF, XLSX, CSV |
| Claim statement | One claim with included expense rows and calculation/audit metadata | PDF |

### Therapist self-service reports

| Report | Contents | Recommended formats |
|---|---|---|
| My activity | Attendance, assigned/completed/missed treatments, work time | PDF, XLSX |
| My travel | Trip date, schedule, route summary, distance, rate, fare, proof status | PDF, XLSX, CSV |
| My claims | Claim date, distance, allowance, total, status, rejection information | PDF, XLSX, CSV |
| Claim statement | One claim with travel entries and applied rates | PDF |

### Format responsibilities

- **PDF:** Designed summary, filters, definitions, totals, status, page numbers, generation metadata, and signature/approval information where appropriate.
- **XLSX:** A `Summary` sheet plus one or more typed detail sheets; frozen headers, filters, date/currency cells, and no formula injection.
- **CSV:** One flat table with stable machine-readable columns, UTF-8 BOM for common spreadsheet compatibility, and formula-injection protection.
- **Print:** Use the generated PDF. A separate Print report format is unnecessary in the first release.

## 10. Standard filters and report metadata

### Common filters

- Report type
- From/to date with presets
- Role: all, doctor, therapist where allowed
- Staff ID, never display-name-only identity
- Relevant status set for the selected report
- Include/exclude zero-activity staff where meaningful
- Detail level: summary or detailed when supported

Patient search or patient-identifying columns should be a separate, explicitly authorized clinical-report capability, not part of reimbursement exports by default.

### Metadata included in every artifact

- Human-readable report name and stable report type/version
- Organization/product name
- Applied filters
- Snapshot timestamp and `Asia/Kolkata` timezone
- Currency `INR`
- Generated-by user ID/display name and role
- Record count and report totals
- Artifact ID and expiry date
- Confidentiality label
- Definitions/notes for non-obvious metrics

### File naming

Use a stable pattern without patient names:

`travel-allowance_<report-type>_<scope>_<from>_<to>_<generated-date>.<format>`

Example:

`travel-allowance_doctor-claims_self_2026-08-01_2026-08-31_2026-08-30.pdf`

## 11. Recommended architecture

### One server-owned reporting domain

Create a reporting service that owns:

- Report catalogue and role capabilities
- Canonical filters and validation
- Snapshot transaction/time
- Aggregation and calculation rules
- Privacy-safe column selection
- PDF/XLSX/CSV rendering
- Artifact storage, checksum, expiry, and authorization
- Export audit records

Clients should render previews and request artifacts; they should not independently reproduce financial calculations or report templates.

### API contract and implementation status

#### `GET /reports/catalog`

Returns only reports authorized for the current user, supported formats, allowed filters, date limits, and whether organization or self scope is available.

**Status:** Implemented for `consolidated_claims`, `organization_attendance`, `organization_expenses`, `organization_clinical_activity`, and `organization_exceptions` for authorized administrators, plus `my_claims`, `my_attendance`, `my_expenses`, and `my_clinical_activity` for doctor/therapist self scope. The catalogue will expand as new report families are added.

#### `POST /reports/preview`

Example request:

```json
{
  "report_type": "doctor_claims",
  "scope": "self",
  "filters": {
    "from_date": "2026-08-01",
    "to_date": "2026-08-31",
    "statuses": ["pending", "approved"]
  },
  "timezone": "Asia/Kolkata"
}
```

Returns normalized filters, snapshot time, expiry, immutable snapshot ID, summary totals, row count, warnings, and supported formats. The complete export dataset remains server-side.

**Status:** Implemented for claim, attendance/workday, travel/expense, clinical-activity, and organization-exception reports. Self scope is resolved from the authenticated user; client-supplied role/staff IDs are ignored. Selected rows and report-specific summaries are retained for 24 hours so later formats cannot drift from the preview. Every report family validates its own status vocabulary.

#### `GET /reports/my-claims/export`

**Status:** Retained as a backward-compatible synchronous path for privacy-safe self PDF/XLSX/CSV. Current web and Android clients use the job contract below after preview; Android also provides common period presets.

#### `GET /reports/exports/{snapshot_id}/download`

**Status:** Retained as a compatibility fallback for direct snapshot rendering. New clients first create/reuse a retained job and download by job ID.

#### `GET /reports/exports/history`

**Status:** Implemented with `scope=mine|organization` and a bounded `limit`. Self history returns only the authenticated user's successful snapshot-format exports. Organization history requires reporting permission and returns organization-scope exports. Records include requester, report/scope/filters, snapshot/expiry, format, totals, filename/type/size, SHA-256 checksum, first/last download, and retry count. Web and Android field/administrator history/retry UIs are implemented.

#### `POST /reports/exports`

Accepts an authorized immutable `snapshot_id`, format (`pdf`, `xlsx`, `csv`), and requester-scoped idempotency key. Returns an export job. Scope and current role are authorized again; client-supplied staff identity is never trusted.

**Status:** Implemented for bounded claims, attendance/workdays, travel/expense, clinical-activity, and exception exports. Generation completes synchronously, stores the exact bytes and artifact metadata until the snapshot's 24-hour expiry, and returns the existing job for a repeated requester/key/payload. Reusing the key for a different payload returns `409`.

#### `GET /reports/exports/{id}`

**Status:** Implemented. Small jobs normally return `completed`; large snapshots return `queued`, are rendered in an independent worker session, expose `processing`/`failed` states, and recover stale processing attempts. After expiry the same resource reports `expired` without a download URL.

Returns `queued`, `processing`, `completed`, `failed`, or `expired`, plus progress where available, safe failure information, snapshot metadata, and artifact metadata after completion.

#### `GET /reports/exports/{id}/download`

**Status:** Implemented for retained small-job artifacts. It streams the exact stored bytes with filename, MIME type, snapshot ID, row count, and job ID; authorization is evaluated against the current role on every request. Self artifacts are private, currently authorized administrators may retrieve organization artifacts, and expired artifacts return `410`. The large-report object-storage/signed-URL variant remains future work.

Streams the authorized file or redirects to a short-lived signed download. Authorization is checked on every access. Self-service users can download only their own artifacts.

### Recommended shared concepts

| Concept | Required information |
|---|---|
| `ReportType` | Stable ID, version, label, supported scopes/formats/filters |
| `ReportScope` | `self`, `staff`, or `organization` with server-resolved identity |
| `ReportFilters` | Validated dates, statuses, role/staff IDs, detail level |
| `ReportPreview` | Snapshot, totals, row count, sample rows, warnings |
| `ReportExportJob` | ID, status, progress, requested format, timestamps, failure code |
| `ReportArtifact` | Filename, MIME type, size, checksum, expiry, download eligibility |
| `ReportAuditEvent` | Requester, role, scope, filters hash, snapshot, format, row count, action |

### Synchronous versus asynchronous generation

- Small claim statements now complete synchronously through the job interface and retain bytes until expiry.
- Period and organization reports should run asynchronously.
- The UI should poll with bounded backoff or receive a completion notification.
- Retrying the same idempotency key should return the existing job rather than regenerate or duplicate audit entries.

## 12. Security, privacy, and governance

### Permissions

Introduce explicit permissions instead of relying only on dashboard or claim-view access:

- `reports.catalog.view`
- `reports.preview.self`
- `reports.export.self`
- `reports.preview.organization`
- `reports.export.organization`
- Optional sensitive clinical-report permission if that capability is later added

Administrators receive permissions according to operational responsibility. Doctor and therapist permissions are always self-scoped.

### Privacy defaults

Exclude by default:

- Patient names, phone numbers, addresses, precise coordinates
- Clinical notes, diagnosis, medication, and treatment instructions
- Receipt/proof storage paths or URLs
- Authentication/session/device data

Where a formally approved report needs patient identity, make it a distinct report type with a visible sensitivity label, narrower permission, and export audit event.

### Artifact controls

- Store exports outside public paths.
- Encrypt at rest using the deployment's managed storage controls.
- Use short-lived downloads and configurable retention.
- Recheck current user and scope on download.
- Record generation and download events.
- Do not email attachments in the first release.
- Avoid placing sensitive filter values in filenames.

### Retention operation

Expired snapshot rows and retained artifact bytes are removed transactionally; lightweight export audit records remain available for investigation. Preview requests invoke the same cleanup service opportunistically. Production should also schedule this idempotent command at least hourly from the backend directory:

```text
python -m app.tasks.cleanup_report_exports
```

The command emits only cutoff and deletion counts. It does not print filters, report rows, filenames, users, or artifacts. External scheduler configuration remains deployment-specific and must be added before the retention recommendation is fully closed.

## 13. UX, accessibility, and failure handling

### Simplify the process

The primary action should be explicit:

- **Download PDF** on web.
- **Save PDF** and **Share** as separate mobile choices after generation.
- **Download Excel** for structured analysis.
- Place CSV under â€œMore formatsâ€ unless raw data is the primary use case.

Do not make users choose a share destination before they know the report generated successfully.

### Generation states

| State | Required UX |
|---|---|
| Previewing | Inline skeleton and preserved filters |
| Ready | Totals, row count, privacy scope, format choices |
| Queued | Job accepted with safe navigation away |
| Processing | Progress/status and cancel-dismiss behavior |
| Completed | Filename, size, expiry, Download/Save/Share |
| Empty | Explain no matching records; allow filter change; optional header-only CSV only when explicitly requested |
| Failed | Specific retryable/non-retryable message and support reference |
| Expired | Regenerate using preserved filters |

### Accessibility

- Give report/format controls explicit names and selected/busy states.
- Announce generation progress and completion without relying only on color or transient alerts.
- Keep keyboard focus in context on web and support Escape/focus return in dialogs.
- Provide accessible text summaries for charts.
- Ensure generated PDFs have logical reading order where the renderer permits; otherwise publish an accessible HTML preview alongside them.
- Use real table headers and typed cells in XLSX.

## 14. Prioritized findings register

Effort is a rough estimate for an experienced product team and excludes procurement/compliance approval.

**Current disposition of baseline IDs:** R-01 and R-03 are resolved across claims, attendance, travel/expenses, clinical activity, and organization exceptions; R-02 now covers claim, workday, expense, consultation, visit, and treatment-plan self-service but remains open for interpreted performance reports; R-04 is resolved for all implemented snapshots; R-05 is bypassed by set-based export queries but the legacy endpoint remains; R-06 is substantially resolved through owner/scope authorization, expiry, audit metadata, checksums, summaries, retained artifacts, and privacy-safe lifecycle events; R-07 is resolved at backend level and partially covered by Playwright administrator delivery tests at desktop/mobile widths, while native Android automation remains open; R-08 and R-13 are resolved for shared tabular formats; R-10 now covers My Attendance, My Travel, and treatment activity; R-11 is substantially resolved through report-specific statuses, cross-role filters, and normalized exception categories; R-15 now includes durable queued processing and remains open only for private object storage and production-scale evidence. Other rows remain roadmap items.

| ID | Priority | Finding | Impact | Recommendation | Effort | Dependency |
|---|---|---|---|---|---|---|
| R-01 | **P1** | Backend reports exclude all doctor data | Organization metrics and finance views are incomplete | Add doctor reporting queries and canonical combined metrics | 1â€“2 weeks | Metric definitions |
| R-02 | **P1** | Doctors cannot generate claim or period reports | No self-service reconciliation or formal claim statement | Deliver My Activity, My Expenses, My Claims, and Claim Statement | 2â€“3 weeks | Reporting API |
| R-03 | **P1** | Web Admin Reports has no export | Finance/admin work depends on mobile or manual copying | Add PDF/XLSX/CSV generation through shared backend artifacts | 1â€“2 weeks UI | Reporting API |
| R-04 | **P1** | Preview and export use different requests/snapshots | On-screen and downloaded totals can differ | Generate preview and artifacts from one immutable snapshot | 1â€“2 weeks | Snapshot design |
| R-05 | **P1** | `/claims/all` is unpaginated with N+1 travel queries | Export latency and memory use grow with data | Replace with set-based, filtered report queries and jobs | 3â€“5 days | Backend refactor |
| R-06 | **P1** | Report-specific permissions/audit do not exist | Sensitive exports are insufficiently governed | Add report permissions, artifact authorization, and audit events | 1â€“2 weeks | Auth/storage |
| R-07 | **P1 â€” partially implemented** | Backend export coverage is broad and Playwright covers admin preview-to-PDF/XLSX/CSV delivery at desktop/mobile widths; field roles, expiry/retry/failure, and Android client flows remain | Uncovered delivery and authorization regressions can still ship | Extend contract, calculation, authorization, format, and client-flow tests | 1â€“2 weeks remaining initial tranche | Test fixtures |
| R-08 | **P2** | Client-side templates are duplicated | Platform output and fixes diverge | Move templates/rendering to the reporting service | 1â€“2 weeks | Reporting service |
| R-09 | **P2** | Mobile depends on share sheet and deletes files | Users cannot reliably find or retry completed exports | Separate Save and Share; retain server artifact until expiry | 3â€“6 days | Artifact storage |
| R-10 | **P2** | Therapist reporting is document-by-document | No attendance/travel/treatment period statement | Add My Activity, My Travel, and My Claims reports | 1â€“2 weeks | Reporting API |
| R-11 | **P2 â€” substantially implemented** | Web/Android now expose role-specific doctor/therapist staff selection and report-specific statuses; the catalogue still does not drive the client controls dynamically | Core doctor, therapist, and exception questions are filterable, but adding a new server filter still requires client changes | Render future controls from catalogue filter definitions and retain explicit UX labels | 2â€“4 days | Catalogue |
| R-12 | **P2** | Mobile feature flag silently removes exports | Capabilities vary unexpectedly between builds | Expose capability state and validate production configuration | 1â€“2 days | Release config |
| R-13 | **P2** | Excel and Print appear disabled | Interface advertises unavailable actions | Implement XLSX; use PDF for print; hide unsupported controls | 3â€“7 days | XLSX renderer |
| R-14 | **P2** | Report definitions are not visible | Totals are open to interpretation and disputes | Include metric definitions, snapshot, timezone, and rate source | 2â€“4 days | Product definitions |
| R-15 | **P2** | No artifact history or status | Long generation and failed sharing are hard to recover | Add minimal recent jobs/status; defer advanced history | 3â€“6 days | Export jobs |
| R-16 | **P2** | Privacy columns are controlled per template | New exports can leak sensitive fields | Create centrally reviewed column policies by report type | 3â€“5 days | Data classification |
| R-17 | **P2** | Report page and exported PDF contain different content | â€œExport reportâ€ does not faithfully represent preview | Define format-specific but reconciled sections and totals | 3â€“5 days | Report spec |
| R-18 | **P2** | Timezone/date semantics are implicit | Period totals can shift near day/month boundaries | Standardize business date and Asia/Kolkata metadata | 2â€“4 days | Time utilities |
| R-19 | **P3** | Generic filenames omit type/scope/range | Files are difficult to identify later | Adopt stable privacy-safe naming convention | 1 day | None |
| R-20 | **P3** | Export progress uses interruptive alerts | Accessibility and recovery are limited | Use persistent status UI and accessible announcements | 2â€“4 days | Job status UI |

## 15. Quick wins

Before the full reporting service is complete:

1. Add automated coverage for Android preset/custom-range/status validation and snapshot reuse.
2. Add automated coverage for the implemented Android administrator preview â†’ share workflow.
3. Configure `PRODUCTION_DATABASE_URL` for the included daily retention workflow and alert on non-zero exit status.
4. Display the snapshot timestamp/expiry and a clear â€œPreview againâ€ recovery for `410 Gone` on every client.
5. Add browser and Android automation for preview â†’ PDF/XLSX/CSV download/share.
6. Add large-row-limit, IST boundary, rate-version, and dashboard-versus-export reconciliation tests.
7. Add report metric definitions and current policy/calculation-version metadata to summary sheets.
8. Create a metric definition sheet and have finance/operations approve calculations before adding new operational totals.

## 16. Delivery roadmap

### Phase 0 â€” Definitions and risk control (0â€“1 week)

- Approve the report catalogue, ownership, metric definitions, business dates, rate source, and privacy columns.
- Approve performance metrics and define the decision/assignment lifecycle that will sit behind the implemented exception register.
- Verify production feature flags and the 24-hour snapshot cleanup/retention policy.
- Create representative anonymized fixtures for therapist and doctor reports.

**Exit criteria:** every first-release metric has an owner, definition, source field, timezone rule, and privacy classification.

### Phase 1 â€” Reporting foundation and parity (1â€“4 weeks)

- Move completed queued artifacts to private object storage and instrument worker/runtime health; configure the implemented cleanup workflow in deployment.
- Deliver admin Operational Summary and Doctor/Therapist Activity beyond the implemented claim, attendance, and travel/expense registers.
- Add automated Android administrator and My Reports preview/share coverage.
- Device-test the implemented explicit Save and Share choices, add monitoring integration for queued/retention lifecycle events, and add native client automation.

**Exit criteria:** administrators can export therapist and doctor data on web/mobile; doctors and therapists can download their own claim statements; all formats reconcile to the same preview totals.

### Phase 2 â€” Complete operational reporting (4â€“8 weeks)

- Add approved therapist/doctor performance summaries on top of the implemented detail registers.
- Add exception assignment, decision, resolution, and direct drill-down actions; retain the implemented privacy-safe exception export.
- Add regenerate-expired behavior and richer processing/failure history for large export jobs.
- Add large-dataset performance tests and monitoring.

**Exit criteria:** the agreed first-release catalogue is available with role parity, predictable generation time, and privacy/audit controls.

### Phase 3 â€” Optimization after adoption (8+ weeks)

- Saved filter presets and richer export history.
- Scheduled delivery and recurring subscriptions only after security review.
- Custom column/report builder only if usage data demonstrates demand.
- Optional sensitive clinical reports as separate permissioned products.

## 17. Acceptance and test matrix

### Authorization

- Therapist cannot preview/export another therapist or organization scope.
- Doctor cannot preview/export another doctor or therapist data.
- Admin without organization export permission cannot request or download organization artifacts.
- Changing role/status after job creation is rechecked at download time.
- Guessing an export ID returns no artifact metadata.

### Data consistency

- Preview, PDF, XLSX, and CSV use the same snapshot and reconcile totals.
- Staff filters use stable IDs.
- Status/date filters yield identical included record IDs across formats.
- Combined reimbursement equals therapist and doctor components under the documented definition.
- Applied allowance/rate values come from the claim/expense snapshot, not current mutable settings.

### Date and currency

- Records around UTC/IST midnight fall into the documented business date.
- Month-end and leap-day ranges are correct and inclusive.
- All monetary values use INR and preserve two-decimal numeric values in XLSX/CSV.
- PDF presentation uses Indian currency formatting without converting numeric spreadsheet cells to text.

### Formats

- PDFs have correct title, filters, totals, page numbers, repeated table headers, and no clipped rows.
- XLSX opens without repair warnings and includes Summary/detail sheets with typed cells.
- CSV is UTF-8, formula-injection safe, stable-column, and correctly quoted.
- Zero-record behavior is explicit and consistent.
- Large reports queue rather than exhausting request/mobile memory.

### Job and artifact lifecycle

- Duplicate idempotency keys return the same job.
- Failed jobs expose safe actionable failure codes.
- Completed jobs survive client navigation and temporary network loss.
- Expired artifacts cannot download and can regenerate with preserved filters.
- Audit records contain requester, scope, filter hash, snapshot, format, row count, and outcome.

### Client experience

- Web supports keyboard-accessible preview and download.
- Android distinguishes Save from Share and shows the completed filename/location or share outcome.
- Generation progress and completion are announced accessibly.
- The feature behaves consistently after session expiry, app background/resume, and interrupted downloads.

### Privacy

- Default reports contain no patient name, phone, address, coordinates, clinical notes, or proof paths.
- Sensitive report types require separate permission and display a confidentiality warning.
- Filenames, logs, analytics, and error messages contain no patient-identifying values.

## 18. Success metrics

- Percentage of report generations completed successfully
- p50/p95 time from Generate to artifact availability by report/format
- Percentage of completed artifacts successfully downloaded, saved, or shared
- Preview-to-generation completion rate
- Report failures by validation, query, renderer, storage, or delivery stage
- Number of mismatches reported between screen totals and artifacts; target zero
- Doctor and therapist monthly self-service report adoption
- Reduction in manual finance spreadsheet preparation time
- Reduction in reporting-related support requests
- Export volume and sensitive-report usage by authorized role
- Expired artifacts and regeneration rate

## 19. Final recommendation

Do not solve the current gap by copying the therapist PDF code into each doctor and web page. That would improve visible coverage while making consistency, security, and maintenance worse.

The correct first investment is a shared reporting contract and server-generated artifact pipeline. Once that exists, doctor inclusion, web downloads, mobile Save/Share, XLSX support, privacy controls, and snapshot-consistent totals become extensions of one system rather than separate implementations. The first visible milestone should be organization-wide reimbursement reporting plus doctor/therapist claim statements across both platforms.
