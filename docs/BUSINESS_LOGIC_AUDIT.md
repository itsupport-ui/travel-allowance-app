# Complete Business Logic Audit

**Product:** Travel Allowance  
**Audit date:** 30 August 2026  
**Primary objective:** Make clinical fieldwork, attendance, travel reimbursement, and review easy to complete without weakening operational control  
**Platforms reviewed:** React/Vite web, Expo/React Native mobile (Android-first), FastAPI/SQLAlchemy backend  
**Companion documents:** [Web and Mobile Product Audit](./PRODUCT_UX_UI_AUDIT.md) and [Reporting and Export Audit](./REPORTING_EXPORT_AUDIT.md)

## Current implementation status â€” 6 September 2026

**Latest financial-policy completion:** Doctor expenses now snapshot the effective receipt threshold and evidence requirement. Reviewers can authorize a positive amount up to the submitted fare without rewriting it; immutable review events retain submitted and approved amounts, and claims/reports use the approved amount.

This section supersedes earlier implementation counts and open-item statements below. The location-exception and location-policy tranches are now implemented end to end. When the normal geofence or GPS-quality check fails, a doctor or therapist can submit fresh GPS evidence, accuracy, the specific punch action, and a required reason. The server enforces ownership, active workday, due-today state, evidence freshness, one active request, and role/target compatibility. Administrators review pending requests on web or Android with evidence quality and distance, and must record a reason to approve once or reject. Approved requests are target/action-specific, expire after the business date or approval window, reject material movement from the approved evidence, and are consumed atomically with the matching punch-in or punch-out. Rejection releases the active slot so corrected evidence can be resubmitted.

The implementation adds migration-backed location, early-closure, manual-travel, manual-doctor-expense, consultation, and centralized audit lifecycles; optimistic version checks; machine-readable recovery errors; one-time location-exception consumption; web/mobile field controls; and web/mobile administrator queues. Administrators can create effective-dated policy versions for geofence radius, accepted GPS accuracy, evidence freshness, approval lifetime, and allowed evidence movement; each location exception snapshots the applicable policy so later changes cannot rewrite its decision rules. Current web and Android clients submit accuracy and capture time for direct punches. A temporary server compatibility path still accepts legacy clients that omit accuracy, and should be removed after minimum-client-version enforcement. An early workday closure enters `pending` review and can be marked `acknowledged` or `follow_up_required` without rewriting attendance history. Manual therapist travel and manual doctor expenses require a business reason, remain outside claims until approved, support `changes_requested â†’ corrected/resubmitted`, soft cancellation, immutable revision events, and administrator review on web/Android. Doctor expenses now use explicit categories; verified mileage is calculated from route distance and the effective rate, while typed-route manual exceptions require a receipt. Both professions block a daily claim while any manual record remains pending or needs correction, preventing an approved item from being stranded behind the unique daily claim. Consultations now require a dated/reasoned follow-up task, preserve cancellation reasons, and create linked replacement or follow-up records instead of overwriting appointment history. Server-owned actions, optimistic lifecycle versions, and an immutable event timeline are exposed on web and Android for doctors and administrators.

A permission-protected centralized operational log now records privacy-conscious actor, role, India business date, entity, action, outcome, state transition, reason code/reason, related record, correlation ID, and safe metadata. Critical write paths cover consultations, doctor visits and therapist treatments, workday start/end and early-close review, treatment-plan decisions and generated schedule series, location-exception request/decision/use, manual travel and doctor-expense review, therapist and doctor claims, report exports, staff lifecycle changes, effective-dated reimbursement/location policies, and push-registration enable/refresh/transfer/disable events. Repeated identical push registration is deliberately not logged, preventing app-start noise. Administrators can filter and page this history on web, or filter by domain/date and progressively load it on Android; both clients now expose Staff, Configuration, and Notification domains. Staff audit metadata records changed field names and credential-change presence without names, email addresses, phone numbers, or passwords. Notification events exclude push tokens and installation identifiers. Structured clinical events continue to exclude patient, address, coordinate, proof-path, and clinical-note fields; operational reasons remain restricted to authorized administrators and must not contain patient details. Staff deactivation now has a formal, migration-backed override lifecycle: readiness previews active work, future assignments, draft financial records, pending reviews, and claims; active sessions/workdays are non-overridable; softer impacts require a reasoned request and decision; approvals are condition-fingerprinted, expire after 24 hours, and are consumed once. Doctor profile status is synchronized with login access. Web and Android staff editors expose the same server-owned blockers and review flow. A migration-backed operational follow-up queue now gives cross-domain exceptions an active-admin owner, priority, due date, controlled state machine, version-safe updates, required resolution, and audit events on web/Android. The full backend suite passes **181 tests**, migration `0026_operational_follow_ups` is the single head, web lint/build pass, Android lint/TypeScript and **11 mobile unit tests** pass, and the web Playwright suite passes **62 desktop/mobile-responsive checks**.

Therapist and doctor claims now expose a server-owned daily preview on web and Android. It returns the India business date, exact eligible record IDs/count, unresolved manual-review count, current or rejected claim revision, machine-readable blockers, next action, calculation metadata, and the exact financial total. Therapist previews also expose distance, frozen travel fare, allowance, effective policy version/rate, and patient-visit eligibility. Submission uses the same locked readiness service rather than repeating client or router calculations, then revalidates under transaction before linking records. The clients no longer infer readiness from independently filtered travel/expense lists; they show loading, blocked, ready, rejected/resubmission, and already-submitted states and confirm the server total before submission.

Android now has a durable, account-scoped offline mutation queue for therapist/doctor workday start/end, treatment or visit punch-in, doctor visit punch-out, attachment-free therapist treatment punch-out, and both daily claim submissions. Privacy-safe metadata is stored in AsyncStorage while coordinates, addresses, reasons, notes, and other request payloads are stored per action in device SecureStore. A stable operation UUID is assigned before the first attempt, sent as `X-Idempotency-Key`, reused on replay, and propagated into centralized backend audit correlation. Queue entries deduplicate by owner/role/action/target/business date, recover an interrupted `syncing` state after process termination, retry on app foreground and at a bounded interval, expose visible sync/review/remove controls, and never replay after the Asia/Kolkata business date or expiry. Logout removes both metadata and secure payloads. Proof-bearing therapist completion is intentionally not queued because temporary attachment URIs cannot be safely retained; the form remains available for explicit retry. Native-device automation remains required before calling this production-proven.

Administrator dashboard logic now aggregates active doctors and therapists, both professions' scheduled/completed clinical work and claims, today's missed therapist occurrences, and the shared open follow-up queue. It no longer reuses a therapist-self endpoint for an administrator, and contract coverage protects the cross-role totals.

Escalating an early-closure review now reuses an existing active follow-up for the same source instead of violating the active-source uniqueness rule and rolling back the review. Final repository verification on 6 September 2026 confirms 181 backend tests, 62 responsive browser checks, 11 mobile unit tests, web/mobile static checks, the web production build, and migration head `0026`. Physical Android, GPS/poor-network, production operations, and policy-owner acceptance remain explicitly external validation activities.

Treatment plans now return role-specific `available_actions`, `blocking_reasons`, and `next_action` for submitted review, requested corrections, resubmission, approval, and schedule generation. Web and Android use those actions directly. This fixes an Android administrator defect where controls were inferred from a nonexistent `pending` response status even though the server returns `submitted`; terminology now consistently presents the recoverable outcome as **Request changes**, not terminal rejection.

Treatment schedules now use the same server-owned action contract for administrators and therapists. Unstarted appointments advertise the appropriate edit/cancel or session-readiness path, active sessions advertise monitoring/resume without unsafe edit/cancel controls, and terminal states expose the relevant detail action and blocker. The administrator web and Android list/detail surfaces consume these fields instead of inferring actions from the broad `scheduled` status.

| Location recommendation | Current disposition |
|---|---|
| Audited GPS exception request | **Implemented for therapist schedules and doctor visits** |
| Freshness and accuracy evidence | **Implemented for exception requests and current-client direct punches; legacy clients retain a temporary compatibility path** |
| Reasoned administrator decision | **Implemented with reviewer, reason, timestamps, status, and optimistic version** |
| One-time, retry-safe use | **Implemented atomically with the matching target/action punch** |
| Expiry and replay protection | **Implemented for business date, approval age, evidence movement, ownership, target, action, and status** |
| Configurable geofence/evidence policy | **Implemented as immutable effective-dated versions with web/Android administration and per-request snapshots** |
| Early workday closure review | **Implemented for doctor and therapist records on web/Android with acknowledge/follow-up decisions and immutable attendance history** |
| Manual-travel correction and review | **Implemented with required reason, claim gating, changes requested/resubmission, soft cancellation, and retained revision history** |
| Consultation cancellation, rescheduling, and follow-up | **Implemented with dated tasks, coded reasons, linked successors, optimistic versions, server actions, and immutable history on web/Android** |
| Centralized cross-domain audit log | **Implemented for critical clinical, attendance, financial, location, scheduling, consultation, reporting, staff, configuration, and notification mutations with authorized web/Android history; staff-deactivation override governance is implemented and broader override types remain** |
| Shared therapist/doctor claim preview and readiness | **Implemented on backend, web, and Android; submission reuses the same locked eligibility/calculation service** |
| Staff deactivation readiness and override | **Implemented on backend, web, and Android with hard blockers, impact preview, reasons, condition-matched approval, expiry, one-time consumption, and immutable audit events** |
| Durable Android critical-action queue | **Implemented with SecureStore payloads, account scoping, stable idempotency IDs, IST expiry, crash recovery, auto/manual retry, conflict attention state, removal controls, and 5 policy tests; proof-file actions and native-device automation remain** |

