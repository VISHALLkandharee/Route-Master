-- Apply reviewed route data and stop ordering as one transaction, and keep a
-- started workday's lifecycle in sync with its active jobs.

CREATE OR REPLACE FUNCTION public.confirm_route_with_stops(
  p_scheduled_date DATE,
  p_timezone TEXT,
  p_workday_start TIME,
  p_workday_end TIME,
  p_appointment_snapshot JSONB,
  p_ordered_job_ids UUID[],
  p_total_distance_km NUMERIC,
  p_total_duration_mins INTEGER,
  p_start_location TEXT,
  p_start_latitude NUMERIC,
  p_start_longitude NUMERIC,
  p_optimization_result JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile_timezone TEXT;
  v_profile_workday_start TIME;
  v_profile_workday_end TIME;
  v_route public.routes%ROWTYPE;
  v_route_json JSONB;
  v_had_existing_route BOOLEAN;
  v_job_count INTEGER;
  v_snapshot_count INTEGER;
  v_updated_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_scheduled_date IS NULL
     OR p_timezone IS NULL
     OR p_workday_start IS NULL
     OR p_workday_end IS NULL
     OR p_workday_end <= p_workday_start
     OR jsonb_typeof(p_appointment_snapshot) IS DISTINCT FROM 'array'
     OR p_ordered_job_ids IS NULL
     OR cardinality(p_ordered_job_ids) < 1
     OR cardinality(p_ordered_job_ids) > 50
     OR p_total_distance_km IS NULL OR p_total_distance_km < 0
     OR p_total_duration_mins IS NULL OR p_total_duration_mins < 0
     OR p_start_location IS NULL OR length(btrim(p_start_location)) = 0
     OR length(p_start_location) > 300
     OR p_start_latitude IS NULL OR p_start_latitude < -90 OR p_start_latitude > 90
     OR p_start_longitude IS NULL OR p_start_longitude < -180 OR p_start_longitude > 180
     OR jsonb_typeof(p_optimization_result) IS DISTINCT FROM 'object'
     OR p_optimization_result->'orderedJobIds' IS DISTINCT FROM to_jsonb(p_ordered_job_ids) THEN
    RAISE EXCEPTION 'Invalid route proposal' USING ERRCODE = '22023';
  END IF;

  SELECT u.timezone, u.workday_start, u.workday_end
  INTO v_profile_timezone, v_profile_workday_start, v_profile_workday_end
  FROM public.users AS u
  WHERE u.id = v_user_id
  FOR SHARE;

  IF NOT FOUND
     OR v_profile_timezone IS DISTINCT FROM p_timezone
     OR v_profile_workday_start IS DISTINCT FROM p_workday_start
     OR v_profile_workday_end IS DISTINCT FROM p_workday_end THEN
    RAISE EXCEPTION 'Workday settings changed; re-plan the route' USING ERRCODE = '40001';
  END IF;

  -- Lock every active job for this date before comparing the proposal. This
  -- prevents a concurrent edit from slipping between validation and writes.
  PERFORM j.id
  FROM public.jobs AS j
  WHERE j.user_id = v_user_id
    AND j.scheduled_date = p_scheduled_date
    AND j.status IN ('pending', 'in_progress')
    AND j.deleted_at IS NULL
  ORDER BY j.id
  FOR UPDATE;

  SELECT count(*) INTO v_job_count
  FROM public.jobs AS j
  WHERE j.user_id = v_user_id
    AND j.scheduled_date = p_scheduled_date
    AND j.status IN ('pending', 'in_progress')
    AND j.deleted_at IS NULL;

  SELECT count(*) INTO v_snapshot_count
  FROM jsonb_array_elements(p_appointment_snapshot);

  IF v_job_count = 0
     OR v_job_count > 50
     OR v_job_count <> cardinality(p_ordered_job_ids)
     OR v_job_count <> v_snapshot_count
     OR (SELECT count(DISTINCT id) FROM unnest(p_ordered_job_ids) AS ids(id)) <> v_job_count
     OR EXISTS (
       SELECT 1
       FROM public.jobs AS j
       WHERE j.user_id = v_user_id
         AND j.scheduled_date = p_scheduled_date
         AND j.status IN ('pending', 'in_progress')
         AND j.deleted_at IS NULL
         AND (
           j.latitude IS NULL OR j.longitude IS NULL
           OR NOT (j.id = ANY(p_ordered_job_ids))
           OR NOT EXISTS (
             SELECT 1
             FROM jsonb_array_elements(p_appointment_snapshot) AS snapshot(value)
             WHERE snapshot.value->>'jobId' = j.id::TEXT
               AND NULLIF(snapshot.value->>'latitude', '')::NUMERIC IS NOT DISTINCT FROM j.latitude::NUMERIC
               AND NULLIF(snapshot.value->>'longitude', '')::NUMERIC IS NOT DISTINCT FROM j.longitude::NUMERIC
               AND left(snapshot.value->>'scheduledTime', 5) = to_char(j.scheduled_time, 'HH24:MI')
               AND left(snapshot.value->>'latestStartTime', 5) IS NOT DISTINCT FROM
                   CASE WHEN j.latest_start_time IS NULL THEN NULL ELSE to_char(j.latest_start_time, 'HH24:MI') END
               AND (snapshot.value->>'estimatedDurationMinutes')::INTEGER = j.estimated_duration
           )
         )
     ) THEN
    RAISE EXCEPTION 'Jobs changed; re-plan the route' USING ERRCODE = '40001';
  END IF;

  SELECT r.* INTO v_route
  FROM public.routes AS r
  WHERE r.user_id = v_user_id
    AND r.scheduled_date = p_scheduled_date
  FOR UPDATE;

  v_had_existing_route := FOUND;
  IF v_had_existing_route AND v_route.status IN ('in_progress', 'completed') THEN
    RAISE EXCEPTION 'Workday has started or is complete' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.routes AS current_route (
    user_id,
    scheduled_date,
    status,
    total_distance_km,
    total_duration_mins,
    start_location,
    start_latitude,
    start_longitude,
    optimization_result,
    is_recalculated,
    recalculated_at,
    deleted_at
  ) VALUES (
    v_user_id,
    p_scheduled_date,
    'optimized',
    p_total_distance_km,
    p_total_duration_mins,
    btrim(p_start_location),
    p_start_latitude,
    p_start_longitude,
    p_optimization_result,
    v_had_existing_route,
    CASE WHEN v_had_existing_route THEN clock_timestamp() ELSE NULL END,
    NULL
  )
  ON CONFLICT (user_id, scheduled_date) DO UPDATE SET
    status = 'optimized',
    total_distance_km = EXCLUDED.total_distance_km,
    total_duration_mins = EXCLUDED.total_duration_mins,
    start_location = EXCLUDED.start_location,
    start_latitude = EXCLUDED.start_latitude,
    start_longitude = EXCLUDED.start_longitude,
    optimization_result = EXCLUDED.optimization_result,
    is_recalculated = TRUE,
    recalculated_at = clock_timestamp(),
    deleted_at = NULL
  WHERE current_route.status NOT IN ('in_progress', 'completed')
  RETURNING to_jsonb(current_route) INTO v_route_json;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workday has started or is complete' USING ERRCODE = '55000';
  END IF;

  UPDATE public.jobs AS j
  SET order_index = ordered.ordinality - 1
  FROM unnest(p_ordered_job_ids) WITH ORDINALITY AS ordered(job_id, ordinality)
  WHERE j.id = ordered.job_id
    AND j.user_id = v_user_id
    AND j.scheduled_date = p_scheduled_date
    AND j.status IN ('pending', 'in_progress')
    AND j.deleted_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> cardinality(p_ordered_job_ids) THEN
    RAISE EXCEPTION 'Jobs changed while applying route' USING ERRCODE = '40001';
  END IF;

  RETURN v_route_json;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_route_with_stops(
  DATE, TEXT, TIME, TIME, JSONB, UUID[], NUMERIC, INTEGER, TEXT, NUMERIC, NUMERIC, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_route_with_stops(
  DATE, TEXT, TIME, TIME, JSONB, UUID[], NUMERIC, INTEGER, TEXT, NUMERIC, NUMERIC, JSONB
) TO authenticated;

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
  v_route_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid job status' USING ERRCODE = '22023';
  END IF;

  SELECT j.id INTO v_job_id
  FROM public.jobs AS j
  WHERE j.id = p_job_id
    AND j.user_id = v_user_id
    AND j.scheduled_date = p_scheduled_date
    AND j.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.status INTO v_route_status
  FROM public.routes AS r
  WHERE r.user_id = v_user_id
    AND r.scheduled_date = p_scheduled_date
  FOR UPDATE;

  UPDATE public.jobs
  SET status = p_status,
      completed_at = CASE WHEN p_status = 'completed' THEN clock_timestamp() ELSE NULL END
  WHERE id = v_job_id;

  -- Reopening a completed visit reopens the already-started workday so it
  -- remains visible and cannot be silently replaced by a new optimization.
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
