# 美食搭配小助手

真实大模型智能食谱 Agent Demo。用户输入想吃的菜，系统调用 OpenAI 兼容模型，由模型选择工具搜索 TheMealDB / TheCocktailDB，最后返回菜谱、食材、步骤摘要和配饮建议。

## 技术栈

- Next.js
- React
- OpenAI Node SDK
- CSS

## 目录结构

```txt
eat-agent/
  app/
    api/chat/route.js
    page.js
    globals.css
    layout.js
  lib/
    agent.js
    tools.js
  docs/
    reverse-engineering-prompt.md
  .env.example
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

```txt
OPENAI_API_KEY=你的 API Key
OPENAI_MODEL=gpt-5.5
OPENAI_BASE_URL=https://api.openai.com/v1
```

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
OpenAI Responses API
  ↓
TheMealDB / TheCocktailDB
  ↑
lib/tools.js
  ↓
OpenAI Responses API
  ↓
SSE: trace / cards / delta / done
  ↓
app/page.js 实时渲染
```

## 大模型调用流程

一次完整请求通常调用大模型多次：

```txt
1. 根据用户输入判断调用 search_meals / get_meal_detail / search_cocktails
2. 后端执行工具并调用公开 API
3. 把工具结果回传给大模型
4. 大模型可继续调用下一个工具
5. 结合工具结果，流式生成最终回答
```

工具结果由 `lib/tools.js` 返回，大模型负责选择工具、生成参数和总结最终回复。

## 倒推项目提示词

见：

```txt
docs/reverse-engineering-prompt.md
```

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

当前未配置自动化测试。

## 常用脚本

- `npm run dev`：本地开发
- `npm run build`：生产构建
- `npm run start`：启动生产服务
- `npm run lint`：代码检查

## 部署说明

可部署到支持 Next.js 的平台。部署时配置 `OPENAI_API_KEY`、`OPENAI_MODEL` 和 `OPENAI_BASE_URL`。

## 许可证

待补充。