The highest remaining business-logic risks are now native-device validation and proof-file recovery around the new offline queue, broader override-policy coverage beyond staff deactivation, completing action metadata for lower-risk administrative domains outside the stabilized clinical/attendance/financial/scheduling paths, explicit legacy-client retirement for GPS evidence, richer searchable policy-history/rollback UX, and assignment/resolution beyond the current domain-specific follow-up flags.

## Implementation update â€” 31 August 2026

The stabilization and financial-integrity tranches are now implemented. Therapist workday closure uses the active workday; therapist/date uniqueness is migration-backed; India business dates are centralized across affected routes; concurrent therapist treatments are blocked; generated schedules retain coordinates; inactive clinical staff cannot be assigned; and rejected therapist/doctor claims and treatment plans support correction and resubmission. Approved-plan generation enforces session count/cadence and detects every occurrence conflict. Recurring ranges are stored as independently executable dated occurrences with scoped cancellation and a legacy-data migration. Reimbursement policies are immutable and effective-dated, monetary columns/calculations use decimal/`NUMERIC(12,2)` with explicit half-up rounding, and travel/claim records store policy, calculation version, included-record IDs, and frozen totals. Claim submission, workday start/end, and therapist/doctor punch transitions are retry-safe against duplicate taps; critical blockers now return machine-readable codes and suggested actions; workday readiness exposes server-owned actions, blockers, and next action. Early closure is allowed only with a stored reason on web/Android, enters an administrator review queue, and never rewrites attendance history; active sessions remain a hard blocker. Manual therapist travel and manual doctor expenses require a reason and approval, support correction/resubmission and soft cancellation, retain immutable review history, and block partial daily claims. Doctor mileage uses verified distance plus an effective rate snapshot, while actual-fare categories retain entered amounts and manual typed-route exceptions require receipts. Consultation cancellation and rescheduling now preserve the original record and create a linked successor; follow-up outcomes require a future date, time, and reason and can generate a linked appointment. The consultation timeline records actors, transitions, reasons, related appointments/visits, and versions. Location exceptions use effective-dated policies and administrator decisions. Report snapshots and idempotent jobs cover claims, attendance/workdays, travel/expenses, clinical activity, and organization exceptions. The expense register now includes privacy-safe category/review state and correctly marks reimbursable and bill amountsâ€”not claim IDsâ€”as currency. Expired artifact bytes/snapshots use one idempotent retention service and scheduler-ready CLI while audit history remains durable. Critical cross-domain mutations now also append a centralized, permission-protected operational event, and web/Android administrators can filter that shared history. Regression coverage passes **150 backend tests**, with **36 passing web Playwright checks**, passing web lint/build, and passing Android lint/TypeScript. Durable offline mutation queueing, staff/settings/notification audit expansion, formal override governance, broader action metadata, configurable receipt thresholds and reviewer-adjusted approved amounts, performance summaries, external object storage, explicit legacy-client retirement for incomplete GPS evidence, and assignment/resolution beyond the current domain-specific follow-up flags remain future work.

| Target rule | Disposition |
|---|---|
| India business date and therapist workday uniqueness | **Implemented and migration-backed** |
| Claim/plan correction and resubmission | **Implemented with revision/reviewer metadata** |
| Series plus independent occurrences | **Implemented with legacy migration and scoped cancellation** |
| Generated coordinates, cadence, count, and conflict checks | **Implemented** |
| One active clinical session | **Implemented for doctor and therapist** |
| Decimal money and effective-dated immutable policy snapshots | **Implemented** |
| Retry-safe claims, workdays, and punch transitions | **Implemented using current-state replay** |
| Machine-readable errors and server-owned readiness | **Implemented for critical field paths; expansion remains** |
| Early workday closure with a stored reason | **Implemented on backend, web, and Android** |
| GPS exception approvals and early-close review | **Implemented on administrator web/Android with reasoned, version-safe decisions** |
| Consultation recovery lifecycle | **Implemented on backend, web, and Android with linked successors and event history** |
| Centralized audit events and cross-domain follow-up assignment | **Critical cross-domain audit events and an authorized, assignable, version-safe follow-up/resolution queue are implemented on web/Android; automatic handoff shortcuts from every source screen remain incremental** |
| Durable local form recovery | **Partially implemented for Android doctor expense creation with user scoping, seven-day expiry, explicit restore/discard, receipt exclusion, eligibility recheck, and submission/logout cleanup** |
| Durable offline mutation queue and conflict UI | **Implemented for critical attachment-free field mutations with secure payload storage, retry, expiry, deduplication, and visible conflict recovery; proof-bearing completion remains explicit retry** |

The rule-by-rule sections below preserve the original code-backed findings for traceability. The implementation update and disposition table above are authoritative where a finding has since been fixed.

## 1. Executive verdict

The application has the right broad business concept and a substantial amount of useful defensive logic. Authentication rejects inactive accounts, role and ownership checks protect many record-level operations, important doctor transitions use row locks, schedule conflicts are detected, visit arrival is geofenced, travel rates are copied onto individual travel records, and doctor expenses become immutable after claim submission. These are good foundations.

The current business logic is substantially safer and suitable for a controlled pilot, but it is **not yet complete enough for an unmonitored broad field rollout**. The confirmed correction dead ends, recurrence model, generated coordinates, concurrent-session gap, workday date failure, and floating-point policy risks have been fixed. Critical Android actions now have durable secure retry; remaining risk is concentrated in proof-bearing/offline edge cases, native-device validation, remaining override coverage, and a few workflows that still hard-block instead of guiding a reasoned override.

The highest-risk remaining problems are:

1. Location exceptions are audited and policy-snapshotted, but legacy clients can still omit direct-punch accuracy until minimum-client-version enforcement is introduced.
2. Early-closure escalation now creates or reuses an owned, due-dated shared follow-up with controlled status, resolution, optimistic versioning, and audit history; threaded discussion remains outside the first release.
3. Manual therapist travel and doctor expenses now have equivalent correction/review lifecycles, and administrators can place any related record in the shared assignment/resolution queue; one-tap handoff from every domain-specific review remains incremental.
4. Retry-safe server transitions now have a SecureStore-backed Android queue across process restarts; proof-bearing completion, native reconnect/process-death automation, and broader long-form draft recovery remain.
5. Machine-readable actions/blockers cover critical workday, session, consultation, expense, claim, staff-override, and treatment-plan paths; general schedule resources and lower-risk administrative records still need the same contract as they evolve.
6. Actor/time/reason events are centralized for critical operational, staff, policy-configuration, and push-registration mutations; formal request/decision/expiry/consumption governance is implemented for staff deactivation, while additional override rule types still need the same shared framework.
7. Rate-policy history exists, but the administrator UI does not yet provide a complete searchable policy-history/rollback view.

### Product maturity by business domain

