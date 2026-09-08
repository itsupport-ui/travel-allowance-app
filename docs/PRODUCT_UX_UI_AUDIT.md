# Web and Mobile Product Audit Report

**Product:** Travel Allowance  
**Audit date:** 30 August 2026  
**Primary objective:** Improve therapist and doctor field adoption without weakening administrative control  
**Platforms reviewed:** React/Vite web, Expo/React Native mobile (Android-first), FastAPI backend

**Focused companion audits:** [Reporting and Export Audit](./REPORTING_EXPORT_AUDIT.md) â€” report coverage, doctor-report gaps, export parity, and the recommended PDF/XLSX/CSV architecture; [Complete Business Logic Audit](./BUSINESS_LOGIC_AUDIT.md) â€” correctness of operational rules, lifecycle dead ends, calculations, permissions, recurrence, correction workflows, and recommended fixes.

## Current implementation status â€” 6 September 2026

**Latest UX completion:** Reimbursement settings now expose the effective doctor receipt threshold and recent immutable policy history on web and Android. A WCAG 2.x AA browser gate covers the responsive administrator policy workflow and identified and fixed insufficient sidebar-label contrast. Report generation now distinguishes queued, processing, failed, expired, and completed jobs, with bounded polling and actionable recovery on web and Android. Android report actions now explicitly offer durable folder **Save** and system-sheet **Share**, including authorized history retries, rather than relying on an ambiguous share sheet for both outcomes.

