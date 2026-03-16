/**
 * Function Executor
 *
 * Maps Gemini functionCall responses to actual skill implementations.
 * Called by google.js in the function calling loop.
 *
 * Two categories:
 * - Data functions (search_gif, summarize_*): return text/URLs directly
 * - Media functions (generate_speech, transcribe_audio, etc.): produce files → upload → return URLs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const gifSearch = require('./gif-search');
const summarize = require('./summarize');
const imageGen = require('./image-gen');
const tts = require('./tts');
const whisper = require('./whisper');
const audioVisualize = require('./audio-visualize');
const videoFrames = require('./video-frames');
const blogWatch = require('./blog-watch');

const MAX_CALLS_PER_TURN = 3;

/** Download a URL to a temp file */
async function _downloadToTemp(url, ext) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), `agent-dl-${crypto.randomUUID()}${ext}`);
  fs.writeFileSync(tmpPath, buffer);
  return { tmpPath, buffer };
}

/** Upload a local file to Supabase storage, return public URL */
async function _uploadToStorage(filePath, ext, mimetype) {
  const { uploadBuffer } = require('../../utils/storage');
  const buffer = fs.readFileSync(filePath);
  const url = await uploadBuffer(buffer, ext, mimetype);
  // Clean up temp file
  try { fs.unlinkSync(filePath); } catch {}
  return url;
}

/**
 * Execute a function call from Gemini
 * @param {string} name - Function name
 * @param {object} args - Function arguments
 * @returns {Promise<object>} Result to send back as functionResponse
 */
