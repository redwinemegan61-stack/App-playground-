/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Play,
  Heart,
  Search,
  Upload,
  Sparkles,
  Plus,
  Download,
  Copy,
  Check,
  Trash2,
  Star,
  LogIn,
  LogOut,
  FileCode2,
  Gamepad2,
  Layers,
  AlertCircle,
  CreditCard,
  ShieldCheck,
  Receipt,
  X,
  CheckCircle2,
  ClipboardCheck,
} from 'lucide-react';
import {
  db,
  auth,
  signInWithGoogle,
  logOutUser,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  BUILT_IN_APPS,
  PlaygroundAppItem,
  AppCategory,
  PlayableEngineType,
  MonetizationModel,
  AgeRating,
  ContentAdvisory,
  DataPrivacyPolicy,
  AccessibilityFeatureSet,
  PayoutMethod,
  AppReviewItem,
  PaymentRecordItem,
  PublisherQuestionnaireItem,
  GeminiImageAnalysisResult,
  createSampleDiagnosticImage,
  formatPriceCents,
  getSupporterPerksForApp,
} from './data/defaultApps';
import { ArtworkCover } from './components/ArtworkCover';
import { PlayableStage } from './components/PlayableExperiences';

type ActiveSection = 'discover' | 'stage' | 'vision' | 'publish' | 'payments';

const CATEGORIES: Array<'All' | AppCategory | 'My Published'> = [
  'All',
  'Game',
  'Creative App',
  'Developer Tool',
  'Utility',
  'Simulation',
  'My Published',
];

function sanitizeDocId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${Date.now()}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function formatFirestoreDate(val: unknown): string {
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return 'Just now';
}

interface BackendLedgerSummary {
  gatewayStatus: string;
  stripePaymentLink?: string;
  totalTransactions: number;
  totalVolumeCents: number;
  totalCreatorPayoutCents: number;
  totalPlatformFeeCents: number;
  recentReceipts: Array<{
    intentId: string;
    appId: string;
    appTitle: string;
    buyerName: string;
    amountCents: number;
    creatorNetCents: number;
    platformFeeCents: number;
    paymentType: string;
    cardBrand?: string;
    cardLast4?: string;
    receiptNumber?: string;
    createdAtIso: string;
  }>;
}

