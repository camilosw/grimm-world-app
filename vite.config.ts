/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Worktrees (.claude/worktrees) hold copies of the tests, with their own node_modules: run only this checkout's.
    exclude: [...configDefaults.exclude, '.claude/**'],
    // npm run test:coverage (CI): the rules modules must stay covered by tests, each on its own. The random games
    // (properties.test.ts) cover a little more or less each run: leave some room below what they reach.
    coverage: {
      provider: 'v8',
      include: ['src/*.ts', 'src/lib/**/*.ts', 'src/legacy/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/env.d.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        'src/{lib/engine/{areas,actions,decks,validate,accepts,arrangement,behaviours,facing,layering,orientation},lib/ui/commands,areas,battlefield,storybook,decks,save,setup,validate}.ts':
          {
            perFile: true,
            statements: 85,
            lines: 85,
            functions: 85,
            branches: 75,
          },
        // The frozen migrations of saves from before version 3: the saves of each release, and what those don't hold.
        'src/legacy/*.ts': {
          perFile: true,
          statements: 85,
          lines: 85,
          functions: 85,
          branches: 75,
        },
      },
    },
  },
});
