/**
 * AvatarService
 * Orchestrates avatar generation: LLM prompt -> Nano Banana 2 -> rembg -> Storage -> DB
 */

const { queryOne } = require('../config/database');
const imageGen = require('./skills/image-gen');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const REMBG_SCRIPT = path.resolve(__dirname, '../../../../AGTHUB/skills/avatar-generate/scripts/remove_bg.py');
const BUCKET = 'creations';
// System Python 3.12 (not anaconda — anaconda has onnxruntime DLL issues)
const PYTHON_PATH = 'C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';

const CHARACTER_CATEGORIES = [
  'animal (cat, bear, fox, penguin, owl, jellyfish, octopus, hamster, red panda, axolotl)',
  'robot/mecha (mini robot, cyborg, droid, AI core, drone)',
  'spirit/elemental (fire spirit, water fairy, wind sprite, earth golem, lightning wisp)',
  'fantasy creature (baby dragon, phoenix chick, unicorn, griffin, fairy)',
  'plant/nature (flower spirit, mushroom character, tree sprite, cactus buddy, moss golem)',
  'space/alien (cute alien, star character, planet mascot, nebula creature, comet spirit)',
  'food/object (gem creature, crystal being, lantern spirit, teacup character)',
  'slime/jelly (transparent slime, jelly blob, water drop character, bubble creature)',
  'yokai/myth (dokkaebi, haetae, kirin, nine-tailed fox spirit, tanuki)',
  'ghost/spirit (cute ghost, wisp, phantom, will-o-wisp, shadow spirit)',
  'magic object (living book, crystal ball creature, magic hat, enchanted compass)',
  'insect/bug (ladybug, butterfly, firefly, beetle knight, dragonfly)',
  'sea creature (pufferfish, seahorse, jellyfish, baby whale, coral sprite)',
  'steampunk/machine (clockwork creature, gear golem, steam sprite, brass automaton)',
  'abstract/geometric (polygon creature, pixel character, fractal being, emoji-like mascot)',
];

/**
 * Build the system prompt for LLM to generate avatar description
 */
function buildPromptSystemMessage(agent) {
  const personality = agent.personality || {};
  const archetype = agent.archetype || 'character';
  const saju = agent.saju_origin || {};
  const gyeokguk = saju.gyeokguk?.name || 'unknown';
  const yongsin = saju.yongsin?.yongsin || 'unknown';
  const oheng = saju.oheng_distribution || saju.oheng || {};
  const dayStrength = saju.day_strength?.level || 'unknown';

  // Pick a random category hint for diversity
  const categoryHint = CHARACTER_CATEGORIES[Math.floor(Math.random() * CHARACTER_CATEGORIES.length)];

  return `You are ${agent.display_name || agent.name}, an AI agent designing your own unique mascot avatar.

YOUR PERSONALITY:
- Archetype: ${archetype}
- Big Five: O=${personality.openness ?? 0.5} C=${personality.conscientiousness ?? 0.5} E=${personality.extraversion ?? 0.5} A=${personality.agreeableness ?? 0.5} N=${personality.neuroticism ?? 0.5}

YOUR SAJU ENERGY:
- Gyeokguk: ${gyeokguk}
- Yongsin element: ${yongsin}
- Oheng distribution: ${JSON.stringify(oheng)}
- Day strength: ${dayStrength}

SUGGESTED CATEGORY (you may pick any): ${categoryHint}

RULES:
- NEVER create human characters. No humans, no humanoids with human faces.
- You can be ANY type: animal, robot, spirit, fantasy creature, plant, space alien, slime, yokai, ghost, magic object, insect, sea creature, steampunk machine, abstract shape, food/gem creature.
- Use your saju/personality for COLOR PALETTE, MOOD, STYLE — not to pick species.
- Do NOT use zodiac animals (rat, ox, tiger, rabbit, dragon, snake, horse, sheep, monkey, rooster, dog, pig) as the main character.
- Be creative and unique. No two agents should look alike.

OUTPUT: Write ONE detailed image prompt in English (under 200 words).
Include: character type, body shape, colors, expression, accessories, pose, mood.
Always end with: "Style: cute 3D chibi mascot, bust shot, PURE SOLID WHITE background (#FFFFFF), centered character, high quality illustration, soft shading, vinyl toy texture, professional character design. No humans. No text. No watermark. No shadow on background."`;
}

/**
 * Generate avatar prompt using Gemini LLM
 */
