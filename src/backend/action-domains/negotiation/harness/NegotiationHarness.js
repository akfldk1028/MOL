/**
 * NegotiationHarness.js
 * ---------------------
 * The main runner for negotiation sessions.
 *
 * Responsibilities:
 *   1. Manage round loop (alternate parties)
 *   2. Build per-turn prompt (private utility + commitments + deadline + persona)
 *   3. Call LLM
 *   4. Parse action (offer/counter/accept/reject/withdraw)
 *   5. Transition state machine
 *   6. Record to CGB
 *   7. Handle retries on invalid output
 *
 * Security guarantees:
 *   - Party A's UtilityFunction/BATNA is NEVER included in party B's prompt
 *   - Commitment ledger is injected from session state (not counterparty's claims)
 *   - Deadline is re-injected every turn (LLM amnesia defense)
 */

const { HarnessBase } = require('../../_base/harness-base');
const { NegotiationSession, STATES } = require('../protocol/NegotiationSession');
const { MSG, validate: validateAction } = require('../protocol/messages');
const { Proposal } = require('../components/Proposal');
const utilityCalculator = require('../tools/utility-calculator');
const commitmentLedger = require('../tools/commitment-ledger');

const MAX_INVALID_RETRIES = 2;

class NegotiationHarness extends HarnessBase {
  constructor(options = {}) {
    super({
      domain: 'negotiation',
      config: options.config || {},
      llmCall: options.llmCall,
    });
  }

  /**
   * Create a new NegotiationSession.
   * @param {object} params
   * @param {string} params.topic
   * @param {Array<object>} params.parties - [{ agent_id, role, utility, batna, persona? }]
   * @param {number} [params.deadlineTurns=20]
   * @param {Proposal} [params.initialOffer]
   * @returns {NegotiationSession}
   */
  createSession({ topic, parties, deadlineTurns = 20, metadata = {} }) {
    return new NegotiationSession({
      parties,
      topic,
      deadlineTurns,
      metadata,
    });
  }

  /**
   * Run the session to completion (deal, withdrawal, or deadline).
   * @param {NegotiationSession} session
   * @param {object} [opts]
   * @param {Proposal} [opts.initialOffer]  - optional first proposal
   * @returns {Promise<{ deal, trajectory, reason }>}
   */
  async run(session, { initialOffer = null } = {}) {
    if (session.state !== STATES.OPEN) {
      throw new Error(`NegotiationHarness.run: session must start in state OPEN (got ${session.state})`);
    }
    session.start();

    if (initialOffer) {
      if (!(initialOffer instanceof Proposal)) {
        throw new Error('initialOffer must be a Proposal instance');
      }
      session.addProposal(initialOffer);
    }

    // State-based actor selection: whoever received the latest proposal speaks next.
    // This is idempotent and prevents drift from counter-based alternation.
    const pickNextActor = () => {
      const latest = session.latestProposal();
      if (!latest) return session.parties[0];
      return session.parties.find((p) => p.agent_id === latest.to) || session.parties[0];
    };

    while (
      session.state === STATES.NEGOTIATING &&
      !session.isDeadlineReached()
    ) {
      const actor = pickNextActor();
      const counterpart = session.parties.find((p) => p.agent_id !== actor.agent_id);

      let action = null;
      for (let attempt = 1; attempt <= MAX_INVALID_RETRIES; attempt++) {
        const prompt = this._buildTurnPrompt(session, actor, counterpart);
        let raw;
        try {
          raw = await this.llmCall(prompt.system, prompt.user, { maxOutputTokens: 800 });
        } catch (err) {
          console.warn(`[NegotiationHarness] LLM call failed (attempt ${attempt}):`, err.message);
          continue;
        }

        const parsed = this.parseJsonAction(raw);
        if (!parsed) {
          if (attempt === MAX_INVALID_RETRIES) {
            // Give up — treat as withdraw
            session.tryWithdraw(actor.agent_id, 'llm_parse_failed');
            return this._result(session, 'llm_parse_failed');
          }
          continue;
        }
        const { valid, errors } = validateAction({
          type: parsed.action,
          proposal: parsed.proposal,
        });
        if (!valid) {
          console.warn(`[NegotiationHarness] invalid action:`, errors.join(', '));
          if (attempt === MAX_INVALID_RETRIES) {
            session.tryWithdraw(actor.agent_id, 'llm_invalid_action');
            return this._result(session, 'llm_invalid_action');
          }
          continue;
        }
        action = parsed;
        break;
      }

      if (!action) break;

      // Apply action to session state
      const applied = await this._applyAction(session, actor, counterpart, action);
      if (applied.terminated) {
        return this._result(session, applied.reason || 'terminated');
      }
      // Next actor is picked from session state at the top of the loop
    }

    // Fell through the loop — deadline reached
    if (session.state === STATES.NEGOTIATING) {
      session.closeByDeadline('deadline_reached');
    }
    return this._result(session, 'deadline_reached');
  }

