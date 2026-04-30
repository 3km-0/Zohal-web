export async function saveCapexEstimate(supabase, {
  opportunityId,
  scenarioId = null,
  orgId = null,
  eventType = "generated",
  rateCardId = null,
  estimatorVersion,
  inputJson = {},
  outputJson = {},
  createdBy = null,
}) {
  const { data, error } = await supabase.rpc("save_renovation_capex_estimate", {
    p_acquisition_opportunity_id: opportunityId,
    p_acquisition_scenario_id: scenarioId,
    p_org_id: orgId,
    p_event_type: eventType,
    p_rate_card_id: rateCardId,
    p_estimator_version: estimatorVersion,
    p_input_json: inputJson,
    p_output_json: outputJson,
    p_low_total: outputJson.low_total,
    p_base_total: outputJson.base_total,
    p_high_total: outputJson.high_total,
    p_confidence_score: outputJson.confidence_score,
    p_created_by: createdBy,
  });
  if (error) throw error;
  return data;
}
