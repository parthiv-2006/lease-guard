# LeaseGuard 🛡️

LeaseGuard is an AI-powered legal copilot designed to help tenants understand residential lease agreements. It analyzes uploaded leases, identifies potentially unenforceable or unusual clauses, compares terms against real-world statutory frameworks (such as the **Ontario Residential Tenancies Act, 2006**), and helps generate compliant counter-proposal drafts for negotiation.

---

## ✨ Key Features

1. **AI Clause Analysis & Risk Rating**: Automatically segments lease PDFs into distinct clauses and highlights areas of risk (Low, Medium, High, Critical).
2. **Statutory Integrity Checks (RAG)**: Matches clauses against a semantic database of local laws (pgvector) to ensure validity and flags conflicts with statute.
3. **One-Click Landlord Negotiation Copilot**: Automates the draft of amendment letters or counter-proposal emails tailored to different negotiation tones (Assertive, Formal, Cooperative).
4. **Agent Reasoning Tracing**: Tracks the step-by-step logic of the AI agent, detailing parallel tool executions and confidence indicators.

---

## 🛠️ Technology Stack

* **Frontend**: [Next.js](https://nextjs.org/) (App Router, TypeScript, React 19)
* **Styling**: Premium Vanilla CSS (custom design system, glassmorphism, responsive HSL palettes)
* **Database & Vector Store**: [Supabase](https://supabase.com/) (PostgreSQL with `pgvector` for semantic search)
* **AI Tool Orchestration**: [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) (Claude 3.5 models)
* **Testing**: [Jest](https://jestjs.io/) (Unit tests) & [Playwright](https://playwright.dev/) (E2E browser testing)

---

## 📂 Project Directory Structure

```
├── app/                  # Next.js App Router (Pages, Layouts, API Routes)
├── docs/                 # Product specs, plans, and design handoffs
│   ├── design-handoffs/  # Frontend/Visualizer mock layouts
│   └── *.md              # Technical specification logs and roadmap plans
├── lib/                  # Client initializers (Supabase, Anthropic)
├── mcp-server/           # Model Context Protocol (MCP) tool service
├── scripts/              # Migration, evaluation, and vector DB seeding scripts
├── supabase/             # Supabase schema definitions and migration files
├── __tests__/            # Jest test suite (API and utilities)
└── README.md             # Project overview and developer handbook
```

---

## 🚀 Getting Started

### 1. Prerequisite Environment Configuration
Create a `.env.local` file at the root directory:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Development Server
Start the frontend and backend next.js server locally:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

### 4. Run Test Suites
```bash
# Execute Jest unit tests
npm run test

# Run Playwright E2E browser tests
npx playwright test
```
