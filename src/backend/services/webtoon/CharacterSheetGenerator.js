/**
 * CharacterSheetGenerator
 * Generates character reference sheets (front/side/full) via Nano Banana + rembg
 * Called when a new series is created, before first episode.
 */

const imageGen = require('../skills/image-gen');
const { uploadBuffer, buildAgentSeriesPath } = require('../../utils/storage');
const CharacterSheetService = require('./character/CharacterSheetService');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const REMBG_SCRIPT = path.resolve(__dirname, '../../../../AGTHUB/skills/avatar-generate/scripts/remove_bg.py');
const PYTHON_PATH = 'C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';

class CharacterSheetGenerator {
  static async generateAll({ seriesId, seriesSlug, agentName, characters }) {
    const results = [];
    for (const char of characters) {
      try {
        const refs = await this._generateOneCharacter({
          agentName, seriesSlug, charName: char.name, description: char.description,
        });
        await CharacterSheetService.createWithRefs(seriesId, {
          name: char.name, description: char.description,
          personality: char.personality || null, visualPrompt: char.description, referenceUrls: refs,
        });
        results.push({ name: char.name, referenceUrls: refs });
        console.log(`CharacterSheet: ${char.name} done (${Object.keys(refs).length} views)`);
      } catch (err) {
        console.error(`CharacterSheet: ${char.name} failed: ${err.message}`);
        results.push({ name: char.name, referenceUrls: {}, error: err.message });
      }
    }
    return results;
  }

  static async _generateOneCharacter({ agentName, seriesSlug, charName, description }) {
    const views = [
      { key: 'front', prompt: `${description}, character sheet, front view, white background, full color, clean lines`, aspect: '1:1' },
      { key: 'side', prompt: `${description}, character sheet, side profile view, white background, full color, clean lines`, aspect: '1:1' },
      { key: 'full', prompt: `${description}, character sheet, full body standing pose, white background, full color, clean lines`, aspect: '3:4' },
    ];
    const refs = {};
    const safeCharName = charName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();

    for (const view of views) {
      const result = await imageGen.generate({ prompt: view.prompt, aspectRatio: view.aspect });
      const img = result.images?.[0];
      if (!img?.b64) continue;
      const cleanBuffer = await this._removeBackground(Buffer.from(img.b64, 'base64'));
      const storagePath = buildAgentSeriesPath(agentName, {
        seriesSlug, subfolder: 'characters', filename: `${safeCharName}_${view.key}.webp`,
      });
      const url = await uploadBuffer(cleanBuffer, '.webp', 'image/webp', null, { fullPath: storagePath });
      refs[view.key] = url;
    }
    return refs;
  }

  static _removeBackground(inputBuffer) {
    return new Promise((resolve) => {
      const tmpIn = path.join(os.tmpdir(), `charsheet-in-${crypto.randomUUID()}.png`);
      const tmpOut = path.join(os.tmpdir(), `charsheet-out-${crypto.randomUUID()}.png`);
      fs.writeFileSync(tmpIn, inputBuffer);
      execFile(PYTHON_PATH, [REMBG_SCRIPT, tmpIn, tmpOut], { timeout: 60000 }, (err) => {
        try {
          if (err) {
            console.warn('CharacterSheet: rembg failed, using original:', err.message);
            resolve(inputBuffer);
            return;
          }
          const result = fs.readFileSync(tmpOut);
          resolve(result);
        } finally {
          try { fs.unlinkSync(tmpIn); } catch {}
          try { fs.unlinkSync(tmpOut); } catch {}
        }
      });
    });
  }
}

module.exports = CharacterSheetGenerator;