# 格物 Lab

个人学习与知识实验平台。用 Workspace 组织不同的学习方向，用 Markdown 卡片沉淀知识、题目、实验与思考。

## 当前功能

- 多 Workspace 管理
- 单一 Markdown 卡片模型，不区分知识点与题目
- Markdown 与 LaTeX 公式渲染
- Milkdown Crepe 所见即所得编辑器
- 编辑器内置 AI：选区改写、光标插入、流式输出与差异确认
- AI 对话框支持粘贴或拖入图片，识别为 Markdown/LaTeX
- 标签、搜索、创建时间、修改时间和上次查看时间
- 图片附件持久化
- 面向 AI/外部程序的 Bearer Token API 与 OpenAPI 文档

## 技术栈

- 前端：React、TypeScript、Vite、Milkdown Crepe、KaTeX
- 后端：Python、FastAPI、SQLAlchemy、Alembic
- 本地开发数据库：SQLite
- Docker 部署数据库：PostgreSQL
- AI：OpenAI 兼容接口，默认使用 AiPing 与 `Qwen3.5-35B-A3B`

## 单容器 Docker 部署

根目录 `Dockerfile` 适用于只支持单 Dockerfile 的部署平台。它会构建前端，并由 FastAPI 同时提供网页和 API。

```bash
docker build -t gewu-lab .
docker run -p 8000:8000 \
  -e GEWU_API_TOKEN=随机长令牌 \
  -e AI_API_KEY=AI服务密钥 \
  -v gewu_data:/data \
  gewu-lab
```

访问 http://localhost:8000。单容器模式默认使用 `/data/gewu.db` 的 SQLite；也可以通过 `DATABASE_URL` 连接外部 PostgreSQL。

## Docker Compose 启动

Compose 模式使用独立的 PostgreSQL、FastAPI 和 Nginx 容器，要求 Docker Compose。

```bash
cp .env.example .env
```

编辑 `.env`，至少设置：

```bash
GEWU_API_TOKEN=用于外部API的随机长令牌
AI_API_KEY=AI服务密钥
AI_BASE_URL=https://aiping.cn/api/v1
AI_MODEL=Qwen3.5-35B-A3B
```

然后运行：

```bash
docker compose up --build
```

访问：

- 网页：http://localhost:3000
- API 文档：http://localhost:8000/api/docs

## 本机开发

推荐 Python 3.12 和 Node.js 22。

后端：

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd backend
mkdir -p ../instance
DATABASE_URL=sqlite:///../instance/gewu.db ../.venv/bin/alembic upgrade head
DATABASE_URL=sqlite:///../instance/gewu.db \
GEWU_API_TOKEN=gewu-local-token \
AI_API_KEY=你的AI服务密钥 \
../.venv/bin/uvicorn app.main:app --reload --port 8000
```

前端：

```bash
cd frontend
npm ci
npm run dev
```

访问 http://localhost:5173。网页端无需登录。

## API

网页内部接口使用 `/api`，AI 和外部客户端使用带鉴权的 `/api/v1`。

```bash
curl http://localhost:8000/api/v1/workspaces \
  -H "Authorization: Bearer $GEWU_API_TOKEN"
```

主要接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/workspaces` | 获取 Workspace |
| POST | `/api/v1/workspaces` | 创建 Workspace |
| GET | `/api/v1/workspaces/{id}/cards` | 获取或搜索卡片 |
| POST | `/api/v1/workspaces/{id}/cards` | 创建 Markdown 卡片 |
| GET | `/api/v1/cards/{id}` | 只读获取卡片，不记录查看 |
| PATCH | `/api/v1/cards/{id}` | 修改卡片 Markdown 与标签 |
| DELETE | `/api/v1/cards/{id}` | 删除卡片 |
| POST | `/api/v1/cards/{id}/view` | 显式记录网页查看 |

卡片正文使用 Markdown，可直接包含 `$...$` 行内公式和多行 `$$` 独立公式。

## 数据与文件

- 本机 SQLite 数据：`instance/gewu.db`
- 本机图片：`instance/assets/`
- Docker PostgreSQL 数据：`postgres_data` volume
- Docker 图片：`asset_data` volume

## 项目结构

```text
backend/
  app/                 FastAPI、数据模型与 API
  alembic/             数据库迁移
frontend/
  src/                 React 页面与 Milkdown 编辑器
compose.yaml           PostgreSQL、后端和前端容器编排
```
