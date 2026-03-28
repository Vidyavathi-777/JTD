-- ============================================================
--  NGO Donation Platform — Supabase Schema
--  Paste this entire file into the Supabase SQL Editor and run
-- ============================================================

-- ─── 1. donations (one-time) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS donations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_order_id    TEXT UNIQUE NOT NULL,
  razorpay_payment_id  TEXT,
  razorpay_signature   TEXT,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  amount               NUMERIC(12, 2) NOT NULL,
  message              TEXT,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','completed','failed')),
  paid_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. subscription_plans (cache of Razorpay plans) ─────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_plan_id   TEXT UNIQUE NOT NULL,
  frequency          TEXT NOT NULL
                       CHECK (frequency IN ('monthly','quarterly','half_yearly','yearly')),
  amount             NUMERIC(12, 2) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. subscriptions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_subscription_id   TEXT UNIQUE NOT NULL,
  razorpay_plan_id           TEXT REFERENCES subscription_plans(razorpay_plan_id),
  razorpay_payment_id        TEXT,          -- first payment
  razorpay_signature         TEXT,
  name                       TEXT NOT NULL,
  email                      TEXT NOT NULL,
  phone                      TEXT,
  amount                     NUMERIC(12, 2) NOT NULL,
  frequency                  TEXT NOT NULL
                               CHECK (frequency IN ('monthly','quarterly','half_yearly','yearly')),
  message                    TEXT,
  status                     TEXT NOT NULL DEFAULT 'created'
                               CHECK (status IN ('created','active','paused','cancelled','expired')),
  total_charges              INTEGER NOT NULL DEFAULT 0,
  activated_at               TIMESTAMPTZ,
  last_charged_at            TIMESTAMPTZ,
  cancelled_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 4. subscription_charges (every recurring debit) ─────────────────────────
CREATE TABLE IF NOT EXISTS subscription_charges (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id      UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  razorpay_payment_id  TEXT UNIQUE NOT NULL,
  amount               NUMERIC(12, 2) NOT NULL,
  status               TEXT NOT NULL DEFAULT 'captured',
  charged_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_donations_email          ON donations(email);
CREATE INDEX IF NOT EXISTS idx_donations_status         ON donations(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_email      ON subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status     ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_charges_subscription_id  ON subscription_charges(subscription_id);

-- ─── Row-Level Security (optional but recommended) ────────────────────────────
-- The backend uses the service role key which bypasses RLS.
-- Enable RLS to block direct public access to these tables.
ALTER TABLE donations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_charges ENABLE ROW LEVEL SECURITY;

-- Service role already bypasses RLS — no extra policy needed for backend.
