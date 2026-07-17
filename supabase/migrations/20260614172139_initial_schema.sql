-- ============================================
-- ROUTEMASTER - INITIAL SCHEMA
-- ============================================

-- ============================================
-- UTILITIES
-- ============================================

-- Auto update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TABLE 1: USERS
-- ============================================

CREATE TABLE users (
  id                        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name                 TEXT NOT NULL,
  email                     TEXT NOT NULL UNIQUE,
  phone                     TEXT,
  business_name             TEXT,
  business_type             TEXT CHECK (business_type IN (
                              'pet_grooming',
                              'pool_cleaning',
                              'auto_detailing',
                              'other'
                            )),
  avatar_url                TEXT,
  timezone                  TEXT NOT NULL DEFAULT 'UTC',
  stripe_customer_id        TEXT UNIQUE,
  subscription_status       TEXT NOT NULL DEFAULT 'trial' CHECK (
                              subscription_status IN (
                                'trial',
                                'active',
                                'past_due',
                                'cancelled'
                              )
                            ),
  trial_ends_at             TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  onboarding_completed      BOOLEAN NOT NULL DEFAULT FALSE,
  notification_preferences  JSONB NOT NULL DEFAULT '{
                              "email_summary": true,
                              "sms_alerts": false,
                              "job_reminders": true
                            }',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own profile"
ON users FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "users can update own profile"
ON users FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "users can insert own profile"
ON users FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE INDEX users_email_idx ON users(email);
CREATE INDEX users_stripe_customer_id_idx ON users(stripe_customer_id);
CREATE INDEX users_subscription_status_idx ON users(subscription_status);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    full_name,
    trial_ends_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NOW() + INTERVAL '14 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- TABLE 2: CLIENTS
-- ============================================

CREATE TABLE clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  email             TEXT,
  phone             TEXT NOT NULL,
  address           TEXT NOT NULL,
  latitude          DECIMAL(10, 7),
  longitude         DECIMAL(10, 7),
  preferred_contact TEXT NOT NULL DEFAULT 'sms' CHECK (
                      preferred_contact IN ('sms', 'call', 'none')
                    ),
  service_type      TEXT NOT NULL CHECK (service_type IN (
                      'pet_grooming',
                      'pool_cleaning',
                      'auto_detailing',
                      'other'
                    )),
  metadata          JSONB NOT NULL DEFAULT '{}',
  notes             TEXT,
  deleted_at        TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own clients"
ON clients FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users can insert own clients"
ON clients FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own clients"
ON clients FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX clients_user_id_idx ON clients(user_id);
CREATE INDEX clients_deleted_at_idx ON clients(deleted_at);
CREATE INDEX clients_metadata_idx ON clients USING GIN(metadata);
CREATE INDEX clients_service_type_idx ON clients(service_type);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- TABLE 3: JOBS
-- ============================================

CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (
                      status IN (
                        'pending',
                        'in_progress',
                        'completed',
                        'cancelled'
                      )
                    ),
  scheduled_date    DATE NOT NULL,
  scheduled_time    TIME NOT NULL,
  estimated_duration INTEGER NOT NULL DEFAULT 60,
  order_index       INTEGER NOT NULL DEFAULT 0,
  address           TEXT NOT NULL,
  latitude          DECIMAL(10, 7),
  longitude         DECIMAL(10, 7),
  notes             TEXT,
  sms_sent          BOOLEAN NOT NULL DEFAULT FALSE,
  sms_sent_at       TIMESTAMPTZ,
  ai_message        TEXT,
  price             DECIMAL(10, 2),
  metadata          JSONB NOT NULL DEFAULT '{}',
  completed_at      TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own jobs"
ON jobs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users can insert own jobs"
ON jobs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own jobs"
ON jobs FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX jobs_user_id_idx ON jobs(user_id);
CREATE INDEX jobs_client_id_idx ON jobs(client_id);
CREATE INDEX jobs_scheduled_date_idx ON jobs(scheduled_date);
CREATE INDEX jobs_status_idx ON jobs(status);
CREATE INDEX jobs_deleted_at_idx ON jobs(deleted_at);
CREATE INDEX jobs_user_date_idx ON jobs(user_id, scheduled_date);

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- TABLE 4: ROUTES
-- ============================================

CREATE TABLE routes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_date      DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (
                        status IN (
                          'pending',
                          'optimized',
                          'in_progress',
                          'completed'
                        )
                      ),
  total_distance_km   DECIMAL(10, 2),
  total_duration_mins INTEGER,
  start_location      TEXT,
  start_latitude      DECIMAL(10, 7),
  start_longitude     DECIMAL(10, 7),
  optimization_result JSONB NOT NULL DEFAULT '{}',
  is_recalculated     BOOLEAN NOT NULL DEFAULT FALSE,
  recalculated_at     TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ DEFAULT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE routes ADD CONSTRAINT routes_user_date_unique
