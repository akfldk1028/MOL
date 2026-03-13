/**
 * Video Frames Skill
 *
 * Extracts frames from videos using ffmpeg.
 * Used by webtoon/screenplay agents to extract keyframes for analysis.
 *
 * Based on: openclaw/skills/video-frames
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VALID_TIME = /^\d{1,2}:\d{2}:\d{2}(\.\d+)?$/;

function isAvailable() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

function validateIndex(idx) {
  const n = Number(idx);
  if (!Number.isInteger(n) || n < 0) throw new Error('Frame index must be a non-negative integer');
  return n;
}

/**
 * Extract a single frame from a video
 * @param {string} videoPath
 * @param {object} [opts]
 * @param {string} [opts.time] - Timestamp (HH:MM:SS or HH:MM:SS.ms)
 * @param {number} [opts.index] - Frame index (0-based)
 * @param {string} [opts.outputPath]
 * @returns {string} Path to extracted frame
 */
function extractFrame(videoPath, opts = {}) {
  if (!isAvailable()) throw new Error('ffmpeg not installed');
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  const outputPath = opts.outputPath || videoPath.replace(/\.[^.]+$/, '-frame.jpg');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  let args;
  if (opts.index !== undefined) {
    const idx = validateIndex(opts.index);
    args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath, '-vf', `select=eq(n\\,${idx})`, '-vframes', '1', outputPath];
  } else if (opts.time) {
    if (!VALID_TIME.test(opts.time)) throw new Error('Invalid time format: use HH:MM:SS');
    args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', opts.time, '-i', videoPath, '-frames:v', '1', outputPath];
  } else {
    args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath, '-vf', 'select=eq(n\\,0)', '-vframes', '1', outputPath];
  }

  try {
    execFileSync('ffmpeg', args, { timeout: 30000 });
  } catch (err) {
    throw new Error(`Frame extraction failed: ${err.message}`);
  }
  return outputPath;
}

/**
 * Extract multiple frames evenly spaced across the video
 * @param {string} videoPath
 * @param {object} [opts]
 * @param {number} [opts.count=5]
 * @param {string} [opts.outputDir]
 * @returns {string[]}
 */
function extractFrames(videoPath, opts = {}) {
  if (!isAvailable()) throw new Error('ffmpeg not installed');
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  const count = Math.min(Math.max(Number(opts.count) || 5, 1), 30);
  const outputDir = opts.outputDir || path.join(path.dirname(videoPath), 'frames');
  fs.mkdirSync(outputDir, { recursive: true });

  let duration;
  try {
    const durationStr = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath
    ], { encoding: 'utf-8', timeout: 10000 }).trim();
    duration = parseFloat(durationStr);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid duration');
  } catch (err) {
    throw new Error(`Cannot read video duration: ${err.message}`);
  }

  const frames = [];
  for (let i = 0; i < count; i++) {
    const time = (duration / (count + 1)) * (i + 1);
    const outPath = path.join(outputDir, `frame-${String(i).padStart(3, '0')}.jpg`);
    try {
      execFileSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(time), '-i', videoPath, '-frames:v', '1', outPath
      ], { timeout: 15000 });
      frames.push(outPath);
    } catch { /* skip failed frame */ }
  }

  return frames;
}

function resolve() {
  return {
    available: isAvailable(),
    skillHint: 'You can extract frames from video files for visual analysis and discussion.',
  };
}

module.exports = { extractFrame, extractFrames, isAvailable, resolve };
