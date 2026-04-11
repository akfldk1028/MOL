#!/usr/bin/env node
/**
 * test-action-domains.js
 * ----------------------
 * Real DashScope end-to-end test for action-domains.
 *
 * Runs:
 *   1. NegotiationHarness (2 parties, 10 rounds max)
 *   2. AnalysisHarness (sample YouTube goal)
 *
 * Usage:
 *   DASHSCOPE_API_KEY=... node scripts/test-action-domains.js
 *   node scripts/test-action-domains.js --skip-analysis
 *   node scripts/test-action-domains.js --skip-negotiation
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY;
if (!DASHSCOPE_KEY) {
  console.error('❌ DASHSCOPE_API_KEY required');
  process.exit(1);
}

const DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

async function dashscopeLLM(system, user, opts = {}) {
  const model = opts.model || 'qwen-turbo';
  const maxTokens = opts.maxOutputTokens || 800;
  const start = Date.now();
  console.log(`  [LLM] ${model} (${maxTokens} tokens)...`);

  const res = await fetch(DASHSCOPE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DASHSCOPE_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  const d = await res.json();
  const content = d.choices?.[0]?.message?.content || '';
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  [LLM] ← ${content.length} chars (${elapsed}s)`);
  return content;
}

// ─────────────────────────────────────────────
// Test 1: Negotiation
// ─────────────────────────────────────────────

async function testNegotiation() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: NegotiationHarness');
  console.log('='.repeat(60));

  const { NegotiationHarness } = require('../src/backend/action-domains/negotiation/harness/NegotiationHarness');
  const { UtilityFunction } = require('../src/backend/action-domains/negotiation/components/UtilityFunction');
  const { BATNA } = require('../src/backend/action-domains/negotiation/components/BATNA');

  // Seller: wants high price, less quantity
  const sellerUtility = new UtilityFunction({
    agent_id: 'test-seller',
    weights: { price: 0.7, quantity: 0.3 },
    ideal: { price: 100, quantity: 5 },
    reservation: { price: 50, quantity: 20 },
    batna_score: 0.25,
  });

  // Buyer: wants low price, more quantity
  const buyerUtility = new UtilityFunction({
    agent_id: 'test-buyer',
    weights: { price: 0.6, quantity: 0.4 },
    ideal: { price: 30, quantity: 20 },
    reservation: { price: 80, quantity: 5 },
    batna_score: 0.25,
  });

  const harness = new NegotiationHarness({ llmCall: dashscopeLLM });

  const session = harness.createSession({
    topic: 'Widget bulk order: price range $30-100, quantity 5-20 units',
    parties: [
      {
        agent_id: 'test-seller',
        agent_name: 'seller',
        role: 'hardliner',
        persona: 'You are a seller of premium widgets. You opened your business 5 years ago and need margins to stay profitable.',
        utility: sellerUtility,
        batna: new BATNA({ agent_id: 'test-seller', threshold: 0.25, fallback_plan: 'keep inventory' }),
      },
      {
        agent_id: 'test-buyer',
        agent_name: 'buyer',
        role: 'diplomat',
        persona: 'You are a reseller who needs to buy widgets at a price that leaves room for your retail markup.',
        utility: buyerUtility,
        batna: new BATNA({ agent_id: 'test-buyer', threshold: 0.25, fallback_plan: 'find another supplier' }),
      },
    ],
    deadlineTurns: 10,
  });

  console.log(`Session ${session.id.slice(0, 8)}... started`);
  console.log(`Topic: ${session.topic}`);
  console.log(`Deadline: ${session.deadlineTurns} turns`);
  console.log('');

  const result = await harness.run(session);

  console.log('\n--- RESULT ---');
  console.log('State:', result.state);
  console.log('Reason:', result.reason);
  console.log('Total rounds:', result.total_rounds);
  console.log('Deal:', result.deal ? JSON.stringify(result.deal.final_terms) : 'NO DEAL');
  console.log('Proposals:', result.proposals.length);
  console.log('');
  console.log('Proposal sequence:');
  for (const p of result.proposals) {
    console.log(`  R${p.round} [${p.message_type}] ${p.from.slice(0, 8)} → ${p.to.slice(0, 8)}: ${JSON.stringify(p.terms)}`);
    if (p.rationale) console.log(`    ${p.rationale.slice(0, 80)}`);
  }
  return result;
}

// ─────────────────────────────────────────────
// Test 2: Data Analysis
// ─────────────────────────────────────────────

async function testAnalysis() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: AnalysisHarness');
  console.log('='.repeat(60));

  const { AnalysisHarness } = require('../src/backend/action-domains/data-analysis/harness/AnalysisHarness');
  const { Goal } = require('../src/backend/action-domains/data-analysis/components/Goal');
  const { DataSource } = require('../src/backend/action-domains/data-analysis/components/DataSource');

  const harness = new AnalysisHarness({ llmCall: dashscopeLLM });

  const goal = new Goal({
    nl_intent: '우리 유튜브 채널의 최근 10개 영상 중 어떤 것이 가장 조회수가 높았는지, 그 이유는 무엇인지 분석해줘',
    user_id: 'test-user',
  });

  // Use SQL data source since YouTube API key may not be set
  const dataSource = new DataSource({
    source_type: 'sql',
    uri: 'posts',
    schema: {
      columns: ['id', 'title', 'content', 'score', 'comment_count', 'created_at', 'author_id'],
      note: 'MOL posts table as proxy for YouTube data',
    },
  });

  console.log(`Goal: ${goal.nl_intent}`);
  console.log(`Source: ${dataSource.describe()}`);
  console.log('');

  const session = harness.createSession({ goal, dataSource });
  const result = await harness.run(session);

  console.log('\n--- RESULT ---');
  console.log('Reason:', result.reason);
  console.log('Plan subproblems:', result.plan ? result.plan.subproblems.length : 0);
  console.log('Queries:', result.queries ? result.queries.length : 0);
  console.log('Analysis stats:', result.analysis ? JSON.stringify(result.analysis.statistics) : null);
  console.log('Visualization:', result.visualization ? result.visualization.chart_type : null);
  console.log('');
  console.log('Final Insight:');
  if (result.insight) {
    console.log(`  text: ${result.insight.text}`);
    console.log(`  confidence: ${result.insight.confidence}`);
    if (result.insight.recommendations && result.insight.recommendations.length > 0) {
      console.log(`  recommendations:`);
      for (const r of result.insight.recommendations) console.log(`    - ${r}`);
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const skipNeg = args.includes('--skip-negotiation');
  const skipAna = args.includes('--skip-analysis');

  console.log('Action Domains E2E Test (real DashScope)');
  console.log('Model: qwen-turbo');
  console.log('');

  const results = {};

  if (!skipNeg) {
    try {
      results.negotiation = await testNegotiation();
    } catch (err) {
      console.error('\n❌ Negotiation test failed:', err.message);
      console.error(err.stack);
    }
  }

  if (!skipAna) {
    try {
      results.analysis = await testAnalysis();
    } catch (err) {
      console.error('\n❌ Analysis test failed:', err.message);
      console.error(err.stack);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  if (results.negotiation) {
    console.log(`Negotiation: ${results.negotiation.state} (${results.negotiation.total_rounds} rounds)`);
  }
  if (results.analysis) {
    console.log(`Analysis:    ${results.analysis.reason}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
