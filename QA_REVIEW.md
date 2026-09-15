# QA Review Log

Sign-offs auto-accepted during autonomous runs. Nothing here blocked the run — review at your convenience and follow up on anything that looks wrong.

## 2026-09-15T15:48:56.833Z — 1/3 Database Schema for API Ingestion

### Visual advisories (auto-accepted)
- requirement coverage: 0 satisfied, 2 uncertain, 0 unmet — Static review of the single changed migration file shows a plausible, additive schema for go_api_service_alerts and go_api_trip_updates with RLS enabled, permissive SELECT policies, and no anon INSERT/UPDATE policies beyond service_role. No syntax defects are evident on inspection. However, both stated requirements — clean execution in the Supabase SQL editor and live table visibility/policy behavior — are runtime assertions that source inspection cannot confirm, so both are marked uncertain rather than satisfied. No requirement is marked missing because the diff contains concrete, non-stubbed DDL implementing the described schema.
- QA concern: Runtime verification of SQL execution in the Supabase SQL editor was not performed, so 'executes without syntax errors' and 'tables are visible in Supabase' remain unconfirmed.
- QA concern: The migration is not idempotent: CREATE POLICY statements lack an IF NOT EXISTS guard (PostgreSQL does not support one), so re-running the file would error. This does not affect the stated first-run syntax requirement but is an operational risk.
- QA concern: The SELECT policies rely on PostgreSQL's default 'TO PUBLIC' when no TO clause is specified rather than explicitly naming anon/authenticated. This is likely correct, but the requirement's intent is only statically inferable.
- QA concern: Visibility of the tables in the Supabase dashboard cannot be confirmed from a SQL diff alone.
- web browser visual QA: The screenshot shows the Slowgo CA delay-tracking dashboard web UI (live corridor map, alerts, tracked trips, weekly pattern heatmap), not the Supabase SQL editor, migration output, table list, or RLS policy view. No database schema, migration result, or Supabase table/RLS state is observable in this view, so the phase requirement (SQL migration executing without syntax errors and tables visible with RLS enabled) cannot be confirmed or refuted from this image. The rendered UI itself appears intact with no visible errors, crash dialogs, or unrendered tokens.
- Screenshot: C:\Users\brian\Projects\slowgo-frontend\.agent\screenshots\web-1789487333765.png

## 2026-09-15T15:51:29.424Z — 2/3 GO Transit API Ingestion Script and Workflow

