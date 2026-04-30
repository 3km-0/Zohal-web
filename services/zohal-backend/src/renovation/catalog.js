function normalizeCode(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

async function selectAll(query, fallback = []) {
  const { data, error } = await query;
  if (error) throw error;
  return data || fallback;
}

export async function assertWorkspaceWriteAccess(supabase, workspaceId, userId) {
  if (!workspaceId || !userId) {
    const error = new Error("workspace_access_required");
    error.statusCode = 403;
    throw error;
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, owner_id, org_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) {
    const error = new Error("workspace_not_found");
    error.statusCode = 404;
    throw error;
  }
  if (workspace.owner_id === userId) return workspace;

  if (workspace.org_id) {
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, multi_user_enabled")
      .eq("id", workspace.org_id)
      .maybeSingle();
    if (orgError) throw orgError;
    if (!org?.multi_user_enabled) {
      const error = new Error("workspace_write_access_denied");
      error.statusCode = 403;
      throw error;
    }
    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (membership && ["owner", "editor"].includes(String(membership.role || ""))) {
      return workspace;
    }
  }

  const error = new Error("workspace_write_access_denied");
  error.statusCode = 403;
  throw error;
}

export function resolveRequestedCity(metrics = {}, opportunity = {}, input = {}) {
  const metadata = opportunity.metadata_json && typeof opportunity.metadata_json === "object"
    ? opportunity.metadata_json
    : {};
  const raw = input.city || metrics.city || metadata.city || metadata.city_code ||
    metadata.location_city || metadata.neighborhood_city || "";
  const code = normalizeCode(raw);
  if (!code) return { requestedCityCode: "riyadh", cityFallbackUsed: true };
  if (["riyadh", "الرياض"].includes(code)) return { requestedCityCode: "riyadh", cityFallbackUsed: false };
  return { requestedCityCode: code, cityFallbackUsed: false };
}

export async function loadRenovationCatalog(supabase, { cityCode = "riyadh", workspaceId = null, orgId = null } = {}) {
  const cities = await selectAll(
    supabase.from("renovation_cities").select("*").eq("is_active", true),
  );
  const city = cities.find((item) => normalizeCode(item.code) === normalizeCode(cityCode)) ||
    cities.find((item) => normalizeCode(item.code) === "riyadh") ||
    null;
  const cityFallbackUsed = Boolean(city && normalizeCode(city.code) !== normalizeCode(cityCode));
  const rateCards = city
    ? await selectAll(
      supabase
        .from("renovation_rate_cards")
        .select("*")
        .eq("city_id", city.id)
        .eq("status", "active")
        .lte("effective_from", new Date().toISOString().slice(0, 10))
        .order("effective_from", { ascending: false })
        .limit(20),
    )
    : [];
  const activeRateCard = rateCards.find((card) => {
    const workspaceOk = !card.workspace_id || card.workspace_id === workspaceId;
    const orgOk = !card.organization_id || card.organization_id === orgId;
    const notExpired = !card.effective_to || String(card.effective_to) >= new Date().toISOString().slice(0, 10);
    return workspaceOk && orgOk && notExpired;
  }) || null;

  const [finishLevels, units, categories, costItems, assemblies, assemblyItems, multipliers, rateCardItems] = await Promise.all([
    selectAll(supabase.from("renovation_finish_levels").select("*").eq("is_active", true)),
    selectAll(supabase.from("renovation_units").select("*").eq("is_active", true)),
    selectAll(supabase.from("renovation_cost_categories").select("*").eq("is_active", true)),
    selectAll(supabase.from("renovation_cost_items").select("*").eq("is_active", true)),
    selectAll(supabase.from("renovation_assemblies").select("*").eq("is_active", true)),
    selectAll(supabase.from("renovation_assembly_items").select("*")),
    selectAll(supabase.from("renovation_pricing_multipliers").select("*").eq("is_active", true)),
    activeRateCard
      ? selectAll(supabase.from("renovation_rate_card_items").select("*").eq("rate_card_id", activeRateCard.id))
      : Promise.resolve([]),
  ]);

  return {
    cities,
    city,
    city_code: city?.code || cityCode,
    city_fallback_used: cityFallbackUsed,
    currency: activeRateCard?.currency || city?.currency || "SAR",
    rate_card: activeRateCard,
    pricing_available: Boolean(activeRateCard),
    finish_levels: finishLevels,
    units,
    categories,
    cost_items: costItems,
    assemblies,
    assembly_items: assemblyItems,
    multipliers,
    rate_card_items: rateCardItems,
  };
}
