import fs from 'node:fs';

const source = fs.readFileSync(new URL('../lib/agent.js', import.meta.url), 'utf8');

if (!source.includes('function isFoodIntent')) {
  throw new Error('agent should detect food intent before forcing tool calls');
}

if (!source.includes('const shouldUseTools = isFoodIntent')) {
  throw new Error('tool forcing should be gated by food intent');
}

if (!source.includes('!shouldUseTools')) {
  throw new Error('non-food input should be allowed to answer without tools');
}
