-- Telegram reminders at 08:00, 12:30 and 21:00 KST (UTC+9).
-- notify only sends inside a short window after each slot and once per slot per day,
-- so it is safe to call without a secret.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('tg-notify-0800', '0 23 * * *',
  $$ select net.http_post(url := 'https://qosmmsyxmucjrsnugful.supabase.co/functions/v1/notify', body := '{"slot":"0800"}'::jsonb) $$);
select cron.schedule('tg-notify-1230', '30 3 * * *',
  $$ select net.http_post(url := 'https://qosmmsyxmucjrsnugful.supabase.co/functions/v1/notify', body := '{"slot":"1230"}'::jsonb) $$);
select cron.schedule('tg-notify-2100', '0 12 * * *',
  $$ select net.http_post(url := 'https://qosmmsyxmucjrsnugful.supabase.co/functions/v1/notify', body := '{"slot":"2100"}'::jsonb) $$);
