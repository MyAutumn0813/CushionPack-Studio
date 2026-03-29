# CushionPack Studio 软件说明

## 1. 技术栈

| 层级 | 语言 / 框架 | 说明 |
| --- | --- | --- |
| 前端 | TypeScript + React 19 + Vite | 负责页面、交互、状态管理和接口调用。 |
| 后端 API | JavaScript（Node.js ESM）+ Express | 负责认证、权限、文件管理、任务编排、项目管理和对 R 服务的调度。 |
| 算法计算层 | R + plumber + tidymodels + xgboost + ggplot2 | 负责模型分析、预测、SHAP 解释和逆向设计计算。 |
| 文件处理 | `xlsx`、`multer` | 负责 Excel/CSV 读写和上传文件接收。 |
| 数据存储 | 本地文件系统 + JSON | 负责模型库、任务结果、用户、会话和项目元数据持久化。 |

### 结论

- 前端语言：**TypeScript**
- 后端主语言：**JavaScript**
- 算法/建模语言：**R**

也就是说，这个系统不是“纯前后端二层结构”，而是：

1. React 前端
2. Node/Express API 层
3. R plumber 算法服务层

## 2. 关键目录

- `frontend/`
  - React 前端工程。
- `frontend/src/App.tsx`
  - 前端主框架，控制登录态、侧边栏、页面切换、项目与任务历史。
- `frontend/src/pages/Library.tsx`
  - 模型库页面。
- `frontend/src/pages/New task.tsx`
  - 新任务页面，支持单任务和批量任务预测。
- `frontend/src/pages/Explore.tsx`
  - 逆向设计页面。
- `frontend/src/features/api.ts`
  - 前端统一接口请求封装。
- `backend/server.mjs`
  - Node/Express 主服务。
- `backend/r-api/library-api.R`
  - R plumber API，提供预测、SHAP、逆向设计、精度分析等能力。
- `backend/r-api/run-library-api.R`
  - R plumber 启动入口。
- `backend/database/`
  - 用户、会话、模型库数据目录。
- `backend/data/New task/`
  - 新任务输入文件、预测结果文件、任务摘要的保存目录。

## 3. 启动方式

### 3.1 环境要求

- Node.js + npm
- R 环境
- R 依赖包：`plumber`、`jsonlite`、`tidymodels`、`xgboost`、`dplyr`、`tidyr`、`purrr`、`ggplot2`、`rio`、`tibble`

### 3.2 后端启动

```powershell
cd backend
npm install
npm run dev
```

后端默认端口是 `8787`。启动后会：

1. 初始化 `backend/database` 和 `backend/data/New task`
2. 启动 Express API
3. 尝试自动启动或连接 R plumber 服务

可用环境变量见 `backend/.env.example`，常用项：

- `PORT=8787`
- `R_HOME=...`
- `RSCRIPT_PATH=...`
- `R_PLUMBER_HOST=127.0.0.1`
- `R_PLUMBER_PORT=8791`
- `R_PLUMBER_EXTERNAL=0`

### 3.3 前端启动

```powershell
cd frontend
npm install
npm run dev
```

前端开发服务器通过 Vite 代理把 `/api` 请求转发到 `http://localhost:8787`。

### 3.4 生产构建

```powershell
cd frontend
npm run build
```

生产环境前端通过 `VITE_API_BASE_URL` 指向后端地址。

## 4. 网页软件使用说明

### 4.1 登录与注册

首次进入系统会先显示登录页。

- `Sign up`：注册本地账号
- `Sign in`：登录已有账号

规则：

- 邮箱必须合法
- 密码长度至少 8 位
- **第一个注册的用户会自动成为管理员**

登录成功后，前端会把 `token + user` 保存在浏览器 `localStorage` 中。

### 4.2 首页 Home

Home 页主要用于展示系统定位和能力概览，不参与数据计算。

### 4.3 模型库 Library

Library 是模型管理中心，主要用途有四类：

1. 查看已有产品模型
2. 上传和部署新模型
3. 激活某个模型版本
4. 查看模型分析结果

典型操作流程：

