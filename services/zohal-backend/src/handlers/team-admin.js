import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient, getSupabaseUrl } from "../runtime/supabase.js";

const WORKSPACE_ROLES = new Set(["owner", "editor", "viewer", "guest"]);
const ORG_ROLES = new Set(["owner", "admin", "member", "billing"]);
export const ENTERPRISE_PROVISION_STEPS = [
  "queued",
  "validating",
  "creating_kms",
  "creating_bucket",
  "applying_iam",
  "updating_control_plane",
  "done",
];

const ROLE_RANK = {
  member: 1,
  billing: 2,
  admin: 3,
  owner: 4,
};

function getAnonKey() {
  const value = String(process.env.SUPABASE_ANON_KEY || "").trim();
  if (!value) throw new Error("SUPABASE_ANON_KEY not configured");
  return value;
}

function authHeader(req) {
  return String(req.headers.authorization || req.headers.Authorization || "");
}

function stripBearer(value) {
  const raw = String(value || "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice("bearer ".length).trim() : raw;
}

function createUserClient(req) {
  return createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: authHeader(req) } },
    auth: { persistSession: false },
  });
}

async function getUser(req) {
  const token = stripBearer(authHeader(req));
  if (!token) {
    const error = new Error("Missing authorization header");
    error.statusCode = 401;
    throw error;
  }
  const client = createUserClient(req);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    const authError = new Error("Invalid or expired token");
    authError.statusCode = 401;
    throw authError;
  }
  return { user: data.user, client };
}

export function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return String(email || "").includes("@") &&
    String(email || "").includes(".") &&
    String(email || "").length <= 320;
}

function isOrgManagerRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "owner" || normalized === "admin";
}

function isDataLocalityTier(tier) {
  const normalized = String(tier || "").trim().toLowerCase();
  return [
    "team",
    "business",
    "ultra",
    "institutional",
    "enterprise",
  ].includes(normalized);
}

function asFeatureFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "yes", "on"].includes(normalized);
  }
  return false;
}

export function buildInviteUrl({ siteUrl, token }) {
  const base = String(siteUrl || "").replace(/\/+$/g, "");
  return `${base}/auth/accept-invite?token=${encodeURIComponent(token)}`;
}

export function sha256Hex(input) {
  return createHash("sha256").update(String(input || ""), "utf8").digest("hex");
}

function base64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeError(res, requestId, error) {
  return sendJson(res, error.statusCode || 500, {
    error: error.message || "Internal server error",
    request_id: requestId,
    execution_plane: "gcp",
  });
}

