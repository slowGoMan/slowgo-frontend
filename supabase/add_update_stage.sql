-- Adds update_stage to go_train_delays, needed by the worker.js rewrite
-- that tracks GO's "Update N -" / "Final update -" email chains
-- (e.g. "Barrie - Track work" -> "Update 1 - Barrie - Track work" ->
-- "Final update - Barrie - Track work"). Parsed from the subject line
-- alone, independent of parse_source, so it's set on every row.
alter table go_train_delays
  add column if not exists update_stage text; -- 'initial' | 'update' | 'final'
