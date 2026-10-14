-- Shared, server-only rate limits across serverless application instances.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL CHECK (hit_count >= 0)
);

CREATE INDEX IF NOT EXISTS api_rate_limits_window_started_at_idx
  ON public.api_rate_limits (window_started_at);

GRANT USAGE ON SCHEMA public TO service_role;

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_key TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE(success BOOLEAN, remaining INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_window_started_at TIMESTAMPTZ;
  v_hit_count INTEGER;
BEGIN
  IF p_key IS NULL OR length(p_key) < 1 OR length(p_key) > 200
     OR p_max_requests < 1 OR p_max_requests > 10000
     OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;

  DELETE FROM public.api_rate_limits
  WHERE window_started_at < v_now - INTERVAL '1 day';

  INSERT INTO public.api_rate_limits AS current_limit (
    bucket_key, window_started_at, hit_count
  ) VALUES (p_key, v_now, 1)
  ON CONFLICT (bucket_key) DO UPDATE SET
    window_started_at = CASE
      WHEN current_limit.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        THEN v_now
      ELSE current_limit.window_started_at
    END,
    hit_count = CASE
      WHEN current_limit.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        THEN 1
      ELSE current_limit.hit_count + 1
    END
  RETURNING current_limit.window_started_at, current_limit.hit_count
  INTO v_window_started_at, v_hit_count;

  RETURN QUERY SELECT
    v_hit_count <= p_max_requests,
    greatest(p_max_requests - v_hit_count, 0),
    greatest(
      1,
      ceil(extract(epoch FROM (
        v_window_started_at + make_interval(secs => p_window_seconds) - v_now
      )))::INTEGER
    );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(TEXT, INTEGER, INTEGER)
  TO service_role;

-- Trigger functions run with elevated rights; pin them to trusted schemas.
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public;

-- New client records should require an explicit SMS preference before texting.
ALTER TABLE public.clients ALTER COLUMN preferred_contact SET DEFAULT 'none';
