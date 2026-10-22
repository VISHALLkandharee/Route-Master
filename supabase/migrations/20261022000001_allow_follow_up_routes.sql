-- Let users plan active stops left over after a completed route. The old RPC
-- remains the atomic writer; this wrapper reopens only a completed route
-- whose previously planned stops are all terminal, in the same transaction.

ALTER FUNCTION public.confirm_route_with_stops(
  DATE, TEXT, TIME, TIME, JSONB, UUID[], NUMERIC, INTEGER, TEXT, NUMERIC, NUMERIC, JSONB
) RENAME TO confirm_route_with_stops_before_followup;

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
  v_route public.routes%ROWTYPE;
  v_previous_job_ids TEXT[] := ARRAY[]::TEXT[];
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- Match the lock order used by the original confirmation RPC: jobs first,
  -- then route. This keeps concurrent job edits and confirmations serialized.
  PERFORM j.id
  FROM public.jobs AS j
  WHERE j.user_id = v_user_id
    AND j.scheduled_date = p_scheduled_date
    AND j.status IN ('pending', 'in_progress')
    AND j.deleted_at IS NULL
  ORDER BY j.id
  FOR UPDATE;

  SELECT r.* INTO v_route
  FROM public.routes AS r
  WHERE r.user_id = v_user_id
    AND r.scheduled_date = p_scheduled_date
  FOR UPDATE;

  IF FOUND AND v_route.status = 'in_progress' THEN
    RAISE EXCEPTION 'Workday has started' USING ERRCODE = '55000';
  END IF;

  IF FOUND AND v_route.status = 'completed' THEN
    SELECT COALESCE(ARRAY(
      SELECT item.value
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(v_route.optimization_result->'orderedJobIds') = 'array'
            THEN v_route.optimization_result->'orderedJobIds'
          ELSE '[]'::JSONB
        END
      ) AS item(value)
    ), ARRAY[]::TEXT[])
    INTO v_previous_job_ids;

    IF EXISTS (
      SELECT 1
      FROM public.jobs AS j
      WHERE j.user_id = v_user_id
        AND j.scheduled_date = p_scheduled_date
        AND j.status IN ('pending', 'in_progress')
        AND j.deleted_at IS NULL
        AND j.id::TEXT = ANY(v_previous_job_ids)
    ) THEN
      RAISE EXCEPTION 'Completed route still has an active stop' USING ERRCODE = '55000';
    END IF;

    -- This is a follow-up route for remaining active jobs. The original
    -- completed stops remain terminal and cannot be silently restarted.
    UPDATE public.routes
    SET status = 'optimized', started_at = NULL, completed_at = NULL
    WHERE id = v_route.id;
  END IF;

  v_result := public.confirm_route_with_stops_before_followup(
    p_scheduled_date,
    p_timezone,
    p_workday_start,
    p_workday_end,
    p_appointment_snapshot,
    p_ordered_job_ids,
    p_total_distance_km,
    p_total_duration_mins,
    p_start_location,
    p_start_latitude,
    p_start_longitude,
    p_optimization_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_route_with_stops(
  DATE, TEXT, TIME, TIME, JSONB, UUID[], NUMERIC, INTEGER, TEXT, NUMERIC, NUMERIC, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_route_with_stops(
  DATE, TEXT, TIME, TIME, JSONB, UUID[], NUMERIC, INTEGER, TEXT, NUMERIC, NUMERIC, JSONB
) TO authenticated;

NOTIFY pgrst, 'reload schema';
