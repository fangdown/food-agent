# food-agent Agent 说明

## Agent 定位

智能食谱助手。用户用中文描述想吃什么，Agent 调用模型判断需要哪些工具，再查询公开菜谱和饮品数据，最后返回主菜、配饮、主要食材、烹饪要点和搭配建议。

## 模型配置

支持 OpenRouter 和 OpenAI。

OpenRouter：

```txt
OPENROUTER_API_KEY=你的 OpenRouter API Key
OPENROUTER_MODEL=openai/gpt-oss-120b:free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

OpenAI：

```txt
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-5.5
OPENAI_BASE_URL=https://api.openai.com/v1
```

优先级：配置了 `OPENROUTER_API_KEY` 时走 OpenRouter；否则走 OpenAI。

## Agent 行为规则

- 询问菜谱、晚餐推荐、食材搭配或饮品搭配时，必须先调用工具获取真实公开 API 数据。
- 不凭空编造菜谱或饮品。
- 推荐一顿饭时，至少调用 `search_meals`。
- 需要配饮时，同时调用 `search_cocktails`。
- 用户查看某个菜谱详情时，先调用 `get_meal_detail`，再调用 `search_cocktails`。
- 用户只说推荐晚餐时，只给一个主菜和配饮，不主动推荐配菜。
- 配饮根据主菜食材、菜系或风味选择英文关键词搜索，不默认使用 `random`。

## 工具列表

`search_meals`

- 来源：TheMealDB
- 用途：按名称、食材、分类、地区或随机搜索菜谱。
- 常用模式：`name`、`ingredient`、`category`、`area`、`random`

`get_meal_detail`

- 来源：TheMealDB
- 用途：按 `idMeal` 获取菜谱详情、食材、用量、步骤、图片、分类和地区。

`search_cocktails`

- 来源：TheCocktailDB
- 用途：按名称、食材或随机搜索饮品。
- 常用模式：`name`、`ingredient`、`random`

## 调用流程

```txt
用户输入
  ↓
POST /api/chat
  ↓
runFoodAgentStream
  ↓
模型选择工具
  ↓
lib/tools.js 查询 TheMealDB / TheCocktailDB
  ↓
工具结果回传模型
  ↓
模型生成最终回答
  ↓
SSE 返回 trace / cards / delta / done / error
```

## 关键文件

- `app/api/chat/route.js`：聊天接口和 SSE 输出。
- `lib/agent.js`：模型调用、工具调用循环、OpenRouter / OpenAI 配置。
- `lib/tools.js`：TheMealDB / TheCocktailDB 工具实现。
- `app/page.js`：聊天界面、卡片和工具调用轨迹展示。

## 本地验证

```bash
npm run dev
for f in test/*.mjs; do node "$f" || exit 1; done
npm run build
```
