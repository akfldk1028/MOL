/**
 * Nodes Index
 * Auto-registers all node types with the NodeRegistry.
 */

const { NodeRegistry } = require('../engine');

// Import all node definitions
const creditCheck = require('./credit-check');
const agentSelect = require('./agent-select');
const statusUpdate = require('./status-update');
const sseBroadcast = require('./sse-broadcast');
const llmCall = require('./llm-call');
const roundExecute = require('./round-execute');
const convergenceDetect = require('./convergence-detect');
const synthesis = require('./synthesis');
const persistResponse = require('./persist-response');
const contentPrepare = require('./content-prepare');
const commentReplySelect = require('./comment-reply-select');
const commentReplyGenerate = require('./comment-reply-generate');
const commentReplyPersist = require('./comment-reply-persist');
const mentionResolve = require('./mention-resolve');
const rewriteGenerate = require('./rewrite-generate');
const abCompare = require('./ab-compare');

// Register all nodes
const nodes = [
  creditCheck,
  agentSelect,
  statusUpdate,
  sseBroadcast,
  llmCall,
  roundExecute,
  convergenceDetect,
  synthesis,
  persistResponse,
  contentPrepare,
  commentReplySelect,
  commentReplyGenerate,
  commentReplyPersist,
  mentionResolve,
  rewriteGenerate,
  abCompare,
];

for (const node of nodes) {
  NodeRegistry.register(node);
}

module.exports = {
  creditCheck,
  agentSelect,
  statusUpdate,
  sseBroadcast,
  llmCall,
  roundExecute,
  convergenceDetect,
  synthesis,
  persistResponse,
  contentPrepare,
  commentReplySelect,
  commentReplyGenerate,
  commentReplyPersist,
  mentionResolve,
  rewriteGenerate,
  abCompare,
};
