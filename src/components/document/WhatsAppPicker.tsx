'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { X, MessageCircle, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, Button, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

interface WhatsAppPickerProps {
  workspaceId: string;
  onClose: () => void;
}

type ChannelStatus = 'connected' | 'pending' | 'disconnected';

interface ChannelStatusResponse {
  ok: boolean;
  status?: ChannelStatus;
  connection?: {
    phone_number?: string | null;
  };
}

export function WhatsAppPicker({ workspaceId, onClose }: WhatsAppPickerProps) {
  const supabase = createClient();
  const t = useTranslations('documentUpload');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('disconnected');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');

  const routingText = useMemo(
    () => `#ws:${workspaceId.toLowerCase()} #user:${userId.toLowerCase()}`,
    [workspaceId, userId]
  );

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.id) {
      setError(t('whatsappStatusAuthError'));
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const { data, error: statusError } = await supabase.functions.invoke('whatsapp-channel-status', {
      body: { workspace_id: workspaceId },
    });
    if (statusError) {
      setError(t('whatsappStatusLoadError'));
      setLoading(false);
      return;
    }

    const typed = (data || {}) as ChannelStatusResponse;
    setChannelStatus(typed.status || 'disconnected');
    const rawPhone = String(typed.connection?.phone_number || '');
    setPhoneNumber(rawPhone.replace(/[^\d]/g, ''));
    setLoading(false);
  }, [supabase, t, workspaceId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const statusLabel = useMemo(() => {
    if (channelStatus === 'connected') return t('whatsappStatusConnected');
    if (channelStatus === 'pending') return t('whatsappStatusPending');
    return t('whatsappStatusDisconnected');
  }, [channelStatus, t]);

  const statusClassName = useMemo(() => {
    if (channelStatus === 'connected') return 'text-success';
    if (channelStatus === 'pending') return 'text-amber-500';
    return 'text-text-soft';
  }, [channelStatus]);

  const openWhatsApp = () => {
    if (!phoneNumber) return;
    const encoded = encodeURIComponent(routingText);
    window.open(`https://wa.me/${phoneNumber}?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  const copyRouting = async () => {
    await navigator.clipboard.writeText(routingText);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <Card className="relative w-full max-w-lg z-10 animate-slide-up" padding="none">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[#25D366]" />
            <h2 className="text-lg font-semibold text-text">{t('whatsappTitle')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors">
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-text-soft">
              <Spinner size="sm" />
              <span>{t('whatsappLoading')}</span>
            </div>
          ) : (
            <>
              <div className="rounded-scholar border border-border bg-surface-alt p-3">
                <div className="text-sm text-text-soft">{t('whatsappChannelStatus')}</div>
                <div className={`text-sm font-semibold mt-1 ${statusClassName}`}>{statusLabel}</div>
              </div>

              {error ? (
                <div className="rounded-scholar border border-error/30 bg-error/5 p-3 text-sm text-error">
                  {error}
                </div>
              ) : (
                <>
                  <div className="rounded-scholar border border-border bg-surface-alt p-3">
                    <div className="text-sm font-medium text-text">{t('whatsappStep1')}</div>
                    <div className="text-xs text-text-soft mt-1">{t('whatsappStep1Desc')}</div>
                    <div className="mt-2 p-2 bg-surface rounded border border-border text-xs text-text font-mono break-all">
                      {routingText}
                    </div>
                    <Button variant="secondary" size="sm" className="mt-2" onClick={copyRouting}>
                      <Copy className="w-4 h-4 mr-1" />
                      {t('whatsappCopyRouting')}
                    </Button>
                  </div>

                  <div className="rounded-scholar border border-border bg-surface-alt p-3">
                    <div className="text-sm font-medium text-text">{t('whatsappStep2')}</div>
                    <div className="text-xs text-text-soft mt-1">{t('whatsappStep2Desc')}</div>
                  </div>
                </>
              )}
            </>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={loadStatus} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-1" />
              {t('whatsappRefreshStatus')}
            </Button>
            <Button onClick={openWhatsApp} disabled={!phoneNumber || loading}>
              <ExternalLink className="w-4 h-4 mr-1" />
              {t('whatsappOpenChat')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
