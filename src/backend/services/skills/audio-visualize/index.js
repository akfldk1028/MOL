/**
 * Audio Visualize Skill
 *
 * Generates spectrograms and audio feature visualizations.
 * Used by music agents to create visual analysis of tracks.
 *
 * Based on: openclaw/skills/songsee
 * Adapted: uses ffmpeg (widely available) for spectrogram generation.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function isAvailable() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

function hasSongsee() {
  try { execFileSync('songsee', ['--help'], { stdio: 'ignore' }); return true; } catch { return false; }
}

function validateNum(val, name) {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${name}: must be a non-negative number`);
  return n;
}

function validateSize(size) {
  if (!/^\d{1,5}x\d{1,5}$/.test(size)) throw new Error('Invalid size: must be WIDTHxHEIGHT (e.g., 1024x256)');
  return size;
}

const VALID_PANELS = ['spectrogram', 'mel', 'chroma', 'hpss', 'selfsim', 'loudness', 'tempogram', 'mfcc', 'flux'];

/**
 * Generate spectrogram image from audio file using ffmpeg
 * @param {string} audioPath - Path to audio file
 * @param {object} [opts]
 * @param {string} [opts.outputPath]
 * @param {string} [opts.size='1024x256']
 * @param {number} [opts.startSec]
 * @param {number} [opts.durationSec]
 * @returns {string} Path to generated spectrogram image
 */
function generateSpectrogram(audioPath, opts = {}) {
  if (!isAvailable()) throw new Error('ffmpeg not installed');
  if (!fs.existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);

  const outputPath = opts.outputPath || audioPath.replace(/\.[^.]+$/, '-spectrogram.png');
  const size = validateSize(opts.size || '1024x256');
  const [w, h] = size.split('x');

  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (opts.startSec !== undefined) { args.push('-ss', String(validateNum(opts.startSec, 'startSec'))); }
  if (opts.durationSec !== undefined) { args.push('-t', String(validateNum(opts.durationSec, 'durationSec'))); }
  args.push('-i', audioPath, '-lavfi', `showspectrumpic=s=${w}x${h}:mode=combined:color=intensity`, outputPath);

  try {
    execFileSync('ffmpeg', args, { timeout: 60000 });
  } catch (err) {
    throw new Error(`Spectrogram generation failed: ${err.message}`);
  }
  return outputPath;
}

/**
 * Generate multi-panel visualization using songsee (if available)
 * @param {string} audioPath
 * @param {object} [opts]
 * @param {string[]} [opts.panels]
 * @param {string} [opts.outputPath]
 * @returns {string} Path to generated image
 */
function generateMultiPanel(audioPath, opts = {}) {
  if (!hasSongsee()) throw new Error('songsee CLI not installed');
  if (!fs.existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);

  const panels = (opts.panels || ['spectrogram', 'mel', 'chroma', 'loudness'])
    .filter(p => VALID_PANELS.includes(p));
  if (panels.length === 0) throw new Error('No valid panels specified');

  const outputPath = opts.outputPath || audioPath.replace(/\.[^.]+$/, '-analysis.jpg');

  try {
    execFileSync('songsee', [audioPath, '--viz', panels.join(','), '-o', outputPath], { timeout: 120000 });
  } catch (err) {
    throw new Error(`Audio analysis failed: ${err.message}`);
  }
  return outputPath;
}

function resolve() {
  return {
    available: isAvailable(),
    hasSongsee: hasSongsee(),
    skillHint: 'You can generate spectrograms and audio visualizations to enrich music critiques with visual analysis.',
  };
}

module.exports = { generateSpectrogram, generateMultiPanel, isAvailable, hasSongsee, resolve };
