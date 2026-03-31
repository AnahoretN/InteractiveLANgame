# Performance Budgets Guide

This project includes automated performance budgets to ensure your application remains fast and efficient as it grows.

## 📊 What's Included

### Budget Types

- **Initial Bundle**: Size of files loaded when users first visit your site
- **Total Bundle**: Combined size of all JavaScript and CSS files
- **Any Chunk**: Maximum size for individual code chunks

### Default Limits

| Budget Type | Max Size | Warning Size |
|-------------|----------|--------------|
| Initial JS | 200 KB | 150 KB |
| Initial CSS | 50 KB | 35 KB |
| Total JS | 500 KB | 350 KB |
| Total CSS | 100 KB | 70 KB |
| Any Chunk JS | 150 KB | 100 KB |
| Any Chunk CSS | 40 KB | 25 KB |

## 🚀 Usage

### Local Development

```bash
# Build and check performance budgets
npm run build:analyze

# Just check budgets (must build first)
npm run build
npm run check:budget

# Analyze bundle in browser
npm run analyze:bundle
```

### CI/CD

The performance budgets are automatically checked in CI for every pull request and push to main branches.

## 📈 Performance Metrics

### Lighthouse Targets

- **Performance Score**: 90+
- **Accessibility**: 95+
- **Best Practices**: 90+
- **SEO**: 85+

### Core Web Vitals

- **First Contentful Paint**: < 1.5s
- **Largest Contentful Paint**: < 2.5s
- **Cumulative Layout Shift**: < 0.1
- **First Input Delay**: < 100ms
- **Time to Interactive**: < 3.5s

## 🔧 Configuration

Edit `performance-budget.config.json` to adjust budgets:

```json
{
  "budgets": [
    {
      "name": "my-custom-budget",
      "type": "initial",
      "maxSize": "300 kB",
      "warningSize": "200 kB"
    }
  ]
}
```

## 📦 Bundle Analysis

After building, a detailed bundle analysis is generated at:

```
dist/bundle-analysis/stats.html
```

Open this file in a browser to visualize:
- Bundle composition
- Module dependencies
- Size breakdown by library
- Gzip and Brotli compression ratios

## 🎯 Optimization Tips

### If Budgets Fail

1. **Check the bundle analysis** to identify large modules
2. **Consider code splitting** for rarely used features
3. **Remove unused dependencies**
4. **Enable tree shaking** for better dead code elimination
5. **Use dynamic imports** for heavy components

### Monitoring

- Run `npm run check:budget` regularly during development
- Review bundle analysis when adding major features
- Set up CI alerts for budget violations

## 🔍 Continuous Monitoring

The `.github/workflows/performance-budget.yml` workflow:

- ✅ Checks budgets on every PR
- 📊 Posts results as PR comments
- 📦 Uploads bundle analysis as artifacts
- 🚫 Blocks merges if budgets fail

## 📝 Updating Budgets

When adjusting budgets:

1. Update `performance-budget.config.json`
2. Consider performance implications
3. Document reasons for increases
4. Get team consensus for major changes

## 🛠️ Troubleshooting

### "No build files found"
```bash
npm run build
npm run check:budget
```

### Budgets failing locally but passing in CI
- Check for environment differences
- Verify NODE_ENV settings
- Compare build outputs between environments

### Bundle analysis not generating
- Ensure `rollup-plugin-visualizer` is installed
- Check write permissions for `dist/` directory
