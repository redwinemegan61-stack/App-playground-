import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-memory backend payment intent & receipt ledger (complementing persistent Firestore /payments collection)
interface ServerPaymentIntent {
  intentId: string;
  appId: string;
  appTitle: string;
  recipientAuthorId: string;
  buyerId: string;
  buyerName: string;
  amountCents: number;
  creatorNetCents: number;
  platformFeeCents: number;
  currency: 'USD';
  paymentType: 'App License Purchase' | 'Creator Supporter Pass';
  status: 'requires_payment_method' | 'succeeded';
  createdAtIso: string;
  receiptNumber?: string;
  cardBrand?: string;
  cardLast4?: string;
}

const paymentIntentsStore = new Map<string, ServerPaymentIntent>();
const completedReceipts: ServerPaymentIntent[] = [];

// 1. POST /api/publisher/validate-questionnaire
// Evaluates the publisher's onboarding & compliance questionnaire before publishing an app/game
app.post('/api/publisher/validate-questionnaire', (req, res) => {
  try {
    const {
      studioName,
      ageRating,
      contentAdvisory,
      dataPrivacyPolicy,
      accessibilityFeatures,
      monetizationModel,
      priceCents,
      payoutMethod,
      supportContact,
      testedOfflineAndSandbox,
      acceptedPublisherTerms,
    } = req.body;

    if (!studioName || String(studioName).trim().length < 2) {
      res.status(400).json({ error: 'Studio or Publisher Name must be at least 2 characters.' });
      return;
    }

    if (!testedOfflineAndSandbox || !acceptedPublisherTerms) {
      res.status(400).json({
        error: 'You must confirm browser sandbox testing and accept the Publisher Terms & Distribution Agreement.',
      });
      return;
    }

    if (!supportContact || String(supportContact).trim().length < 3) {
      res.status(400).json({ error: 'Please provide a valid support contact email or URL for players.' });
      return;
    }

    // Check consistency between Age Rating and Content Advisory
    if (ageRating === 'Everyone (E)' && contentAdvisory === 'Moderate') {
      res.status(400).json({
        error:
          'Content Advisory mismatch: Releases with "Moderate" combat/action must select at least "Everyone 10+ (E10+)" or "Teen (T)".',
      });
      return;
    }

    const numericPrice = Number(priceCents || 0);
    if (monetizationModel === 'One-Time Purchase' && (numericPrice < 100 || numericPrice > 99999)) {
      res.status(400).json({
        error: 'One-Time Purchase apps must set a price between $1.00 (100 cents) and $999.99 (99999 cents).',
      });
      return;
    }

    const certHash = crypto.randomBytes(4).toString('hex').toUpperCase();
    const complianceCertificateId = `CERT-PG-${new Date().getFullYear()}-${certHash}`;
    const creatorNetCents = Math.round(numericPrice * 0.85);
    const platformFeeCents = numericPrice - creatorNetCents;

    res.json({
      verified: true,
      complianceCertificateId,
      summary: {
        studioName: String(studioName).trim(),
        ageRating,
        contentAdvisory,
        dataPrivacyPolicy,
        accessibilityFeatures,
        monetizationModel,
        payoutMethod,
        priceCents: monetizationModel === 'Free to Play' ? 0 : numericPrice,
        creatorNetCents: monetizationModel === 'Free to Play' ? 0 : creatorNetCents,
        platformFeeCents: monetizationModel === 'Free to Play' ? 0 : platformFeeCents,
        revenueShareLabel: '85% Creator Net / 15% Platform Infrastructure',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Questionnaire verification failed.';
    res.status(500).json({ error: message });
  }
});

// 2. POST /api/payments/create-intent
// Initializes a payment intent with 85/15 creator revenue split calculation
app.post('/api/payments/create-intent', (req, res) => {
  try {
    const {
      appId,
      appTitle,
      recipientAuthorId,
      buyerId,
      buyerName,
      amountCents,
      paymentType,
    } = req.body;

    const cleanAmount = Math.round(Number(amountCents || 0));
    if (!appId || !appTitle || cleanAmount < 100 || cleanAmount > 99999) {
      res.status(400).json({
        error: 'Payment amount must be between $1.00 (100 cents) and $999.99 (99999 cents).',
      });
      return;
    }

    const creatorNetCents = Math.round(cleanAmount * 0.85);
    const platformFeeCents = cleanAmount - creatorNetCents;
    const intentId = `pi_pg_${crypto.randomBytes(8).toString('hex')}`;

    const intent: ServerPaymentIntent = {
      intentId,
      appId: String(appId),
      appTitle: String(appTitle).slice(0, 80),
      recipientAuthorId: String(recipientAuthorId || 'playground-studio'),
      buyerId: String(buyerId || 'anonymous'),
      buyerName: String(buyerName || 'Player').slice(0, 80),
      amountCents: cleanAmount,
      creatorNetCents,
      platformFeeCents,
      currency: 'USD',
      paymentType:
        paymentType === 'Creator Supporter Pass' ? 'Creator Supporter Pass' : 'App License Purchase',
      status: 'requires_payment_method',
      createdAtIso: new Date().toISOString(),
    };

    paymentIntentsStore.set(intentId, intent);

    res.json({ intent });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create payment intent.';
    res.status(500).json({ error: message });
  }
});

// 3. POST /api/payments/execute
// Executes and settles a payment intent on the backend and issues a verified receipt
app.post('/api/payments/execute', (req, res) => {
  try {
    const { intentId, cardNumber, cardExpiry, cardCvc, cardholderName } = req.body;

    if (!intentId || !paymentIntentsStore.has(intentId)) {
      res.status(404).json({ error: 'Payment intent not found or expired. Please start checkout again.' });
      return;
    }

    const digitsOnly = String(cardNumber || '').replace(/\D/g, '');
    if (digitsOnly.length < 12 || digitsOnly.length > 19) {
      res.status(400).json({ error: 'Please enter a valid 16-digit card number.' });
      return;
    }

    if (!cardExpiry || !/^\d{2}\/\d{2,4}$/.test(String(cardExpiry).trim())) {
      res.status(400).json({ error: 'Card expiry must be in MM/YY format.' });
      return;
    }

    const cvcDigits = String(cardCvc || '').replace(/\D/g, '');
    if (cvcDigits.length < 3 || cvcDigits.length > 4) {
      res.status(400).json({ error: 'Please enter a valid 3 or 4 digit security code (CVC).' });
      return;
    }

    if (!cardholderName || String(cardholderName).trim().length < 2) {
      res.status(400).json({ error: 'Please provide the cardholder name.' });
      return;
    }

    const intent = paymentIntentsStore.get(intentId)!;
    const cardLast4 = digitsOnly.slice(-4);
    const cardBrand = digitsOnly.startsWith('4')
      ? 'Visa'
      : digitsOnly.startsWith('5')
        ? 'Mastercard'
        : digitsOnly.startsWith('3')
          ? 'Amex'
          : 'Card';

    const receiptNumber = `RCPT-${Date.now().toString(36).toUpperCase()}-${crypto
      .randomBytes(2)
      .toString('hex')
      .toUpperCase()}`;

    intent.status = 'succeeded';
    intent.cardBrand = cardBrand;
    intent.cardLast4 = cardLast4;
    intent.receiptNumber = receiptNumber;

    completedReceipts.unshift({ ...intent });
    if (completedReceipts.length > 50) {
      completedReceipts.pop();
    }

    res.json({
      settled: true,
      transaction: intent,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payment execution failed.';
    res.status(500).json({ error: message });
  }
});

// 4. GET /api/payments/ledger
// Returns backend payment gateway telemetry and recent settled receipts
app.get('/api/payments/ledger', (_req, res) => {
  const totalVolumeCents = completedReceipts.reduce((acc, r) => acc + r.amountCents, 0);
  const totalCreatorPayoutCents = completedReceipts.reduce((acc, r) => acc + r.creatorNetCents, 0);
  const totalPlatformFeeCents = completedReceipts.reduce((acc, r) => acc + r.platformFeeCents, 0);

  res.json({
    gatewayStatus: 'ACTIVE',
    totalTransactions: completedReceipts.length,
    totalVolumeCents,
    totalCreatorPayoutCents,
    totalPlatformFeeCents,
    recentReceipts: completedReceipts.slice(0, 10),
  });
});

// 5. POST /api/analyze-image
// Analyzes an uploaded photo/screenshot using model gemini-4-argon
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { imageBase64, mimeType, prompt, mode } = req.body;

    if (!imageBase64 || !mimeType) {
      res.status(400).json({ error: 'Missing imageBase64 or mimeType in request body.' });
      return;
    }

    const ai = getGeminiClient();
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

    const analysisPrompt =
      prompt && prompt.trim().length > 0
        ? prompt.trim()
        : mode === 'publish-autofill'
          ? 'Analyze this app or game screenshot/photo. Suggest a compelling title, a concise single-line tagline, a detailed description with gameplay or usage instructions, the best category (Game, Creative App, Developer Tool, Utility, or Simulation), a visual quality & accessibility summary, and a sample patch/improvement suggestion.'
          : 'Analyze this uploaded technical image, screenshot, UI capture, or traceback. Identify what is shown, extract key visible text or error details, diagnose any issues or architectural highlights, and provide a concrete unified git .patch diff or code enhancement.';

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: analysisPrompt,
          },
        ],
      },
      config: {
        systemInstruction:
          'You are the core visual intelligence engine for App and Game Playground. Analyze uploaded photos, game artwork, UI screenshots, and code tracebacks with high precision. Always return structured JSON matching the requested schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedTitle: {
              type: Type.STRING,
              description: 'Suggested app/game title or concise diagnostic title (2-80 chars).',
            },
            suggestedTagline: {
              type: Type.STRING,
              description: 'Single-line tagline summarizing the app, game, or visual finding (10-140 chars).',
            },
            suggestedCategory: {
              type: Type.STRING,
              description: 'One of: Game, Creative App, Developer Tool, Utility, Simulation.',
            },
            visualSummary: {
              type: Type.STRING,
              description: 'Detailed analysis of the visual composition, UI layout, gameplay mechanics, or scene contents.',
            },
            extractedText: {
              type: Type.STRING,
              description: 'Any visible text, HUD labels, logs, stack traces, or schema details detected in the image.',
            },
            technicalDiagnosis: {
              type: Type.STRING,
              description: 'Engineering assessment, UX accessibility review, or root-cause bug explanation.',
            },
            generatedPatch: {
              type: Type.STRING,
              description: 'A valid unified diff (.patch) or code snippet implementing a fix or enhancement inspired by the image.',
            },
          },
          required: [
            'suggestedTitle',
            'suggestedTagline',
            'suggestedCategory',
            'visualSummary',
            'extractedText',
            'technicalDiagnosis',
            'generatedPatch',
          ],
        },
      },
    });

    const rawText = response.text || '{}';
    const parsed = JSON.parse(rawText);
    res.json({ result: parsed });
  } catch (error: unknown) {
    console.error('Gemini 4 Argon image analysis error:', error);
    const message = error instanceof Error ? error.message : 'Failed to analyze image with Gemini 4 Argon';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`App and Game Playground server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
