# Moonbot 与根项目融合复盘（2026-07-11）

> 用途：在回滚、重新设计融合方案之前，保存本轮已经验证过的事实、踩坑与重做顺序。
>
> 当前快照：`moonbot/main` 位于 `e4d1e37`；本轮主要功能提交为 `86c5dee 融合修改`。

## 1. 最重要的结论

这轮最大的问题不是“代码有没有复制过去”，而是“能力有没有接入当前实际运行的链路”。仓库里同时存在根项目 Next.js、Moonbot Next.js、NestJS BFF 和 code2video。只把文件搬到同一个仓库，不等于完成融合。

重新实现时必须先确定唯一运行入口，再以用户行为作为验收标准：从 Moonbot UI 发起课程，是否真正经过目标 API、配置、存储和播放链路。不能以“文件存在”“单元测试通过”作为融合完成的依据。

## 2. 当前真实架构

### 2.1 四个运行域

1. 根目录 `app/`、`lib/`、`components/`
   - 原完整项目的 Next.js 实现。
   - 包含此前已经做过的语言统一、防重入、Agent 交流、教师端/家长端/互动能力的保留代码等。
   - 当前 Moonbot UI 启动时不会自动执行这里的页面和 API。

2. `frontend/`
   - Moonbot 当前实际运行的 Next.js 前端。
   - 用户访问的学生首页、课程生成、课堂播放、TTS 设置与 IndexedDB 都在这里。
   - 根项目修复若没有移植并接到这里的调用链，用户侧不会生效。

3. `backend/`
   - Moonbot 整理后的 NestJS BFF。
   - 当前主要负责健康检查与 DeepSolve/code2video 任务代理，并不是完整替代根项目所有 Next.js API 的后端。

4. code2video/Manim 服务
   - 负责生成 Manim 视频、旁白音频并合成视频。
   - 与课堂老师逐句 TTS 是不同运行时、不同存储与播放方式。

### 2.2 已确认的 API 边界

NestJS BFF 目前核心端点是：