UNIQUE (user_id, scheduled_date);

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own routes"
ON routes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users can insert own routes"
ON routes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own routes"
ON routes FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX routes_user_id_idx ON routes(user_id);
CREATE INDEX routes_scheduled_date_idx ON routes(scheduled_date);
CREATE INDEX routes_status_idx ON routes(status);
CREATE INDEX routes_deleted_at_idx ON routes(deleted_at);
CREATE INDEX routes_user_date_idx ON routes(user_id, scheduled_date);

CREATE TRIGGER routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- TABLE 5A: SUPPLIES
-- ============================================

CREATE TABLE supplies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  unit              TEXT NOT NULL CHECK (unit IN (
                      'ml',
                      'l',
                      'g',
                      'kg',
                      'pieces',
                      'bottles',
                      'boxes',
                      'other'
                    )),
  current_quantity  DECIMAL(10, 2) NOT NULL DEFAULT 0,
  minimum_quantity  DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cost_per_unit     DECIMAL(10, 2),
  is_low_stock      BOOLEAN NOT NULL DEFAULT FALSE,
  metadata          JSONB NOT NULL DEFAULT '{}',
  deleted_at        TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own supplies"
ON supplies FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users can insert own supplies"
ON supplies FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own supplies"
ON supplies FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX supplies_user_id_idx ON supplies(user_id);
CREATE INDEX supplies_is_low_stock_idx ON supplies(is_low_stock);
CREATE INDEX supplies_deleted_at_idx ON supplies(deleted_at);

CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_quantity <= NEW.minimum_quantity THEN
    NEW.is_low_stock = TRUE;
  ELSE
    NEW.is_low_stock = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplies_low_stock_check
  BEFORE UPDATE ON supplies
  FOR EACH ROW
  EXECUTE FUNCTION check_low_stock();

CREATE TRIGGER supplies_updated_at
  BEFORE UPDATE ON supplies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- TABLE 5B: SUPPLY LOGS
-- ============================================

CREATE TABLE supply_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  supply_id   UUID NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
  quantity    DECIMAL(10, 2) NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE supply_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own supply logs"
ON supply_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users can insert own supply logs"
ON supply_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE INDEX supply_logs_user_id_idx ON supply_logs(user_id);
CREATE INDEX supply_logs_job_id_idx ON supply_logs(job_id);
CREATE INDEX supply_logs_supply_id_idx ON supply_logs(supply_id);

CREATE OR REPLACE FUNCTION deduct_supply_quantity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE supplies
  SET current_quantity = current_quantity - NEW.quantity
  WHERE id = NEW.supply_id
  AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supply_log_deduct
  AFTER INSERT ON supply_logs
  FOR EACH ROW
  EXECUTE FUNCTION deduct_supply_quantity();

CREATE TRIGGER supply_logs_updated_at
  BEFORE UPDATE ON supply_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- TABLE 6: SUBSCRIPTIONS
-- ============================================

CREATE TABLE subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id    TEXT NOT NULL UNIQUE,
  stripe_price_id           TEXT NOT NULL,
  stripe_product_id         TEXT NOT NULL,
  plan_name                 TEXT NOT NULL CHECK (plan_name IN (
                              'starter',
                              'professional',
                              'business'
                            )),
  billing_cycle             TEXT NOT NULL CHECK (billing_cycle IN (
                              'monthly',
                              'yearly'
                            )),
  status                    TEXT NOT NULL CHECK (status IN (
                              'trialing',
                              'active',
                              'past_due',
                              'cancelled',
                              'unpaid',
                              'incomplete'
                            )),
  amount                    DECIMAL(10, 2) NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'usd',
  current_period_start      TIMESTAMPTZ NOT NULL,
  current_period_end        TIMESTAMPTZ NOT NULL,
  cancel_at_period_end      BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at              TIMESTAMPTZ,
  trial_start               TIMESTAMPTZ,
  trial_end                 TIMESTAMPTZ,
  payment_method_brand      TEXT,
  payment_method_last4      TEXT,
  last_payment_at           TIMESTAMPTZ,
  last_payment_error        TEXT,
  metadata                  JSONB NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own subscription"
ON subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE INDEX subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX subscriptions_stripe_subscription_id_idx ON subscriptions(stripe_subscription_id);
CREATE INDEX subscriptions_status_idx ON subscriptions(status);
CREATE INDEX subscriptions_current_period_end_idx ON subscriptions(current_period_end);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto sync subscription status to users table
CREATE OR REPLACE FUNCTION sync_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET subscription_status = NEW.status
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_sync_status
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_subscription_status();


  -- ============================================
-- GRANTS — Expose tables to API roles
-- ============================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON TABLE users TO anon, authenticated, service_role;
GRANT ALL ON TABLE clients TO anon, authenticated, service_role;
GRANT ALL ON TABLE jobs TO anon, authenticated, service_role;
GRANT ALL ON TABLE routes TO anon, authenticated, service_role;
GRANT ALL ON TABLE supplies TO anon, authenticated, service_role;
GRANT ALL ON TABLE supply_logs TO anon, authenticated, service_role;
GRANT ALL ON TABLE subscriptions TO anon, authenticated, service_role;