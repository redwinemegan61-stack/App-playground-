import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  CreditCard,
  ShieldCheck,
  Star,
  CheckCircle2,
  Heart,
  ExternalLink,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  PlaygroundAppItem,
  AppReviewItem,
  formatPriceCents,
  getSupporterPerksForApp,
} from '../data/defaultApps';
import { ArtworkCover } from './ArtworkCover';
import { db, handleFirestoreError, OperationType } from '../firebase';

interface StorefrontAppDetailsModalProps {
  app: PlaygroundAppItem;
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (app: PlaygroundAppItem) => void;
  onOpenCheckout: (app: PlaygroundAppItem) => void;
  isUnlocked: boolean;
  user: User | null;
  isOwnerAdmin: boolean;
  onLikeApp: (app: PlaygroundAppItem) => void;
  onSignInRequired: () => void;
}

type StoreTab = 'about' | 'upgrade-perks' | 'safety' | 'reviews';

export const StorefrontAppDetailsModal: React.FC<StorefrontAppDetailsModalProps> = ({
  app,
  isOpen,
  onClose,
  onLaunch,
  onOpenCheckout,
  isUnlocked,
  user,
  isOwnerAdmin,
  onLikeApp,
  onSignInRequired,
}) => {
  const [activeTab, setActiveTab] = useState<StoreTab>('about');
  const [reviews, setReviews] = useState<AppReviewItem[]>([]);
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');

  // Subscribe to real Firestore reviews for this specific app
  useEffect(() => {
    if (!isOpen || app.isBuiltIn) {
      setReviews([]);
      return;
    }

    const reviewsPath = `apps/${app.id}/reviews`;
    const q = query(
      collection(db, 'apps', app.id, 'reviews'),
      where('appId', '==', app.id),
      where('rating', '>=', 1)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items: AppReviewItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          let createdAtLabel = 'Recent Review';
          if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            createdAtLabel = data.createdAt.toDate().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
          }
          return {
            id: d.id,
            appId: String(data.appId || app.id),
            authorId: String(data.authorId || ''),
            authorName: String(data.authorName || 'Player'),
            rating: Math.max(1, Math.min(5, Math.round(Number(data.rating) || 5))),
            comment: String(data.comment || ''),
            createdAtLabel,
          };
        });
        setReviews(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, reviewsPath);
      }
    );

    return () => unsub();
  }, [isOpen, app.id, app.isBuiltIn]);

  if (!isOpen) return null;

  const perkInfo = getSupporterPerksForApp(app.playType, app.priceCents);
  const isPaidLicense = app.priceCents > 0;
  const isSupporterPass = app.monetizationModel === 'Creator Supporter Pass';

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  const handlePostReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || app.isBuiltIn) return;
    const cleanComment = reviewComment.trim().slice(0, 600);
    if (cleanComment.length < 2) return;

    setSubmittingReview(true);
    const revId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const revPath = `apps/${app.id}/reviews/${revId}`;
    try {
      await setDoc(doc(db, 'apps', app.id, 'reviews', revId), {
        appId: app.id,
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-modal-title"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto font-mono"
    >
      <div className="bg-[#0b0c0e] border border-[rgba(224,226,229,0.18)] max-w-3xl w-full my-auto overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Top App Store Header Banner with Artwork Cover */}
        <div className="relative h-48 sm:h-56 w-full overflow-hidden shrink-0 border-b border-[rgba(224,226,229,0.1)] bg-black">
          <ArtworkCover
            playType={app.playType}
            category={app.category}
            title={app.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c0e] via-[#0b0c0e]/50 to-transparent" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close store page"
            className="absolute top-4 right-4 p-2 bg-black/80 hover:bg-black text-[#e0e2e5] hover:text-[#00ff9d] border border-[rgba(224,226,229,0.2)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Badges on Hero */}
          <div className="absolute bottom-4 left-6 right-6 flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono text-[#00ff9d]">
                <span>_{app.category.toLowerCase().replace(/\s+/g, '_')}</span>
                <span aria-hidden="true">·</span>
                <span>{app.ageRating}</span>
                <span aria-hidden="true">·</span>
                <span>v{app.version}</span>
              </div>
              <h2
                id="store-modal-title"
                className="text-xl sm:text-2xl font-bold font-display text-white tracking-tight"
              >
                {app.title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span>By {app.authorName}</span>
                {app.isBuiltIn ? (
                  <span className="text-[11px] font-mono text-[#00ff9d] font-bold">
                    Official Sandbox Core
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-[#00ff9d] font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-[#00ff9d] inline" />
                    Owner Approved
                  </span>
                )}
              </div>
            </div>

            {/* Quick Pricing Badge */}
            <div className="text-right shrink-0">
              <div className="text-sm sm:text-base font-bold font-mono text-white">
                {isUnlocked
                  ? 'PASS UNLOCKED'
                  : formatPriceCents(app.priceCents, app.monetizationModel)}
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                {app.monetizationModel === 'Free to Play'
                  ? '100% Free'
                  : isSupporterPass
                    ? 'Free Game + Optional Pass'
                    : 'One-Time Purchase'}
              </div>
            </div>
          </div>
        </div>

        {/* Primary Action Button Bar */}
        <div className="px-6 py-3.5 bg-black/60 border-b border-[rgba(224,226,229,0.1)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-4 text-xs font-mono text-slate-400 tabular-nums">
            <div className="flex items-center gap-1 text-amber-400">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span className="font-semibold text-white">
                {avgRating !== null ? `${avgRating} ★` : 'No ratings yet'}
              </span>
              <span className="text-slate-400">
                ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
              </span>
            </div>
            <span aria-hidden="true" className="text-slate-700">|</span>
            <div>
              {app.isBuiltIn
                ? 'Official Sandbox'
                : app.playsCount > 0
                  ? `${app.playsCount.toLocaleString()} launches`
                  : 'New Release'}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {!app.isBuiltIn && (
              <button
                type="button"
                onClick={() => onLikeApp(app)}
                className="terminal-btn py-1.5 px-3 text-xs flex items-center gap-1.5 cursor-pointer"
                title="Upvote app"
              >
                <Heart className="w-3.5 h-3.5 text-rose-400" />
                <span>{app.likesCount}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onOpenCheckout(app)}
              className="terminal-btn py-1.5 px-3.5 text-xs flex items-center gap-1.5 cursor-pointer border-[#00ff9d] text-[#00ff9d]"
            >
              <CreditCard className="w-3.5 h-3.5 text-[#00ff9d]" />
              <span>
                {isUnlocked
                  ? 'Perks Active'
                  : isPaidLicense
                    ? `Purchase License (${formatPriceCents(app.priceCents)})`
                    : 'Get Supporter Pass ($3.00)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onLaunch(app);
              }}
              className="terminal-btn terminal-btn-fill py-1.5 px-4 text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play Now (Free)</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation (Systematic Monospace Tags) */}
        <div className="px-6 pt-3 bg-black/40 border-b border-[rgba(224,226,229,0.1)] flex items-center gap-2 overflow-x-auto shrink-0 font-mono">
          {[
            { id: 'about' as const, label: '_about_app' },
            { id: 'upgrade-perks' as const, label: '_upgraded_pack_perks' },
            { id: 'safety' as const, label: '_safety_and_privacy' },
            { id: 'reviews' as const, label: `_reviews (${reviews.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 text-xs font-mono border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'border-[#00ff9d] text-[#00ff9d] font-bold'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body Content (Scrollable) */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: ABOUT THIS APP */}
          {activeTab === 'about' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="terminal-label">APP OVERVIEW &amp; TAGLINE</div>
                <p className="text-sm text-slate-200 leading-relaxed font-mono">
                  {app.tagline}
                </p>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line pt-1 font-mono">
                  {app.description}
                </p>
              </div>

              {app.externalUrl && (
                <div className="bg-white/[0.02] border border-[rgba(224,226,229,0.1)] p-3.5 flex items-center justify-between text-xs">
                  <span className="text-slate-400">External Web App Deployment:</span>
                  <a
                    href={app.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00ff9d] hover:underline flex items-center gap-1 font-mono"
                  >
                    {app.externalUrl}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Technical Specifications Strip */}
              <div className="bg-white/[0.02] border border-[rgba(224,226,229,0.1)] p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block text-[11px]">VERSION</span>
                  <span className="text-white font-semibold">v{app.version}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">CATEGORY</span>
                  <span className="text-white font-semibold">{app.category}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">ENGINE TYPE</span>
                  <span className="text-[#00ff9d] font-semibold">{app.playType}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">AGE RATING</span>
                  <span className="text-[#00ff9d] font-semibold">{app.ageRating}</span>
                </div>
              </div>

              {app.aiVisualSummary && (
                <div className="bg-white/[0.02] border border-[rgba(224,226,229,0.1)] p-3.5 space-y-1">
                  <div className="text-[11px] font-mono text-[#00ff9d] flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>GEMINI VISUAL &amp; ARCHITECTURE SUMMARY</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-mono">
                    {app.aiVisualSummary}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WHAT YOU GET WITH UPGRADED PACKAGE */}
          {activeTab === 'upgrade-perks' && (
            <div className="space-y-5">
              <div className="bg-[#00ff9d]/5 border border-[#00ff9d]/30 p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#00ff9d]/20 pb-3">
                  <div>
                    <div className="terminal-label text-amber-300 font-bold">
                      ITEMIZED BENEFIT BREAKDOWN
                    </div>
                    <h3 className="text-base font-bold font-display text-white mt-0.5">
                      {perkInfo.headline}
                    </h3>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-base font-bold text-[#00ff9d]">
                      {isPaidLicense ? formatPriceCents(app.priceCents) : '$3.00 – $5.00'}
                    </div>
                    <div className="text-[11px] text-slate-400">100% Platform Verified</div>
                  </div>
                </div>

                <div className="text-xs text-slate-300 leading-relaxed font-mono">
                  When you purchase the upgraded package or Supporter Pass, you unlock premium interactive runtime features and receive a verifiable receipt.
                </div>

                <div className="space-y-2.5 pt-1">
                  {perkInfo.perks.map((perk, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 text-xs text-white bg-black/40 border border-[rgba(224,226,229,0.1)] p-3"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#00ff9d] shrink-0 mt-0.5" />
                      <span className="font-mono">{perk}</span>
                    </div>
                  ))}
                  <div className="flex items-start gap-2.5 text-xs text-white bg-black/40 border border-[rgba(224,226,229,0.1)] p-3 font-mono">
                    <CheckCircle2 className="w-4 h-4 text-[#00ff9d] shrink-0 mt-0.5" />
                    <span>
                      <strong>Verifiable Firestore Receipt:</strong> An itemized <code className="text-[#00ff9d]">RCPT-*</code>{' '}
                      payment record stored in your account ledger.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs text-white bg-black/40 border border-[rgba(224,226,229,0.1)] p-3 font-mono">
                    <CheckCircle2 className="w-4 h-4 text-[#00ff9d] shrink-0 mt-0.5" />
                    <span>
                      <strong>Permanent License Unlock:</strong> Once purchased, the badge switches to PASS ACTIVE and
                      perks remain available whenever you play.
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onOpenCheckout(app)}
                    className="terminal-btn terminal-btn-fill w-full py-2.5 text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    {isUnlocked ? 'Perks Already Active on Your Account' : 'Upgrade & Unlock Perks Now'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GOOGLE PLAY SAFETY & PRIVACY */}
          {activeTab === 'safety' && (
            <div className="space-y-4">
              <div className="bg-white/[0.02] border border-[rgba(224,226,229,0.1)] p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-[rgba(224,226,229,0.1)] pb-3">
                  <ShieldCheck className="w-5 h-5 text-[#00ff9d]" />
                  <div>
                    <h3 className="text-sm font-bold font-display text-white">
                      Google Play Store Safety &amp; Content Rating Verification
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      Standardized disclosures submitted during publisher onboarding.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="bg-black/40 border border-[rgba(224,226,229,0.1)] p-3 space-y-1">
                    <span className="text-slate-400 text-[11px] block">DATA COLLECTION</span>
                    <span className="text-white font-semibold">{app.dataPrivacyPolicy}</span>
                    <p className="text-[11px] text-slate-400">
                      Zero personally identifiable telemetry or third-party ad brokers.
                    </p>
                  </div>

                  <div className="bg-black/40 border border-[rgba(224,226,229,0.1)] p-3 space-y-1">
                    <span className="text-slate-400 text-[11px] block">DATA ENCRYPTION</span>
                    <span className="text-[#00ff9d] font-semibold">Encrypted in Transit</span>
                    <p className="text-[11px] text-slate-400">
                      All gameplay network traffic and receipts protected via SSL/TLS.
                    </p>
                  </div>

                  <div className="bg-black/40 border border-[rgba(224,226,229,0.1)] p-3 space-y-1">
                    <span className="text-slate-400 text-[11px] block">ACCESSIBILITY FEATURES</span>
                    <span className="text-white font-semibold">{app.accessibilityFeatures}</span>
                    <p className="text-[11px] text-slate-400">
                      Meets minimum 44px touch targets and high-contrast WCAG rules.
                    </p>
                  </div>

                  <div className="bg-black/40 border border-[rgba(224,226,229,0.1)] p-3 space-y-1">
                    <span className="text-slate-400 text-[11px] block">SECURITY REVIEW</span>
                    <span className="text-[#00ff9d] font-semibold">
                      {app.isBuiltIn ? 'Platform Core Build' : 'Reviewed by Owner'}
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Sole authorization managed by platform owner.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RATINGS & REVIEWS */}
          {activeTab === 'reviews' && (
            <div className="space-y-5 font-mono">
              {/* Summary Stats */}
              <div className="bg-white/[0.02] border border-[rgba(224,226,229,0.1)] p-4 flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold font-display text-white">
                    {avgRating !== null ? `${avgRating} ★` : 'No ratings yet'}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {reviews.length === 0
                      ? '0 verified reviews in Firestore'
                      : `Based on ${reviews.length} verified ${reviews.length === 1 ? 'review' : 'reviews'}`}
                  </div>
                </div>
                <div className="text-xs font-mono text-slate-400 text-right">
                  100% REAL FEEDBACK ONLY<br />
                  <span className="text-[#00ff9d]">NO SYNTHETIC DATA</span>
                </div>
              </div>

              {/* Review Submission Form */}
              {!app.isBuiltIn && (
                <div className="bg-white/[0.02] border border-[rgba(224,226,229,0.1)] p-4">
                  {user ? (
                    <form onSubmit={handlePostReview} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-300">Rate this application:</span>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setReviewRating(s)}
                              className="p-1 cursor-pointer"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  s <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
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
                        placeholder="Write your honest player review (2-600 characters)..."
                        className="w-full px-3 py-2 bg-black/60 border border-[rgba(224,226,229,0.15)] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00ff9d] font-mono"
                      />
                      <button
                        type="submit"
                        disabled={submittingReview || reviewComment.trim().length < 2}
                        className="terminal-btn terminal-btn-fill py-1.5 px-4 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        {submittingReview ? 'Posting Review...' : 'Submit Verified Review'}
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Sign in with Google to rate and leave a player review.</span>
                      <button
                        type="button"
                        onClick={onSignInRequired}
                        className="text-[#00ff9d] hover:underline font-semibold cursor-pointer"
                      >
                        Sign In
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Review List */}
              {reviews.length === 0 ? (
                <div className="bg-white/[0.02] border border-[rgba(224,226,229,0.1)] p-6 text-center text-xs text-slate-400 space-y-1">
                  <div>No player reviews recorded in Firestore yet.</div>
                  <div className="text-[11px] text-slate-500">
                    Be the first to launch this app and share your thoughts!
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {reviews.map((r) => (
                    <div
                      key={r.id}
                      className="bg-white/[0.02] border border-[rgba(224,226,229,0.1)] p-3.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">{r.authorName}</span>
                        <span className="font-mono text-amber-400 tabular-nums">
                          {'★'.repeat(r.rating)} · {r.createdAtLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-mono">{r.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
