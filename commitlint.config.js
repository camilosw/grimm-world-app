// Conventional Commits, with the scopes listed in CLAUDE.md (and `release`,
// written by `npm run release`).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'areas',
        'battlefield',
        'browse',
        'decks',
        'encounter-bar',
        'figures',
        'rules',
        'search',
        'sidebar',
        'storybook',
        'tray',
        'save',
        'pwa',
        'deploy',
        'scripts',
        'release',
      ],
    ],
  },
};
