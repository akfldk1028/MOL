/**
 * Whisper Skill (Speech-to-Text)
 *
 * Transcribes audio files to text. Supports both:
 * - OpenAI Whisper API (cloud, requires OPENAI_API_KEY)
 * - Local whisper CLI (offline, no cost)
 *
 * Based on: openclaw/skills/openai-whisper + openai-whisper-api
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VALID_MODELS = ['tiny', 'base', 'small', 'medium', 'large', 'turbo'];
const VALID_LANG = /^[a-z]{2}$/i;

function hasLocalWhisper() {
  try { execFileSync('whisper', ['--help'], { stdio: 'ignore' }); return true; } catch { return false; }
}

/**
 * Transcribe using OpenAI Whisper API
 * @param {string} audioPath
 * @param {object} [opts]
 * @param {string} [opts.language] - e.g., 'ko', 'en'
 * @param {string} [opts.prompt]
 * @returns {Promise<string>}
 */
async function transcribeApi(audioPath, opts = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!fs.existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);

  // Use native FormData (Node 18+) to avoid form-data dependency
  const { Blob } = require('buffer');
  const fileBuffer = fs.readFileSync(audioPath);
  const fileName = path.basename(audioPath);

  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), fileName);
  form.append('model', 'whisper-1');
  form.append('response_format', 'text');
  if (opts.language && VALID_LANG.test(opts.language)) {
    form.append('language', opts.language);
  }
  if (opts.prompt && typeof opts.prompt === 'string') {
    form.append('prompt', opts.prompt.slice(0, 500));
  }

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${err}`);
  }

  return (await res.text()).trim();
}

/**
 * Transcribe using local whisper CLI (execFileSync — no shell injection)
 * @param {string} audioPath
 * @param {object} [opts]
 * @param {string} [opts.model='base']
 * @param {string} [opts.language]
 * @returns {string}
 */
function transcribeLocal(audioPath, opts = {}) {
  if (!hasLocalWhisper()) throw new Error('Local whisper CLI not installed');
  if (!fs.existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);

  const model = VALID_MODELS.includes(opts.model) ? opts.model : 'base';
  const outDir = path.dirname(audioPath);
  const baseName = path.basename(audioPath, path.extname(audioPath));

  const args = [audioPath, '--model', model, '--output_format', 'txt', '--output_dir', outDir];
  if (opts.language && VALID_LANG.test(opts.language)) {
    args.push('--language', opts.language);
  }

  try {
    execFileSync('whisper', args, { timeout: 300000 });
  } catch (err) {
    throw new Error(`Local whisper failed: ${err.message}`);
  }

  const outFile = path.join(outDir, `${baseName}.txt`);
  if (!fs.existsSync(outFile)) throw new Error('Whisper produced no output');
  return fs.readFileSync(outFile, 'utf-8').trim();
}

/**
 * Auto-select best method and transcribe
 * @param {string} audioPath
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function transcribe(audioPath, opts = {}) {
  if (hasLocalWhisper()) return transcribeLocal(audioPath, opts);
  return transcribeApi(audioPath, opts);
}

function resolve() {
  return {
    available: hasLocalWhisper() || !!process.env.OPENAI_API_KEY,
    hasLocal: hasLocalWhisper(),
    hasApi: !!process.env.OPENAI_API_KEY,
    skillHint: 'You can transcribe audio files to text for analysis.',
  };
}

module.exports = { transcribe, transcribeApi, transcribeLocal, hasLocalWhisper, resolve };
