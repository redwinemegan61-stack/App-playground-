/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
  AppReviewItem,
  GeminiImageAnalysisResult,
  createSampleDiagnosticImage,
} from './data/defaultApps';
import { ArtworkCover } from './components/ArtworkCover';
import { PlayableStage } from './components/PlayableExperiences';

type ActiveSection = 'discover' | 'stage' | 'vision' | 'publish';

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

  // Catalog Filters
  const [selectedCategory, setSelectedCategory] = useState<'All' | AppCategory | 'My Published'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Publish Form State (Synced with firebase-blueprint.json constraints)
  const [pubTitle, setPubTitle] = useState<string>('');
  const [pubTagline, setPubTagline] = useState<string>('');
  const [pubDescription, setPubDescription] = useState<string>('');
  const [pubCategory, setPubCategory] = useState<AppCategory>('Game');
  const [pubPlayType, setPubPlayType] = useState<PlayableEngineType>('starlight-tactics');
  const [pubExternalUrl, setPubExternalUrl] = useState<string>('');
  const [pubVersion, setPubVersion] = useState<string>('1.0.0');
  const [pubAiSummary, setPubAiSummary] = useState<string>('');
  const [pubStatusMessage, setPubStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

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

  // 1. Track Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
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
            aiVisualSummary: String(data.aiVisualSummary || ''),
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

  // Combine Built-In Flagship Apps + Community Published Apps
  const allApps: PlaygroundAppItem[] = [...communityApps, ...BUILT_IN_APPS];
  const selectedApp = allApps.find((a) => a.id === selectedAppId) || allApps[0];

  // 3. Subscribe to reviews for currently selected community app
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

  // Submit a new App or Game to Firestore
  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPubStatusMessage(null);

    if (!user) {
      setPubStatusMessage({
        type: 'error',
        text: 'Please sign in with Google first to publish your app or game to the catalog.',
      });
      return;
    }

    const cleanTitle = pubTitle.trim().slice(0, 80);
    const cleanTagline = pubTagline.trim().slice(0, 140);
    const cleanDesc = pubDescription.trim().slice(0, 1500);
    const cleanVersion = pubVersion.trim().slice(0, 24) || '1.0.0';
    const cleanUrl = pubExternalUrl.trim().slice(0, 500);
    const cleanAiSummary =
      pubAiSummary.trim().slice(0, 1000) ||
      'Published via App and Game Playground Creator Studio.';

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

    setIsPublishing(true);
    const newId = sanitizeDocId('app');
    const docPath = `apps/${newId}`;

    try {
      await setDoc(doc(db, 'apps', newId), {
        title: cleanTitle,
        tagline: cleanTagline,
        description: cleanDesc,
        category: pubCategory,
        playType: pubPlayType,
        externalUrl: cleanUrl,
        version: cleanVersion,
        authorId: user.uid,
        authorName: (user.displayName || user.email?.split('@')[0] || 'Creator').slice(0, 80),
        isPublic: true,
        playsCount: 0,
        likesCount: 0,
        aiVisualSummary: cleanAiSummary,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setPubTitle('');
      setPubTagline('');
      setPubDescription('');
      setPubExternalUrl('');
      setPubAiSummary('');
      setPubStatusMessage({
        type: 'success',
        text: `Published "${cleanTitle}"! Launching in the Playground Stage...`,
      });
      setSelectedAppId(newId);
      setTimeout(() => {
        setActiveSection('stage');
        setPubStatusMessage(null);
      }, 900);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, docPath);
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
          [Brand Wordmark] — [4 Single-Line Nav Links] — [1 Primary Action CTA]
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

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
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
            Discover Catalog
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
            Vision Analyzer
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
            Creator Studio
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActiveSection('publish')}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Publish App
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
            <span>PUBLISHED RELEASES: {allApps.length}</span>
            <span aria-hidden="true">·</span>
            <span>TOTAL LAUNCHES: {totalPlays.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span>COMMUNITY APPLAUSE: {totalLikes.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span>VISION MODEL: GEMINI-4-ARGON</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile Section Switcher */}
            <div className="flex md:hidden items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              {(['discover', 'stage', 'vision', 'publish'] as ActiveSection[]).map((sec) => (
                <button
                  key={sec}
                  onClick={() => setActiveSection(sec)}
                  className={`px-2.5 py-1 text-xs font-medium rounded capitalize whitespace-nowrap shrink-0 ${
                    activeSection === sec ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                >
                  {sec}
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
            VIEW 1: DISCOVER STOREFRONT & CATALOG
           =================================================================== */}
        {activeSection === 'discover' && (
          <div className="space-y-12">
            {/* Split-Column Storefront Hero */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-[#111827] border border-slate-800 rounded-2xl p-6 lg:p-10">
              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-mono text-indigo-400">
                    <span>INTERACTIVE PUBLISHING PLATFORM</span>
                    <span aria-hidden="true">·</span>
                    <span>INSTANT BROWSER RUNTIME</span>
                  </div>
                  <h1
                    className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold font-display text-white tracking-tight leading-[1.15]"
                    style={{ textWrap: 'balance' }}
                  >
                    Publish, play, and inspect indie games and web apps in one studio.
                  </h1>
                  <p className="text-base text-slate-300 leading-relaxed max-w-2xl">
                    Launch playable 2D strategy games, polyphonic synthesizers, accessible word puzzles, and developer
                    patch tools directly in your browser—or publish your own builds to the community catalog with
                    Gemini 4 Argon screenshot analysis.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => handleLaunchApp(BUILT_IN_APPS[0])}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    Play Featured: Starlight Tactics
                  </button>
                  <button
                    onClick={() => setActiveSection('publish')}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Publish Your App
                  </button>
                  <button
                    onClick={() => setActiveSection('vision')}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Analyze Photo with Gemini 4 Argon
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
                    <div className="text-xs text-slate-400 truncate">
                      Featured Spotlight · v2.4.0 · Playground Core Studio
                    </div>
                    <div className="text-sm font-semibold text-white truncate">
                      Starlight Tactics: Sector Zero
                    </div>
                  </div>
                  <button
                    onClick={() => handleLaunchApp(BUILT_IN_APPS[0])}
                    className="px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Launch Now
                  </button>
                </div>
              </div>
            </section>

            {/* Search & Segmented Category Filter Controls */}
            <section className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold font-display text-white">
                    01. Published Apps &amp; Games Catalog
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Select any release to launch its interactive runtime or inspect community reviews.
                  </p>
                </div>

                {/* Search Input */}
                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search apps, games, creators..."
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
                    {cat === 'All' ? 'All Experiences' : cat}
                  </button>
                ))}
              </div>

              {/* 3-Column Catalog Grid */}
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
                        ? 'Sign in with Google to view and manage the apps and games you have published.'
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
                  {filteredApps.map((appItem) => (
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
                          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                            <span>{appItem.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>v{appItem.version}</span>
                            <span aria-hidden="true">·</span>
                            <span>{appItem.playsCount.toLocaleString()} plays</span>
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
                        </div>
                      </div>

                      <div className="px-5 pb-5 pt-3 border-t border-slate-800/60 flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-400 truncate">
                          By {appItem.authorName}
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
                            onClick={() => handleLaunchApp(appItem)}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            Launch
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
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
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                  <span>ACTIVE RUNTIME STAGE</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedApp.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>v{selectedApp.version}</span>
                  <span aria-hidden="true">·</span>
                  <span>By {selectedApp.authorName}</span>
                </div>
                <h2 className="text-xl font-bold font-display text-white">{selectedApp.title}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {allApps.slice(0, 6).map((item) => (
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
              onOpenVisionTab={() => setActiveSection('vision')}
            />

            {/* Release Notes, Gemini Visual Verification & Community Reviews */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
                <h3 className="text-base font-bold font-display text-white">
                  Release Documentation &amp; Visual Audit
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                  {selectedApp.description}
                </p>
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
                      community app in the Creator Studio to collect live Firestore ratings and reviews!
                    </p>
                    <button
                      onClick={() => setActiveSection('publish')}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Publish Your Own Build
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
                          Use in Publish Studio
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
            VIEW 4: CREATOR STUDIO — PUBLISH NEW APP OR GAME
           =================================================================== */}
        {activeSection === 'publish' && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-indigo-400">
                  CREATOR PUBLISHING PIPELINE · FIRESTORE PERSISTENCE
                </div>
                <h2 className="text-2xl font-bold font-display text-white mt-1">
                  03. Publish an App or Game to the Playground
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Configure your release metadata, select an interactive runtime template or external web URL, or upload
                  a screenshot to autofill with <code className="text-indigo-300 font-mono">gemini-4-argon</code>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Main Publishing Form */}
              <form
                onSubmit={handlePublishSubmit}
                className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5"
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
                    rows={4}
                    required
                    minLength={10}
                    maxLength={1500}
                    value={pubDescription}
                    onChange={(e) => setPubDescription(e.target.value)}
                    placeholder="Explain how people play or use your app, key controls, and what makes it special..."
                    className="w-full px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-400">
                    {user
                      ? `Publishing as ${user.displayName || user.email}`
                      : 'Sign in with Google required to publish'}
                  </span>
                  <button
                    type="submit"
                    disabled={isPublishing}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Layers className="w-4 h-4" />
                    {isPublishing ? 'Publishing to Catalog...' : 'Publish to Playground'}
                  </button>
                </div>
              </form>

              {/* Right Column: Gemini 4 Argon Screenshot Autofill Helper & Card Preview */}
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
                  <div className="px-4 py-2.5 border-b border-slate-800 text-xs font-mono text-slate-400">
                    LIVE STOREFRONT CARD PREVIEW
                  </div>
                  <ArtworkCover
                    playType={pubPlayType}
                    category={pubCategory}
                    title={pubTitle || 'Your App Title'}
                    className="h-44 w-full"
                  />
                  <div className="p-5 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                      <span>{pubCategory}</span>
                      <span aria-hidden="true">·</span>
                      <span>v{pubVersion || '1.0.0'}</span>
                      <span aria-hidden="true">·</span>
                      <span>0 plays</span>
                    </div>
                    <div className="text-base font-bold font-display text-white">
                      {pubTitle || 'Your App or Game Title'}
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2">
                      {pubTagline || 'Your single-line tagline will appear here on the catalog grid.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-6 lg:px-10 mt-12">
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>App and Game Playground · Community Publishing &amp; Arcade Platform</span>
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
              Publish Studio
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
