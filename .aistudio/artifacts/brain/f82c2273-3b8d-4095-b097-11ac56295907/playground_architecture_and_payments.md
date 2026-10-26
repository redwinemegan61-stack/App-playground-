# App and Game Playground — Architecture, Payments & Publisher Questionnaire Guide

## 1. Platform Overview

**App and Game Playground** is a full-stack publishing platform, interactive browser arcade, and visual debugging studio powered by Express, Firebase Firestore, and `gemini-4-argon`.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                        App and Game Playground (Client)                        │
│                                                                                │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │ Discover & Arcade    │  │ Publisher Studio &   │  │ Payments & Checkout  │  │
│  │ • Starlight Tactics  │  │ Questionnaire        │  │ • License Purchase   │  │
│  │ • PulsePad Synth Lab │  │ • Age & Content      │  │ • Supporter Passes   │  │
│  │ • Botanica Word Game │  │ • Privacy & A11y     │  │ • 85% / 15% Split    │  │
│  │ • PatchForge Vision  │  │ • Pricing & Payouts  │  │ • Official Receipts  │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └──────────┬───────────┘  │
└─────────────┼─────────────────────────┼─────────────────────────┼──────────────┘
              │                         │                         │
              ▼                         ▼                         ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                         Express Backend Server (server.ts)                     │
│                                                                                │
│  • POST /api/publisher/validate-questionnaire -> Issues CERT-PG-* Certificate  │
│  • POST /api/payments/create-intent           -> Computes 85/15 Split Intent   │
│  • POST /api/payments/execute                 -> Authorizes & Issues RCPT-*    │
│  • GET  /api/payments/ledger                  -> Real-Time Gateway Telemetry   │
│  • POST /api/analyze-image                    -> Gemini 4 Argon Vision Engine  │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│             Firebase Firestore (ai-studio-f82c2273-3b8d-4095-b097-...)         │
│                                                                                │
│  • /apps/{appId}                              (Public Storefront Catalog)      │
│  • /apps/{appId}/reviews/{reviewId}           (Verified Community Ratings)     │
│  • /publisherQuestionnaires/{questionnaireId} (Compliance & Payout Records)    │
│  • /payments/{paymentId}                      (Immutable Transaction Ledger)   │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Publisher Onboarding Questionnaire (11-Point Vetting)

Every creator adding a new app or game completes the mandatory **Publisher Questionnaire** in the **Publisher Studio**:

1. **Studio or Publisher Name** (`2–80` characters)
2. **Player Support Contact** (Verified email or support URL)
3. **Target Age Rating** (`Everyone (E)`, `Everyone 10+ (E10+)`, `Teen (T)`, `Mature 17+ (M)`)
4. **Action / Combat Content Advisory** (`None`, `Mild Cartoon / Tactical`, `Moderate`)
   - *Backend Validation Rule*: Selecting `Everyone (E)` with `Moderate` combat is automatically flagged and rejected by `/api/publisher/validate-questionnaire`.
5. **Data Privacy & Telemetry Declaration** (`Zero Data Collected`, `Anonymous Gameplay Telemetry Only`, `Authenticated Account Sync`)
6. **Accessibility & Input Features** (`Keyboard + Mouse + High-Contrast`, `Touch + Screen Reader Friendly`, `Full Controller + Audio Cues`)
7. **Monetization Model** (`Free to Play`, `One-Time Purchase`, `Creator Supporter Pass`)
8. **License Price (USD)** (`$0.00` for Free to Play, or `$1.00–$999.99` for commercial builds)
9. **Creator Payout Rail** (`Stripe Connect Express (85% Creator / 15% Platform)`, `Instant Card Payout`, `Open-Source Community Grant`)
10. **Browser Sandbox Verification Attestation** (`testedOfflineAndSandbox == true`)
11. **Publisher Distribution & 85/15 Revenue Share Agreement** (`acceptedPublisherTerms == true`)

When verified, the backend issues a unique `CERT-PG-YYYY-XXXX` Compliance Certificate ID that is stored alongside the questionnaire in Firestore (`/publisherQuestionnaires/{questionnaireId}`).

---

## 3. Backend Payment Processing & 85/15 Revenue Split

The Express payment engine (`server.ts`) provides three dedicated endpoints:

- **`POST /api/payments/create-intent`**: Validates the transaction amount (`100` to `99999` cents), calculates the exact **85% Creator Net Share** (`creatorNetCents`) and **15% Platform Infrastructure Fee** (`platformFeeCents`), and initializes a `pi_pg_*` payment intent.
- **`POST /api/payments/execute`**: Validates cardholder details, card number, `MM/YY` expiration, and security code, settles the payment intent, and issues a timestamped receipt (`RCPT-*`).
- **`GET /api/payments/ledger`**: Aggregates gross transaction volume, net creator payouts, and recent settled receipts for the **Payments & Ledger** dashboard.
