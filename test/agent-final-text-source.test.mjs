import fs from 'node:fs';

const source = fs.readFileSync(new URL('../lib/agent.js', import.meta.url), 'utf8');

if (source.includes('getTextFromResponse(input.at(-1))')) {
  throw new Error('final answer must be read from the last model response, not input.at(-1)');
}
