# App and Game Playground — Architecture, Owner Revenue & Publishing Guide

## 1. Platform Revenue & Business Architecture

**App and Game Playground** is owned and administered by **Megan** (`redwinemegan61@gmail.com`).

The business model is simple, transparent, and eliminates payout accounting overhead:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              REVENUE FLOWS (100% TO OWNER)                             │
│                                                                                        │
│   1. External Developer App Uploads ($0.99 Flat Fee)                                   │
│      Outside creator uploads their custom web app / build ───► $0.99 ───► Megan (100%) │
│                                                                                        │
│   2. Developer AI Studio Passes ($3.00 / $5.00 Passes)                                 │
│      Creator uses Gemini 4 Argon visual diagnostics & code ──► $3.00 ───► Megan (100%) │
│                                                                                        │
│   3. Platform Owner Publishing Privilege                                               │
│      Megan (redwinemegan61@gmail.com) uploads her apps ──────► $0.00 (100% Waived)    │
│                                                                                        │
│   4. External Indie Creator In-App Monetization                                       │
│      Indie developer optionally links their own Stripe link ──► 100% Direct to Creator  │
│      (Platform does not intermediate creator payouts or tax withholding)               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Who is the "Developer" Receiving Payouts?

- **There are NO platform payouts owed to outside developers.**
- Outside developers are **paying customers** of your platform: they pay you **$0.99** to have their app reviewed, certified with Google Play–style safety standards, and listed in your public Play Store catalog.
- If outside creators want players to tip them or buy their games, they link their **own personal Stripe payment link** on their game cards. Players pay them directly on their own link.
- **All money collected by your platform Stripe account ($0.99 upload fees and $3.00/$5.00 Developer AI Studio Passes) belongs 100% to you (Megan).**

---

## 3. The Developer AI Studio Pass

- Creators who do not have their own development pipeline or who need assistance debugging, designing HUDs, fixing Python/JavaScript errors, or auto-generating store descriptions can purchase a **Developer AI Studio Pass** ($3.00 standard or $5.00 pro).
- This unlocks:
  - **Gemini 4 Argon Multimodal Vision Analyzer**: Upload screenshots to inspect UI contrast, visual layout, and gameplay elements.
  - **Issue #3060 Automated Code Patch Generator**: Generate downloadable unified `.patch` git diffs for browser engines.
  - **1-Click Publisher Listing Auto-Fill**: Auto-generate game titles, taglines, categories, and controls from a single screenshot.
- **100% of Developer AI Studio Pass proceeds go directly to Megan.**

---

## 4. Google Play Store–Style Content Rating & Safety Questionnaire

Every application uploaded to the store must complete the 16-point safety questionnaire:
1. Studio or Publisher Name
2. Player Support Contact
3. Calculated Google Play Age Rating (`Everyone (E)`, `Everyone 10+ (E10+)`, `Teen (T)`, `Mature 17+ (M)`)
4. Summary Content Advisory (`None`, `Mild Cartoon / Tactical`, `Moderate`)
5. Violence / Combat Disclosures
6. Fear / Horror Disclosures
7. Explicit Language / Profanity Disclosures
8. Controlled Substances Disclosures
9. Gambling / Paid Loot Box Disclosures
10. Online User-to-User Interaction Disclosures
11. Data Privacy Policy (`Zero Data Collected`, `Anonymous Gameplay Telemetry Only`, `Authenticated Account Sync`)
12. Accessibility & Input Features (`Keyboard + Mouse`, `Touch`, `Controller`)
13. Monetization Model (`Free to Play`, `One-Time Purchase`, `Creator Supporter Pass`)
14. General Safety Standards Attestation (No malware, phishing, deceptive behavior)
15. Browser Sandbox Attestation
16. Publisher Distribution Agreement (Flat $0.99 upload fee paid to owner, optional direct creator tip link, exclusive review by `redwinemegan61@gmail.com`)

---

## 5. Exclusive Owner Review & Approval Gate

- All submissions are locked upon completion with `reviewStatus = "pending"`.
- Only `redwinemegan61@gmail.com` (authenticated with verified email) can approve or deny apps.
- Denied apps remain private and are hidden from the store.
- Approved apps immediately appear in the live Play Store catalog for all visitors.
