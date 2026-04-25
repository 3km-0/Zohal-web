import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ENV_FILE = '.env.preview.local';
const envFile = process.env.ZOHAL_SEED_ENV_FILE || DEFAULT_ENV_FILE;

function loadEnv(file) {
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) return;
  for (const line of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = rest.join('=').replace(/^['"]|['"]$/g, '');
    }
  }
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function inDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function calcScenario({ price, renovation, rent, vacancy, hold, appreciation }) {
  const equity = price * 0.32 + renovation;
  const debt = price * 0.68;
  const annualRent = rent * 12 * (1 - vacancy / 100);
  const cashFlow = annualRent * 0.82 - debt * 0.071;
  const sale = (price + renovation * 0.65) * Math.pow(1 + appreciation / 100, hold);
  const terminal = sale * 0.975 - debt * Math.max(0.72, 1 - hold * 0.035);
  const profit = cashFlow * hold + terminal - equity;
  const irr = Math.pow(Math.max(0.01, (equity + profit) / Math.max(1, equity)), 1 / hold) - 1;
  return {
    equity_required: Math.round(equity),
    annual_cash_flow: Math.round(cashFlow),
    terminal_value: Math.round(terminal),
    cash_on_cash: Number((cashFlow / Math.max(1, equity)).toFixed(4)),
    irr: Number(irr.toFixed(4)),
  };
}

loadEnv(envFile);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.INTERNAL_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(`Missing Supabase URL or service role key. Set ZOHAL_SEED_ENV_FILE or provide env vars.`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ids = {
  workspace: '9a59d268-8f46-47a2-9c0f-1f32e2bfa601',
  mandate: '7c6b0767-7d4e-4a14-9fb3-3527677d9a48',
  conversations: [
    '3ed1a98f-5206-4c53-98a5-9ba97e05db11',
    '3ed1a98f-5206-4c53-98a5-9ba97e05db12',
    '3ed1a98f-5206-4c53-98a5-9ba97e05db13',
    '3ed1a98f-5206-4c53-98a5-9ba97e05db14',
  ],
  opportunities: [
    '0c3ef3ea-b8e5-47f7-bf2f-cda4bc906f91',
    '0c3ef3ea-b8e5-47f7-bf2f-cda4bc906f92',
    '0c3ef3ea-b8e5-47f7-bf2f-cda4bc906f93',
    '0c3ef3ea-b8e5-47f7-bf2f-cda4bc906f94',
  ],
};

const deals = [
  {
    id: ids.opportunities[0],
    conversationId: ids.conversations[0],
    phone: '+966500010091',
    rank: 1,
    title: 'Al Malqa Corner Villa',
    ar: 'فيلا زاوية - الملقا',
    stage: 'formal_diligence',
    summary: 'Al Malqa corner villa with renovation upside; asking only works if roof waterproofing risk is capped.',
    status: 'Live diligence',
    area: 420,
    price: 3820000,
    score: 91,
    rent: 23500,
    renovation: 340000,
    vacancy: 7,
    hold: 5,
    appreciation: 4.2,
    confidence: 'high',
    recommendation: 'pursue',
    focus: 'renovation_relevant_residential',
    readiness: 'inspection_blocked',
    missing: ['roof waterproofing condition', 'utility bills for last 12 months', 'seller flexibility below 3.68M'],
    source: 'Broker WhatsApp + uploaded deed',
    brokerNote: 'Seller may discuss a fast-close offer below asking.',
    compsNote: 'Nearby renovated villas traded between 9.4k and 10.8k SAR/m2 in Q1 2026.',
    condition: 'Roof waterproofing condition unknown; contractor inspection required before offer.',
  },
  {
    id: ids.opportunities[1],
    conversationId: ids.conversations[1],
    phone: '+966500010084',
    rank: 2,
    title: 'Al Narjis Duplex',
    ar: 'دوبلكس - النرجس',
    stage: 'needs_info',
    summary: 'Al Narjis duplex has strong entry price but needs inspection and clean rental assumptions.',
    status: 'Needs inspection',
    area: 305,
    price: 2460000,
    score: 84,
    rent: 16500,
    renovation: 190000,
    vacancy: 8,
    hold: 5,
    appreciation: 3.8,
    confidence: 'medium_high',
    recommendation: 'watch',
    focus: 'family_duplex',
    readiness: 'needs_inspection',
    missing: ['electrical inspection', 'rental comps within same block'],
    source: 'Broker page + WhatsApp thread',
    brokerNote: 'Broker expects competing interest after weekend showing.',
    compsNote: 'Narjis renovated duplexes are clearing around 8.7k SAR/m2.',
    condition: 'Wet areas need modernization; electrical panel not photographed.',
  },
  {
    id: ids.opportunities[2],
    conversationId: ids.conversations[2],
    phone: '+966500010078',
    rank: 3,
    title: 'Hittin Mixed-Use Plot',
    ar: 'أصل مختلط - حطين',
    stage: 'watch',
    summary: 'Hittin mixed-use plot is attractive on location but has a valuation gap and zoning uncertainty.',
    status: 'Valuation gap',
    area: 510,
    price: 4950000,
    score: 78,
    rent: 28000,
    renovation: 520000,
    vacancy: 10,
    hold: 6,
    appreciation: 4.8,
    confidence: 'medium',
    recommendation: 'watch',
    focus: 'mixed_use_land',
    readiness: 'zoning_uncertain',
    missing: ['zoning certificate', 'street width confirmation', 'service connection cost'],
    source: 'Developer page + municipal notes',
    brokerNote: 'Seller anchors on future commercial conversion.',
    compsNote: 'Asking is 12-16% above nearby mixed-use land transactions.',
    condition: 'Zoning and service obligations must be verified before underwriting.',
  },
  {
    id: ids.opportunities[3],
    conversationId: ids.conversations[3],
    phone: '+966500010073',
    rank: 4,
    title: 'Al Yasmin Townhouse',
    ar: 'تاون هاوس - الياسمين',
    stage: 'screening',
    summary: 'Al Yasmin townhouse is clean and financeable, but upside is thinner than the mandate target.',
    status: 'Monitoring',
    area: 360,
    price: 2980000,
    score: 73,
    rent: 18500,
    renovation: 120000,
    vacancy: 6,
    hold: 4,
    appreciation: 3.2,
    confidence: 'medium',
    recommendation: 'screening',
    focus: 'stabilized_residential',
    readiness: 'monitor',
    missing: ['service charge history', 'seller timeline'],
    source: 'Aqar listing snapshot',
    brokerNote: 'Owner prefers clean terms over highest price.',
    compsNote: 'Family townhouses nearby are trading near 9.4k SAR/m2.',
    condition: 'Low renovation burden; main question is price discipline.',
  },
];

const diligenceByDeal = {
  [ids.opportunities[0]]: [
    ['Confirm zoning and street width', 'system', 'resolved', 'high', -0.2],
    ['Broker to provide utility bills', 'broker', 'requested', 'medium', 1],
    ['Roof inspection slot', 'contractor', 'open', 'critical', 2],
    ['Financing term sheet refresh', 'investor', 'open', 'medium', 3],
    ['Seller flexibility on 3.62M anchor', 'operator', 'open', 'high', 3],
  ],
  [ids.opportunities[1]]: [
    ['Electrical inspection report', 'contractor', 'open', 'high', 2],
    ['Same-block rental evidence', 'operator', 'requested', 'medium', 4],
  ],
  [ids.opportunities[2]]: [
    ['Zoning certificate', 'broker', 'open', 'critical', 2],
    ['Street width proof', 'operator', 'open', 'high', 2],
  ],
  [ids.opportunities[3]]: [
    ['Service charge history', 'broker', 'requested', 'medium', 5],
    ['Seller timeline', 'operator', 'open', 'low', 5],
  ],
};

async function requireNoError(label, promise) {
  const result = await promise;
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

async function pickOwnerId() {
  if (process.env.ZOHAL_SEED_OWNER_ID) return process.env.ZOHAL_SEED_OWNER_ID;
  const rows = await requireNoError(
    'profiles lookup',
    supabase.from('profiles').select('id').order('created_at', { ascending: true }).limit(1)
  );
  const ownerId = rows?.[0]?.id;
  if (!ownerId) throw new Error('No profile found. Set ZOHAL_SEED_OWNER_ID to seed a workspace owner explicitly.');
  return ownerId;
}

async function main() {
  const ownerId = await pickOwnerId();
  const now = new Date().toISOString();

  await requireNoError(
    'workspace upsert',
    supabase.from('workspaces').upsert({
      id: ids.workspace,
      owner_id: ownerId,
      name: 'Zohal Demo - Riyadh Acquisition Cockpit',
      description: 'Active mandate - Riyadh renovation-relevant residential - investor control surface',
      analysis_brief: 'Budget 1.5M-5M SAR; Riyadh North; yield target 5.5%+; renovation appetite <=550k SAR.',
      icon: 'building.2.fill',
      color: '#6D5BD0',
      preparation_status: 'ready',
      preparation_metadata: {
        seed_kind: 'acquisition_cockpit_demo',
        seeded_at: now,
        source: 'scripts/seed-acquisition-demo.mjs',
      },
      dashboard_focus_mode: 'everything',
      status: 'active',
      updated_at: now,
    })
  );

  await requireNoError(
    'mandate upsert',
    supabase.from('acquisition_mandates').upsert({
      id: ids.mandate,
      workspace_id: ids.workspace,
      user_id: ownerId,
      status: 'active',
      title: 'Riyadh North renovation-relevant residential mandate',
      buy_box_json: { budget: '1.5M-5M SAR', city: 'Riyadh North', yield_target: '5.5%+', renovation_appetite: '<=550k SAR' },
      target_locations_json: ['Al Malqa', 'Al Narjis', 'Hittin', 'Al Yasmin'],
      budget_range_json: { min: 1500000, max: 5000000, currency: 'SAR' },
      risk_appetite: 'renovation upside with capped structural risk',
      excluded_criteria_json: ['unclear ownership', 'unverified zoning', 'unbounded structural scope'],
      confidence_json: { basis: 'seeded realistic demo', level: 'demo' },
      updated_at: now,
    })
  );

  for (const [index, deal] of deals.entries()) {
    await requireNoError(
      `conversation ${deal.title}`,
      supabase.from('whatsapp_conversations').upsert({
        id: deal.conversationId,
        channel: 'whatsapp',
        phone_number: deal.phone,
        mode: index === 0 ? 'diligence_followup' : 'screening',
        language: index === 0 ? 'ar' : 'auto',
        active_workspace_id: ids.workspace,
        awaiting_upload_kind: 'none',
        last_user_goal: `${deal.title}: ${deal.status}`,
        state_json: { seed_kind: 'acquisition_cockpit_demo', rank: deal.rank, deal: deal.title },
        last_message_at: daysAgo(index / 12),
        updated_at: daysAgo(index / 12),
      }, { onConflict: 'channel,phone_number' })
    );

    await requireNoError(
      `opportunity ${deal.title}`,
      supabase.from('acquisition_opportunities').upsert({
        id: deal.id,
        workspace_id: ids.workspace,
        originating_conversation_id: deal.conversationId,
        phone_number: deal.phone,
        source_channel: 'whatsapp',
        result_source: 'zohal_native',
        stage: deal.stage,
        title: deal.title,
        summary: deal.summary,
        opportunity_kind: 'residential_acquisition',
        acquisition_focus: deal.focus,
        screening_readiness: deal.readiness,
        viewing_readiness: deal.missing.length > 2 ? 'blocked' : 'ready_with_conditions',
        budget_band: deal.price > 4000000 ? 'upper_mandate' : 'within_mandate',
        area_summary: `${deal.area} m2 - ${deal.ar}`,
        current_intent: 'evaluate_acquisition',
        financing_status: index === 0 ? 'term_sheet_refresh_required' : 'not_started',
        missing_info_json: deal.missing,
        metadata_json: {
          seed_kind: 'acquisition_cockpit_demo',
          rank: deal.rank,
          status: deal.status,
          ar_label: deal.ar,
          score: deal.score,
          fit_score: deal.score,
          recommendation: deal.recommendation,
          confidence: deal.confidence,
          price: deal.price,
          asking_price: deal.price,
          area_sqm: deal.area,
          monthly_rent: deal.rent,
          renovation_budget: deal.renovation,
          vacancy: deal.vacancy,
          hold_period: deal.hold,
          appreciation: deal.appreciation,
          source: deal.source,
          source_label: deal.source,
          broker_note: deal.brokerNote,
          counterparty_note: deal.brokerNote,
          comps_note: deal.compsNote,
          market_context: deal.compsNote,
          condition: deal.condition,
          renovation_scope: deal.condition,
          fit_signals: ['good', deal.score > 80 ? 'good' : 'warn', deal.missing.length > 2 ? 'warn' : 'good', 'good'],
        },
        updated_at: daysAgo(index / 8),
      })
    );

    await requireNoError(
      `conversation link ${deal.title}`,
      supabase
        .from('whatsapp_conversations')
        .update({ active_opportunity_id: deal.id, updated_at: daysAgo(index / 12) })
        .eq('id', deal.conversationId)
    );

    const assumptions = {
      price: deal.price,
      renovation: deal.renovation,
      rent: deal.rent,
      vacancy: deal.vacancy,
      hold: deal.hold,
      appreciation: deal.appreciation,
    };

    await requireNoError(
      `scenario ${deal.title}`,
      supabase.from('acquisition_scenarios').upsert({
        id: `1${deal.id.slice(1)}`,
        opportunity_id: deal.id,
        workspace_id: ids.workspace,
        scenario_kind: 'base',
        title: 'Base acquisition case',
        assumptions_json: assumptions,
        outputs_json: calcScenario(assumptions),
        editable: true,
        updated_at: daysAgo(index / 8),
      })
    );

    const claims = [
      ['verified_title', { label: 'Title / ownership evidence reviewed', source: deal.source }, 'verified_source', 0.96],
      ['market_signal', { label: deal.compsNote }, 'market_signal', 0.81],
      ['counterparty_signal', { label: deal.brokerNote }, 'counterparty_provided', 0.72],
      ['model_output', { label: `Base case uses ${deal.rent.toLocaleString()} SAR monthly rent and ${deal.renovation.toLocaleString()} SAR renovation reserve.` }, 'modeled_output', 0.68],
      ['uncertain_scope', { label: deal.missing[0] }, 'uncertain', 0.34],
    ];
    for (const [claimIndex, [factKey, value, basis, confidence]] of claims.entries()) {
      await requireNoError(
        `claim ${deal.title} ${factKey}`,
        supabase.from('acquisition_claims').upsert({
          id: `2${deal.id.slice(1, -1)}${claimIndex}`,
          opportunity_id: deal.id,
          workspace_id: ids.workspace,
          fact_key: factKey,
          value_json: value,
          basis_label: basis,
          confidence,
          source_channel: 'seeded_demo',
          evidence_refs_json: [{ kind: 'demo', label: deal.source }],
          updated_at: daysAgo(index / 8),
        })
      );
    }

    const diligence = diligenceByDeal[deal.id] ?? [];
    for (const [itemIndex, [title, ownerKind, status, priority, dueOffset]] of diligence.entries()) {
      await requireNoError(
        `diligence ${deal.title} ${title}`,
        supabase.from('acquisition_diligence_items').upsert({
          id: `3${deal.id.slice(1, -1)}${itemIndex}`,
          opportunity_id: deal.id,
          workspace_id: ids.workspace,
          title,
          item_type: 'missing_info',
          priority,
          status,
          owner_kind: ownerKind,
          due_at: inDays(dueOffset),
          evidence_refs_json: [{ kind: 'demo', label: deal.source }],
          updated_at: daysAgo(index / 10),
        })
      );
    }

    const threadRows = [
      ['diligence', `${deal.title} diligence`, deal.condition, deal.missing.length > 2 ? 'waiting_on_inputs' : 'active'],
      ['broker', `${deal.title} broker thread`, deal.brokerNote, 'active'],
    ];
    for (const [threadIndex, [kind, title, summary, status]] of threadRows.entries()) {
      await requireNoError(
        `thread ${deal.title} ${kind}`,
        supabase.from('acquisition_threads').upsert({
          id: `4${deal.id.slice(1, -1)}${threadIndex}`,
          opportunity_id: deal.id,
          workspace_id: ids.workspace,
          thread_kind: kind,
          title,
          summary,
          status,
          metadata_json: { seed_kind: 'acquisition_cockpit_demo', rank: deal.rank },
          updated_at: daysAgo(index / 6),
        })
      );
    }

    const eventRows = [
      ['screening_note', `Zohal scored ${deal.title} at ${deal.score}/100 against mandate fit.`, 0.18 + index],
      ['broker_signal', deal.brokerNote, 0.35 + index],
      ['market_refresh', deal.compsNote, 0.65 + index],
    ];
    if (index === 0) {
      eventRows.unshift(['decision_blocker', 'Flagged roof waterproofing as the active decision blocker.', 0.08]);
      eventRows.push(['contractor_slot', 'Contractor inspection window available Sunday 5:30 PM.', 0.5]);
    }
    for (const [eventIndex, [eventType, bodyText, ageDays]] of eventRows.entries()) {
      await requireNoError(
        `event ${deal.title} ${eventType}`,
        supabase.from('acquisition_events').upsert({
          id: `5${deal.id.slice(1, -1)}${eventIndex}`,
          workspace_id: ids.workspace,
          opportunity_id: deal.id,
          acquisition_thread_id: `4${deal.id.slice(1, -1)}0`,
          event_type: eventType,
          event_direction: eventIndex % 2 === 0 ? 'system' : 'inbound',
          body_text: bodyText,
          event_payload: { seed_kind: 'acquisition_cockpit_demo' },
          media_json: [],
          created_at: daysAgo(ageDays),
        })
      );
    }
  }

  await requireNoError(
    'workspace timestamp',
    supabase.from('workspaces').update({ updated_at: now }).eq('id', ids.workspace)
  );

  console.log(`Seeded acquisition demo workspace: ${ids.workspace}`);
  console.log(`Open: /workspaces/${ids.workspace}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
