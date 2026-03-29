# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Production Env

Production builds read `VITE_API_BASE_URL` at build time.

The repository now includes `frontend/.env.production.example`:

```env
VITE_API_BASE_URL=https://your-domain.example.com
```

Use your public backend origin here. If the frontend and backend share one domain and the backend is exposed under `/api`, set it to the site origin, for example `https://bufferpack.example.com`.

PowerShell example:

```powershell
cd frontend
$env:VITE_API_BASE_URL='https://your-domain.example.com'
npm run build
```

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

