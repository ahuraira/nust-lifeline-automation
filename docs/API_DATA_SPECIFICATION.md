# Dashboard API Specification v2.1

**Design Philosophy:** Our modern dark-mode UI + Old dashboard's transparency principles.

---

## 🎯 Core Objectives

1. **No Blind Spots** - Show where funds are at every stage
2. **Radical Transparency** - Donors can track their pledge end-to-end  
3. **Actionable Insights** - Surface bottlenecks and mismatches
4. **Human Impact First** - Students funded > Currency numbers

---

## 📊 Transparency Features (Inspired by Old Dashboard)

| Feature | Purpose | Implementation |
|---------|---------|----------------|
| **Funding Gap Bar** | Show raised vs remaining need | Green/Red progress bar |
| **3 Processing Times** | Identify bottlenecks | Receipt, Allocation, Hostel gauges |
| **Realization Rate** | Chapter accountability (Talk vs Action) | Pledged vs Verified % |
| **Pledge Tracker** | Donor can search their donation | Search by Pledge ID |
| **Status Pipeline** | Where are funds stuck? | Count at each status stage |

---

## 🔌 API Endpoints (Streamlined)

### 1. `/summary` - Command Center Data

```json
{
  "impact": {
    "studentsFunded": 28,
    "studentsAwaiting": 15
  },
  "financials": {
    "totalPledged": 2500000,
    "totalVerified": 1800000,
    "totalAllocated": 1400000,
    "balance": 400000,
    "fundingGap": 1200000
  },
  "processingDays": {
    "pledgeToReceipt": 4.2,
    "receiptToAllocation": 1.5,
    "allocationToHostel": 3.8
  },
  "pipeline": {
    "pendingProof": { "count": 8, "amount": 400000 },
    "proofReceived": { "count": 5, "amount": 250000 },
    "allocated": { "count": 12, "amount": 600000 },
    "hostelVerified": { "count": 17, "amount": 550000 }
  },
  "lastUpdated": "2026-01-31T12:00:00Z"
}
```

### 2. `/flow` - Sankey Fund Flow

```json
{
  "nodes": ["Pledged", "Verified", "Allocated", "Disbursed", "Pending"],
  "links": [
    { "source": 0, "target": 1, "value": 1800000 },
    { "source": 0, "target": 4, "value": 700000 },
    { "source": 1, "target": 2, "value": 1400000 },
    { "source": 2, "target": 3, "value": 1200000 }
  ]
}
```

### 3. `/chapters` - Leaderboard with Realization

```json
{
  "data": [
    { "chapter": "Karachi", "pledged": 850000, "verified": 720000, "realizationRate": 85 },
    { "chapter": "Dubai", "pledged": 480000, "verified": 480000, "realizationRate": 100 }
  ]
}
```

### 4. `/composition` - Fund Quality

```json
{
  "zakat": { "amount": 1200000, "percent": 48 },
  "general": { "amount": 1300000, "percent": 52 },
  "affiliation": [
    { "type": "SEECS", "percent": 36 },
    { "type": "NBS", "percent": 28 },
    { "type": "SMME", "percent": 24 },
    { "type": "SADA", "percent": 12 }
  ]
}
```

### 5. `/events` - Live Feed ⚡ (30s polling)

```json
{
  "events": [
    { "timestamp": "...", "type": "PLEDGE_RECEIVED", "message": "New 50K pledge" }
  ]
}
```

### 6. `/track` - Pledge Tracker (Searchable)

**Query:** `?pledgeId=PLD-00042`

```json
{
  "pledgeId": "PLD-00042",
  "timeline": [
    { "date": "2026-01-20", "status": "Pledged", "note": "Form submitted" },
    { "date": "2026-01-22", "status": "Proof Received", "note": "Receipt verified" },
    { "date": "2026-01-24", "status": "Allocated", "note": "Assigned to Male - Engineering" },
    { "date": "2026-01-28", "status": "Hostel Verified", "note": "Confirmed by DD Hostels" }
  ],
  "currentStatus": "Hostel Verified",
  "beneficiary": "Male - Engineering"
}
```

---

## 🏗️ Architecture: Separate Reporting Service

```
┌─────────────────────────────────────────────────────────────────┐
│                    DASHBOARD (React)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              DashboardAPIService.js (NEW)                        │
│  - doGet(e) → Routes /summary, /flow, /events, etc.             │
│  - API key validation, CORS, caching                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              ReportingService.js (EXISTING)                      │
│  - ETL Pipeline: Syncs Operations → Data Warehouse              │
│  - Runs on trigger (every 15 min or on key events)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│           [REPORTING] Data Warehouse                             │
│  Fact_Pledges | Fact_Allocations | Dim_Students                  │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits of Separation:**
- `ReportingService.js` - Handles ETL (write operations)
- `DashboardAPIService.js` - Handles API (read operations)
- Clear responsibility separation
- Easier to maintain and scale

---

## 📐 Dashboard Layout (Our Modern Style)

```
┌─────────────────────────────────────────────────────────────────┐
│  🌙 HEADER (Dark glassmorphism) + Live Ticker ⚡                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  IMPACT ROW: Students Funded | Awaiting | Total Pledges     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  FUNDING GAP BAR: ████████████░░░░░░░░ 60% Raised           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │  FINANCIAL KPIs      │  │  PROCESSING TIMES                │ │
│  │  (Animated cards)    │  │  (3 gauge meters)                │ │
│  └──────────────────────┘  └──────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  FUND FLOW (Sankey) - Where is the money?                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │  STATUS PIPELINE     │  │  CHAPTER LEADERBOARD             │ │
│  │  (Where stuck?)      │  │  (Realization rates)             │ │
│  └──────────────────────┘  └──────────────────────────────────┘ │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │  ZAKAT SPLIT (Donut) │  │  AFFILIATION SPLIT (Donut)       │ │
│  └──────────────────────┘  └──────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  🔍 PLEDGE TRACKER: "Track Your Donation"                   ││
│  │  [Enter Pledge ID]  →  Timeline view                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ Transparency Checklist

- [ ] Show exactly how much is raised vs needed (Gap Bar)
- [ ] Show where funds are stuck (Pipeline counts)
- [ ] Show how long each step takes (3 Processing gauges)
- [ ] Show chapter accountability (Realization %)
- [ ] Let donors track their pledge (Search feature)
- [ ] Show donor diversity (Affiliation Split)
