# Deal2Pay AI — PayPal AI Hackathon 2026

**Deal2Pay AI** is a full-stack Agentic Commerce application. An autonomous AI agent ingests informal deal text or voice input, extracts structured financial terms using Google Gemini AI (gemini-1.5-flash), creates a PayPal Sandbox DRAFT invoice, locks it pending a visual audit, runs OpenCV contour analysis on the uploaded delivery PDF, and — upon 100% compliance — autonomously sends the live invoice. A PayPal webhook listener updates the ledger to `PAID` in real time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14+ (App Router), TypeScript, Tailwind CSS, AG Grid, react-pdf, SWR, Lucide React |
| **Backend** | Python 3.11+, FastAPI, Uvicorn, Pydantic v2 |
| **LLM** | Google Gemini AI (gemini-1.5-flash) with structured JSON output |
| **Computer Vision** | OpenCV (`cv2`), `pdf2image`, Pillow, numpy |
| **Database** | Supabase (PostgreSQL) |
| **Storage** | Supabase Storage (PDF uploads) |
| **Payment API** | PayPal Sandbox Invoicing API v2 + Webhooks |
| **Webhook Tunnel** | `ngrok` (for local development) |

---

## Project Structure

```
c:\Proyectos\Paypal AI Hackaton\
├── database/
│   └── schema.sql                          ← Run once in Supabase SQL editor
├── backend/
│   ├── main.py                             ← FastAPI app + all routes
│   ├── schemas.py                          ← Pydantic v2 models
│   ├── requirements.txt                    ← Python dependencies
│   ├── .env.example                        ← Backend env var template
│   └── services/
│       ├── paypal_service.py               ← PayPal OAuth2, create/send invoice, webhooks
│       ├── audit_service.py                ← OpenCV + pdf2image checkbox/signature detection
│       └── deal_extraction_service.py      ← Gemini AI → DealCreateRequest
└── frontend/
    ├── package.json
    ├── next.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx                  ← Root layout, fonts, metadata
        │   ├── page.tsx                    ← Main dashboard page
        │   └── globals.css                 ← Tailwind base + custom tokens
        ├── components/
        │   ├── DealTable.tsx               ← AG Grid table, cell renderers, row actions
        │   ├── AuditModal.tsx              ← Split-view PDF + bounding box overlay + terminal
        │   ├── DealInputPanel.tsx          ← Text input + Web Speech API mic button
        │   ├── StatusBadge.tsx             ← Reusable Tailwind status chip component
        │   ├── ReasoningTerminal.tsx       ← Scrollable log of agent reasoning lines
        │   └── PayPalInvoicePanel.tsx      ← Invoice summary card + send/view actions
        ├── hooks/
        │   └── useDeals.ts                 ← SWR data fetching hook for /api/deals
        └── types/
            └── index.ts                    ← TypeScript types mirroring Pydantic schemas
```

---

## Prerequisites

- **Python 3.11+** installed
- **Node.js 18+** installed
- **Supabase account** (free tier is sufficient)
- **PayPal Developer account** (Sandbox access)
- **Google Gemini API key** (Get from https://makersuite.google.com/app/apikey)
- **ngrok** (for local webhook tunneling)

---

## Setup Instructions

### 1. Database Setup (Supabase)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → **New Query**
3. Copy and paste the contents of `database/schema.sql`
4. Click **Run** to create the `deals` and `audit_logs` tables
5. In **Project Settings** → **API**, note down:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. In **Storage**, create a bucket named `deal-documents` (public bucket for demo purposes)

### 2. Backend Setup

```bash
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Create .env file from template
cp .env.example .env

# Edit .env with your actual values:
# - PAYPAL_CLIENT_ID (from PayPal Developer Dashboard)
# - PAYPAL_CLIENT_SECRET (from PayPal Developer Dashboard)
# - PAYPAL_WEBHOOK_ID (create webhook in PayPal, get ID)
# - GEMINI_API_KEY (from Google AI Studio)
# - SUPABASE_URL (from Supabase Project Settings)
# - SUPABASE_SERVICE_ROLE_KEY (from Supabase Project Settings)
# - FRONTEND_ORIGIN=http://localhost:3000

# Start the FastAPI server
uvicorn main:app --reload --port 8000
```

The backend will run on `http://localhost:8000`.

### 3. Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install

# Create .env.local file (copy the following manually):
# NEXT_PUBLIC_API_URL=http://localhost:8000

# Start the Next.js dev server
npm run dev
```

The frontend will run on `http://localhost:3000`.

### 4. PayPal Webhook Setup (Local Development)

```bash
# Install ngrok (if not already installed)
# Download from https://ngrok.com/download

# Start ngrok tunnel to expose localhost:8000
ngrok http 8000

# Copy the HTTPS forwarding URL, e.g. https://abc123.ngrok.io
```

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/developer/applications)
2. Select your Sandbox app
3. Go to **Webhooks** → **Add Webhook**
4. Set URL to: `https://<your-ngrok-url>/api/webhooks/paypal`
5. Select event: `INVOICING.INVOICE.PAID`
6. Copy the **Webhook ID** and add it to your backend `.env` file as `PAYPAL_WEBHOOK_ID`

---

## Verification

### Health Check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "service": "Deal2Pay AI Backend"
}
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
2. Confirm extracted deal preview → click "Extract & Create Invoice"
3. Verify new row appears in AG Grid with `DRAFT_LOCKED` status
4. Click "Run Audit" → upload a PDF delivery document with checkboxes/signature
5. Verify bounding boxes render over PDF, reasoning log populates
6. If audit passes → click "Send Invoice" → verify PayPal Sandbox email
7. Simulate payment in PayPal Sandbox → verify AG Grid row updates to `PAID`

---

## Deployment

### Backend (Render)

1. Push your code to GitHub
2. Create a new **Web Service** on [Render.com](https://render.com)
3. Connect your GitHub repository
4. Set environment variables in Render dashboard
5. Deploy — Render will automatically install dependencies and run `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Frontend (Vercel)

1. Push your code to GitHub
2. Import your project on [Vercel.com](https://vercel.com)
3. Set `NEXT_PUBLIC_API_URL` to your deployed backend URL
4. Deploy — Vercel will automatically build and deploy

---

## Features

- **Natural Language Deal Extraction**: Type or speak deal descriptions, and Gemini AI extracts structured invoice data
- **Voice Input**: Browser-native Web Speech API for hands-free deal entry
- **Document Audit**: OpenCV-powered detection of checkboxes, signatures, and dates in PDF delivery documents
- **Visual Feedback**: Bounding box overlays on PDFs show detected elements with confidence scores
- **Reasoning Log**: Terminal-style display of the agent's decision-making process
- **PayPal Integration**: Automatic DRAFT invoice creation, audit-locked release, and webhook-based payment tracking
- **Real-time Updates**: SWR polling keeps the dashboard in sync with PayPal webhooks

---

## License

MIT License — Created for PayPal AI Hackathon 2026
