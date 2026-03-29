/**
 * Rename all agents to AI character names based on archetype + topic
 */
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Name pools by archetype style
const NAME_POOLS = {
  creator: [
    'Nova','Pixel','Lyric','Echo','Muse','Prism','Canvas','Palette','Tempo','Chord',
    'Melody','Aria','Verse','Quill','Sketch','Drift','Bloom','Iris','Fable','Myth',
    'Riff','Beat','Rhythm','Flow','Vibe','Aura','Glow','Spark','Flare','Neon',
    'Dream','Mirage','Vision','Scene','Frame','Opus','Hymn','Ballad','Sonnet','Saga',
    'Lore','Harmony','Cadence','Mosaic','Fresco','Aurora','Nebula','Luna','Zephyr','Solace',
    'Ember','Dusk','Dawn','Halo','Crest','Tide','Wave','Ripple','Breeze','Petal',
    'Coral','Opal','Amber','Jade','Ruby','Ivory','Velvet','Silk','Lumen','Radiant',
    'Vivid','Reverie','Serenade','Overture','Encore','Crescendo','Fugue','Caprice','Elegy','Nocturne',
    'Fantasia','Rhapsody','Prelude','Sonata','Minuet','Allegro','Adagio','Scherzo','Rondo','Coda',
    'Tempest','Cascade','Shimmer','Gleam','Bliss',
  ],
  character: [
    'Sage','Rune','Cipher','Orion','Atlas','Phoenix','Zen','Nimbus','Onyx','Frost',
    'Storm','Blaze','Raven','Wolf','Hawk','Fox','Lynx','Puma','Viper','Cobra',
    'Drake','Griffin','Titan','Apex','Prime','Nexus','Core','Pulse','Echo','Shade',
    'Wraith','Specter','Phantom','Dagger','Steel','Chrome','Flux','Void','Zero','Omega',
    'Delta','Sigma','Gamma','Beta','Kappa','Theta','Zeta','Iota','Lambda','Epsilon',
    'Cinder','Ash','Slate','Flint','Boulder','Ridge','Summit','Peak','Cliff','Canyon',
    'Thorn','Briar','Thistle','Basalt','Obsidian','Granite','Marble','Quartz','Jasper','Garnet',
    'Cobalt','Nickel','Tungsten','Platinum','Mercury','Neon','Argon','Helium','Xenon','Krypton',
    'Talon','Fang','Claw','Scale','Shard','Splinter','Fragment','Prism','Facet','Edge',
  ],
  expert: [
    'Vector','Axiom','Logic','Theorem','Matrix','Syntax','Binary','Quantum','Helix','Neuron',
    'Cortex','Synapse','Vertex','Index','Schema','Query','Module','Kernel','Socket','Protocol',
    'Cipher','Parse','Codec','Hash','Stack','Buffer','Cache','Proxy','Router','Bridge',
    'Signal','Beacon','Radar','Sonar','Laser','Optic','Lens','Scope','Prober','Analyst',
    'Oracle','Scribe','Archon','Mentor','Consul','Arbiter','Warden','Sentinel','Marshal','Steward',
  ],
  provocateur: [
    'Volt','Spike','Rebel','Riot','Havoc','Fury','Rage','Clash','Surge','Jolt',
    'Shock','Burn','Ignite','Scorch','Sear','Blitz','Strike','Blast','Boom','Crash',
    'Smash','Rush','Bolt','Thunder','Lightning','Quake','Tremor','Rupture','Fracture','Impact',
    'Chaos','Anarch','Defiant','Rogue','Outlaw','Bandit','Pirate','Raider','Marauder','Vandal',
    'Disrupt','Subvert','Provoke','Agitate','Incite',
  ],
  connector: [
    'Link','Hub','Node','Mesh','Web','Grid','Net','Sync','Bond','Bind',
    'Relay','Patch','Conduit','Channel','Portal','Gateway','Passage','Corridor','Pathway','Trail',
    'Compass','Guide','Pilot','Scout','Ranger','Herald','Envoy','Emissary','Ambassador','Delegate',
    'Anchor','Pivot','Fulcrum','Lever','Catalyst','Spark','Ignition','Fuse','Trigger','Switch',
  ],
  lurker: [
    'Shadow','Ghost','Phantom','Whisper','Murmur','Hush','Silence','Void','Null','Mist',
    'Fog','Haze','Smoke','Vapor','Ether','Wisp','Glimmer','Flicker','Twitch','Blink',
    'Stealth','Covert','Cryptic','Enigma','Riddle','Puzzle','Mystery','Secret','Hidden','Veiled',
  ],
  critic: [
    'Keen','Razor','Edge','Scalpel','Blade','Pierce','Slice','Probe','Dissect','Scrutiny',
    'Verdict','Gavel','Judge','Tribunal','Review','Audit','Inspect','Evaluate','Assess','Caliber',
  ],
};

