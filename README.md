# 智能食谱助手

大模型智能食谱 Agent Demo。用户输入想吃的菜，系统调用 OpenRouter / OpenAI 兼容模型，由模型选择工具搜索 TheMealDB / TheCocktailDB，最后返回菜谱、食材、步骤摘要和配饮建议。

支持多轮对话、流式输出、工具调用轨迹、结构化菜谱/饮品卡片，以及素食、地区菜系、食材等偏好快捷入口。

## 技术栈

- Next.js
- React
- OpenAI Node SDK
- OpenRouter API
- CSS

## 目录结构

```txt
food-agent/
  app/
    api/chat/route.js
    page.js
    globals.css
    layout.js
    icon.svg
  lib/
    agent.js
    tools.js
  test/
    *.test.mjs
  .gitignore
  .env.example
  agent.md
  需求文档.md
  架构设计文档.md
  package.json
  README.md
```

## 安装依赖

```bash
npm install
```

## 环境变量配置

复制环境变量文件：

```bash
cp .env.example .env.local
```

填写：

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

## 调用链路

```txt
用户输入
  ↓
app/page.js
  ↓
POST /api/chat
  ↓
app/api/chat/route.js
  ↓
lib/agent.js
  ↓
OpenRouter Chat Completions API / OpenAI Responses API
  ↓
TheMealDB / TheCocktailDB
  ↑
lib/tools.js
  ↓
OpenRouter Chat Completions API / OpenAI Responses API
  ↓
SSE: trace / cards / delta / done / error
  ↓
app/page.js 实时渲染回答、卡片和工具调用详情
```

## 大模型调用流程

一次完整请求通常调用大模型多次：

```txt
1. 根据用户输入和历史上下文判断调用 search_meals / get_meal_detail / search_cocktails
2. 后端执行工具并调用公开 API
3. 把工具结果回传给大模型
4. 大模型可继续调用下一个工具
5. 结合工具结果，流式生成最终回答
```

工具结果由 `lib/tools.js` 返回，大模型负责选择工具、生成参数和总结最终回复。`app/page.js` 会把本轮 `trace` 事件挂到当前助手消息中，调用期间显示当前工具链路，例如 `调用工具：搜索菜谱 → 搜索饮品`；回复完成后折叠为 `工具调用详情`，展开后可查看每一步工具名、参数和结果摘要。

SSE 事件说明：

- `trace`：单次工具调用记录，包含工具名、参数和结果摘要。
- `cards`：结构化菜谱/饮品卡片数据。
- `delta`：最终回复文本增量。
- `done`：流式响应完成。
- `error`：服务端处理失败时返回用户可读错误。

异常处理：

- `OPENROUTER_API_KEY` / `OPENAI_API_KEY` 缺失或鉴权失败时返回明确配置提示。
- TheMealDB / TheCocktailDB 请求失败或超时时返回“公开菜谱数据暂时不可用”。
- 工具参数解析失败会记录为工具错误，不直接中断整轮调用。
- 前端会处理空响应、非 JSON 错误响应和 SSE 解析失败。

偏好过滤通过 `search_meals` 的 `mode` 实现：

- `ingredient`：按食材，例如 chicken
- `category`：按分类，例如 Vegetarian
- `area`：按地区菜系，例如 Italian、Mexican

## 本地启动

```bash
npm run dev
```

访问：

```txt
http://localhost:3000
```

## 构建命令

```bash
npm run build
```

## 测试命令

```bash
for f in test/*.mjs; do node "$f" || exit 1; done
```

## 常用脚本

- `npm run dev`：本地开发
- `npm run build`：生产构建
- `npm run start`：启动生产服务
- `npm run lint`：代码检查

## 部署说明

可部署到支持 Next.js 的平台。部署时配置 OpenRouter 或 OpenAI 任意一组环境变量。

## 许可证

待补充。
