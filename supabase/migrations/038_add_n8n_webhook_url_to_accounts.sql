-- Add n8n_webhook_url to accounts table
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS n8n_webhook_url TEXT;