const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Ensure all required directories exist
const dirs = [
  'dist',
  'src/components/ui',
  'src/lib',
  'src/styles',
  'public/icons',
];

dirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Install dependencies
console.log('Installing dependencies...');
execSync('npm install', { stdio: 'inherit' });

// Create build
console.log('Building extension...');
execSync('npm run build', { stdio: 'inherit' });