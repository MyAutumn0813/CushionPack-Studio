# CushionPack Studio Cross-PC Deployment Guide
This guide applies to the current `CushionPack Studio` repository. The project structure is:
- `frontend`: React 19 + Vite frontend
- `backend`: Node.js + Express backend
- `backend/r-api`: algorithm API provided by R `plumber`

There are two common ways to test it on another computer:
1. Copy the entire project to another computer and run both the frontend and backend locally on that machine.
2. Run the service on only one host machine and let other computers on the LAN access it through a browser.

The instructions below focus on directly executable steps.
## 1. Prerequisites
It is recommended to install the following on the target computer first:
- Node.js 18 or later
- npm 10 or later
- R 4.x

Notes:
- The backend uses Node's native `fetch`, so do not use an outdated Node version.
- The current repository does not include `renv.lock`, so R dependencies must be installed manually.
- Windows is the easiest environment for this project because the startup examples and R auto-detection logic in the repository are mainly oriented toward Windows.

## 2. Directories to Pay Attention to When Copying the Project
If you only pull the code again from the Git repository, **the model library will not be copied automatically**, because the root `.gitignore` excludes:
- `backend/database/*`

This directory actually stores:
- product type and product name directories
- uploaded model files
- `users.json`
- `sessions.json`

So if you want another computer to see the same models, users, and permission data as the current computer, also copy the following directories or files:
- `backend/database`
- `backend/data`

Notes:
- `backend/data/New task` stores task results and history records.
- If you only want to test a "fresh environment", you can skip copying `users.json` and `sessions.json` and let the system register accounts again on the new computer.
- The first registered user automatically becomes an administrator.

## 3. Install Node Dependencies
Open PowerShell in the project root directory and install the frontend and backend dependencies separately:
```powershell
cd frontend
npm install

cd ..\backend
npm install
```

## 4. Install R Dependencies
First make sure the target computer can execute `Rscript`.
If running the following command directly in the terminal shows a version number, R is already in `PATH`:
```powershell
Rscript --version
```

If `Rscript` cannot be found, the backend will still try to auto-detect common installation paths, but the safest approach is still to explicitly configure `RSCRIPT_PATH` or `R_HOME`.
Install the R packages required by this project:
```powershell
Rscript -e "install.packages(c('plumber','jsonlite','tidymodels','xgboost','dplyr','tidyr','purrr','ggplot2','rio','tibble'), repos='https://cloud.r-project.org')"
```

## 5. Start the Backend
The backend of this project **does not automatically read** `backend/.env`. `backend/.env.example` is only an example of variable names. At runtime, the values must be provided through system environment variables or temporary PowerShell variables.
The simplest way to start it in PowerShell is:
```powershell
cd backend
$env:PORT='8787'
$env:RSCRIPT_PATH='C:\Program Files\R\R-4.4.3\bin\Rscript.exe'
npm run dev
```

If `Rscript` is already in `PATH`, you can omit `RSCRIPT_PATH`:
```powershell
cd backend
$env:PORT='8787'
npm run dev
```

Common backend variables:
- `PORT`: Node backend port, default `8787`
- `R_HOME`: R installation root directory
- `RSCRIPT_PATH`: full path to `Rscript.exe`
- `R_PLUMBER_HOST`: listening address of the R API, default `127.0.0.1`
- `R_PLUMBER_PORT`: port of the R API, default `8791`
- `R_PLUMBER_EXTERNAL`: set this to `1` if the R API is not started automatically by `server.mjs` and is instead started manually and separately

After a normal startup, the terminal should show messages similar to:
- `Backend server listening at http://localhost:8787`
- `Model database path: ...\backend\database`
- `R plumber target: http://127.0.0.1:8791`

In addition, you can open the following address in a browser to check whether the backend is running:
```text
http://localhost:8787/api/health
```