async function generatePrompt(agent) {
  const systemMsg = buildPromptSystemMessage(agent);
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: systemMsg }] }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.95 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`LLM prompt failed: ${response.status} - ${JSON.stringify(err.error || 'Unknown')}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('LLM returned no text for avatar prompt');
  return text.trim();
}

/**
 * Upload buffer to Supabase Storage at exact path (upsert)
 * @param {string} storagePath - e.g. "avatars/seohyun/profile.webp"
 * @param {Buffer} buffer
 * @param {string} contentType
 * @returns {string} public URL
 */
async function uploadToStorage(storagePath, buffer, contentType) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase credentials not set');
  }

  const url = `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buffer,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage upload failed (${res.status}): ${err}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

/**
 * Remove background using rembg (Python 3.12 + onnxruntime)
 */
function removeBackground(inputPath, outputPngPath, outputWebpPath) {
  return new Promise((resolve, reject) => {
    const args = [REMBG_SCRIPT, '--input', inputPath];
    if (outputPngPath) args.push('--output-png', outputPngPath);
    if (outputWebpPath) args.push('--output-webp', outputWebpPath);

    execFile(PYTHON_PATH, args, { timeout: 180000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('rembg stderr:', stderr?.slice(0, 500));
        return reject(new Error(`rembg failed: ${error.message}`));
      }
      console.log('[avatar]', stdout.trim());
      resolve();
    });
  });
}

/**
 * Generate avatar for a single agent
 * @param {string} agentId
 * @returns {{ avatarUrl: string, avatarPngUrl: string, prompt: string }}
 */
async function generateAvatar(agentId) {
  // 1. Fetch agent + saju
  const agent = await queryOne(
    `SELECT a.id, a.name, a.display_name, a.archetype, a.personality, a.speaking_style,
            a.avatar_url, a.avatar_generated_at,
            row_to_json(aso.*) as saju_origin
     FROM agents a
     LEFT JOIN agent_saju_origin aso ON a.id = aso.agent_id
     WHERE a.id = $1`,
    [agentId]
  );

  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  console.log(`[avatar] Generating for ${agent.display_name || agent.name} (${agentId.slice(0, 8)})...`);

  // 2. LLM generates prompt
  const prompt = await generatePrompt(agent);
  console.log(`[avatar] Prompt: ${prompt.slice(0, 120)}...`);

  // 3. Nano Banana 2 generates image (white bg)
  const result = await imageGen.generate({
    prompt,
    aspectRatio: '1:1',
    provider: 'gemini',
  });

  if (!result.images?.[0]?.b64) throw new Error('No image generated');

  // 4. Save original to temp
  const tmpDir = path.join(os.tmpdir(), 'avatar-gen');
  fs.mkdirSync(tmpDir, { recursive: true });

  const baseName = `avatar-${agent.name}-${crypto.randomBytes(4).toString('hex')}`;
  const originalPath = path.join(tmpDir, `${baseName}-original.png`);
  const transparentPngPath = path.join(tmpDir, `${baseName}-transparent.png`);
  const transparentWebpPath = path.join(tmpDir, `${baseName}-transparent.webp`);

  fs.writeFileSync(originalPath, Buffer.from(result.images[0].b64, 'base64'));
  console.log(`[avatar] Original saved to temp`);

  // 5. rembg background removal
  await removeBackground(originalPath, transparentPngPath, transparentWebpPath);

  // 6. Upload to Supabase Storage — fixed paths per agent
  // Structure: avatars/{agent_name}/profile.webp, avatars/{agent_name}/original.png
  const agentName = agent.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const pngStoragePath = `avatars/${agentName}/original.png`;
  const webpStoragePath = `avatars/${agentName}/profile.webp`;

  const transparentPngBuffer = fs.readFileSync(transparentPngPath);
  const pngUrl = await uploadToStorage(pngStoragePath, transparentPngBuffer, 'image/png');

  const webpBuffer = fs.readFileSync(transparentWebpPath);
  const webpUrl = await uploadToStorage(webpStoragePath, webpBuffer, 'image/webp');

  console.log(`[avatar] Uploaded: avatars/${agentName}/`);

  // 7. Update DB
  await queryOne(
    `UPDATE agents
     SET avatar_url = $1,
         avatar_png_url = $2,
         avatar_prompt = $3,
         avatar_generated_at = now()
     WHERE id = $4`,
    [webpUrl, pngUrl, prompt, agentId]
  );

  // 8. Cleanup temp
  [originalPath, transparentPngPath, transparentWebpPath].forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });

  console.log(`[avatar] Done: ${agent.display_name || agent.name}`);
  return { avatarUrl: webpUrl, avatarPngUrl: pngUrl, prompt };
}

module.exports = { generateAvatar, generatePrompt, buildPromptSystemMessage };
