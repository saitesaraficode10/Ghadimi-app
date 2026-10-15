const fs = require('fs');
const path = require('path');

/**
 * Overlay logo + phone + site URL on property images.
 * Uses sharp when available; otherwise leaves file unchanged.
 */
async function applyWatermark(filePath, opts = {}) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.log('watermark: sharp not installed, skip');
    return false;
  }
  try {
    const phone = opts.phone || '';
    const site = opts.site || '';
    const logoPath = opts.logoPath || path.join(__dirname, '..', 'public', 'logo-ghadimi-white.png');
    const img = sharp(filePath);
    const meta = await img.metadata();
    const w = meta.width || 1200;
    const h = meta.height || 800;
    const barH = Math.max(36, Math.round(h * 0.07));
    const fontSize = Math.max(14, Math.round(barH * 0.38));
    const text = [phone, site].filter(Boolean).join('  ·  ');
    const svg = Buffer.from(`
      <svg width="${w}" height="${barH}">
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="${fontSize}" fill="#f5e6a8">${escapeXml(text)}</text>
      </svg>
    `);

    const composites = [{ input: svg, gravity: 'south' }];
    if (fs.existsSync(logoPath)) {
      const logoW = Math.round(w * 0.14);
      const logoBuf = await sharp(logoPath).resize({ width: logoW }).png().toBuffer();
      composites.push({ input: logoBuf, gravity: 'southeast', top: undefined, left: undefined });
      // place logo bottom-right with margin via extend on logo
      const logoH = Math.round(logoW * 0.45);
      const padded = await sharp(logoPath)
        .resize({ width: logoW })
        .extend({ bottom: Math.round(barH * 0.35), right: Math.round(w * 0.02), background: { r:0,g:0,b:0,alpha:0 } })
        .png()
        .toBuffer();
      composites[1] = { input: padded, gravity: 'southeast' };
    }

    const out = await sharp(filePath).composite(composites).jpeg({ quality: 88 }).toBuffer();
    // keep original extension if png
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png' || ext === '.webp') {
      await sharp(out).toFormat(ext.slice(1)).toFile(filePath + '.tmp');
    } else {
      fs.writeFileSync(filePath + '.tmp', out);
    }
    fs.renameSync(filePath + '.tmp', filePath);
    return true;
  } catch (e) {
    console.error('watermark error', e.message);
    return false;
  }
}

function escapeXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = { applyWatermark };
