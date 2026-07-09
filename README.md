# 🏟️ Stadium Ops Copilot

> **An AI-powered operations assistant for venue staff that monitors crowd signals, reasons about capacity risks and staffing trade-offs, and generates multilingual action recommendations in real time.**

Built for **Google Prompt Wars — Challenge 4: Smart Stadiums & Tournament Operations (FIFA World Cup 2026)**.

---

## 🎯 Challenge Scope

| Dimension | Choice |
|-----------|--------|
| **Persona** | Venue Staff / Operations |
| **Vertical** | Crowd Management + Multilingual Assistance |
| **Venue** | MetLife Stadium, East Rutherford, NJ (capacity: 82,500) |
| **AI Engine** | Google Gemini API with structured JSON output |

## 🏗️ Architecture

```
[Crowd Event Simulator]  ──(JSON event)──►  [Context Store]
   6 scripted events                         Static stadium KB:
   simulating one match                      zones, gates, medical,
                                             staff roster, languages
                    │                              │
                    ▼                              ▼
              ┌─────────────────────────────────────────┐
              │         AI DECISION ENGINE              │
              │  • Full stadium context injected        │
              │  • Recent decision history (memory)     │
              │  • Conflict resolution instructions     │
              │  • Structured JSON output via Gemini    │
              │  • Fallback mode for demo reliability   │
              └─────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              [REST API]            [WebSocket Push]
              FastAPI endpoints     Real-time broadcast
                    │                       │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │    OPS DASHBOARD      │
                    │  • Zone status cards  │
                    │  • Action feed        │
                    │  • Stadium SVG map    │
                    │  • Multilingual alerts│
                    │  • Demo controls      │
                    └───────────────────────┘
```

## 🧠 Why an LLM? (Not Just Rules)

The **conflict resolution scenario** (Event 4) is the key differentiator:

> Zone A and Zone C both spike to 85%+ simultaneously, but only 2 spare volunteer teams are available. The engine must reason about severity, trend direction, remaining capacity margin, and prior decisions to make a trade-off — then explain its reasoning.

A rules engine can handle `if density > 80: deploy_staff()`. It cannot cleanly handle *competing demands with limited resources where the optimal allocation depends on multiple contextual factors and prior state*. The LLM reasons over context, makes a trade-off, and produces a human-readable justification — all in a single structured call.

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- A Google Gemini API key ([get one free](https://aistudio.google.com/apikey))

### Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/stadium-ops-copilot.git
cd stadium-ops-copilot

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

### Run

```bash
uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000** in your browser.

### Run without API key (fallback mode)

The dashboard works without a Gemini API key — the engine uses intelligent fallback logic that produces reasonable (non-LLM) decisions. This is intentional for demo reliability.

## 🎮 Demo Walkthrough

The demo simulates one full FIFA World Cup match at MetLife Stadium through **6 scripted events**:

| # | Event | What Happens |
|---|-------|-------------|
| 1 | **Pre-Match Arrival** | Zone A gates congested — engine deploys volunteers |
| 2 | **Early Match** | Zone B stable — engine confirms no action needed |
| 3 | **Halftime Surge** | Zone C spikes to 90% — crowd flow measures triggered |
| 4 | **⚡ Dual-Zone Conflict** | Zones A & C both spike, limited staff — engine makes trade-off |
| 5 | **🚑 Medical Emergency** | Zone D incident — medical dispatch + multilingual PA alert |
| 6 | **Match End Egress** | All zones high — phased exit strategy generated |

**Click "Next Event →"** to step through each event. Watch the Action Feed for the engine's reasoning, and switch language tabs to see real-time translations.

## 🔒 Security Practices

- ✅ All API keys loaded from environment variables (never hardcoded)
- ✅ `.env` in `.gitignore` — `.env.example` committed instead
- ✅ Input validation via Pydantic schemas on all API endpoints
- ✅ Error responses return clean messages (no stack traces leaked)
- ✅ CORS configured (permissive for demo; tighten for production)
- ✅ No user PII collected or stored

## 🧪 Testing

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ -v --tb=short
```

Test coverage includes:
- **Engine tests**: Schema validation, fallback behaviour, memory/history, graceful degradation
- **Simulator tests**: Event loading, schema validation, conflict event properties, uniqueness
- **API tests**: All REST endpoints (health, context, events, trigger, decisions, reset)

## ♿ Accessibility

- Semantic HTML5 elements (`header`, `main`, `section`, `article`, `nav`, `footer`)
- Single `<h1>` with proper heading hierarchy
- ARIA labels on all interactive elements and status indicators
- `aria-live="polite"` on action feed; `aria-live="assertive"` on critical alerts
- Keyboard-navigable: Tab, Enter/Space, Arrow keys for language tabs
- Skip-to-content link
- Risk indicators use **text + icon** alongside colour (never colour alone)
- High contrast (WCAG AA+)
- `lang` attribute on translated content
- `prefers-reduced-motion` respected (all animations wrapped)

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, Pydantic |
| AI Engine | Google Gemini API (`google-genai` SDK) |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Real-time | WebSocket (FastAPI native) |
| Testing | pytest, pytest-asyncio |

## ⚠️ Assumptions & Limitations

- **Simulated data**: Crowd density numbers are scripted, not from real sensors/cameras
- **Static KB**: Stadium layout is hardcoded (MetLife Stadium facts); a production system would use a database
- **6-event demo**: The match timeline is scripted for presentation; a real system would ingest continuous data streams
- **Translation quality**: Translations are generated by the LLM in the same call; production would use a dedicated translation service for accuracy
- **Single-instance**: No horizontal scaling, load balancing, or persistent storage — this is an MVP

## 📄 License

MIT — built for Google Prompt Wars Virtual Hackathon 2026.
