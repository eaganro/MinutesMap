# [CourtVision](https://courtvision.roryeagan.com) 🏀
**Serverless Real-Time NBA Analytics & Play-by-Play Visualization**

![AWS](https://img.shields.io/badge/AWS-Serverless-orange) ![React](https://img.shields.io/badge/Frontend-React%20%7C%20Vite-blue) ![DynamoDB](https://img.shields.io/badge/Database-DynamoDB-blueviolet) ![License](https://img.shields.io/badge/License-MIT-green)
![Backend Build](https://github.com/eaganro/courtvision/actions/workflows/infra.yml/badge.svg) ![Frontend Build](https://github.com/eaganro/courtvision/actions/workflows/frontend.yml/badge.svg)

[ **Launch Live App** ](https://courtvision.roryeagan.com)

![CourtVision Dashboard](docs/images/overview-desktop-dark.png)

## 📖 Introduction
**CourtVision** is a web dashboard for visualizing NBA games with high-density, interactive play-by-play views (beyond a standard scoreboard). I built it because I wanted a specific way to follow games live while watching, and I use it regularly.

The app runs on a **serverless AWS architecture** and uses a **hybrid push/pull real-time pattern**:
- WebSockets notify clients when new data is available.
- Clients then fetch the latest game data through **CloudFront → S3**, benefiting from CDN caching.

## ☁️ Architecture & Data Flow

```mermaid
flowchart TD
    %% --- Styling ---
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:white,font-weight:bold;
    classDef storage fill:#E05243,stroke:#232F3E,stroke-width:2px,color:white;
    classDef db fill:#3F8624,stroke:#232F3E,stroke-width:2px,color:white;
    classDef client fill:#61DAFB,stroke:#20232a,stroke-width:2px,color:black,font-weight:bold;
    classDef ext fill:#333,stroke:#fff,stroke-width:2px,color:white;

    %% --- Nodes ---
    subgraph External [External Source]
        NBA[("🏀 NBA API")]:::ext
    end

    subgraph Ingestion [Ingestion Layer]
        EB[EventBridge<br/>Cron/Rules]:::aws
        L_Poller[Lambda<br/>Poller & Manager]:::aws
    end

    subgraph Core [AWS Core Infrastructure]
        %% We group S3 and CF together to force them to the right side
        subgraph Static [Static Delivery]
            direction TB
            S3[("S3 Bucket<br/>Data Lake")]:::storage
            CF[CloudFront CDN]:::aws
        end

        subgraph RealTime [Real-Time Backend]
            L_Event[Lambda<br/>S3 Trigger]:::aws
            L_WS[Lambda<br/>WS Handler]:::aws
            DDB[("DynamoDB<br/>State & Schedule")]:::db
            APIG[API Gateway<br/>WebSocket]:::aws
        end
    end

    subgraph Frontend [User Interface]
        Browser[("💻 React Client")]:::client
    end

    %% --- Connections ---

    %% 1. Ingestion Flow (Top to Bottom)
    EB --> L_Poller
    L_Poller -- 1. Polls --> NBA
    L_Poller -- 2. Uploads JSON --> S3
    L_Poller -. Updates Status .-> DDB

    %% 2. Notification Flow (Left Side)
    S3 -- 3. Trigger --> L_Event
    L_Event -. Query Subs .-> DDB
    L_Event -- 4. Broadcast --> APIG
    APIG -- Push Data --> Browser

    %% 3. Static Data Flow (Right Side)
    %% CHANGED: We model this as Data Flow (S3 -> CF) to avoid the upward arrow crossing
    S3 -- Origin Read --> CF
    CF -- 5. Fetch via Edge --> Browser

    %% 4. WebSocket Connection (Bottom Up - inevitable, but cleaner now)
    Browser -- Connect/Sub --> APIG
    APIG -- Route --> L_WS
    L_WS -- Manage Conn --> DDB

```

### High-Level Components

* **Frontend:** React (Vite) static app served via **CloudFront** (origin: **S3**).
* **Game data storage:** JSON files in **S3**, served through **CloudFront**.
* **Real-time signaling:** **API Gateway WebSocket API** with **Lambda** handlers.
* **Connection/session state:** **DynamoDB** (stores connection IDs + current subscription info such as game/date).
* **Schedule metadata:** **DynamoDB** table for schedule basics; schedule payload is pushed via WebSockets.
* **Ingestion:** **AWS Lambda** (Poller) triggered by **EventBridge** (Cron/Rate) polls the NBA API and uploads new data to S3.

### 1) Client Subscription Model

Clients “subscribe” to a **game + date**:

* The WebSocket connection is established via API Gateway.
* The backend stores the connection/session in DynamoDB.
* When the user changes game/date, the subscription info updates so notifications can be targeted.

### 2) Data Update Flow (Hybrid Push/Pull)

1. **EventBridge** triggers the **Poller Lambda** during active games.
2. The Lambda fetches data from NBA endpoints, updates **DynamoDB** (scores/status), and uploads compressed JSON to **S3**.
3. **S3 event notification** triggers a **Lambda**.
4. Lambda queries **DynamoDB** (via a GSI keyed by `gameId`) to find connections currently subscribed to that game/date.
5. Lambda sends a **small WebSocket message** like “new data available.”
6. The browser fetches the updated JSON via **CloudFront → S3**.

### 3) Schedule Updates

* A DynamoDB table holds basic schedule metadata.
* A Lambda can send the full schedule payload to clients directly via WebSocket (useful for navigation without extra fetches).

## ⚡ Key Features

### 📊 High-Density Visualization

* **Interactive SVG charting** (pure SVG — no Canvas/D3 requirement).
* Hover/tooltip-style inspection of game events and game state.

### 🔌 Real-Time Updates

* WebSocket “data changed” notifications keep the UI feeling live.
* Data is fetched via CloudFront for caching efficiency.

### 🎨 UI/UX

* Dark-mode friendly layout.
* Designed for desktop-first analysis, usable on smaller screens.

## 📂 Repository Structure

The codebase is organized into three distinct logical units:

| Directory | Description |
| --- | --- |
| **`front/`** | **Frontend Client.** A Vite + React application. Contains the WebSocket connection manager, visualization components, and global state management logic. |
| **`functions/`** | **Serverless Backend.** AWS Lambda functions written in **Python + TypeScript**. Handles WebSocket lifecycle events, polls external NBA APIs (Ingestion), and broadcasts updates via API Gateway. |
| **`terraform/`** | **Infrastructure as Code.** Contains all AWS resource definitions (S3, DynamoDB, Lambda, IAM, EventBridge) to deploy the stack automatically. |

## 🛠️ Local Development & Setup

<details>
<summary><strong>Click to expand Setup Instructions</strong></summary>

### Prerequisites

* **Node.js** v20+ (frontend + TypeScript Lambdas)
* **Python** 3.11+ (for Python Lambdas)

### Frontend Setup

1. Clone the repository:
```bash
git clone [https://github.com/eaganro/courtvision.git](https://github.com/eaganro/courtvision.git)

```


2. Install dependencies:
```bash
cd front
npm install

```


3. Configure Environment:
Create a `.env.local` file in the `front/` directory:
```env
VITE_WS_LOCATION=wss://<your-api-gateway-websocket-endpoint>
VITE_PREFIX=https://<your-s3-cdn-url>

```


4. Run the development server:
```bash
npm run dev

```



### Backend Setup (Optional)

To build and test the TypeScript Lambdas locally:

1. Install Node dependencies:
```bash
cd functions
npm install

```


2. Build the Lambda bundles:
```bash
npm run build:lambdas

```


3. Run Vitest:
```bash
npm run test

```


To run the Python Lambda unit tests locally:

1. Install test dependencies:
```bash
pip install -r functions/requirements-dev.txt

```


2. Run Pytest:
```bash
python -m pytest functions/tests

```



</details>

## 🏗️ Infrastructure as Code (Terraform)

The entire AWS serverless architecture (S3, DynamoDB, Lambda, API Gateway, EventBridge, and CloudFront) is defined and managed using **Terraform**. This ensures the infrastructure is reproducible, version-controlled, and automated.

The configuration in `terraform/` handles:

* **Storage:** S3 buckets (hosting & data) and DynamoDB tables (connection state & schedule).
* **Compute:** Lambda functions for WebSocket handlers, data polling, and self-scheduling logic.
* **Networking:** API Gateway (WebSocket API) and CloudFront CDN.
* **Orchestration:** EventBridge Rules (Cron & Rate) and Scheduler Roles for automated data ingestion.
* **Security:** Granular IAM Roles and Policies attached directly to each Lambda function.
* **Build Automation:** Zips Lambda functions from functions/ into artifacts during deployment (run the TypeScript build before apply).

### Deploying Infrastructure

1. **Navigate to the Terraform directory:**
```bash
cd terraform

```


2. **Initialize Terraform:** Downloads required providers (AWS, Archive, Null).
```bash
terraform init

```


3. **Apply Changes:** This will build the local Lambda functions and deploy any infrastructure changes to AWS.
```bash
terraform apply

```



### Project Structure (Terraform)

The configuration is split into domain-specific files to maintain readability:

* **`main.tf`:** Provider config, backend state, and global settings.
* **`locals.tf`:** Centralized variables (source paths, build directories).
* **`storage.tf`:** S3 Buckets and Notifications.
* **`database.tf`:** DynamoDB Tables and Indexes.
* **`api_gateway.tf`:** WebSocket API definitions, routes, and stages.
* **`fn_*.tf`:** Modular files for each Lambda function (e.g., `fn_nba_poller.tf`), containing the Function resource, IAM Role, and Triggers.

## 🚀 CI/CD Pipelines

This project uses **GitHub Actions** to automate testing, infrastructure provisioning, and deployment.

### 1. Frontend Pipeline (`frontend.yml`)

Triggered on changes to `front/**`.

* **Automated Testing:** Runs **Playwright** end-to-end tests across **4 parallel shards** to minimize execution time.
* **Report Generation:** Merges test results into a single HTML report artifact.
* **Continuous Deployment:** If tests pass on `main`:
    1.  Builds the Vite application.
    2.  Syncs static assets to **S3**.
    3.  Invalidates the **CloudFront** cache to ensure users see the latest version immediately.

### 2. Infrastructure Pipeline (`infra.yml`)

Triggered on changes to `terraform/**` or `functions/**`.

* **Backend Verification:** Sets up Node.js 20 + Python 3.11 and runs **Vitest** + **pytest** for the Lambda functions.
* **Infrastructure as Code:** If tests pass, automatically runs `terraform init` and `terraform apply`.
* **Updates:** Because Lambda functions are deployed via Terraform, this single pipeline handles both code logic updates and AWS resource changes.

### Automation Workflow

```mermaid
flowchart LR
    %% Styles
    classDef git fill:#F05032,stroke:#333,stroke-width:2px,color:white;
    classDef action fill:#2088FF,stroke:#333,stroke-width:2px,color:white;
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:white;

    subgraph GitHub_Actions [GitHub Actions]
        direction TB
        Push((Push to Main)):::git

        subgraph Infra_Job [Backend & Infra]
            PyTest[Backend Tests (Vitest + Pytest)]:::action
            TF[Terraform Apply]:::action
            PyTest --> TF
        end

        subgraph Front_Job [Frontend Deploy]
            Test["Playwright Tests<br/>(4 Shards)"]:::action
            Build[Vite Build]:::action
            Sync["S3 Sync &<br/>CF Invalidation"]:::action
        end
    end

    Push -->|terraform/**| PyTest
    Push -->|front/**| Test
    Test --> Build --> Sync

```
