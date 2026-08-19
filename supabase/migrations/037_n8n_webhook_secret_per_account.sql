-- ============================================================
-- 037_n8n_webhook_secret_per_account.sql — Per-account n8n webhook secret
--
-- Adds `n8n_webhook_secret` to the `accounts` table so each tenant
-- can have their own webhook secret for n8n integration.
-- 
-- This replaces the global N8N_WEBHOOK_SECRET env var with a per-account
-- value, enabling true multi-tenant n8n webhook authentication.
-- ============================================================

-- Add n8n_webhook_secret column to accounts table
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS n8n_webhook_secret TEXT;

-- Create index for fast lookups by secret (used in webhook auth)
CREATE INDEX IF NOT EXISTS idx_accounts_n8n_webhook_secret
  ON accounts(n8n_webhook_secret)
  WHERE n8n_webhook_secret IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN accounts.n8n_webhook_secret IS 
  'Shared secret for n8n webhook authentication. Each account gets its own secret for multi-tenant isolation.';