# Active Plan

**Goal:** Introduce a dedicated GO Transit Open API ingestion pipeline and new Supabase tables on an isolated branch while keeping the existing email-driven pipeline operational.

## Assumptions

- The Metrolinx Open API base URL is 'https://api.openmetrolinx.com/OpenDataAPI/api/V1' accepting the API key via query parameter 'key=30029868'.
- Ingestion will focus on ServiceUpdates (delays and alerts) and TripUpdates (real-time train delay status and trip identifiers) for the Barrie line.
- New Supabase tables ('go_api_service_alerts', 'go_api_trip_updates') will be created with anon read RLS policies and service-role write access, leaving 'go_train_delays' intact.
- A Python-based scheduled GitHub Action runner will ingest the API payloads into Supabase on a regular schedule, mirroring the project's existing GTFS refresh patterns.

## Phases

- [x] **1. Database Schema for API Ingestion**
      Create SQL migration defining dedicated Supabase tables, indexes, and RLS policies for Metrolinx API alerts and trip updates.
      files: supabase/migrations/20250501_go_api_tables.sql (new)
      verify: SQL migration executes without syntax errors in Supabase SQL editor.
      verify: Tables are visible in Supabase with RLS enabled allowing SELECT for public/anon and blocking unauthenticated INSERT/UPDATE.

- [x] **2. GO Transit API Ingestion Script and Workflow**
      Build an ingestion script and scheduled GitHub Action to poll Metrolinx Open API endpoints and persist delay updates into Supabase.
      files: scripts/ingest_go_api.py (new), .github/workflows/ingest_go_api.yml (new)
      verify: Running 'python scripts/ingest_go_api.py' locally or via workflow_dispatch fetches data from Metrolinx and successfully populates rows in 'go_api_service_alerts' and 'go_api_trip_updates'.
      verify: Re-running the script does not create duplicate entries for the same alert or trip update timestamp.

- [x] **3. Frontend Data Source Compatibility Layer**
      Expose an optional environment-driven switch in Supabase data client to allow querying the new API data source while preserving fallback to email delay tables.
      files: src/lib/supabase.js, .env.example
      verify: Dashboard runs and loads existing data from 'go_train_delays' by default.
      verify: When 'VITE_DELAY_DATA_SOURCE=api' is configured, dashboard fetches and displays delay entries from 'go_api_service_alerts' without console errors or visual regressions.

## Before this is live

Steps you need to do outside this repo — credentials or console access this agent does not have:

1. **Apply supabase/migrations/20250501_go_api_tables.sql to the Supabase project (e.g. `supabase db push` or paste into the SQL editor). Until it runs, ingest_go_api.py fails with "relation go_api_service_alerts does not exist".**  _(from: 2/3 GO Transit API Ingestion Script and Workflow)_
   why: Requires Supabase project DB credentials (dashboard/SQL editor or supabase CLI auth) this agent does not have.
2. **Append the following to .env.example (and to your real .env / Cloudflare Pages environment if you opt in): comment lines as desired.
```
# Optional data-source switch. 'api' queries the Metrolinx Open Data
# pipeline's go_api_service_alerts table; unset or any other value keeps the
# email-driven go_train_delays table (the default fallback).
VITE_DELAY_DATA_SOURCE=email
# Metrolinx Open Data API key, used by the ingestion pipeline
# (scripts/ingest_go_api.py). Optional - the script falls back to a default
# demo key when unset.
METROLINX_API_KEY=your-metrolinx-open-data-api-key
```**  _(from: 3/3 Frontend Data Source Compatibility Layer)_
   why: The agent's file tools hard-block all reads/writes to .env* files (ACCESS DENIED on both patch_file and write_file for ".env.example"), so this repo file must be edited by a human. The same two variables were also documented in README.md's environment table so the documentation requirement is covered in-repo in the meantime.
