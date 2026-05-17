'use strict';
const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const STAGING_DIR = path.join(__dirname, '..', 'staging');
const IMAGES_DIR  = path.join(__dirname, '..', 'images');
const TARGET_KB   = 300;
const MIN_QUALITY = 20;

async function compressToAvif(inputBuffer, outputPath) {
  const target = TARGET_KB * 1024;
  const fast = await sharp(inputBuffer).avif({ quality: 65, effort: 4 }).toBuffer();
  if (fast.byteLength <= target) { fs.writeFileSync(outputPath, fast); return fast.byteLength; }

  let lo = MIN_QUALITY, hi = 64, best = fast;
  for (let i = 0; i < 5; i++) {
    const q = Math.round((lo + hi) / 2);
    const buf = await sharp(inputBuffer).avif({ quality: q, effort: 4 }).toBuffer();
    if (buf.byteLength <= target) { best = buf; lo = q + 1; } else { hi = q - 1; }
  }
  if (best.byteLength > target) {
    best = await sharp(inputBuffer).avif({ quality: MIN_QUALITY, effort: 4 }).toBuffer();
  }
  fs.writeFileSync(outputPath, best);
  return best.byteLength;
}

const JSDELIVR = 'https://cdn.jsdelivr.net/gh/Nwachukwuchinedu/sedon-assets@main';

async function main() {
  if (!fs.existsSync(STAGING_DIR)) { console.log('Nothing staged.'); return; }

  const mappings = [];

  // Walk staging dir for .json trigger files
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        walk(full, path.join(rel, entry));
        if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
        continue;
      }
      if (!entry.endsWith('.json')) continue;

      let meta;
      try { meta = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }
      const { folder, stem, ext } = meta;

      const rawPath  = path.join(IMAGES_DIR, folder, stem + '.' + ext);
      const avifPath = path.join(IMAGES_DIR, folder, stem + '.avif');
      if (!fs.existsSync(rawPath)) { console.warn('Raw file not found: ' + rawPath); fs.unlinkSync(full); continue; }

      const inKB = Math.round(fs.statSync(rawPath).size / 1024);
      process.stdout.write('Converting ' + stem + '.' + ext + ' (' + inKB + 'KB) ... ');
      try {
        const outBytes = compressToAvif(fs.readFileSync(rawPath), avifPath);
        // We need to await, so use sync-style trick: wrap in then
        // Actually this file is async — but let's use top-level await via the wrapper
        throw { _asyncNeeded: true, rawPath, avifPath, inKB, folder, stem, ext, full };
      } catch(e) {
        if (e && e._asyncNeeded) throw e; // re-throw to outer async handler
        console.error('FAILED: ' + e.message);
      }
    }
  }

  // Use a proper async walk instead
  async function walkAsync(dir, rel) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        await walkAsync(full, path.join(rel, entry));
        if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
        continue;
      }
      if (!entry.endsWith('.json')) continue;

      let meta;
      try { meta = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { fs.unlinkSync(full); continue; }
      const { folder, stem, ext } = meta;
      if (!folder || !stem || !ext) { fs.unlinkSync(full); continue; }

      const rawPath  = path.join(IMAGES_DIR, folder, stem + '.' + ext);
      const avifPath = path.join(IMAGES_DIR, folder, stem + '.avif');

      if (!fs.existsSync(rawPath)) {
        console.warn('Skipping (raw file missing): ' + rawPath);
        fs.unlinkSync(full);
        continue;
      }

      const inKB = Math.round(fs.statSync(rawPath).size / 1024);
      process.stdout.write('Converting ' + stem + '.' + ext + ' (' + inKB + 'KB) → AVIF ... ');
      try {
        const outBytes = await compressToAvif(fs.readFileSync(rawPath), avifPath);
        const outKB = Math.round(outBytes / 1024);
        console.log('done! ' + outKB + 'KB');

        // Build mapping for DB webhook
        mappings.push({
          rawUrl:  JSDELIVR + '/images/' + folder + '/' + stem + '.' + ext,
          avifUrl: JSDELIVR + '/images/' + folder + '/' + stem + '.avif',
        });

        fs.unlinkSync(rawPath);   // delete original raw file
        fs.unlinkSync(full);      // delete staging trigger JSON
      } catch (e) {
        console.error('FAILED: ' + e.message);
      }
    }
  }

  await walkAsync(STAGING_DIR, '');
  if (fs.existsSync(STAGING_DIR) && fs.readdirSync(STAGING_DIR).length === 0) {
    fs.rmdirSync(STAGING_DIR);
  }

  // Export mappings as env var for the webhook step
  const mappingsJson = JSON.stringify(mappings);
  const ghEnvFile = process.env.GITHUB_ENV;
  if (ghEnvFile && mappings.length > 0) {
    fs.appendFileSync(ghEnvFile, 'MAPPINGS=' + mappingsJson + '\n');
    console.log('Exported ' + mappings.length + ' mapping(s) for webhook step.');
  } else if (mappings.length === 0) {
    console.log('No images converted — nothing to export.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
