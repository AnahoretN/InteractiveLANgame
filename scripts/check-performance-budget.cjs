#!/usr/bin/env node

/**
 * Performance Budget Checker
 * Validates bundle sizes against defined budgets and provides detailed reports
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = './performance-budget.config.json';
const DIST_PATH = './dist';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function parseSize(sizeString) {
  const units = { 'B': 1, 'KB': 1024, 'MB': 1024 * 1024 };
  const match = sizeString.match(/^([\d.]+)\s*([A-Z]+)$/i);
  if (!match) throw new Error(`Invalid size format: ${sizeString}`);
  return parseFloat(match[1]) * (units[match[2].toUpperCase()] || 1);
}

function getBundleStats() {
  const assets = [];

  // Recursively find all JS and CSS files in dist directory
  function findFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        findFiles(filePath, fileList);
      } else if (file.endsWith('.js') || file.endsWith('.css')) {
        fileList.push(filePath);
      }
    }

    return fileList;
  }

  const allFiles = findFiles(DIST_PATH);

  for (const filePath of allFiles) {
    const stats = fs.statSync(filePath);
    const relativePath = path.relative(DIST_PATH, filePath);
    const ext = path.extname(relativePath).slice(1);

    assets.push({
      name: relativePath,
      type: ext,
      size: stats.size,
      isInitial: relativePath.includes('index') || relativePath.includes('main'),
    });
  }

  return assets;
}

function calculateMetrics(assets) {
  const metrics = {
    initial: { js: 0, css: 0 },
    total: { js: 0, css: 0 },
    chunks: [],
  };

  for (const asset of assets) {
    const type = asset.type;
    const size = asset.size;

    if (asset.isInitial) {
      metrics.initial[type] += size;
    }

    metrics.total[type] += size;
    metrics.chunks.push({ name: asset.name, type, size });
  }

  return metrics;
}

function checkBudgets(metrics, budgets) {
  let passed = true;
  const results = [];

  for (const budget of budgets) {
    const type = budget.type.toLowerCase();
    let actualSize;
    let itemName;

    switch (type) {
      case 'initial':
        actualSize = metrics.initial.js + metrics.initial.css;
        itemName = `Initial bundle (${formatBytes(metrics.initial.js)} JS + ${formatBytes(metrics.initial.css)} CSS)`;
        break;
      case 'total':
        actualSize = metrics.total.js + metrics.total.css;
        itemName = `Total bundle (${formatBytes(metrics.total.js)} JS + ${formatBytes(metrics.total.css)} CSS)`;
        break;
      case 'anychunk':
        const largestChunk = metrics.chunks.reduce((max, chunk) =>
          chunk.size > max.size ? chunk : max, { size: 0, name: 'N/A' });
        actualSize = largestChunk.size;
        itemName = `Largest chunk (${largestChunk.name})`;
        break;
      default:
        continue;
    }

    const maxSize = parseSize(budget.maxSize);
    const warningSize = parseSize(budget.warningSize || budget.maxSize);

    let status = 'pass';
    if (actualSize > maxSize) {
      status = 'fail';
      passed = false;
    } else if (actualSize > warningSize) {
      status = 'warning';
    }

    results.push({
      name: budget.name,
      item: itemName,
      actual: actualSize,
      max: maxSize,
      warning: warningSize,
      status,
    });
  }

  return { passed, results };
}

function generateReport(metrics, budgetResults) {
  log('\n📊 Performance Budget Report', 'bright');
  log('═'.repeat(50), 'blue');

  // Overall status
  const overallStatus = budgetResults.passed ? '✅ PASSED' : '❌ FAILED';
  log(`\nOverall Status: ${overallStatus}`, budgetResults.passed ? 'green' : 'red');

  // Budget results
  log('\n📏 Budget Checks:', 'bright');
  for (const result of budgetResults.results) {
    const { name, item, actual, max, warning, status } = result;
    const actualFormatted = formatBytes(actual);
    const maxFormatted = formatBytes(max);

    let statusIcon, statusColor;
    switch (status) {
      case 'pass':
        statusIcon = '✅';
        statusColor = 'green';
        break;
      case 'warning':
        statusIcon = '⚠️ ';
        statusColor = 'yellow';
        break;
      case 'fail':
        statusIcon = '❌';
        statusColor = 'red';
        break;
    }

    log(`\n${statusIcon} ${name}`, statusColor);
    log(`   ${item}`, 'blue');
    log(`   Actual: ${actualFormatted} / Max: ${maxFormatted}`, 'reset');

    const percentage = ((actual / max) * 100).toFixed(1);
    const barColor = status === 'fail' ? 'red' : status === 'warning' ? 'yellow' : 'green';
    log(`   Usage: ${percentage}%`, barColor);
  }

  // Detailed metrics
  log('\n📈 Detailed Metrics:', 'bright');
  log(`Initial JS: ${formatBytes(metrics.initial.js)}`, 'blue');
  log(`Initial CSS: ${formatBytes(metrics.initial.css)}`, 'blue');
  log(`Total JS: ${formatBytes(metrics.total.js)}`, 'blue');
  log(`Total CSS: ${formatBytes(metrics.total.css)}`, 'blue');

  // Top 5 largest files
  const sortedChunks = [...metrics.chunks].sort((a, b) => b.size - a.size);
  log('\n🔝 Top 5 Largest Files:', 'bright');
  sortedChunks.slice(0, 5).forEach((chunk, index) => {
    log(`${index + 1}. ${chunk.name} - ${formatBytes(chunk.size)}`, 'blue');
  });

  log('\n' + '═'.repeat(50), 'blue');
}

function main() {
  try {
    // Load configuration
    log('🔍 Loading performance budget configuration...', 'blue');
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    // Get bundle statistics
    log('📦 Analyzing bundle sizes...', 'blue');
    const assets = getBundleStats();
    const metrics = calculateMetrics(assets);

    // Check budgets
    log('💰 Checking budget compliance...', 'blue');
    const budgetResults = checkBudgets(metrics, config.budgets);

    // Generate report
    generateReport(metrics, budgetResults);

    // Exit with appropriate code
    process.exit(budgetResults.passed ? 0 : 1);

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    if (error.code === 'ENOENT') {
      log('Make sure you have built the project first: npm run build', 'yellow');
    }
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { checkBudgets, calculateMetrics, getBundleStats };
