import fs from 'node:fs';

const agent = fs.readFileSync(new URL('../lib/agent.js', import.meta.url), 'utf8');

if (!agent.includes('查看某个菜谱详情')) {
  throw new Error('detail follow-up should require cocktail pairing');
}

if (!agent.includes('先调用 get_meal_detail')) {
  throw new Error('detail follow-up should fetch meal detail first');
}

if (!agent.includes('再调用 search_cocktails')) {
  throw new Error('detail follow-up should also search cocktails');
}
