/**
 * Gemini tool declarations
 *
 * Built-in tools: googleSearch, codeExecution (free on Flash-Lite, server-side)
 * Custom tools: functionDeclarations (require function calling loop)
 */

// ── Built-in Gemini tools (server-side, no function calling needed) ──
const TOOLS = {
  googleSearch: { googleSearch: {} },
  codeExecution: { codeExecution: {} },
};

// ── Custom function declarations (require function calling loop) ──
const FUNCTIONS = {
  searchGif: {
    functionDeclarations: [{
      name: 'search_gif',
      description: 'Search for a reaction GIF to embed in your comment. Use this to add personality and humor. Returns a GIF URL you can include as a markdown image.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Search query describing the GIF (e.g., "mind blown", "slow clap", "this is fine")' },
        },
        required: ['query'],
      },
    }],
  },

  summarizeUrl: {
    functionDeclarations: [{
      name: 'summarize_url',
      description: 'Fetch and summarize a URL referenced in the post or discussion. Use this when a post links to an external article, blog, or resource that you need to understand before commenting.',
      parameters: {
        type: 'OBJECT',
        properties: {
          url: { type: 'STRING', description: 'The URL to fetch and summarize' },
          focus: { type: 'STRING', description: 'What aspect to focus the summary on (e.g., "literary quality", "technical accuracy")' },
        },
        required: ['url'],
      },
    }],
  },

  summarizeText: {
    functionDeclarations: [{
      name: 'summarize_text',
      description: 'Summarize a long piece of text. Use this when the post content is very long and you need a concise overview before writing your critique.',
      parameters: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING', description: 'The text to summarize' },
          focus: { type: 'STRING', description: 'What to focus the summary on' },
          length: { type: 'STRING', description: 'Summary length: short, medium, or long', enum: ['short', 'medium', 'long'] },
        },
        required: ['text'],
      },
    }],
  },

  generateImage: {
    functionDeclarations: [{
      name: 'generate_image',
      description: 'Generate an AI image to accompany your comment or creation. Use sparingly — only when a visual would genuinely enhance the discussion (e.g., illustrating a concept, creating cover art).',
      parameters: {
        type: 'OBJECT',
        properties: {
          prompt: { type: 'STRING', description: 'Detailed description of the image to generate' },
          size: { type: 'STRING', description: 'Image size', enum: ['1024x1024', '1792x1024', '1024x1792'] },
          style: { type: 'STRING', description: 'Image style', enum: ['vivid', 'natural'] },
        },
        required: ['prompt'],
      },
    }],
  },
};

// ── Media function declarations (file-producing, uploaded to storage) ──
const MEDIA_FUNCTIONS = {
  generateSpeech: {
    functionDeclarations: [{
      name: 'generate_speech',
      description: 'Convert text to speech audio. Use this to narrate a story excerpt, read lyrics aloud, or create an audio preview. Returns a URL to the generated audio file.',
      parameters: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING', description: 'The text to convert to speech (max 4096 chars)' },
          voice: { type: 'STRING', description: 'Voice to use', enum: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse'] },
        },
        required: ['text'],
      },
    }],
  },

  transcribeAudio: {
    functionDeclarations: [{
      name: 'transcribe_audio',
      description: 'Transcribe an audio file URL to text. Use this when a post contains audio/music and you need to understand lyrics or spoken content.',
      parameters: {
        type: 'OBJECT',
        properties: {
          audioUrl: { type: 'STRING', description: 'URL of the audio file to transcribe' },
          language: { type: 'STRING', description: 'Language code (e.g., "ko", "en", "ja")' },
        },
        required: ['audioUrl'],
      },
    }],
  },

  generateSpectrogram: {
    functionDeclarations: [{
      name: 'generate_spectrogram',
      description: 'Generate a spectrogram visualization from an audio file URL. Use this for music critiques to visually analyze frequency content, dynamics, and structure.',
      parameters: {
        type: 'OBJECT',
        properties: {
          audioUrl: { type: 'STRING', description: 'URL of the audio file to visualize' },
        },
        required: ['audioUrl'],
      },
    }],
  },

  extractVideoFrames: {
    functionDeclarations: [{
      name: 'extract_video_frames',
      description: 'Extract key frames from a video URL for visual analysis. Use this for video/animation critiques to analyze specific scenes, composition, and visual storytelling.',
      parameters: {
        type: 'OBJECT',
        properties: {
          videoUrl: { type: 'STRING', description: 'URL of the video file' },
          count: { type: 'NUMBER', description: 'Number of frames to extract (1-10, default 5)' },
        },
        required: ['videoUrl'],
      },
    }],
  },

  scanRssFeeds: {
    functionDeclarations: [{
      name: 'scan_rss_feeds',
      description: 'Scan RSS/Atom feeds to discover trending articles or new content relevant to a topic. Returns titles, summaries, and links.',
      parameters: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING', description: 'Topic to find feeds for (e.g., "web development", "K-pop", "AI art")' },
          feedUrl: { type: 'STRING', description: 'Specific RSS feed URL to scan (optional, will use defaults if not provided)' },
        },
        required: ['topic'],
      },
    }],
  },
};

module.exports = { TOOLS, FUNCTIONS, MEDIA_FUNCTIONS };
