-- Add configurable daily operating hours and optional appointment start windows.
-- Existing appointments remain exact-time appointments because the new job
-- window end is nullable.
ALTER TABLE public.users
  ADD COLUMN workday_start TIME NOT NULL DEFAULT '08:00',
  ADD COLUMN workday_end TIME NOT NULL DEFAULT '17:00',
  ADD CONSTRAINT users_workday_hours_valid
    CHECK (workday_end > workday_start);

ALTER TABLE public.jobs
  ADD COLUMN latest_start_time TIME,
  ADD CONSTRAINT jobs_latest_start_after_earliest
    CHECK (latest_start_time IS NULL OR latest_start_time > scheduled_time);
