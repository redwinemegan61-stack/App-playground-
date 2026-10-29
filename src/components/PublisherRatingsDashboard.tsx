import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { collection, onSnapshot } from 'firebase/firestore';
import { Star, Play, MessageSquare, BarChart3, Filter } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { PlaygroundAppItem, AppReviewItem } from '../data/defaultApps';

interface PublisherRatingsDashboardProps {
  userUid: string | null;
  isOwnerAdmin: boolean;
  mySubmittedApps: PlaygroundAppItem[];
  adminAllApps: PlaygroundAppItem[];
  communityApps: PlaygroundAppItem[];
  onOpenAppInStage: (app: PlaygroundAppItem) => void;
}

interface EnrichedReviewItem extends AppReviewItem {
  appTitle: string;
  createdAtMs: number;
}

interface StarBucketDatum {
  star: number;
  label: string;
  shortLabel: string;
  count: number;
  percentage: number;
  color: string;
}

const STAR_COLORS: Record<number, string> = {
  5: '#10B981', // Emerald 500
  4: '#6366F1', // Indigo 500
  3: '#06B6D4', // Cyan 500
  2: '#F59E0B', // Amber 500
  1: '#F43F5E', // Rose 500
};

export const PublisherRatingsDashboard: React.FC<PublisherRatingsDashboardProps> = ({
  userUid,
  isOwnerAdmin,
  mySubmittedApps,
  adminAllApps,
  communityApps,
  onOpenAppInStage,
}) => {
  const [ownerScope, setOwnerScope] = useState<'my-apps' | 'all-community'>('my-apps');
  const [selectedAppFilter, setSelectedAppFilter] = useState<string>('all');
  const [selectedStarFilter, setSelectedStarFilter] = useState<number | null>(null);
  const [reviewsByAppId, setReviewsByAppId] = useState<Record<string, EnrichedReviewItem[]>>({});
  const [loadingAppsCount, setLoadingAppsCount] = useState<number>(0);

  // Determine the real Firestore apps available to analyze
  const targetApps = useMemo(() => {
    if (isOwnerAdmin && ownerScope === 'all-community') {
      return adminAllApps.length > 0 ? adminAllApps : communityApps;
    }
    return mySubmittedApps;
  }, [isOwnerAdmin, ownerScope, adminAllApps, communityApps, mySubmittedApps]);

  // Reset selectedAppFilter if the previously selected app is no longer in targetApps
  useEffect(() => {
    if (selectedAppFilter !== 'all' && !targetApps.some((a) => a.id === selectedAppFilter)) {
      setSelectedAppFilter('all');
    }
  }, [targetApps, selectedAppFilter]);

  // Subscribe in real-time to `/apps/{appId}/reviews` for every target app.
  // Strictly reads real Firestore documents only — never synthesizes or mocks data.
  useEffect(() => {
    if (targetApps.length === 0) {
      setReviewsByAppId({});
      setLoadingAppsCount(0);
      return;
    }

    setLoadingAppsCount(targetApps.length);
    const pendingInitialLoads = new Set(targetApps.map((a) => a.id));

    const unsubscribes = targetApps.map((appItem) => {
      const path = `apps/${appItem.id}/reviews`;
      const reviewsRef = collection(db, 'apps', appItem.id, 'reviews');

      return onSnapshot(
        reviewsRef,
        (snapshot) => {
          const items: EnrichedReviewItem[] = snapshot.docs
            .map((docSnap) => {
              const d = docSnap.data();
              const rawRating = Number(d.rating);
              // Only include valid 1..5 integer/numeric ratings from real Firestore docs
              if (!Number.isFinite(rawRating) || rawRating < 1 || rawRating > 5) {
                return null;
              }
              const clampedRating = Math.round(rawRating);
              let createdAtLabel = 'Verified Review';
              let createdAtMs = 0;
              if (d.createdAt && typeof d.createdAt.toDate === 'function') {
                const dt: Date = d.createdAt.toDate();
                createdAtMs = dt.getTime();
                createdAtLabel = dt.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
              }
              return {
                id: docSnap.id,
                appId: String(d.appId || appItem.id),
                appTitle: appItem.title,
                authorId: String(d.authorId || ''),
                authorName: String(d.authorName || 'Player'),
                rating: clampedRating,
                comment: String(d.comment || ''),
                createdAtLabel,
                createdAtMs,
              };
            })
            .filter((item): item is EnrichedReviewItem => item !== null);

          setReviewsByAppId((prev) => ({
            ...prev,
            [appItem.id]: items,
          }));

          if (pendingInitialLoads.has(appItem.id)) {
            pendingInitialLoads.delete(appItem.id);
            setLoadingAppsCount(pendingInitialLoads.size);
          }
        },
        (error) => {
          if (pendingInitialLoads.has(appItem.id)) {
            pendingInitialLoads.delete(appItem.id);
            setLoadingAppsCount(pendingInitialLoads.size);
          }
          handleFirestoreError(error, OperationType.LIST, path);
        }
      );
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [targetApps]);

  // Aggregate real reviews for the active app filter
  const activeReviews = useMemo(() => {
    const all: EnrichedReviewItem[] = [];
    for (const app of targetApps) {
      if (selectedAppFilter !== 'all' && app.id !== selectedAppFilter) continue;
      const appRevs = reviewsByAppId[app.id] || [];
      all.push(...appRevs);
    }
    return all.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [targetApps, selectedAppFilter, reviewsByAppId]);

  // Compute 1★ to 5★ distribution strictly from activeReviews
  const distributionData: StarBucketDatum[] = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const rev of activeReviews) {
      if (counts[rev.rating] !== undefined) {
        counts[rev.rating] += 1;
      }
    }
    const total = activeReviews.length;
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      label: `${star} ${star === 1 ? 'Star' : 'Stars'}`,
      shortLabel: `${star} ★`,
      count: counts[star],
      percentage: total > 0 ? Math.round((counts[star] / total) * 100) : 0,
      color: STAR_COLORS[star],
    }));
  }, [activeReviews]);

  const totalRealReviews = activeReviews.length;

  const averageRating = useMemo(() => {
    if (totalRealReviews === 0) return null;
    const sum = activeReviews.reduce((acc, r) => acc + r.rating, 0);
    return (sum / totalRealReviews).toFixed(2);
  }, [activeReviews, totalRealReviews]);

  const positiveShare = useMemo(() => {
    if (totalRealReviews === 0) return null;
    const pos = activeReviews.filter((r) => r.rating >= 4).length;
    return Math.round((pos / totalRealReviews) * 100);
  }, [activeReviews, totalRealReviews]);

  const filteredReviewList = useMemo(() => {
    if (selectedStarFilter === null) return activeReviews;
    return activeReviews.filter((r) => r.rating === selectedStarFilter);
  }, [activeReviews, selectedStarFilter]);

  const currentlySelectedAppObj = useMemo(() => {
    if (selectedAppFilter === 'all') return targetApps[0] || null;
    return targetApps.find((a) => a.id === selectedAppFilter) || null;
  }, [targetApps, selectedAppFilter]);

  return (
    <section
      aria-label="Publisher Player Feedback and Star Rating Distribution"
      className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6"
    >
      {/* Header Row & Scope Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-indigo-400">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>REAL-TIME FIRESTORE TELEMETRY · 100% VERIFIED PLAYER FEEDBACK</span>
          </div>
          <h3 className="text-lg font-bold font-display text-white">
            Player Feedback &amp; Star Rating Distribution
          </h3>
          <p className="text-xs text-slate-400 max-w-3xl">
            Live star rating distribution (<span className="font-mono text-slate-300">1 ★</span> to{' '}
            <span className="font-mono text-slate-300">5 ★</span>) aggregated directly from Firestore{' '}
            <code className="font-mono text-indigo-300">/apps/&#123;appId&#125;/reviews</code> documents. Zero synthetic
            or placeholder numbers are ever shown.
          </p>
        </div>

        {/* Scope & App Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isOwnerAdmin && (
            <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setOwnerScope('my-apps');
                  setSelectedAppFilter('all');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  ownerScope === 'my-apps'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                My Published Apps ({mySubmittedApps.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setOwnerScope('all-community');
                  setSelectedAppFilter('all');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  ownerScope === 'all-community'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Customer Apps ({adminAllApps.length || communityApps.length})
              </button>
            </div>
          )}

          {targetApps.length > 0 && (
            <div className="flex items-center gap-2 bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <label htmlFor="publisher-rating-app-filter" className="sr-only">
                Filter ratings by published application
              </label>
              <select
                id="publisher-rating-app-filter"
                value={selectedAppFilter}
                onChange={(e) => setSelectedAppFilter(e.target.value)}
                className="bg-transparent text-xs text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#0B0F17] text-white">
                  All {isOwnerAdmin && ownerScope === 'all-community' ? 'Customer' : 'My'} Apps (
                  {targetApps.length})
                </option>
                {targetApps.map((app) => {
                  const count = (reviewsByAppId[app.id] || []).length;
                  return (
                    <option key={app.id} value={app.id} className="bg-[#0B0F17] text-white">
                      {app.title} ({count} {count === 1 ? 'review' : 'reviews'})
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* State 1: User is not signed in or has 0 published apps in this scope */}
      {!userUid ? (
        <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-6 text-center space-y-2">
          <div className="text-xs font-mono text-slate-400">
            AUTHENTICATION REQUIRED FOR PERSONAL PUBLISHER ANALYTICS
          </div>
          <p className="text-xs text-slate-300 max-w-xl mx-auto">
            Sign in with Google and publish an application below to track real-time player star ratings and review
            distributions for your releases.
          </p>
        </div>
      ) : targetApps.length === 0 ? (
        <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-6 text-center space-y-2">
          <div className="text-xs font-mono text-slate-400">
            0 PUBLISHED APPS IN THIS SCOPE · NO PLAYER RATINGS YET
          </div>
          <p className="text-xs text-slate-300 max-w-xl mx-auto">
            You have not submitted any applications yet. Once you submit an app using the form below and players leave
            verified reviews in the Arcade Stage, their real star ratings will be charted here automatically.
          </p>
        </div>
      ) : (
        <>
          {/* 4-Card Real Telemetry KPI Strip (Max 3 data points per card, 24px gap) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-mono text-slate-400">AVERAGE STAR RATING</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-display text-white tabular-nums">
                  {averageRating !== null ? `${averageRating} ★` : 'No ratings yet'}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono tabular-nums">
                {totalRealReviews === 0
                  ? '0 real reviews recorded'
                  : `Based on ${totalRealReviews} real ${totalRealReviews === 1 ? 'review' : 'reviews'}`}
              </div>
            </div>

            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-mono text-slate-400">TOTAL VERIFIED REVIEWS</div>
              <div className="text-2xl font-bold font-display text-indigo-400 tabular-nums">
                {totalRealReviews}
              </div>
              <div className="text-xs text-slate-400 font-mono tabular-nums">
                {selectedAppFilter === 'all'
                  ? `Across ${targetApps.length} ${targetApps.length === 1 ? 'app' : 'apps'}`
                  : 'Selected app'}
              </div>
            </div>

            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-mono text-slate-400">POSITIVE SENTIMENT (4★–5★)</div>
              <div className="text-2xl font-bold font-display text-emerald-400 tabular-nums">
                {positiveShare !== null ? `${positiveShare}%` : '—'}
              </div>
              <div className="text-xs text-slate-400 font-mono tabular-nums">
                {totalRealReviews === 0
                  ? 'Awaiting first player rating'
                  : `${activeReviews.filter((r) => r.rating >= 4).length} of ${totalRealReviews} reviews`}
              </div>
            </div>

            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-mono text-slate-400">TRACKED RELEASES</div>
              <div className="text-2xl font-bold font-display text-white tabular-nums">
                {selectedAppFilter === 'all' ? targetApps.length : 1}
              </div>
              <div className="text-xs text-slate-400 font-mono tabular-nums">
                {loadingAppsCount > 0
                  ? `Syncing ${loadingAppsCount} Firestore stream(s)...`
                  : 'Live Firestore listener active'}
              </div>
            </div>
          </div>

          {/* Main 12-Col Analytics Grid: Left 7 Cols Recharts Distribution + Right 5 Cols Real Review Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left 7 Cols: Recharts BarChart + Interactive 5★–1★ Breakdown */}
            <div className="lg:col-span-7 bg-[#0B0F17] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-mono text-slate-400">
                    RECHARTS STAR DISTRIBUTION HISTOGRAM (1 ★ TO 5 ★)
                  </div>
                  <div className="text-sm font-bold font-display text-white mt-0.5">
                    {selectedAppFilter === 'all'
                      ? 'All Tracked Releases — Star Rating Breakdown'
                      : `${currentlySelectedAppObj?.title || 'Selected App'} — Star Rating Breakdown`}
                  </div>
                </div>
                {selectedStarFilter !== null && (
                  <button
                    type="button"
                    onClick={() => setSelectedStarFilter(null)}
                    className="text-xs font-mono text-indigo-300 hover:text-white underline cursor-pointer self-start sm:self-auto"
                  >
                    Clear {selectedStarFilter} ★ filter
                  </button>
                )}
              </div>

              {/* Recharts Responsive Container */}
              <div className="w-full h-64 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={distributionData}
                    layout="vertical"
                    margin={{ top: 8, right: 28, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      domain={[0, (dataMax: number) => Math.max(dataMax, 1)]}
                      tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                      axisLine={{ stroke: '#1E293B' }}
                      tickLine={{ stroke: '#1E293B' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortLabel"
                      width={48}
                      tick={{ fill: '#F8FAFC', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
                      axisLine={{ stroke: '#1E293B' }}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const item = payload[0].payload as StarBucketDatum;
                        return (
                          <div className="bg-[#0B0F17] border border-slate-700 rounded-lg px-3.5 py-2.5 shadow-xl text-xs font-mono space-y-1">
                            <div className="text-white font-semibold flex items-center gap-1.5">
                              <span style={{ color: item.color }}>●</span>
                              <span>{item.label}</span>
                            </div>
                            <div className="text-slate-300 tabular-nums">
                              Verified Reviews: <span className="text-white font-bold">{item.count}</span>
                            </div>
                            <div className="text-slate-400 tabular-nums">
                              Share of Total: <span className="text-slate-200">{item.percentage}%</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="count"
                      radius={[0, 6, 6, 0]}
                      barSize={22}
                      onClick={(barItem) => {
                        const payload = barItem?.payload as StarBucketDatum | undefined;
                        if (payload && typeof payload.star === 'number') {
                          setSelectedStarFilter((prev) => (prev === payload.star ? null : payload.star));
                        }
                      }}
                      className="cursor-pointer"
                    >
                      {distributionData.map((entry) => {
                        const isDimmed =
                          selectedStarFilter !== null && selectedStarFilter !== entry.star;
                        return (
                          <Cell
                            key={`cell-${entry.star}`}
                            fill={entry.color}
                            fillOpacity={isDimmed ? 0.3 : 0.9}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {totalRealReviews === 0 && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="bg-[#111827]/95 border border-slate-800 rounded-lg px-4 py-2.5 text-center space-y-0.5 shadow-lg">
                      <div className="text-xs font-mono text-amber-300">
                        0 REAL PLAYER REVIEWS RECORDED YET
                      </div>
                      <div className="text-[11px] text-slate-400">
                        All 1★–5★ buckets remain at 0 until verified players rate your app.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Tabular Progress Rows for 5★ down to 1★ */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                {distributionData.map((bucket) => {
                  const isSelected = selectedStarFilter === bucket.star;
                  return (
                    <button
                      key={bucket.star}
                      type="button"
                      onClick={() =>
                        setSelectedStarFilter((prev) => (prev === bucket.star ? null : bucket.star))
                      }
                      className={`w-full flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-950/60 border border-indigo-700/70 text-white'
                          : 'hover:bg-slate-900/80 text-slate-300 border border-transparent'
                      }`}
                    >
                      <span className="w-10 text-left font-semibold text-white tabular-nums">
                        {bucket.shortLabel}
                      </span>
                      <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
                        <div
                          className="h-full transition-all duration-300 rounded-full"
                          style={{
                            width: `${bucket.percentage}%`,
                            backgroundColor: bucket.color,
                          }}
                        />
                      </div>
                      <span className="w-24 text-right tabular-nums text-slate-300">
                        {bucket.count} ({bucket.percentage}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right 5 Cols: Real Player Review Stream & Direct Stage Action */}
            <div className="lg:col-span-5 bg-[#0B0F17] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-mono text-slate-300">
                      {selectedStarFilter !== null
                        ? `FILTERED: ${selectedStarFilter} ★ REVIEWS (${filteredReviewList.length})`
                        : `VERIFIED PLAYER FEEDBACK (${filteredReviewList.length})`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-amber-400">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span className="text-xs font-mono tabular-nums text-white">
                      {averageRating !== null ? averageRating : '—'}
                    </span>
                  </div>
                </div>

                {filteredReviewList.length === 0 ? (
                  <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-5 space-y-2 text-center my-4">
                    <div className="text-xs font-mono text-slate-400">
                      {selectedStarFilter !== null
                        ? `0 REVIEWS WITH ${selectedStarFilter} ★`
                        : '0 VERIFIED PLAYER REVIEWS IN FIRESTORE'}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {selectedStarFilter !== null
                        ? `None of your real player reviews have a ${selectedStarFilter}-star rating yet.`
                        : 'We never display fake or placeholder reviews. When real signed-in players launch your app on the Arcade Stage and submit a star rating, their feedback will appear here immediately.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {filteredReviewList.slice(0, 25).map((rev) => (
                      <div
                        key={`${rev.appId}-${rev.id}`}
                        className="bg-[#111827] border border-slate-800 rounded-lg p-3.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-white">{rev.authorName}</span>
                          <span className="font-mono text-amber-400 tabular-nums">
                            {'★'.repeat(rev.rating)}
                            {'☆'.repeat(Math.max(0, 5 - rev.rating))} · {rev.rating}/5
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{rev.comment}</p>
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                          <span>App: {rev.appTitle}</span>
                          <span>{rev.createdAtLabel}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {currentlySelectedAppObj && (
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                  <div className="text-[11px] font-mono text-slate-400 truncate">
                    Target: <span className="text-slate-200">{currentlySelectedAppObj.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAppInStage(currentlySelectedAppObj)}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Open in Arcade Stage
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
