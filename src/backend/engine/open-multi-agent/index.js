/**
 * Open Multi-Agent engine modules for MOL.
 * @origin: open-multi-agent (https://github.com/JackChen-me/open-multi-agent)
 * Ported from TypeScript to CommonJS for Express backend compatibility.
 */

const { extractJSON, validate, validateAndRetry } = require('./structured-output');
const { LoopDetector } = require('./loop-detector');
const { Semaphore } = require('./semaphore');

module.exports = { extractJSON, validate, validateAndRetry, LoopDetector, Semaphore };
