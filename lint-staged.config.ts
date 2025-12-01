export default {
  '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
  //'*.{css,scss,less}': ['stylelint --fix', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
  '*.{ts,tsx}': () => {
    return 'tsc -p tsconfig.json';
  },
};
