# CushionPack Studio Platform Overview and User Guide

## 1. Technology Stack
| Layer | Language / Framework | Description |
| --- | --- | --- |
| Frontend | TypeScript + React 19 + Vite | Responsible for pages, interactions, state management, and API calls. |
| Backend API | JavaScript (Node.js ESM) + Express | Responsible for authentication, authorization, file management, task orchestration, project management, and coordination with the R service. |
| Algorithm Layer | R + plumber + tidymodels + xgboost + ggplot2 | Responsible for model analysis, prediction, SHAP interpretation, and reverse design calculations. |
| File Processing | `xlsx`, `multer` | Responsible for Excel/CSV reading and writing, and uploaded file handling. |
| Data Storage | Local file system + JSON | Responsible for persistence of the model library, task results, users, sessions, and project metadata. |

### Summary
- Frontend language: **TypeScript**
- Primary backend language: **JavaScript**
- Algorithm/modeling language: **R**

In other words, this system is not a simple two-layer frontend/backend structure. It consists of:

1. A React frontend
2. A Node/Express API layer
3. An R plumber algorithm service layer

## 2. Key Directory Overview
The platform codebase mainly includes the following:
- `frontend/`
  - React frontend project.
- `frontend/src/App.tsx`
  - Main frontend framework that controls authentication state, sidebar, page switching, projects, and task history.
- `frontend/src/pages/Library.tsx`
  - Model library page.
- `frontend/src/pages/New task.tsx`
  - New task page, supporting both single-task and batch prediction.
- `frontend/src/pages/Explore.tsx`
  - Reverse design page.
- `frontend/src/features/api.ts`
  - Unified frontend API request wrapper.
- `backend/server.mjs`
  - Main Node/Express service.
- `backend/r-api/library-api.R`
  - R plumber API providing prediction, SHAP, reverse design, accuracy analysis, and related capabilities.
- `backend/r-api/run-library-api.R`
  - R plumber startup entry point.
- `backend/database/`
  - Data directory for users, sessions, and the model library.
- `backend/data/New task/`
  - Storage directory for new task input files, prediction result files, and task summaries.

## 3. Web Platform User Guide
The current web platform is a developer preview. Users can access the main features, and platform security will continue to be improved later.

### 3.1 Login and Registration
Access the platform through the following link:
```text
https://cushionpackaging.fy.takin.cc
```
When entering the system for the first time, the login page is shown first.
- `Sign up`: register a local account
- `Sign in`: log in with an existing account

At present, users can log in directly with an email address and password.
Rules:
- The email address must be valid
- The password must be at least 8 characters long

After a successful login, the frontend stores `token + user` in browser storage.

### 3.2 Home
The Home page is mainly used to present the system positioning and capability overview. It does not participate in data computation.

### 3.3 Library
Library is the model management center, with four main purposes:
1. View existing product models
2. Upload and deploy new models
3. Activate a specific model version
4. View model analysis results

Typical workflow:
1. Select `Product type`
2. Select `Product name`
3. View the currently active model version, update time, and model file name
4. Click `Deploy model` to open the upload dialog
5. Fill in:
   - `Product type`
   - `Product name`
   - `Model version`
6. Upload files:
   - Required: `all model file`
   - Required: `final model file`
   - Required: `data train file`
   - Required: `data test file`
   - Optional: `Validation_accuracy.xlsx`
   - Optional: `Best_hyperparamter.xlsx`
7. After the upload is complete, you can perform the following actions on a version:
   - `Activate`
   - `Delete version`

The page also provides three types of analysis views:
- 10-fold cross-validation results
- Best hyper-parameters
- Accuracy performance (training/testing accuracy and fitting plots)

### 3.4 New task
New task is used to run prediction tasks and supports:
- Single-task prediction
- Batch prediction

#### Single-Task Prediction
Steps:
1. Enter `Task name`
2. Select `Product type`
3. Select `Product name`
4. Enter product and cushioning parameters, for example:
   - Product ID
   - Product mass
   - Length / Width / Height
   - Liner category / density / thickness
   - Fragility
5. Click `Start prediction`
6. The page returns:
   - `Predicted acceleration`
   - `Predicted result`
   - Result table
7. Click `SHAP` on a result row to generate an explanatory waterfall chart

#### Batch Prediction
Steps:
1. Switch to `Multiple tasks`
2. Click `Download template`
3. Fill in multiple plans using the template
4. Upload an `.xlsx` / `.csv` file
5. Select the product type and product name
6. Click `Start prediction`
7. View the batch results and generate SHAP explanations row by row

#### Projects and History
New task supports project-based management, but **a project is not required**.
- If no project is selected, the task is saved directly in `backend/data/New task/`
- If a project is selected, the task is saved in `backend/data/New task/<projectName>/`

The sidebar supports:
- Creating projects
- Renaming projects
- Deleting projects
- Renaming tasks
- Moving tasks to another project
- Pinning tasks
- Archiving tasks
- Deleting tasks

The search dialog can search historical tasks by task name, file name, and project name.

### 3.5 Explore
Explore is used for reverse design and feasible-region analysis based on the currently active model.
Steps:
1. Select `Product type`
2. Select `Product name`
3. Confirm that the product has an active model
4. Enter fixed product parameters:
   - Product length
   - Product width
   - Product height
   - Product mass
5. Enter search parameters:
   - Threshold
   - Density step
   - Thickness step