const LIVE_SHARED_WEB_URL = 'https://ais-pre-3hhknymbqekkoelmdgwoap-464573425992.us-west1.run.app';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  // Navigation & Active Stage State
  const [activeSection, setActiveSection] = useState<ActiveSection>('discover');
  const [selectedAppId, setSelectedAppId] = useState<string>(BUILT_IN_APPS[0].id);

  // Firestore Published Apps & Reviews
  const [communityApps, setCommunityApps] = useState<PlaygroundAppItem[]>([]);
  const [loadingApps, setLoadingApps] = useState<boolean>(true);
  const [reviews, setReviews] = useState<AppReviewItem[]>([]);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);

  // Firestore User Payments & Questionnaires
  const [userPayments, setUserPayments] = useState<PaymentRecordItem[]>([]);
  const [creatorSales, setCreatorSales] = useState<PaymentRecordItem[]>([]);
  const [myQuestionnaires, setMyQuestionnaires] = useState<PublisherQuestionnaireItem[]>([]);
  const [unlockedAppIds, setUnlockedAppIds] = useState<string[]>([]);
  const [backendLedger, setBackendLedger] = useState<BackendLedgerSummary | null>(null);

  // Catalog Filters
  const [selectedCategory, setSelectedCategory] = useState<'All' | AppCategory | 'My Published'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Publish Form + Publisher Questionnaire State
  const [pubTitle, setPubTitle] = useState<string>('');
  const [pubTagline, setPubTagline] = useState<string>('');
  const [pubDescription, setPubDescription] = useState<string>('');
  const [pubCategory, setPubCategory] = useState<AppCategory>('Game');
  const [pubPlayType, setPubPlayType] = useState<PlayableEngineType>('starlight-tactics');
  const [pubExternalUrl, setPubExternalUrl] = useState<string>('');
  const [pubVersion, setPubVersion] = useState<string>('1.0.0');
  const [pubAiSummary, setPubAiSummary] = useState<string>('');

  // Publisher Questionnaire Fields
  const [qStudioName, setQStudioName] = useState<string>('');
  const [qAgeRating, setQAgeRating] = useState<AgeRating>('Everyone (E)');
  const [qContentAdvisory, setQContentAdvisory] = useState<ContentAdvisory>('None');
  const [qDataPrivacy, setQDataPrivacy] = useState<DataPrivacyPolicy>('Zero Data Collected');
  const [qAccessibility, setQAccessibility] = useState<AccessibilityFeatureSet>('Keyboard + Mouse + High-Contrast');
  const [qMonetization, setQMonetization] = useState<MonetizationModel>('Free to Play');
  const [qPriceDollars, setQPriceDollars] = useState<string>('0.00');
  const [qPayoutMethod, setQPayoutMethod] = useState<PayoutMethod>(
    'Stripe Connect Express (85% Creator / 15% Platform)'
  );
  const [qStripePaymentLink, setQStripePaymentLink] = useState<string>(() => {
    try {
      return localStorage.getItem('playground_stripe_link') || '';
    } catch {
      return '';
    }
  });
  const [platformStripeLink, setPlatformStripeLink] = useState<string>(() => {
    try {
      return localStorage.getItem('playground_stripe_link') || '';
    } catch {
      return '';
    }
  });
  const [stripeLinkInput, setStripeLinkInput] = useState<string>(() => {
    try {
      return localStorage.getItem('playground_stripe_link') || '';
    } catch {
      return '';
    }
  });
  const [stripeSaveNotice, setStripeSaveNotice] = useState<string | null>(null);
  const [copiedLiveUrl, setCopiedLiveUrl] = useState<boolean>(false);
  const [qSupportContact, setQSupportContact] = useState<string>('support@playground-creator.dev');
  const [qTestedSandbox, setQTestedSandbox] = useState<boolean>(true);
  const [qAcceptedTerms, setQAcceptedTerms] = useState<boolean>(true);
  const [verifiedCertId, setVerifiedCertId] = useState<string | null>(null);
  const [verifyingQuestionnaire, setVerifyingQuestionnaire] = useState<boolean>(false);

  const [pubStatusMessage, setPubStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  // Payment Checkout Modal State
  const [checkoutApp, setCheckoutApp] = useState<PlaygroundAppItem | null>(null);
  const [checkoutAmountCents, setCheckoutAmountCents] = useState<number>(499);
  const [checkoutType, setCheckoutType] = useState<'App License Purchase' | 'Creator Supporter Pass'>(
    'App License Purchase'
  );
  const [cardholderName, setCardholderName] = useState<string>('Alex Rivera');
  const [cardNumber, setCardNumber] = useState<string>('4242 4242 4242 4242');
  const [cardExpiry, setCardExpiry] = useState<string>('08/29');
  const [cardCvc, setCardCvc] = useState<string>('842');
  const [processingPayment, setProcessingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [settledReceipt, setSettledReceipt] = useState<{
    receiptNumber: string;
    appTitle: string;
    amountCents: number;
    creatorNetCents: number;
    platformFeeCents: number;
    cardBrand: string;
    cardLast4: string;
    paymentType: string;
    createdAtIso: string;
  } | null>(null);

  // Gemini 4 Argon Image Analysis State
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string>('');
  const [uploadedMimeType, setUploadedMimeType] = useState<string>('image/png');
  const [uploadedImageLabel, setUploadedImageLabel] = useState<string>('');
  const [visionPrompt, setVisionPrompt] = useState<string>(
    'Analyze this app or game screenshot. Suggest publishing metadata (title, tagline, category), summarize visual UX & gameplay mechanics, and generate a unified .patch enhancement.'
  );
  const [visionLoading, setVisionLoading] = useState<boolean>(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [visionResult, setVisionResult] = useState<GeminiImageAnalysisResult | null>(null);
  const [copiedGeneratedPatch, setCopiedGeneratedPatch] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch Backend Payment Gateway Ledger
  const fetchBackendLedger = useCallback(async () => {
    try {
      const res = await fetch('/api/payments/ledger');
      if (res.ok) {
        const data: BackendLedgerSummary = await res.json();
        setBackendLedger(data);
        if (data.stripePaymentLink) {
          setPlatformStripeLink(data.stripePaymentLink);
          setStripeLinkInput((prev) => prev || data.stripePaymentLink || '');
        }
      }
    } catch {
      // Ignore transient network errors
    }
  }, []);

  const handleSaveStripePaymentLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = stripeLinkInput.trim();
    setStripeSaveNotice(null);
    if (cleaned && !cleaned.startsWith('https://')) {
      setStripeSaveNotice('Error: Stripe Payment Link must start with https:// (e.g. https://buy.stripe.com/...)');
      return;
    }
    try {
      const res = await fetch('/api/payments/stripe-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripePaymentLink: cleaned }),
      });
      if (res.ok) {
        setPlatformStripeLink(cleaned);
        setQStripePaymentLink(cleaned);
        try {
          localStorage.setItem('playground_stripe_link', cleaned);
        } catch {
          // Ignore storage error
        }
        setStripeSaveNotice(
          cleaned
            ? 'Stripe Payment Link connected! All checkouts now link directly to your Stripe URL.'
            : 'Stripe Payment Link cleared.'
        );
        fetchBackendLedger();
      }
    } catch {
      setStripeSaveNotice('Saved locally.');
    }
  };

  useEffect(() => {
    fetchBackendLedger();
  }, [fetchBackendLedger]);

  // 1. Track Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser?.displayName) {
        setQStudioName((prev) => prev || `${currentUser.displayName} Studio`);
        setCardholderName(currentUser.displayName);
      }
      if (currentUser?.email) {
        setQSupportContact(currentUser.email);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to public apps in Firestore (`where('isPublic', '==', true)`)
  useEffect(() => {
    if (!authReady) return;
    const appsPath = 'apps';
    const q = query(collection(db, appsPath), where('isPublic', '==', true));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items: PlaygroundAppItem[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            title: String(data.title || 'Untitled App'),
            tagline: String(data.tagline || ''),
            description: String(data.description || ''),
            category: (data.category as AppCategory) || 'Game',
            playType: (data.playType as PlayableEngineType) || 'starlight-tactics',
            externalUrl: String(data.externalUrl || ''),
            version: String(data.version || '1.0.0'),
            authorId: String(data.authorId || ''),
            authorName: String(data.authorName || 'Creator'),
            isPublic: Boolean(data.isPublic),
            playsCount: Number(data.playsCount || 0),
            likesCount: Number(data.likesCount || 0),
            priceCents: Number(data.priceCents || 0),
            monetizationModel: (data.monetizationModel as MonetizationModel) || 'Free to Play',
            ageRating: (data.ageRating as AgeRating) || 'Everyone (E)',
            dataPrivacyPolicy: (data.dataPrivacyPolicy as DataPrivacyPolicy) || 'Zero Data Collected',
            accessibilityFeatures:
              (data.accessibilityFeatures as AccessibilityFeatureSet) || 'Keyboard + Mouse + High-Contrast',
            aiVisualSummary: String(data.aiVisualSummary || ''),
            stripePaymentLink: String(data.stripePaymentLink || ''),
            createdAtLabel: formatFirestoreDate(data.createdAt),
            isBuiltIn: false,
          };
        });
        setCommunityApps(items);
        setLoadingApps(false);
      },
      (err) => {
        setLoadingApps(false);
        handleFirestoreError(err, OperationType.LIST, appsPath);
      }
    );
    return () => unsub();
  }, [authReady]);

  // 3. Subscribe to signed-in user's payments (as buyer & creator) and publisher questionnaires
  useEffect(() => {
    if (!authReady || !user) {
      setUserPayments([]);
      setCreatorSales([]);
      setMyQuestionnaires([]);
      return;
    }

    const buyerQuery = query(collection(db, 'payments'), where('buyerId', '==', user.uid));
    const unsubBuyer = onSnapshot(
      buyerQuery,
      (snapshot) => {
        const items: PaymentRecordItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            appId: String(data.appId || ''),
            appTitle: String(data.appTitle || ''),
            buyerId: String(data.buyerId || ''),
            buyerName: String(data.buyerName || ''),
            recipientAuthorId: String(data.recipientAuthorId || ''),
            amountCents: Number(data.amountCents || 0),
            creatorNetCents: Number(data.creatorNetCents || 0),
            platformFeeCents: Number(data.platformFeeCents || 0),
            currency: String(data.currency || 'USD'),
            paymentType:
              data.paymentType === 'Creator Supporter Pass'
                ? 'Creator Supporter Pass'
                : 'App License Purchase',
            cardBrand: String(data.cardBrand || 'Visa'),
            cardLast4: String(data.cardLast4 || '4242'),
            receiptNumber: String(data.receiptNumber || ''),
            status: String(data.status || 'succeeded'),
            createdAtLabel: formatFirestoreDate(data.createdAt),
          };
        });
        setUserPayments(items);
        setUnlockedAppIds((prev) => Array.from(new Set([...prev, ...items.map((i) => i.appId)])));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'payments');
      }
    );

    const sellerQuery = query(collection(db, 'payments'), where('recipientAuthorId', '==', user.uid));
    const unsubSeller = onSnapshot(
      sellerQuery,
      (snapshot) => {
        const items: PaymentRecordItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            appId: String(data.appId || ''),
            appTitle: String(data.appTitle || ''),
            buyerId: String(data.buyerId || ''),
            buyerName: String(data.buyerName || ''),
            recipientAuthorId: String(data.recipientAuthorId || ''),
            amountCents: Number(data.amountCents || 0),
            creatorNetCents: Number(data.creatorNetCents || 0),
            platformFeeCents: Number(data.platformFeeCents || 0),
            currency: String(data.currency || 'USD'),
            paymentType:
              data.paymentType === 'Creator Supporter Pass'
                ? 'Creator Supporter Pass'
                : 'App License Purchase',
            cardBrand: String(data.cardBrand || 'Visa'),
            cardLast4: String(data.cardLast4 || '4242'),
            receiptNumber: String(data.receiptNumber || ''),
            status: String(data.status || 'succeeded'),
            createdAtLabel: formatFirestoreDate(data.createdAt),
          };
        });
        setCreatorSales(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'payments');
      }
    );

    const questQuery = query(collection(db, 'publisherQuestionnaires'), where('authorId', '==', user.uid));
    const unsubQuest = onSnapshot(
      questQuery,
      (snapshot) => {
        const items: PublisherQuestionnaireItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            appId: String(data.appId || ''),
            authorId: String(data.authorId || ''),
            studioName: String(data.studioName || ''),
            ageRating: (data.ageRating as AgeRating) || 'Everyone (E)',
            contentAdvisory: (data.contentAdvisory as ContentAdvisory) || 'None',
            dataPrivacyPolicy: (data.dataPrivacyPolicy as DataPrivacyPolicy) || 'Zero Data Collected',
            accessibilityFeatures:
              (data.accessibilityFeatures as AccessibilityFeatureSet) || 'Keyboard + Mouse + High-Contrast',
            monetizationModel: (data.monetizationModel as MonetizationModel) || 'Free to Play',
            payoutMethod:
              (data.payoutMethod as PayoutMethod) ||
              'Stripe Connect Express (85% Creator / 15% Platform)',
            supportContact: String(data.supportContact || ''),
            complianceCertificateId: String(data.complianceCertificateId || ''),
            createdAtLabel: formatFirestoreDate(data.createdAt),
          };
        });
        setMyQuestionnaires(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'publisherQuestionnaires');
      }
    );

    return () => {
      unsubBuyer();
      unsubSeller();
      unsubQuest();
    };
  }, [authReady, user]);

  // Combine Built-In Flagship Apps + Community Published Apps
  const allApps: PlaygroundAppItem[] = [...communityApps, ...BUILT_IN_APPS];
  const selectedApp = allApps.find((a) => a.id === selectedAppId) || allApps[0];

  // 4. Subscribe to reviews for currently selected community app
  useEffect(() => {
    if (!authReady || !selectedApp || selectedApp.isBuiltIn) {
      setReviews([]);
      return;
    }
    const reviewsPath = `apps/${selectedApp.id}/reviews`;
    const q = query(
      collection(db, 'apps', selectedApp.id, 'reviews'),
      where('appId', '==', selectedApp.id),
      where('rating', '>=', 1)
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const loaded: AppReviewItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            appId: String(data.appId || selectedApp.id),
            authorId: String(data.authorId || ''),
            authorName: String(data.authorName || 'Player'),
            rating: Number(data.rating || 5),
            comment: String(data.comment || ''),
            createdAtLabel: formatFirestoreDate(data.createdAt),
          };
        });
        setReviews(loaded);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, reviewsPath);
      }
    );
    return () => unsub();
  }, [authReady, selectedApp]);

  // Load initial sample image into Gemini 4 Argon Vision Lab on mount
  useEffect(() => {
    const sample = createSampleDiagnosticImage('game-ui');
    setUploadedImageDataUrl(sample.dataUrl);
    setUploadedMimeType(sample.mimeType);
    setUploadedImageLabel(sample.label);
    setVisionPrompt(sample.defaultPrompt);
  }, []);

  // Filter catalog apps
  const filteredApps = allApps.filter((item) => {
    const matchesCategory =
      selectedCategory === 'All'
        ? true
        : selectedCategory === 'My Published'
          ? Boolean(user && item.authorId === user.uid)
          : item.category === selectedCategory;

    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.tagline.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.authorName.toLowerCase().includes(q);

    return matchesCategory && matchesQuery;
  });

  // Open Checkout Modal for purchasing an app or supporting a creator
  const handleOpenCheckout = (appItem: PlaygroundAppItem, forceSupporterPass = false) => {
    setCheckoutApp(appItem);
    setPaymentError(null);
    setSettledReceipt(null);

    if (appItem.priceCents > 0 && !forceSupporterPass) {
      setCheckoutAmountCents(appItem.priceCents);
      setCheckoutType('App License Purchase');
    } else {
      setCheckoutAmountCents(500); // Default $5.00 Creator Supporter Pass
      setCheckoutType('Creator Supporter Pass');
    }
  };

  // Execute Backend Payment Flow (/api/payments/create-intent -> /api/payments/execute -> Firestore /payments)
  const handleRunPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutApp) return;

    setProcessingPayment(true);
    setPaymentError(null);

    try {
      // Step 1: Create Backend Payment Intent
      const intentRes = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: checkoutApp.id,
          appTitle: checkoutApp.title,
          recipientAuthorId: checkoutApp.authorId,
          buyerId: user?.uid || 'guest-player',
          buyerName: user?.displayName || cardholderName.trim() || 'Player',
          amountCents: checkoutAmountCents,
          paymentType: checkoutType,
        }),
      });

      const intentData = await intentRes.json();
      if (!intentRes.ok) {
        throw new Error(intentData.error || 'Could not initialize payment intent.');
      }

      // Step 2: Execute & Settle Payment on Backend
      const execRes = await fetch('/api/payments/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentId: intentData.intent.intentId,
          cardNumber,
          cardExpiry,
          cardCvc,
          cardholderName,
        }),
      });

      const execData = await execRes.json();
      if (!execRes.ok) {
        throw new Error(execData.error || 'Card authorization failed.');
      }

      const settled = execData.transaction;

      // Step 3: If user is authenticated, also persist the verified transaction to Firestore `/payments/{paymentId}`
      if (user) {
        const paymentDocId = sanitizeDocId('pay');
        const paymentPath = `payments/${paymentDocId}`;
        try {
          await setDoc(doc(db, 'payments', paymentDocId), {
            appId: checkoutApp.id,
            appTitle: checkoutApp.title.slice(0, 80),
            buyerId: user.uid,
            buyerName: (user.displayName || cardholderName.trim() || 'Player').slice(0, 80),
            recipientAuthorId: checkoutApp.authorId,
            amountCents: Number(settled.amountCents),
            creatorNetCents: Number(settled.creatorNetCents),
            platformFeeCents: Number(settled.platformFeeCents),
            currency: 'USD',
            paymentType: checkoutType,
            cardBrand: String(settled.cardBrand || 'Visa'),
            cardLast4: String(settled.cardLast4 || '4242'),
            receiptNumber: String(settled.receiptNumber),
            status: 'succeeded',
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, paymentPath);
        }
      }

      setUnlockedAppIds((prev) => Array.from(new Set([...prev, checkoutApp.id])));
      setSettledReceipt({
        receiptNumber: settled.receiptNumber,
        appTitle: checkoutApp.title,
        amountCents: settled.amountCents,
        creatorNetCents: settled.creatorNetCents,
        platformFeeCents: settled.platformFeeCents,
        cardBrand: settled.cardBrand,
        cardLast4: settled.cardLast4,
        paymentType: checkoutType,
        createdAtIso: settled.createdAtIso,
      });

      await fetchBackendLedger();
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : 'Payment processing failed.');
    } finally {
      setProcessingPayment(false);
    }
  };

  // Launch an app into the interactive stage and increment playsCount if Firestore-backed
  const handleLaunchApp = async (appItem: PlaygroundAppItem) => {
    setSelectedAppId(appItem.id);
    setActiveSection('stage');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (!appItem.isBuiltIn && user) {
      const docPath = `apps/${appItem.id}`;
      try {
        await updateDoc(doc(db, 'apps', appItem.id), {
          playsCount: appItem.playsCount + 1,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    }
  };

  // Upvote / Like an app
  const handleLikeApp = async (appItem: PlaygroundAppItem) => {
    if (appItem.isBuiltIn) return;
    if (!user) {
      await signInWithGoogle();
      return;
    }
    const docPath = `apps/${appItem.id}`;
    try {
      await updateDoc(doc(db, 'apps', appItem.id), {
        likesCount: appItem.likesCount + 1,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    }
  };

  // Delete user's published app
  const handleDeleteApp = async (appItem: PlaygroundAppItem) => {
    if (appItem.isBuiltIn || !user || appItem.authorId !== user.uid) return;
    const docPath = `apps/${appItem.id}`;
    try {
      await deleteDoc(doc(db, 'apps', appItem.id));
      if (selectedAppId === appItem.id) {
        setSelectedAppId(BUILT_IN_APPS[0].id);
        setActiveSection('discover');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  };

  // Verify Publisher Questionnaire via Backend Endpoint (/api/publisher/validate-questionnaire)
  const handleVerifyQuestionnaireOnly = async () => {
    setVerifyingQuestionnaire(true);
    setPubStatusMessage(null);
    try {
      const parsedDollars = parseFloat(qPriceDollars || '0');
      const computedPriceCents =
        qMonetization === 'Free to Play'
          ? 0
          : Math.max(0, Math.min(99999, Math.round((isNaN(parsedDollars) ? 0 : parsedDollars) * 100)));

      const res = await fetch('/api/publisher/validate-questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioName: qStudioName.trim() || user?.displayName || 'Indie Studio',
          ageRating: qAgeRating,
          contentAdvisory: qContentAdvisory,
          dataPrivacyPolicy: qDataPrivacy,
          accessibilityFeatures: qAccessibility,
          monetizationModel: qMonetization,
          priceCents: computedPriceCents,
          payoutMethod: qPayoutMethod,
          supportContact: qSupportContact.trim(),
          testedOfflineAndSandbox: qTestedSandbox,
          acceptedPublisherTerms: qAcceptedTerms,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Questionnaire validation failed.');
      }

      setVerifiedCertId(data.complianceCertificateId);
      setPubStatusMessage({
        type: 'success',
        text: `Publisher Questionnaire verified by backend! Compliance Certificate: ${data.complianceCertificateId}`,
      });
    } catch (err: unknown) {
      setPubStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to validate questionnaire.',
      });
    } finally {
      setVerifyingQuestionnaire(false);
    }
  };

  // Submit a new App or Game + Publisher Questionnaire to Backend & Firestore
  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPubStatusMessage(null);

    if (!user) {
      setPubStatusMessage({
        type: 'error',
        text: 'Please sign in with Google first to complete the Publisher Questionnaire and publish your app.',
      });
      return;
    }

    const cleanTitle = pubTitle.trim().slice(0, 80);
    const cleanTagline = pubTagline.trim().slice(0, 140);
    const cleanDesc = pubDescription.trim().slice(0, 1500);
    const cleanVersion = pubVersion.trim().slice(0, 24) || '1.0.0';
    const cleanUrl = pubExternalUrl.trim().slice(0, 500);
    const cleanStudio = (qStudioName.trim() || user.displayName || 'Creator Studio').slice(0, 80);
    const cleanSupport = qSupportContact.trim().slice(0, 120);
    const cleanAiSummary =
      pubAiSummary.trim().slice(0, 1000) ||
      `Verified via Publisher Questionnaire (${qAgeRating} · ${qDataPrivacy} · ${qAccessibility}).`;

    if (cleanTitle.length < 2) {
      setPubStatusMessage({ type: 'error', text: 'Title must be between 2 and 80 characters.' });
      return;
    }
    if (cleanTagline.length < 4) {
      setPubStatusMessage({ type: 'error', text: 'Tagline must be between 4 and 140 characters.' });
      return;
    }
    if (cleanDesc.length < 10) {
      setPubStatusMessage({ type: 'error', text: 'Description must be at least 10 characters.' });
      return;
    }

    const parsedDollars = parseFloat(qPriceDollars || '0');
    const computedPriceCents =
      qMonetization === 'Free to Play'
        ? 0
        : Math.max(100, Math.min(99999, Math.round((isNaN(parsedDollars) ? 4.99 : parsedDollars) * 100)));

    setIsPublishing(true);

    try {
      // Step 1: Validate Publisher Questionnaire on Backend Server
      const verifyRes = await fetch('/api/publisher/validate-questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioName: cleanStudio,
          ageRating: qAgeRating,
          contentAdvisory: qContentAdvisory,
          dataPrivacyPolicy: qDataPrivacy,
          accessibilityFeatures: qAccessibility,
          monetizationModel: qMonetization,
          priceCents: computedPriceCents,
          payoutMethod: qPayoutMethod,
          supportContact: cleanSupport,
          testedOfflineAndSandbox: qTestedSandbox,
          acceptedPublisherTerms: qAcceptedTerms,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Publisher Questionnaire validation failed.');
      }

      const certId: string = verifyData.complianceCertificateId;
      setVerifiedCertId(certId);

      // Step 2: Write PublishedApp to Firestore `/apps/{newId}`
      const newAppId = sanitizeDocId('app');
      const appDocPath = `apps/${newAppId}`;
      const cleanStripeLink = (qStripePaymentLink.trim() || platformStripeLink.trim()).slice(0, 500);
      try {
        await setDoc(doc(db, 'apps', newAppId), {
          title: cleanTitle,
          tagline: cleanTagline,
          description: cleanDesc,
          category: pubCategory,
          playType: pubPlayType,
          externalUrl: cleanUrl,
          version: cleanVersion,
          authorId: user.uid,
          authorName: cleanStudio,
          isPublic: true,
          playsCount: 0,
          likesCount: 0,
          priceCents: computedPriceCents,
          monetizationModel: qMonetization,
          ageRating: qAgeRating,
          dataPrivacyPolicy: qDataPrivacy,
          accessibilityFeatures: qAccessibility,
          aiVisualSummary: cleanAiSummary,
          ...(cleanStripeLink ? { stripePaymentLink: cleanStripeLink } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, appDocPath);
      }

      // Step 3: Write PublisherQuestionnaire to Firestore `/publisherQuestionnaires/{questId}`
      const questId = sanitizeDocId('quest');
      const questDocPath = `publisherQuestionnaires/${questId}`;
      try {
        await setDoc(doc(db, 'publisherQuestionnaires', questId), {
          appId: newAppId,
          authorId: user.uid,
          studioName: cleanStudio,
          ageRating: qAgeRating,
          contentAdvisory: qContentAdvisory,
          dataPrivacyPolicy: qDataPrivacy,
          accessibilityFeatures: qAccessibility,
          monetizationModel: qMonetization,
          payoutMethod: qPayoutMethod,
          supportContact: cleanSupport,
          testedOfflineAndSandbox: qTestedSandbox,
          acceptedPublisherTerms: qAcceptedTerms,
          complianceCertificateId: certId,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, questDocPath);
      }

      setPubTitle('');
      setPubTagline('');
      setPubDescription('');
      setPubExternalUrl('');
      setPubAiSummary('');
      setPubStatusMessage({
        type: 'success',
        text: `Published "${cleanTitle}" with Compliance Certificate ${certId}! Launching in Stage...`,
      });
      setSelectedAppId(newAppId);
      setTimeout(() => {
        setActiveSection('stage');
        setPubStatusMessage(null);
      }, 900);
    } catch (err: unknown) {
      setPubStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to publish app.',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Submit a community review for a Firestore-published app
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedApp || selectedApp.isBuiltIn) return;
    const cleanComment = reviewComment.trim().slice(0, 600);
    if (cleanComment.length < 2) return;

    setSubmittingReview(true);
    const revId = sanitizeDocId('rev');
    const revPath = `apps/${selectedApp.id}/reviews/${revId}`;
    try {
      await setDoc(doc(db, 'apps', selectedApp.id, 'reviews', revId), {
        appId: selectedApp.id,
        authorId: user.uid,
        authorName: (user.displayName || user.email?.split('@')[0] || 'Player').slice(0, 80),
        rating: Math.max(1, Math.min(5, Math.round(reviewRating))),
        comment: cleanComment,
        createdAt: serverTimestamp(),
      });
      setReviewComment('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, revPath);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Handle user uploading a photo/screenshot for Gemini 4 Argon analysis
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedImageDataUrl(reader.result);
        setUploadedMimeType(file.type || 'image/png');
        setUploadedImageLabel(file.name);
        setVisionError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Call Server-Side /api/analyze-image powered by gemini-4-argon
  const handleAnalyzeWithGeminiArgon = async (mode: 'publish-autofill' | 'general' = 'general') => {
    if (!uploadedImageDataUrl) {
      setVisionError('Please upload a photo or select a sample capture first.');
      return;
    }

    setVisionLoading(true);
    setVisionError(null);

    try {
      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: uploadedImageDataUrl,
          mimeType: uploadedMimeType,
          prompt: visionPrompt,
          mode,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gemini 4 Argon analysis request failed.');
      }

      const result: GeminiImageAnalysisResult = data.result;
      setVisionResult(result);

      if (mode === 'publish-autofill') {
        setPubTitle(result.suggestedTitle.slice(0, 80));
        setPubTagline(result.suggestedTagline.slice(0, 140));
        setPubDescription(`${result.visualSummary}\n\n${result.technicalDiagnosis}`.slice(0, 1500));
        const validCategories: AppCategory[] = ['Game', 'Creative App', 'Developer Tool', 'Utility', 'Simulation'];
        if (validCategories.includes(result.suggestedCategory as AppCategory)) {
          setPubCategory(result.suggestedCategory as AppCategory);
        }
        setPubAiSummary(result.visualSummary.slice(0, 1000));
      }
    } catch (err: unknown) {
      setVisionError(err instanceof Error ? err.message : 'Unable to analyze image.');
    } finally {
      setVisionLoading(false);
    }
  };

  const applyVisionResultToPublishForm = () => {
    if (!visionResult) return;
    setPubTitle(visionResult.suggestedTitle.slice(0, 80));
    setPubTagline(visionResult.suggestedTagline.slice(0, 140));
    setPubDescription(`${visionResult.visualSummary}\n\n${visionResult.technicalDiagnosis}`.slice(0, 1500));
    const validCategories: AppCategory[] = ['Game', 'Creative App', 'Developer Tool', 'Utility', 'Simulation'];
    if (validCategories.includes(visionResult.suggestedCategory as AppCategory)) {
      setPubCategory(visionResult.suggestedCategory as AppCategory);
    }
    setPubAiSummary(visionResult.visualSummary.slice(0, 1000));
    setActiveSection('publish');
  };

  const downloadVisionPatch = () => {
    if (!visionResult?.generatedPatch) return;
    const blob = new Blob([visionResult.generatedPatch], { type: 'text/x-patch;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gemini-4-argon-analysis.patch';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPlays = allApps.reduce((acc, item) => acc + item.playsCount, 0);
  const totalLikes = allApps.reduce((acc, item) => acc + item.likesCount, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-[#F8FAFC]">
      {/* =====================================================================
          STRICT 3-ZONE TOP BAR CONTRACT
          [Brand Wordmark] — [5 Single-Line Nav Links] — [1 Primary Action CTA]
         ===================================================================== */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-[#0B0F17]/95 backdrop-blur border-b border-slate-800/90">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#discover"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('discover');
          }}
          className="text-lg font-bold tracking-tight font-display text-white whitespace-nowrap shrink-0"
        >
          App and Game Playground
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <a
            href="#discover"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('discover');
            }}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'discover' ? 'text-white underline decoration-indigo-500 decoration-2' : ''
            }`}
          >
            Play Store
          </a>
          <a
            href="#stage"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('stage');
            }}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'stage' ? 'text-white underline decoration-indigo-500 decoration-2' : ''
            }`}
          >
            Arcade Stage
          </a>
          <a
            href="#vision"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('vision');
            }}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'vision' ? 'text-white underline decoration-indigo-500 decoration-2' : ''
            }`}
          >
            Vision Lab
          </a>
          <a
            href="#publish"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('publish');
            }}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'publish' ? 'text-white underline decoration-indigo-500 decoration-2' : ''
            }`}
          >
            Publisher Studio
          </a>
          <a
            href="#payments"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('payments');
              fetchBackendLedger();
            }}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'payments' ? 'text-white underline decoration-indigo-500 decoration-2' : ''
            }`}
          >
            Payments &amp; Ledger
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActiveSection('publish')}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Publish to Play Store
          </button>
        </div>
      </header>

      {/* =====================================================================
          MAIN VIEWPORT CONTAINER (1440px Baseline)
         ===================================================================== */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 lg:px-10 py-8 space-y-12">
        {/* Account & Workspace Context Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
            <span>PLAY STORE RELEASES: {allApps.length}</span>
            <span aria-hidden="true">·</span>
            <span>COMMUNITY PUBLISHED: {communityApps.length}</span>
            <span aria-hidden="true">·</span>
            <span>LAUNCHES: {totalPlays.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span>REVENUE SPLIT: 85% CREATOR / 15% PLATFORM</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile Section Switcher */}
            <div className="flex md:hidden items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              {(['discover', 'stage', 'vision', 'publish', 'payments'] as ActiveSection[]).map((sec) => (
                <button
                  key={sec}
                  onClick={() => setActiveSection(sec)}
                  className={`px-2.5 py-1 text-xs font-medium rounded capitalize whitespace-nowrap shrink-0 ${
                    activeSection === sec ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                >
                  {sec === 'discover' ? 'Play Store' : sec}
                </button>
              ))}
            </div>

            {user ? (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-300 truncate max-w-[180px]">
                  Signed in as <strong className="text-white">{user.displayName || user.email}</strong>
                </span>
                <button
                  onClick={logOutUser}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-700 rounded-lg hover:text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:border-slate-500 hover:text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                Creator Sign In
              </button>
            )}
          </div>
        </div>

        {/* ===================================================================
            VIEW 1: PLAY STORE FRONTEND & APP MARKETPLACE
           =================================================================== */}
        {activeSection === 'discover' && (
          <div className="space-y-12">
            {/* Split-Column Play Store Hero */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-[#111827] border border-slate-800 rounded-2xl p-6 lg:p-10">
              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-mono text-indigo-400">
                    <span>PLAYGROUND PLAY STORE</span>
                    <span aria-hidden="true">·</span>
                    <span>INSTANT BROWSER INSTALL &amp; 85% CREATOR PAYOUTS</span>
                  </div>
                  <h1
                    className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold font-display text-white tracking-tight leading-[1.15]"
                    style={{ textWrap: 'balance' }}
                  >
                    The Play Store for web apps, indie games, and developer tools.
                  </h1>
                  <p className="text-base text-slate-300 leading-relaxed max-w-2xl">
                    Every app submitted through the Publisher Studio appears live in this Play Store catalog in real
                    time. Launch free builds immediately in your browser, or purchase a{' '}
                    <strong className="text-white font-semibold">Creator Supporter Pass</strong> /{' '}
                    <strong className="text-white font-semibold">Commercial App License</strong> to unlock Pro weapons,
                    synth presets, puzzle auto-reveal tools, and send 85% directly to the creator.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => handleLaunchApp(BUILT_IN_APPS[0])}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    Install &amp; Play: Starlight Tactics
                  </button>
                  <button
                    onClick={() => setActiveSection('publish')}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ClipboardCheck className="w-4 h-4 text-emerald-400" />
                    Publish Your App to Play Store
                  </button>
                  <button
                    onClick={() => handleOpenCheckout(BUILT_IN_APPS[0], true)}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-200 border border-amber-700/60 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4 text-amber-400" />
                    Preview Supporter Pass Perks
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 flex flex-col justify-between bg-[#0B0F17] border border-slate-800 rounded-xl overflow-hidden">
                <ArtworkCover
                  playType="starlight-tactics"
                  category="Game"
                  title="Starlight Tactics: Sector Zero"
                  className="h-56 lg:h-full w-full"
                />
                <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400 truncate font-mono tabular-nums">
                      #1 Top Game · 4.9 ★ · Everyone 10+
                    </div>
                    <div className="text-sm font-semibold text-white truncate">
                      Starlight Tactics: Sector Zero
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleOpenCheckout(BUILT_IN_APPS[0], true)}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-700/60 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Supporter Pass
                    </button>
                    <button
                      onClick={() => handleLaunchApp(BUILT_IN_APPS[0])}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Play Free
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Clear Breakdown of What a Supporter Pass / App License Unlocks */}
            <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-xs font-mono text-amber-400">
                    SUPPORTER PASS &amp; COMMERCIAL LICENSE VALUE GUIDE
                  </div>
                  <h2 className="text-lg font-bold font-display text-white mt-0.5">
                    What Buyers Actually Receive When Purchasing a Supporter Pass or App License
                  </h2>
                </div>
                <span className="text-xs font-mono text-emerald-400 tabular-nums">
                  85% DIRECT TO CREATOR · INSTANT IN-APP UNLOCK
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-1.5">
                  <div className="font-mono text-amber-300 font-semibold">1. TACTICAL GAMES PASS</div>
                  <div className="text-white font-semibold">Commander Overdrive + Heavy Ion Cannon</div>
                  <p className="text-slate-400 leading-relaxed">
                    Boosts turn Action Points from 3 AP to <strong className="text-slate-200">4 AP per turn</strong> and
                    unlocks the <strong className="text-slate-200">Heavy Ion Cannon (50 DMG)</strong> button inside the
                    game HUD.
                  </p>
                </div>

                <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-1.5">
                  <div className="font-mono text-indigo-300 font-semibold">2. AUDIO SYNTH LICENSE ($4.99)</div>
                  <div className="text-white font-semibold">Cyber-Arpeggio Preset + JSON Loop Export</div>
                  <p className="text-slate-400 leading-relaxed">
                    Unlocks the 1-click <strong className="text-slate-200">Load Pro Preset</strong> harmonic sequencer
                    pattern and <strong className="text-slate-200">Export Loop JSON</strong> studio file download.
                  </p>
                </div>

                <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-1.5">
                  <div className="font-mono text-emerald-300 font-semibold">3. WORD PUZZLE PASS</div>
                  <div className="text-white font-semibold">1-Click Auto-Reveal Word + Gold Tiles</div>
                  <p className="text-slate-400 leading-relaxed">
                    Unlocks unlimited <strong className="text-slate-200">Auto-Reveal Target Word</strong> solver
                    assists and golden supporter tile styling in Botanica Word.
                  </p>
                </div>

                <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-1.5">
                  <div className="font-mono text-cyan-300 font-semibold">4. VERIFIED RECEIPT &amp; PAYOUT</div>
                  <div className="text-white font-semibold">Permanent Unlock + 85% Creator Share</div>
                  <p className="text-slate-400 leading-relaxed">
                    Issues an itemized <code className="font-mono text-slate-200">RCPT-*</code> receipt stored in
                    Firestore, permanently unlocks the app on your account, and routes 85% to the publisher.
                  </p>
                </div>
              </div>
            </section>

            {/* Search & Segmented Category Filter Controls */}
            <section className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold font-display text-white">
                    01. Play Store App &amp; Game Directory
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Browse official flagship releases and live community apps published via the Publisher Studio. Click
                    any app to launch it immediately in the browser or unlock its Supporter Pass perks.
                  </p>
                </div>

                {/* Search Input */}
                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Play Store apps, games, studios..."
                    className="w-full pl-9 pr-4 py-2 bg-[#111827] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Functional Segmented Filter Bar */}
              <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg overflow-x-auto">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat === 'All'
                      ? `All Play Store Apps (${allApps.length})`
                      : cat === 'My Published'
                        ? `My Published (${communityApps.filter((a) => user && a.authorId === user.uid).length})`
                        : cat}
                  </button>
                ))}
              </div>

              {/* Live Community Published Banner (shows how Publisher Studio feeds the Play Store) */}
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-mono text-emerald-400">
                    LIVE FIRESTORE PLAY STORE FEED · {communityApps.length} COMMUNITY RELEASES ACTIVE
                  </div>
                  <p className="text-xs text-slate-300">
                    {communityApps.length > 0
                      ? 'Community-published apps are live in the Play Store grid below alongside official flagship titles.'
                      : 'Want to see a new app publish live to this Play Store? Submit an app in the Publisher Studio and it appears here immediately.'}
                  </p>
                </div>
                <button
                  onClick={() => setActiveSection('publish')}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add App to Play Store
                </button>
              </div>

              {/* 3-Column Play Store Catalog Grid */}
              {loadingApps ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="h-80 bg-[#111827] border border-slate-800 rounded-xl animate-pulse p-5 flex flex-col justify-end"
                    >
                      <div className="h-4 bg-slate-800 rounded w-1/2 mb-2" />
                      <div className="h-3 bg-slate-800 rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ) : filteredApps.length === 0 ? (
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center space-y-4">
                  <Gamepad2 className="w-8 h-8 text-slate-500 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-white">No matching apps or games found</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      {selectedCategory === 'My Published' && !user
                        ? 'Sign in with Google to view and manage the apps and games you have published to the Play Store.'
                        : 'Try clearing your search filter or publish the first release in this category.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveSection('publish')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Publish First Release
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredApps.map((appItem) => {
                    const isUnlocked = unlockedAppIds.includes(appItem.id) || (user && appItem.authorId === user.uid);
                    const perkInfo = getSupporterPerksForApp(appItem.playType, appItem.priceCents);
                    return (
                      <article
                        key={appItem.id}
                        className="group bg-[#111827] border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5"
                      >
                        <div>
                          {/* Card Artwork */}
                          <div
                            onClick={() => handleLaunchApp(appItem)}
                            className="cursor-pointer border-b border-slate-800/80"
                          >
                            <ArtworkCover
                              playType={appItem.playType}
                              category={appItem.category}
                              title={appItem.title}
                              className="h-48 w-full"
                            />
                          </div>

                          {/* Card Content — Zero-Pill Unboxed Metadata */}
                          <div className="p-5 space-y-2.5">
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-400 font-mono tabular-nums">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="text-amber-400">4.9 ★</span>
                                <span aria-hidden="true">·</span>
                                <span>{appItem.category}</span>
                                <span aria-hidden="true">·</span>
                                <span>{appItem.ageRating}</span>
                                <span aria-hidden="true">·</span>
                                <span>{appItem.playsCount.toLocaleString()} installs</span>
                              </div>
                              <span className="text-white font-semibold shrink-0">
                                {isUnlocked
                                  ? 'PASS ACTIVE'
                                  : formatPriceCents(appItem.priceCents)}
                              </span>
                            </div>

                            <h3 className="text-base font-bold font-display text-white group-hover:text-indigo-300 transition-colors">
                              <button
                                onClick={() => handleLaunchApp(appItem)}
                                className="text-left focus:outline-none cursor-pointer"
                              >
                                {appItem.title}
                              </button>
                            </h3>

                            <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                              {appItem.tagline}
                            </p>

                            {/* Explicit Supporter Pass / License Unlock Line */}
                            <div className="pt-1 text-[11px] font-mono text-amber-300/90 truncate">
                              {isUnlocked ? '✓ Unlocked: ' : 'Pass Perk: '}
                              {perkInfo.perks[0]}
                            </div>

                            <div className="text-[11px] text-slate-400 font-mono truncate">
                              {appItem.isBuiltIn ? 'Official Flagship' : 'Community Published'} · {appItem.dataPrivacyPolicy}
                            </div>
                          </div>
                        </div>

                        <div className="px-5 pb-5 pt-3 border-t border-slate-800/60 flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-400 truncate">
                            {appItem.authorName}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {!appItem.isBuiltIn && (
                              <button
                                onClick={() => handleLikeApp(appItem)}
                                title="Upvote release"
                                className="px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-300 bg-slate-900 border border-slate-700 rounded-md hover:text-rose-300 hover:border-rose-700 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Heart className="w-3.5 h-3.5 text-rose-400" />
                                {appItem.likesCount}
                              </button>
                            )}
                            {user && !appItem.isBuiltIn && appItem.authorId === user.uid && (
                              <button
                                onClick={() => handleDeleteApp(appItem)}
                                title="Delete your published app"
                                className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-900 border border-slate-700 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenCheckout(appItem)}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-800/70 text-xs font-mono font-medium rounded-md transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <CreditCard className="w-3 h-3" />
                              {appItem.priceCents > 0 && !isUnlocked
                                ? `Buy ${formatPriceCents(appItem.priceCents)}`
                                : isUnlocked
                                  ? 'Pass Active'
                                  : 'Supporter Pass'}
                            </button>
                            <button
                              onClick={() => handleLaunchApp(appItem)}
                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                              Install &amp; Play
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ===================================================================
            VIEW 2: INTERACTIVE ARCADE & APP RUNTIME STAGE
           =================================================================== */}
        {activeSection === 'stage' && (
          <div className="space-y-8">
            {/* Stage Selector Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#111827] border border-slate-800 rounded-xl p-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                  <span>ACTIVE STAGE</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedApp.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>v{selectedApp.version}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedApp.ageRating}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400">{formatPriceCents(selectedApp.priceCents)}</span>
                </div>
                <h2 className="text-xl font-bold font-display text-white">{selectedApp.title}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleOpenCheckout(selectedApp)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-emerald-200 bg-emerald-950/80 border border-emerald-700/70 rounded-lg hover:bg-emerald-900 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  {selectedApp.priceCents > 0
                    ? `Purchase License (${formatPriceCents(selectedApp.priceCents)})`
                    : 'Buy Supporter Pass'}
                </button>
                {allApps.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedAppId(item.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedApp.id === item.id
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
                    }`}
                  >
                    {item.title.split(':')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Playable Experience Canvas */}
            <PlayableStage
              app={selectedApp}
              hasSupporterPass={
                unlockedAppIds.includes(selectedApp.id) || Boolean(user && selectedApp.authorId === user.uid)
              }
              onUnlockClick={() => handleOpenCheckout(selectedApp)}
              onOpenVisionTab={() => setActiveSection('vision')}
            />

            {/* Release Notes, Publisher Questionnaire Disclosure & Community Reviews */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
                <h3 className="text-base font-bold font-display text-white">
                  Release Documentation &amp; Publisher Disclosures
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                  {selectedApp.description}
                </p>

                <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Age &amp; Content Rating</span>
                    <span className="text-white font-medium">{selectedApp.ageRating}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Monetization Model</span>
                    <span className="text-white font-medium">
                      {selectedApp.monetizationModel} ({formatPriceCents(selectedApp.priceCents)})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Data Privacy Declaration</span>
                    <span className="text-white font-medium">{selectedApp.dataPrivacyPolicy}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Accessibility Support</span>
                    <span className="text-white font-medium">{selectedApp.accessibilityFeatures}</span>
                  </div>
                </div>

                {selectedApp.aiVisualSummary && (
                  <div className="pt-3 border-t border-slate-800 space-y-1.5">
                    <div className="text-xs font-mono text-indigo-400">
                      GEMINI 4 ARGON VISUAL &amp; ARCHITECTURE SUMMARY
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {selectedApp.aiVisualSummary}
                    </p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold font-display text-white">
                    Player &amp; Creator Reviews
                  </h3>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {selectedApp.isBuiltIn ? 'OFFICIAL CORE BUILD' : `${reviews.length} REVIEWS`}
                  </span>
                </div>

                {selectedApp.isBuiltIn ? (
                  <div className="text-xs text-slate-400 space-y-3">
                    <p>
                      This is a verified built-in flagship experience included with App and Game Playground. Publish a
                      community app in the Publisher Studio to collect live Firestore ratings, reviews, and payments!
                    </p>
                    <button
                      onClick={() => setActiveSection('publish')}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Complete Questionnaire &amp; Publish
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {user ? (
                      <form onSubmit={handleReviewSubmit} className="space-y-3 pb-4 border-b border-slate-800">
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-slate-300">Rating:</label>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewRating(star)}
                                className="p-1 text-amber-400 cursor-pointer"
                              >
                                <Star
                                  className={`w-4 h-4 ${
                                    star <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea
                          rows={2}
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Share feedback on gameplay, controls, or features (2-600 chars)..."
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="submit"
                          disabled={submittingReview || reviewComment.trim().length < 2}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {submittingReview ? 'Posting Review...' : 'Post Review'}
                        </button>
                      </form>
                    ) : (
                      <div className="text-xs text-slate-400 pb-3 border-b border-slate-800 flex items-center justify-between">
                        <span>Sign in with Google to rate and review this release.</span>
                        <button
                          onClick={signInWithGoogle}
                          className="text-indigo-400 hover:underline font-medium cursor-pointer"
                        >
                          Sign In
                        </button>
                      </div>
                    )}

                    {reviews.length === 0 ? (
                      <p className="text-xs text-slate-500">No community reviews yet. Be the first to review!</p>
                    ) : (
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                        {reviews.map((rev) => (
                          <div key={rev.id} className="pb-3 border-b border-slate-800/70 last:border-none space-y-1">
                            <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
                              <span className="text-white font-sans font-medium">{rev.authorName}</span>
                              <span>
                                {'★'.repeat(rev.rating)} · {rev.createdAtLabel}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">{rev.comment}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 3: GEMINI 4 ARGON VISION ANALYZER & PATCH GENERATOR
           =================================================================== */}
        {activeSection === 'vision' && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-indigo-400">
                  MULTIMODAL IMAGE UNDERSTANDING · MODEL: GEMINI-4-ARGON
                </div>
                <h2 className="text-2xl font-bold font-display text-white mt-1">
                  02. Visual App &amp; Screenshot Analyzer
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Upload any photo, game screenshot, UI mockup, or terminal traceback to run deep visual analysis with{' '}
                  <code className="text-indigo-300 font-mono">gemini-4-argon</code>, generate a code patch, or autofill
                  your app publishing listing.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    const sample = createSampleDiagnosticImage('game-ui');
                    setUploadedImageDataUrl(sample.dataUrl);
                    setUploadedMimeType(sample.mimeType);
                    setUploadedImageLabel(sample.label);
                    setVisionPrompt(sample.defaultPrompt);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-[#111827] border border-slate-800 rounded-lg hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Load Game HUD Sample
                </button>
                <button
                  onClick={() => {
                    const sample = createSampleDiagnosticImage('python-traceback');
                    setUploadedImageDataUrl(sample.dataUrl);
                    setUploadedMimeType(sample.mimeType);
                    setUploadedImageLabel(sample.label);
                    setVisionPrompt(sample.defaultPrompt);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-[#111827] border border-slate-800 rounded-lg hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Load Issue #3060 Traceback
                </button>
                <button
                  onClick={() => {
                    const sample = createSampleDiagnosticImage('synth-app');
                    setUploadedImageDataUrl(sample.dataUrl);
                    setUploadedMimeType(sample.mimeType);
                    setUploadedImageLabel(sample.label);
                    setVisionPrompt(sample.defaultPrompt);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-[#111827] border border-slate-800 rounded-lg hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Load OrbitHop Concept
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Image Upload & Prompt Configuration */}
              <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    SOURCE IMAGE ({uploadedImageLabel || 'Ready'})
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-semibold text-indigo-300 bg-indigo-950/70 border border-indigo-700/60 rounded-lg hover:bg-indigo-900 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Photo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {/* Image Preview Frame */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative rounded-lg overflow-hidden border border-slate-800 bg-[#0B0F17] cursor-pointer group"
                >
                  {uploadedImageDataUrl ? (
                    <img
                      src={uploadedImageDataUrl}
                      alt={uploadedImageLabel || 'Uploaded preview for Gemini 4 Argon analysis'}
                      referrerPolicy="no-referrer"
                      className="w-full h-56 object-contain bg-[#090D16]"
                    />
                  ) : (
                    <div className="h-56 flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
                      <Upload className="w-6 h-6 text-slate-400" />
                      <span>Click to upload a photo or screenshot</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300">
                    Analysis Instructions for <code className="font-mono text-indigo-300">gemini-4-argon</code>
                  </label>
                  <textarea
                    rows={3}
                    value={visionPrompt}
                    onChange={(e) => setVisionPrompt(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {visionError && (
                  <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-200 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{visionError}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleAnalyzeWithGeminiArgon('general')}
                  disabled={visionLoading}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  {visionLoading ? 'Analyzing Image with Gemini 4 Argon...' : 'Analyze Photo with Gemini 4 Argon'}
                </button>
              </div>

              {/* Right Column: Structured Output & Patch Export */}
              <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
                {visionLoading ? (
                  <div className="space-y-4 py-8">
                    <div className="h-5 bg-slate-800 rounded w-1/3 animate-pulse" />
                    <div className="h-4 bg-slate-800 rounded w-2/3 animate-pulse" />
                    <div className="h-24 bg-slate-800 rounded w-full animate-pulse" />
                    <div className="h-36 bg-slate-800 rounded w-full animate-pulse" />
                  </div>
                ) : visionResult ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800">
                      <div className="space-y-1">
                        <div className="text-xs font-mono text-emerald-400">
                          GEMINI-4-ARGON ANALYSIS COMPLETE · {visionResult.suggestedCategory.toUpperCase()}
                        </div>
                        <h3 className="text-lg font-bold font-display text-white">
                          {visionResult.suggestedTitle}
                        </h3>
                        <p className="text-xs text-slate-300">{visionResult.suggestedTagline}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={applyVisionResultToPublishForm}
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Use in Publisher Studio
                        </button>
                        <button
                          onClick={downloadVisionPatch}
                          className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download .patch
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 space-y-1.5">
                        <div className="text-xs font-mono text-slate-400">VISUAL &amp; UX BREAKDOWN</div>
                        <p className="text-xs text-slate-200 leading-relaxed">{visionResult.visualSummary}</p>
                      </div>
                      <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 space-y-1.5">
                        <div className="text-xs font-mono text-slate-400">TECHNICAL DIAGNOSIS</div>
                        <p className="text-xs text-slate-200 leading-relaxed">{visionResult.technicalDiagnosis}</p>
                      </div>
                    </div>

                    {visionResult.extractedText && (
                      <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 space-y-1">
                        <div className="text-xs font-mono text-slate-400">DETECTED TEXT &amp; TELEMETRY</div>
                        <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                          {visionResult.extractedText}
                        </pre>
                      </div>
                    )}

                    <div className="bg-[#090D16] border border-slate-800 rounded-lg overflow-hidden">
                      <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                        <span>GENERATED PATCH / ENHANCEMENT DIFF</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(visionResult.generatedPatch);
                            setCopiedGeneratedPatch(true);
                            setTimeout(() => setCopiedGeneratedPatch(false), 2000);
                          }}
                          className="text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          {copiedGeneratedPatch ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedGeneratedPatch ? 'Copied' : 'Copy Diff'}
                        </button>
                      </div>
                      <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-56 whitespace-pre-wrap">
                        {visionResult.generatedPatch}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="py-14 text-center space-y-3">
                    <FileCode2 className="w-8 h-8 text-slate-500 mx-auto" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-white">
                        Ready for Gemini 4 Argon Visual Inspection
                      </h3>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Click &ldquo;Analyze Photo with Gemini 4 Argon&rdquo; on the left to extract metadata, UX
                        diagnostics, and a downloadable <code className="font-mono">.patch</code> file from your
                        uploaded photo.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 4: PUBLISHER STUDIO & QUESTIONNAIRE
           =================================================================== */}
        {activeSection === 'publish' && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-indigo-400">
                  PUBLISHER ONBOARDING QUESTIONNAIRE · BACKEND COMPLIANCE &amp; FIRESTORE
                </div>
                <h2 className="text-2xl font-bold font-display text-white mt-1">
                  03. Publisher Questionnaire &amp; App Submission Studio
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  All creators adding apps or games complete the Publisher Questionnaire below to verify age ratings,
                  privacy disclosures, accessibility, and 85/15 payment payout routing.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Main Publishing + Questionnaire Form */}
              <form
                onSubmit={handlePublishSubmit}
                className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6"
              >
                {pubStatusMessage && (
                  <div
                    className={`p-3.5 rounded-lg border text-xs font-medium ${
                      pubStatusMessage.type === 'success'
                        ? 'bg-emerald-950/60 border-emerald-700 text-emerald-200'
                        : 'bg-rose-950/60 border-rose-800 text-rose-200'
                    }`}
                  >
                    {pubStatusMessage.text}
                  </div>
                )}

                {/* Part A: Core Release Metadata */}
                <div className="space-y-4">
                  <div className="text-xs font-mono text-indigo-400 border-b border-slate-800 pb-2">
                    SECTION A · APP OR GAME RELEASE DETAILS
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        App or Game Title (2–80 chars) *
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={80}
                        value={pubTitle}
                        onChange={(e) => setPubTitle(e.target.value)}
                        placeholder="e.g., Nebula Command: Tactical Grid"
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Version (e.g., 1.0.0) *
                      </label>
                      <input
                        type="text"
                        required
                        minLength={1}
                        maxLength={24}
                        value={pubVersion}
                        onChange={(e) => setPubVersion(e.target.value)}
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Single-Line Tagline (4–140 chars) *
                    </label>
                    <input
                      type="text"
                      required
                      minLength={4}
                      maxLength={140}
                      value={pubTagline}
                      onChange={(e) => setPubTagline(e.target.value)}
                      placeholder="Short hook shown on storefront cards..."
                      className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">Category *</label>
                      <select
                        value={pubCategory}
                        onChange={(e) => setPubCategory(e.target.value as AppCategory)}
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Game">Game</option>
                        <option value="Creative App">Creative App</option>
                        <option value="Developer Tool">Developer Tool</option>
                        <option value="Utility">Utility</option>
                        <option value="Simulation">Simulation</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Interactive Runtime Engine *
                      </label>
                      <select
                        value={pubPlayType}
                        onChange={(e) => setPubPlayType(e.target.value as PlayableEngineType)}
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="starlight-tactics">2D Tactical Space Grid Engine</option>
                        <option value="pulsepad-synth">16-Step Web Audio Synth Sequencer</option>
                        <option value="botanica-word">Accessible Word &amp; Tile Puzzle Engine</option>
                        <option value="patchforge-vision">Code Diff &amp; Vision Inspector</option>
                        <option value="custom-embed">Custom Web App / External Build URL</option>
                      </select>
                    </div>
                  </div>

                  {pubPlayType === 'custom-embed' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        External Web App URL (optional, max 500 chars)
                      </label>
                      <input
                        type="url"
                        maxLength={500}
                        value={pubExternalUrl}
                        onChange={(e) => setPubExternalUrl(e.target.value)}
                        placeholder="https://your-app-url.example.com"
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Full Description, Controls &amp; Release Notes (10–1500 chars) *
                    </label>
                    <textarea
                      rows={3}
                      required
                      minLength={10}
                      maxLength={1500}
                      value={pubDescription}
                      onChange={(e) => setPubDescription(e.target.value)}
                      placeholder="Explain how people play or use your app, key controls, and what makes it special..."
                      className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Part B: Mandatory Publisher Questionnaire */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-mono text-emerald-400">
                      SECTION B · MANDATORY PUBLISHER QUESTIONNAIRE
                    </span>
                    {verifiedCertId && (
                      <span className="text-xs font-mono text-emerald-300">
                        VERIFIED: {verifiedCertId}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        1. Studio or Publisher Name *
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={80}
                        value={qStudioName}
                        onChange={(e) => setQStudioName(e.target.value)}
                        placeholder="e.g., Horizon Indie Works"
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        2. Player Support Contact (Email or URL) *
                      </label>
                      <input
                        type="text"
                        required
                        minLength={3}
                        maxLength={120}
                        value={qSupportContact}
                        onChange={(e) => setQSupportContact(e.target.value)}
                        placeholder="support@yourstudio.com"
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        3. Target Age Rating *
                      </label>
                      <select
                        value={qAgeRating}
                        onChange={(e) => setQAgeRating(e.target.value as AgeRating)}
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Everyone (E)">Everyone (E)</option>
                        <option value="Everyone 10+ (E10+)">Everyone 10+ (E10+)</option>
                        <option value="Teen (T)">Teen (T)</option>
                        <option value="Mature 17+ (M)">Mature 17+ (M)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        4. Action / Combat Content Advisory *
                      </label>
                      <select
                        value={qContentAdvisory}
                        onChange={(e) => setQContentAdvisory(e.target.value as ContentAdvisory)}
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="None">None</option>
                        <option value="Mild Cartoon / Tactical">Mild Cartoon / Tactical</option>
                        <option value="Moderate">Moderate</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        5. Data Privacy &amp; Telemetry Declaration *
                      </label>
                      <select
                        value={qDataPrivacy}
                        onChange={(e) => setQDataPrivacy(e.target.value as DataPrivacyPolicy)}
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Zero Data Collected">Zero Data Collected</option>
                        <option value="Anonymous Gameplay Telemetry Only">Anonymous Gameplay Telemetry Only</option>
                        <option value="Authenticated Account Sync">Authenticated Account Sync</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        6. Accessibility &amp; Input Features *
                      </label>
                      <select
                        value={qAccessibility}
                        onChange={(e) => setQAccessibility(e.target.value as AccessibilityFeatureSet)}
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Keyboard + Mouse + High-Contrast">Keyboard + Mouse + High-Contrast</option>
                        <option value="Touch + Screen Reader Friendly">Touch + Screen Reader Friendly</option>
                        <option value="Full Controller + Audio Cues">Full Controller + Audio Cues</option>
                      </select>
                    </div>
                  </div>

                  {/* Monetization & Payout Configuration */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        7. Monetization Model *
                      </label>
                      <select
                        value={qMonetization}
                        onChange={(e) => {
                          const next = e.target.value as MonetizationModel;
                          setQMonetization(next);
                          if (next === 'Free to Play') {
                            setQPriceDollars('0.00');
                          } else if (parseFloat(qPriceDollars || '0') <= 0) {
                            setQPriceDollars('4.99');
                          }
                        }}
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Free to Play">Free to Play</option>
                        <option value="One-Time Purchase">One-Time Purchase</option>
                        <option value="Creator Supporter Pass">Creator Supporter Pass</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        8. License Price (USD $) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={qMonetization === 'One-Time Purchase' ? '1.00' : '0.00'}
                        max="999.99"
                        disabled={qMonetization === 'Free to Play'}
                        value={qPriceDollars}
                        onChange={(e) => setQPriceDollars(e.target.value)}
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono tabular-nums text-white disabled:opacity-50 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        9. Creator Payout Rail *
                      </label>
                      <select
                        value={qPayoutMethod}
                        onChange={(e) => setQPayoutMethod(e.target.value as PayoutMethod)}
                        className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Stripe Connect Express (85% Creator / 15% Platform)">
                          Stripe Connect Express (85% / 15%)
                        </option>
                        <option value="Instant Card Payout">Instant Card Payout</option>
                        <option value="Open-Source Community Grant">Open-Source Community Grant</option>
                      </select>
                    </div>
                  </div>

                  {/* Direct Stripe Payment Link Field */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Stripe Payment Link URL (Optional — e.g. <code className="font-mono text-indigo-300">https://buy.stripe.com/...</code>)
                    </label>
                    <input
                      type="url"
                      maxLength={500}
                      value={qStripePaymentLink}
                      onChange={(e) => setQStripePaymentLink(e.target.value)}
                      placeholder="https://buy.stripe.com/your_payment_link"
                      className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 space-y-2.5">
                    <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={qTestedSandbox}
                        onChange={(e) => setQTestedSandbox(e.target.checked)}
                        className="mt-0.5 accent-indigo-500"
                      />
                      <span>
                        10. I confirm this application or game has been tested in the browser sandbox with working
                        controls and zero broken assets.
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={qAcceptedTerms}
                        onChange={(e) => setQAcceptedTerms(e.target.checked)}
                        className="mt-0.5 accent-indigo-500"
                      />
                      <span>
                        11. I accept the App and Game Playground Publisher Distribution Agreement and 85% Creator / 15%
                        Platform payment split terms.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleVerifyQuestionnaireOnly}
                    disabled={verifyingQuestionnaire}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-700/60 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {verifyingQuestionnaire ? 'Validating...' : 'Pre-Check Questionnaire on Backend'}
                  </button>

                  <button
                    type="submit"
                    disabled={isPublishing}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Layers className="w-4 h-4" />
                    {isPublishing ? 'Validating & Publishing...' : 'Verify Questionnaire & Publish App'}
                  </button>
                </div>
              </form>

              {/* Right Column: Gemini 4 Argon Screenshot Autofill + Live Storefront Preview */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-mono text-indigo-400">
                      GEMINI 4 ARGON SCREENSHOT AUTOFILL
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-indigo-300 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Screenshot
                    </button>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Upload a photo or screenshot of your app or game and let{' '}
                    <code className="font-mono text-indigo-300">gemini-4-argon</code> automatically write your title,
                    tagline, category, and release description.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAnalyzeWithGeminiArgon('publish-autofill')}
                    disabled={visionLoading}
                    className="w-full py-2 px-4 bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/70 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {visionLoading
                      ? 'Analyzing Screenshot with Gemini 4 Argon...'
                      : 'Auto-Generate Listing from Screenshot'}
                  </button>
                </div>

                {/* Live Storefront Card Preview */}
                <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-800 text-xs font-mono text-slate-400 flex items-center justify-between">
                    <span>LIVE STOREFRONT CARD PREVIEW</span>
                    <span>
                      {qMonetization === 'Free to Play'
                        ? 'Free'
                        : `$${(parseFloat(qPriceDollars || '0') || 0).toFixed(2)}`}
                    </span>
                  </div>
                  <ArtworkCover
                    playType={pubPlayType}
                    category={pubCategory}
                    title={pubTitle || 'Your App Title'}
                    className="h-44 w-full"
                  />
                  <div className="p-5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
                      <span>
                        {pubCategory} · {qAgeRating}
                      </span>
                      <span className="text-white font-semibold">
                        {qMonetization === 'Free to Play'
                          ? 'Free'
                          : `$${(parseFloat(qPriceDollars || '0') || 0).toFixed(2)}`}
                      </span>
                    </div>
                    <div className="text-base font-bold font-display text-white">
                      {pubTitle || 'Your App or Game Title'}
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2">
                      {pubTagline || 'Your single-line tagline will appear here on the catalog grid.'}
                    </p>
                    <div className="text-[11px] font-mono text-slate-400 pt-1">
                      {qDataPrivacy} · {qAccessibility}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 5: PAYMENTS, CREATOR PAYOUTS & QUESTIONNAIRE COMPLIANCE LEDGER
           =================================================================== */}
        {activeSection === 'payments' && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-indigo-400">
                  BACKEND PAYMENT ENGINE &amp; FIRESTORE TRANSACTION LEDGER
                </div>
                <h2 className="text-2xl font-bold font-display text-white mt-1">
                  04. Payments, Creator Payouts &amp; Compliance Certificates
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Inspect real-time payment processing telemetry from the Express payment gateway, view your personal
                  purchase receipts, and track completed Publisher Questionnaires.
                </p>
              </div>

              <button
                onClick={() => handleOpenCheckout(BUILT_IN_APPS[1])}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                Run Test Payment ($4.99)
              </button>
            </div>

            {/* Live Stripe Payment Link & Web Deployment Bar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <form
                onSubmit={handleSaveStripePaymentLink}
                className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-mono text-indigo-400">
                    STRIPE PAYMENT LINK INTEGRATION · DIRECT CHECKOUT ROUTING
                  </div>
                  <span className="text-xs font-mono text-emerald-400">
                    {platformStripeLink ? 'LINK ACTIVE' : 'READY TO LINK'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Paste your Stripe Payment Link (<code className="font-mono text-indigo-300">https://buy.stripe.com/...</code>)
                  below (or share it in chat) to link it to every Supporter Pass and App License checkout button across
                  the platform.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <input
                    type="url"
                    value={stripeLinkInput}
                    onChange={(e) => setStripeLinkInput(e.target.value)}
                    placeholder="https://buy.stripe.com/..."
                    className="flex-1 px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Connect Stripe Link
                  </button>
                </div>
                {stripeSaveNotice && (
                  <div className="text-xs text-emerald-300 font-mono">{stripeSaveNotice}</div>
                )}
              </form>

              <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-emerald-400">
                    WEB PLATFORM PRODUCTION STATUS · LIVE ON CLOUD RUN &amp; FIRESTORE
                  </div>
                  <div className="text-sm font-bold font-display text-white">
                    Immediate Web Deployment Active (No Testing Gate)
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Share your live web platform URL below with developers and players—no 12-tester wait required.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={LIVE_SHARED_WEB_URL}
                    className="flex-1 px-3 py-1.5 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(LIVE_SHARED_WEB_URL);
                      setCopiedLiveUrl(true);
                      setTimeout(() => setCopiedLiveUrl(false), 2000);
                    }}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedLiveUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLiveUrl ? 'Copied URL' : 'Copy Live URL'}
                  </button>
                </div>
              </div>
            </div>

            {/* 4-Column Backend Gateway KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-1">
                <div className="text-xs font-mono text-slate-400">GATEWAY GROSS VOLUME</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-white">
                  {formatPriceCents(
                    (backendLedger?.totalVolumeCents || 0) +
                      userPayments.reduce((acc, p) => acc + p.amountCents, 0)
                  )}
                </div>
                <div className="text-xs text-slate-400">Processed via /api/payments/execute</div>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-1">
                <div className="text-xs font-mono text-slate-400">CREATOR NET PAYOUTS (85%)</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                  {formatPriceCents(
                    (backendLedger?.totalCreatorPayoutCents || 0) +
                      creatorSales.reduce((acc, p) => acc + p.creatorNetCents, 0)
                  )}
                </div>
                <div className="text-xs text-slate-400">Direct creator distribution</div>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-1">
                <div className="text-xs font-mono text-slate-400">PLATFORM HOSTING FEE (15%)</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-indigo-300">
                  {formatPriceCents(
                    (backendLedger?.totalPlatformFeeCents || 0) +
                      userPayments.reduce((acc, p) => acc + p.platformFeeCents, 0)
                  )}
                </div>
                <div className="text-xs text-slate-400">Sandbox &amp; CDN bandwidth</div>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-1">
                <div className="text-xs font-mono text-slate-400">VERIFIED QUESTIONNAIRES</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-white">
                  {myQuestionnaires.length}
                </div>
                <div className="text-xs text-slate-400">Active compliance certificates</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Completed Payment Receipts Table */}
              <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold font-display text-white">
                    Settled Payment Transactions &amp; Receipts
                  </h3>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {userPayments.length + (backendLedger?.recentReceipts.length || 0)} RECORDS
                  </span>
                </div>

                {userPayments.length === 0 && (!backendLedger || backendLedger.recentReceipts.length === 0) ? (
                  <div className="p-8 text-center space-y-3">
                    <Receipt className="w-7 h-7 text-slate-500 mx-auto" />
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-white">No payment transactions recorded yet</div>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        Purchase an app license or send a Creator Supporter Pass to see live backend settlement and
                        Firestore receipt records here.
                      </p>
                    </div>
                    <button
                      onClick={() => handleOpenCheckout(BUILT_IN_APPS[1])}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Run First Checkout ($4.99)
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-mono">
                          <th className="py-3 px-4">RECEIPT</th>
                          <th className="py-3 px-4">RELEASE</th>
                          <th className="py-3 px-4">METHOD</th>
                          <th className="py-3 px-4 text-right">CREATOR (85%)</th>
                          <th className="py-3 px-4 text-right">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                        {userPayments.map((pay) => (
                          <tr key={pay.id} className="hover:bg-slate-900/60">
                            <td className="py-3 px-4 text-indigo-300">{pay.receiptNumber}</td>
                            <td className="py-3 px-4 font-sans text-white">{pay.appTitle}</td>
                            <td className="py-3 px-4 text-slate-300">
                              {pay.cardBrand} •••• {pay.cardLast4}
                            </td>
                            <td className="py-3 px-4 text-right text-emerald-400">
                              {formatPriceCents(pay.creatorNetCents)}
                            </td>
                            <td className="py-3 px-4 text-right text-white font-semibold">
                              {formatPriceCents(pay.amountCents)}
                            </td>
                          </tr>
                        ))}
                        {userPayments.length === 0 &&
                          backendLedger?.recentReceipts.map((r) => (
                            <tr key={r.intentId} className="hover:bg-slate-900/60">
                              <td className="py-3 px-4 text-indigo-300">{r.receiptNumber}</td>
                              <td className="py-3 px-4 font-sans text-white">{r.appTitle}</td>
                              <td className="py-3 px-4 text-slate-300">
                                {r.cardBrand} •••• {r.cardLast4}
                              </td>
                              <td className="py-3 px-4 text-right text-emerald-400">
                                {formatPriceCents(r.creatorNetCents)}
                              </td>
                              <td className="py-3 px-4 text-right text-white font-semibold">
                                {formatPriceCents(r.amountCents)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Right Column: Publisher Questionnaire Certificates */}
              <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold font-display text-white">
                    Your Publisher Questionnaire Certificates
                  </h3>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {myQuestionnaires.length} FILED
                  </span>
                </div>

                {myQuestionnaires.length === 0 ? (
                  <div className="text-xs text-slate-400 space-y-3 py-4">
                    <p>
                      When you submit a new app or game in the Publisher Studio, your verified questionnaire record and
                      compliance certificate appear here.
                    </p>
                    <button
                      onClick={() => setActiveSection('publish')}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      Open Publisher Questionnaire
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {myQuestionnaires.map((q) => (
                      <div
                        key={q.id}
                        className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between font-mono text-emerald-400">
                          <span>{q.complianceCertificateId}</span>
                          <span className="text-slate-400">{q.createdAtLabel}</span>
                        </div>
                        <div className="font-semibold text-white">
                          Studio: {q.studioName} · {q.ageRating}
                        </div>
                        <div className="text-slate-400">
                          {q.dataPrivacyPolicy} · {q.accessibilityFeatures}
                        </div>
                        <div className="text-slate-400 font-mono text-[11px]">
                          Payout: {q.payoutMethod}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =====================================================================
          CONTIGUOUS PAYMENT CHECKOUT MODAL (/api/payments/create-intent + execute)
         ===================================================================== */}
      {checkoutApp && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-800">
              <div>
                <div className="text-xs font-mono text-indigo-400">
                  PLAYGROUND COMMERCE GATEWAY · 85% CREATOR PAYOUT
                </div>
                <h3 className="text-lg font-bold font-display text-white mt-0.5">
                  {checkoutApp.title}
                </h3>
                <p className="text-xs text-slate-400">By {checkoutApp.authorName}</p>
              </div>
              <button
                onClick={() => setCheckoutApp(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {settledReceipt ? (
              <div className="space-y-5">
                <div className="bg-emerald-950/50 border border-emerald-700/70 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Payment Authorized &amp; Settled
                  </div>
                  <p className="text-xs text-emerald-100/90">
                    Receipt <code className="font-mono font-bold">{settledReceipt.receiptNumber}</code> has been issued
                    by the backend payment server{user ? ' and saved to your Firestore account ledger.' : '.'}
                  </p>
                </div>

                <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-2 text-xs font-mono tabular-nums">
                  <div className="flex justify-between text-slate-400">
                    <span>ITEM</span>
                    <span className="text-white">{settledReceipt.paymentType}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>PAYMENT METHOD</span>
                    <span className="text-white">
                      {settledReceipt.cardBrand} •••• {settledReceipt.cardLast4}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>CREATOR PAYOUT (85%)</span>
                    <span className="text-emerald-400">{formatPriceCents(settledReceipt.creatorNetCents)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>PLATFORM FEE (15%)</span>
                    <span className="text-slate-300">{formatPriceCents(settledReceipt.platformFeeCents)}</span>
                  </div>
                  <div className="flex justify-between text-white font-bold pt-2 border-t border-slate-800 text-sm">
                    <span>TOTAL SETTLED</span>
                    <span>{formatPriceCents(settledReceipt.amountCents)} USD</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => {
                      const target = checkoutApp;
                      setCheckoutApp(null);
                      setActiveSection('payments');
                      if (target) setSelectedAppId(target.id);
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    View in Payment Ledger
                  </button>
                  <button
                    onClick={() => {
                      const target = checkoutApp;
                      setCheckoutApp(null);
                      if (target) handleLaunchApp(target);
                    }}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Launch {checkoutApp.title}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRunPayment} className="space-y-4">
                {/* Explicit Summary of What the Buyer Receives */}
                {(() => {
                  const perkInfo = getSupporterPerksForApp(checkoutApp.playType, checkoutApp.priceCents);
                  const activeStripeUrl = (checkoutApp.stripePaymentLink || platformStripeLink || '').trim();
                  return (
                    <div className="space-y-3">
                      <div className="bg-indigo-950/35 border border-indigo-800/70 rounded-xl p-3.5 space-y-2">
                        <div className="text-xs font-mono text-indigo-300 font-semibold">
                          WHAT YOU RECEIVE · {perkInfo.headline.toUpperCase()}
                        </div>
                        <ul className="space-y-1 text-xs text-slate-200 list-disc list-inside">
                          {perkInfo.perks.map((perk, idx) => (
                            <li key={idx}>{perk}</li>
                          ))}
                        </ul>
                      </div>

                      {activeStripeUrl ? (
                        <div className="bg-emerald-950/40 border border-emerald-700/70 rounded-xl p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between text-xs font-mono text-emerald-300">
                            <span>CONNECTED STRIPE PAYMENT LINK</span>
                            <span>LIVE CHECKOUT</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={activeStripeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 py-2 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg text-center transition-colors whitespace-nowrap"
                            >
                              Open Stripe Payment Link ({formatPriceCents(checkoutAmountCents)}) ↗
                            </a>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                {/* Tier Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300">
                    Select License or Creator Support Tier
                  </label>
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                    {[
                      {
                        label:
                          checkoutApp.priceCents > 0
                            ? `License (${formatPriceCents(checkoutApp.priceCents)})`
                            : 'Supporter ($3.00)',
                        cents: checkoutApp.priceCents > 0 ? checkoutApp.priceCents : 300,
                        type:
                          checkoutApp.priceCents > 0
                            ? ('App License Purchase' as const)
                            : ('Creator Supporter Pass' as const),
                      },
                      {
                        label: 'Supporter ($5.00)',
                        cents: 500,
                        type: 'Creator Supporter Pass' as const,
                      },
                      {
                        label: 'Patron ($15.00)',
                        cents: 1500,
                        type: 'Creator Supporter Pass' as const,
                      },
                    ].map((tier) => (
                      <button
                        key={tier.label}
                        type="button"
                        onClick={() => {
                          setCheckoutAmountCents(tier.cents);
                          setCheckoutType(tier.type);
                        }}
                        className={`py-2 px-2.5 rounded-lg border text-center transition-colors cursor-pointer ${
                          checkoutAmountCents === tier.cents
                            ? 'bg-indigo-600/20 border-indigo-500 text-white font-semibold'
                            : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {tier.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transparent Revenue Breakdown */}
                <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 space-y-1.5 text-xs font-mono tabular-nums">
                  <div className="flex justify-between text-slate-400">
                    <span>CREATOR DIRECT SHARE (85%)</span>
                    <span className="text-emerald-400">
                      {formatPriceCents(Math.round(checkoutAmountCents * 0.85))}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>PLATFORM INFRASTRUCTURE (15%)</span>
                    <span>
                      {formatPriceCents(checkoutAmountCents - Math.round(checkoutAmountCents * 0.85))}
                    </span>
                  </div>
                  <div className="flex justify-between text-white font-bold pt-1.5 border-t border-slate-800">
                    <span>TOTAL CHARGE</span>
                    <span>{formatPriceCents(checkoutAmountCents)} USD</span>
                  </div>
                </div>

                {/* Card Details */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300">Card Details</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCardNumber('4242 4242 4242 4242');
                        setCardExpiry('08/29');
                        setCardCvc('842');
                      }}
                      className="text-[11px] font-mono text-indigo-400 hover:underline cursor-pointer"
                    >
                      Autofill Test Visa (4242)
                    </button>
                  </div>

                  <input
                    type="text"
                    required
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    placeholder="Cardholder Name"
                    className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                  />

                  <input
                    type="text"
                    required
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4242 4242 4242 4242"
                    className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono tabular-nums text-white focus:outline-none focus:border-indigo-500"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      placeholder="MM/YY"
                      className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono tabular-nums text-white focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      required
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      placeholder="CVC"
                      className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono tabular-nums text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {paymentError && (
                  <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-200">
                    {paymentError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCheckoutApp(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={processingPayment}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    {processingPayment
                      ? 'Authorizing Payment...'
                      : `Pay ${formatPriceCents(checkoutAmountCents)} USD`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-6 lg:px-10 mt-12">
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>App and Game Playground · Community Publishing, Questionnaire Vetting &amp; Payment Platform</span>
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveSection('discover')}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Catalog
            </button>
            <button
              onClick={() => setActiveSection('vision')}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Gemini 4 Argon Vision Lab
            </button>
            <button
              onClick={() => setActiveSection('publish')}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Publisher Questionnaire
            </button>
            <button
              onClick={() => setActiveSection('payments')}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Payments &amp; Ledger
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
