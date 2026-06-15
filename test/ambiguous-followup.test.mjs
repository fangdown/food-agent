import fs from 'node:fs';

const agent = fs.readFileSync(new URL('../lib/agent.js', import.meta.url), 'utf8');

if (!agent.includes('指代不明确')) {
  throw new Error('ambiguous follow-up should be handled explicitly');
}

if (!agent.includes('不要猜测、不重新搜索')) {
  throw new Error('ambiguous follow-up should ask before searching again');
}

if (!agent.includes('追问用户要查看哪一个')) {
  throw new Error('ambiguous follow-up should ask the user for clarification');
}
