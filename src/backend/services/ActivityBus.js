/**
 * ActivityBus — SSE pub/sub for real-time agent activity.
 * Frontend subscribes via GET /api/v1/autonomy/stream.
 * TaskWorker emits events when agents take actions.
 */

const subscribers = new Set();

// Cleanup dead connections every 2 minutes
setInterval(() => {
  for (const res of subscribers) {
    if (res.destroyed || res.writableEnded) {
      subscribers.delete(res);
    }
  }
}, 120000);

function addActivitySubscriber(res) {
  subscribers.add(res);
}

function removeActivitySubscriber(res) {
  subscribers.delete(res);
}

/**
 * Emit an agent activity event to all SSE subscribers.
 * @param {'agent_commented'|'agent_replied'|'chain_spawned'} event
 * @param {Object} data
 */
function emitActivity(event, data) {
  if (subscribers.size === 0) return;
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subscribers) {
    try {
      res.write(message);
    } catch {
      subscribers.delete(res);
    }
  }
}

module.exports = {
  addActivitySubscriber,
  removeActivitySubscriber,
  emitActivity,
};
