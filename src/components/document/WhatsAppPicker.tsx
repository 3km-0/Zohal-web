'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { X, MessageCircle, RefreshCw, ExternalLink, Link2 } from 'lucide-react';
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
  const [zohalWhatsappNumber, setZohalWhatsappNumber] = useState('');
  const [linkedPhoneNumber, setLinkedPhoneNumber] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceBound, setWorkspaceBound] = useState(false);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const workspaceMessage = useMemo(() => workspaceName.trim(), [workspaceName]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    setInfoMessage('');

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

    const db = supabase as any;
    const [
      statusResult,
      profileResult,
      workspaceResult,
      bindingResult,
    ] = await Promise.all([
      supabase.functions.invoke('whatsapp-channel-status', {
        body: { workspace_id: workspaceId },
      }),
      supabase
        .from('profiles')
        .select('whatsapp_phone_number')
        .eq('id', user.id)
        .single(),
      supabase
        .from('workspaces')
        .select('name')
        .eq('id', workspaceId)
        .single(),
      db
        .from('workspace_whatsapp_bindings')
        .select('id')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)
        .limit(1)
        .maybeSingle(),
    ]);

    if (statusResult.error) {
      setError(t('whatsappStatusLoadError'));
      setLoading(false);
      return;
    }
    if (profileResult.error || workspaceResult.error) {
      setError(t('whatsappStatusLoadError'));
      setLoading(false);
      return;
    }

    const typed = (statusResult.data || {}) as ChannelStatusResponse;
    setChannelStatus(typed.status || 'disconnected');
    const rawPhone = String(typed.connection?.phone_number || '');
    setZohalWhatsappNumber(rawPhone.replace(/[^\d]/g, ''));
    setLinkedPhoneNumber(String(profileResult.data?.whatsapp_phone_number || ''));
    setWorkspaceName(String(workspaceResult.data?.name || '').trim());
    setWorkspaceBound(Boolean(bindingResult.data?.id));
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
    if (!zohalWhatsappNumber || !workspaceMessage) return;
    const encoded = encodeURIComponent(workspaceMessage);
    window.open(
      `https://wa.me/${zohalWhatsappNumber}?text=${encoded}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const bindWorkspace = useCallback(async () => {
    if (!userId || !linkedPhoneNumber || !workspaceName) return;
    setBindingBusy(true);
    setError('');
    setInfoMessage('');
    const db = supabase as any;
    const { data: existingBindings, error: bindingsError } = await db
      .from('workspace_whatsapp_bindings')
      .select('workspace_id, is_default')
      .eq('user_id', userId)
      .eq('phone_number', linkedPhoneNumber);
    if (bindingsError) {
      setBindingBusy(false);
      setError(t('whatsappBindWorkspaceError'));
      return;
    }
    const rows = Array.isArray(existingBindings) ? existingBindings : [];
    const currentBinding = rows.find((row: any) => String(row.workspace_id || '') === workspaceId);
    const isDefault = currentBinding
      ? currentBinding.is_default === true
      : rows.length === 0;
    const { error: upsertError } = await db.from('workspace_whatsapp_bindings').upsert(
      {
        user_id: userId,
        phone_number: linkedPhoneNumber,
        workspace_id: workspaceId,
        binding_name: workspaceName,
        is_default: isDefault,
      },
      { onConflict: 'phone_number,workspace_id' }
    );
    if (upsertError) {
      setBindingBusy(false);
      setError(t('whatsappBindWorkspaceError'));
      return;
    }
    setWorkspaceBound(true);
    setInfoMessage(t('whatsappBindWorkspaceSuccess'));
    setBindingBusy(false);
  }, [linkedPhoneNumber, supabase, t, userId, workspaceId, workspaceName]);

  const linkedPhoneLabel = useMemo(() => {
    const digits = linkedPhoneNumber.replace(/[^\d+]/g, '');
    return digits || '—';
  }, [linkedPhoneNumber]);

  const canOpenChat = Boolean(
    zohalWhatsappNumber && workspaceMessage && linkedPhoneNumber && workspaceBound && !loading
  );

  const canBindWorkspace = Boolean(linkedPhoneNumber && workspaceName && !workspaceBound && !loading);

  const bindingStatusLabel = useMemo(() => {
    return workspaceBound ? t('whatsappWorkspaceLinked') : t('whatsappWorkspaceNotLinked');
  }, [t, workspaceBound]);

  const bindingStatusClassName = useMemo(() => {
    return workspaceBound ? 'text-success' : 'text-text-soft';
  }, [workspaceBound]);

  const formatBusinessNumber = useMemo(() => {
    return zohalWhatsappNumber ? `+${zohalWhatsappNumber}` : '—';
  }, [zohalWhatsappNumber]);

  const missingPhone = !linkedPhoneNumber;

  const closeAndRefresh = () => {
    void loadStatus();
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

              <div className="rounded-scholar border border-border bg-surface-alt p-3 space-y-3">
                <div>
                  <div className="text-sm text-text-soft">{t('whatsappLinkedPhone')}</div>
                  <div className="text-sm font-semibold mt-1 text-text">{linkedPhoneLabel}</div>
                </div>
                <div>
                  <div className="text-sm text-text-soft">{t('whatsappWorkspaceName')}</div>
                  <div className="text-sm font-semibold mt-1 text-text">{workspaceName || '—'}</div>
                </div>
                <div>
                  <div className="text-sm text-text-soft">{t('whatsappBusinessNumber')}</div>
                  <div className="text-sm font-semibold mt-1 text-text">{formatBusinessNumber}</div>
                </div>
                <div className={`text-sm font-medium ${bindingStatusClassName}`}>{bindingStatusLabel}</div>
              </div>

              {error ? (
                <div className="rounded-scholar border border-error/30 bg-error/5 p-3 text-sm text-error">
                  {error}
                </div>
              ) : infoMessage ? (
                <div className="rounded-scholar border border-success/30 bg-success/5 p-3 text-sm text-success">
                  {infoMessage}
                </div>
              ) : (
                <>
                  {missingPhone && (
                    <div className="rounded-scholar border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600">
                      {t('whatsappPhoneMissing')}
                    </div>
                  )}

                  <div className="rounded-scholar border border-border bg-surface-alt p-3">
                    <div className="text-sm font-medium text-text">{t('whatsappStep1')}</div>
                    <div className="text-xs text-text-soft mt-1">{t('whatsappStep1Desc')}</div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      onClick={bindWorkspace}
                      disabled={!canBindWorkspace || bindingBusy}
                    >
                      <Link2 className="w-4 h-4 mr-1" />
                      {bindingBusy ? t('whatsappLoading') : t('whatsappBindWorkspace')}
                    </Button>
                  </div>

                  <div className="rounded-scholar border border-border bg-surface-alt p-3">
                    <div className="text-sm font-medium text-text">{t('whatsappStep2')}</div>
                    <div className="text-xs text-text-soft mt-1">{t('whatsappStep2Desc')}</div>
                    <div className="mt-2 p-2 bg-surface rounded border border-border text-xs text-text font-mono break-all">
                      {workspaceMessage || '—'}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={closeAndRefresh} disabled={loading || bindingBusy}>
              <RefreshCw className="w-4 h-4 mr-1" />
              {t('whatsappRefreshStatus')}
            </Button>
            <Button onClick={openWhatsApp} disabled={!canOpenChat || bindingBusy}>
              <ExternalLink className="w-4 h-4 mr-1" />
              {t('whatsappOpenChat')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