6. Set search ranges for `EPE / EPP / EPS` respectively
7. Click `Start reverse design`

The result area displays:
- Best feasible scheme
- Best scheme for each material category
- Feasible / Infeasible distribution
- Feasible-region heatmap

Notes:
- Explore only lists products with **active models**
- If no version is active in Library, the product will not be available in Explore

### 3.6 Accounts and Settings
In the current build:
- The profile dialog is still available
- `Settings > General` is available
- The content of `Settings > Account` has been temporarily cleared, and the original user management panel is not shown

Notes:
- The backend still keeps the `/api/account/*` management endpoints
- Only the current frontend UI does not display this part for now

## 4. System Runtime Logic
### 4.1 Frontend Runtime Logic
The frontend entry point is `frontend/src/main.tsx`, and the core container is `frontend/src/App.tsx`.
Startup sequence:
1. React mounts `App`
2. `App` first checks whether a login session exists in browser `localStorage`
3. If a token exists, it calls `/api/auth/session` to validate the session
4. If validation fails, it returns to the login page
5. If validation succeeds, it enters the main interface

API call rules:
- All requests are sent through `requestApi()`
- If a local token exists, `Authorization: Bearer <token>` is added automatically
- If a non-authentication API returns `401`, the frontend clears the local session and forces a return to the login page

Page switching logic:
- `Home`
- `Library`
- `New task`
- `Explore`

These pages are all controlled centrally by `App.tsx`. This is not a multi-page website, but navigation inside a single-page application.

### 4.2 Backend Runtime Logic
The backend entry point is `backend/server.mjs`.
At startup, it performs the following:
1. `app.use(cors())`
2. `app.use(express.json())`
3. Initialize the user/session/task output directories
4. Start Express listening on the configured port
5. Automatically detect and attempt to start R plumber

Authentication logic:
- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/session`
- `/api/auth/logout`

Except for `/api/health` and `/api/auth/*`, all other `/api/*` requests require authentication by default.

Authorization logic:
- `/api/account/*`: admin only
- `/api/library/*`: requires `library` permission
- `/api/new-task/*`: requires `newTask` permission
- `/api/projects/*`: requires `newTask` permission
- `/api/explore/*`: requires `explore` permission

### 4.3 User and Session Logic
Users and sessions are both stored in local JSON files:
- `backend/database/users.json`
- `backend/database/sessions.json`

Characteristics:
- Passwords are stored as `scrypt` hashes
- Sessions use random tokens
- Sessions are valid for about 30 days by default
- Sessions are cleaned up after a user is disabled or expires

### 4.4 Model Library Runtime Logic
After a model is uploaded, its files are saved in a directory similar to:

```text
backend/database/<productType>/<productName>/<modelVersion>/
```

When activating a model, the backend maintains `.model-deployment.json` in the product directory to mark the currently enabled version.
The data shown on the Library page mainly comes from:
- Disk directory scanning
- Version metadata
- R analysis results
- Uploaded attachment files

The Node backend is responsible for:
- Validating upload parameters
- Saving files
- Building the directory structure
- Reading product and version lists
- Calling the R service to perform analysis or return results

### 4.5 New Task Prediction Runtime Logic
The core flow for single-task and batch prediction is the same; only the input source differs.

#### Single Task
1. The frontend submits the form data to `/api/new-task/start-prediction`
2. The backend converts the input parameters into an Excel workbook
3. The workbook is written to `backend/data/New task[/project]/`
4. The backend finds the currently active model based on `productType + productName`
5. The backend calls R plumber's `/new-task-prediction`
6. R returns prediction result rows
7. The backend saves:
   - The original input workbook
   - The prediction result workbook
   - `*_task-summary.json`
8. After receiving the result, the frontend refreshes task history

#### Batch Task
1. The frontend uploads `.xlsx/.xls/.csv`
2. The backend parses the file and converts it into a standardized task header format
3. The remaining flow is the same as single-task prediction

### 4.6 SHAP Explanation Runtime Logic
After clicking `SHAP` on a result row:
1. The frontend submits `productType / productName / fileName / targetId` to `/api/new-task/shap-waterfall`
2. The backend locates the input file saved for that task
3. The backend locates the currently active model
4. The backend calls R plumber's `/new-task-shap-waterfall`
5. R returns:
   - baseline
   - prediction
   - steps
6. The frontend renders the data as an interactive waterfall chart

### 4.7 Explore Reverse Design Runtime Logic
The Explore flow is as follows:
1. The frontend first requests `/api/explore/active-products`
2. The backend returns only products that have active models
3. The user configures fixed parameters, thresholds, step sizes, and material search ranges
4. The frontend submits the request to `/api/explore/reverse-design`
5. The backend locates the currently active model
6. The backend calls R plumber's `/explore-reverse-design`
7. R returns:
   - Grid results
   - Best scheme for each material
   - Global best scheme
   - Feasible-point statistics
8. The frontend renders tables and heatmaps

### 4.8 Task History and Project Logic
Task history is not stored in a separate database table. Instead, it is composed jointly by the file system and summary files.
The backend maintains:
- Input files: `Task_*.xlsx`
- Prediction result files: `*_predicted results.xlsx`
- Task summaries: `*_task-summary.json`
- Project metadata: `.project-meta.json`

The frontend search function and sidebar task list both essentially read this summary information from `/api/new-task/tasks` and then display it.