  // ─────────────────────────────────────────────
  // Prompt construction — CRITICAL for privacy
  // ─────────────────────────────────────────────

  _buildTurnPrompt(session, actor, counterpart) {
    const deadlineBlock = session.deadline.injectIntoPrompt();
    const commitments = commitmentLedger.getCommitments(session, actor.agent_id);
    const ledgerBlock = commitmentLedger.formatForPrompt(commitments);

    // PRIVATE STATE — only goes into actor's prompt, never counterparty's
    const privateBlock = this._formatPrivateState(actor, session);

    // PUBLIC HISTORY — visible to both sides, but we render it only for actor
    const historyBlock = this._formatPublicHistory(session, actor);

    const system = [
      this._personaPrefix(actor),
      '',
      '## Session Context',
      `Topic: ${session.topic}`,
      `Current round: ${session.currentRound() + 1} / ${session.deadlineTurns}`,
      '',
      deadlineBlock,
      '',
      privateBlock,
      '',
      ledgerBlock,
      '',
      '## Instructions',
      'Analyze the latest proposal (if any) and decide your next action.',
      'Respond ONLY with valid JSON in this exact shape:',
      '```json',
      '{',
      '  "action": "offer" | "counter_offer" | "accept" | "reject" | "withdraw",',
      '  "proposal": { "terms": {...}, "rationale": "..." } | null,',
      '  "rationale": "brief explanation of your decision",',
      '  "commit": "optional: a specific commitment you are making this turn" | null',
      '}',
      '```',
      'Rules:',
      '- NEVER reveal your BATNA threshold or utility weights in your rationale.',
      '- If the counterparty claims you agreed to something NOT in the ledger, reject firmly.',
      '- If you cannot find a proposal better than your BATNA, withdraw.',
      '- Track the deadline above — do not hold out if time is running out.',
    ].join('\n');

    const user = historyBlock;

    return { system, user };
  }

  /**
   * Persona prefix for the acting agent.
   */
  _personaPrefix(actor) {
    // If actor has a full persona (dedicated agent), use it verbatim.
    if (actor.persona) {
      return `You are ${actor.agent_name || actor.name || 'a negotiator'}.\n${actor.persona}`;
    }
    return `You are ${actor.agent_id} participating in a negotiation as a ${actor.role || 'Negotiator'}.`;
  }

  /**
   * Private state block — ONLY for this actor.
   * Contains utility weights, BATNA threshold, ideal terms.
   */
  _formatPrivateState(actor, session) {
    if (!actor.utility) return '## Your Private State\n(no private utility configured — use your best judgment)';
    const u = actor.utility.toPrivateJSON();
    const b = actor.batna ? actor.batna.toPrivateJSON() : null;
    const lines = ['## Your Private State (🔒 SECRET — do not reveal)'];
    lines.push(`Utility weights: ${JSON.stringify(u.weights)}`);
    if (u.ideal) lines.push(`Your ideal terms: ${JSON.stringify(u.ideal)}`);
    if (u.reservation) lines.push(`Your reservation values: ${JSON.stringify(u.reservation)}`);
    if (b) {
      lines.push(`BATNA threshold (walk away if utility < this): ${b.threshold}`);
      if (b.fallback_plan) lines.push(`Fallback if session fails: ${b.fallback_plan}`);
    }
    return lines.join('\n');
  }