### Visual advisories (auto-accepted)
- QA concern: Default METROLINX_BASE_URL is 'https://api.openmetrolinx.com/OpenDataAPI/pi/V1' — the path segment 'pi' differs from the commonly documented Metrolinx base '/OpenDataAPI/api/V1/'. If the default is wrong the two GETs will 404 and zero rows will be persisted. This is env-overridable (METROLINX_BASE_URL) but the default is unverifiable from the diff alone.
- QA concern: The feed envelope handling is explicitly a guess (extract_entities docstring: 'The Metrolinx envelope isn't documented in-repo, so accept a bare list...'). If the real payload/field names don't match the candidate keys, the script exits 0 after only printing a WARNING ('no Barrie entities found'), so a 'successful' run may not actually populate any rows. This can only be settled by running against the live API.
- QA concern: Idempotency depends on the go_api_* tables having UNIQUE constraints matching the on_conflict columns ('alert_id,service_date' and 'trip_id'). Those tables/constraints are defined in supabase/migrations/20250501_go_api_tables.sql, which is NOT in this diff, so the constraint/on_conflict alignment cannot be verified here.
- QA concern: The trip upsert is keyed on 'trip_id' alone, not a (trip_id, timestamp) pair; whether that matches the phase-1 table's actual unique key (and therefore whether reruns merge vs. error/duplicate) is not determinable from the diff.
- QA concern: The two named target tables (go_api_service_alerts, go_api_trip_updates) are created by a phase-1 migration that is not part of this change set, so 'successfully populates rows' is contingent on that prior migration having been applied.
- web browser visual QA: The screenshot shows the SlowGo CA delay dashboard, but it does not display the GO Transit API ingestion script, GitHub Action workflow output, or Supabase tables such as 'go_api_service_alerts' and 'go_api_trip_updates'. There is no visible evidence of script execution, data fetching, table population, or duplicate prevention, so the stated requirement is not observable in this view.
- Screenshot: C:\Users\brian\Projects\slowgo-frontend\.agent\screenshots\web-1789487486066.png

## 2026-09-15T15:53:52.933Z — 3/3 Frontend Data Source Compatibility Layer

### Visual advisories (auto-accepted)
- QA concern: src/lib/supabase.js defines `mapApiAlertsToDashboard` and `API_ALERT_COLUMNS`, but the diff shows no import or call site for either, so the new API-path mapping appears unwired at the consumer level within this change set.
- QA concern: The comment in supabase.js explicitly says API consumers must select API_ALERT_COLUMNS rather than the go_train_delays-shaped column list, but no dashboard component or query-building code is present in FILES TOUCHED to confirm the API path uses that column list.
- QA concern: Console-error and visual-regression checks for the API mode are inherently runtime/visual and cannot be settled from this source diff alone.
- QA concern: README.md documents VITE_DELAY_DATA_SOURCE and METROLINX_API_KEY, but documentation alone does not demonstrate the dashboard display path works against go_api_service_alerts.
- Screenshot: C:\Users\brian\Projects\slowgo-frontend\.agent\screenshots\web-1789487622048.png

## 2026-09-15T18:13:41.964Z — 1/1 Fix Metrolinx base URL path in ingest script

### Visual advisories (auto-accepted)
- QA concern: The base URL is resolved via os.environ.get("METROLINX_BASE_URL", ...) with an environment-variable override. The corrected literal only takes effect when METROLINX_BASE_URL is unset; whether the environment used at runtime supplies an override is not determinable from the diff.
- QA concern: No HTTP response evidence (status code, response body, or logs) is present in the change set to substantiate the 200 OK outcome.
- web browser visual QA: The screenshot shows the SlowGo.ca dashboard UI rendering correctly with data, but the requirement under test concerns the Metrolinx API base URL string in scripts/ingest_go_api.py and the HTTP 200/404 response from api.openmetrolinx.com. Neither the script code nor the HTTP request status is observable in this browser view, so the specific fix cannot be visually verified here.
- Screenshot: C:\Users\brian\Projects\slowgo-frontend\.agent\screenshots\web-1789496018326.png

## 2026-09-15T18:19:58.529Z — 1/1 Graceful error handling for trip updates endpoint

### Visual advisories (auto-accepted)
- QA concern: extract_entities() body is not visible in the diff; the optional-feed fallback now returns [] (a list), and the prior call sites appear to pass dict-shaped JSON payloads. If extract_entities assumes a dict (e.g. .get()), the empty-list fallback could raise a different exception and still abort the run, undermining the exit-0 goal. Not verifiable from the provided diff.
- QA concern: The Supabase upsert and the table name 'go_api_service_alerts' are not shown in CHANGE SET, so the 'successfully upserts service alerts' half of the objective cannot be confirmed from this evidence.
- QA concern: The try/except added around the call in main() is effectively redundant because fetch_feed(..., required=False) already swallows RequestException and returns []; this is harmless but the outer handler appears unreachable for this error class.
- web browser visual QA: The screenshot shows the SlowGo.ca transit dashboard (corridor map, incident timeline, tracked trips, weekly pattern), not the execution of scripts/ingest_go_api.py. The requirement under test concerns CLI log output (a logged 404 warning), absence of an uncaught HTTPError, exit status 0, and Supabase upserts into 'go_api_service_alerts' — none of which are observable in this web UI view. The dashboard renders normally, but the phase's behavior cannot be confirmed from this image.
- Screenshot: C:\Users\brian\Projects\slowgo-frontend\.agent\screenshots\web-1789496394685.png
