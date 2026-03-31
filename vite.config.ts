import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load performance budget configuration
const loadBudgetConfig = () => {
  try {
    const configPath = join(process.cwd(), 'performance-budget.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config;
  } catch (error) {
    console.warn('Could not load performance budget config:', error.message);
    return null;
  }
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const budgetConfig = loadBudgetConfig();

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        // Bundle analyzer for performance monitoring
        visualizer({
          filename: './dist/bundle-analysis/stats.html',
          open: false,
          gzipSize: true,
          brotliSize: true,
          template: 'treemap'
        })
      ],
      build: {
        // Performance budget configuration
        rollupOptions: {
          output: {
            manualChunks: {
              // Split vendor chunks for better caching
              'react-vendor': ['react', 'react-dom'],
              'utils-vendor': ['date-fns'],
              'network-vendor': ['peerjs', 'ws']
            }
          }
        },
        // Enable strict size checks
        chunkSizeWarningLimit: 150,
        // Optimize build for performance
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: mode === 'production',
            drop_debugger: mode === 'production'
          }
        }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      }
    };
});
