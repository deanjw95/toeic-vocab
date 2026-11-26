-- Public bucket for synthesized speech. Files are content-addressed (voice/sha256(text).mp3),
-- written only by the tts edge function (service role) and readable by anyone with the URL.
insert into storage.buckets (id, name, public)
values ('tts', 'tts', true)
on conflict (id) do update set public = true;
