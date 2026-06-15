import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');

if (!source.includes('function sortCardsForDisplay')) {
  throw new Error('cards should be sorted before display');
}

if (!source.includes('meal: 0') || !source.includes('cocktail: 1')) {
  throw new Error('meal cards should be displayed before cocktail cards');
}