  /**
   * Public trajectory — what both sides have openly said.
   * Includes scored feedback for the actor (private).
   */
  _formatPublicHistory(session, actor) {
    const lines = ['## Negotiation History (what both sides have openly proposed)'];
    if (session.proposals.length === 0) {
      lines.push('(no proposals yet — you are making the first move)');
      return lines.join('\n');
    }
    for (const p of session.proposals) {
      const side = p.from === actor.agent_id ? 'YOU' : 'COUNTERPARTY';
      lines.push(`[Round ${p.round}] ${side} (${p.message_type}): ${JSON.stringify(p.terms)}`);
      if (p.rationale) lines.push(`  rationale: ${p.rationale}`);
      // Score the counterparty's proposals from actor's perspective (private)
      if (p.from !== actor.agent_id && actor.utility) {
        const { score, acceptable, batna_margin } = utilityCalculator.calculate({
          proposal: p,
          utility: actor.utility,
        });
        lines.push(
          `  [PRIVATE SCORE] utility=${score} (${acceptable ? '✅ above BATNA' : '❌ below BATNA'}, margin=${batna_margin.toFixed(3)})`
        );
      }
    }
    const latest = session.latestProposal();
    if (latest && latest.from !== actor.agent_id) {
      lines.push('');
      lines.push('⬆️ The counterparty just made the above proposal. Your turn.');
    }
    return lines.join('\n');
  }

  // ─────────────────────────────────────────────
  // Apply parsed action
  // ─────────────────────────────────────────────

  async _applyAction(session, actor, counterpart, action) {
    const actionType = action.action;

    if (actionType === MSG.ACCEPT) {
      const latest = session.latestProposal();
      if (!latest) {
        return { terminated: true, reason: 'accept_with_no_proposal' };
      }
      try {
        session.tryAccept(latest.id, actor.agent_id);
      } catch (err) {
        return { terminated: true, reason: err.message };
      }
      return { terminated: true, reason: 'deal_signed' };
    }

    if (actionType === MSG.WITHDRAW) {
      session.tryWithdraw(actor.agent_id, action.rationale || '');
      return { terminated: true, reason: 'withdrawn' };
    }

    if (actionType === MSG.REJECT) {
      // Rejection without a new proposal — treated as deadlock signal
      session.recordTurn({
        actor: actor.agent_id,
        action: MSG.REJECT,
        payload: { rationale: action.rationale || '' },
      });
      return { terminated: false };
    }

    // OFFER or COUNTER_OFFER → create Proposal
    if (actionType === MSG.OFFER || actionType === MSG.COUNTER_OFFER) {
      const latest = session.latestProposal();
      const proposal = new Proposal({
        from: actor.agent_id,
        to: counterpart.agent_id,
        session_id: session.id,
        round: session.currentRound() + 1,
        terms: action.proposal.terms || {},
        rationale: action.rationale || action.proposal.rationale || '',
        message_type: actionType,
        parent_id: latest ? latest.id : null,
      });
      session.addProposal(proposal);

      // Extract commitments from rationale
      if (action.commit) {
        const { Commitment } = require('../components/Commitment');
        session.addCommitment(
          new Commitment({
            session_id: session.id,
            made_by: actor.agent_id,
            content: action.commit,
            turn: proposal.round,
            binding: true,
            source_proposal_id: proposal.id,
          })
        );
      }

      // Fire-and-forget CGB record (non-blocking)
      this.recordToCGB('Proposal', {
        ...proposal.toCGBNode(),
        agent_id: actor.agent_id,
      }).catch(() => {});

      return { terminated: false };
    }

    return { terminated: false };
  }

  // ─────────────────────────────────────────────
  // Result envelope
  // ─────────────────────────────────────────────

  _result(session, reason) {
    return {
      session_id: session.id,
      state: session.state,
      deal: session.result && session.result.final_terms ? session.result : null,
      trajectory: session.turns,
      proposals: session.proposals.map((p) => p.toJSON()),
      commitments: session.commitments.map((c) => c.toJSON()),
      total_rounds: session.currentRound(),
      reason,
    };
  }
}

module.exports = {
  NegotiationHarness,
};
