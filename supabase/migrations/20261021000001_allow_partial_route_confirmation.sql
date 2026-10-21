-- Save a feasible route subset atomically while recording active jobs that
-- were intentionally left out. The UI continues to show those jobs as work
-- that needs scheduling; this migration never changes their status or date.

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
  v_unassigned_job_ids JSONB;
  v_saved_optimization_result JSONB;
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

  -- Lock all active jobs so edits, status changes, and the partial route save
  -- cannot race each other.
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
     OR cardinality(p_ordered_job_ids) > v_job_count
     OR v_job_count <> v_snapshot_count
     OR (SELECT count(DISTINCT id) FROM unnest(p_ordered_job_ids) AS ids(id)) <> cardinality(p_ordered_job_ids)
     OR (SELECT count(DISTINCT value->>'jobId') FROM jsonb_array_elements(p_appointment_snapshot) AS item(value)) <> v_snapshot_count
     OR EXISTS (
       SELECT 1
       FROM public.jobs AS j
       WHERE j.user_id = v_user_id
         AND j.scheduled_date = p_scheduled_date
         AND j.status IN ('pending', 'in_progress')
         AND j.deleted_at IS NULL
         AND (
           (j.id = ANY(p_ordered_job_ids) AND (j.latitude IS NULL OR j.longitude IS NULL))
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
     )
     OR EXISTS (
       SELECT 1
       FROM unnest(p_ordered_job_ids) AS ordered(job_id)
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.jobs AS j
         WHERE j.id = ordered.job_id
           AND j.user_id = v_user_id
           AND j.scheduled_date = p_scheduled_date
           AND j.status IN ('pending', 'in_progress')
           AND j.deleted_at IS NULL
       )
     ) THEN
    RAISE EXCEPTION 'Jobs changed; re-plan the route' USING ERRCODE = '40001';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(j.id::TEXT) ORDER BY j.id), '[]'::JSONB)
  INTO v_unassigned_job_ids
  FROM public.jobs AS j
  WHERE j.user_id = v_user_id
    AND j.scheduled_date = p_scheduled_date
    AND j.status IN ('pending', 'in_progress')
    AND j.deleted_at IS NULL
    AND NOT (j.id = ANY(p_ordered_job_ids));

  v_saved_optimization_result := p_optimization_result || jsonb_build_object(
    'unassignedJobIds', v_unassigned_job_ids
  );

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
    user_id, scheduled_date, status, total_distance_km, total_duration_mins,
    start_location, start_latitude, start_longitude, optimization_result,
    is_recalculated, recalculated_at, deleted_at
  ) VALUES (
    v_user_id, p_scheduled_date, 'optimized', p_total_distance_km,
    p_total_duration_mins, btrim(p_start_location), p_start_latitude,
    p_start_longitude, v_saved_optimization_result, v_had_existing_route,
    CASE WHEN v_had_existing_route THEN clock_timestamp() ELSE NULL END, NULL
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

-- A partially applied route is complete when its routed stops are complete.
-- Jobs excluded from that route remain visible as unscheduled work, without
-- keeping the navigation route itself permanently in progress.
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
  v_ordered_job_ids TEXT[] := ARRAY[]::TEXT[];
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

  SELECT r.status,
         COALESCE(ARRAY(
           SELECT item.value
           FROM jsonb_array_elements_text(
             CASE
               WHEN jsonb_typeof(r.optimization_result->'orderedJobIds') = 'array'
                 THEN r.optimization_result->'orderedJobIds'
               ELSE '[]'::JSONB
             END
           ) AS item(value)
         ), ARRAY[]::TEXT[])
  INTO v_route_status, v_ordered_job_ids
  FROM public.routes AS r
  WHERE r.user_id = v_user_id
    AND r.scheduled_date = p_scheduled_date
  FOR UPDATE;

  -- Legacy routes without a saved stop list retain the prior all-jobs
  -- completion behavior.
  IF cardinality(v_ordered_job_ids) = 0 AND v_route_status IS NOT NULL THEN
    SELECT COALESCE(array_agg(j.id::TEXT ORDER BY j.id), ARRAY[]::TEXT[])
    INTO v_ordered_job_ids
    FROM public.jobs AS j
    WHERE j.user_id = v_user_id
      AND j.scheduled_date = p_scheduled_date
      AND j.deleted_at IS NULL;
  END IF;

  UPDATE public.jobs
  SET status = p_status,
      completed_at = CASE WHEN p_status = 'completed' THEN clock_timestamp() ELSE NULL END
  WHERE id = v_job_id;

  -- Only reopening a routed stop reopens the route. An excluded job remains
  -- separately manageable and does not undo completion of the saved route.
  IF v_route_status = 'completed'
     AND v_job_id::TEXT = ANY(v_ordered_job_ids)
     AND p_status IN ('pending', 'in_progress') THEN
    UPDATE public.routes
    SET status = 'in_progress', completed_at = NULL
    WHERE user_id = v_user_id AND scheduled_date = p_scheduled_date;
    v_route_status := 'in_progress';
  END IF;

  IF v_route_status = 'in_progress'
     AND NOT EXISTS (
       SELECT 1
       FROM unnest(v_ordered_job_ids) AS planned(job_id)
       JOIN public.jobs AS j
         ON j.id::TEXT = planned.job_id
        AND j.user_id = v_user_id
        AND j.scheduled_date = p_scheduled_date
        AND j.deleted_at IS NULL
       WHERE j.status NOT IN ('completed', 'cancelled')
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
