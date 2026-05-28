const fs = require('fs');
const path = require('path');

const channel = process.argv[2] || 'preview';
const easJsonPath = path.join(__dirname, '..', 'eas.json');

try {
  if (fs.existsSync(easJsonPath)) {
    const eas = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
    const profile = eas.build?.[channel];
    if (profile && profile.env) {
      for (const [key, value] of Object.entries(profile.env)) {
        // Escape single quotes for bash
        const escapedValue = String(value).replace(/'/g, "'\\''");
        console.log(`export ${key}='${escapedValue}'`);
      }
    }
  }
} catch (error) {
  console.error(`Error loading env from eas.json: ${error.message}`);
  process.exit(1);
}
