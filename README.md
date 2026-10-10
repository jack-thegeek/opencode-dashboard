# CC-Switch OpenCode 统计与请求日志分析看板 (Dashboard)

这是一个使用 **Next.js (App Router)** + **pnpm** 构建的 AI 编码会话统计分析全栈项目。它直接读取并同步位于 `/home/jackson/.local/share/opencode/opencode.db` 的 OpenCode SQLite 数据库中的 `session` 数据，生成精美的 Token 消耗折线图、模型用量分布、核心消费统计指标和详细请求日志。

## 功能特性

1. **一键同步数据**
   - 物理隔离：通过 `/api/sync` 接口，一键将 OpenCode 的 `session` 表增量/覆盖同步到本地 `dashboard.db`，确保分析过程不损坏或锁死源数据库。
   - 记录同步历史（时间、成功状态、同步数量、错误日志）。
   
2. **多维度核心统计卡片**
   - **预估消费**：以美元展示当前时间段内的预估消费，并记录库内累计花费。
   - **Token 消耗数**：展示总消耗 Token 数，并详细区分 Input 与 Output 占比。
   - **会话交互数**：展示过滤区间内的会话交互次数与全局总交互次数。
   - **次均消耗/花费**：自动计算单次会话的次均 Token 用量与次均成本。

3. **Token 消耗走势折线图**
   - 使用 Recharts 绘制曲线，以优雅的渐变和交互式 Tooltip 展示输入 Token 和输出 Token 的波动情况。
   - 支持多级时间粒度聚合（1h、2h、6h、day），曲线平滑灵动。

4. **模型用量占比分布**
   - 自动解析 `session` 表中以 JSON 形式存储的 `model` 字段（包含 model id、provider、variant）。
   - 按模型统计交互次数、Token 消耗以及预估花费，并利用精美的彩虹进度条可视化其占比比例。

5. **高级请求日志列表**
   - **全局实时搜索**：按会话标题、文件目录或 Session ID 过滤日志。
   - **模型过滤**：支持通过下拉菜单，仅过滤展示指定模型的交互日志。
   - **抽屉式详情折叠 (Accordion)**：点击单行日志可展开完整细节：
     - 代码文件改动统计（影响文件数、增加行数、删除行数）。
     - Token 细分详情（如 Reasoning Token 用量等）。
     - 原始 UUID 元数据详情。

6. **双时间基准支持 (Time Reference Mode)**
   - **历史数据基准 (Historical Record)**：由于开发/测试数据库可能无今日实时数据，在此模式下，时间区间过滤将**以库内最新一条数据的产生时间为相对终点**进行聚合，确保立即呈现精美满载的统计折线与日志。
   - **实时数据基准 (Realtime Now)**：基于当前系统的真实绝对时间 (`Date.now()`) 进行过滤，适用于生产环境或高频活跃场景。

## 技术栈与设计美学

- **核心框架**：Next.js 16.2.10 (App Router, JavaScript)
- **数据库**：`better-sqlite3`（支持原生快速读写与事务合并）
- **图标系统**：`lucide-react`
- **图表系统**：`recharts` (Responsive SVG 图表)
- **包管理**：`pnpm`
- **样式系统**：极简现代的 Vanilla CSS 变量系统，主打暗色调玻璃拟物化设计 (Dark Theme Glassmorphism)，包括呼吸灯效果、渐变文字、圆角磨砂及响应式自适应布局。

## 快速上手

### 1. 安装依赖
```bash
pnpm install
```

### 2. 启动开发服务器
```bash
pnpm dev
```
启动后，在浏览器中访问 [http://localhost:3000](http://localhost:3000)。

### 3. 构建生产包
```bash
pnpm run build
```

---
*Created as a fullstack dashboard solution for AI Assistant Analytics.*
