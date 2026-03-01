[English](README.md) | [简体中文](README_CN.md) | [繁體中文](README_TW.md) | [日本語](README_JP.md)

<p align="center">
  <img src="asset/logo.png" alt="PolyCopy" width="200">
</p>

<h1 align="center">PolyCopy</h1>

<p align="center">
  <strong>Polymarket 预测市场自动跟单交易机器人</strong>
</p>

<p align="center">
  <a href="https://github.com/neosun100/polycopy/actions"><img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build"></a>
  <a href="https://github.com/neosun100/polycopy/blob/main/LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://hub.docker.com/r/neosun/polycopy"><img src="https://img.shields.io/badge/docker-ready-2496ED?logo=docker" alt="Docker"></a>
  <img src="https://img.shields.io/badge/tests-40%20passed-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/node-%3E%3D18-green?logo=node.js" alt="Node">
</p>

---

> **⚠️ 安全说明**：本项目 fork 自一个已知的恶意仓库，该仓库包含隐藏的私钥窃取代码。所有恶意代码已被移除，经过 3 轮安全审计，项目已完全以安全优先的理念重写。详见[安全](#-安全)章节。

## ✨ 功能特性

- **多交易者跟单** — 同时追踪和镜像多个顶级 Polymarket 交易者的操作
- **3 种跟单策略** — 百分比、固定金额或自适应策略，支持分层乘数
- **紧急止损保护** — 当日亏损超过阈值时自动停止交易
- **预览模式** — 干跑模式，无需真实资金即可测试
- **交易聚合** — 将多笔小交易合并为可执行的大单
- **持仓追踪** — 即使余额变化也能准确追踪买卖
- **Web 监控面板** — 暗色主题实时监控 UI，支持多语言
- **REST API + Swagger** — 完整 API，交互式文档位于 `/docs`
- **MCP 服务器** — Model Context Protocol 集成，支持 AI 助手访问
- **Telegram 通知** — 交易执行、止损触发和错误告警推送
- **零外部数据库** — 使用 NeDB（本地文件存储），无需 MongoDB
- **Docker 就绪** — 单容器，189MB，一键部署

## 🚀 快速开始

### 方式一：Docker（推荐）

```bash
# 拉取并运行
docker run -d --name polycopy \
  -p 3000:3000 \
  -v polycopy_data:/app/data \
  --env-file .env \
  neosun/polycopy:latest

# 打开监控面板
open http://localhost:3000
```

### 方式二：从源码运行

```bash
git clone https://github.com/neosun100/polycopy.git
cd polycopy
npm install
cp .env.example .env   # 编辑配置
npm run build
npm start              # 机器人 + Web UI 运行在 3000 端口
```

## ⚙️ 配置说明

将 `.env.example` 复制为 `.env` 并配置：

```bash
# 必填
USER_ADDRESSES='0xTraderAddress1,0xTraderAddress2'  # 要跟单的交易者
PROXY_WALLET='0xYourWalletAddress'                   # 你的钱包
PRIVATE_KEY='your_64_hex_private_key'                # 不带 0x 前缀
RPC_URL='https://polygon-mainnet.infura.io/v3/KEY'   # Polygon RPC

# 策略（显示默认值）
COPY_STRATEGY='PERCENTAGE'    # PERCENTAGE | FIXED | ADAPTIVE
COPY_SIZE=10.0                # 交易者订单的 10%
MAX_ORDER_SIZE_USD=100.0      # 单笔最大金额
SLIPPAGE_TOLERANCE=0.05       # 最大价格偏差

# 安全
DAILY_LOSS_CAP_PCT=20         # 日亏损 20% 触发止损
PREVIEW_MODE=false            # 设为 true 可测试不交易

# 可选
TELEGRAM_BOT_TOKEN='...'      # 从 @BotFather 获取
TELEGRAM_CHAT_ID='...'        # 你的聊天 ID
```

完整配置项请参见 [.env.example](.env.example)。

## 🖥️ 访问方式

| 模式 | 地址 | 说明 |
|------|------|------|
| Web UI | `http://localhost:3000` | 交易监控面板 |
| Swagger | `http://localhost:3000/docs` | 交互式 API 文档 |
| REST API | `http://localhost:3000/api/*` | 程序化访问 |
| MCP | stdio | AI 助手集成 |

## 🛡️ 安全

本项目 fork 自[已知恶意仓库](https://phemex.com/blogs/openclaw-polymarket-automated-trading-analysis)，经过全面安全加固：

- ✅ 移除隐藏的私钥窃取代码（`keccak256-helper` 供应链攻击）
- ✅ 移除 2 个恶意 npm 包
- ✅ 移除文档中泄露的 MongoDB 凭据和 API 密钥
- ✅ 3 轮安全审计（代码、依赖、网络请求）
- ✅ 预提交密钥扫描脚本（`npm run check-secrets`）
- ✅ 每次启动前自动运行 `npm audit`
- ✅ 启动时私钥格式校验
- ✅ 无外部数据泄露 — 仅连接 Polymarket API 和 Polygon RPC

## 🧪 测试

```bash
npm test                # 运行全部 40 个测试
npm run test:coverage   # 带覆盖率报告
npm run check-secrets   # 扫描泄露的密钥
npm run health-check    # 验证所有连接
```

## 🔧 技术栈

| 组件 | 技术 |
|------|------|
| 语言 | TypeScript 5 |
| 运行时 | Node.js 18+ |
| 交易 | @polymarket/clob-client（官方） |
| 区块链 | ethers.js v5（Polygon） |
| 数据库 | NeDB（本地文件，零配置） |
| Web UI | Express.js + 原生 JS |
| API 文档 | Swagger UI |
| MCP | @modelcontextprotocol/sdk |
| 测试 | Jest + ts-jest |
| 容器 | Docker（Alpine，189MB） |

## 🤝 贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing`)
3. 运行测试 (`npm test`)
4. 提交更改 (`git commit -m 'Add amazing feature'`)
5. 推送分支 (`git push origin feature/amazing`)
6. 发起 Pull Request

## 📄 许可证

MIT License — 详见 [LICENSE.md](LICENSE.md)

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=neosun100/polycopy&type=Date)](https://star-history.com/#neosun100/polycopy)

## 📱 关注公众号

![公众号](https://img.aws.xin/uPic/扫码_搜索联合传播样式-标准色版.png)

---

**免责声明**：本软件仅供教育目的。交易存在亏损风险，请只投入你能承受损失的资金。
