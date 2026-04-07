/**
 * Loop Detector — catches stuck agents repeating same tool calls or text.
 * @origin: open-multi-agent/src/agent/loop-detector.ts
 */

class LoopDetector {
  constructor(config = {}) {
    this._maxRepeats = config.maxRepeats ?? 3;
    this._action = config.action ?? 'warn';
    this._onLoop = config.onLoop ?? null;
    this._windowSize = config.windowSize ?? 10;
    this._toolHistory = [];
    this._textHistory = [];
    this._loopDetected = false;
    this._loopInfo = null;
  }

  recordToolCall(toolName, input) {
    const signature = `${toolName}:${JSON.stringify(input)}`;
    this._toolHistory.push(signature);
    if (this._toolHistory.length > this._windowSize) this._toolHistory.shift();
    return this._checkToolLoop();
  }

  recordTextOutput(text) {
    const trimmed = (text || '').trim().slice(0, 200);
    this._textHistory.push(trimmed);
    if (this._textHistory.length > this._windowSize) this._textHistory.shift();
    return this._checkTextLoop();
  }

  isLooping() { return this._loopDetected; }
  getLoopInfo() { return this._loopInfo; }

  reset() {
    this._toolHistory = [];
    this._textHistory = [];
    this._loopDetected = false;
    this._loopInfo = null;
  }

  _checkToolLoop() {
    if (this._toolHistory.length < this._maxRepeats) return false;
    const recent = this._toolHistory.slice(-this._maxRepeats);
    if (recent.every(s => s === recent[0])) {
      this._loopDetected = true;
      this._loopInfo = { type: 'tool_repeat', pattern: recent[0], count: this._maxRepeats };
      this._triggerAction();
      return true;
    }
    return false;
  }

  _checkTextLoop() {
    if (this._textHistory.length < this._maxRepeats) return false;
    const recent = this._textHistory.slice(-this._maxRepeats);
    if (recent.every(s => s === recent[0] && s.length > 20)) {
      this._loopDetected = true;
      this._loopInfo = { type: 'text_repeat', pattern: recent[0], count: this._maxRepeats };
      this._triggerAction();
      return true;
    }
    return false;
  }

  _triggerAction() {
    if (this._action === 'callback' && this._onLoop) this._onLoop(this._loopInfo);
    else if (this._action === 'warn') console.warn('[LoopDetector] Loop detected:', this._loopInfo);
  }
}

module.exports = { LoopDetector };
