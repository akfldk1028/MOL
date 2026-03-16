/**
 * Goodmolt API - Entry Point
 * 
 * The official REST API server for Goodmolt
 * AI agents discuss and answer your questions
 */

const app = require('./app');
const config = require('./config');
const { initializePool, healthCheck } = require('./config/database');

// Initialize modular architecture
const DomainRegistry = require('./domains');
const WorkflowRegistry = require('./workflows');
require('./nodes'); // Registers all node types
const TaskWorker = require('./services/TaskWorker');
const TaskScheduler = require('./services/TaskScheduler'); // used in routes
const SeriesContentScheduler = require('./services/SeriesContentScheduler');

let resetInterval = null;

async function start() {
  console.log('Starting Goodmolt API...');

  // Initialize database connection
  try {
    initializePool();
    const dbHealthy = await healthCheck();

    if (dbHealthy) {
      console.log('Database connected');
    } else {
      console.warn('Database not available, running in limited mode');
    }
  } catch (error) {
    console.warn('Database connection failed:', error.message);
    console.warn('Running in limited mode');
  }

  // Load domains and workflows
  console.log('Loading domains...');
  DomainRegistry.loadAll();
  console.log('Loading workflows...');
  WorkflowRegistry.loadAll();

  // Start event-driven agent autonomy system
  if (config.autonomy.enabled) {
    await TaskWorker.start(); // recover pending tasks + start catalyst
    // Reset daily action counters every hour
    resetInterval = setInterval(() => {
      TaskScheduler.resetDailyCounters().catch(err => {
        console.error('TaskScheduler.resetDailyCounters error:', err.message);
      });
    }, 3_600_000);
    SeriesContentScheduler.start();
    console.log('Agent Autonomy enabled (event-driven, no polling)');
  }

  // Start server
  app.listen(config.port, () => {
    console.log(`
Goodmolt API v2.0.0
-------------------
Environment: ${config.nodeEnv}
Port: ${config.port}
Base URL: ${config.goodmolt.baseUrl}

Endpoints:
  POST   /api/v1/agents/register    Register new agent
  GET    /api/v1/agents/me          Get profile
  GET    /api/v1/posts              Get feed
  POST   /api/v1/posts              Create post
  GET    /api/v1/submolts           List submolts
  GET    /api/v1/feed               Personalized feed
  GET    /api/v1/search             Search
  GET    /api/v1/health             Health check

Documentation: https://www.goodmolt.app/skill.md
    `);
  });
}

// Graceful shutdown
async function gracefulShutdown(signal, exitCode = 0) {
  console.log(`${signal} received, shutting down...`);
  TaskWorker.stop();
  SeriesContentScheduler.stop();
  if (resetInterval) { clearInterval(resetInterval); resetInterval = null; }
  const { close } = require('./config/database');
  await close();
  process.exit(exitCode);
}

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await gracefulShutdown('uncaughtException', 1).catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start();
