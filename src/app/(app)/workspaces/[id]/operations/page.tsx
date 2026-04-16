'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { Bot, Building2, ClipboardList, FileText, FolderOpen, Megaphone, Wrench, Users } from 'lucide-react';

type OperationsWorkspaceState = {
  summary: {
    property_count: number;
    component_count: number;
    vendor_count: number;
    open_service_request_count: number;
    open_work_order_count: number;
    linked_document_count: number;
    review_item_count: number;
  };
  properties: Array<{
    id: string;
    name: string;
    property_code?: string | null;
    property_type?: string | null;
    status: string;
    address_json?: Record<string, unknown> | null;
    is_default: boolean;
    component_count: number;
    vendor_count: number;
    open_service_request_count: number;
    open_work_order_count: number;
    linked_document_count: number;
  }>;
  vendors: Array<{
    id: string;
    display_name: string;
    status: string;
    property_ids: string[];
    property_names: string[];
    active_contract_count: number;
    active_assignment_count: number;
    open_work_order_count: number;
  }>;
  service_requests: Array<{
    id: string;
    property_id: string;
    property_name: string | null;
    summary?: string | null;
    description?: string | null;
    urgency: string;
    status: string;
    opened_at?: string | null;
  }>;
  work_orders: Array<{
    id: string;
    property_id: string;
    property_name: string | null;
    vendor_name: string | null;
    work_order_code?: string | null;
    category?: string | null;
    priority: string;
    status: string;
    latest_event?: {
      event_type: string;
      occurred_at?: string | null;
    } | null;
  }>;
  documents: Array<{
    id: string;
    title?: string | null;
    document_type?: string | null;
    processing_status?: string | null;
    updated_at?: string | null;
    linked_entities: Array<{
      entity_type: string;
      title: string | null;
    }>;
  }>;
};

type PropertyFormState = {
  name: string;
  property_code: string;
  property_type: string;
};

type VendorFormState = {
  display_name: string;
  property_id: string;
};

type ServiceRequestFormState = {
  property_id: string;
  summary: string;
  description: string;
  urgency: string;
};

type WorkOrderFormState = {
  property_id: string;
  service_request_id: string;
  assigned_vendor_id: string;
  category: string;
  priority: string;
};

const EMPTY_PROPERTY_FORM: PropertyFormState = {
  name: '',
  property_code: '',
  property_type: '',
};

const EMPTY_VENDOR_FORM: VendorFormState = {
  display_name: '',
  property_id: '',
};

const EMPTY_SERVICE_REQUEST_FORM: ServiceRequestFormState = {
  property_id: '',
  summary: '',
  description: '',
  urgency: 'normal',
};

const EMPTY_WORK_ORDER_FORM: WorkOrderFormState = {
  property_id: '',
  service_request_id: '',
  assigned_vendor_id: '',
  category: '',
  priority: 'normal',
};