| Domain | Verdict | Business interpretation |
|---|---|---|
| Authentication and active-account enforcement | **Mostly correct** | Tokens, active-user checks, roles, and record ownership are present; permission vocabulary and role coverage need consolidation. |
| Staff eligibility | **Mostly correct** | New assignment paths validate active clinical staff, and deactivation now previews open work, hard-blocks active sessions/workdays, requires a reason, and uses a one-time reviewed override for softer impacts. Broader cross-domain reassignment automation remains. |
| Doctor consultations | **Mostly correct** | Dated follow-up tasks, coded cancellation, linked rescheduling, active-doctor assignment, optimistic versions, server actions, and immutable timelines are implemented; notification reminders and cross-domain case aggregation remain. |
| Doctor visits | **Mostly correct** | Workday, date, geofence, ownership, and one-active-visit checks are strong; exception and rescheduling rules are missing. |
| Treatment plans | **Mostly correct** | Correction/resubmission, reviewer metadata, and centralized decision/schedule-generation events preserve one plan revision path per visit; broader amendment controls remain. |
| Treatment scheduling | **Mostly correct** | Generated coordinates, staff eligibility, cadence/count enforcement, conflict checks, and terminal edit guards are implemented. |
| Recurring treatment | **Mostly correct** | A series now materializes independent dated occurrences with scoped cancellation; richer series-wide edit UX remains. |
| Therapist workday | **Mostly correct** | Date ownership, uniqueness, active-session blocking, retry-safe start/end, reasoned early closure, administrator review, and shared follow-up assignment are implemented; automatic handoff and analytics remain. |
| Doctor workday | **Mostly correct** | Uniqueness, waypoint capture, active-visit blocking, retry safety, reasoned early closure, and administrator review are implemented; route exceptions remain. |
| Location verification | **Mostly correct** | Effective-dated radius/quality/freshness policy, snapshots, current-client evidence, and audited one-time exceptions are implemented; legacy-client retirement remains. |
| Therapist treatment sessions | **Mostly correct** | Workday/date/ownership/geofence, one-active-session, GPS quality, and audited exception handling are enforced; broader offline recovery remains. |
| Therapist travel | **Mostly correct** | Automatic travel is policy-snapshotted; manual entries require a reason, approval before claiming, revisioned correction/resubmission, proof validation, and soft cancellation. Broader offline recovery remains. |
| Doctor expenses | **Mostly correct** | Visit-linked route derivation, categorized expense rules, verified mileage calculation, manual reason/receipt review, correction/resubmission, and claim gating are implemented. Effective-dated receipt thresholds, per-expense evidence snapshots, and reviewer-adjusted approved amounts are implemented; broader exception analytics remain. |
| Therapist claims | **Mostly correct** | Rejection releases travel and preserves reason/reviewer/revision; resubmission and duplicate replay are safe; server-owned preview and readiness are implemented on web/Android. |
| Doctor claims | **Mostly correct** | Rejection releases expenses, resubmission reuses the daily revision, duplicate replay is safe, and server-owned preview/readiness blocks unresolved financial exceptions. |
| Reimbursement settings | **Mostly correct** | Immutable effective-dated decimal policies and calculation snapshots are implemented; history/rollback UX and richer approval control remain. |
| Notifications | **Mostly correct** | Typed mobile routing exists for schedule and therapist claim events; business-critical event parity and delivery audit are incomplete. |
| Reporting calculations | **Mostly correct for implemented catalogue** | Claims, workdays, travel/expenses, clinical activity, privacy-safe organization exceptions, and objective performance metrics use immutable snapshots and retained PDF/XLSX/CSV jobs with authorized history; non-claim dashboard reconciliation remains. |

### Recommended operating principle

Use **balanced controls**:

- Hard-block actions that would create overlapping active clinical sessions, submit unauthorized data, duplicate payment, or close a workday with an active session.
- Turn fixable data problems into guided correction states with a reason, direct next action, and preserved audit history.
- Permit exceptional field situations through a reasoned, visible exception request rather than silent bypass or permanent failure.
- Make the server the source of truth for eligibility, calculations, allowed actions, and next steps on both web and mobile.

## 2. Evidence, method, and limitations

### Evidence levels

- **Code verified:** Confirmed directly in current models, routers, services, schemas, permissions, clients, migrations, or tests.
- **Test verified:** Confirmed by an automated test or by the current test result.
- **Previously live verified:** Authentication, role dashboards, and responsive shells were safely observed during the main audit using authorized disposable accounts.
- **Inferred impact:** A likely operational consequence derived from confirmed implementation. It should be validated with field staff or controlled acceptance testing.
- **Recommended:** Target business behavior that is not currently implemented.

### Automated test result

The original audit reproduced two therapist workday-end failures. After implementing the documented stabilization, recurrence, financial, and retry-safety fixes, the complete suite was rerun:

| Check | Result |
|---|---|
| Backend tests | **177 passed** |
| Failing tests | **None** |
| Workday regression | Closure summary, active-treatment block, and duplicate end retry pass |
| Financial regression | Effective-date versions, half-up decimal rounding, and immutable travel/claim snapshots pass |
| Retry regression | Duplicate claim submit, workday start/end, and therapist/doctor punch actions return the existing result without duplicate records |
| Migration head | `0026_operational_follow_ups` |
| Web client regression | Lint/build pass; **50 Playwright desktop/mobile-responsive checks pass** |
| Android static verification | Expo lint and TypeScript plus **11 offline/export/draft-policy unit tests** pass |

The former workday failures remain useful baseline evidence, but they are no longer current defects. Pytest cache warnings in this environment are unrelated to application assertions.

### Safety boundaries

- No deployed workday, consultation, visit, treatment, schedule, travel, expense, claim, approval, rejection, or report record was changed.
- Runtime mutation paths were not exercised against operational-style data.
- Patient names, addresses, phone numbers, coordinates, notes, receipts, credentials, and tokens are excluded.
- Android behavior is code-verified where no device-specific execution is claimed.
- Findings about irrecoverable states are based on transition maps, unique constraints, and available routes; they do not require creating a rejected production record to prove the control-flow conflict.

## 3. Current domain and workflow map

### Roles

| Role | Current responsibility | Important control |
|---|---|---|
| Administrator | Staff, consultations, visits, treatment-plan review, scheduling, claim review, settings, dashboards, reports | Permission checks such as `treatment_plans.approve`, `schedules.create`, and `claims.approve` |
| Doctor | Own consultations/visits, workday attendance, treatment plans, travel expenses, claims | Linked `Doctor` profile and ownership queries |
| Therapist | Own workday, schedules, treatment sessions, travel, claims | User role plus schedule/travel/claim ownership |

### Current end-to-end lifecycle

```text
Admin schedules consultation
        |
Doctor completes consultation and records patient decision
        |
Admin confirms decision and creates doctor visit
        |
Doctor starts workday -> punches in/out visit
        |
Doctor submits treatment plan
        |
Admin approves plan and generates therapist schedules
        |
Therapist starts workday -> punches in/out treatment
        |
System creates travel / doctor records expense
        |
Therapist or doctor submits daily claim
        |
Admin approves or rejects
        |
Reporting and reimbursement follow-up
```

### Where the lifecycle currently breaks

```text
Rejected treatment plan --X--> edit/correct/resubmit

Rejected therapist claim --X--> correct travel / resubmit

Rejected doctor claim -> expenses returned to draft
                      --X--> resubmit because same-date claim still exists

Approved plan -> generated schedules without coordinates
              --X--> therapist location-verified completion

Recurring schedule -> first completion/missed action
                   --X--> remaining occurrences
```

## 4. Current state transitions

The centralized transition maps in `backend/app/utils/workflow_transitions.py` are a good start, but several important lifecycle states and correction transitions are absent.

### Consultation

```text
scheduled -> completed | cancelled
completed -> terminal
cancelled -> terminal

patient decision:
pending -> confirmed | rejected | follow_up
follow_up -> confirmed | rejected
confirmed/rejected -> terminal
```

**Assessment:** Forward-only rules prevent accidental reopening, but `follow_up` has no scheduled follow-up object, due date, owner, or completion loop. A consultation can be marked complete with `follow_up`, but the operational next step is not modeled. Rescheduling and correcting a mistaken completion are also missing.

### Doctor visit

```text
scheduled -> visited | cancelled
visited -> treatment_plan_submitted
treatment_plan_submitted/cancelled -> terminal
```

**Assessment:** This is understandable in the happy path. It becomes inconsistent when a plan is rejected: the router manually moves the visit back to `visited`, outside the transition validator, while the rejected plan remains terminal and unique.

### Treatment plan

```text
pending -> submitted
submitted -> approved | rejected
approved/rejected -> terminal
```

**Assessment:** There is no actual draft route using `pending`, and no edit/resubmit path after `rejected`. The API creates plans directly as `submitted`. This makes the documented `pending` state largely conceptual.

### Treatment schedule

```text
scheduled -> completed | missed | cancelled
completed/missed/cancelled -> terminal

session:
NOT_STARTED -> IN_PROGRESS -> COMPLETED
```

**Assessment:** Suitable for one occurrence, unsuitable for a recurring series. Schedule and session states are stored together without a database-level invariant that prevents contradictory combinations.

### Claims

```text
therapist: pending -> approved | rejected
doctor:    pending -> approved | rejected
doctor map also declares submitted -> pending
```

**Assessment:** `submitted` is declared for doctor claims but normal submission creates `pending`. Rejected is terminal for both professions. Doctor expenses are detached after rejection, but the unique claim prevents another submission. Therapist travel is not detached and no correction reason is required.

## 5. Authentication, permissions, and staff eligibility

### What is correct

- `get_current_user` rejects missing users and inactive accounts.
- Server routes use roles/permissions rather than trusting only client navigation.
- Doctors are resolved through the user-to-doctor relationship before accessing doctor-owned records.
- Many claim, consultation, visit, schedule, invoice, and proof endpoints perform ownership checks.
- Staff-management tests cover inactive staff visibility, role restrictions, profile updates, and duplicate identifiers.

### Current issues

