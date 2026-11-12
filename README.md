# Deal2Pay AI — PayPal AI Hackathon 2026

**Deal2Pay AI** is an Autonomous Agentic Commerce engine that converts voice or chat agreements into PayPal Invoices. Invoices are locked until delivery documents (PDFs) pass an automated Computer Vision audit — verifying signatures and checkboxes — and are then autonomously released. All activity is managed in real time through an interactive AG Grid ledger.

---

## 🚀 Core Features

- **Voice-First Deal Entry** — Browser-native Web Speech API enables hands-free deal input
- **AI-Powered Extraction** — Google Gemini Flash converts natural language into structured invoice data
- **Automated Document Audit** — OpenCV detects checkboxes, signatures, and dates in uploaded PDFs
- **Visual Feedback Overlay** — Bounding boxes render detected elements with confidence scores
- **Real-Time Reasoning Log** — Terminal-style display of agent decision-making at every step
- **Autonomous Invoice Release** — The agent sends invoices only after 100% audit compliance — no human click required
- **Webhook Integration** — PayPal `INVOICING.INVOICE.PAID` webhook triggers real-time status updates
- **Interactive Ledger** — AG Grid provides a sortable, filterable deal management dashboard

---

## 🔄 Lifecycle Workflow

| Step | Action | Technology |
|------|--------|------------|
| 1 | **Natural Language Input** — Type or speak a deal description | Web Speech API / text |
| 2 | **AI Extraction** — Gemini Flash extracts client, line items, and audit rules | `google-generativeai` |
| 3 | **PayPal DRAFT** — Invoice created on PayPal Sandbox Invoicing API v2 | PayPal REST API v2 |
| 4 | **Document Audit** — User uploads PDF; OpenCV verifies checkboxes and signatures | OpenCV + `pdf2image` |
| 5 | **Autonomous Release** — On 100% compliance, agent executes `POST .../send` | FastAPI agent loop |
| 6 | **Payment Settlement** — PayPal webhook updates status to `PAID` in real time | PayPal Webhooks + SWR |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS, AG Grid Community, react-pdf, SWR, Lucide React |
| **Backend** | Python 3.11+, FastAPI, Uvicorn, Pydantic v2 |
| **LLM** | Google Gemini AI (`gemini-2.5-flash`, with `gemini-3.6-flash` fallback) — structured JSON output |
| **Computer Vision** | OpenCV (`cv2`), `pdf2image`, Pillow, numpy |
| **Database** | Supabase (PostgreSQL) |
| **Storage** | Supabase Storage — `deal-documents` bucket for PDF uploads |
| **Payment API** | PayPal Sandbox Invoicing API v2 + Webhooks |
| **Deployment** | Render (Web Services for backend and frontend) |

---

## 📁 Project Structure

```
Paypal-AI-Hackaton/
├── database/
│   └── schema.sql                       # Supabase database schema
├── backend/
│   ├── main.py                          # FastAPI application entry point
│   ├── schemas.py                       # Pydantic v2 request/response models
│   ├── requirements.txt                 # Python dependencies
│   ├── .env.example                     # Environment variables template
│   └── services/
│       ├── paypal_service.py            # PayPal Invoicing API integration
│       ├── audit_service.py             # OpenCV document analysis
│       └── deal_extraction_service.py   # Gemini AI extraction
└── frontend/
    ├── package.json
    ├── next.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx               # Root layout
        │   ├── page.tsx                 # Main dashboard
        │   └── globals.css              # Tailwind + AG Grid theme
        ├── components/
        │   ├── DealTable.tsx            # AG Grid deal ledger
        │   ├── AuditModal.tsx           # PDF audit modal with overlay
        │   ├── DealInputPanel.tsx       # Voice/text deal input
        │   ├── StatusBadge.tsx          # Deal status indicator
        │   ├── ReasoningTerminal.tsx    # Agent reasoning log
        │   └── PayPalInvoicePanel.tsx   # Invoice action controls
        ├── hooks/
        │   └── useDeals.ts              # SWR data fetching hook
        └── types/
            └── index.ts                 # Shared TypeScript types
```

