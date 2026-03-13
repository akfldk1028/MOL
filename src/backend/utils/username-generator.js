/**
 * Username Generator
 * Generates random adjective_noun usernames for new members.
 * ~19,600 unique combinations before needing numeric suffix.
 */

const ADJECTIVES = [
  'amber', 'arctic', 'autumn', 'azure', 'bitter', 'blank', 'blaze', 'blind',
  'bold', 'brave', 'brief', 'bright', 'broad', 'broken', 'bronze', 'calm',
  'carbon', 'cedar', 'chrome', 'civic', 'clean', 'clear', 'clever', 'cliff',
  'cloud', 'coastal', 'cobalt', 'cold', 'copper', 'coral', 'cosmic', 'crisp',
  'cross', 'crystal', 'cubic', 'curious', 'cyber', 'daily', 'dark', 'dawn',
  'deep', 'dense', 'digital', 'dim', 'distant', 'double', 'dry', 'dual',
  'dusk', 'dusty', 'eager', 'early', 'east', 'echo', 'elder', 'ember',
  'empty', 'equal', 'even', 'fading', 'fair', 'fallen', 'false', 'far',
  'fast', 'feral', 'fierce', 'final', 'first', 'flat', 'fleet', 'flinty',
  'foggy', 'fossil', 'free', 'fresh', 'frost', 'frozen', 'full', 'gentle',
  'glass', 'global', 'golden', 'grand', 'grave', 'gray', 'green', 'grim',
  'half', 'hazy', 'heavy', 'hidden', 'high', 'hollow', 'honest', 'humble',
  'idle', 'inner', 'iron', 'ivory', 'keen', 'kind', 'last', 'late',
  'light', 'likely', 'little', 'living', 'lone', 'long', 'lost', 'loud',
  'low', 'lucky', 'lunar', 'major', 'maple', 'marble', 'mild', 'misty',
  'modest', 'moist', 'muted', 'narrow', 'native', 'near', 'neon', 'new',
  'next', 'noble', 'north', 'novel', 'odd', 'olive', 'open', 'outer',
  'pale', 'paper', 'past', 'plain', 'polar', 'prime', 'proud', 'pure',
  'quick', 'quiet', 'rapid', 'rare', 'raw', 'ready', 'real', 'red',
  'rising', 'rough', 'royal', 'ruby', 'rusty', 'safe', 'salty', 'sharp',
  'short', 'shy', 'silent', 'silver', 'simple', 'sleek', 'slow', 'small',
  'smoky', 'snowy', 'soft', 'solar', 'solid', 'sonic', 'spare', 'stark',
  'steep', 'still', 'stone', 'stray', 'subtle', 'sunny', 'super', 'swift',
  'tall', 'teal', 'tender', 'third', 'tidal', 'tight', 'tiny', 'total',
  'true', 'twin', 'upper', 'urban', 'vast', 'vivid', 'void', 'warm',
  'west', 'white', 'whole', 'wide', 'wild', 'wise', 'young', 'zero',
];

const NOUNS = [
  'anchor', 'arrow', 'atlas', 'atom', 'badge', 'basin', 'beacon', 'blade',
  'bloom', 'bolt', 'bond', 'bone', 'booth', 'branch', 'brass', 'break',
  'brick', 'bridge', 'brook', 'brush', 'cabin', 'cairn', 'canal', 'cape',
  'cargo', 'cedar', 'chain', 'chalk', 'chase', 'chord', 'claim', 'cliff',
  'clock', 'cloud', 'coast', 'comet', 'core', 'crane', 'creek', 'crest',
  'cross', 'crown', 'crush', 'curve', 'cycle', 'delta', 'depot', 'diver',
  'dock', 'draft', 'drain', 'drift', 'drum', 'dune', 'eagle', 'edge',
  'elm', 'ember', 'epoch', 'fable', 'ferry', 'field', 'finch', 'fjord',
  'flame', 'flare', 'flask', 'fleet', 'flint', 'float', 'flock', 'flood',
  'flux', 'forge', 'fort', 'fox', 'frame', 'frost', 'gate', 'glade',
  'gleam', 'globe', 'gorge', 'grain', 'graph', 'grove', 'guild', 'gust',
  'haven', 'hawk', 'heath', 'hedge', 'heron', 'hinge', 'hive', 'horn',
  'inlet', 'isle', 'jade', 'kelp', 'knot', 'lake', 'lance', 'lark',
  'latch', 'ledge', 'lever', 'light', 'lily', 'linen', 'lodge', 'loom',
  'lunar', 'maple', 'marsh', 'mason', 'mast', 'match', 'meadow', 'mesa',
  'mill', 'mint', 'moat', 'mold', 'moon', 'moss', 'mound', 'nest',
  'node', 'north', 'notch', 'oak', 'oasis', 'orbit', 'otter', 'owl',
  'panda', 'patch', 'path', 'peak', 'pearl', 'pier', 'pike', 'pine',
  'pixel', 'plank', 'plaza', 'plume', 'point', 'pond', 'port', 'post',
  'prism', 'pulse', 'quartz', 'rail', 'rain', 'range', 'rapid', 'raven',
  'reach', 'reed', 'reef', 'ridge', 'ring', 'river', 'road', 'robin',
  'rock', 'root', 'rover', 'sail', 'sand', 'scale', 'scout', 'seed',
  'shade', 'shell', 'shore', 'slate', 'slope', 'smoke', 'snow', 'solar',
  'spark', 'spire', 'spoke', 'spore', 'spring', 'spur', 'staff', 'stair',
  'stamp', 'star', 'steam', 'steel', 'stem', 'stone', 'storm', 'strand',
  'surf', 'swamp', 'swift', 'thorn', 'tide', 'tiger', 'timber', 'torch',
  'tower', 'trail', 'trap', 'trend', 'tundra', 'valve', 'vault', 'vine',
  'vista', 'void', 'wave', 'well', 'whale', 'wheel', 'willow', 'wind',
  'wing', 'wolf', 'wren', 'yard', 'zenith',
];

/**
 * Generate a random username (adjective_noun)
 * @returns {string}
 */
function generateUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}_${noun}`;
}

/**
 * Generate a unique username, retrying with numeric suffix on collision
 * @param {(name: string) => Promise<boolean>} checkExists - Function that returns true if name exists
 * @param {number} [maxAttempts=10] - Max retry attempts
 * @returns {Promise<string>} Unique username
 */
async function generateUniqueUsername(checkExists, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const base = generateUsername();
    const candidate = i === 0 ? base : `${base}_${String(Math.floor(Math.random() * 900) + 100)}`;

    const exists = await checkExists(candidate);
    if (!exists) return candidate;
  }

  // Fallback: always unique with timestamp
  const base = generateUsername();
  return `${base}_${Date.now() % 100000}`;
}

module.exports = { generateUsername, generateUniqueUsername };
