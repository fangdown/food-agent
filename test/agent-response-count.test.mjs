import fs from 'node:fs';

const source = fs.readFileSync(new URL('../lib/agent.js', import.meta.url), 'utf8');
const streamSource = source.slice(source.indexOf('export async function runFoodAgentStream'));

if (!streamSource.includes('let finalText = "";')) {
  throw new Error('runFoodAgentStream should preserve the final model text');
}

if (!streamSource.includes('finalText = getTextFromResponse(response);')) {
  throw new Error('runFoodAgentStream should read final text from the model response');
}

if (streamSource.includes('已完成搭配，但模型没有返回文本')) {
  throw new Error('runFoodAgentStream should fallback to streaming instead of returning a weak placeholder');
}