---

## 🚢 Deployment on Render

Both services are deployed on **Render** as independent Web Services from the same monorepo.

### Backend Service (FastAPI)

| Setting | Value |
|---------|-------|
| **Service Type** | Web Service |
| **Root Directory** | `backend` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `PAYPAL_CLIENT_ID` | PayPal Sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox app client secret |
| `PAYPAL_BASE_URL` | `https://api-m.sandbox.paypal.com` |
| `PAYPAL_WEBHOOK_ID` | Webhook ID from PayPal Developer Dashboard |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.6-flash` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `FRONTEND_ORIGIN` | Deployed frontend URL (for CORS) |

### Frontend Service (Next.js)

| Setting | Value |
|---------|-------|
| **Service Type** | Web Service |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` |
| **Start Command** | `npm start` |

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Deployed backend URL |

### Database & Storage

| Resource | Details |
|----------|---------|
| **Provider** | Supabase |
| **Database** | PostgreSQL — `deals` and `audit_logs` tables |
| **Storage** | `deal-documents` bucket for PDF uploads |

---

## 💻 Local Development

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Poppler** (required by `pdf2image` for PDF rendering)
  - Windows: download from [oschwartz10612/poppler-windows](https://github.com/oschwartz10612/poppler-windows/releases) and add the `bin/` folder to your `PATH`
- **Supabase account** (free tier available at [supabase.com](https://supabase.com))
- **PayPal Developer account** — Sandbox app ([developer.paypal.com](https://developer.paypal.com))
- **Google Gemini API key** — from [Google AI Studio](https://makersuite.google.com/app/apikey)
- **ngrok** — for local webhook tunneling ([ngrok.com](https://ngrok.com))

### 1. Database Setup (Supabase)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → **New Query**
3. Paste the contents of `database/schema.sql` and click **Run**
4. In **Project Settings** → **API**, note your `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
5. In **Storage**, create a bucket named `deal-documents`

### 2. Backend Setup

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Fill in all values in .env
uvicorn main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd frontend
npm install
# Create frontend/.env.local:
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

### 4. PayPal Webhook (Local)

```bash
ngrok http 8000
# Copy the HTTPS forwarding URL shown in the ngrok terminal
```

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/developer/applications)
2. Select your Sandbox app → **Webhooks** → **Add Webhook**
3. Set the URL to: `https://<your-ngrok-url>/api/webhooks/paypal`
4. Select the event: `INVOICING.INVOICE.PAID`
5. Copy the **Webhook ID** and add it to `backend/.env` as `PAYPAL_WEBHOOK_ID`

---

## ✅ Verification

### Health Check

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

### Create a Test Deal

```bash
curl -X POST http://localhost:8000/api/deals/create \
  -H "Content-Type: application/json" \
  -d '{
    "raw_text": "Web audit for client@acme.com, 2hrs at $50, plus $50 security review. Total $150. Needs signed work order with 2 checkboxes."
  }'
```

### Manual End-to-End Flow

1. Open `http://localhost:3000` — enter or speak a deal description
2. Click **Extract & Create Invoice** — verify a new row appears in the AG Grid with `DRAFT_LOCKED` status
3. Click **Run Audit** — upload a PDF containing checkboxes and a signature
4. Verify bounding boxes render over the PDF and the reasoning log populates
5. If the audit passes — the agent automatically sends the invoice; verify the PayPal Sandbox email
6. Simulate payment in the PayPal Sandbox — verify the AG Grid row updates to `PAID`

---

## 🏆 Sponsor Tracks

| Sponsor | Track |
|---------|-------|
| **PayPal** | Best Use of Agentic Commerce |
| **PayPal** | Best Use of PayPal + AI |
| **AG Grid** | Interactive Control Grid (Community edition) |
| **Render** | Full-Stack Deployment (FastAPI + Next.js) |
| **Postman** | Public API Testing Collection |

---

## 📄 License

MIT License — Created for PayPal AI Hackathon 2026
