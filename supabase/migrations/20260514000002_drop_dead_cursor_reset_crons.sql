-- Drop the AM/PM cursor-reset crons for `media-refresh`.
-- They reset a cursor that nothing reads anymore — the media-refresh
-- crons that originally consumed it were removed when R2 backfill
-- replaced the daily URL-refresh strategy. These crons fire harmlessly
-- but show up in cron.job listings and add noise.
SELECT cron.unschedule('mls-grid-media-cursor-reset-am');
SELECT cron.unschedule('mls-grid-media-cursor-reset-pm');
