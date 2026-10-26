-- Atomically replace only pending stops on an active workday. Completed and
-- in-progress visits remain in their original order and retain their status.
CREATE OR REPLACE FUNCTION public.replan_remaining_route(
  p_scheduled_date DATE,
  p_timezone TEXT,
  p_workday_start TIME,
  p_workday_end TIME,
  p_pending_snapshot JSONB,
  p_expected_ordered_job_ids UUID[],
  p_current_stop_job_id UUID,
  p_replanned_job_ids UUID[],
  p_total_distance_km NUMERIC,
  p_total_duration_mins INTEGER,
  p_start_location TEXT,
  p_start_latitude NUMERIC,
  p_start_longitude NUMERIC,
  p_appointment_conflict_job_ids JSONB,
  p_geometry JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_route public.routes%ROWTYPE;
  v_profile_timezone TEXT;
  v_profile_workday_start TIME;
  v_profile_workday_end TIME;
  v_pending_count INTEGER;
  v_snapshot_count INTEGER;
  v_updated_count INTEGER;
  v_preserved_ids UUID[] := ARRAY[]::UUID[];
  v_all_ordered_ids UUID[];
  v_unassigned_ids JSONB;
  v_saved_result JSONB;
  v_in_progress_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_scheduled_date IS NULL OR p_timezone IS NULL
     OR p_workday_start IS NULL OR p_workday_end IS NULL
     OR p_workday_end <= p_workday_start
     OR jsonb_typeof(p_pending_snapshot) IS DISTINCT FROM 'array'
     OR p_expected_ordered_job_ids IS NULL
     OR cardinality(p_expected_ordered_job_ids) > 100
     OR p_replanned_job_ids IS NULL
     OR cardinality(p_replanned_job_ids) < 1
     OR cardinality(p_replanned_job_ids) > 50
     OR p_total_distance_km IS NULL OR p_total_distance_km < 0
     OR p_total_duration_mins IS NULL OR p_total_duration_mins < 0
     OR p_start_location IS NULL OR length(btrim(p_start_location)) = 0
     OR length(p_start_location) > 300
     OR p_start_latitude IS NULL OR p_start_latitude < -90 OR p_start_latitude > 90
     OR p_start_longitude IS NULL OR p_start_longitude < -180 OR p_start_longitude > 180
     OR jsonb_typeof(p_appointment_conflict_job_ids) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_geometry) IS DISTINCT FROM 'array'
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_appointment_conflict_job_ids) AS item(value)
       WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'string'
     )
     OR (SELECT count(DISTINCT id) FROM unnest(p_expected_ordered_job_ids) AS ids(id)) <> cardinality(p_expected_ordered_job_ids)
     OR (SELECT count(DISTINCT id) FROM unnest(p_replanned_job_ids) AS ids(id)) <> cardinality(p_replanned_job_ids) THEN
    RAISE EXCEPTION 'Invalid remaining route proposal' USING ERRCODE = '22023';
  END IF;

  SELECT u.timezone, u.workday_start, u.workday_end
  INTO v_profile_timezone, v_profile_workday_start, v_profile_workday_end
  FROM public.users AS u WHERE u.id = v_user_id FOR SHARE;
  IF NOT FOUND OR v_profile_timezone IS DISTINCT FROM p_timezone
     OR v_profile_workday_start IS DISTINCT FROM p_workday_start
     OR v_profile_workday_end IS DISTINCT FROM p_workday_end THEN
    RAISE EXCEPTION 'Workday settings changed; re-plan the route' USING ERRCODE = '40001';
  END IF;

  -- Match the existing lifecycle RPC lock order (jobs, then route).
  PERFORM j.id FROM public.jobs AS j
  WHERE j.user_id = v_user_id AND j.scheduled_date = p_scheduled_date
    AND j.status IN ('pending', 'in_progress') AND j.deleted_at IS NULL
  ORDER BY j.id FOR UPDATE;

  SELECT r.* INTO v_route FROM public.routes AS r
  WHERE r.user_id = v_user_id AND r.scheduled_date = p_scheduled_date
  FOR UPDATE;
  IF NOT FOUND OR v_route.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Workday is no longer in progress' USING ERRCODE = '55000';
  END IF;
  IF v_route.optimization_result->'orderedJobIds' IS DISTINCT FROM to_jsonb(p_expected_ordered_job_ids) THEN
    RAISE EXCEPTION 'Saved route changed; re-plan remaining stops' USING ERRCODE = '40001';
  END IF;

  SELECT count(*) INTO v_in_progress_count FROM public.jobs AS j
  WHERE j.user_id = v_user_id AND j.scheduled_date = p_scheduled_date
    AND j.status = 'in_progress' AND j.deleted_at IS NULL;
  IF v_in_progress_count > 1 OR
     (v_in_progress_count = 1 AND (p_current_stop_job_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.jobs AS j WHERE j.id = p_current_stop_job_id
         AND j.user_id = v_user_id AND j.scheduled_date = p_scheduled_date
         AND j.status = 'in_progress' AND j.deleted_at IS NULL
         AND p_current_stop_job_id = ANY(p_expected_ordered_job_ids)
     ))) OR (v_in_progress_count = 0 AND p_current_stop_job_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Active visit changed; refresh and re-plan' USING ERRCODE = '40001';
  END IF;

  SELECT count(*) INTO v_pending_count FROM public.jobs AS j
  WHERE j.user_id = v_user_id AND j.scheduled_date = p_scheduled_date
    AND j.status = 'pending' AND j.deleted_at IS NULL;
  SELECT count(*) INTO v_snapshot_count FROM jsonb_array_elements(p_pending_snapshot);
  IF v_pending_count = 0 OR v_pending_count > 50 OR v_pending_count <> v_snapshot_count
     OR (SELECT count(DISTINCT value->>'jobId') FROM jsonb_array_elements(p_pending_snapshot) AS item(value)) <> v_snapshot_count
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_pending_snapshot) AS snapshot(value)
       WHERE jsonb_typeof(snapshot.value) IS DISTINCT FROM 'object'
          OR NOT (snapshot.value ? 'latitude')
          OR NOT (snapshot.value ? 'longitude')
          OR NOT (snapshot.value ? 'latestStartTime')
          OR jsonb_typeof(snapshot.value->'jobId') IS DISTINCT FROM 'string'
          OR jsonb_typeof(snapshot.value->'latitude') NOT IN ('number', 'null')
          OR jsonb_typeof(snapshot.value->'longitude') NOT IN ('number', 'null')
          OR jsonb_typeof(snapshot.value->'scheduledTime') IS DISTINCT FROM 'string'
          OR jsonb_typeof(snapshot.value->'estimatedDurationMinutes') IS DISTINCT FROM 'number'
          OR (snapshot.value ? 'latestStartTime' AND jsonb_typeof(snapshot.value->'latestStartTime') NOT IN ('string', 'null'))
          OR (snapshot.value->>'estimatedDurationMinutes') !~ '^[0-9]+$'
          OR (snapshot.value->>'scheduledTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          OR (snapshot.value->>'latestStartTime') IS NOT NULL AND (snapshot.value->>'latestStartTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
     )
     OR EXISTS (
       SELECT 1 FROM public.jobs AS j
       WHERE j.user_id = v_user_id AND j.scheduled_date = p_scheduled_date
         AND j.status = 'pending' AND j.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_pending_snapshot) AS snapshot(value)
           WHERE snapshot.value->>'jobId' = j.id::TEXT
             AND NULLIF(snapshot.value->>'latitude', '')::NUMERIC IS NOT DISTINCT FROM j.latitude::NUMERIC
             AND NULLIF(snapshot.value->>'longitude', '')::NUMERIC IS NOT DISTINCT FROM j.longitude::NUMERIC
             AND left(snapshot.value->>'scheduledTime', 5) = to_char(j.scheduled_time, 'HH24:MI')
             AND left(snapshot.value->>'latestStartTime', 5) IS NOT DISTINCT FROM
                 CASE WHEN j.latest_start_time IS NULL THEN NULL ELSE to_char(j.latest_start_time, 'HH24:MI') END
             AND (snapshot.value->>'estimatedDurationMinutes')::INTEGER = j.estimated_duration
         )
     ) OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_pending_snapshot) AS snapshot(value)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.jobs AS j WHERE j.id::TEXT = snapshot.value->>'jobId'
           AND j.user_id = v_user_id AND j.scheduled_date = p_scheduled_date
           AND j.status = 'pending' AND j.deleted_at IS NULL
       )
     ) THEN
    RAISE EXCEPTION 'Pending jobs changed; re-plan remaining stops' USING ERRCODE = '40001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_replanned_job_ids) AS proposed(job_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.jobs AS j WHERE j.id = proposed.job_id
        AND j.user_id = v_user_id AND j.scheduled_date = p_scheduled_date
        AND j.status = 'pending' AND j.deleted_at IS NULL
        AND j.latitude IS NOT NULL AND j.longitude IS NOT NULL
    )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(p_appointment_conflict_job_ids) AS conflict(job_id)
    WHERE NOT EXISTS (SELECT 1 FROM unnest(p_replanned_job_ids) AS proposed(job_id) WHERE proposed.job_id::TEXT = conflict.job_id)
  ) THEN
    RAISE EXCEPTION 'Proposed stops changed or lack locations' USING ERRCODE = '40001';
  END IF;

  SELECT COALESCE(array_agg(previous.id ORDER BY previous.ordinality), ARRAY[]::UUID[])
  INTO v_preserved_ids
  FROM unnest(p_expected_ordered_job_ids) WITH ORDINALITY AS previous(id, ordinality)
  JOIN public.jobs AS j ON j.id = previous.id AND j.user_id = v_user_id
    AND j.scheduled_date = p_scheduled_date AND j.deleted_at IS NULL
  WHERE j.status IN ('completed', 'in_progress');

  v_all_ordered_ids := v_preserved_ids || p_replanned_job_ids;
  SELECT COALESCE(jsonb_agg(to_jsonb(j.id::TEXT) ORDER BY j.id), '[]'::JSONB)
  INTO v_unassigned_ids FROM public.jobs AS j
  WHERE j.user_id = v_user_id AND j.scheduled_date = p_scheduled_date
    AND j.status = 'pending' AND j.deleted_at IS NULL
    AND NOT (j.id = ANY(p_replanned_job_ids));

  v_saved_result := jsonb_build_object(
    'orderedJobIds', to_jsonb(v_all_ordered_ids),
    'appointmentConflictJobIds', p_appointment_conflict_job_ids,
    'unassignedJobIds', v_unassigned_ids,
    'geometry', p_geometry,
    'activeSegment', jsonb_build_object(
      'startLocation', btrim(p_start_location),
      'latitude', p_start_latitude,
      'longitude', p_start_longitude,
      'orderedJobIds', to_jsonb(p_replanned_job_ids),
      'currentStopJobId', p_current_stop_job_id,
      'replannedAt', clock_timestamp()
    )
  );

  UPDATE public.routes AS r SET
    total_distance_km = p_total_distance_km,
    total_duration_mins = p_total_duration_mins,
    optimization_result = v_saved_result,
    is_recalculated = TRUE,
    recalculated_at = clock_timestamp()
  WHERE r.id = v_route.id AND r.status = 'in_progress'
  RETURNING to_jsonb(r) INTO v_saved_result;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workday changed while saving the replan' USING ERRCODE = '40001';
  END IF;

  UPDATE public.jobs AS j SET order_index = cardinality(v_preserved_ids) + proposed.ordinality - 1
  FROM unnest(p_replanned_job_ids) WITH ORDINALITY AS proposed(job_id, ordinality)
  WHERE j.id = proposed.job_id AND j.user_id = v_user_id
    AND j.scheduled_date = p_scheduled_date AND j.status = 'pending' AND j.deleted_at IS NULL;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> cardinality(p_replanned_job_ids) THEN
    RAISE EXCEPTION 'Pending jobs changed while saving the replan' USING ERRCODE = '40001';
  END IF;

  RETURN v_saved_result;
END;
$$;

REVOKE ALL ON FUNCTION public.replan_remaining_route(
  DATE, TEXT, TIME, TIME, JSONB, UUID[], UUID, UUID[], NUMERIC, INTEGER,
  TEXT, NUMERIC, NUMERIC, JSONB, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replan_remaining_route(
  DATE, TEXT, TIME, TIME, JSONB, UUID[], UUID, UUID[], NUMERIC, INTEGER,
  TEXT, NUMERIC, NUMERIC, JSONB, JSONB
) TO authenticated;

NOTIFY pgrst, 'reload schema';