async function assertCanManageWorkspaceMembers({ admin, workspaceId, callerId }) {
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, owner_id, org_id")
    .eq("id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (!ws) throw makeError("Workspace not found", 404);
  if (normalizeUuid(ws.owner_id) === callerId) return;

  const organizationId = normalizeUuid(ws.org_id);
  if (!organizationId) throw makeError("Not allowed", 403);

  const { data: org } = await admin
    .from("organizations")
    .select("multi_user_enabled")
    .eq("id", organizationId)
    .maybeSingle();

  if (!org?.multi_user_enabled) throw makeError("Not allowed", 403);

  const { data: mem } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", callerId)
    .maybeSingle();

  if (mem?.role !== "owner") throw makeError("Not allowed", 403);
}

async function canAccessOrg(admin, orgId, userId) {
  const [{ data: org }, { data: member }] = await Promise.all([
    admin
      .from("organizations")
      .select("owner_id")
      .eq("id", orgId)
      .maybeSingle(),
    admin
      .from("organization_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return normalizeUuid(org?.owner_id) === userId || !!member?.user_id;
}

async function resolveOrgAdminAndFlags({ supabase, orgId, userId }) {
  const [{ data: org }, { data: member }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, owner_id, plan_tier, multi_user_enabled, data_locality_enabled")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!org?.id) {
    return {
      orgExists: false,
      isOrgAdmin: false,
      orgMultiUserEnabled: false,
      orgDataLocalityEnabled: false,
      orgPlanTier: null,
      planDataLocalityEnabled: false,
    };
  }

  const orgPlanTier = org.plan_tier ? String(org.plan_tier).trim().toLowerCase() : null;
  let planDataLocalityEnabled = false;
  if (orgPlanTier) {
    const { data: planRow } = await supabase
      .from("subscription_plans")
      .select("features, is_active")
      .eq("tier", orgPlanTier)
      .maybeSingle();
    planDataLocalityEnabled = (planRow?.is_active !== false &&
      asFeatureFlag(planRow?.features?.data_locality)) ||
      isDataLocalityTier(orgPlanTier);
  }

  return {
    orgExists: true,
    isOrgAdmin: normalizeUuid(org.owner_id) === userId || isOrgManagerRole(member?.role),
    orgMultiUserEnabled: !!org.multi_user_enabled,
    orgDataLocalityEnabled: !!org.data_locality_enabled,
    orgPlanTier,
    planDataLocalityEnabled,
  };
}

async function resolveOrgDataLocalityEntitlement({ supabase, orgId, userId }) {
  const out = await resolveOrgAdminAndFlags({ supabase, orgId, userId });
  const orgEligible = out.orgDataLocalityEnabled || out.planDataLocalityEnabled;
  const allowed = out.orgExists && out.isOrgAdmin && orgEligible;

  let reason = null;
  if (!out.orgExists) reason = "org_not_found";
  else if (!out.isOrgAdmin) reason = "org_admin_required";
  else if (!orgEligible) reason = "org_not_eligible";

  return {
    allowed,
    reason,
    org_id: orgId,
    org_data_locality_enabled: out.orgDataLocalityEnabled,
    org_multi_user_enabled: out.orgMultiUserEnabled,
    org_plan_tier: out.orgPlanTier,
    plan_data_locality_enabled: out.planDataLocalityEnabled,
    user_is_org_admin: out.isOrgAdmin,
  };
}

async function sendInviteEmail({ to, inviteUrl, orgName }) {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.INVITES_FROM_EMAIL || "").trim();
  if (!resendKey || !from) return { sent: false };

  const subject = `You've been invited to join ${orgName} on Zohal`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
      <p>You've been invited to join <strong>${orgName}</strong> on Zohal.</p>
      <p><a href="${inviteUrl}">Accept invite</a></p>
      <p style="color:#666;font-size:12px">If you weren't expecting this, you can ignore this email.</p>
    </div>
  `.trim();

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  return { sent: resp.ok, provider: "resend" };
}

export function buildWorkspaceMembersListResponse({ members, requestId }) {
  return {
    ok: true,
    members: members || [],
    request_id: requestId,
    execution_plane: "gcp",
  };
}

export function buildProvisionQueuedResponse({ runId }) {
  return {
    run_id: runId,
    status: "queued",
    estimated_steps: ENTERPRISE_PROVISION_STEPS,
  };
}

export async function handleWorkspaceMembersList(req, res, { requestId, readJsonBody }) {
  try {
    const { user } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const workspaceId = normalizeUuid(body.workspace_id);
    if (!workspaceId) return sendJson(res, 400, { error: "Missing workspace_id", request_id: requestId, execution_plane: "gcp" });

    await assertCanManageWorkspaceMembers({ admin, workspaceId, callerId: normalizeUuid(user.id) });

    const { data, error } = await admin
      .from("workspace_members")
      .select("id, workspace_id, user_id, role, created_at, profiles:profiles(id, email, display_name, avatar_url)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw makeError("Failed to list members", 500);

    return sendJson(res, 200, buildWorkspaceMembersListResponse({ members: data || [], requestId }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleWorkspaceMemberAdd(req, res, { requestId, readJsonBody }) {
  try {
    const { user } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const workspaceId = normalizeUuid(body.workspace_id);
    const email = normalizeEmail(body.email);
    const role = body.role || "viewer";
    if (!workspaceId || !email) return sendJson(res, 400, { error: "Missing workspace_id or email", request_id: requestId, execution_plane: "gcp" });
    if (!isValidEmail(email)) return sendJson(res, 400, { error: "Invalid email", request_id: requestId, execution_plane: "gcp" });
    if (!WORKSPACE_ROLES.has(role)) return sendJson(res, 400, { error: "Invalid role", request_id: requestId, execution_plane: "gcp" });

    await assertCanManageWorkspaceMembers({ admin, workspaceId, callerId: normalizeUuid(user.id) });

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id, email, display_name, avatar_url")
      .eq("email", email)
      .single();
    if (profileErr || !profile) return sendJson(res, 404, { error: "User not found for that email", request_id: requestId, execution_plane: "gcp" });

    const { data: existing } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (existing?.id) {
      const { data: current } = await admin
        .from("workspace_members")
        .select("id, workspace_id, user_id, role, created_at")
        .eq("workspace_id", workspaceId)
        .eq("user_id", profile.id)
        .maybeSingle();
      return sendJson(res, 200, {
        ok: true,
        member: {
          ...(current || { id: existing.id, workspace_id: workspaceId, user_id: profile.id, role, created_at: null }),
          profile,
        },
        idempotent: true,
        request_id: requestId,
        execution_plane: "gcp",
      });
    }

    const { data: inserted, error: insErr } = await admin
      .from("workspace_members")
      .upsert(
        { workspace_id: workspaceId, user_id: profile.id, role, permissions: null },
        { onConflict: "workspace_id,user_id" },
      )
      .select("id, workspace_id, user_id, role, created_at")
      .single();
    if (insErr || !inserted) throw makeError("Failed to add member", 500);

    return sendJson(res, 200, {
      ok: true,
      member: { ...inserted, profile },
      request_id: requestId,
      execution_plane: "gcp",
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleWorkspaceMemberUpdateRole(req, res, { requestId, readJsonBody }) {
  try {
    const { user } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const memberId = normalizeUuid(body.member_id);
    const role = body.role;
    if (!memberId || !role) return sendJson(res, 400, { error: "Missing member_id or role", request_id: requestId, execution_plane: "gcp" });
    if (!WORKSPACE_ROLES.has(role)) return sendJson(res, 400, { error: "Invalid role", request_id: requestId, execution_plane: "gcp" });

    const { data: target, error: targetErr } = await admin
      .from("workspace_members")
      .select("id, workspace_id, user_id, role")
      .eq("id", memberId)
      .single();
    if (targetErr || !target) return sendJson(res, 404, { error: "Membership not found", request_id: requestId, execution_plane: "gcp" });

    await assertCanManageWorkspaceMembers({ admin, workspaceId: target.workspace_id, callerId: normalizeUuid(user.id) });

    const { data: ws } = await admin.from("workspaces").select("owner_id").eq("id", target.workspace_id).single();
    if (normalizeUuid(ws?.owner_id) === normalizeUuid(target.user_id) && role !== "owner") {
      return sendJson(res, 400, { error: "Cannot change role of workspace owner", request_id: requestId, execution_plane: "gcp" });
    }

    const { data: updated, error: updErr } = await admin
      .from("workspace_members")
      .update({ role })
      .eq("id", memberId)
      .select("id, workspace_id, user_id, role, created_at")
      .single();
    if (updErr || !updated) throw makeError("Failed to update role", 500);

    return sendJson(res, 200, { ok: true, member: updated, request_id: requestId, execution_plane: "gcp" });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleWorkspaceMemberRemove(req, res, { requestId, readJsonBody }) {
  try {
    const { user } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const memberId = normalizeUuid(body.member_id);
    if (!memberId) return sendJson(res, 400, { error: "Missing member_id", request_id: requestId, execution_plane: "gcp" });

    const { data: target, error: targetErr } = await admin
      .from("workspace_members")
      .select("id, workspace_id, user_id")
      .eq("id", memberId)
      .single();
    if (targetErr || !target) return sendJson(res, 404, { error: "Membership not found", request_id: requestId, execution_plane: "gcp" });

    const { data: ws } = await admin.from("workspaces").select("owner_id").eq("id", target.workspace_id).single();
    if (normalizeUuid(ws?.owner_id) === normalizeUuid(target.user_id)) {
      return sendJson(res, 400, { error: "Cannot remove workspace owner", request_id: requestId, execution_plane: "gcp" });
    }

    await assertCanManageWorkspaceMembers({ admin, workspaceId: target.workspace_id, callerId: normalizeUuid(user.id) });

    const { error: delErr } = await admin.from("workspace_members").delete().eq("id", memberId);
    if (delErr) throw makeError("Failed to remove member", 500);

    return sendJson(res, 200, { ok: true, removed: true, request_id: requestId, execution_plane: "gcp" });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleOrgInviteCreate(req, res, { requestId, log, readJsonBody }) {
  try {
    const { user } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const orgId = normalizeUuid(body.org_id);
    const email = normalizeEmail(body.email);
    const role = body.role || "member";
    if (!orgId || !email) return sendJson(res, 400, { error: "Missing org_id or email", request_id: requestId, execution_plane: "gcp" });
    if (!isValidEmail(email)) return sendJson(res, 400, { error: "Invalid email", request_id: requestId, execution_plane: "gcp" });
    if (!ORG_ROLES.has(role)) return sendJson(res, 400, { error: "Invalid role", request_id: requestId, execution_plane: "gcp" });

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("id, name, owner_id, multi_user_enabled")
      .eq("id", orgId)
      .single();
    if (orgErr || !org) return sendJson(res, 404, { error: "Organization not found", request_id: requestId, execution_plane: "gcp" });

    const callerId = normalizeUuid(user.id);
    let isAdmin = normalizeUuid(org.owner_id) === callerId;
    if (!isAdmin) {
      const { data: mem } = await admin
        .from("organization_members")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", callerId)
        .maybeSingle();
      isAdmin = mem?.role === "admin" || mem?.role === "owner";
    }
    if (!isAdmin) return sendJson(res, 403, { error: "Not allowed to invite members", request_id: requestId, execution_plane: "gcp" });

    await admin
      .from("organization_invites")
      .update({ revoked_at: new Date().toISOString(), revoked_by: callerId })
      .eq("org_id", orgId)
      .eq("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());

    const token = base64Url(randomBytes(32));
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invite, error: inviteErr } = await admin
      .from("organization_invites")
      .insert({
        org_id: orgId,
        email,
        role,
        token_hash: tokenHash,
        invited_by: callerId,
        expires_at: expiresAt,
      })
      .select("id, org_id, email, role, invited_at, expires_at")
      .single();
    if (inviteErr || !invite) throw makeError("Failed to create invite", 500);

    const inviteUrl = buildInviteUrl({ siteUrl: process.env.SITE_URL || "", token });
    let emailSent = false;
    let provider = null;
    try {
      const emailResult = await sendInviteEmail({ to: email, inviteUrl, orgName: org.name });
      emailSent = emailResult.sent;
      provider = emailResult.provider || null;
    } catch (error) {
      log.warn("Invite email send failed", { error: error instanceof Error ? error.message : String(error) });
    }

    const domain = email.split("@")[1] || "unknown";
    log.info("Invite created", {
      org: orgId.slice(0, 8),
      invite: String(invite.id || "").slice(0, 8),
      emailDomain: domain,
      emailSent,
    });

    return sendJson(res, 200, {
      ok: true,
      invite: {
        ...invite,
        invite_url: inviteUrl,
        email_sent: emailSent,
        email_provider: provider,
        org_multi_user_enabled: org.multi_user_enabled || false,
      },
      request_id: requestId,
      execution_plane: "gcp",
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleOrgInviteAccept(req, res, { requestId, readJsonBody }) {
  try {
    const { user } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const token = String(body.token || "").trim();
    if (!token || token.length < 20) return sendJson(res, 400, { error: "Invalid token", request_id: requestId, execution_plane: "gcp" });

    const tokenHash = sha256Hex(token);
    const userId = normalizeUuid(user.id);
    const nowIso = new Date().toISOString();

    const { data: invite, error: invErr } = await admin
      .from("organization_invites")
      .select("id, org_id, email, role, expires_at, accepted_at, revoked_at")
      .eq("token_hash", tokenHash)
      .single();
    if (invErr || !invite) return sendJson(res, 404, { error: "Invite not found", request_id: requestId, execution_plane: "gcp" });
    if (invite.revoked_at) return sendJson(res, 403, { error: "Invite revoked", request_id: requestId, execution_plane: "gcp" });
    if (invite.accepted_at) return sendJson(res, 200, { ok: true, accepted: true, already_accepted: true, request_id: requestId, execution_plane: "gcp" });
    if (invite.expires_at <= nowIso) return sendJson(res, 403, { error: "Invite expired", request_id: requestId, execution_plane: "gcp" });

    const inviteRole = invite.role || "member";
    const { data: existing } = await admin
      .from("organization_members")
      .select("id, role")
      .eq("org_id", invite.org_id)
      .eq("user_id", userId)
      .maybeSingle();

    const existingRole = existing?.role || null;
    const shouldUpdateRole = !existingRole || (ROLE_RANK[inviteRole] || 0) > (ROLE_RANK[existingRole] || 0);

    if (existing && !shouldUpdateRole) {
      const { error: accErr } = await admin
        .from("organization_invites")
        .update({ accepted_at: nowIso, accepted_by: userId })
        .eq("id", invite.id);
      if (accErr) throw makeError("Failed to accept invite", 500);
      return sendJson(res, 200, {
        ok: true,
        accepted: true,
        role: existingRole,
        request_id: requestId,
        execution_plane: "gcp",
      });
    }

    const memberPayload = {
      org_id: invite.org_id,
      user_id: userId,
      role: shouldUpdateRole ? inviteRole : (existingRole || inviteRole),
      invited_at: nowIso,
      joined_at: nowIso,
    };
    const { error: upsertErr } = await admin
      .from("organization_members")
      .upsert(memberPayload, { onConflict: "org_id,user_id" });
    if (upsertErr) throw makeError("Failed to add organization member", 500);

    const { error: accErr } = await admin
      .from("organization_invites")
      .update({ accepted_at: nowIso, accepted_by: userId })
      .eq("id", invite.id);
    if (accErr) throw makeError("Failed to accept invite", 500);

    return sendJson(res, 200, {
      ok: true,
      accepted: true,
      org_id: invite.org_id,
      role: memberPayload.role,
      request_id: requestId,
      execution_plane: "gcp",
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleOrgInviteRevoke(req, res, { requestId, readJsonBody }) {
  try {
    const { user } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const inviteId = normalizeUuid(body.invite_id);
    if (!inviteId) return sendJson(res, 400, { error: "Missing invite_id", request_id: requestId, execution_plane: "gcp" });

    const { data: invite, error: inviteErr } = await admin
      .from("organization_invites")
      .select("id, org_id, accepted_at, revoked_at")
      .eq("id", inviteId)
      .single();
    if (inviteErr || !invite) return sendJson(res, 404, { error: "Invite not found", request_id: requestId, execution_plane: "gcp" });

    const { data: org } = await admin
      .from("organizations")
      .select("id, owner_id")
      .eq("id", invite.org_id)
      .single();
    if (!org) return sendJson(res, 404, { error: "Organization not found", request_id: requestId, execution_plane: "gcp" });

    const callerId = normalizeUuid(user.id);
    let isAdmin = normalizeUuid(org.owner_id) === callerId;
    if (!isAdmin) {
      const { data: mem } = await admin
        .from("organization_members")
        .select("role")
        .eq("org_id", invite.org_id)
        .eq("user_id", callerId)
        .maybeSingle();
      isAdmin = mem?.role === "admin" || mem?.role === "owner";
    }
    if (!isAdmin) return sendJson(res, 403, { error: "Not allowed to revoke invites", request_id: requestId, execution_plane: "gcp" });
    if (invite.accepted_at) return sendJson(res, 400, { error: "Invite already accepted", request_id: requestId, execution_plane: "gcp" });
    if (invite.revoked_at) return sendJson(res, 200, { ok: true, revoked: true, request_id: requestId, execution_plane: "gcp" });

    const { error: updErr } = await admin
      .from("organization_invites")
      .update({ revoked_at: new Date().toISOString(), revoked_by: callerId })
      .eq("id", inviteId);
    if (updErr) throw makeError("Failed to revoke invite", 500);

    return sendJson(res, 200, { ok: true, revoked: true, request_id: requestId, execution_plane: "gcp" });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleEnterpriseProvisionRegion(req, res, { requestId, log, readJsonBody }) {
  try {
    const { user, client } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    let orgId = normalizeUuid(body.org_id);
    const workspaceId = normalizeUuid(body.workspace_id);
    const regionCode = String(body.region_code || "").trim().toLowerCase();

    if (!orgId && workspaceId) {
      const { data: canWrite, error: canWriteErr } = await client.rpc("can_write_workspace", {
        p_workspace_id: workspaceId,
      });
      if (canWriteErr) throw makeError("Failed to verify workspace permissions", 500);
      if (!canWrite) return sendJson(res, 403, { error: "You do not have permission to provision this workspace", request_id: requestId, execution_plane: "gcp" });

      const { data: ws, error: wsErr } = await admin
        .from("workspaces")
        .select("org_id")
        .eq("id", workspaceId)
        .is("deleted_at", null)
        .maybeSingle();
      if (wsErr) throw makeError("Failed to resolve organization", 500);
      orgId = normalizeUuid(ws?.org_id);
    }

    if (!orgId || !regionCode) return sendJson(res, 400, { error: "Missing org_id or region_code", request_id: requestId, execution_plane: "gcp" });

    const { data: orgLocality, error: orgLocalityErr } = await admin
      .from("organizations")
      .select("data_locality_region")
      .eq("id", orgId)
      .maybeSingle();
    if (orgLocalityErr) throw makeError("Failed to load organization locality configuration", 500);

    const lockedRegion = orgLocality?.data_locality_region ? String(orgLocality.data_locality_region).toLowerCase() : "";
    if (lockedRegion) {
      const msg = lockedRegion === regionCode
        ? `Region is already configured and locked to ${lockedRegion}.`
        : `Region selection is permanent in v1. Organization is locked to ${lockedRegion}.`;
      return sendJson(res, 409, { error: msg, request_id: requestId, execution_plane: "gcp" });
    }

    const entitlement = await resolveOrgDataLocalityEntitlement({
      supabase: admin,
      orgId,
      userId: user.id,
    });
    if (!entitlement.allowed) {
      const status = entitlement.reason === "org_not_found" ? 404 : 403;
      return sendJson(res, status, {
        error: entitlement.reason || "Organization is not eligible for data locality",
        request_id: requestId,
        execution_plane: "gcp",
      });
    }

    const { data: region, error: regionErr } = await admin
      .from("data_locality_regions")
      .select("region_code, is_active")
      .eq("region_code", regionCode)
      .maybeSingle();
    if (regionErr) throw makeError("Failed to validate region", 500);
    if (!region || !region.is_active) return sendJson(res, 400, { error: "Selected region is not available", request_id: requestId, execution_plane: "gcp" });

    const runPayload = {
      org_id: orgId,
      org_data_locality_enabled: entitlement.org_data_locality_enabled,
      org_multi_user_enabled: entitlement.org_multi_user_enabled,
      org_plan_tier: entitlement.org_plan_tier,
      plan_data_locality_enabled: entitlement.plan_data_locality_enabled,
      request_id: requestId,
    };

    const { data: run, error: runErr } = await admin
      .from("org_data_locality_runs")
      .insert({
        org_id: orgId,
        requested_by: user.id,
        region_code: regionCode,
        status: "queued",
        step: "queued",
        progress: 0,
        job_payload: runPayload,
      })
      .select("id")
      .single();
    if (runErr || !run?.id) {
      const msg = String(runErr?.message || "");
      if (msg.toLowerCase().includes("uniq_org_data_locality_runs_active")) {
        return sendJson(res, 409, { error: "A provisioning run is already in progress for this organization", request_id: requestId, execution_plane: "gcp" });
      }
      throw makeError("Failed to create provisioning run", 500);
    }

    const queueName = String(process.env.ENTERPRISE_PROVISIONING_QUEUE_NAME || "enterprise_provisioning_jobs").trim();
    const message = {
      kind: "provision_org_region_v1",
      run_id: String(run.id),
      org_id: orgId,
      requested_by: normalizeUuid(user.id),
      region_code: regionCode,
    };
    const { data: msgId, error: enqueueErr } = await admin.rpc("pgmq_send", {
      queue_name: queueName,
      message,
      sleep_seconds: 0,
    });
    if (enqueueErr) {
      log.error("Failed to enqueue provisioning job", {
        run_id: run.id,
        org_id: orgId,
        region_code: regionCode,
        queue_name: queueName,
        error: enqueueErr.message || String(enqueueErr),
      });
      await admin
        .from("org_data_locality_runs")
        .update({
          status: "failed",
          step: "error",
          progress: 0,
          error_code: "enqueue_failed",
          error_message: "Provisioning could not be queued. Please retry.",
          result: {
            debug: {
              technical_error: String(enqueueErr.message || "").slice(0, 500),
              failed_at: new Date().toISOString(),
            },
          },
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      return sendJson(res, 500, { error: "Failed to enqueue provisioning job", request_id: requestId, execution_plane: "gcp" });
    }

    await admin
      .from("org_data_locality_runs")
      .update({
        job_payload: {
          ...runPayload,
          queue: queueName,
          msg_id: msgId,
          enqueued_at: new Date().toISOString(),
        },
      })
      .eq("id", run.id);

    return sendJson(res, 200, buildProvisionQueuedResponse({ runId: run.id }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleEnterpriseProvisioningStatus(req, res, { requestId, readJsonBody }) {
  try {
    const { user, client } = await getUser(req);
    const admin = createServiceClient();
    const body = await readJsonBody(req);
    const runId = normalizeUuid(body.run_id);
    const workspaceIdInput = normalizeUuid(body.workspace_id);
    const orgIdInput = normalizeUuid(body.org_id);
    const userId = normalizeUuid(user.id);

    if (!runId && !workspaceIdInput && !orgIdInput) {
      return sendJson(res, 400, { error: "Provide run_id, org_id, or workspace_id", request_id: requestId, execution_plane: "gcp" });
    }

    let run = null;
    let scope = "workspace";
    if (runId) {
      const { data: orgRun, error: orgErr } = await admin
        .from("org_data_locality_runs")
        .select("id, org_id, requested_by, region_code, status, step, progress, job_payload, result, error_code, error_message, started_at, completed_at, created_at, updated_at")
        .eq("id", runId)
        .maybeSingle();
      if (orgErr) throw makeError("Failed to load run", 500);

      if (orgRun) {
        run = orgRun;
        scope = "org";
      } else {
        const { data, error } = await admin
          .from("workspace_data_locality_runs")
          .select("id, workspace_id, requested_by, region_code, status, step, progress, job_payload, result, error_code, error_message, started_at, completed_at, created_at, updated_at")
          .eq("id", runId)
          .maybeSingle();
        if (error) throw makeError("Failed to load run", 500);
        run = data || null;
      }
    } else if (orgIdInput) {
      const { data, error } = await admin
        .from("org_data_locality_runs")
        .select("id, org_id, requested_by, region_code, status, step, progress, job_payload, result, error_code, error_message, started_at, completed_at, created_at, updated_at")
        .eq("org_id", orgIdInput)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw makeError("Failed to load run", 500);
      run = data || null;
      scope = "org";
    } else {
      const { data, error } = await admin
        .from("workspace_data_locality_runs")
        .select("id, workspace_id, requested_by, region_code, status, step, progress, job_payload, result, error_code, error_message, started_at, completed_at, created_at, updated_at")
        .eq("workspace_id", workspaceIdInput)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw makeError("Failed to load run", 500);
      run = data || null;
    }

    if (!run) return sendJson(res, 404, { error: "Provisioning run not found", request_id: requestId, execution_plane: "gcp" });

    if (scope === "org") {
      const orgId = normalizeUuid(run.org_id);
      const canAccessOrgRun = orgId ? await canAccessOrg(admin, orgId, userId) : false;
      if (!canAccessOrgRun) return sendJson(res, 403, { error: "Access denied", request_id: requestId, execution_plane: "gcp" });
    } else {
      const workspaceId = normalizeUuid(run.workspace_id);
      const { data: canAccess, error: accessErr } = await client.rpc("can_access_workspace", {
        p_workspace_id: workspaceId,
      });
      if (accessErr) throw makeError("Failed to verify workspace access", 500);
      if (!canAccess) return sendJson(res, 403, { error: "Access denied", request_id: requestId, execution_plane: "gcp" });
    }

    return sendJson(res, 200, { run, scope, request_id: requestId, execution_plane: "gcp" });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}
