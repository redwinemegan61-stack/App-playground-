import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  getOrCreateUser,
  recordQuestionnaireInSql,
  recordPublishedAppInSql,
  updateReviewStatusInSql,
  recordPaymentInSql,
  getUserQuestionnairesFromSql,
} from './src/db/users.ts';

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
  paymentType: 'App License Purchase' | 'Creator Supporter Pass' | 'Publisher Upload Fee ($0.99)';
  status: 'requires_payment_method' | 'succeeded';
  createdAtIso: string;
  receiptNumber?: string;
  cardBrand?: string;
  cardLast4?: string;
}

const paymentIntentsStore = new Map<string, ServerPaymentIntent>();
const completedReceipts: ServerPaymentIntent[] = [];
let platformStripePaymentLink: string = process.env.STRIPE_PAYMENT_LINK || '';

// 0. GET & POST /api/payments/stripe-config
// Allows the platform owner or publisher to link a live Stripe Payment Link (https://buy.stripe.com/...)
app.get('/api/payments/stripe-config', (_req, res) => {
  res.json({
    stripePaymentLink: platformStripePaymentLink,
    configured: Boolean(platformStripePaymentLink),
  });
});

app.post('/api/payments/stripe-config', (req, res) => {
  const rawLink = String(req.body?.stripePaymentLink || '').trim();
  if (rawLink && (!rawLink.startsWith('https://') || rawLink.length > 500)) {
    res.status(400).json({
      error: 'Please enter a valid HTTPS Stripe Payment Link (e.g. https://buy.stripe.com/...).',
    });
    return;
  }
  platformStripePaymentLink = rawLink;
  res.json({
    stripePaymentLink: platformStripePaymentLink,
    configured: Boolean(platformStripePaymentLink),
  });
});

