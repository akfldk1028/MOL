#!/usr/bin/env node
/**
 * Regenerate Images for Webtoon Episodes
 * Finds episodes with [PANEL] format but no images, and re-generates them.
 *
 * Usage:
 *   node scripts/regenerate-images.js                    # List episodes needing images
 *   node scripts/regenerate-images.js --fix              # Actually regenerate
 *   node scripts/regenerate-images.js --fix --id <id>    # Regenerate specific episode
 */

require('dotenv').config({ path: '.env.local' });

const { query, queryOne, queryAll, close } = require('../src/backend/config/database');

async function main() {
  const args = process.argv.slice(2);
  const doFix = args.includes('--fix');
  const specificId = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;

  // Find webtoon episodes with [PANEL] content but no images
  let episodes;
  if (specificId) {
    episodes = await queryAll(
      `SELECT c.id, c.series_id, c.episode_number, p.id as post_id, p.title, p.content,
              s.title as series_title, s.character_reference_urls
       FROM creations c
       JOIN posts p ON c.post_id = p.id
       LEFT JOIN series s ON c.series_id = s.id
       WHERE c.id = $1`,
      [specificId]
    );
  } else {
    episodes = await queryAll(
      `SELECT c.id, c.series_id, c.episode_number, p.id as post_id, p.title, p.content,
              s.title as series_title, s.character_reference_urls
       FROM creations c
       JOIN posts p ON c.post_id = p.id
       LEFT JOIN series s ON c.series_id = s.id
       WHERE c.creation_type = 'webtoon'
         AND (c.image_urls IS NULL OR c.image_urls = '{}')
         AND p.content LIKE '%[PANEL]%'
       ORDER BY c.created_at`
    );
  }

  console.log(`\nFound ${episodes.length} webtoon episodes needing image regeneration:\n`);

  for (const ep of episodes) {
    // Count panels
    const panelCount = (ep.content.match(/\[PANEL\]/g) || []).length;
    console.log(`  ${ep.id.slice(0, 8)} ep${ep.episode_number} "${ep.title}" (${panelCount} panels) — ${ep.series_title || 'no series'}`);

    if (!doFix) continue;

    console.log(`    Regenerating images...`);

    try {
      // Parse panels from content
      const panels = [];
      const panelBlocks = ep.content.split('[PANEL]').filter(Boolean);
      for (const block of panelBlocks) {
        const imageMatch = block.match(/IMAGE:\s*(.+?)(?=\nTEXT:|$)/s);
        const textMatch = block.match(/TEXT:\s*(.+?)(?=\n\[|$)/s);
        if (imageMatch) {
          panels.push({
            imagePrompt: imageMatch[1].trim(),
            text: textMatch ? textMatch[1].trim() : '',
          });
        }
      }

      if (panels.length === 0) {
        console.log(`    No parseable panels found, skipping.`);
        continue;
      }

      console.log(`    Parsed ${panels.length} panels, generating images...`);

      // Generate images
      const imageGen = require('../src/backend/services/skills/image-gen');
      const { uploadBuffer } = require('../src/backend/utils/storage');
      const referenceUrls = ep.character_reference_urls || [];
      const imageUrls = [];

      for (let i = 0; i < panels.length; i++) {
        console.log(`    Panel ${i + 1}/${panels.length}...`);
        try {
          const result = await imageGen.generate({
            prompt: panels[i].imagePrompt,
            aspectRatio: '9:16',
            referenceImageUrls: referenceUrls,
          });

          if (result && result.images && result.images[0] && result.images[0].b64) {
            // Upload base64 image to Supabase Storage
            const buffer = Buffer.from(result.images[0].b64, 'base64');
            const url = await uploadBuffer(buffer, '.png', 'image/png', 'webtoons');
            imageUrls.push(url);
            console.log(`      OK: ${url.slice(-40)}`);
          } else if (result && result.url) {
            imageUrls.push(result.url);
            console.log(`      OK: ${result.url.slice(-40)}`);
          } else {
            imageUrls.push(null);
            console.log(`      FAILED (no image data returned)`);
          }
        } catch (err) {
          imageUrls.push(null);
          console.log(`      FAILED: ${err.message.slice(0, 80)}`);
        }

        // Rate limit pause
        await new Promise(r => setTimeout(r, 3000));
      }

      const validUrls = imageUrls.filter(Boolean);
      console.log(`    Generated ${validUrls.length}/${panels.length} images`);

      if (validUrls.length === 0) {
        console.log(`    All images failed, skipping DB update.`);
        continue;
      }

      // Rebuild content with image markdown
      let newContent = '';
      for (let i = 0; i < panels.length; i++) {
        if (imageUrls[i]) {
          newContent += `![Panel ${i + 1}](${imageUrls[i]})\n`;
        }
        if (panels[i].text) {
          newContent += panels[i].text + '\n\n';
        }
      }

      // Update DB
      await queryOne(
        `UPDATE creations SET image_urls = $1 WHERE id = $2`,
        [validUrls, ep.id]
      );
      await queryOne(
        `UPDATE posts SET content = $1 WHERE id = $2`,
        [newContent.trim(), ep.post_id]
      );

      console.log(`    ✓ Updated DB: ${validUrls.length} images, content rebuilt`);

      // Save character references if first episode and none exist
      if (ep.episode_number <= 1 && referenceUrls.length === 0 && validUrls.length >= 2 && ep.series_id) {
        await queryOne(
          `UPDATE series SET character_reference_urls = $1 WHERE id = $2 AND (character_reference_urls IS NULL OR character_reference_urls = '{}')`,
          [validUrls.slice(0, 2), ep.series_id]
        );
        console.log(`    ✓ Saved character references`);
      }

    } catch (err) {
      console.error(`    ERROR: ${err.message}`);
    }
  }

  if (!doFix && episodes.length > 0) {
    console.log(`\nRun with --fix to regenerate images.`);
    console.log(`Run with --fix --id <creation_id> for a specific episode.`);
  }

  await close();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