1. The permission catalogue contains only `admin`, `doctor`, and `therapist`, while parts of claim code check `claims.approved.view`, a permission not assigned by the current catalogue. This suggests role/permission drift or an incomplete future finance role.
2. Staff-selection lists can show active users, but direct schedule creation validates the therapist's role without consistently requiring `is_active = true`; doctor validation similarly does not always require `Doctor.active = true`.
3. Deactivating a staff member does not define what happens to future schedules, active workdays, open sessions, draft expenses, pending plans, or claims.
4. Role strings and permissions are not database constrained. A misspelled or unexpected role can authenticate but have unpredictable access.

### Recommended rules

- Define a single role/permission catalogue used by token responses, clients, routers, tests, and reports.
- Require both active user and active professional profile for new assignments and mutations. Historical read access should remain based on authorization, not current employment status.
- On deactivation, require an impact preview: active session, open workday, future assignments, draft financial records, and pending reviews. Block deactivation until urgent items are closed or reassigned; allow a documented admin override.
- Do not silently cancel or reassign clinical work during deactivation.
- Introduce explicit report and finance permissions only when the corresponding role is supported end to end.

## 6. Workday and attendance logic

### Current strengths

- Doctor workdays have a unique doctor/date database constraint.
- Both roles expose a `today` readiness response and active/ended state.
- Punch-in requires an active workday.
- Workday closure blocks an active clinical session.
- Doctor closure records an end waypoint, visit counts, duration, and total route distance.
- Therapist closure records scheduled/completed/missed counts.

### Confirmed problems

#### 6.1 Therapist workday closure fails current tests â€” P0

`therapist_workday.end_day` looks up an active row using `india_now().date()`. The tests create a workday under a different current date and patch only the router clock for the end call. Both expected behaviors are bypassed because the lookup returns no row.

This exposes a larger design weakness: business date is computed independently in multiple modules rather than passed through one service or attached to the active workday identity.

#### 6.2 Therapist workdays lack database uniqueness â€” P1

The router performs an application-level existing-row check, but `TherapistWorkDay` has no unique `(therapist_id, work_date)` constraint. Concurrent start requests can therefore create duplicates. Doctor workdays do have the equivalent constraint.

#### 6.3 Fixed 18:00 closure is a universal hard block â€” P1

Both roles are blocked from ending before `WORKDAY_END_TIME`, regardless of shift, final appointment, leave, emergency, or administrator instruction. This creates pressure to leave attendance open or wait only to perform an administrative action.

#### 6.4 Device time is collected but ignored â€” P2

Clients send `device_timestamp`, but workday and treatment endpoints do not use it. Ignoring untrusted device time for authoritative calculations is correct; accepting and then discarding it without recording diagnostic metadata is confusing and provides no offline/retry assistance.

### Recommended workday rules

1. Compute `business_date` through one injected `Asia/Kolkata` clock service. Store event timestamps in UTC and the explicit business date separately.
2. Add a unique therapist/date constraint and translate the race into an idempotent â€œalready startedâ€ response.
3. Identify active workdays by user plus active state; use the stored `work_date` as the authoritative day during closure and validate rollover explicitly.
4. Hard-block closure only when a clinical session is in progress or required location evidence is missing.
5. If closing before policy time, show a checklist and require a reason. Allow closure when there is no active session; flag it for administrator review when policy requires.
6. Pending future/today schedules should warn, not always block. Provide direct actions: complete, mark missed with reason, reassign, or confirm no action required.
7. If a workday crosses midnight, close the existing active workday rather than forcing a new-day lookup. Mark it as an overnight exception.
8. Make start/end idempotent and return the current workday snapshot for safe retry.

## 7. Consultation and doctor-visit logic

### What works

- Consultations cannot be created in the past.
- Doctors can view and complete only their own consultations.
- Completion validates both consultation and patient-decision transitions.
- Admin confirmation prevents duplicate visit creation.
- A unique consultation-to-visit relationship reinforces the one-visit conversion rule.
- Doctor visit punch-in requires the correct date, an active workday, ownership, geofence success, and no other active visit.

### Improvements needed

#### Follow-up is a label, not a workflow â€” P2

`follow_up` permits a later decision, but there is no follow-up date, task, reminder, attempt history, or assigned owner. Users must remember the next contact outside the system.

**Recommended:** Completing with follow-up must require `follow_up_at` and optionally a note. Create a follow-up task/event, notify the owner, and keep the case in a visible due/overdue queue.

#### Cancellation and rescheduling are incomplete â€” P2

The transition map allows cancellation, but the visible router set emphasizes lists and completion/decision flows. A consistent cancellation reason, actor, reschedule reference, and notification policy is not established across consultations and visits.

**Recommended:** Use `cancelled` with reason/category and optional `replacement_id`; rescheduling creates a new scheduled item linked to the cancelled record rather than overwriting history.

#### Geocoding is deferred for doctor visits â€” P2

Doctor visit coordinates may be populated at session-read or punch-in time. If geocoding fails in the field, the doctor discovers an administrator data problem at the patient location.

**Recommended:** Resolve and confirm coordinates when scheduling. Allow field verification as a secondary check, not the first validation.

## 8. Treatment-plan logic

### Confirmed dead end after rejection â€” P0

Current behavior:

1. Doctor submits a plan; the visit becomes `treatment_plan_submitted`.
2. Admin rejects the plan; the plan becomes terminal `rejected` and the visit is manually returned to `visited`.
3. The doctor cannot create another plan because `(doctor_visit_id)` is unique and the rejected plan still exists.
4. No plan update/resubmit endpoint uses `TreatmentPlanUpdate`.

The UI may tell the doctor a plan was rejected, but the domain supplies no valid next action.

The rejection route also assigns `plan.rejection_reason`, but `TreatmentPlan` does not define that database column and `TreatmentPlanResponse` does not expose it. The assignment is therefore not durable review evidence. Even before a correction workflow is added, the rejection reason must be persisted and returned to the doctor.

### Request-contract problem â€” P1

`TreatmentPlanCreate` contains fields such as `id`, `doctor_id`, `patient_name`, `status`, and timestamps even though the server derives or ignores them. Requiring irrelevant client fields increases form/API burden and creates ambiguity over which value is authoritative.

### Recommended plan lifecycle

```text
draft -> submitted -> approved
                   -> changes_requested -> draft -> resubmitted -> approved
                   -> rejected_final
```

- Doctor owns editable clinical content while status is `draft` or `changes_requested`.
- Admin uses `changes_requested` for correctable omissions and must provide a reason.
- `rejected_final` is reserved for an invalid/non-actionable case and requires a coded reason.
- Resubmission updates the same logical plan with an incremented revision; prior submitted revisions remain immutable in audit history.
- The visit remains linked to the logical plan and exposes the next action rather than being manually moved backward outside the state machine.
- The create request accepts only `doctor_visit_id` and editable clinical fields. Doctor identity, patient identity, status, and timestamps are server-owned.
- Approval captures reviewer, time, revision, and optional note.

## 9. Scheduling and recurrence logic

### Schedule conflict detection is useful but incomplete

The backend rejects overlapping scheduled time ranges and tests cover availability and conflict review. However, a recurring range is treated as occurring every day between start and end. It has no weekday/cadence rule, holiday/exclusion date, or per-occurrence status.

### Recurring schedule model is incorrect â€” P0

One `TreatmentSchedule` row contains:

- a recurring start/end range;
- one overall `status`;
- one `session_status`;
- one punch-in and punch-out;
- one completion/missed reason;
- at most one linked travel record because travel is unique by therapist/schedule.

The first completed occurrence sets the row to `completed`, so it no longer appears as scheduled on subsequent dates. The data model cannot correctly represent attendance, travel, missed visits, notes, or claims for multiple occurrences.

### Plan schedule generation is inconsistent â€” P0/P1

- It creates consecutive daily one-time schedules using `start + index days`.
- It does not interpret the plan's `frequency` or `duration`.
- It accepts a new `number_of_sessions` that may differ from `plan.sessions_required`.
- It checks conflicts, but generated schedules do not resolve/copy `patient_latitude` and `patient_longitude`.
- Therapist punch-in/completion requires stored patient coordinates and will return â€œPatient location has not been configured.â€

### Editing terminal schedules is insufficiently guarded â€” P1

The general admin update path does not clearly restrict editing to safe schedule states. Editing the therapist, patient address, date, or timing after punch-in/completion can invalidate ownership, travel, evidence, and reports.

### Recommended schedule model

Use two concepts:

```text
ScheduleSeries
- treatment plan, patient, clinician, cadence, start/end, default time
- active | paused | completed | cancelled

ScheduleOccurrence
- series_id, occurrence_date, assigned therapist, expected time
- scheduled | in_progress | completed | missed | cancelled
- independent punch, notes, location, travel, and exception evidence
```

Rules:

1. One-time schedules are a series with one occurrence or a direct occurrence under the same API abstraction.
2. Frequency is structured, not free text: daily, selected weekdays, weekly interval, or explicitly selected dates.
3. Generate and preview actual occurrence dates before commit.
4. The plan's required sessions is authoritative unless an admin records an approved variance reason.
5. Geocode and validate the patient location before any occurrence is committed.
6. Run conflict checks per occurrence and show all conflicts in one preview instead of failing one date at a time.
7. Edits specify scope: this occurrence, this and future, or entire series.
8. Completed occurrences and their clinical/financial evidence are immutable. Corrections use an audited amendment.
9. Reassignment is allowed only before punch-in; notify both old and new assignees.
10. Cancellation and missed status require distinct coded reasons because they have different operational meaning.

## 10. Location and geofence logic

### Current strengths

- Latitude/longitude pairs are validated as finite coordinates.
- Patient addresses are geocoded for direct schedule creation and address changes.
- Arrival is permitted at or within 250 metres and rejected outside it.
- Doctor punch-in and punch-out both validate arrival.
- Therapist travel creation validates the captured completion location.
- Tests cover boundary distance, missing coordinates, geocoding failure, and far/near arrival.

### Current gaps

1. The 250 m radius is hardcoded rather than policy/configuration driven.
2. Backend requests receive coordinates but not GPS accuracy, capture age, mocked-location signal, or provider state.
3. The backend compares the point but cannot distinguish a good reading from a several-hundred-metre accuracy radius.
4. There is no approved path for apartment complexes, hospitals, rural coordinates, map errors, denied permission, or device failure.
5. Reverse geocoding and route calculation failures are handled differently between doctor and therapist workflows.

### Recommended geofence policy

- Store policy version, configured radius, captured accuracy, capture timestamp, and measured distance.
- Accept normal attendance only when the reading is fresh and `measured_distance + accuracy` is within the allowed threshold, using an agreed tolerance model.
- If accuracy is poor, prompt retry and offer device guidance before failure.
- Allow an `exception_requested` action with reason, optional evidence, captured coordinates, accuracy, and timestamp. The session can proceed only under the organization's selected policy and must remain visibly exceptional.
- Never allow clients to declare `location_verified = true`.
- Validate/geocode patient locations during administrative scheduling, not at field arrival.

## 11. Treatment-session logic

### Current correct rules

- Therapist must own the schedule.
- Schedule must occur on the current India date.
- Workday must be active.
- Schedule must be scheduled and session not already started/completed.
- Arrival must pass the geofence.
- Punch-out requires punch-in and completes treatment/travel in one transaction.
- Invoice cleanup and rollback logic reduce partial-file/data failures.

### Concurrent therapist sessions â€” P0/P1

The doctor punch-in route queries for another `IN_PROGRESS` visit and blocks a second session. The therapist punch-in route does not perform the equivalent query. A therapist can therefore have two schedules in progress, producing overlapping clinical durations and unreliable attendance evidence.

**Fix:** Add the same staff-level guard, lock the active-session scope transactionally, and add a database invariant where supported. Return the active schedule ID and a direct â€œResume/Punch outâ€ action.

### Schedule/session state can diverge â€” P1

Schedule status and session status are independent strings. The service layer checks combinations, but the database does not prevent states such as `completed + IN_PROGRESS` or `missed + COMPLETED` after future code changes or manual correction.

**Fix:** Make occurrence status the primary state machine, or add check constraints and one transition service that updates all dependent fields atomically.

### Completion semantics â€” P2

Punch-out both records the end and calls the general completion route, which again applies schedule transition, location, travel, invoice, and notes logic. Reuse is beneficial, but the public â€œcompleteâ€ endpoint can allow completion without the explicit session flow if clients call it directly.

**Fix:** Decide one canonical rule: field treatment completion requires punch-in/out. Restrict direct completion to an admin correction route with reason and audit evidence.

## 12. Therapist travel logic

### Automatic travel path

Automatic travel created during treatment completion is the safer path:

- one travel entry per therapist/schedule;
- verified patient arrival;
- prior completed destination or workday/base origin;
- server-calculated route distance;
- server-copied per-km rate;
- required bill and invoice for non-vehicle transport;
- transactional creation with treatment completion.

### Manual travel path is inconsistent â€” P0/P1

The manual `/travel/` route accepts user-supplied:

- travel date, including no explicit current/past/future policy;
- addresses;
- total kilometres;
- patient-visited flag, which controls daily allowance eligibility;
- transport mode and bill amount;
- optional invoice.

It does not enforce the same allowed-mode, non-vehicle proof, non-negative amount, active-workday, completed-schedule, or duplicate checks. Once saved, update and delete always return 403 even while the entry remains `draft`.

This combination is both too permissive at creation and too rigid after a normal entry mistake.

### Travel chain issue â€” P1

Automatic origin selection uses the most recently completed schedule on the current date, not an explicit ordered route ledger. Concurrent/late completions or corrected timestamps can select the wrong preceding stop. The final trip from the last patient to the workday end location is represented for doctors through an END waypoint but is not equivalently included in therapist travel claims.

### Recommended travel rules

1. Ordinary travel is created only from verified workday/session waypoints.
2. Maintain an ordered route ledger: START -> occurrence(s) -> END. Derive segments from sequence, not only last completion query.
3. Define whether the return/end segment is reimbursable and apply the same explicit policy to both roles.
4. Manual travel becomes `manual_exception` and requires business date, category, reason, proof policy, and admin visibility.
5. Draft manual exceptions may be edited/deleted until submission. Submitted records are immutable; corrections create revisions.
6. `patient_visited` is derived from the completed occurrence, not manually selected for normal travel.
7. Enforce non-negative distance/amount, allowed modes, proof requirements, and date limits server-side.
8. When linked to a claim, travel status becomes `submitted`; approval/rejection/correction transitions remain synchronized with the claim.

## 13. Doctor expense logic

### What works

- A visit-linked expense requires a completed visit from today, a workday, and recorded route waypoints.
- Distance and locations are derived from the attendance route.
- One expense per visit is enforced.
- Draft, unclaimed expenses can be updated or deleted.
- Claimed expenses cannot be modified.
- Rejected doctor claims return linked expenses to draft in one transaction.

### Improvements

1. `date.today()` is used in expense routes while related attendance uses `india_now().date()`.
2. Fare is always entered manually even when distance and reimbursement settings exist. This may be correct for actual public transport fares, but car reimbursement policy is not defined.
3. Proof is optional for every mode; the organization has no configurable receipt threshold or mode rule.
4. Standalone/manual expenses can use typed locations, weakening route evidence relative to visit-linked expenses.
5. Expense types are effectively travel-only although the name suggests broader expenses.

### Recommended expense policy

- Define categories: mileage, public transport, toll/parking, and authorized other expense.
- Mileage is server-calculated from verified distance and effective rate; actual-fare categories require entered amount and configurable proof.
- Visit-linked expense is the default. Manual expense requires a reason/category and follows the same correction/review model as therapist exceptions.
- Show calculated, claimed, and approved amounts separately if reviewers can adjust reimbursement.

## 14. Claim and approval logic

### Therapist claim happy path

The route prevents a second same-date claim, gathers today's travel, calculates distance, travel total, daily allowance, and grand total, snapshots the per-km rate on the claim, links travels, and handles unique constraint races. The three-patient-day test validates the primary happy path and rollback behavior.

### Therapist claim problems

1. It uses `date.today()` instead of the shared India clock.
2. It gathers all today's travel without explicitly requiring `claim_id is null` or eligible status.
3. Linked travel statuses are not changed from `draft`.
4. Rejection has no required reason and records no reviewer/time metadata.
5. Rejected claims remain unique for the date and linked travel has no correction/resubmit path.
6. `patient_visited_today` is stored as a string column although the application treats it as a boolean.
7. `per_km_rate` is copied from current settings while `travel_total` is summed from each travel's stored fare; if rates changed within the period, the displayed single rate can disagree with row calculations.

### Doctor claim problems

The doctor flow correctly selects unclaimed draft expenses, locks them, marks them submitted, stores reviewer/rejection metadata, and detaches them on rejection. However:

1. Submission and expense selection use `date.today()`.
2. A rejected claim remains under the unique `(doctor_id, claim_date)` constraint.
3. The next submit finds that rejected claim and `validate_editable_status` rejects it.
4. Expenses are editable again but can never be resubmitted for that date.
5. The transition map declares a `submitted -> pending` path that the normal creation flow does not use.

### Recommended claim lifecycle

```text
draft
  -> submitted
  -> under_review
  -> approved
  -> changes_requested -> corrected -> resubmitted -> under_review
  -> rejected_final
  -> cancelled_by_submitter (before review only)
```

Rules:

- Use one logical claim per person and business date/period with revisions, not a new competing claim for every correction.
- `changes_requested` requires reviewer reason and releases only fields/entries allowed for correction.
- Resubmission updates the logical claim's revision and recalculates from eligible linked records. Previous submitted snapshots remain immutable.
- `rejected_final` requires a coded reason and cannot be resubmitted. An admin appeal/reopen is a separate audited permission.
- Approval/rejection records reviewer ID, timestamp, reason/note, policy version, calculated total, approved total, and revision.
- Both professions use the same lifecycle vocabulary and audit contract.
- Submission is idempotent. A duplicate request with the same key returns the existing result; a different payload/key conflict returns a clear 409.
- Eligibility explicitly filters unclaimed draft/corrected records owned by the submitter and within the business period.
- A preview shows included items, excluded items with reasons, totals, allowance eligibility, missing evidence, and the exact rate snapshot before submission.

## 15. Financial calculation and settings logic

### Current strengths

- Settings reject negative values and excessive precision.
- Therapist automatic travel stores the applied per-km rate.
- Claims store calculated totals rather than always recalculating historical views from current settings.

### Risks

- Models use floating-point columns for currency and rates.
- A single mutable settings row has no effective date, version, author, reason, or history.
- Defaults differ: some code creates settings with per-km rate 8, while claim/travel fallback code uses 3.
- Doctor mileage versus actual-fare reimbursement has no centralized policy.
- Rounding is distributed among services and clients.
- A settings change can affect newly created travel immediately without communicating which policy period applies.

### Recommended calculation policy

- Store money/rates as fixed precision decimals; round only at defined boundaries using a documented rule.
- Introduce effective-dated policy versions with `valid_from`, optional `valid_to`, currency, rates, allowance conditions, proof thresholds, creator, and change reason.
- Resolve policy by business date, then copy `policy_version_id` and calculation inputs onto each payable segment/claim snapshot.
- Never rewrite historical totals when settings change.
- Use the same calculation service for preview, submission, approval, dashboards, and reports.
- Remove conflicting fallback rates; production must have one active policy before reimbursable work begins.

## 16. Notifications and reporting logic

### Notifications

Schedule assignment/update and therapist claim decision events have typed mobile routes and push-service tests. Doctor claim decisions, treatment-plan changes requested/approved, follow-up due, workday rollover, exception decisions, and reassignment need the same event contract.

Recommended event fields are event ID, type, entity type/ID, recipient, occurred time, business date, deep-link target, and safe display copy. Delivery failure must not roll back the business transaction; it should be retried and visible operationally.

### Reporting

The original reporting audit found therapist-only administrative exports and inconsistent preview/export requests. The Report Center now includes both professions across claims, attendance/workdays, travel/expenses, and clinical activity, plus an organization exception register. Exception rows normalize open workdays/sessions, early closures, missed treatments, rejected plans/claims, and manual financial entries; only evidence presence and suggested action are exported, never patient data or free-text reasons. Each family persists exact preview rows and report-specific summary metrics for 24 hours; idempotent jobs retain PDF/XLSX/CSV bytes, while historical financial values come from immutable claim calculations. Persistent export audit records capture requester, scope, filters, summaries/totals, file metadata/checksum, snapshot/expiry, and retry count, and web/Android provide authorized history/retry. This resolves immediate core-detail and exception-visibility drift, repeat-delivery, and successful-download traceability risks. The therapist-focused operational dashboard, performance metrics, exception decisions/overrides, queued large-report worker, scheduled retention, and reconciliation across dashboards remain open.

Required alignment:

- define which revision and status enters each metric;
- use the same India business date;
- distinguish calculated, submitted, approved, and rejected amounts;
- report open workdays, active sessions, changes requested, final rejections, and location/manual exceptions;
- include doctors and therapists using equivalent definitions;
- preserve the report snapshot timestamp and policy version.

See [Reporting and Export Audit](./REPORTING_EXPORT_AUDIT.md) for the proposed Report Center and export architecture.

## 17. User-friendly target workflows

### Therapist daily workflow

1. **Start day:** App captures location, confirms address, shows today's assigned occurrences and policy checklist.
2. **Next visit:** Home screen shows one recommended next action with time, route, and readiness blockers.
3. **Arrive:** App validates location quality and distance. If verification fails, it explains why and offers retry or an exception request.
4. **Treat:** Punch-in is idempotent and prevents another active session. The active treatment remains persistent and easy to resume.
5. **Complete:** Punch-out captures notes/evidence once and creates the route segment automatically.
6. **Review day:** App lists completed, missed, pending, travel segments, and exceptions. Each issue has a direct fix action.
7. **Submit claim:** Preview shows included/excluded rows, applied policy, distance, allowance, and total. User confirms once.
8. **End day:** Active treatment hard-blocks closure; pending items warn. Early closure requires reason rather than waiting until a universal cutoff.
9. **Correction:** A changes-requested claim opens directly to the exact affected row and can be resubmitted without duplicate records.

### Doctor daily workflow

1. Start workday and see consultations, visits, follow-ups, and route readiness in one agenda.
2. Complete consultation; confirmed decisions produce a clear visit-creation handoff, while follow-up creates a dated task.
3. Punch into only one visit, complete it, and record the route waypoint.
4. Create a treatment plan from server-owned patient/visit context; save draft and submit.
5. If changes are requested, edit the same logical plan and resubmit.
6. Add a visit-linked expense with prefilled route and policy-based amount/proof guidance.
7. Preview and submit claim; correct and resubmit the same logical claim when needed.
8. End workday with a route and outstanding-item summary.

### Administrator workflow

1. Dashboard prioritizes exceptions: active sessions, open workdays, failed geocoding, conflicts, overdue follow-ups, changes requested, and ageing claims.
2. Scheduling previews active-staff eligibility, geocoded patient location, generated dates, conflicts, travel feasibility, and plan variance before commit.
3. Reviewers choose approve, request changes, or reject final. Every non-approval requires a reason and shows its downstream effect.
4. Deactivation previews records requiring reassignment or closure.
5. Reports use the same status definitions, business dates, revisions, and calculation snapshots as operational screens.

## 18. Proposed shared interfaces

These interfaces are recommendations, not implemented contracts.

### Readiness and allowed actions

Each actionable resource should include:

```json
{
  "state": "submitted",
  "version": 4,
  "available_actions": ["approve", "request_changes", "reject_final"],
  "blocking_reasons": [],
  "warnings": [
    {"code": "PROOF_OPTIONAL_BUT_MISSING", "message": "No receipt is attached."}
  ],
  "next_action": {
    "code": "REVIEW_CLAIM",
    "label": "Review claim"
  },
  "policy_version": "reimbursement-2026-08"
}
```

Clients render these actions but do not independently infer authorization or transition legality.

### Standard domain error

```json
{
  "error": {
    "code": "ACTIVE_SESSION_EXISTS",
    "message": "Punch out from the active treatment before starting another.",
    "recoverable": true,
    "entity_type": "schedule_occurrence",
    "entity_id": 123,
    "field_errors": {},
    "suggested_action": {
      "code": "OPEN_ACTIVE_SESSION",
      "target_id": 456
    },
    "correlation_id": "..."
  }
}
```

### Claim preview and submission

`POST /claims/preview` accepts role-derived scope, business period, and optional candidate IDs. It returns eligible items, excluded items/reasons, calculation lines, rate/policy snapshot, warnings, totals, and a preview version/hash.

`POST /claims` accepts the preview hash/version, timezone/business date, and idempotency key. The server revalidates ownership and eligibility, creates the immutable submission revision, and returns its allowed actions.

### Correction and review

- `POST /claims/{id}/request-changes`
- `POST /claims/{id}/resubmit`
- `POST /claims/{id}/approve`
- `POST /claims/{id}/reject-final`
- Equivalent treatment-plan review routes

Every mutation requires the expected resource version. Review actions include a reason where applicable and write an audit event.

### Recurring schedules

- Series describes cadence and defaults.
- Occurrences are explicit dated work items.
- Preview returns generated dates, conflicts, warnings, and plan variance.
- Update/cancel requests include scope: `occurrence`, `future`, or `series`.

### Admin exception/override

An override contains rule code, entity, requestor, reason, evidence references, captured conditions, decision, decision-maker, timestamps, and before/after state. Override permissions are separate from ordinary edit permissions.

### Repository evidence map

