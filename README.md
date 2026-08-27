# SlowGO.ca

A dashboard tracking delays, cancellations, and incidents on GO Transit's Barrie Line.

A Cloudflare Worker watches for GO Transit alert emails, uses an LLM to parse the
details out of each one, and writes structured rows into a Supabase table. This app
reads that table and visualizes it: an interactive rail map, stats, a live incident
feed, and two heatmaps (day-of-week × commute-period, and a recent-days calendar) to
show when and how badly the line has been running late.

## Tech stack

- React 19 + Vite
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- `lucide-react` for icons
- `@supabase/supabase-js` as the data client
- Deployed as a static site on Cloudflare Pages

## Setup

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL + anon key
npm run dev
```

## Environment variables

| Variable | Description |
| :--- | :--- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public API key |

## Data source: `public.go_train_delays`

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary key |
| `received_at` | `timestamptz` | When the alert email was received (not null) |
| `subject` | `text` | Raw email subject line |
| `line` | `text` | GO Transit line name (`'Barrie'`) |
| `direction` | `text` | `'Northbound'` / `'Southbound'` |
| `scheduled_time` | `time` | Scheduled train time |
| `trip_identifier` | `text` | e.g. `'Barrie-SB-07:22'` |
| `incident_type` | `text` | `signal`, `mechanical`, `operational`, `equipment`, `weather`, `medical`, `police`, `collision`, `switch`, `other` |
| `status` | `text` | `delayed`, `cancelled`, `advisory`, ... |
| `advisory_type` | `text` | e.g. `'shorter_train'` |
| `min_delay_mins` / `max_delay_mins` | `integer` | Delay range |
| `eligible_for_refund` | `boolean` | Metrolinx Service Guarantee flag |
| `is_cancellation` | `boolean` | |
| `affected_stations` | `text[]` | Station names mentioned in the alert |
| `affected_segments` | `text`/`jsonb` | Track segments affected (not currently rendered) |
| `summary` | `text` | Clean 1-2 sentence summary |
| `created_at` | `timestamptz` | Row creation time |
| `service_date` | `date` | Generated: `received_at` localized to America/Toronto |
| `commute_period` | `text` | Generated: `AM_PEAK`, `MIDDAY`, `PM_PEAK`, `EVENING`, `WEEKEND` |

## Project structure

```
src/
  components/   UI components (Header, Filters, RailMap, StatsBar, IncidentFeed, Heatmap, ...)
  lib/          Supabase client, constants, station geometry, heatmap aggregation
```

## Deployment

Static build via `npm run build` (outputs to `dist/`), deployed on Cloudflare Pages
with git-integrated deploys from this repo. Set the two `VITE_*` env vars in the
Cloudflare Pages project settings.
