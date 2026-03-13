/**
 * TTS Skill (Text-to-Speech)
 *
 * Converts text to speech audio. Agents can narrate critiques,
 * read story excerpts, or generate audio previews.
 *
 * Supports:
 * - OpenAI TTS API (cloud, high quality)
 * - sherpa-onnx local TTS (offline, free)
 *
 * Based on: openclaw/skills/sherpa-onnx-tts
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse'];
const VALID_MODELS = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'];

function hasLocalTts() {
  const runtimeDir = process.env.SHERPA_ONNX_RUNTIME_DIR;
  const modelDir = process.env.SHERPA_ONNX_MODEL_DIR;
  return !!(runtimeDir && modelDir);
}

function uniquePath(ext) {
  return path.join(os.tmpdir(), `tts-${crypto.randomUUID()}.${ext}`);
}

/**
 * Generate speech using OpenAI TTS API
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.voice='alloy']
 * @param {string} [opts.model='tts-1']
 * @param {string} [opts.outputPath]
 * @returns {Promise<string>} Path to audio file
 */
async function speakApi(text, opts = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!text || typeof text !== 'string') throw new Error('Text is required');

  const voice = VALID_VOICES.includes(opts.voice) ? opts.voice : 'alloy';
  const model = VALID_MODELS.includes(opts.model) ? opts.model : 'tts-1';
  const outputPath = opts.outputPath || uniquePath('mp3');

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: text.slice(0, 4096), voice }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI TTS error (${res.status}): ${err}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/**
 * Generate speech using local sherpa-onnx (execFileSync — no shell injection)
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.outputPath]
 * @returns {string} Path to wav file
 */
function speakLocal(text, opts = {}) {
  if (!hasLocalTts()) throw new Error('sherpa-onnx not configured');
  if (!text || typeof text !== 'string') throw new Error('Text is required');

  const outputPath = opts.outputPath || uniquePath('wav');
  const runtimeDir = process.env.SHERPA_ONNX_RUNTIME_DIR;
  const modelDir = process.env.SHERPA_ONNX_MODEL_DIR;

  const binName = process.platform === 'win32' ? 'sherpa-onnx-offline-tts.exe' : 'sherpa-onnx-offline-tts';
  const bin = path.join(runtimeDir, 'bin', binName);
  if (!fs.existsSync(bin)) throw new Error(`TTS binary not found: ${bin}`);

  const modelFile = fs.readdirSync(modelDir).find(f => f.endsWith('.onnx'));
  const tokensFile = path.join(modelDir, 'tokens.txt');
  const dataDir = path.join(modelDir, 'espeak-ng-data');
  if (!modelFile) throw new Error('No .onnx model found in model dir');

  try {
    // execFileSync — args are NOT passed through shell, no injection possible
    execFileSync(bin, [
      `--vits-model=${path.join(modelDir, modelFile)}`,
      `--vits-tokens=${tokensFile}`,
      `--vits-data-dir=${dataDir}`,
      `--output-filename=${outputPath}`,
      text.slice(0, 4096),
    ], { timeout: 60000 });
  } catch (err) {
    throw new Error(`Local TTS failed: ${err.message}`);
  }

  return outputPath;
}

async function speak(text, opts = {}) {
  if (hasLocalTts()) return speakLocal(text, opts);
  return speakApi(text, opts);
}

function resolve() {
  return {
    available: hasLocalTts() || !!process.env.OPENAI_API_KEY,
    hasLocal: hasLocalTts(),
    hasApi: !!process.env.OPENAI_API_KEY,
    skillHint: 'You can convert text to speech audio for narrations, story readings, or critique audio.',
  };
}

module.exports = { speak, speakApi, speakLocal, hasLocalTts, resolve };
