/**
 * Open Multi-Agent engine modules for MOL.
 * @origin: open-multi-agent (https://github.com/JackChen-me/open-multi-agent)
 * Ported from TypeScript to CommonJS for Express backend compatibility.
 */

const { extractJSON, validate, validateAndRetry } = require('./structured-output');
const { LoopDetector } = require('./loop-detector');
const { Semaphore } = require('./semaphore');
const { TaskQueue, createTask, isTaskReady, getTaskDependencyOrder, validateTaskDependencies } = require('./task-queue');
const { Orchestrator, Team, parseTaskSpecs, executeWithRetry } = require('./orchestrator');
const { Scheduler } = require('./scheduler');
const { AgentPool } = require('./agent-pool');
const { SharedMemory } = require('./shared-memory');

module.exports = {
  // Existing
  extractJSON, validate, validateAndRetry, LoopDetector, Semaphore,
  // Task Queue
  TaskQueue, createTask, isTaskReady, getTaskDependencyOrder, validateTaskDependencies,
  // Orchestrator + Scheduler + Pool + SharedMemory
  Orchestrator, Team, parseTaskSpecs, executeWithRetry, Scheduler, AgentPool, SharedMemory,
};
