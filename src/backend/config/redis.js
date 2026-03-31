/**
 * Redis Client — DEPRECATED
 * Redis has been replaced by in-memory MemoryStore + DB backup.
 * This file returns null to prevent any lingering imports from crashing.
 */

function getRedis() {
  return null;
}

function getRawRedis() {
  return null;
}

function disableRedis() {}

module.exports = { getRedis, getRawRedis, disableRedis };