This section supersedes earlier implementation counts and open-item statements below. The product now provides a guided location-exception experience on both web and Android. Therapist and doctor session views explain a failed distance or GPS-quality check, offer a reason form, capture fresh GPS evidence, show pending/approved status, and automatically attach an approved one-time exception to the matching punch action. Administrator Reports on both platforms includes a review queue with requester role, action, evidence quality, distance, policy version, required decision reason, and explicit **Approve once**/**Reject** controls. Settings on web and Android now provides one effective-dated Field Location Policy editor and readable version history for radius, accuracy, freshness, approval lifetime, and allowed movement. This replaces an unexplained field dead end with a visible, recoverable workflow without adding a silent bypass.

Current verification is **181 passing backend tests**, one migration head at `0026_operational_follow_ups`, passing web lint/build, passing Android lint/TypeScript, and **11 passing mobile offline/export/draft-policy unit tests**. The web Playwright suite now has **62 passing desktop/mobile-responsive checks**, including cross-domain follow-up creation/resolution, objective staff-performance preview, server-owned therapist claim-total confirmation and doctor manual-review blocking, location-policy editing, administrator location approval, early-closure follow-up decisions, therapist manual-travel correction requests, categorized doctor manual-expense submission/approval, consultation rescheduling, required dated follow-up capture, keyboard focus, Escape recovery, trigger-focus restoration for the shared field exception dialog, permission-protected audit filtering, and the staff-deactivation hard-block/approved-override paths. Manual therapist travel and doctor expenses explain why approval is required, show review/revision history, support correction and resubmission on web/Android, and provide administrator queues on both platforms. Doctor users choose a verified visit or an explicit manual exception, see category-specific fare behavior, and cannot submit a partial daily claim while an exception is unresolved. Both professions now see one server-calculated claim preview with eligible count, exact total, blockers, next action, rejected/resubmission guidance, and already-submitted state before the action is enabled. Consultation users now see server-owned actions, preserve originals when cancelling/rescheduling, create linked follow-up appointments, and can review lifecycle history on web and Android. Staff editors now replace the unsafe one-checkbox deactivation with a server-owned impact preview, required handover reason, hard blockers for active work, and a visible request/review/one-time approval path for softer impacts. Administrators and field users can also preview and export objective workload/performance summaries without patient data or subjective rankings. Administrators can assign cross-domain operational records to an active owner, set priority/due date, and retain a reasoned resolution from responsive web or Android workspaces.

Administrators now have a shared **Operational Audit Log** on web and a hidden drill-down from Android Reports rather than another primary tab. The web view supports domain, entity, action, actor, business-date, and pagination controls; Android provides touch-friendly domain/date filters and progressive loading. Staff, Configuration, and Notification filters now sit beside the existing operational domains. Both surfaces show actor, state transition, related record, reason, and time while structured audit metadata excludes patient, address, coordinate, proof-path, clinical-note, staff contact/credential, push-token, and installation-identifier fields. Android field users now receive a global **Saved Field Actions** indicator when a critical mutation is queued offline, with secure-storage guidance, automatic/manual retry, visible attention state, attempt count, and confirmed removal. Remaining UX/UI priorities are broader shared component extraction, formal accessibility/device validation, native Android automation for offline/process-death and file-delivery flows, proof-file recovery, production telemetry, broader override-policy coverage, and prefilled follow-up handoff beyond the four administrator review queues.

Administrator dashboards on web and Android now use one organization-scoped response for active doctors/therapists, today's scheduled/completed/missed clinical work, cross-profession claims, and open follow-ups. The web no longer calls a therapist-self summary under an administrator identity, and every dashboard card routes to a relevant organization workflow.

Final repository health checks on 6 September 2026 also report **0 web production dependency vulnerabilities** and **18/18 Expo Doctor checks passing**. The mobile dependency audit still reports 31 transitive findings whose automated remediation requires breaking Expo/Router upgrades; these require a separately tested SDK-upgrade tranche rather than a forced production dependency change. Physical Android, GPS/poor-network field behavior, and assistive-technology validation remain release-acceptance activities, not repository-proven outcomes.

Web session recovery is now centralized: access-token lifetime is environment-configurable, bounded to 15 minutes through 24 hours, and defaults to eight hours; tokens carry UTC issuance/expiry; any authenticated API `401` clears local credentials and returns the user to an accessible, explanatory sign-in state. The Vercel web deployment configuration now adds CSP, frame, MIME-sniffing, referrer, and browser-permission headers. Moving bearer tokens from web storage to HttpOnly cookies remains a later coordinated API/CSRF migration.

Treatment-plan actions are now consistent across the API, web, and Android. Administrators receive explicit approve/request-changes or generate-schedule actions, while doctors receive waiting, correction/resubmission, and schedule-status guidance. Android no longer hides administrator review controls by incorrectly testing the server's `submitted` plan as `pending`, and both clients describe the reversible correction workflow as **Request changes**.

Treatment-schedule actions are now consistent as well. The API supplies role-aware actions, blockers, and a next step; administrator web and Android lists/details use those fields so an appointment with an active treatment session can be monitored but is no longer incorrectly offered for editing, rescheduling, or cancellation.

Android treatment-plan creation and correction now auto-save recoverable drafts across app restarts. Because these forms contain clinical content, payloads are split into bounded encrypted, device-bound SecureStore generations; ordinary storage contains only non-sensitive integrity metadata. A new generation is committed before the prior one is removed, corrupted/expired drafts are discarded, and submission, explicit discard, or sign-out removes the draft. The existing doctor-expense draft now uses the same encrypted storage instead of retaining locations and remarks in ordinary device storage.

| UX recommendation | Current disposition |
|---|---|
| Guided GPS exception request | **Implemented for doctor and therapist web/Android session views, including accuracy and capture time** |
| Visible pending/approved recovery state | **Implemented from server-owned session metadata** |
| Administrator location review | **Implemented on web and Android with required reasons and version-conflict recovery** |
| Configurable location policy | **Implemented on web and Android with effective dates, validation, and version history** |
| Early workday closure review | **Implemented on web and Android with status filters, required review notes, and optimistic conflict recovery** |
| Manual therapist travel review | **Implemented on web and Android with guided correction, claim-readiness messaging, and retained history** |
| Consultation recovery UX | **Implemented on web and Android with required follow-up tasks, linked replacements, coded cancellation, and lifecycle history** |
| Central operational audit UX | **Implemented for authorized administrators on web/Android with responsive filtering, state transitions, reasons, empty/error/loading states, and privacy guidance** |
| Therapist/doctor daily claim preview UX | **Implemented on web/Android with server totals, policy/calculation context, blockers, confirmation, resubmission guidance, and already-submitted state** |
| Staff deactivation safety and override UX | **Implemented on web/Android with live impact counts, hard blockers, required reason, explicit review, stale-condition protection, and one-time approval** |
| Durable offline critical-action UX | **Implemented on Android with account-scoped secure payloads, stable replay IDs, automatic/manual sync, visible queued/attention states, safe removal, and prior-business-date protection; native automation and proof-file replay remain** |
| Broader exception review and analytics | **Doctor manual-expense parity and a shared cross-domain assignment/resolution queue are implemented; automatic source-screen handoff and broader analytics remain open** |

## Implementation update â€” 31 August 2026

The audited web lint baseline has been reduced from **16 errors to zero**, the production web build succeeds, Android lint and TypeScript checks pass, and the backend suite passes **124 tests**. Web and Android expose guided correction/resubmission for rejected treatment plans, and admin claim rejection requires an actionable reason instead of a one-tap dead end. The seven-tab doctor workspace is now five primary destinations, with consultations, visits, and treatment plans grouped into a guided **Work** hub while preserving deep links. The therapist web sidebar now has one **My Schedules** destination instead of four status-first links; an accessible, URL-addressable workspace switches between Today, Upcoming, Completed, and Missed while retaining the existing treatment actions and redirecting legacy deep links. A Playwright foundation now exercises protected schedule routing, redirects, URL state, and all four workspace states at desktop and mobile widths (**6 passing checks**) against read-only mocked APIs. Recurring schedules now create independent dated occurrences and support scoped cancellation. Financial settings now show immutable policy versions; money uses decimal, effective-dated calculations; and historical travel/claim snapshots remain unchanged after a rate update. Repeated claim submission, workday start/end, and therapist/doctor punch actions safely return the prior result instead of creating duplicates, while machine-readable blockers and next actions are available for critical field transitions. Web and Android can end attendance early only after capturing an audit reason; logout no longer silently leaves an early workday open. The role-authorized Report Center now includes claims, attendance/workdays, travel/expenses, clinical activity, and an administrator exception register. The exception register exposes ageing, evidence presence, and suggested next actions without patient, location, clinical, proof-path, or free-text reason data. Web and Android users select report-specific filters, preview summaries, create or reuse an idempotent job, and download/share the exact retained PDF/XLSX/CSV artifact from an immutable 24-hour snapshot. Authorized history/retry, checksums, current-role reauthorization, privacy-safe columns, and an idempotent scheduler-ready retention service are implemented. Component decomposition, broader web/Android workflow automation, formal accessibility verification, performance summaries, true exception decision workflows, external object storage, and durable offline mutation queueing remain open.

Two administrator export checks cover one-preview delivery and server filenames across PDF, XLSX, and CSV; two cover persistent expiry guidance and recovery availability; two verify individual-doctor export scoping; two schedule recovery checks verify a persistent load error and successful retry; and two keyboard checks verify dialog focus/Escape recovery. Together with routing/state coverage, the web E2E suite has **16 passing desktop/mobile checks**; broader role and mutation coverage remains open.

| Audit recommendation | Disposition |
|---|---|
| Workday date/closure regression and lint failures | **Implemented and verified** |
| Pull-request quality gate | **Configured for backend tests/migration head, web lint/build/Playwright, and mobile lint/TypeScript; workflow YAML validated locally and will execute when pushed to GitHub** |
| Doctor mobile navigation reduction | **Implemented** |
| Therapist schedule workspace consolidation | **Implemented on web; legacy deep links redirect to the matching view** |
| Rejected-plan/claim correction UX | **Implemented on web and Android** |
| Recurring occurrence and scoped-cancellation UX | **Implemented; richer series editing remains** |
| Cross-role claim exports | **Implemented with catalogue, preview, retained jobs/artifacts, authorized history, admin register, and doctor/therapist My Reports; broader catalogue remains** |
| Cross-role attendance/workday exports | **Implemented for organization and self scope on web/Android in PDF, XLSX, and CSV** |
| Cross-role travel/expense detail exports | **Implemented for organization and self scope on web/Android in PDF, XLSX, and CSV** |
| Cross-role clinical activity exports | **Implemented for therapist treatments and doctor consultations/visits/plans on web/Android in PDF, XLSX, and CSV** |
| Administrator operational exception export | **Implemented with privacy-safe evidence state, ageing, and suggested action on web/Android** |
| Retry-safe field mutations | **Implemented for claims, workdays, and clinical punch actions, with an Android SecureStore-backed replay queue for critical JSON/attachment-free mutations; proof-file replay remains explicit** |
| Reasoned early closure and safe logout | **Implemented on web and Android** |
| Durable field-form drafts | **Partially implemented: Android doctor expense creation auto-saves a user-scoped seven-day draft, while critical field transitions now use a separate SecureStore-backed mutation queue; other long forms and proof attachments remain explicit** |
| Shared web design system and component decomposition | **Open** |
| Automated web/Android workflows and formal accessibility testing | **Partially implemented: 44 web Playwright desktop/mobile-responsive checks and 8 Android offline/export-policy unit tests cover core browser and offline rules; a formal WCAG audit and native Android workflow automation remain open** |

The detailed findings below preserve the original audit evidence and severity for traceability. Where they conflict with the implementation update/disposition above, the newer status is authoritative.

## 1. Executive summary

The product has moved beyond a simple travel-claim tool. It now supports a connected clinical operations workflow: administrators manage staff and schedules; doctors manage consultations, visits, treatment plans, expenses, and claims; therapists execute assigned treatment schedules, record attendance and travel, and submit claims. This breadth is the strongest aspect of the product.

The product is best described as a **feature-rich operational beta that needs stabilization and workflow consolidation before broad field rollout**. The core domain is represented well and role permissions exist on both the client and server. The mobile client has particularly good foundations: secure token storage, centralized error handling, query retry behavior, push-notification routing, theme tokens, skeleton states, and widespread accessibility metadata.

The largest remaining risks are not missing screens. They are incomplete proof-file and long-form recovery around an otherwise implemented critical-action queue, inconsistent behavior between web and mobile, absent native Android workflow automation, and maintenance cost caused by very large page components. The original therapist workday-end regression and web lint failures have been fixed and regression-tested; the web now has a meaningful desktop/mobile-responsive regression suite. The next release gate should focus on native automation, formal accessibility validation, remaining audit/override coverage, and observable production behavior.

The focused business-logic review originally found lifecycle dead ends in rejected plans/claims, recurring schedules, generated coordinates, concurrent therapist sessions, location failures, early closure, and early logout. Those confirmed defects now have implemented and regression-tested workflows, including administrator location and early-closure review. Critical operational, staff, policy-configuration, and push-registration mutations also feed one authorized cross-domain audit history, and staff deactivation now uses a formal reasoned override lifecycle. Remaining balanced-control workâ€”additional override rule types, follow-up assignment/analytics, and durable offline synchronizationâ€”is detailed in the [Complete Business Logic Audit](./BUSINESS_LOGIC_AUDIT.md).

### Overall assessment

| Dimension | Assessment | Summary |
|---|---|---|
| Feature coverage | Strong | The main admin, doctor, therapist, schedule, treatment, travel, expense, claim, and reporting workflows exist. |
| Field usability | Moderate-high | Correction flows, a smaller doctor tab bar, occurrence-based scheduling, and retry-safe transitions reduce friction; long forms and offline recovery still need work. |
| Web UI consistency | Moderate-low | The visual direction is clean, but components and interaction patterns are mostly page-local rather than systemized. |
| Mobile UI consistency | Moderate-high | Theme tokens and shared components exist, although several screens remain very large and tab bars are overcrowded. |
| Reliability | Moderate-high | Backend tests, web lint/build/Playwright, and mobile lint/typecheck are green; native Android workflow automation and production telemetry remain missing. |
| Accessibility | Mixed | Mobile has broad accessibility metadata; web labeling, focus, dialog, and navigation semantics are inconsistent. |
| Security posture | Moderate | Server permissions and mobile secure storage are strengths; web token storage, dependency advisories, and missing account safeguards need attention. |
| Release readiness | Controlled pilot | Core P0/P1 state defects are stabilized, but UI automation, accessibility validation, monitoring, and offline/exception workflows are required before broad rollout. |

### Top recommendations

1. **Create automated end-to-end tests** for login, workday, treatment punch-in/out, expense/claim submission, claim review, and export download/share.
2. **Add durable offline drafts and synchronization** on top of the now retry-safe server transitions.
3. **Introduce a shared web design system and data layer** matching the stronger mobile foundations.
4. **Break up the largest screens** into workflow components, hooks, schemas, and service adapters.
5. **Add operational telemetry** for task failures, API latency, workday completion, schedule completion, claim turnaround, and idempotent replays.
6. **Complete Report Center rollout** with cross-domain follow-up resolution, production artifact-storage/alert configuration, native Android validation, and broader automated export-flow coverage; objective performance summaries and core reports are implemented.
7. **Run formal accessibility and field-usability validation** on representative Android devices and responsive web widths.
8. **Add administrator review and analytics** for location exceptions, early closures, and other field overrides.

## 2. Audit method and evidence

### Evidence levels

- **Live verified:** Observed on the deployed Vercel web app using authorized disposable admin, therapist, and doctor accounts.
- **Code verified:** Confirmed in routes, components, services, backend endpoints, schemas, tests, or configuration.
- **Inferred:** A likely user or operational consequence derived from implementation evidence; it must be validated through field research or native-device testing.

### Live review performed

- Signed in successfully as admin, therapist, and doctor.
- Reviewed each role dashboard and visible navigation at desktop (`1440 Ã— 900`) and narrow mobile-web (`390 Ã— 844`) sizes.
- Allowed the deployed API to wake and verified that dashboard data replaced loading skeletons.
- Confirmed no immediate browser console errors or failed network requests during the six login/dashboard checks.
- Kept the walkthrough read-only: no workday start/end, punch-in/out, approvals, rejections, deletions, submissions, or record creation was performed.
- Screenshots were used only during analysis and are not embedded because operational screens may contain sensitive information.

### Original automated baseline

The following table preserves the audit-time baseline so each implemented fix remains traceable:

| Check | Result |
|---|---|
| Backend test suite | **181 passed** |
| Failed backend area | Therapist workday end: summary/closure and active-treatment rejection tests |
| Web lint | **Failed with 16 errors** across 11 files |
| Web production build | **Passed** when built to a clean temporary output directory |
| Standard web build command | Initially blocked by an `EPERM` lock while clearing an existing `dist` asset; this is an environment/output hygiene issue, not a compile failure |
| Mobile lint | **Passed** |
| Expo Doctor | **17/18 checks passed**; three Expo patch versions do not match SDK 54 expectations |
| Python dependency consistency | **Passed** (`pip check`) |
| Web production dependency audit | 5 advisories: 3 high, 2 moderate |
| Mobile production dependency audit | 27 advisories: 13 high, 14 moderate; several are transitive Expo/Metro tooling dependencies |
| Web/mobile UI tests | None found |

### Current implementation verification â€” 31 August 2026

| Check | Current result |
|---|---|
| Backend test suite | **181 passed** |
| Web lint | **Passed with zero errors** |
| Web production build | **Passed** |
| Mobile lint | **Passed** |
| Mobile TypeScript | **Passed** (`tsc --noEmit`) |
| Alembic head | `0026_operational_follow_ups` |
| New focused coverage | Business-state corrections, recurring occurrences, financial/location policies, correction/resubmission, exception review, audit/follow-up governance, offline replay, and cross-role PDF/XLSX/CSV reporting |
| Web/mobile UI automation | **60 Playwright checks pass at desktop and mobile-responsive widths; 8 native logic unit tests pass; physical Android automation remains open** |

### Limitations

- No Android emulator or physical device was attached. Android permissions, native location accuracy, notification receipt, file sharing, keyboard behavior, predictive back, and device performance are therefore **code-reviewed but not hands-on verified**.
- iOS behavior was not tested. iOS observations in this document are risks to check, not confirmed defects.
- Detailed live pages were not mutated because the deployed environment contains operational-style records. Form and state-machine behavior was reviewed from source and backend tests.
- No field users were interviewed. Recommendations about comprehension and workflow burden should be validated with at least three therapists, three doctors, and two claim reviewers.

## 3. Current architecture

| Layer | Current implementation | Positive characteristics | Main concern |
|---|---|---|---|
| Web | React 19, Vite, React Router, Tailwind utilities, Axios, Playwright | Responsive role shells, broad workflow coverage, clear desktop dashboards, initial schedule/export E2E coverage | JavaScript-only UI, page-local patterns, localStorage auth, no shared query/cache layer, most critical workflows still lack UI tests |
| Mobile | Expo SDK 54, React Native 0.81, Expo Router, TypeScript, TanStack Query | SecureStore, typed domain models, theme tokens, push routing, retry/error handling, skeletons | Large screens, dense tab navigation, native behavior not regression-tested |
| Backend | FastAPI, SQLAlchemy, PostgreSQL, Pydantic, Alembic | Server permissions, schemas, migrations, domain services, meaningful API tests | Large routers, timezone-sensitive lifecycle defect, deprecation warnings, limited observability |
| External services | Google Maps through backend, Expo notifications, PDF/export and file sharing | Server-side Maps secret, role-aware push deep links, export capability | Failure/latency UX and production monitoring are not fully visible |

### Role and permission model

- **Admin:** dashboard access; consultation and doctor-visit management; treatment-plan approval; schedule creation; claim view/approve/reject; staff and settings management through role checks.
- **Doctor:** own consultations and visits; treatment-plan creation; doctor expense management; doctor claim submission.
- **Therapist:** own schedules; travel management; therapist claim submission.

Server-side permission dependencies are the source of truth. Web and mobile also hide or redirect unauthorized areas. This defense-in-depth approach is good; client checks should continue to be treated as navigation assistance, never authorization.

## 4. Feature inventory and workflow map

### Shared and platform services

| Capability | Web | Mobile | Backend/support |
|---|---:|---:|---|
| Email/password authentication and role redirect | Yes | Yes | JWT access token and `/auth/me` |
| Role/permission navigation | Yes | Yes | Server role/permission dependencies |
| Profile/session logout | Yes | Yes | Active-user validation on authenticated requests |
| Location capture | Browser geolocation | Expo Location | Reverse geocoding through backend Maps endpoints |
| Push notifications | No | Yes | Token registration; schedule, claim, and reminder payloads |
| Loading/error/empty states | Partial/shared primitives | Stronger shared patterns | Structured HTTP errors, not globally standardized on web |
| PDF/export/share | Yes | Yes | Claim/report data and invoice/proof endpoints |

### Administrator workflow

1. View operational dashboard counts.
2. Create, edit, search, filter, inspect, and review treatment schedules.
3. Create and maintain therapist and doctor accounts.
4. Review therapist claims, inspect trip/treatment evidence, and approve or reject.
5. Manage the doctor workflow: consultations, treatment-plan decisions, schedule generation, and doctor claims.
6. Review KPI reports, trends, claim status, therapist performance, activity, and generated insights.
7. Configure per-kilometre and daily allowance values.

### Therapist workflow

1. Start the workday with location capture and a reverse-geocoded address.
2. Review today's, upcoming, missed, and completed schedules.
3. Open a schedule, record arrival/treatment punch-in, notes, completion or missed reason, and punch-out.
4. Record travel, distance, route, amount, and supporting details; view today's travel and invoices.
5. Submit a claim and track pending, approved, or rejected outcomes.
6. End the workday after policy conditions are satisfied and receive a completed/pending summary.

### Doctor workflow

1. Start/end attendance with location.
2. Review and complete assigned consultations with patient outcome/decision data.
3. Create or manage visits and record visit treatment sessions.
4. Create treatment plans and follow approval/rejection state.
5. Record expenses, travel waypoints, amounts, and proof files.
6. Assemble and submit doctor claims and track review outcomes.

### Administrator-to-field lifecycle

`Consultation â†’ patient decision â†’ doctor visit â†’ treatment plan â†’ admin approval â†’ therapist schedules â†’ treatment execution â†’ travel/expense evidence â†’ claim submission â†’ admin review`

The application already models this valuable end-to-end chain. Product improvements should make this lifecycle more visible rather than adding more disconnected pages.

## 5. What works well

### Product and workflow strengths

- The domain model reflects real operational hand-offs rather than isolated CRUD screens.
- Dashboards are role-specific and use plain-language counts that are easy to scan.
- Admin review responses include pagination, totals, ageing, high-value and urgency signals, which are useful foundations for prioritization.
- Treatment sessions and workdays are modeled separately, allowing attendance and clinical execution to be audited.
- Doctor travel supports waypoints, proof files, consultation/visit relationships, and claim grouping.
- Schedule notifications and claim outcomes deep-link users back into relevant mobile screens.

### UX/UI strengths

- Live dashboards remained legible at desktop and narrow mobile-web widths.
- Responsive web shells replace desktop sidebars with compact headers and drawers.
- Status colors are generally consistent: green for success, amber for pending/warning, red for missed/rejected, and blue/indigo for primary actions.
- Mobile uses centralized color, spacing, radius, typography, and shadow tokens.
- Mobile screens frequently provide pull-to-refresh, retry actions, skeletons, disabled submission states, and minimum touch-target heights.
- Mobile secure credential storage and automatic session-expiry routing are substantially stronger than the web equivalent.

## 6. Current challenges

### 6.1 Critical workflow reliability

The backend suite fails two tests in `test_treatment_sessions_workday_end.py`. Both failures return **â€œNo active workday was found for todayâ€** when the expected behavior is either successful closure or an instruction to punch out an active treatment. The likely risk is inconsistent use of the application timezone and the stored work-date/current-date boundary.

**Why this matters:** ending a workday is not a secondary action. It closes attendance, produces the daily summary, affects logout, and protects against unfinished treatments. A failure can leave users uncertain whether work and travel have been captured.

### 6.2 Navigation reflects modules, not daily jobs

- Therapist web navigation contains nine destinations, splitting schedules into four separate pages.
- Doctor web has seven primary destinations.
- Doctor mobile exposes seven bottom tabs; admin mobile exposes six. Five is a safer practical maximum for persistent bottom navigation.
- The same clinical lifecycle is spread across consultations, visits, treatment plans, schedules, expenses, and claims without a unified patient/work-item timeline.

The result is learnable for trained back-office users but demanding for field staff who need the next action immediately.

### 6.3 Long and fragile screens

Several files combine fetching, filtering, validation, mutation, modal state, rendering, and extensive styles:

- `mobile/app/(admin)/reports.tsx`: about 1,483 lines
- `mobile/app/schedule-details.tsx`: about 1,464 lines
- `mobile/src/components/schedule/AdminScheduleFormScreen.tsx`: about 1,289 lines
- `mobile/app/(admin)/claims.tsx`: about 1,218 lines
- `frontend/src/pages/AdminDoctorConsultationsPage.jsx`: about 853 lines
- `frontend/src/pages/DoctorExpensesPage.jsx`: about 802 lines

This increases regression risk and makes visual consistency harder. The size is a symptom; refactoring should follow user workflows and reusable behavior, not arbitrary line limits.

### 6.4 Uneven platform foundations

Mobile has a shared theme, query client, normalized API errors, typed services, secure storage, and common workflow components. Web largely relies on direct service calls, per-page state, local Tailwind strings, `localStorage`, and toast messages. Users can therefore receive different retry, validation, loading, and session-expiry behavior for the same backend operation.

### 6.5 Release confidence is too low

- There are no web or mobile component/end-to-end tests.
- Web lint fails with 16 errors, including hook/closure issues and unused imports.
- Backend warnings include Pydantic class-based configuration deprecations and use of `datetime.utcnow()` through model defaults.
- Expo Doctor reports patch-version drift for `expo`, `expo-constants`, and `expo-file-system`.
- Dependency audits report unresolved advisories. Applicability varies, especially for Expo tooling, but the findings need triage and documented upgrade decisions.

### 6.6 Weak operational feedback loop

The repository does not show product analytics, crash reporting, distributed tracing, or user-visible support correlation IDs. Console logging is present, but console output cannot answer:

- How often does workday start/end fail?
- Which schedule step causes abandonment?
- How long does claim approval take?
- Which API calls cause the longest skeleton states?
- How often are location or notification permissions denied?

### 6.7 Reporting and export parity

The original implementation was therapist-focused and offered no web export. That claim-reporting gap is now substantially resolved: administrator web exports combine therapist and doctor claims; doctors and therapists have self-scoped My Reports; and PDF/XLSX/CSV are server-generated with privacy-safe columns. Preview creates an owner-scoped immutable snapshot that expires after 24 hours, so the downloaded file cannot drift if a claim changes between preview and generation.

The administrator operational overview still aggregates therapist-focused schedule/travel metrics and excludes doctor clinical/performance totals. However, the shared Report Center now exposes privacy-safe organization and self reports for claims, workdays, travel/expenses, and clinical activity, plus an administrator exception register covering open work, early closures, missed sessions, rejected submissions, and manual financial records. Web and Android users can filter role, state, and period; preview report-specific totals; and retrieve retained PDF/XLSX/CSV artifacts through authorized history. Web Playwright now verifies administrator preview-to-PDF delivery at desktop and mobile widths. Approved performance summaries, exception assignment/decisions, a queued worker for large jobs, scheduled retention, broader browser coverage, and native Android automation remain open. See the [complete Reporting and Export Audit](./REPORTING_EXPORT_AUDIT.md).

## 7. Feature improvements by role

### Administrator

| Opportunity | User value | Recommendation |
|---|---|---|
| Exception-first home | Reviewers should see problems before totals | Add queues for overdue claims, missed schedules, rejected plans needing correction, sessions still in progress, and unclosed workdays. |
| Unified clinical case view | Reduces switching among six modules | Add a patient/work-item timeline connecting consultation, visit, plan, generated schedule, treatment, expense, and claim. |
| Bulk operations | Reduces repetitive review work | Support safe multi-select assignment, export, reminder, and low-risk bulk approval with an explicit review summary. Keep clinical rejection decisions individual. |
| Saved filters and queue ownership | Makes daily review repeatable | Allow saved views such as â€œmy pending claimsâ€, â€œover 3 daysâ€, and â€œhigh valueâ€; show reviewer/last action. |
| Audit trail | Improves trust and dispute resolution | Record and display who changed status, assignment, allowance rate, amount, or rejection reason and when. |
| Report drill-down | Turns charts into action | Make KPI and chart segments open the exact filtered record list from which the value was calculated. |
| Settings safety | Prevents financial surprises | Add effective dates and change history to allowance rates; show which rate a claim used. |

### Therapist

| Opportunity | User value | Recommendation |
|---|---|---|
| â€œNext taskâ€ home | Minimizes navigation in the field | Place the next appointment, travel action, arrival status, and primary CTA at the top of the dashboard. |
| Consolidated schedule | Reduces four separate lists | Use one Schedule screen with Today, Upcoming, Completed, and Missed filters; preserve direct notification links. |
| Guided treatment execution | Prevents skipped steps | Use a visible stepper: Navigate â†’ Arrive â†’ Punch in â†’ Record treatment â†’ Punch out â†’ Travel ready. |
| Permission recovery | Avoids dead ends | Explain why location is required, offer â€œOpen settingsâ€, and show a retry path after denial or low accuracy. |
| Offline draft queue | Supports weak connectivity | Persist notes, travel drafts, and proof metadata locally; show pending-sync state and prevent duplicate submissions with idempotency keys. |
| End-of-day checklist | Makes closure predictable | Before End Workday, list active treatments, missing travel, incomplete notes, and pending schedules with direct fix actions. |
| Claim transparency | Reduces support questions | Show the allowance calculation, included trips/sessions, rate source, submission timestamp, ageing, and rejection correction path. |

### Doctor

| Opportunity | User value | Recommendation |
|---|---|---|
| Reduce seven bottom tabs | Improves reachability and comprehension | Keep Home, Work, Expenses, Claims, and Profile. Put Consultations, Visits, and Treatment Plans inside a â€œWorkâ€ hub with badges and contextual links. |
| Patient/work queue | Aligns with the real workflow | Group consultation, visit, and treatment-plan tasks by patient and show the next required action. |
| Reuse patient data | Reduces typing and mistakes | Carry patient identity, phone, address, diagnosis, and originating record forward when creating visits/plans/expenses. |
| Expense capture assistant | Improves evidence quality | Provide a concise step flow for visit link, route/waypoints, amount, category, proof, review, and save. |
| Claim readiness indicator | Prevents invalid submissions | Show eligible expenses, missing proofs, excluded entries, total, and blocking reasons before enabling Submit. |
| Draft treatment plans | Protects clinical work | Auto-save locally/server-side and show last-saved state for long clinical forms. |

## 8. UX and UI assessment

### Information architecture

The desktop sidebars are clear, but they expose nearly every database module as a first-level destination. The mobile tab bars repeat this structure in a smaller space. Navigation should prioritize frequency and urgency:

- **Today/Next:** what must the user do now?
- **Work:** consultations, visits, schedules, and treatment execution.
- **Money:** travel, expenses, and claims.
- **History/Profile:** completed records, settings, and account actions.

This grouping reduces cognitive load without removing capability.

### Dashboards

Live dashboards are visually clean and responsive. Admin metrics fit into a two-column mobile grid; therapist metrics clearly separate task and travel/claim groups; doctor cards explain each workflow. Improvements:

- Make metric cards actionable everywhere and show a consistent affordance.
- Place urgent exceptions and the next required action before general totals.
- Show â€œlast updatedâ€ and a refresh affordance when API latency is noticeable.
- After a reasonable threshold, change skeletons to â€œStill loadingâ€ with Retry rather than showing indefinite placeholders.
- Avoid generic greetings and decorative copy when they displace operational context on small screens.

### Forms

The product contains long schedule, consultation, treatment-plan, expense, claim, and report-filter forms. Recommended standard:

1. Persistent title with record context.
2. Sections based on the user's mental model, not database fields.
3. Inline validation next to the relevant field.
4. Required/optional labels that do not rely on placeholders.
5. Input masks or pickers for dates, times, currency, distance, and phone numbers.
6. Save-draft support for clinical and expense forms.
7. Review summary before irreversible submission.
8. Unsaved-change protection on back navigation.

### Feedback and error recovery

- Mobile's normalized error layer is a strong starting point, but frequent native `Alert` dialogs interrupt flow and do not preserve context well.
- Web mostly relies on toast messages; important validation or failed loading should remain visible in the page until resolved.
- Destructive and financial actions need a consistent confirmation component that states record, amount, consequence, and recovery path.
- Error states should include a specific retry action, offline/server distinction, and support reference for unexpected failures.

### Visual system

- Keep the current restrained green/blue clinical palette and high-contrast status tones.
- Create web tokens matching mobile: color roles, typography scale, spacing, radius, elevation, focus ring, and motion.
- Standardize PageHeader, MetricCard, DataTable/List, FilterBar, StatusBadge, EmptyState, ErrorState, Skeleton, FormField, Date/Time picker, Dialog, and BottomSheet.
- Reduce excessive small uppercase labels and `10px`â€“`11px` text, especially for field use and outdoor viewing.
- Use icons as reinforcement, never as the only label for an unfamiliar clinical or financial action.

## 9. Accessibility and responsive design

### Current state

- Mobile accessibility props appear broadly across route files and shared components.
- Many mobile buttons use at least 44â€“52 px heights and readable status text.
- Web has some `aria-label` and focus styling, but coverage is inconsistent relative to the number of screens.
- Custom web sidebars/dialogs and icon-only controls need systematic keyboard and screen-reader validation.

### Required improvements

1. Target WCAG 2.2 AA for web and equivalent native accessibility practices.
2. Add explicit labels/hints for icon buttons, location actions, status chips, charts, and proof-file controls.
3. Manage focus when drawers/dialogs open and close; support Escape and focus trapping.
4. Announce async success, validation failures, and status changes without relying only on toast color.
5. Verify text and status contrast in light/dark system modes; mobile declares automatic UI style but its palette is effectively light-only.
6. Support font scaling without truncating tab labels, amounts, patient names, or CTAs.
7. Provide table alternatives and text summaries for report charts.
8. Test keyboard navigation at 200% zoom and native screen readers (TalkBack first, then VoiceOver).
9. Respect reduced-motion preferences for page and skeleton animations.

## 10. Cross-platform consistency

| Area | Current difference | Recommendation |
|---|---|---|
| Authentication storage | Web uses localStorage; native uses SecureStore | Prefer secure, short-lived web sessions using HttpOnly/SameSite cookies if deployment architecture permits; otherwise harden CSP and token lifetime. |
| Data fetching | Web uses page/service calls; mobile uses TanStack Query | Adopt a common query/cache/error policy on web. |
| Validation | Implemented per form and platform | Define shared field rules and error codes at API/schema level, then map consistently in both clients. |
| Error UX | Web toasts; mobile alerts/cards | Define severity-based feedback: inline, banner, toast, blocking dialog. |
| Navigation | Web sidebars; mobile dense tabs | Use shared task groups and naming while preserving platform-native controls. |
| Design tokens | Stronger on mobile | Establish a cross-platform semantic token source or documented mapping. |
| Feature flags | Explicit on mobile | Add controlled web flags and server capability responses for staged rollout. |
| Route aliases | Mobile maintains both grouped therapist routes and compatibility exports | Document canonical routes and add tests so notification/deep-link aliases cannot diverge. |

## 11. Reliability, security, performance, and maintainability

### Reliability

- Fix date/time ownership for workdays. Store timestamps in UTC, store explicit business `work_date`, and compute it through one India-timezone utility.
- Make important mutations idempotent: workday start/end, punch-in/out, claim submit, plan approval, and schedule generation.
- Add optimistic locking or explicit state-transition conflicts for records reviewed on multiple devices.
- Make partial failures visible. For example, a successful workday start should not appear failed only because reverse geocoding failed.
- Add backend tests at midnight boundaries, retry/double-tap conditions, and stale-client state transitions.

### Security and privacy

- Upgrade and retest Axios, React Router, DOMPurify/form-data dependencies, then triage Expo transitive findings against official SDK-compatible releases. Do not use a forced major Expo upgrade without a migration test cycle.
- Add login throttling/rate limiting and account lockout or progressive delay.
- Add password reset, password policy, credential rotation, and optional MFA for administrators.
- Move web authentication away from long-lived JavaScript-readable tokens where feasible. The current JWT lifetime is 24 hours.
- Add a strict Content Security Policy and verify upload content type, size, storage isolation, authorization, and malware strategy.
- Ensure logs and analytics never capture access tokens, proof files, patient names, phone numbers, addresses, clinical notes, or precise coordinates.
- Display an audit history for approvals, rejections, staff status, settings, and financial calculations.

### Performance

- Measure deployed API cold starts and p50/p95 latency. The audit encountered a noticeable initial wait before dashboards resolved.
- Add â€œlast updatedâ€, retry, and slow-loading states rather than indefinite skeletons.
- Split large routes and lazily load heavy PDF/report modules. Web build output includes sizeable HTML-to-canvas/PDF-related chunks.
- Apply server pagination and debounced search consistently to long lists.
- Cache stable lookup data such as staff/options while invalidating after administrative changes.
- Compress proof images before upload and show progress/cancellation.

### Maintainability

- Refactor by workflow capability: query hook, validation schema, state-machine actions, presentational sections, and screen composition.
- Move web API authentication/session expiry into one Axios client/interceptor.
- Replace duplicated status/date/currency logic with shared utilities and contract tests.
- Add TypeScript to web incrementally, starting with API DTOs and financial calculations.
- Update starter documentation with architecture, role journeys, environment setup, migrations, release checklist, and test accounts/data strategy.

## 12. Prioritized findings register

Effort is expressed as a rough engineering estimate for one experienced product team and excludes external approval time.

| ID | Priority | Area / affected users | Evidence | User/business impact | Recommendation | Effort |
|---|---|---|---|---|---|---|
| F-01 | **P0 — implemented** | Workday end / therapists | Active-row and India-business-date logic are regression-tested in the 181-test backend suite | Attendance closes through server-owned readiness; active sessions remain a hard blocker | Retain boundary/idempotency regression coverage | Complete |
| F-02 | **P1 — substantially implemented** | Critical flows / all roles | 60 Playwright checks cover core admin, doctor, and therapist workflows at desktop/mobile widths; 8 mobile unit tests cover offline/export rules | Broad web regressions are gated; native UI/device regressions remain the gap | Add Android component/E2E automation for permissions, process death, GPS, and file delivery | Native QA tranche |
| F-03 | **P1 â€” implemented** | Web quality / all web users | Web lint is clean, production build passes, and the GitHub quality workflow gates lint/build/Playwright alongside backend/mobile checks | Hook/build regressions now fail locally and on configured pull-request CI | Keep the workflow required in repository branch protection and prevent warning growth | Operations setting only |
| F-04 | **P1 — implemented** | Mobile doctor navigation | Five visible tabs with a task-oriented Work hub; three detailed modules are hidden from the primary bar | Primary navigation density and target crowding are reduced | Validate labels and task ordering with doctors | Validation only |
| F-05 | **P1 — substantially implemented** | Offline/poor network / field users | Account-scoped secure mutation queue supports critical attendance, session, and claim actions with expiry, deduplication, replay, conflict state, and visible recovery | Most critical attachment-free actions survive interruption; proof-bearing completion remains explicit retry | Validate process-death/reconnect behavior on Android and design durable proof capture | Native/proof tranche |
| F-06 | **P1 — partially implemented** | Security/dependencies / all | Web production audit reports 0 vulnerabilities; mobile reports 31 transitive findings whose automated resolution requires breaking Expo/Router upgrades | Web exposure is cleared; mobile framework advisories require controlled SDK migration | Upgrade Expo/Router in an isolated compatibility tranche and rerun device tests | SDK migration |
| F-07 | **P1 — substantially implemented** | Web sessions / web users | Token lifetime is configurable and bounded to 15–1,440 minutes with an eight-hour default; UTC issuance/expiry, centralized 401 cleanup/re-login guidance, and Vercel CSP/frame/MIME/referrer/permission headers are implemented | Exposure duration, XSS blast radius, framing, and expiry recovery are improved; localStorage remains accessible to successful same-origin script execution | Validate CSP against production integrations and migrate to secure HttpOnly cookies with CSRF protection when the deployment architecture supports it | Cookie migration tranche |
| F-08 | **P1 — implemented on critical paths** | Workday/treatment state / field users | Server-owned transitions, optimistic versions, idempotency keys, database constraints, and machine-readable recovery errors cover critical mutations | Duplicate taps/retries and stale writes are controlled on supported paths | Extend the shared action contract when adding new mutable domains | Ongoing invariant |
| F-09 | **P2** | Initial loading / all live web roles | Live verified; noticeable cold-start skeleton period | Users may interpret the app as stuck, especially in the field | Measure latency, reduce cold starts, add slow-state copy, retry, and last-updated time | 2â€“5 days UI plus hosting work |
| F-10 | **P2 â€” implemented** | Therapist navigation | One web workspace now provides Today, Upcoming, Completed, and Missed tabs with URL-addressable state; legacy paths redirect to matching tabs | Navigation density and status-first decision load are reduced while Today treatment actions remain available | Validate terminology and tab ordering with field therapists; add UI automation for all views | 1â€“2 days validation/testing |
| F-11 | **P2** | Clinical lifecycle / admin and doctor | Separate module pages; code verified | Context is lost across consultation, visit, plan, and schedule | Add a patient/work-item timeline and next-action links | 2â€“4 weeks |
| F-12 | **P2 â€” partially implemented** | Long forms / doctors and admins | Android doctor expense creation now auto-saves/restores a local draft and explicitly excludes ephemeral receipt files; other large forms remain unprotected | Expense abandonment risk is reduced, but treatment plans and administrative schedule forms can still lose input | Extend the shared draft policy, then add staged sections, summary review, and unsaved-change protection | 2â€“3 weeks remaining |
| F-13 | **P2** | Maintainability / engineering | Multiple 800â€“1,400+ line UI files | Slower changes, inconsistent states, larger regression surface | Extract workflow hooks, schemas, sections, and common components | Ongoing; 2â€“4 weeks first tranche |
| F-14 | **P2** | Web UI consistency | Few shared UI components relative to 38 pages | Similar screens behave and look differently | Create semantic tokens and shared page/list/form/dialog primitives | 2â€“3 weeks |
| F-15 | **P2** | Error recovery / all | Web toasts and mobile Alerts are frequent | Errors disappear or interrupt users without preserving context | Standardize inline, banner, toast, and blocking-dialog rules | 1â€“2 weeks |
| F-16 | **P2 â€” partially implemented** | Accessibility / web users | Shared confirmation dialogs now use unique names/descriptions, initial focus, contained Tab/Shift+Tab focus, Escape close, focus restoration, and labeled shell menu controls; Playwright verifies the keyboard cycle and recovery at desktop/mobile widths | Common destructive confirmations are more predictable, but unreviewed forms, charts, tables, and custom modals may still block keyboard or assistive-technology users | Complete the WCAG audit and fix remaining custom-modal focus, labels, announcements, and chart/table alternatives | 2â€“3 weeks remaining |
| F-17 | **P2** | Metrics/operations / stakeholders | No product telemetry evident | Team cannot quantify adoption or prioritize failures | Add privacy-safe events, API metrics, crash reporting, and dashboards | 1â€“2 weeks |
| F-18 | **P2 — implemented** | Financial settings / admins and claimants | Effective-dated immutable reimbursement policies and decimal snapshots are shown on web/Android and retained on claims/expenses | Historical totals remain stable and explainable | Add production policy-owner review and rollback guidance | Acceptance only |
| F-19 | **P2 — partially implemented** | Android release readiness | Expo Doctor passes 18/18 and static/unit checks pass; no attached physical device | Dependency compatibility is healthy at repository level; native behavior is not device-proven | Complete the Android permission/location/export/process-death device matrix | QA |
| F-20 | **P2** | Account security / all | No reset/MFA/rate-limit flow evident | Weak recovery and increased credential risk | Add password reset, throttling, stronger policy, admin MFA option | 1â€“3 weeks |
| F-21 | **P3** | Mobile theme / mobile users | Automatic UI style with light-oriented tokens | System dark mode may produce inconsistent chrome/content | Either lock light mode intentionally or implement/test semantic dark tokens | 3â€“7 days |
| F-22 | **P3** | Documentation / engineering and support | Web/mobile READMEs remain largely starter/setup text | Onboarding and releases depend on tribal knowledge | Create architecture, workflows, operations, troubleshooting, and release docs | 2â€“4 days |
| F-23 | **P3** | Copy and terminology / all users | â€œScheduleâ€, â€œtaskâ€, â€œtreatmentâ€, â€œvisitâ€, and â€œclaimâ€ vary by area | Users may misunderstand status and next action | Create a domain glossary and controlled UX copy catalogue | 2â€“4 days |

## 13. Quick wins

These changes can improve confidence without redesigning the product:

1. Fix F-01 and make the backend suite fully green.
2. Resolve all web lint errors and remove debug `console.log` statements from production paths.
3. Align the three Expo SDK patch versions reported by Expo Doctor.
4. Add â€œStill loadingâ€”Retryâ€ after a defined dashboard timeout.
5. Add â€œlast updatedâ€ to dashboards and lists.
6. Make all dashboard cards consistently clickable with visible action text.
7. Consolidate status color/label helpers on web.
8. Increase small uppercase labels to a minimum readable field size.
9. Add explicit accessible names to every icon-only menu, close, filter, export, and attachment action.
10. Replace the doctor mobile seven-tab layout with a five-tab information architecture prototype and test it with users before implementation.

## 14. Delivery roadmap

### Phase 1 â€” Immediate stabilization (0â€“2 weeks)

- Keep the implemented workday/date/retry regression suite and all lint/build checks as required CI gates.
- Add browser/Android smoke automation for the now-stable critical workflows.
- Triage dependency advisories and apply compatible upgrades.
- Align Expo SDK patch dependencies.
- Add web smoke tests for each role login/dashboard and backend contract tests for all critical transitions.
- Add slow-loading, retry, and last-updated behavior to dashboards.
- Instrument API latency, error rates, workday operations, and session/punch transitions.
- Define canonical performance metrics and exception decision permissions on top of the implemented privacy-safe detail and exception snapshots.

**Exit criteria:** no P0 defect; clean lint/build; all backend tests pass; critical role smoke tests run in CI; release dashboard exposes error and latency baselines.

### Phase 2 â€” Workflow and usability (2â€“6 weeks)

- Validate the implemented Home, Work, Expenses, Claims, and Profile doctor navigation with field users.
- Validate the implemented therapist My Schedules workspace with field users and add tab/deep-link UI automation.
- Add next-action cards and end-of-day readiness checks.
- Standardize error, loading, validation, confirmation, and empty-state patterns.
- Build the first web design-system primitives and shared query/session layer.
- Extend the implemented Android doctor-expense draft lifecycle to privacy-reviewed treatment-plan and schedule fields, then add unsaved-change protection.
- Complete Android device testing for location denial, inaccurate GPS, background/resume, push deep links, uploads, keyboard, and weak network.
- Extend the implemented detail/exception catalogue and retained-job/history foundation with external artifact storage, approved performance summaries, and exception decisions.

**Exit criteria:** field users can identify and complete the next task without visiting multiple modules; no critical form loses data on navigation or transient network failure.

### Phase 3 â€” Product maturity (6â€“12 weeks)

- Add the unified patient/work-item timeline.
- Implement durable offline mutation queues with idempotency and conflict handling.
- Add audit history, saved admin queues, rate effective dates, and report drill-down.
- Refactor the largest screens and routers around domain services and workflow components.
- Complete WCAG/TalkBack/VoiceOver remediation.
- Add password recovery, login throttling, administrator MFA option, and stronger web session controls.
- Run a controlled field pilot, measure outcomes, and iterate before broad rollout.

**Exit criteria:** operational events are traceable, key workflows work under intermittent connectivity, accessibility checks pass, and adoption metrics meet agreed targets.

## 15. Success metrics

Record a baseline before redesign and segment by role, platform, app version, and connectivity quality. Never include patient-identifying data in analytics.

### Field adoption

- Weekly active therapists/doctors Ã· assigned active staff
- Percentage of assigned schedules opened and completed in the app
- Median time from app open to first required action
- Workdays successfully started and ended without support intervention
- Seven-day and 30-day role retention

### Workflow quality

- Schedule completion, missed, and cancellation rates with standardized reasons
- Punch-in/out failure and retry rate
- Percentage of workdays blocked by an active/incomplete treatment
- Draft recovery and offline-sync success rate
- Location permission denial and recovery rate
- Duplicate mutation/conflict rate

### Claims and operations

- Median claim submission time after eligible work is completed
- Median admin review time and 90th percentile ageing
- First-pass approval rate
- Rejection rate by structured reason
- Claims with missing proof or calculation disputes
- Admin records reviewed per hour without increasing reversal/error rate

### Reliability and experience

- Crash-free sessions and unhandled client errors
- API availability and p50/p95 response time by endpoint
- Dashboard time to meaningful content
- Form completion and abandonment rate
- Support tickets per 100 active users, categorized by workflow
- Accessibility defects open/closed and task success with assistive technology

## 16. Recommended validation plan

Before implementing major navigation or workflow changes:

1. Interview and observe three therapists, three doctors, and two administrators performing real but anonymized tasks.
2. Measure current task time, errors, backtracking, help requests, and confidence.
3. Prototype the therapist Next Task flow, doctor Work hub, and admin exception queue.
4. Test prototypes on low/mid-range Android devices at small and large font scales.
5. Validate weak-network, denied-location, notification-deep-link, and interrupted-form scenarios.
6. Release behind role/platform feature flags and compare completion, failure, and support metrics.

## 17. Final guidance

The product does not need another broad round of isolated features first. It needs a reliable, visible workflow spine. The best next investment is to make the existing clinical and reimbursement lifecycle dependable and effortless: show the next task, preserve work under poor connectivity, make every state transition explainable, and give administrators exception-oriented oversight.

If Phase 1 is completed before feature expansion, the team will reduce operational risk and create a stable base for the more valuable Phase 2 changes. The current mobile architecture already contains many of the right building blocks; the highest leverage is to extend that discipline to web, testing, observability, and cross-role workflow design.
