-- Record measured on-site visit time and align the stored SMS field with its
-- actual use. This is a forward migration because the prior route lifecycle
-- migration has already been applied in some environments.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS visit_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_message TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'ai_message'
  ) THEN
    UPDATE public.jobs SET sms_message = COALESCE(sms_message, ai_message);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_job_status_and_route(
  p_job_id UUID,
  p_scheduled_date DATE,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_job_id UUID;
  v_current_job_status TEXT;
  v_route_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid job status' USING ERRCODE = '22023';
  END IF;

  SELECT j.id, j.status INTO v_job_id, v_current_job_status
  FROM public.jobs AS j
  WHERE j.id = p_job_id
    AND j.user_id = v_user_id
    AND j.scheduled_date = p_scheduled_date
    AND j.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_status = 'completed' AND v_current_job_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Start the visit before completing it' USING ERRCODE = '55000';
  END IF;

  SELECT r.status INTO v_route_status
  FROM public.routes AS r
  WHERE r.user_id = v_user_id
    AND r.scheduled_date = p_scheduled_date
  FOR UPDATE;

  UPDATE public.jobs
  SET status = p_status,
      visit_started_at = CASE
        WHEN p_status = 'in_progress' THEN COALESCE(visit_started_at, clock_timestamp())
        WHEN p_status IN ('pending', 'cancelled') THEN NULL
        ELSE visit_started_at
      END,
      completed_at = CASE WHEN p_status = 'completed' THEN clock_timestamp() ELSE NULL END
  WHERE id = v_job_id;

  IF v_route_status = 'optimized' AND p_status = 'in_progress' THEN
    UPDATE public.routes
    SET status = 'in_progress', started_at = COALESCE(started_at, clock_timestamp())
    WHERE user_id = v_user_id AND scheduled_date = p_scheduled_date;
    v_route_status := 'in_progress';
  END IF;

  -- Reopening a completed visit reopens the started workday so it remains
  -- visible and cannot be silently replaced by a new optimization.
  IF v_route_status = 'completed' AND p_status IN ('pending', 'in_progress') THEN
    UPDATE public.routes
    SET status = 'in_progress', completed_at = NULL
    WHERE user_id = v_user_id AND scheduled_date = p_scheduled_date;
    v_route_status := 'in_progress';
  END IF;

  IF v_route_status = 'in_progress'
     AND NOT EXISTS (
       SELECT 1
       FROM public.jobs AS j
       WHERE j.user_id = v_user_id
         AND j.scheduled_date = p_scheduled_date
         AND j.deleted_at IS NULL
         AND j.status NOT IN ('completed', 'cancelled')
     ) THEN
    UPDATE public.routes
    SET status = 'completed', completed_at = clock_timestamp()
    WHERE user_id = v_user_id
      AND scheduled_date = p_scheduled_date
      AND status = 'in_progress';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_job_status_and_route(UUID, DATE, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_job_status_and_route(UUID, DATE, TEXT)
  TO authenticated;
