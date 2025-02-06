const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Ensure directories exist
const directories = [
  'dist',
  'public/icons',
  'src/components/ui',
  'src/lib',
  'src/styles',
  'src/background',
  'src/content',
  'src/popup',
  'src/options'
];

directories.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Run npm install
console.log('Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
} catch (error) {
  console.error('Error installing dependencies:', error);
  process.exit(1);
}

// Run the build
console.log('Building extension...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('Error building extension:', error);
  process.exit(1);
}

console.log('Setup complete! Check the dist directory for the built extension.');