1. 选择 `Product type`
2. 选择 `Product name`
3. 查看当前激活模型的版本、更新时间、模型文件名
4. 点击 `Deploy model` 打开上传弹窗
5. 填写：
   - `Product type`
   - `Product name`
   - `Model version`
6. 上传文件：
   - 必填：`all model file`
   - 必填：`final model file`
   - 必填：`data train file`
   - 必填：`data test file`
   - 选填：`Validation_accuracy.xlsx`
   - 选填：`Best_hyperparamter.xlsx`
7. 上传完成后，可对某个版本执行：
   - `Activate`
   - `Delete version`

页面还提供三类分析展示：

- 10-fold cross-validation 结果
- Best hyper-parameters
- Accuracy performance（训练/测试精度与拟合图）

### 4.4 新任务 New task

New task 用于运行预测任务，支持：

- 单任务预测
- 批量预测

#### 单任务预测

操作步骤：

1. 输入 `Task name`
2. 选择 `Product type`
3. 选择 `Product name`
4. 输入产品与缓冲参数，例如：
   - Product ID
   - Product mass
   - Length / Width / Height
   - Liner category / density / thickness
   - Fragility
5. 点击 `Start prediction`
6. 页面返回：
   - `Predicted acceleration`
   - `Predicted result`
   - 结果表格
7. 点击某条结果的 `SHAP`，可生成解释瀑布图

#### 批量预测

操作步骤：

1. 切换到 `Multiple tasks`
2. 点击 `Download template`
3. 按模板填写多条方案
4. 上传 `.xlsx` / `.csv` 文件
5. 选择产品类型和产品名称
6. 点击 `Start prediction`
7. 查看批量结果并按行生成 SHAP

#### 项目与历史

New task 支持项目化管理，但**项目不是必填**。

- 不选项目时，任务直接保存在 `backend/data/New task/`
- 选定项目后，任务保存在 `backend/data/New task/<projectName>/`

侧边栏支持：

- 创建项目
- 重命名项目
- 删除项目
- 任务重命名
- 任务移动到其他项目
- 任务置顶
- 任务归档
- 任务删除

搜索弹窗可按任务名、文件名、项目名检索历史任务。

### 4.5 逆向设计 Explore

Explore 用于根据已激活模型做逆向设计和可行域分析。

操作步骤：

1. 选择 `Product type`
2. 选择 `Product name`
3. 确认该产品有激活模型
4. 输入固定产品参数：
   - Product length
   - Product width
   - Product height
   - Product mass
5. 输入搜索参数：
   - Threshold
   - Density step
   - Thickness step
6. 分别给 `EPE / EPP / EPS` 设置搜索范围
7. 点击 `Start reverse design`

结果区域会显示：

- Best feasible scheme
- 各材料类别的最佳方案
- Feasible / Infeasible 分布
- 可行域热力图

注意：

- Explore 只会列出**已经激活模型**的产品
- 如果 Library 里没有激活版本，Explore 里就不会可用

### 4.6 账号与设置

当前构建中：

- 个人资料弹窗仍可使用
- `Settings > General` 可使用
- `Settings > Account` 内容已被临时清空，不显示原用户管理面板

说明：

- 后端仍保留 `/api/account/*` 管理接口
- 只是当前前端 UI 暂时不展示这部分内容

## 5. 系统运行逻辑

### 5.1 前端运行逻辑

前端入口是 `frontend/src/main.tsx`，核心容器是 `frontend/src/App.tsx`。

启动顺序：

1. React 挂载 `App`
2. `App` 先检查浏览器 `localStorage` 中是否存在登录会话
3. 如果存在 token，调用 `/api/auth/session` 验证会话
4. 验证失败则回到登录页
5. 验证成功则进入主界面

接口调用规则：

- 所有请求都通过 `requestApi()` 发起
- 如果本地存在 token，会自动加上 `Authorization: Bearer <token>`
- 如果某次非认证接口返回 `401`，前端会清空本地会话并强制回到登录页

页面切换逻辑：

- `Home`
- `Library`
- `New task`
- `Explore`

这些页面都由 `App.tsx` 统一控制，不是多页网站，而是单页应用内部切换。

### 5.2 后端运行逻辑

后端入口是 `backend/server.mjs`。

启动时会执行：