| Domain | Primary implementation evidence | Test evidence |
|---|---|---|
| Permissions and active users | `backend/app/utils/auth.py`, `backend/app/utils/permissions.py`, user/doctor models and staff routers | `test_staff_management.py`, `test_settings_api.py` |
| State transitions | `backend/app/utils/workflow_transitions.py` | Transition behavior is partially exercised through router tests; no complete transition-table test exists |
| Therapist workday/session | `therapist_workday.py`, `treatment_sessions.py`, therapist workday and schedule models | `test_treatment_sessions_workday_end.py`, `test_therapist_mobile_contracts.py` |
| Doctor workday/session | `doctor_workday.py`, `doctor_visit_sessions.py`, `doctor_attendance_service.py` | `test_doctor_attendance_travel_expenses.py` |
| Consultations and visits | `doctor_consultation.py`, `doctor_visit.py`, consultation/visit models, centralized audit events | `test_doctor_consultation_lifecycle.py`, doctor attendance/session tests |
| Treatment plans | `treatment_plan.py`, treatment plan model/schema, centralized audit events | `test_business_logic_corrections.py` covers rejection, correction/resubmission, and schedule generation |
| Scheduling and recurrence | `treatment_schedule.py`, `schedule_conflict_service.py`, treatment schedule model | `test_admin_schedules_api.py`, `test_schedule_arrival.py`, `test_schedule_migration.py` |
| Geofence | `schedule_location_service.py`, doctor/therapist session routers | `test_schedule_location_service.py`, `test_claim_service.py` |
| Therapist travel and claims | `claim_service.py`, `travel.py`, `claims.py`, travel/claim models | `test_three_patient_day.py`, `test_claim_service.py`, `test_admin_claim_review_api.py` |
| Doctor expenses and claims | `doctor_expense.py`, `doctor_claim.py`, doctor expense/claim models | Expense/attendance happy paths are covered; claim rejection/resubmission is not |
| Rates and settings | `settings.py`, settings model/schema, claim/travel services | `test_settings_api.py` |
| Notifications | notification router/service and client notification routing | `test_notification_events.py`, push/registration tests |
| Reports | `reports.py`, `admin_reports.py`, claim/report clients, snapshot model, export utilities, centralized audit events | `test_report_center_api.py`, `test_admin_reports_api.py`, and desktop/mobile-responsive Playwright export/audit checks; native Android automation remains open |

## 19. Prioritized findings register

**Current disposition of the baseline register:** BL-01 through BL-17 are implemented or substantially corrected as summarized at the start of this document; BL-20 through BL-22 are implemented on their stated critical paths; and BL-23, BL-25, BL-26, BL-28, BL-29, and BL-30 are partially implemented. Central actor/time/reason events now cover the critical lifecycles plus staff, configuration, and push-registration changes listed in the current-status section. Remaining override governance, offline, policy-UX, and consistency work retains its listed priority. The table is preserved as the code-backed baseline that motivated the changes.

| ID | Priority | Finding | Evidence | Roles/platforms | Impact | Recommended fix | Effort/dependency |
|---|---|---|---|---|---|---|---|
| BL-01 | **P0** | Therapist end-workday tests fail due to active workday/date mismatch | `therapist_workday.py`; 2 failing workday tests | Therapist, all clients/backend | Attendance cannot reliably close; active-session guidance is bypassed | Central business-date service, active-row closure logic, regression tests | 2â€“4 days |
| BL-02 | **P0** | Rejected treatment plan cannot be corrected or replaced | Plan router, unique plan/visit model, transition map | Doctor/admin | Clinical workflow permanently stops | `changes_requested`, editable revision, resubmit same logical plan | 1â€“2 weeks; schema/API |
| BL-03 | **P0** | Rejected doctor claim releases expenses but cannot be resubmitted | Doctor claim reject/submit routes and unique doctor/date constraint | Doctor/admin | Reimbursement permanently blocked for that date | Revision-based correction/resubmit lifecycle | 3â€“5 days initial; migration |
| BL-04 | **P0** | Plan-generated schedules omit patient coordinates | Plan schedule-generation route vs session geofence service | Therapist/admin | Punch-in/completion can be impossible | Geocode before atomic schedule creation; backfill/validation | 2â€“4 days; maps |
| BL-05 | **P0** | Recurring series uses one occurrence state/evidence row | Treatment schedule model, recurrence queries, travel unique constraint | Therapist/admin | Remaining visits disappear or share incorrect evidence | Series/occurrence model and migration | 2â€“4 weeks |
| BL-06 | **P1** | Therapist can start multiple simultaneous sessions | Therapist session punch-in lacks doctor route's active-session query | Therapist | Overlapping clinical time and unreliable records | Staff-level active-session guard plus invariant | 1â€“3 days |
| BL-07 | **P1** | Therapist workday has no unique therapist/date constraint | Therapist vs doctor workday models | Therapist/backend | Duplicate attendance under retry/concurrency | Unique constraint and idempotent start | 1â€“2 days plus migration |
| BL-08 | **P1** | Business dates use mixed clocks and timestamp types | Claims/travel/expense routers, timezone utility, models | All | Midnight errors and inconsistent daily records | One IST business-date/UTC timestamp policy | 3â€“7 days cross-domain |
| BL-09 | **P1** | Therapist manual travel is weakly validated and uncorrectable | Manual travel create/update/delete vs `claim_service.py` | Therapist/admin | Incorrect allowance/distance/payment evidence | Manual exception workflow with draft correction and proof rules | 1â€“2 weeks |
| BL-10 | **P1** | Rejected therapist claim has no correction/resubmit path | Therapist claim routes, transition map, unique therapist/date constraint | Therapist/admin | Reimbursement dead end | Shared claim lifecycle and revisions | 1â€“2 weeks |
| BL-11 | **P1** | Therapist rejection lacks required reason/reviewer metadata | Therapist claim reject route and claim model | Therapist/admin | User cannot correct; weak audit | Required reason, reviewer/time, affected fields | 2â€“4 days |
| BL-11A | **P1** | Treatment-plan rejection reason is assigned but not modeled or returned | Plan rejection route vs model/response schema | Doctor/admin | Doctor lacks durable correction guidance; audit evidence is lost | Persist reason/reviewer/time and expose it in plan responses | 1â€“2 days plus migration |
| BL-12 | **P1** | Claimed therapist travel can remain `draft` | Therapist claim submission links `claim_id` only | Therapist/admin/reports | Status and reporting disagreement | Atomic child-status transitions with claim | 1â€“2 days |
| BL-13 | **P1** | Plan-generated dates ignore frequency and may conflict with required count | Plan schema and consecutive-day generation loop | Doctor/admin/therapist | Wrong clinical cadence | Structured cadence, generated-date preview, variance reason | 1â€“2 weeks |
| BL-14 | **P1** | Terminal schedule editing is not consistently protected | General schedule update route | Admin/field staff | Historical clinical/financial evidence can be invalidated | State-aware edits and audited amendments | 3â€“5 days |
| BL-15 | **P1** | Fixed workday cutoff blocks legitimate early closure | Doctor/therapist workday routers and config | Doctor/therapist | Open attendance and field frustration | Early-close reason/warning policy; active session remains hard block | 3â€“5 days |
| BL-16 | **P1** | Financial settings are mutable and use float storage | Settings, travel, expense, and claim models | All finance/reporting | Rounding and historical disputes | Decimal amounts and effective-dated policy versions | 1â€“3 weeks; migration |
| BL-17 | **P1** | Default per-km rates differ between code paths | Settings/travel default 8 vs claim-service fallback 3 | Therapist/admin | Different reimbursement for equivalent work | Require active policy; remove inconsistent fallbacks | 1â€“2 days |
| BL-18 | **P1** | Travel origin derives from last completion rather than canonical route order | Therapist `claim_service.py` vs doctor waypoint service | Therapist | Incorrect reimbursable segment | Shared START/visit/END waypoint ledger | 1â€“2 weeks |
| BL-19 | **P2** | GPS accuracy/freshness is not evaluated server-side | Mobile location utility vs punch request schemas | Field users/admin | False rejection/acceptance | Store accuracy/time and configurable policy | 1â€“2 weeks |
| BL-20 | **P2** | No audited location exception path | Geofence service and session routes | Field users/admin | Work stops during legitimate map/device problems | Exception request/review workflow | 1â€“2 weeks |
| BL-21 | **P2 â€” implemented** | Follow-up consultation previously had no dated task | Consultation lifecycle API/model and web/Android forms | Doctor/admin | Follow-ups now require date, time, reason, linked appointment, and timeline; automated reminder delivery remains | Add reminder notification policy in the notification tranche | Core complete; reminder 2â€“3 days |
| BL-22 | **P2 â€” implemented for consultations** | Consultation cancellation/rescheduling previously lacked shared reason/link rules | Consultation lifecycle API/model and web/Android actions | Admin/doctor | Original records and reasons are retained with linked replacements | Extend the same standardized reason taxonomy to visits where needed | Consultation core complete; visit extension 2â€“3 days |
| BL-23 | **P2** | Treatment-plan create schema accepts irrelevant/server-owned fields | `TreatmentPlanCreate` vs create route | Doctor/web/mobile/backend | Fragile clients and unclear authority | Minimal create/update contracts | 1â€“2 days; client update |
| BL-24 | **P2** | Schedule and session strings can form contradictory combinations | Schedule model and separate transition checks | Therapist/admin/backend | Invalid state and unreliable reports | Occurrence state machine/check constraints | With BL-05 |
| BL-25 | **P2** | Doctor fare/proof rules are not centralized by category | Doctor expense schema/router | Doctor/admin | Inconsistent reimbursement evidence | Expense categories and policy rules | 1â€“2 weeks |
| BL-26 | **P2** | Inactive professional eligibility is not enforced on every mutation | Staff models vs direct schedule creation queries | Admin/field users | Work may be assigned to unavailable staff | Central eligibility service and deactivation impact preview | 3â€“5 days |
| BL-27 | **P2** | Permission vocabulary contains unassigned/partial finance concepts | Permission catalogue vs approved-claim checks | Admin/security | Confusing or unreachable access paths | Consolidate roles/permissions and contract tests | 2â€“4 days |
| BL-28 | **P2** | Clients receive messages but not consistent action/blocker codes | Readiness responses and client-local workflow logic | All platforms | Duplicate client logic and poor recovery | Server-provided actions, blockers, standardized errors | 1â€“2 weeks |
| BL-29 | **P2** | Critical mutations are not uniformly idempotent | Start/punch/submit routes and partial unique constraints | All | Duplicate taps/retries can create conflict or ambiguity | Idempotency keys and current-state response | 1â€“2 weeks |
| BL-30 | **P2** | Reporting does not share doctor/calculation/state definitions | Admin report router and export clients | Admin/doctor/therapist | Operational and exported totals disagree | Shared reporting source and snapshot rules | See reporting audit |
| BL-31 | **P3** | Device timestamps are accepted and discarded | Workday/session request schemas and routers | Field clients/backend | No diagnostic/offline value | Record as non-authoritative metadata or remove | 1â€“2 days |
| BL-32 | **P3** | Status and terminology differ across domains | Transition maps, schemas, and client labels | All | Users cannot predict next steps | Controlled glossary and equivalent lifecycle labels | 2â€“4 days |

