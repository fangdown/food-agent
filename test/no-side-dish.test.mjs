import fs from 'node:fs';

const agent = fs.readFileSync(new URL('../lib/agent.js', import.meta.url), 'utf8');

if (!agent.includes('不要主动推荐配菜')) {
  throw new Error('system prompt should forbid unsolicited side dishes');
}

if (!agent.includes('主菜和配饮')) {
  throw new Error('dinner recommendation should focus on main dish and drink');
}
