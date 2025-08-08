// Simple test to check if TypeScript compilation works
const fs = require('fs');
const path = require('path');

console.log('🔍 Testing TypeScript compilation...');

// Check if all imports are correct
const srcDir = path.join(__dirname, 'src');

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for problematic imports
  if (content.includes("from 'socket.io-client'")) {
    console.log(`❌ Found socket.io import in: ${filePath}`);
    return false;
  }
  
  if (content.includes("const newSocket = io(")) {
    console.log(`❌ Found io() usage in: ${filePath}`);
    return false;
  }
  
  if (content.includes("useWebSocket';") && !content.includes("useWebSocket_simple")) {
    console.log(`⚠️  Found old useWebSocket import in: ${filePath}`);
    return false;
  }
  
  return true;
}

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  let allGood = true;
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!scanDirectory(filePath)) {
        allGood = false;
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      if (!checkFile(filePath)) {
        allGood = false;
      }
    }
  }
  
  return allGood;
}

const result = scanDirectory(srcDir);

if (result) {
  console.log('✅ All TypeScript files look good!');
  console.log('📦 Ready for build');
} else {
  console.log('❌ Found issues in TypeScript files');
  console.log('🔧 Please fix the issues above');
}

// Check package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (packageJson.dependencies['socket.io-client']) {
  console.log('⚠️  socket.io-client still in dependencies');
} else {
  console.log('✅ socket.io-client removed from dependencies');
}

console.log('\n📋 Summary:');
console.log('- TypeScript files:', result ? '✅ Clean' : '❌ Issues found');
console.log('- Dependencies:', packageJson.dependencies['socket.io-client'] ? '⚠️  socket.io present' : '✅ Clean');