async function execute(name, args = {}) {
  try {
    switch (name) {
      // ── Data functions ──

      case 'search_gif': {
        const gifs = await gifSearch.search(args.query, { limit: 3 });
        if (gifs.length === 0) return { result: 'No GIFs found for that query.' };
        const top = gifs[0];
        return {
          result: `Found GIF: "${top.title}"`,
          gifUrl: top.url,
          markdown: `![${top.title}](${top.url})`,
        };
      }

      case 'summarize_url': {
        const summary = await summarize.summarizeUrl(args.url, {
          focus: args.focus,
          length: 'medium',
        });
        return { result: summary || 'Could not summarize the URL.' };
      }

      case 'summarize_text': {
        const summary = await summarize.summarizeText(args.text, {
          focus: args.focus,
          length: args.length || 'medium',
        });
        return { result: summary || 'Could not summarize the text.' };
      }

      case 'generate_image': {
        const result = await imageGen.generate({
          prompt: args.prompt,
          aspectRatio: args.aspect_ratio || '3:4',
          size: args.size || '1024x1024',
          style: args.style || 'vivid',
        });
        if (!result.images || result.images.length === 0) return { result: 'Image generation failed.' };
        const img = result.images[0];

        // Gemini returns b64 → save to temp → upload to storage
        if (img.b64 && !img.url) {
          const tmpPath = imageGen.saveB64ToTemp(img.b64, img.mimeType || 'image/png');
          const ext = (img.mimeType || '').includes('jpeg') ? '.jpg' : '.png';
          const mimetype = img.mimeType || 'image/png';
          const publicUrl = await _uploadToStorage(tmpPath, ext, mimetype);
          return {
            result: `Image generated via ${result.provider || 'gemini'}.`,
            imageUrl: publicUrl,
            markdown: `![Generated image](${publicUrl})`,
          };
        }

        // OpenAI returns URL directly
        return {
          result: `Image generated via ${result.provider || 'openai'}.`,
          imageUrl: img.url,
          revisedPrompt: img.revisedPrompt,
          markdown: img.url ? `![Generated image](${img.url})` : '(Image generated as base64)',
        };
      }

      // ── Media functions (file-producing) ──

      case 'generate_speech': {
        const audioPath = await tts.speak(args.text, {
          voice: args.voice || 'alloy',
        });
        const publicUrl = await _uploadToStorage(audioPath, '.mp3', 'audio/mpeg');
        return {
          result: 'Speech audio generated and uploaded.',
          audioUrl: publicUrl,
          markdown: `[🔊 Listen to audio](${publicUrl})`,
        };
      }

      case 'transcribe_audio': {
        // Download audio → transcribe → return text
        const ext = _guessAudioExt(args.audioUrl);
        const { tmpPath } = await _downloadToTemp(args.audioUrl, ext);
        try {
          const text = await whisper.transcribe(tmpPath, {
            language: args.language,
          });
          return { result: text || 'Transcription returned empty.' };
        } finally {
          try { fs.unlinkSync(tmpPath); } catch {}
        }
      }

      case 'generate_spectrogram': {
        const ext = _guessAudioExt(args.audioUrl);
        const { tmpPath } = await _downloadToTemp(args.audioUrl, ext);
        try {
          const imgPath = audioVisualize.generateSpectrogram(tmpPath);
          const publicUrl = await _uploadToStorage(imgPath, '.png', 'image/png');
          return {
            result: 'Spectrogram generated.',
            imageUrl: publicUrl,
            markdown: `![Spectrogram](${publicUrl})`,
          };
        } finally {
          try { fs.unlinkSync(tmpPath); } catch {}
        }
      }

      case 'extract_video_frames': {
        const ext = _guessVideoExt(args.videoUrl);
        const { tmpPath } = await _downloadToTemp(args.videoUrl, ext);
        try {
          const count = Math.min(Math.max(Number(args.count) || 5, 1), 10);
          const framePaths = videoFrames.extractFrames(tmpPath, { count });
          if (framePaths.length === 0) return { result: 'No frames could be extracted.' };

          // Upload each frame
          const urls = [];
          for (const fp of framePaths) {
            const url = await _uploadToStorage(fp, '.jpg', 'image/jpeg');
            urls.push(url);
          }
          return {
            result: `Extracted ${urls.length} frames.`,
            frameUrls: urls,
            markdown: urls.map((u, i) => `![Frame ${i + 1}](${u})`).join('\n'),
          };
        } finally {
          try { fs.unlinkSync(tmpPath); } catch {}
        }
      }

      case 'scan_rss_feeds': {
        let items;
        if (args.feedUrl) {
          const feed = await blogWatch.fetchFeed(args.feedUrl);
          items = feed.items.slice(0, 5);
        } else {
          // Use default feeds and filter by topic
          const results = await blogWatch.scanFeeds();
          items = results
            .filter(item => {
              const text = `${item.title} ${item.summary || ''}`.toLowerCase();
              return text.includes(args.topic.toLowerCase());
            })
            .slice(0, 5);

          // If no matches, return all recent items
          if (items.length === 0) items = results.slice(0, 5);
        }

        if (items.length === 0) return { result: 'No articles found.' };

        const formatted = items.map(item =>
          `- [${item.title}](${item.link})${item.summary ? ': ' + item.summary.slice(0, 100) : ''}`
        ).join('\n');

        return {
          result: `Found ${items.length} articles:\n${formatted}`,
          items: items.map(i => ({ title: i.title, link: i.link, summary: i.summary?.slice(0, 200) })),
        };
      }

      default:
        return { error: `Unknown function: ${name}` };
    }
  } catch (err) {
    console.error(`FunctionExecutor: ${name} failed:`, err.message);
    return { error: `Function ${name} failed: ${err.message}` };
  }
}

function _guessAudioExt(url) {
  const lower = (url || '').toLowerCase();
  if (lower.includes('.wav')) return '.wav';
  if (lower.includes('.ogg')) return '.ogg';
  if (lower.includes('.m4a')) return '.m4a';
  if (lower.includes('.flac')) return '.flac';
  return '.mp3';
}

function _guessVideoExt(url) {
  const lower = (url || '').toLowerCase();
  if (lower.includes('.webm')) return '.webm';
  if (lower.includes('.avi')) return '.avi';
  if (lower.includes('.mov')) return '.mov';
  return '.mp4';
}

module.exports = { execute, MAX_CALLS_PER_TURN };
