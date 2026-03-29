# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## 生产部署环境变量

这个仓库公开发布时，至少需要配置下面两类环境变量：

- 前端构建变量：`frontend/.env.production` 中的 `VITE_API_BASE_URL`
- 后端运行变量：部署平台或启动命令里注入的 `PORT`、`R_HOME`、`RSCRIPT_PATH` 等变量

### 前端

仓库已提供示例文件 `frontend/.env.production.example`。

```env
VITE_API_BASE_URL=https://your-domain.example.com
```

构建生产包时，前端会把这个值写入打包结果。你的后端如果通过同一域名下的 `/api` 对外提供接口，这里就直接填主域名，例如 `https://bufferpack.example.com`。

PowerShell 临时构建示例：

```powershell
cd frontend
$env:VITE_API_BASE_URL='https://your-domain.example.com'
npm run build
```

### 后端

仓库已提供示例文件 `backend/.env.example`，用于整理部署时需要的变量名。当前后端代码不会自动读取 `.env` 文件，生产环境应当由部署平台或启动脚本注入这些变量。

常用变量：

- `PORT`：Node/Express 对外监听端口，默认 `8787`
- `R_HOME`：R 安装根目录
- `RSCRIPT_PATH`：`Rscript` 可执行文件完整路径
- `R_PLUMBER_PORT`：R plumber 服务端口，默认 `8791`
- `R_PLUMBER_EXTERNAL`：设为 `1` 时，表示 plumber 由外部单独托管

### 发布前检查

- 前端生产环境不要再回退到 `http://localhost:8787`
- 后端所在主机必须具备持久化磁盘，因为模型库和任务结果会写入本地目录
- 公开发布前，建议把后端 CORS 从全开放改成仅允许你的正式域名

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## 目录结构说明
### frontend 顶层目录
- `src/`：前端核心源码目录（页面、组件、样式、入口）。
- `public/`：静态资源目录，构建时原样拷贝到产物。
- `dist/`：构建输出目录（打包后的 HTML/CSS/JS）。
- `node_modules/`：依赖安装目录（自动生成，不手动修改）。

### frontend 顶层文件
- `index.html`：Vite 应用模板页，包含 `#root` 挂载点。
- `package.json`：项目依赖与脚本配置（`dev/build/lint/preview`）。
- `package-lock.json`：依赖锁定文件，保证安装版本一致。
- `vite.config.ts`：Vite 开发与构建配置。
- `eslint.config.js`：ESLint 规则配置。
- `tsconfig.json`：TypeScript 总配置入口。
- `tsconfig.app.json`：应用端 TypeScript 配置。
- `tsconfig.node.json`：Node/Vite 配置文件的 TypeScript 配置。
- `README.md`：frontend 子项目说明文档。
- `BufferPack Designer_V3.0.R`：R 脚本文件（建模/算法相关，不属于 React 运行入口）。
- `.gitignore`：frontend 范围内 Git 忽略规则。

### src 目录
- `main.tsx`：前端入口，挂载 React 根组件。
- `App.tsx`：应用主框架（左侧导航、折叠逻辑、顶部区域、页面切换）。
- `App.css`：主布局与组件样式（侧栏、主区、卡片、表单、响应式）。
- `index.css`：全局样式与主题变量（颜色、字体、基础样式）。

### src/pages
- `Explain.tsx`：首页/说明页，展示平台介绍和功能概览。
- `Data.tsx`：数据输入页（数值输入、文件上传、CSV 预览）。

### src/features/components
- `TrainForm.tsx`：模型预览组件（模型上传、算法选择、参数与图表占位）。
- `PredictForm.tsx`：预测组件（分类/回归模型选择、结果占位与样例表格）。

## React Compiler
The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
