const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const manifestPath = path.join(__dirname, '..', 'manifest.json');

try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (manifest.version !== pkg.version) {
    manifest.version = pkg.version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`✅ Version synced to manifest.json: ${pkg.version}`);
  } else {
    console.log(`Version already in sync: ${pkg.version}`);
  }
} catch (err) {
  console.error('Failed to sync version:', err.message);
  process.exit(1);
}
