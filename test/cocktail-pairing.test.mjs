import fs from 'node:fs';

const agent = fs.readFileSync(new URL('../lib/agent.js', import.meta.url), 'utf8');
const tools = fs.readFileSync(new URL('../lib/tools.js', import.meta.url), 'utf8');

if (!agent.includes('配饮不要使用 random')) {
  throw new Error('system prompt should forbid random cocktail pairing');
}

if (!tools.includes('配餐时不要使用 random')) {
  throw new Error('cocktail tool description should discourage random pairing');
}