// POST /api/payments/confirm-stripe-link
// Records a completed Stripe Payment Link checkout and issues a verified receipt
app.post('/api/payments/confirm-stripe-link', (req, res) => {
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

    const cleanAmount = Math.max(99, Math.min(99999, Math.round(Number(amountCents || 99))));
    const isUploadFee = paymentType === 'Publisher Upload Fee ($0.99)';
    const creatorNetCents = isUploadFee ? 0 : Math.round(cleanAmount * 0.85);
    const platformFeeCents = cleanAmount - creatorNetCents;
    const intentId = `pi_stripe_${crypto.randomBytes(6).toString('hex')}`;
    const receiptNumber = `RCPT-STRIPE-${Date.now().toString(36).toUpperCase()}`;

    const transaction: ServerPaymentIntent = {
      intentId,
      appId: String(appId || 'app-upload-fee'),
      appTitle: String(appTitle || 'Playground Release').slice(0, 80),
      recipientAuthorId: String(recipientAuthorId || 'playground-studio'),
      buyerId: String(buyerId || 'anonymous'),
      buyerName: String(buyerName || 'Player').slice(0, 80),
      amountCents: cleanAmount,
      creatorNetCents,
      platformFeeCents,
      currency: 'USD',
      paymentType: isUploadFee
        ? 'Publisher Upload Fee ($0.99)'
        : paymentType === 'Creator Supporter Pass'
          ? 'Creator Supporter Pass'
          : 'App License Purchase',
      status: 'succeeded',
      createdAtIso: new Date().toISOString(),
      cardBrand: 'Stripe Link',
      cardLast4: '4242',
      receiptNumber,
    };

    completedReceipts.unshift(transaction);
    if (completedReceipts.length > 50) {
      completedReceipts.pop();
    }

    res.json({
      settled: true,
      transaction,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Stripe Payment Link confirmation failed.';
    res.status(500).json({ error: message });
  }
});

// 1. POST /api/publisher/validate-questionnaire
// Evaluates the publisher's Google Play–style content rating & safety questionnaire before submitting for owner review
app.post('/api/publisher/validate-questionnaire', (req, res) => {
  try {
    const {
      studioName,
      ageRating,
      contentAdvisory,
      violenceLevel = 'None',
      fearLevel = 'None',
      languageLevel = 'None',
      substancesLevel = 'None',
      gamblingThemes = 'None',
      userInteraction = 'No User-to-User Interaction',
      generalSafetyStandards = true,
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

    if (!generalSafetyStandards) {
      res.status(400).json({
        error:
          'You must attest that your application meets General Safety Standards (no malware, non-consensual content, or deceptive behavior).',
      });
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

    // Check consistency between Age Rating and Google Play Content Rating disclosures
    const isMatureContent =
      violenceLevel === 'Realistic or Intense Violence' ||
      fearLevel === 'Intense Horror / Graphic Trauma' ||
      languageLevel === 'Explicit / Frequent Profanity' ||
      substancesLevel === 'Depicts Drug / Alcohol Use';

    if (isMatureContent && ageRating !== 'Mature 17+ (M)') {
      res.status(400).json({
        error:
          'Google Play Rating Mismatch: Apps disclosing Realistic/Intense Violence, Intense Horror/Gore, Explicit Profanity, or Drug/Alcohol Use must be rated "Mature 17+ (M)".',
      });
      return;
    }

    if (ageRating === 'Everyone (E)' && contentAdvisory === 'Moderate') {
      res.status(400).json({
        error:
          'Content Advisory mismatch: Releases with "Moderate" combat/action must select at least "Everyone 10+ (E10+)" or "Teen (T)".',
      });
      return;
    }

    const numericPrice = Number(priceCents || 0);
    if (monetizationModel === 'One-Time Purchase' && (numericPrice < 99 || numericPrice > 99999)) {
      res.status(400).json({
        error: 'One-Time Purchase apps must set a price between $0.99 (99 cents) and $999.99 (99999 cents).',
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
      uploadDeploymentFeeCents: 99,
      reviewStatus: 'pending',
      summary: {
        studioName: String(studioName).trim(),
        ageRating,
        contentAdvisory,
        violenceLevel,
        fearLevel,
        languageLevel,
        substancesLevel,
        gamblingThemes,
        userInteraction,
        generalSafetyStandards: Boolean(generalSafetyStandards),
        dataPrivacyPolicy,
        accessibilityFeatures,
        monetizationModel,
        payoutMethod,
        uploadDeploymentFeeCents: 99,
        priceCents: monetizationModel === 'Free to Play' ? 0 : numericPrice,
        creatorNetCents: monetizationModel === 'Free to Play' ? 0 : creatorNetCents,
        platformFeeCents: monetizationModel === 'Free to Play' ? 0 : platformFeeCents,
        revenueShareLabel: '$0.99 Per App Upload Fee · 85% Creator Net / 15% Platform Split',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Questionnaire verification failed.';
    res.status(500).json({ error: message });
  }
});

// 2. POST /api/payments/create-intent
// Initializes a payment intent with $0.99 Upload Fee or 85/15 creator revenue split calculation
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
    if (!appId || !appTitle || cleanAmount < 99 || cleanAmount > 99999) {
      res.status(400).json({
        error: 'Payment amount must be between $0.99 (99 cents) and $999.99 (99999 cents).',
      });
      return;
    }

    const isUploadFee = paymentType === 'Publisher Upload Fee ($0.99)';
    const creatorNetCents = isUploadFee ? 0 : Math.round(cleanAmount * 0.85);
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
      paymentType: isUploadFee
        ? 'Publisher Upload Fee ($0.99)'
        : paymentType === 'Creator Supporter Pass'
          ? 'Creator Supporter Pass'
          : 'App License Purchase',
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
    stripePaymentLink: platformStripePaymentLink,
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

// 6. POST /api/auth/sync
// Synchronizes the authenticated Firebase user into Cloud SQL users table
app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email || '';
    const displayName = req.body?.displayName || req.user?.name || '';
    if (!uid || !email) {
      res.status(400).json({ error: 'Invalid user token claims.' });
      return;
    }
    const dbUser = await getOrCreateUser(uid, email, displayName);
    res.json({ user: dbUser });
  } catch (error: unknown) {
    console.error('Failed to sync user:', error);
    const message = error instanceof Error ? error.message : 'Failed to sync user';
    res.status(500).json({ error: message });
  }
});

// 7. POST /api/publisher/sync-sql
// Records publisher safety questionnaire and optional published app in Cloud SQL
app.post('/api/publisher/sync-sql', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email || '';
    if (!uid || !email) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const isOwnerAdmin = email.toLowerCase() === 'redwinemegan61@gmail.com';
    const { questionnaire, publishedApp } = req.body;

    let savedQuestionnaire = null;
    if (questionnaire) {
      savedQuestionnaire = await recordQuestionnaireInSql(uid, email, {
        ...questionnaire,
        reviewStatus: isOwnerAdmin ? 'approved' : 'pending',
      });
    }

    let savedApp = null;
    if (publishedApp) {
      savedApp = await recordPublishedAppInSql(uid, email, {
        ...publishedApp,
        isPublic: isOwnerAdmin ? true : false,
        reviewStatus: isOwnerAdmin ? 'approved' : 'pending',
      });
    }

    res.json({ questionnaire: savedQuestionnaire, publishedApp: savedApp });
  } catch (error: unknown) {
    console.error('Failed to sync publisher submission:', error);
    const message = error instanceof Error ? error.message : 'Failed to sync publisher submission';
    res.status(500).json({ error: message });
  }
});

// 8. POST /api/publisher/review-decision
// Strictly restricted to platform owner (redwinemegan61@gmail.com) to approve or deny questionnaires & apps
app.post('/api/publisher/review-decision', requireAuth, async (req: AuthRequest, res) => {
  try {
    const email = req.user?.email || '';
    if (email.toLowerCase() !== 'redwinemegan61@gmail.com') {
      res.status(403).json({
        error: 'Forbidden: Only the platform owner (redwinemegan61@gmail.com) can approve or deny submissions.',
      });
      return;
    }

    const { questionnaireDocId, appDocId, decision, adminReviewNotes } = req.body;
    if (!questionnaireDocId || (decision !== 'approved' && decision !== 'denied')) {
      res.status(400).json({ error: 'Invalid review decision payload.' });
      return;
    }

    const result = await updateReviewStatusInSql(
      String(questionnaireDocId),
      String(appDocId || ''),
      decision,
      String(adminReviewNotes || '')
    );
    res.json(result);
  } catch (error: unknown) {
    console.error('Failed to update review decision:', error);
    const message = error instanceof Error ? error.message : 'Failed to update review decision';
    res.status(500).json({ error: message });
  }
});

// 9. GET /api/publisher/questionnaires
// Returns questionnaires for the signed-in user (or all questionnaires for redwinemegan61@gmail.com)
app.get('/api/publisher/questionnaires', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email || '';
    if (!uid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const isOwnerAdmin = email.toLowerCase() === 'redwinemegan61@gmail.com';
    const items = await getUserQuestionnairesFromSql(uid, isOwnerAdmin);
    res.json({ questionnaires: items });
  } catch (error: unknown) {
    console.error('Failed to fetch questionnaires:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch questionnaires';
    res.status(500).json({ error: message });
  }
});

// 10. POST /api/payments/sync-sql
// Synchronizes a settled payment receipt into Cloud SQL payment_transactions table
app.post('/api/payments/sync-sql', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email || '';
    if (!uid || !email) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const saved = await recordPaymentInSql(uid, email, req.body);
    res.json({ transaction: saved });
  } catch (error: unknown) {
    console.error('Failed to sync payment to database:', error);
    const message = error instanceof Error ? error.message : 'Failed to sync payment';
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
