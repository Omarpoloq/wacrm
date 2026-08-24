'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AtSign,
  Loader2,
  CheckCircle2,
  XCircle,
  Unplug,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { openOAuthPopup } from '@/lib/oauth/openPopup';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';

interface InstagramStatus {
  connected: boolean;
  instagram_business_id: string | null;
  page_id: string | null;
  connected_at: string | null;
}

/**
 * Reasons the callback redirects back with `?instagram=error&reason=...`.
 * Mirrors the `reason` values emitted by /api/instagram/callback — keep
 * the two in sync when adding new failure modes there.
 */
const ERROR_REASONS: Record<string, string> = {
  state_mismatch: 'Security check failed. Please try again.',
  unauthenticated: 'You were signed out. Sign in and try again.',
  no_account: 'Your profile is not linked to an account.',
  config_missing: 'Server is missing INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET.',
  token_exchange: 'Meta rejected the authorization code.',
  token_exchange_failed: 'Could not reach Meta to exchange the code.',
  pages_list: 'Could not read your Facebook Pages from Meta.',
  pages_list_failed: 'Network error reaching Meta.',
  no_linked_page:
    'No Facebook Page is linked to an Instagram Business account for this user.',
  no_business_account:
    'Your Instagram account has no Business account linked. The DM-send API requires a Business account — convert it in the Instagram app and try again.',
  db_write_failed: 'Failed to save the configuration. Try again or contact support.',
}