- `GET /health`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/:taskId`
- `GET /api/v1/tasks/:taskId/events`
- `GET /api/v1/tasks/:taskId/video`

课堂生成、Agent、互动、逐句 TTS 等大量能力仍由 `frontend/app/api/` 承担。因此不能因为 BFF 更整洁，就直接删除根项目对应代码；必须先证明行为、输入输出、错误语义和持久化方式等价。

## 3. 本轮踩坑

### 3.1 把“复制代码”误当成“融合能力”

根项目提交 `91a5311`、`a1e19c9` 中的能力最初仍留在根目录，Moonbot 实际运行的 `frontend/` 没有调用，所以用户看到的是“修复全部没生效”。

教训：每项能力都必须从 UI 入口沿调用链检查到 API、状态存储、播放和错误反馈。至少要做一次真实端到端请求。

### 3.2 同仓库有两套 Next.js，极易改错目录

根目录和 `frontend/` 文件结构高度相似，文件名也相同。修改根目录页面后，访问 Moonbot 前端不会有任何变化。

教训：重做时应在文档和脚本中明确 canonical runtime。若 Moonbot UI 为唯一前端，应将 `frontend/` 设为唯一活动实现；根项目代码只作为迁移来源，不能长期维持两套可编辑副本。

### 3.3 “关闭互动开关”不等于“不会生成互动课件”

第一次只隐藏了学生首页的互动模式和职教入口，但普通 `requirements-to-outlines` 提示词本身允许每门课程生成 1–2 个 `interactive` 场景，所以仍产生了“月相盈亏三维动态模拟”这种 `visualization3d` 页面。

完整暂停互动至少要覆盖：

- 首页入口与持久化设置；
- 请求中的 `interactiveMode` / `taskEngineMode`；
- 普通提示词中对 interactive widget 的许可；
- 服务端输出归一化；
- 已缓存的 outline；
- 提纲编辑器的类型选择；
- 暂停前已生成场景的播放兜底。

教训：功能开关必须是跨入口、生成、缓存、编辑和播放的统一策略，不能只是 UI 开关。未来恢复时也应从一个集中式 flag 恢复，而不是散落地取消注释。

### 3.4 Manim TTS 与老师 TTS 看似相同，实际是两套系统

Manim 视频旁白：

- code2video 服务端直接读取豆包配置；
- 服务端生成音频并烧录进视频；
- 不依赖浏览器设置与 IndexedDB。

老师讲课 TTS：

- Moonbot `frontend` 在课程生成时逐句调用 `/api/generate/tts`；
- 是否生成受浏览器 Zustand 持久化状态中的 `ttsEnabled`、`ttsProviderId`、voice 等影响；
- 音频写入浏览器 IndexedDB，播放时按 `audioId` 查找；
- 若生成时没开启 TTS，播放只走静默阅读计时，不会自动调用豆包补音频；
- 后来启用豆包不会自动为旧课程补齐音频。

本轮实测：

- `/api/server-providers` 能识别 `doubao-tts`；
- 课堂 `/api/generate/tts` 使用豆包成功返回有效 MP3；
- 因此“老师无声”不是豆包 Key 或参数错误，而是浏览器侧旧设置和缺少音频回填机制。

更深层的坑：`autoConfigApplied` 一旦在旧浏览器状态中变为 `true`，之后服务端新增豆包 provider 时，不一定会自动切换 provider 并启用 TTS。只对“首次配置”做自动选择不够。

### 3.5 服务端配置与浏览器配置双重真相

LLM、TTS、图片、视频 provider 同时存在服务端环境变量和浏览器持久化配置。服务端明明可用，浏览器仍可能保持旧 provider、关闭状态或旧 voice。

教训：管理员配置的 provider 应由服务端权威决定“是否可用”和默认路由；浏览器只保存用户偏好，如静音、音量、语速和允许选择的音色。新增服务端 provider 时必须考虑已有用户的迁移，不仅是新用户首次启动。

### 3.6 DeepSolve “No API key” 是 provider 元数据错误，不是服务真需要 Key

DeepSolve/Manim 是 keyless BFF 路由，但前端通用 video provider 校验曾把它当作必须有 API Key 的 provider，从而在实际请求前就失败。

教训：provider registry 必须明确 `requiresApiKey: false`，调用方以 registry 元数据判断，不能对所有视频 provider 做统一的 Key 非空检查。

### 3.7 Docker 报错不一定是代码或 Dockerfile 问题

曾出现拉取 `node:22-alpine` 和 `manimcommunity/manim` 超时，根因包括 Docker Desktop 未启动和 Docker Hub 网络超时。

教训：先分层检查 Docker daemon、镜像 registry 网络、Compose 配置，再查 Dockerfile。不要把 registry token 超时误判为构建代码错误。

### 3.8 Next.js 参数转发细节会造成错误启动命令

`pnpm dev -- --port 8089` 在该项目脚本下被 Next.js 解释成项目目录 `--port`。正确用法需按脚本实际定义传参，例如 `pnpm dev -p 8089` 或直接调用对应 Next 命令。

教训：启动命令必须在仓库 README/脚本中固化并实测，不能依赖通用记忆。

### 3.9 Vertex AI 不能只把 provider 名称换成 Google

Moonbot 原来的 Google provider 与 Vertex AI 在认证、模型标识、端点和请求参数上并不天然等价。曾出现 `API key required for provider: openai`、`LLM returned empty response`，说明客户端旧 provider 状态、服务端路由和响应解析没有统一。

教训：模型融合要验证完整契约：provider 选择、认证来源、模型名、thinking 参数、响应文本提取、空响应错误日志。不能只修改默认 provider ID。

### 3.10 生成任务没有稳定身份会相互覆盖

旧链路主要依赖固定的 `generationSession` / `generationParams` 键。刷新、重复点击、两次生成或异步回调晚到时，旧结果可能覆盖新课堂。

教训：每次生成必须同时携带 `classroomId`、`generationId`、`sessionId`；任何异步写入前比较当前 generation；参数按 classroom 分区；完成或失败时也要 compare-before-remove。

### 3.11 Agent 交流不能依赖旧的无限 discussion 动作

根项目的学生 Agent 交流能力不能简单复制旧 `discussion` action，否则容易与老师讲课、用户主动聊天和互动场景冲突。

本轮采用的约束值得保留：

- 每个课堂确定性分配 3 个学生人格；
- 每页最多 2 次学生发言，且发言者不同；
- 只在普通 slide 讲解完成后触发；
- quiz、interactive、PBL 不自动插话；
- 用户/老师主动聊天优先；
- 状态保存到 Stage，刷新后不重复触发；
- 新课堂过滤旧的无限 discussion 动作。

### 3.12 语言一致性必须贯穿所有生成阶段

只在大纲提示词里指定中文不够。场景内容、场景动作、背景生成、Agent 发言都可能各自重新推断语言，导致中英文混杂。

教训：创建一次结构化 `lessonLanguage`，从 outline 一直传到 content、actions、media 和 peer message。用户主题与课程语言都应作为 authoritative instruction，而不是普通建议。

### 3.13 防止示例主题漂移不能只靠提示词

模型会把 prompt 示例中的“抛体运动”等主题复制到完全无关课程。仅写“不要偏题”并不可靠。

教训：用户主题必须有最高优先级，并对明显的示例主题漂移做输出检测和重试。通用 topic guard 应独立于“人文/Manim”专线存在。

### 3.14 单元测试通过仍可能用户侧无效

本轮多次出现：类型检查和单测通过，但真实页面仍走另一份代码、浏览器残留旧设置、服务端进程未重启读取新 env，或已有课程缺少历史音频。

教训：至少增加以下验收环境：

- 全新浏览器 profile；
- 已有 `settings-storage` 的老用户；
- 已生成旧课程；
- 前后端分别重启/不重启；
- 真实 `/api/server-providers`、`/api/generate/tts`、peer-message 请求；
- IndexedDB 中确实存在对应 `audioId`；
- 页面刷新与并发生成。

### 3.15 推送前必须先 fetch，远端可能已前进

本轮准备推送时，`moonbot/main` 已新增星燧六大预设提交。先 fetch 后合并避免覆盖队友工作。合并没有内容冲突，但远端落地页测试仍断言旧的 myth 路由，必须补测后才能通过。

教训：直接推 main 前必须 fetch、比较提交图、运行合并后的测试。无冲突不代表无语义回归。

## 4. 哪些能力值得保留

以下能力在本轮已经接到 Moonbot `frontend/` 实际链路并有测试，可作为重做时的参考实现，而不是盲目复制：

- Vertex AI 服务端路由与前端共享模型配置；
- DeepSolve keyless provider 校验与 NestJS BFF 代理；
- 结构化 lesson language；
- 通用主题漂移保护；
- `classroomId` / `generationId` 生成隔离；
- 有界学生 Agent 交流；
- 播放完成/失败状态区分；
- DeepSolve mode 与 narrative context 的结构化透传；
- 互动课件的集中暂停保护；
- 豆包 TTS 2.0 provider 实现与课堂 TTS API。

注意：人文/Manim 专线后来被明确要求暂停。本轮相关 narrative/mode 代码可以作为设计参考，但不要在重做时继续扩展，直到产品侧重新下达指令。

## 5. 绝对不能误删的内容

根项目中被注释或隐藏的能力通常是“暂时暂停，未来恢复”，不是废代码，包括但不限于：

- 教师端；
- 家长端；
- 课件互动模式；
- 职教任务模式；
- 相关 badge、入口、类型和 renderer；
- 未来 Agent 互动扩展。

重做时可用集中式 feature flag 暂停，但不能物理删除实现。后端去重也只能在“Moonbot 行为完全等价且实现更简洁”经过测试证明后进行。

## 6. 推荐的重新融合顺序

### 阶段 0：保存回滚前证据

1. 给 `e4d1e37` 建只读 tag 或备份分支。
2. 保存本复盘文档。
3. 保存本地 `.env.local` 的变量名清单，但不要提交真实密钥。
4. 保留根项目参考点：`91a5311`、`a1e19c9`。
5. 保留 Moonbot 含星燧预设、但不含本轮融合提交的参考点：`83df02d`。

### 阶段 1：先定唯一产品架构

1. 确认 `frontend/` 是唯一活动 Next.js 产品前端。
2. 确认 NestJS BFF 的职责边界。
3. 确认 code2video 只负责视频任务，不拥有课堂状态。
4. 建立“根能力 → Moonbot 模块 → API → 存储 → 验收用例”的迁移矩阵。

### 阶段 2：统一配置与 provider

1. 服务端 provider registry 作为可用性与默认路由的唯一真相。
2. 浏览器只保存用户偏好，不保存管理员 Key。
3. 同时实现新用户初始化与老用户状态迁移。
4. TTS、LLM、图片、视频使用同一种 provider 解析模式。
5. 每个 provider 明确是否需要 API Key、默认 base URL、模型和错误码。

### 阶段 3：先重做老师 TTS

建议目标：

1. Manim 与老师 TTS 共享同一份服务端豆包配置和同一个 adapter/请求契约。
2. 老师 TTS 默认使用服务端豆包，不依赖浏览器是否曾选中过 provider。
3. 浏览器只控制启用、静音、音量、语速、音色。
4. 生成时预生成并缓存逐句音频。
5. 播放发现 `audioId` 缺失时按需补生成，避免静默计时。
6. 对已有课程提供批量回填或重新生成音频能力。
7. 页面明确显示“生成失败/未生成/静音”，不能都表现为无声。

老师 TTS 验收：

- 新浏览器第一次生成即有声音；
- 老浏览器已有 `autoConfigApplied=true` 也能自动采用服务端豆包；
- 旧课程缺少音频时能补生成；
- IndexedDB 删除单句音频后播放能恢复；
- 静音、音量、倍速与音色有效；
- API 限流时有可见错误，不静默失败。

### 阶段 4：重做生成状态与语言

1. 先落 generation identity 和 compare-before-write。
2. 再落结构化 lesson language。
3. 再落 topic guard。
4. 用并发生成、刷新和重试测试作为门禁。

### 阶段 5：重做 Agent 交流

保留有界、可持久化、用户优先的调度模型。不要恢复无限 discussion action，也不要把课件互动与学生交流混成一个 feature flag。

### 阶段 6：最后处理互动、人文和后端去重

1. 互动能力用单一集中式 flag 暂停/恢复。
2. 人文/Manim 线等待明确指令。
3. 后端逐能力证明等价后再删重复代码。
4. 每删除一个根实现，都要有 Moonbot 等价测试与迁移记录。

## 7. 推荐的验收矩阵

| 能力 | 不能只测什么 | 必须验证什么 |
| --- | --- | --- |
| LLM/Vertex | API 返回 200 | 页面真实生成内容、非空响应、旧 provider 状态迁移 |
| DeepSolve | BFF health | 创建任务、SSE、视频 URL、keyless 校验、失败可见性 |
| Manim TTS | 视频有声 | 服务端配置来源、音频确实烧录、错误码 |
| 老师 TTS | `/api/generate/tts` 成功 | 生成时写入 IndexedDB、播放命中、旧课回填、静音状态 |
| 互动暂停 | 首页无按钮 | 普通 prompt、缓存 outline、编辑器、旧场景播放都不能漏出 |
| Agent 交流 | endpoint 返回文本 | 时机、次数、不同发言者、刷新不重复、用户优先 |
| 生成隔离 | 单次生成成功 | 双击、并发、刷新、旧异步回调不覆盖新任务 |
| 语言统一 | 大纲是中文 | 内容、动作、媒体 prompt、Agent 发言均一致 |
| 后端去重 | 文件数量变少 | 行为、错误语义、部署与回滚能力完全等价 |

## 8. Git 与安全约束

- 永远不要提交 `微信图片_20260710212234_264_1366.png`。
- 永远不要提交 `.pnpm-store/`。
- 豆包 UUID/API Key 只能留在被忽略的 `.env.local`，不能进入 diff、日志或文档。
- 推送前依次执行 fetch、提交图检查、测试、diff secret scan、push。
- 遇到真实语义冲突应请示；不能为了“无冲突合并”任意选择一边。
- Moonbot UI 优先，但“UI 优先”不等于丢弃根项目核心能力。

## 9. 回滚参考点

| 提交 | 作用 |
| --- | --- |
| `e4d1e37` | 当前 Moonbot main，包含本轮融合和星燧预设 |
| `86c5dee` | 本轮主要融合修改 |
| `83df02d` | 星燧预设已进入 Moonbot，但尚未合入本轮 `86c5dee` 的参考点 |
| `c588277` | Google provider 通过 Vertex AI 路由 |
| `dbb4e05` | 根与 Moonbot 前端共享模型配置 |
| `aab5d1d` | 此前 Moonbot UI 资源同步基线 |
| `91a5311` | 根项目 Agent 交流、语言统一、防重入等能力参考 |
| `a1e19c9` | 根项目隐藏教师/家长/互动及人文 Manim 修复参考 |

## 10. 一句话交接

回滚重做时，不要再从“把根目录文件搬进 Moonbot”开始；应从“Moonbot 当前用户行为需要哪些能力、每项能力唯一落在哪个运行时、配置和状态谁是权威”开始，然后逐项以真实端到端验收迁移。
