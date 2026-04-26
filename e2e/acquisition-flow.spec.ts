import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const requiredEnv = [
  'E2E_BASE_URL',
  'E2E_ACQUISITION_WORKSPACE_ID',
] as const;

function missingRequiredEnv() {
  return requiredEnv.filter((name) => !process.env[name]);
}

function internalToken() {
  return [
    process.env.INTERNAL_FUNCTION_JWT,
    process.env.INTERNAL_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].map((value) => String(value || '').trim()).find(Boolean) || '';
}

function supabaseUrl() {
  return process.env.E2E_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.INTERNAL_SERVICE_ROLE_KEY || '';
}

function internalHeaders(requestId: string) {
  const token = internalToken();
  return {
    authorization: `Bearer ${token}`,
    apikey: token,
    'x-internal-function-jwt': token,
    'x-request-id': requestId,
    'content-type': 'application/json',
  };
}

async function login(page: Page, workspacePath: string) {
  if (process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD) {
    await page.goto(`/auth/login?redirect=${encodeURIComponent(workspacePath)}`);
    await page.getByLabel('Email').fill(process.env.E2E_TEST_EMAIL);
    await page.getByLabel('Password').fill(process.env.E2E_TEST_PASSWORD);
    await page.getByRole('button', { name: /^log in$/i }).click();
    return;
  }

  const url = supabaseUrl();
  const serviceRole = serviceRoleKey();
  const userId = process.env.E2E_TEST_USER_ID || process.env.E2E_ACQUISITION_USER_ID || '';
  expect(url, 'E2E_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required for magic-link E2E login').toBeTruthy();
  expect(serviceRole, 'SUPABASE_SERVICE_ROLE_KEY or INTERNAL_SERVICE_ROLE_KEY is required for magic-link E2E login').toBeTruthy();
  expect(userId, 'E2E_TEST_USER_ID or E2E_ACQUISITION_USER_ID is required when E2E_TEST_PASSWORD is not set').toBeTruthy();

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(userId);
  expect(userError, `Failed to load E2E user: ${userError?.message}`).toBeFalsy();
  const email = userResult.user?.email;
  expect(email, 'E2E user must have an email for magic-link login').toBeTruthy();

  const { data: linkResult, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: email!,
    options: {
      redirectTo: `${process.env.E2E_BASE_URL}/auth/callback`,
    },
  });
  expect(linkError, `Failed to generate E2E magic link: ${linkError?.message}`).toBeFalsy();
  expect(linkResult.properties?.hashed_token, 'Supabase did not return a hashed magic token').toBeTruthy();

  await page.goto(`/auth/callback?token_hash=${encodeURIComponent(linkResult.properties!.hashed_token)}&type=email`);
}

async function postJson(request: APIRequestContext, url: string, data: unknown, requestId: string) {
  const response = await request.post(url, {
    headers: internalHeaders(requestId),
    data,
  });
  const json = await response.json().catch(() => ({}));
  expect(response.ok(), `${url} failed: ${JSON.stringify(json)}`).toBeTruthy();
  return json;
}

async function getJson(request: APIRequestContext, url: string, requestId: string) {
  const response = await request.get(url, {
    headers: internalHeaders(requestId),
  });
  const json = await response.json().catch(() => ({}));
  expect(response.ok(), `${url} failed: ${JSON.stringify(json)}`).toBeTruthy();
  return json;
}

