'use strict';
const fs   = require('fs');
const path = require('path');
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
    if (buf.byteLength <= target) { best = buf; lo = q + 1; }
    else { hi = q - 1; }
  }

  if (best.byteLength > target) {
    best = await sharp(inputBuffer).avif({ quality: MIN_QUALITY, effort: 4 }).toBuffer();
  }

  fs.writeFileSync(outputPath, best);
  return best.byteLength;
}

async function walkAndProcess(dir, rel) {
  let count = 0;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      count += await walkAndProcess(full, path.join(rel, entry));
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
      continue;
    }
    const stem   = entry.replace(/\.[^/.]+$/, '');
    const outDir = path.join(IMAGES_DIR, rel);
    const outPath = path.join(outDir, stem + '.avif');
    fs.mkdirSync(outDir, { recursive: true });

    const inKB = Math.round(fs.statSync(full).size / 1024);
    process.stdout.write('Processing ' + rel + '/' + entry + ' (' + inKB + 'KB) ... ');
    try {
      const outBytes = await compressToAvif(fs.readFileSync(full), outPath);
      console.log('done → ' + Math.round(outBytes / 1024) + 'KB (AVIF)');
      fs.unlinkSync(full);
      count++;
    } catch (e) {
      console.error('FAILED: ' + e.message);
    }
  }
  return count;
}

async function main() {
  if (!fs.existsSync(STAGING_DIR)) { console.log('Nothing to process.'); return; }
  const n = await walkAndProcess(STAGING_DIR, '');
  if (fs.existsSync(STAGING_DIR) && fs.readdirSync(STAGING_DIR).length === 0) {
    fs.rmdirSync(STAGING_DIR);
  }
  console.log('\nDone: ' + n + ' image(s) processed.');
}

main().catch(e => { console.error(e); process.exit(1); });
