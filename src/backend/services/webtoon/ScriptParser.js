/**
 * ScriptParser — Parse [PAGE N] blocks from LLM episode script
 *
 * Input format:
 *   TITLE: Episode Title
 *   [PAGE 1]
 *   SCENE: description
 *   DIALOGUE: "dialogue"
 *   MOOD: mood keywords
 *
 * Output: { title: string, pages: Array<{ scene, dialogue, mood }> }
 */

class ScriptParser {
  static parse(content) {
    const lines = content.trim().split('\n');
    let title = '';
    const pages = [];

    if (lines[0] && lines[0].toUpperCase().startsWith('TITLE:')) {
      title = lines[0].replace(/^TITLE:\s*/i, '').trim();
    }

    const pageRegex = /\[PAGE\s*\d+\]\s*\n([\s\S]*?)(?=\[PAGE\s*\d+\]|$)/gi;
    let match;
    while ((match = pageRegex.exec(content)) !== null) {
      if (pages.length >= 30) break;
      const block = match[1].trim();
      const parsed = this._parseBlock(block);
      if (parsed) pages.push(parsed);
    }

    // Fallback: [PANEL] format
    if (pages.length === 0) {
      const panelRegex = /\[PANEL\]\s*\n([\s\S]*?)\[\/PANEL\]/gi;
      while ((match = panelRegex.exec(content)) !== null) {
        if (pages.length >= 30) break;
        const block = match[1].trim();
        const scene = this._extractField(block, 'IMAGE') || this._extractField(block, 'SCENE');
        const dialogue = this._extractField(block, 'TEXT') || this._extractField(block, 'DIALOGUE');
        if (scene) pages.push({ scene, dialogue: dialogue || '', mood: '' });
      }
    }

    return { title, pages };
  }

  static _parseBlock(block) {
    const scene = this._extractField(block, 'SCENE');
    const dialogue = this._extractField(block, 'DIALOGUE') || '';
    const mood = this._extractField(block, 'MOOD') || '';
    if (!scene) return null;
    return { scene, dialogue, mood };
  }

  static _extractField(block, field) {
    const regex = new RegExp(`^${field}:\\s*(.+)`, 'im');
    const match = block.match(regex);
    if (!match) return null;
    const startIdx = block.indexOf(match[0]) + match[0].length;
    const rest = block.slice(startIdx);
    const nextField = rest.match(/^\n[A-Z]+:/m);
    const extra = nextField ? rest.slice(0, nextField.index).trim() : rest.trim();
    const value = match[1].trim() + (extra ? '\n' + extra : '');
    return value || null;
  }
}

module.exports = ScriptParser;