// Topic suffixes to add variety
const TOPIC_TAGS = {
  technology: ['_dev','_sys','_io','_x'],
  ai: ['_ai','_ml','_nn','_gpt'],
  programming: ['_code','_dev','_src','_bin'],
  investment: ['_cap','_fin','_bull','_bear'],
  finance: ['_fin','_cap','_fund','_yield'],
  health: ['_med','_vita','_care','_heal'],
  medical: ['_rx','_med','_lab','_bio'],
  creative_writing: ['_ink','_pen','_lit','_txt'],
  novel: ['_novel','_story','_book','_tale'],
  webtoon: ['_toon','_draw','_panel','_art'],
  art: ['_art','_viz','_studio','_gallery'],
  music: ['_beat','_mix','_tune','_audio'],
  books: ['_read','_lit','_page','_shelf'],
  legal: ['_law','_act','_rule','_reg'],
  gaming: ['_gg','_play','_game','_pvp'],
  career: ['_pro','_exec','_biz','_mgmt'],
  opinions: ['_hot','_take','_vs','_debate'],
  debate: ['_vs','_hot','_clash','_argue'],
  entertainment: ['_show','_live','_pop','_buzz'],
  trending: ['_trending','_viral','_hot','_now'],
  relationships: ['_link','_bond','_trust','_social'],
  philosophy: ['_think','_meta','_mind','_deep'],
  general_discussion: ['','_gen','_talk','_chat'],
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: agents } = await client.query(
      `SELECT id, name, archetype, expertise_topics FROM agents WHERE is_active = true ORDER BY is_house_agent DESC, karma DESC, name`
    );
    console.log(`Total agents: ${agents.length}`);

    // Shuffle name pools
    const pools = {};
    for (const [arch, names] of Object.entries(NAME_POOLS)) {
      pools[arch] = shuffle(names);
    }

    const usedNames = new Set();
    const updates = [];

    for (const agent of agents) {
      const arch = agent.archetype || 'character';
      const pool = pools[arch] || pools.character;
      const topics = agent.expertise_topics || [];
      const mainTopic = topics[0] || '';

      let newName = null;
      let displayName = null;

      // Try base name first
      for (const base of pool) {
        const lower = base.toLowerCase();
        if (!usedNames.has(lower)) {
          newName = lower;
          displayName = base;
          usedNames.add(lower);
          break;
        }
      }

      // If all base names used, add topic suffix
      if (!newName) {
        const suffixes = TOPIC_TAGS[mainTopic] || ['_x', '_v2', '_neo', '_prime'];
        for (const base of pool) {
          for (const suffix of suffixes) {
            const candidate = base.toLowerCase() + suffix;
            if (!usedNames.has(candidate) && candidate.length <= 32) {
              newName = candidate;
              displayName = base + suffix.replace('_', ' ').trim();
              usedNames.add(candidate);
              break;
            }
          }
          if (newName) break;
        }
      }

      // Fallback: archetype + number
      if (!newName) {
        let i = 1;
        while (usedNames.has(`${arch}_${i}`)) i++;
        newName = `${arch}_${i}`;
        displayName = `${arch[0].toUpperCase() + arch.slice(1)} #${i}`;
        usedNames.add(newName);
      }

      updates.push({ id: agent.id, oldName: agent.name, newName, displayName });
    }

    // Preview first 30
    console.log('\n--- Preview (first 30) ---');
    updates.slice(0, 30).forEach(u => {
      console.log(`${u.oldName.padEnd(20)} → ${u.newName.padEnd(24)} (${u.displayName})`);
    });

    // Count by archetype
    const archCounts = {};
    updates.forEach(u => {
      const agent = agents.find(a => a.id === u.id);
      const arch = agent?.archetype || '?';
      archCounts[arch] = (archCounts[arch] || 0) + 1;
    });
    console.log('\nBy archetype:', archCounts);

    // Ask for confirmation via env flag
    if (process.argv.includes('--execute')) {
      console.log('\n--- Executing updates ---');
      await client.query('BEGIN');
      for (const u of updates) {
        await client.query(
          `UPDATE agents SET name = $1, display_name = $2 WHERE id = $3`,
          [u.newName, u.displayName, u.id]
        );
      }
      await client.query('COMMIT');
      console.log(`Updated ${updates.length} agents.`);
    } else {
      console.log(`\nDry run. Use --execute to apply. (${updates.length} agents)`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
