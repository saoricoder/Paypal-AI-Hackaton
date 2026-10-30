# Deal2Pay AI — PayPal AI Hackathon 2026

**Deal2Pay AI** is an autonomous Agentic Commerce engine that converts voice/chat agreements into PayPal Invoices. The system locks invoices until delivery documents (PDFs) pass an automated Computer Vision audit that verifies signatures and checkboxes. All activity is managed in real time via an interactive AG Grid ledger.

## 🎯 Core Features

- **Voice-First Deal Entry**: Browser-native Web Speech API enables hands-free deal input
- **AI-Powered Extraction**: Google Gemini Flash converts natural language to structured invoice data
- **Automated Document Audit**: OpenCV detects checkboxes, signatures, and dates in PDFs
- **Visual Feedback Overlay**: Bounding boxes show detected elements with confidence scores
- **Real-Time Reasoning Log**: Terminal-style display of agent decision-making
- **Autonomous Invoice Release**: System sends invoices only after audit approval
- **Webhook Integration**: PayPal webhooks trigger real-time status updates
- **Interactive Ledger**: AG Grid provides sortable, filterable deal management

## 🚀 Lifecycle Workflow

1. **Natural Language Input** — Type or speak a deal description
2. **AI Extraction** — Google Gemini Flash extracts structured data (client, line items, validation rules)
3. **PayPal DRAFT** — Creates invoice on PayPal Sandbox Invoicing API v2
4. **Document Audit** — Upload PDF, OpenCV analyzes checkboxes/signatures
5. **Autonomous Release** — On 100% compliance, send invoice to client
6. **Payment Settlement** — PayPal webhook updates status to PAID in real-time

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS, AG Grid Community, react-pdf, SWR, Lucide React |
| **Backend** | Python 3.11+, FastAPI, Uvicorn, Pydantic v2 |
| **LLM** | Google Gemini AI (gemini-1.5-flash) with structured JSON output |
| **Computer Vision** | OpenCV (`cv2`), `pdf2image`, Pillow, numpy |
| **Database** | Supabase (PostgreSQL) |
| **Storage** | Supabase Storage (PDF uploads) |
| **Payment API** | PayPal Sandbox Invoicing API v2 + Webhooks |
| **Deployment** | Render (Web Services for backend & frontend) |

## 📁 Project Structure

```
C:\Proyectos\Paypal AI Hackaton\
├── database/
│   └── schema.sql                          ← Supabase database schema
├── backend/
│   ├── main.py                             ← FastAPI application
│   ├── schemas.py                          ← Pydantic v2 models
│   ├── requirements.txt                    ← Python dependencies
│   ├── .env.example                        ← Environment variables template
│   └── services/
│       ├── paypal_service.py               ← PayPal API integration
│       ├── audit_service.py                ← OpenCV document analysis
│       └── deal_extraction_service.py      ← Gemini AI extraction
└── frontend/
    ├── package.json
    ├── next.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx                  ← Root layout
        │   ├── page.tsx                    ← Main dashboard
        │   └── globals.css                 ← Tailwind + AG Grid theme
        ├── components/
        │   ├── DealTable.tsx               ← AG Grid table
        │   ├── AuditModal.tsx              ← PDF audit modal
        │   ├── DealInputPanel.tsx          ← Voice/text input
        │   ├── StatusBadge.tsx             ← Status component
        │   ├── ReasoningTerminal.tsx       ├── Agent reasoning log
        │   └── PayPalInvoicePanel.tsx      ← Invoice actions
        ├── hooks/
        │   └── useDeals.ts                 ← SWR data fetching
        └── types/
            └── index.ts                    ← TypeScript types
```

## 🏗 Deployment on Render

### Backend Service (FastAPI)

- **Service Type:** Web Service
- **Root Directory:** `backend`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables:**
  - `PAYPAL_CLIENT_ID`
  - `PAYPAL_CLIENT_SECRET`
  - `PAYPAL_BASE_URL`
  - `PAYPAL_WEBHOOK_ID`
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `FRONTEND_ORIGIN` (deployed frontend URL)

### Frontend Service (Next.js)

- **Service Type:** Web Service
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Start Command:** `npm start`
- **Environment Variables:**
  - `NEXT_PUBLIC_API_URL` (deployed backend URL)

### Database & Storage

- **Provider:** Supabase
- **Database:** PostgreSQL with `deals` and `audit_logs` tables
- **Storage:** `deal-documents` bucket for PDF uploads

## 💻 Local Development

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Poppler** (for `pdf2image` on Windows)
  - Download from [poppler-windows](https://github.com/oschwartz10612/poppler-windows)
  - Add to PATH or set `POPPLER_PATH` environment variable
- **Supabase account** (free tier)
- **PayPal Developer account** (Sandbox)
- **Google Gemini API key** (from [Google AI Studio](https://makersuite.google.com/app/apikey))
- **ngrok** (for local webhook tunneling)

### Database Setup (Supabase)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → **New Query**
3. Copy and paste the contents of `database/schema.sql`
4. Click **Run** to create the `deals` and `audit_logs` tables
5. In **Project Settings** → **API**, note down:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. In **Storage**, create a bucket named `deal-documents` (public bucket for demo)

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
# Create .env.local with: NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

### PayPal Webhook Setup (Local)

```bash
ngrok http 8000
# Copy the HTTPS forwarding URL
```

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/developer/applications)
2. Select your Sandbox app → **Webhooks** → **Add Webhook**
3. Set URL to: `https://<your-ngrok-url>/api/webhooks/paypal`
4. Select event: `INVOICING.INVOICE.PAID`
5. Copy the **Webhook ID** and add it to `backend/.env` as `PAYPAL_WEBHOOK_ID`

## ✅ Verification

### Health Check

```bash
curl http://localhost:8000/health
```

### Create a Test Deal

```bash
curl -X POST http://localhost:8000/api/deals/create \
  -H "Content-Type: application/json" \
  -d '{
    "raw_text": "Web audit for client@acme.com, 2hrs at $50, plus $50 security review. Total $150. Needs signed work order with 2 checkboxes."
  }'
```

### Manual E2E Flow

1. Open `http://localhost:3000` → enter or speak a deal description
2. Click "Extract & Create Invoice" → verify new row in AG Grid with `DRAFT_LOCKED` status
3. Click "Run Audit" → upload PDF with checkboxes/signature
4. Verify bounding boxes render over PDF, reasoning log populates
5. If audit passes → click "Send Invoice" → verify PayPal Sandbox email
6. Simulate payment in PayPal Sandbox → verify AG Grid updates to `PAID`

## 🏆 Sponsor Tracks

- **PayPal:** Best Use of Agentic Commerce & Best Use of PayPal + AI
- **AG Grid:** Interactive Control Grid (Community edition)
- **Render:** Full-Stack Deployment (FastAPI + Next.js)
- **Postman:** Public testing collection

## 📄 License

MIT License — Created for PayPal AI Hackathon 2026