async function runOptionalSmokeSetup(request: APIRequestContext) {
  if (process.env.E2E_RUN_ACQUISITION_SMOKE !== 'true') return;
  const serviceBaseUrl = String(process.env.E2E_ACQUISITION_SERVICE_BASE_URL || '').replace(/\/+$/, '');
  const workspaceId = process.env.E2E_ACQUISITION_WORKSPACE_ID;
  const userId = process.env.E2E_ACQUISITION_USER_ID;
  const token = internalToken();
  expect(serviceBaseUrl, 'E2E_ACQUISITION_SERVICE_BASE_URL is required when E2E_RUN_ACQUISITION_SMOKE=true').toBeTruthy();
  expect(userId, 'E2E_ACQUISITION_USER_ID is required when E2E_RUN_ACQUISITION_SMOKE=true').toBeTruthy();
  expect(token, 'An internal token is required when E2E_RUN_ACQUISITION_SMOKE=true').toBeTruthy();

  const requestId = `pw-acq-${crypto.randomUUID()}`;
  const mandateResponse = await postJson(request, `${serviceBaseUrl}/api/acquisition/v1/mandates`, {
    workspace_id: workspaceId,
    user_id: userId,
    title: 'Playwright acquisition E2E mandate',
    buy_box: {
      property_type: 'villa',
      city: 'Riyadh',
      district: 'Al Arid',
      renovation_appetite: 'medium',
    },
    target_locations: ['Al Arid', 'North Riyadh'],
    budget_range: { min: 1500000, max: 4000000, currency: 'SAR' },
    risk_appetite: 'moderate',
  }, requestId);

  const searchRunResponse = await postJson(request, `${serviceBaseUrl}/api/acquisition/v1/mandates/${mandateResponse.mandate.id}/search-runs`, {
    sources: String(process.env.E2E_ACQUISITION_SOURCES || 'aqar,bayut').split(',').map((item) => item.trim()).filter(Boolean),
    limits: {
      max_result_pages_per_source: 1,
      max_detail_pages_per_source: 2,
      per_source_timeout_ms: 30000,
      per_run_timeout_ms: 90000,
    },
  }, requestId);

  await postJson(request, `${serviceBaseUrl}/internal/acquisition/search-run`, {
    search_run_id: searchRunResponse.search_run.id,
  }, requestId);

  let candidatesResponse = await getJson(request, `${serviceBaseUrl}/api/acquisition/v1/search-runs/${searchRunResponse.search_run.id}/candidates`, requestId);
  let candidates = candidatesResponse.candidates || [];

  if (!candidates.length) {
    const fixtureResponse = await postJson(request, `${serviceBaseUrl}/api/acquisition/v1/intake/listing`, {
      workspace_id: workspaceId,
      user_id: userId,
      mandate_id: mandateResponse.mandate.id,
      source: 'fixture',
      source_url: 'https://example.test/zohal/acquisition-playwright-fixture',
      title: 'Fixture villa district Al Arid Riyadh',
      asking_price: 3200000,
      city: 'Riyadh',
      district: 'Al Arid',
      property_type: 'villa',
      area_sqm: 360,
      photo_refs_json: ['fixture-photo-1'],
      text: 'Fixture villa for sale SAR 3,200,000 area 360 sqm 5 beds 4 baths.',
    }, requestId);
    candidates = [fixtureResponse.candidate];
  }

  const selected = candidates.find((candidate: { status?: string }) => candidate.status !== 'promoted') || candidates[0];
  if (selected.status !== 'promoted') {
    await postJson(request, `${serviceBaseUrl}/api/acquisition/v1/candidates/${selected.id}/promote`, {}, requestId);
  }
}

test.describe('acquisition workspace Playwright proof', () => {
  const missing = missingRequiredEnv();
  test.skip(missing.length > 0, `Missing E2E env vars: ${missing.join(', ')}`);

  test('buy box to promoted workspace surface is visible', async ({ page, request }) => {
    await runOptionalSmokeSetup(request);

    const workspaceId = process.env.E2E_ACQUISITION_WORKSPACE_ID!;
    const workspacePath = `/workspaces/${workspaceId}`;

    await login(page, workspacePath);
    await page.goto(workspacePath);

    await expect(page).toHaveURL(new RegExp(`/workspaces/${workspaceId}`), { timeout: 30000 });
    await expect(page.getByTestId('acquisition-buy-box')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('acquisition-opportunity-rail').or(page.getByTestId('acquisition-opportunity-rail-compact'))).toBeVisible();
    await expect(page.getByTestId('acquisition-cockpit-hero')).toBeVisible();

    const cards = page.getByTestId('acquisition-opportunity-card');
    await expect(cards.first()).toBeVisible({ timeout: 30000 });
    await expect(cards.first()).toContainText(/SAR|ريال|Villa|فيلا|Fixture|Acquisition|Opportunity/i);

    const sourceLink = page.getByTestId('acquisition-source-link');
    await expect(sourceLink.first()).toBeVisible({ timeout: 30000 });
    await expect(sourceLink.first()).toHaveAttribute('href', /^https?:\/\//);
  });
});
