# 星燧落地页与单学生端设计

## 目标

把 `origin/frontend` 分支的静态 HTML 落地页迁移为 Next.js 页面，在视觉、布局、图片和交互上保持一致；增加向下滚动动效；把 OpenMAIC 前端裁剪为中文单学生端，并在课堂内只保留一个教师 Agent。

## 范围

### 落地页

- `/` 使用 `origin/frontend` 的四屏落地页：星燧封面、浪漫幻想、中国现代航天、定价策略。
- 原始图片迁入 `frontend/public/landing/`。
- Tailwind CSS v4 继续由现有 `@tailwindcss/postcss` 配置驱动。
- 常规布局、响应式与 CTA 使用 Tailwind；复杂天体定位、背景叠层、伪元素和光效使用落地页专用 CSS。
- “进入星燧”平滑滚动到下一屏。
- 支持滚轮、上下方向键和按钮导航；区块进入视口时执行淡入上移，背景与天体使用轻量视差。
- `prefers-reduced-motion: reduce` 下关闭平滑滚动、视差和非必要动画。
- 定价区增加“直接体验”按钮，进入 `/student`。

### 预设主题

- 太阳、月球、荧惑、银河入口统一跳转 `/student?preset=myth`。
- 回收火箭入口跳转 `/student?preset=rocket`。
- 嫦娥入口作为普通入口进入 `/student`，不附带预设。
- `myth` 与 `rocket` 对应两个集中维护的中文固定提示词。
- 学生页识别有效 preset 后立即创建 generation session 并跳转 `/generation-preview`。
- 同一页面挂载周期只自动触发一次；未知 preset 不触发生成，并保留普通学生页。

## 单学生端裁剪

- 删除 workspace 角色侧栏，workspace shell 只渲染学生内容。
- `/teacher`、`/parent`、`/admin` 不再提供功能页面，统一重定向到 `/student`，避免历史链接进入废弃界面。
- 登录、注册和学生主页的可见文案改为中文；注册仍只创建 student 账号。
- 学生主页移除语言切换、主题切换、模型设置按钮和设置弹窗。
- 移除 AgentBar 和教师配置入口；学生不能配置模型或 Agent。
- 模型与供应商继续由服务端环境变量和 `ServerProvidersInit` 初始化，生成能力仍以已配置服务端模型为前提。
- 国际化基础设施可暂时保留给内部组件，但所有本次可见入口固定中文，不显示语言切换。

## 单教师 Agent

- Agent profile API 固定只生成一个 role 为 `teacher` 的 Agent，不再请求或接受 assistant/student Agent。
- 提示词明确要求单教师课堂。
- API 对模型返回做归一化：只取一个 teacher；如果没有 teacher，则把第一项归一化为 teacher；如果返回为空则报错。
- generation preview 的 fallback 只创建一个教师 Agent。
- 现有课堂播放与编排继续消费 agent 数组，但数组只包含教师，因此不需要大范围重写底层编排系统。

## 组件边界

- `app/page.tsx`：服务端入口，渲染落地页。
- `components/landing/landing-page.tsx`：客户端滚动、视差、键盘与主题导航。
- `app/landing.css`：命名空间隔离的落地页复杂视觉样式。
- `lib/presets/student-presets.ts`：preset 类型、固定中文提示词和解析函数。
- `app/(workspace)/student/page.tsx`：消费 preset、触发一次生成、渲染精简中文学生主页。
- `app/api/generate/agent-profiles/route.ts`：单教师生成与归一化。

## 数据流

```text
Landing theme click
  -> /student?preset=myth|rocket
  -> resolveStudentPreset(searchParams)
  -> create generationSession(requirement=fixedPrompt)
  -> router.replace('/generation-preview')
  -> generate course with one teacher agent
```

普通访问：

```text
/ -> 直接体验 -> /student -> 用户输入 -> generationSession -> generation-preview
```

## 错误处理

- 未知 preset：忽略，不自动生成。
- 服务端模型未配置：保留学生主页并显示中文错误，不进行跳转。
- 自动生成准备失败：显示中文错误并允许用户手动重试。
- 图片加载失败不阻塞页面路由，关键图片保留有意义的 `alt`。
- 单教师 API 返回空数组时返回明确的生成错误，不产生无 Agent 课堂。

## 测试与验收

- 单元测试 preset 映射、未知 preset、固定提示词。
- 学生页测试 preset 只触发一次并创建正确 generation session。
- Agent profile API 测试多 Agent 返回被归一化为一个教师、无 teacher fallback、空数组错误。
- 路由测试 `/` 不再 redirect，废弃角色路由 redirect `/student`。
- 静态检查落地页所有资源均存在于 `public/landing/`。
- 浏览器在桌面和移动宽度对照原 HTML：四屏背景、标题、天体位置、hover、定价卡和滚动行为。
- 运行前端测试、类型检查和 Next.js production build。

## 非目标

- 不删除多 Agent 底层编排库，避免扩大到课堂引擎重构。
- 不开放客户端模型或供应商配置。
- 不改变后端 OpenAPI 合约或 code2video 服务。
- 不修改当前工作区中与本任务无关的 CI/CD 与 README 未提交改动。