## 6. Access from Other Computers
A platform deployed only on a local LAN cannot be accessed directly by devices from other networks (the public Internet).
Solution:
Use network mapping to expose the local LAN platform through an external relay network and generate a new public link so external users can access it.
### 6.1 NAT Traversal
This guide uses ZeroNews for that purpose. See the official site for the specific network deployment method:
https://user.zeronews.cc/setup/start

### 6.2 Start the Backend on the Host Machine
Take the mapped network link obtained through NAT traversal, for example: `https://cushionpackaging.fy.takin.cc`
Replace the value in `frontend\vite.config.ts` with it:
```text
 preview: {
    allowedHosts: ['cushionpackaging.fy.takin.cc']
    }
```

After that, start the backend with the expected project network configuration:
```powershell
cd backend
$env:PORT='8787'
$env:RSCRIPT_PATH='C:\Program Files\R\R-4.4.3\bin\Rscript.exe'
npm run dev
```

### 6.3 Start the Frontend and Backend on the Host Machine
```powershell
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```
This step is very important. By default, the Vite development server usually binds only to the local loopback address, so other computers cannot access it. After adding `--host 0.0.0.0`, other computers on the LAN can access it.

### 6.4 Access Link
Open the mapped network link in a browser on another computer to use the platform:
```text
https://cushionpackaging.fy.takin.cc
```

## 7. Windows Firewall Settings
If other computers cannot open the page, check Windows Firewall first.
At a minimum, confirm that the following ports are not blocked:
- `5173`: frontend development server
- `8787`: backend API (if you need direct access to the backend)

Recommended approach:
1. The first time you run `node.exe` / `npm`, if Windows shows a "Allow access to the network?" prompt, choose to allow private networks.
2. If no prompt appears, manually allow the corresponding program or port in "Windows Defender Firewall".

Notes:
- `8791` is the internal R plumber API port. By default it listens only on `127.0.0.1`, so it usually does not need to be opened to the LAN.

## 8. First Login and Data Initialization
This project includes a registration/login system.
The rules are:
- If `backend/database/users.json` does not exist or is empty, **the first registered user automatically becomes an administrator**
- Users registered afterward are ordinary users by default

So there are two options:
1. If you want to fully replicate the current environment: directly copy the existing `backend/database`
2. If you want to re-initialize on the new computer: do not copy `users.json` and `sessions.json`; after startup, register the first administrator account again

## 9. Common Troubleshooting
### 9.1 The page opens, but operations fail with "Unable to reach backend API"
This means the frontend is not connected to the backend. Check the following first:
- Whether `backend` has been started
- Whether the backend is listening on `8787`
- If this is a LAN test, whether the frontend was started with `--host 0.0.0.0`

### 9.2 `Rscript` cannot be found when starting the backend
How to handle it:
- Confirm that R is installed
- Explicitly set `RSCRIPT_PATH`

Example:
```powershell
$env:RSCRIPT_PATH='C:\Program Files\R\R-4.4.3\bin\Rscript.exe'
```

### 9.3 The backend is running, but the algorithm API is unavailable
Check the following first:
- Whether all required R packages have been installed
- Whether the terminal output includes `R plumber service status`
- Whether `backend/r-api/library-api.R` can be loaded normally by R

### 9.4 Existing models are missing on the new computer
The usual cause is that this directory was not copied:
- `backend/database`
This directory is not automatically synchronized through Git.

## 10. Simplified Workflow
1. Install Node.js and R on the host machine.
2. Copy the entire project to the host machine.
3. Also copy `backend/database` from the current machine to the host machine.
4. Run `npm install` in both `backend` and `frontend` on the host machine.
5. Start the backend: run `npm run dev` after `cd backend`, and set `RSCRIPT_PATH` if needed.
6. Start the frontend: run `npm run dev -- --host 0.0.0.0 --port 5173` after `cd frontend`.
7. Start the network mapping service and expose the local network service to the public network.
8. Access the mapped network link from other computers.

---
