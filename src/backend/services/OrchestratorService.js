/**
 * Orchestrator Service
 * Thin wrapper that delegates debate execution to the WorkflowEngine.
 * Maintains SSE subscribe/emit infrastructure for backward compatibility.
 */

const { NotFoundError } = require('../utils/errors');
const QuestionService = require('./QuestionService');
const CreationService = require('./CreationService');
const { WorkflowEngine, WorkflowContext } = require('../engine');
const WorkflowRegistry = require('../workflows');
const DomainRegistry = require('../domains');

// SSE 이벤트 구독자 관리
const sseSubscribers = new Map(); // questionId -> Set<res>

// Periodic cleanup: remove entries with no live subscribers every 5 minutes
setInterval(() => {
  for (const [key, subs] of sseSubscribers) {
    // Remove destroyed/finished connections
    for (const res of subs) {
      if (res.destroyed || res.writableEnded) {
        subs.delete(res);
      }
    }
    if (subs.size === 0) sseSubscribers.delete(key);
  }
}, 300000);

class OrchestratorService {
  /**
   * SSE 구독자 등록
   */
  static subscribe(questionId, res) {
    if (!sseSubscribers.has(questionId)) {
      sseSubscribers.set(questionId, new Set());
    }
    sseSubscribers.get(questionId).add(res);

    // 클라이언트 연결 종료 시 정리
    res.on('close', () => {
      const subs = sseSubscribers.get(questionId);
      if (subs) {
        subs.delete(res);
        if (subs.size === 0) sseSubscribers.delete(questionId);
      }
    });
  }

  /**
   * SSE 이벤트 전송
   */
  static emit(questionId, event, data) {
    const subs = sseSubscribers.get(questionId);
    if (!subs) return;
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of subs) {
      try {
        res.write(message);
      } catch (e) {
        subs.delete(res);
      }
    }
  }

  /**
   * Start a debate for a question.
   * Delegates to WorkflowEngine with the appropriate workflow.
   * @param {string} questionId
   * @param {Object} [options]
   * @param {string} [options.domainSlug] - Domain to use (defaults to 'general')
   * @param {string} [options.workflowId] - Override workflow ID
   */
  static async startDebate(questionId, options = {}) {
    const question = await QuestionService.getById(questionId);
    if (!question) throw new NotFoundError('Question not found');
    if (!question.session_id) throw new NotFoundError('No debate session found');

    const sessionId = question.session_id;

    // Update question status
    await QuestionService.updateStatus(questionId, 'discussing');

    // Resolve workflow: domain-specific or standard-debate
    const domainSlug = options.domainSlug || question.domain_slug || 'general';
    const domain = DomainRegistry.get(domainSlug);

    let workflow;
    if (options.workflowId) {
      workflow = WorkflowRegistry.get(options.workflowId);
    } else if (domain?.workflow && domain.workflow.nodes) {
      // Domain has fully custom workflow
      workflow = domain.workflow;
    } else {
      // Use standard-debate, merge domain workflow config if present
      const base = WorkflowRegistry.get('standard-debate');
      if (domain?.workflow?.extends && domain.workflow.config) {
        workflow = {
          ...base,
          config: { ...base.config, ...domain.workflow.config },
        };
      } else {
        workflow = base;
      }
    }

    if (!workflow) {
      throw new Error('No workflow found for debate');
    }

    // Get domain-specific config for prompts
    const domainConfig = domain?.prompts?.system?.getDomainConfig?.() || {};

    // Build context
    const context = new WorkflowContext({
      question,
      sessionId,
      questionId,
      postId: question.post_id,
      userId: question.asked_by_user_id,
      workflowConfig: workflow.config,
      domainConfig,
      domainSlug,
    });

    // Execute workflow
    try {
      await WorkflowEngine.execute(workflow, context);
      // Only mark answered if workflow completed successfully
      await QuestionService.updateStatus(questionId, 'answered');
    } catch (err) {
      console.error(`Workflow execution failed for question ${questionId}:`, err.message);
      this.emit(questionId, 'agent_error', { error: err.message });
      // Mark as failed, not answered
      await QuestionService.updateStatus(questionId, 'open');
    }
  }

  /**
   * Start a critique session for a creation.
   * @param {string} creationId
   * @param {Object} [options]
   * @param {string} [options.domainSlug] - Domain to use (defaults to creation type)
   */
  static async startCritique(creationId, options = {}) {
    const creation = await CreationService.getById(creationId);
    if (!creation) throw new NotFoundError('Creation not found');
    if (!creation.session_id) throw new NotFoundError('No critique session found');

    const sessionId = creation.session_id;

    // Update creation status
    await CreationService.updateStatus(creationId, 'reviewing');

    // Resolve domain and workflow
    // contest uses novel domain agents (no separate contest domain)
    const rawSlug = options.domainSlug || creation.domain_slug || creation.creation_type || 'novel';
    const domainSlug = rawSlug === 'contest' ? 'novel' : rawSlug;
    const domain = DomainRegistry.get(domainSlug);

    let workflow;
    if (domain?.workflow && domain.workflow.nodes) {
      workflow = domain.workflow;
    } else {
      // Use enhanced-critique (with rewrite + compare + final-report), fallback to standard
      const base = WorkflowRegistry.get('enhanced-critique') || WorkflowRegistry.get('standard-critique');
      if (domain?.workflow?.extends && domain.workflow.config) {
        workflow = {
          ...base,
          config: { ...base.config, ...domain.workflow.config },
        };
      } else {
        workflow = base;
      }
    }

    if (!workflow) {
      throw new Error('No workflow found for critique');
    }

    // Override synthesis format for book/contest analysis
    if (['book', 'contest'].includes(creation.creation_type)) {
      workflow = { ...workflow, config: { ...workflow.config, synthesisFormat: 'analysis' } };
    }

    // Get domain-specific config for prompts
    const domainConfig = domain?.prompts?.system?.getDomainConfig?.() || {};

    // Build context with creation data
    const context = new WorkflowContext({
      question: { title: creation.title, content: creation.content, max_rounds: 3 },
      sessionId,
      questionId: null,
      postId: creation.post_id,
      userId: creation.created_by_user_id,
      workflowConfig: workflow.config,
      domainConfig,
      domainSlug,
      creation,
      creationId,
    });

    // Execute workflow
    try {
      await WorkflowEngine.execute(workflow, context);
      await CreationService.updateStatus(creationId, 'critiqued');
    } catch (err) {
      console.error(`Critique workflow failed for creation ${creationId}:`, err.message);
      this.emit(creationId, 'agent_error', { error: err.message });
      await CreationService.updateStatus(creationId, 'submitted');
    }
  }
}

module.exports = OrchestratorService;