## 20. Quick wins

The following improvements reduce immediate risk without requiring the complete target architecture:

1. Fix therapist workday test/date ownership and add the therapist/date unique constraint.
2. Add a therapist one-active-session check matching doctor behavior.
3. Geocode and store coordinates during treatment-plan schedule generation.
4. Require active therapist and doctor profiles on new assignments.
5. Require therapist claim rejection reason and store reviewer/time metadata.
6. Change linked therapist travel from `draft` to `submitted` atomically.
7. Remove inconsistent rate fallbacks and fail clearly when no reimbursement policy exists.
8. Add server validation for manual travel date, allowed transport mode, non-negative distance/amount, and proof requirements.
9. Prevent general edits to completed, missed, cancelled, or punched-in schedules.
10. Return the active session ID when blocking a second punch-in or workday closure.
11. Stop requiring server-owned fields in treatment-plan create requests.
12. Add explicit â€œwhy blockedâ€ messages and direct next actions to current readiness responses.

## 21. Delivery roadmap

### Phase 1 â€” Immediate stabilization (0â€“2 weeks)

- Establish one business-date utility and fix therapist workday closure/tests.
- Add workday uniqueness and one-active-session protection.
- Fix plan-generated coordinates and active-staff eligibility.
- Add state-aware schedule edit restrictions.
- Resolve doctor/therapist rejected-claim dead ends with an interim safe correction route.
- Require review reasons/metadata and synchronize child financial statuses.
- Centralize current validation and remove conflicting fallback rates.
- Add regression tests for every P0 finding.

**Exit criteria:** no P0 lifecycle dead end remains; workday suite passes; generated schedules are field-executable; duplicate active therapist sessions are impossible.

### Phase 2 â€” Workflow and usability (2â€“6 weeks)

- Implement treatment-plan and claim `changes_requested`/resubmission revisions.
- Claim preview/readiness with included records, calculation metadata, blockers, and server-owned submit parity is implemented for both professions; excluded-record explanations can expand as new eligibility rules are introduced.
- Introduce effective-dated reimbursement policy and decimal calculations.
- Add structured follow-up, cancellation, rescheduling, and deactivation impact workflows.
- Return allowed actions, blocking reasons, warnings, and next actions consistently.
- Add configurable location policy and audited exception requests.
- Make critical field mutations idempotent and version-aware.

**Exit criteria:** ordinary corrections never require database intervention; both professions follow equivalent claim rules; clients do not recreate transition logic independently.

### Phase 3 â€” Platform maturity (6â€“12 weeks)

- Migrate recurring schedules to series and occurrences.
- Implement ordered route ledgers and the agreed return-segment policy.
- Staff, reimbursement/location policy, and push-registration mutations now write privacy-safe centralized audit events; add formal admin override-request governance next.
- Complete notification parity and operational retry visibility.
- Align reports/exports with revisions, policy snapshots, doctors, and exception states.
- Add offline mutation queueing only after idempotency and version conflict behavior are stable.
- Instrument adoption, task failure, correction, and payment-quality metrics.

**Exit criteria:** every clinical occurrence, attendance event, reimbursable segment, correction, review, and report value is traceable to one authoritative state and policy version.

## 22. Acceptance and test matrix

### Date and attendance

- Start at 23:55 IST and close after midnight without losing the active workday.
- UTC-hosted database and API produce the same India business date.
- Duplicate start/end requests return the same workday outcome.
- Early closure records a reason; active session still blocks closure.
- Deactivated staff cannot start new work but historical records remain accessible to authorized reviewers.

### Clinical transitions

- Consultation follow-up creates a dated visible task.
- Confirmed consultation creates at most one visit under concurrent requests.
- Doctor and therapist cannot have two active sessions.
- Incorrect transition returns a stable error code and allowed next actions.
- Completed clinical evidence cannot be overwritten by ordinary edit routes.

### Treatment plans and schedules

- Rejected-correctable plan can be edited and resubmitted; prior revision remains visible.
- Final rejection cannot be resubmitted without an authorized reopen event.
- Schedule preview honors sessions required, cadence, excluded dates, and time conflicts.
- Every committed home-visit occurrence has valid patient coordinates.
- Recurring occurrence completion does not affect future occurrences.
- Editing one/future/all occurrences updates exactly the selected scope.

### Location

- Exactly-at-boundary location is accepted under the configured policy.
- Stale or inaccurate readings prompt retry.
- Missing patient coordinates block schedule activation, not field arrival.
- Exception requests record evidence and cannot silently mark location verified.
- Maps outage has a documented retry/exception outcome without duplicating records.

### Travel, expense, and claims

- Normal travel derives from ordered verified waypoints.
- Manual exception rejects invalid date, negative values, unsupported mode, or missing required proof.
- Draft exception is editable; submitted evidence is immutable.
- Preview totals equal submitted, approved, dashboard, and report totals for the same snapshot.
- Duplicate claim taps/retries create one logical claim.
- Changes-requested claim can be corrected and resubmitted for both professions.
- Rate change does not change an older travel, expense, claim, or report.
- Empty eligible set explains every excluded record.
- Unauthorized staff IDs, expense IDs, and travel IDs cannot expand scope.

### Concurrency and failure recovery

- Two simultaneous punch-ins produce one active session.
- Claim submission and admin review concurrency returns a version conflict, not partial state.
- Database failure rolls back claim plus child statuses and removes newly stored files.
- Notification failure does not undo the successful transaction and is retried.
- Expired/offline retries resolve through idempotency rather than duplicate mutations.

## 23. Success indicators

| Indicator | Definition | Initial target after stabilization |
|---|---|---|
| Workday closure success | Successful end requests / valid end attempts | >= 99.5% |
| Open workday carryover | Workdays still active after policy rollover | < 0.5% |
| Concurrent session violations | Staff with overlapping active sessions | 0 |
| Generated-schedule readiness | Generated occurrences with valid staff, date, time, and location | 100% |
| Location first-pass success | Normal arrivals verified without support | Establish baseline, then improve |
| Exception resolution time | Median request-to-decision for location/manual exceptions | < 1 business day |
| Claim preview-to-submit completion | Users who submit after an eligible preview | >= 90% |
| Correction recovery | Changes-requested claims/plans successfully resubmitted | >= 90% |
| Duplicate mutation rate | Duplicate business records caused by retry/tap | 0 |
| Calculation reconciliation | Preview, claim, approval, and report totals matching | 100% |
| Claim turnaround | Median submission-to-decision time | < 2 business days |
| Schedule completion capture | Completed assigned occurrences recorded in app | >= 95% |
| Field adoption | Active staff completing core daily workflow in app | Establish baseline; target >= 85% |

## 24. Final recommendation

Do not attempt to make the product easier by simply removing controls. The safer and more usable direction is to distinguish three outcomes clearly:

1. **Allowed:** perform the action once and return an authoritative result.
2. **Correctable:** explain the exact problem, preserve the record, and provide a direct correction/resubmission path.
3. **Prohibited:** block the action with a stable reason because it would compromise clinical, attendance, authorization, or payment integrity.

The first release priority should be eliminating dead ends and inconsistent day/state rules. After that, the recurring occurrence model, shared policy/calculation service, readiness metadata, and audit revisions will allow web and mobile to become simpler because they can guide users from one valid next action to the next instead of duplicating business decisions in each screen.