export function InstagramConfig() {
  const t = useTranslations('Settings.instagram');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const loadedAccountIdRef = useRef<string | null>(null);

  // URL flag handling — fires exactly once per render where the flag
  // is present. We strip the query param after showing the toast so a
  // page refresh doesn't replay it.
  const flag = searchParams.get('instagram');
  const errorReason = searchParams.get('reason');
  const errorDetail = searchParams.get('detail');
  const flagHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!flag) {
      flagHandledRef.current = null;
      return;
    }
    if (flagHandledRef.current === flag) return;
    flagHandledRef.current = flag;

    if (flag === 'connected') {
      toast.success(t('toastConnected'));
    } else if (flag === 'error') {
      const key = errorReason ?? 'unknown';
      const msg =
        ERROR_REASONS[key] ?? t('toastErrorGeneric', { reason: key });
      toast.error(
        errorDetail && ERROR_REASONS[key]
          ? `${msg}: ${errorDetail}`
          : msg,
        { duration: 12000 },
      );
    }

    // Strip the flags from the URL so a refresh / re-entry doesn't
    // re-fire. Keep the `tab=instagram` so the user stays on this
    // panel.
    const params = new URLSearchParams(searchParams.toString());
    params.delete('instagram');
    params.delete('reason');
    params.delete('detail');
    const qs = params.toString();
    router.replace(`/settings${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [flag, errorReason, errorDetail, searchParams, router, t]);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/instagram/config', { cache: 'no-store' });
      const data: InstagramStatus = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('[InstagramConfig] status fetch failed', err);
      setStatus({ connected: false, instagram_business_id: null, page_id: null, connected_at: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchStatus();
  }, [authLoading, profileLoading, user?.id, accountId, fetchStatus]);

  async function handleConnect() {
    // The callback route runs in two modes: with no `?code` it starts
    // the OAuth dialog. Hitting it bare is enough — Meta then sends
    // the user back to the same URL once approved. We open it in a
    // popup so the settings panel stays interactive underneath; if
    // the browser blocks the popup we fall back to a full redirect.
    setConnecting(true)
    try {
      const result = await openOAuthPopup('/api/instagram/callback', {
        name: 'Instagram OAuth',
        width: 600,
        height: 720,
      })

      if (!result.opened) {
        // Pop-up was blocked — fall back to a full-page redirect so
        // the user isn't stuck. The page will land back here and the
        // URL-flag effect below will still show the success/error toast.
        window.location.href = '/api/instagram/callback'
        return
      }

      if (result.status === 'success') {
        toast.success(t('toastConnected'))
        await fetchStatus()
      } else if (result.status === 'error') {
        const key = result.reason ?? 'unknown'
        const msg = ERROR_REASONS[key] ?? t('toastErrorGeneric', { reason: key })
        toast.error(
          result.detail && ERROR_REASONS[key]
            ? `${msg}: ${result.detail}`
            : msg,
          { duration: 12000 },
        )
        await fetchStatus()
      }
      // 'closed' (popup closed by user, no result): stay quiet — the
      // user might have cancelled. They can click Connect again.
    } catch (err) {
      console.error('[InstagramConfig] connect failed', err)
      toast.error(t('toastErrorGeneric', { reason: 'popup' }))
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm(t('disconnectConfirm'))) return;
    try {
      setDisconnecting(true);
      const res = await fetch('/api/instagram/config', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('toastDisconnectFailed'));
        return;
      }
      toast.success(t('toastDisconnected'));
      if (accountId) await fetchStatus();
    } catch (err) {
      console.error('[InstagramConfig] disconnect failed', err);
      toast.error(t('toastDisconnectFailed'));
    } finally {
      setDisconnecting(false);
    }
  }

  function handleCopyId(value: string | null) {
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast.success(t('toastCopied'));
  }

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/instagram/webhook`
      : '';

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead title={t('title')} description={t('description')} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const isConnected = status?.connected === true;

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Status banner — mirrors the WhatsApp panel's
              "Connection Status" alert for visual parity. */}
          <Alert className="bg-card border-border">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : (
                <XCircle className="size-4 text-red-500" />
              )}
              <AlertTitle className="text-foreground mb-0">
                {isConnected ? t('connected') : t('notConnected')}
              </AlertTitle>
            </div>
            <AlertDescription className="text-muted-foreground">
              {isConnected ? t('connectedDesc') : t('notConnectedDesc')}
            </AlertDescription>
          </Alert>

          {isConnected && status ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t('connectionDetails')}
                </CardTitle>
                <CardDescription>{t('connectionDetailsDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetailRow
                  label={t('instagramBusinessId')}
                  value={status.instagram_business_id}
                  onCopy={handleCopyId}
                />
                <DetailRow
                  label={t('pageId')}
                  value={status.page_id}
                  onCopy={handleCopyId}
                />
                <DetailRow
                  label={t('connectedSince')}
                  value={
                    status.connected_at
                      ? new Date(status.connected_at).toLocaleString()
                      : t('unknownDate')
                  }
                  copyable={false}
                  onCopy={() => undefined}
                />

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                  >
                    {disconnecting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t('disconnecting')}
                      </>
                    ) : (
                      <>
                        <Unplug className="size-4" />
                        {t('disconnect')}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => fetchStatus()}
                  >
                    {t('refresh')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('connectTitle')}</CardTitle>
                <CardDescription>{t('connectDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleConnect} disabled={connecting}>
                  {connecting ? (
                    <> <Loader2 className="size-4 animate-spin" /> {t('connecting')}</>
                  ) : (
                    <> <AtSign className="size-4" /> {t('connect')}</>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Webhook URL — always visible so the operator has it on
              hand even after connecting. Mirrors the WhatsApp panel's
              always-shown webhook block. */}
          {webhookUrl ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t('webhookTitle')}
                </CardTitle>
                <CardDescription>{t('webhookDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs font-mono text-foreground">
                    {webhookUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      toast.success(t('toastCopied'));
                    }}
                    aria-label={t('copyWebhook')}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Sidebar — setup steps, same visual weight as the WhatsApp
            right rail. */}
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('setupTitle')}
              </CardTitle>
              <CardDescription>{t('setupDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SetupStep n={1} body={t('step1')} />
              <SetupStep n={2} body={t('step2')} />
              <SetupStep n={3} body={t('step3')} />
              <SetupStep n={4} body={t('step4')} />
              <a
                href="https://developers.facebook.com/docs/instagram-platform"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline pt-2"
              >
                {t('metaDocs')} <ExternalLink className="size-3.5" />
              </a>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

// ---------- small helpers ----------

function DetailRow({
  label,
  value,
  onCopy,
  copyable = true,
}: {
  label: string;
  value: string | null;
  onCopy: (v: string) => void;
  copyable?: boolean;
}) {
  const display = value ?? '—';
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 truncate font-mono text-sm text-foreground">
          {display}
        </div>
      </div>
      {copyable && value ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCopy(value)}
          className="shrink-0"
        >
          <Copy className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function SetupStep({ n, body }: { n: number; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
        {n}
      </span>
      <span className="text-sm leading-relaxed text-foreground">{body}</span>
    </div>
  );
}