function valueOrEmpty(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default function WorkspaceOperationsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const fromFolderId = searchParams.get('fromFolder');
  const withFolderContext = (href: string) => {
    if (!fromFolderId) return href;
    const separator = href.includes('?') ? '&' : '?';
    return `${href}${separator}fromFolder=${encodeURIComponent(fromFolderId)}`;
  };
  const t = useTranslations('workspaceOperationsPage');
  const supabase = useMemo(() => createClient(), []);
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [state, setState] = useState<OperationsWorkspaceState | null>(null);

  const [propertyForm, setPropertyForm] = useState<PropertyFormState>(EMPTY_PROPERTY_FORM);
  const [vendorForm, setVendorForm] = useState<VendorFormState>(EMPTY_VENDOR_FORM);
  const [serviceRequestForm, setServiceRequestForm] = useState<ServiceRequestFormState>(EMPTY_SERVICE_REQUEST_FORM);
  const [workOrderForm, setWorkOrderForm] = useState<WorkOrderFormState>(EMPTY_WORK_ORDER_FORM);

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('workspace-operations', {
        body: {
          action: 'list',
          workspace_id: workspaceId,
        },
      });
      if (error) throw error;
      const nextState = (data?.data?.state || data?.state || null) as OperationsWorkspaceState | null;
      setState(nextState);
      if (nextState) {
        const defaultPropertyId = nextState.properties.find((property) => property.is_default)?.id || nextState.properties[0]?.id || '';
        setVendorForm((current) => ({ ...current, property_id: current.property_id || defaultPropertyId }));
        setServiceRequestForm((current) => ({ ...current, property_id: current.property_id || defaultPropertyId }));
        setWorkOrderForm((current) => ({ ...current, property_id: current.property_id || defaultPropertyId }));
      }
    } catch (error) {
      showError(error, 'operations');
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [showError, supabase, workspaceId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const properties = state?.properties || [];
  const vendors = state?.vendors || [];
  const serviceRequests = state?.service_requests || [];
  const workOrders = state?.work_orders || [];
  const documents = state?.documents || [];

  const activePropertyId = serviceRequestForm.property_id || workOrderForm.property_id || properties.find((property) => property.is_default)?.id || properties[0]?.id || '';
  const vendorsForActiveProperty = vendors.filter((vendor) =>
    activePropertyId ? vendor.property_ids.length === 0 || vendor.property_ids.includes(activePropertyId) : true
  );
  const requestsForActiveProperty = serviceRequests.filter((request) =>
    !activePropertyId || request.property_id === activePropertyId
  );

  const runAction = async (
    actionKey: string,
    body: Record<string, unknown>,
    onSuccess: (nextState: OperationsWorkspaceState | null) => void,
    successMessage: string,
  ) => {
    setBusy(actionKey);
    try {
      const { data, error } = await supabase.functions.invoke('workspace-operations', { body });
      if (error) throw error;
      const nextState = (data?.data?.state || data?.state || null) as OperationsWorkspaceState | null;
      setState(nextState);
      onSuccess(nextState);
      showSuccess(successMessage);
    } catch (error) {
      showError(error, 'operations');
    } finally {
      setBusy(null);
    }
  };

  const handleCreateProperty = async () => {
    if (!propertyForm.name.trim()) return;
    await runAction(
      'create-property',
      {
        action: 'create-property',
        workspace_id: workspaceId,
        name: propertyForm.name,
        property_code: valueOrEmpty(propertyForm.property_code),
        property_type: valueOrEmpty(propertyForm.property_type) || 'property',
      },
      (nextState) => {
        const defaultPropertyId = nextState?.properties.find((property) => property.is_default)?.id || nextState?.properties[0]?.id || '';
        setPropertyForm(EMPTY_PROPERTY_FORM);
        setVendorForm((current) => ({ ...EMPTY_VENDOR_FORM, property_id: defaultPropertyId || current.property_id }));
        setServiceRequestForm((current) => ({ ...EMPTY_SERVICE_REQUEST_FORM, property_id: defaultPropertyId || current.property_id, urgency: 'normal' }));
        setWorkOrderForm((current) => ({ ...EMPTY_WORK_ORDER_FORM, property_id: defaultPropertyId || current.property_id, priority: 'normal' }));
      },
      t('toast.propertyCreated'),
    );
  };

  const handleCreateVendor = async () => {
    if (!vendorForm.display_name.trim()) return;
    await runAction(
      'create-vendor',
      {
        action: 'create-vendor',
        workspace_id: workspaceId,
        display_name: vendorForm.display_name,
        property_id: valueOrEmpty(vendorForm.property_id),
        assignment_kind: vendorForm.property_id ? 'preferred' : undefined,
      },
      () => {
        setVendorForm((current) => ({ ...EMPTY_VENDOR_FORM, property_id: current.property_id }));
      },
      t('toast.vendorCreated'),
    );
  };

  const handleCreateServiceRequest = async () => {
    if (!serviceRequestForm.property_id || !serviceRequestForm.summary.trim()) return;
    await runAction(
      'create-service-request',
      {
        action: 'create-service-request',
        workspace_id: workspaceId,
        property_id: serviceRequestForm.property_id,
        summary: serviceRequestForm.summary,
        description: valueOrEmpty(serviceRequestForm.description),
        urgency: serviceRequestForm.urgency,
        request_channel: 'manual',
        requester_type: 'staff',
      },
      () => {
        setServiceRequestForm((current) => ({
          ...EMPTY_SERVICE_REQUEST_FORM,
          property_id: current.property_id,
          urgency: 'normal',
        }));
      },
      t('toast.requestCreated'),
    );
  };

  const handleCreateWorkOrder = async () => {
    if (!workOrderForm.property_id || !workOrderForm.category.trim()) return;
    await runAction(
      'create-work-order',
      {
        action: 'create-work-order',
        workspace_id: workspaceId,
        property_id: workOrderForm.property_id,
        service_request_id: valueOrEmpty(workOrderForm.service_request_id),
        assigned_vendor_id: valueOrEmpty(workOrderForm.assigned_vendor_id),
        category: workOrderForm.category,
        priority: workOrderForm.priority,
        event_summary: workOrderForm.category,
      },
      () => {
        setWorkOrderForm((current) => ({
          ...EMPTY_WORK_ORDER_FORM,
          property_id: current.property_id,
          priority: 'normal',
        }));
      },
      t('toast.workOrderCreated'),
    );
  };

  const summaryCards = [
    { key: 'properties', label: t('summary.properties'), value: state?.summary.property_count ?? 0, icon: Building2 },
    { key: 'vendors', label: t('summary.vendors'), value: state?.summary.vendor_count ?? 0, icon: Users },
    { key: 'requests', label: t('summary.requests'), value: state?.summary.open_service_request_count ?? 0, icon: ClipboardList },
    { key: 'workOrders', label: t('summary.workOrders'), value: state?.summary.open_work_order_count ?? 0, icon: Wrench },
    { key: 'documents', label: t('summary.documents'), value: state?.summary.linked_document_count ?? 0, icon: FileText },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />
      <WorkspaceTabs workspaceId={workspaceId} active="dashboard" />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 rounded-scholar border border-border bg-surface p-4 shadow-[var(--shadowSm)] md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text">{t('commandNext')}</div>
              <p className="mt-1 text-sm text-text-soft">
                {(state?.summary.open_service_request_count ?? 0) > 0 || (state?.summary.open_work_order_count ?? 0) > 0
                  ? t('needsAttention')
                  : t('subtitle')}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-soft">{t('whereToNext')}</span>
              <div className="flex w-full flex-wrap gap-2 md:justify-end">
                <Link
                  href={withFolderContext(`/workspaces/${workspaceId}`)}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-scholar bg-[color:var(--button-primary-bg)] px-4 py-2.5 text-sm font-semibold text-[color:var(--button-primary-text)] transition-all hover:bg-[color:var(--button-primary-bg-hover)] sm:flex-initial"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                  {t('openSources')}
                </Link>
                <Link
                  href={withFolderContext(`/workspaces/${workspaceId}/operator`)}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-scholar border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:border-[color:var(--button-primary-bg)] hover:bg-surface-alt sm:flex-initial"
                >
                  <Bot className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {t('openOperator')}
                </Link>
                <Link
                  href={withFolderContext(`/workspaces/${workspaceId}/experiences`)}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-scholar border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:border-[color:var(--button-primary-bg)] hover:bg-surface-alt sm:flex-initial"
                >
                  <Megaphone className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {t('openMarketing')}
                </Link>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('overview.title')}</CardTitle>
              <CardDescription>{t('overview.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner size="lg" />
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-5">
                  {summaryCards.map(({ key, label, value, icon: Icon }) => (
                    <div key={key} className="rounded-scholar border border-border bg-surface-alt p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-soft">{label}</span>
                        <Icon className="h-4 w-4 text-accent" />
                      </div>
                      <div className="mt-3 text-2xl font-semibold text-text">{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <details className="group rounded-scholar border border-border bg-surface shadow-[var(--shadowSm)] open:pb-2">
            <summary className="cursor-pointer list-none p-4 text-base font-semibold text-text marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="underline-offset-4 group-open:underline">{t('recordKeeping')}</span>
              <span className="ms-2 text-sm font-normal text-text-soft">({t('forms.propertyTitle')})</span>
            </summary>
            <div className="grid gap-6 px-4 pb-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('forms.propertyTitle')}</CardTitle>
                <CardDescription>{t('forms.propertyDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Input
                  label={t('fields.propertyName')}
                  value={propertyForm.name}
                  onChange={(event) => setPropertyForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder={t('placeholders.propertyName')}
                />
                <Input
                  label={t('fields.propertyCode')}
                  value={propertyForm.property_code}
                  onChange={(event) => setPropertyForm((current) => ({ ...current, property_code: event.target.value }))}
                  placeholder={t('placeholders.propertyCode')}
                />
                <Input
                  label={t('fields.propertyType')}
                  value={propertyForm.property_type}
                  onChange={(event) => setPropertyForm((current) => ({ ...current, property_type: event.target.value }))}
                  placeholder={t('placeholders.propertyType')}
                />
                <Button onClick={() => void handleCreateProperty()} isLoading={busy === 'create-property'}>
                  {t('actions.addProperty')}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('forms.vendorTitle')}</CardTitle>
                <CardDescription>{t('forms.vendorDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Input
                  label={t('fields.vendorName')}
                  value={vendorForm.display_name}
                  onChange={(event) => setVendorForm((current) => ({ ...current, display_name: event.target.value }))}
                  placeholder={t('placeholders.vendorName')}
                />
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">{t('fields.property')}</label>
                  <select
                    className="w-full min-h-[44px] rounded-scholar border border-border bg-surface px-4 py-3 text-text"
                    value={vendorForm.property_id}
                    onChange={(event) => setVendorForm((current) => ({ ...current, property_id: event.target.value }))}
                  >
                    <option value="">{t('options.unassigned')}</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={() => void handleCreateVendor()} isLoading={busy === 'create-vendor'}>
                  {t('actions.addVendor')}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('forms.requestTitle')}</CardTitle>
                <CardDescription>{t('forms.requestDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">{t('fields.property')}</label>
                  <select
                    className="w-full min-h-[44px] rounded-scholar border border-border bg-surface px-4 py-3 text-text"
                    value={serviceRequestForm.property_id}
                    onChange={(event) => setServiceRequestForm((current) => ({ ...current, property_id: event.target.value }))}
                  >
                    <option value="">{t('options.selectProperty')}</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label={t('fields.summary')}
                  value={serviceRequestForm.summary}
                  onChange={(event) => setServiceRequestForm((current) => ({ ...current, summary: event.target.value }))}
                  placeholder={t('placeholders.requestSummary')}
                />
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">{t('fields.description')}</label>
                  <textarea
                    className="w-full min-h-[104px] rounded-scholar border border-border bg-surface px-4 py-3 text-text"
                    value={serviceRequestForm.description}
                    onChange={(event) => setServiceRequestForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder={t('placeholders.requestDescription')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">{t('fields.urgency')}</label>
                  <select
                    className="w-full min-h-[44px] rounded-scholar border border-border bg-surface px-4 py-3 text-text"
                    value={serviceRequestForm.urgency}
                    onChange={(event) => setServiceRequestForm((current) => ({ ...current, urgency: event.target.value }))}
                  >
                    <option value="low">{t('options.low')}</option>
                    <option value="normal">{t('options.normal')}</option>
                    <option value="high">{t('options.high')}</option>
                    <option value="critical">{t('options.critical')}</option>
                  </select>
                </div>
                <Button onClick={() => void handleCreateServiceRequest()} isLoading={busy === 'create-service-request'}>
                  {t('actions.logRequest')}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('forms.workOrderTitle')}</CardTitle>
                <CardDescription>{t('forms.workOrderDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">{t('fields.property')}</label>
                  <select
                    className="w-full min-h-[44px] rounded-scholar border border-border bg-surface px-4 py-3 text-text"
                    value={workOrderForm.property_id}
                    onChange={(event) => setWorkOrderForm((current) => ({ ...current, property_id: event.target.value }))}
                  >
                    <option value="">{t('options.selectProperty')}</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">{t('fields.request')}</label>
                  <select
                    className="w-full min-h-[44px] rounded-scholar border border-border bg-surface px-4 py-3 text-text"
                    value={workOrderForm.service_request_id}
                    onChange={(event) => setWorkOrderForm((current) => ({ ...current, service_request_id: event.target.value }))}
                  >
                    <option value="">{t('options.optionalRequest')}</option>
                    {requestsForActiveProperty.map((request) => (
                      <option key={request.id} value={request.id}>
                        {request.summary || request.description || request.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">{t('fields.vendor')}</label>
                  <select
                    className="w-full min-h-[44px] rounded-scholar border border-border bg-surface px-4 py-3 text-text"
                    value={workOrderForm.assigned_vendor_id}
                    onChange={(event) => setWorkOrderForm((current) => ({ ...current, assigned_vendor_id: event.target.value }))}
                  >
                    <option value="">{t('options.optionalVendor')}</option>
                    {vendorsForActiveProperty.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label={t('fields.category')}
                  value={workOrderForm.category}
                  onChange={(event) => setWorkOrderForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder={t('placeholders.workOrderCategory')}
                />
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">{t('fields.priority')}</label>
                  <select
                    className="w-full min-h-[44px] rounded-scholar border border-border bg-surface px-4 py-3 text-text"
                    value={workOrderForm.priority}
                    onChange={(event) => setWorkOrderForm((current) => ({ ...current, priority: event.target.value }))}
                  >
                    <option value="low">{t('options.low')}</option>
                    <option value="normal">{t('options.normal')}</option>
                    <option value="high">{t('options.high')}</option>
                    <option value="critical">{t('options.critical')}</option>
                  </select>
                </div>
                <Button onClick={() => void handleCreateWorkOrder()} isLoading={busy === 'create-work-order'}>
                  {t('actions.createWorkOrder')}
                </Button>
              </CardContent>
            </Card>
            </div>
          </details>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{t('lists.propertiesTitle')}</CardTitle>
                    <CardDescription>{t('lists.propertiesDescription')}</CardDescription>
                  </div>
                  <Badge size="sm">{properties.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {properties.length === 0 ? (
                  <p className="text-sm text-text-soft">{t('empty.properties')}</p>
                ) : properties.map((property) => (
                  <div key={property.id} className="rounded-scholar border border-border bg-surface-alt p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-text">{property.name}</div>
                        <div className="text-xs text-text-soft">
                          {[property.property_code, property.property_type, property.status].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                      {property.is_default ? <Badge size="sm">{t('badges.default')}</Badge> : null}
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-text-soft sm:grid-cols-2">
                      <span>{t('propertyMeta.components', { count: property.component_count })}</span>
                      <span>{t('propertyMeta.vendors', { count: property.vendor_count })}</span>
                      <span>{t('propertyMeta.requests', { count: property.open_service_request_count })}</span>
                      <span>{t('propertyMeta.workOrders', { count: property.open_work_order_count })}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{t('lists.vendorsTitle')}</CardTitle>
                    <CardDescription>{t('lists.vendorsDescription')}</CardDescription>
                  </div>
                  <Badge size="sm">{vendors.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {vendors.length === 0 ? (
                  <p className="text-sm text-text-soft">{t('empty.vendors')}</p>
                ) : vendors.map((vendor) => (
                  <div key={vendor.id} className="rounded-scholar border border-border bg-surface-alt p-4">
                    <div className="font-medium text-text">{vendor.display_name}</div>
                    <div className="mt-1 text-xs text-text-soft">
                      {vendor.property_names.length > 0 ? vendor.property_names.join(' • ') : t('options.unassigned')}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-soft">
                      <span>{t('vendorMeta.contracts', { count: vendor.active_contract_count })}</span>
                      <span>{t('vendorMeta.assignments', { count: vendor.active_assignment_count })}</span>
                      <span>{t('vendorMeta.workOrders', { count: vendor.open_work_order_count })}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{t('lists.requestsTitle')}</CardTitle>
                    <CardDescription>{t('lists.requestsDescription')}</CardDescription>
                  </div>
                  <Badge size="sm">{serviceRequests.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {serviceRequests.length === 0 ? (
                  <p className="text-sm text-text-soft">{t('empty.requests')}</p>
                ) : serviceRequests.map((request) => (
                  <div key={request.id} className="rounded-scholar border border-border bg-surface-alt p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-text">{request.summary || request.description || request.id}</div>
                      <Badge size="sm">{request.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-text-soft">
                      {[request.property_name, request.urgency, request.opened_at ? new Date(request.opened_at).toLocaleString() : null].filter(Boolean).join(' • ')}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{t('lists.workOrdersTitle')}</CardTitle>
                    <CardDescription>{t('lists.workOrdersDescription')}</CardDescription>
                  </div>
                  <Badge size="sm">{workOrders.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {workOrders.length === 0 ? (
                  <p className="text-sm text-text-soft">{t('empty.workOrders')}</p>
                ) : workOrders.map((workOrder) => (
                  <div key={workOrder.id} className="rounded-scholar border border-border bg-surface-alt p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-text">{workOrder.work_order_code || workOrder.category || workOrder.id}</div>
                      <Badge size="sm">{workOrder.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-text-soft">
                      {[workOrder.property_name, workOrder.vendor_name, workOrder.priority].filter(Boolean).join(' • ')}
                    </div>
                    {workOrder.latest_event?.event_type ? (
                      <div className="mt-2 text-xs text-text-soft">
                        {t('workOrderMeta.latestEvent', { value: workOrder.latest_event.event_type })}
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{t('lists.documentsTitle')}</CardTitle>
                  <CardDescription>{t('lists.documentsDescription')}</CardDescription>
                </div>
                <Badge size="sm">{documents.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {documents.length === 0 ? (
                <p className="text-sm text-text-soft">{t('empty.documents')}</p>
              ) : documents.map((document) => (
                <div key={document.id} className="rounded-scholar border border-border bg-surface-alt p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-text">{document.title || document.id}</div>
                      <div className="text-xs text-text-soft">
                        {[document.document_type, document.processing_status, document.updated_at ? new Date(document.updated_at).toLocaleString() : null].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    <Badge size="sm">{document.linked_entities.length}</Badge>
                  </div>
                  {document.linked_entities.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {document.linked_entities.map((entity, index) => (
                        <span key={`${document.id}-${entity.entity_type}-${index}`} className="rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                          {entity.title || entity.entity_type}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => void loadState()} isLoading={loading || busy === 'refresh'}>
              {t('actions.refresh')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