1. `app.use(cors())`
2. `app.use(express.json())`
3. 初始化用户/会话/任务输出目录
4. 启动 Express 监听端口
5. 自动检测并尝试启动 R plumber

认证逻辑：

- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/session`
- `/api/auth/logout`

除 `/api/health` 和 `/api/auth/*` 外，其他 `/api/*` 请求默认都要先过认证。

权限逻辑：

- `/api/account/*`：仅管理员
- `/api/library/*`：需要 `library` 权限
- `/api/new-task/*`：需要 `newTask` 权限
- `/api/projects/*`：需要 `newTask` 权限
- `/api/explore/*`：需要 `explore` 权限

### 5.3 用户与会话逻辑

用户和会话都存在本地 JSON 文件中：

- `backend/database/users.json`
- `backend/database/sessions.json`

特点：

- 密码使用 `scrypt` 哈希保存
- 会话使用随机 token
- 会话默认有效期约 30 天
- 用户被禁用或过期后，会话会被清理

### 5.4 模型库运行逻辑

模型上传后，文件会被保存到类似目录：

```text
backend/database/<productType>/<productName>/<modelVersion>/
```

激活模型时，后端会在产品目录下维护 `.model-deployment.json`，用于标记当前启用的版本。

Library 页面显示的数据，主要来自：

- 磁盘目录扫描
- 版本元数据
- R 分析结果
- 已上传的附件文件

Node 后端负责：

- 校验上传参数
- 保存文件
- 构造目录结构
- 读取产品和版本列表
- 调用 R 服务做分析或返回结果

### 5.5 新任务预测运行逻辑

单任务和批量任务的核心链路一致，只是输入来源不同。

#### 单任务

1. 前端把表单数据提交到 `/api/new-task/start-prediction`
2. 后端把输入参数转换为 Excel 工作簿
3. 工作簿写入 `backend/data/New task[/project]/`
4. 后端根据 `productType + productName` 找到当前激活模型
5. 后端调用 R plumber 的 `/new-task-prediction`
6. R 返回预测结果行
7. 后端保存：
   - 原始输入工作簿
   - 预测结果工作簿
   - `*_task-summary.json`
8. 前端收到结果后刷新任务历史

#### 批量任务

1. 前端上传 `.xlsx/.xls/.csv`
2. 后端解析并统一转成标准任务表头
3. 后续流程与单任务相同

### 5.6 SHAP 解释运行逻辑

点击结果行的 `SHAP` 后：

1. 前端把 `productType / productName / fileName / targetId` 提交给 `/api/new-task/shap-waterfall`
2. 后端定位该任务保存下来的输入文件
3. 后端定位当前激活模型
4. 后端调用 R plumber 的 `/new-task-shap-waterfall`
5. R 返回：
   - baseline
   - prediction
   - steps
6. 前端把这些数据渲染成交互式瀑布图

### 5.7 Explore 逆向设计运行逻辑

Explore 的链路如下：

1. 前端先请求 `/api/explore/active-products`
2. 后端只返回“有激活模型”的产品
3. 用户配置固定参数、阈值、步长和材料搜索范围
4. 前端提交到 `/api/explore/reverse-design`
5. 后端定位当前激活模型
6. 后端调用 R plumber 的 `/explore-reverse-design`
7. R 返回：
   - 网格结果
   - 各材料最佳方案
   - 全局最佳方案
   - 可行点统计
8. 前端渲染表格和热力图

### 5.8 任务历史与项目逻辑

任务历史不是单独数据库表，而是由文件系统和摘要文件共同组成。

后端会维护：

- 输入文件：`Task_*.xlsx`
- 预测结果文件：`*_predicted results.xlsx`
- 任务摘要：`*_task-summary.json`
- 项目元数据：`.project-meta.json`

前端搜索和侧边栏任务列表，本质上都是从 `/api/new-task/tasks` 读取这些摘要信息后再做展示。

## 6. 一句话理解整套系统

这套软件的本质是：

**前端负责交互，Node 后端负责权限与文件编排，R 服务负责真正的建模计算和解释分析。**

如果只看“编程语言”：

- 前端：TypeScript
- 后端：JavaScript
- 算法：R

