export type PlayableEngineType =
  | 'starlight-tactics'
  | 'pulsepad-synth'
  | 'botanica-word'
  | 'patchforge-vision'
  | 'custom-embed';

export type AppCategory =
  | 'Game'
  | 'Creative App'
  | 'Developer Tool'
  | 'Utility'
  | 'Simulation';

export type MonetizationModel =
  | 'Free to Play'
  | 'One-Time Purchase'
  | 'Creator Supporter Pass';

export type AgeRating =
  | 'Everyone (E)'
  | 'Everyone 10+ (E10+)'
  | 'Teen (T)'
  | 'Mature 17+ (M)';

export type ContentAdvisory = 'None' | 'Mild Cartoon / Tactical' | 'Moderate';

export type DataPrivacyPolicy =
  | 'Zero Data Collected'
  | 'Anonymous Gameplay Telemetry Only'
  | 'Authenticated Account Sync';

export type AccessibilityFeatureSet =
  | 'Keyboard + Mouse + High-Contrast'
  | 'Touch + Screen Reader Friendly'
  | 'Full Controller + Audio Cues';

export type PayoutMethod =
  | 'Stripe Connect Express (85% Creator / 15% Platform)'
  | 'Instant Card Payout'
  | 'Open-Source Community Grant';

export interface PlaygroundAppItem {
  id: string;
  title: string;
  tagline: string;
  description: string;
  category: AppCategory;
  playType: PlayableEngineType;
  externalUrl: string;
  version: string;
  authorId: string;
  authorName: string;
  isPublic: boolean;
  playsCount: number;
  likesCount: number;
  priceCents: number;
  monetizationModel: MonetizationModel;
  ageRating: AgeRating;
  dataPrivacyPolicy: DataPrivacyPolicy;
  accessibilityFeatures: AccessibilityFeatureSet;
  aiVisualSummary: string;
  stripePaymentLink?: string;
  createdAtLabel: string;
  isBuiltIn?: boolean;
}

export interface AppReviewItem {
  id: string;
  appId: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAtLabel: string;
}

export interface PaymentRecordItem {
  id: string;
  appId: string;
  appTitle: string;
  buyerId: string;
  buyerName: string;
  recipientAuthorId: string;
  amountCents: number;
  creatorNetCents: number;
  platformFeeCents: number;
  currency: string;
  paymentType: 'App License Purchase' | 'Creator Supporter Pass';
  cardBrand: string;
  cardLast4: string;
  receiptNumber: string;
  status: string;
  createdAtLabel: string;
}

export interface PublisherQuestionnaireItem {
  id: string;
  appId: string;
  authorId: string;
  studioName: string;
  ageRating: AgeRating;
  contentAdvisory: ContentAdvisory;
  dataPrivacyPolicy: DataPrivacyPolicy;
  accessibilityFeatures: AccessibilityFeatureSet;
  monetizationModel: MonetizationModel;
  payoutMethod: PayoutMethod;
  supportContact: string;
  complianceCertificateId: string;
  createdAtLabel: string;
}

export interface GeminiImageAnalysisResult {
  suggestedTitle: string;
  suggestedTagline: string;
  suggestedCategory: string;
  visualSummary: string;
  extractedText: string;
  technicalDiagnosis: string;
  generatedPatch: string;
}

export function formatPriceCents(cents: number): string {
  if (!cents || cents <= 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
}

export function getSupporterPerksForApp(playType: PlayableEngineType, priceCents: number): {
  headline: string;
  perks: string[];
} {
  const isPaidLicense = priceCents > 0;
  if (playType === 'starlight-tactics') {
    return {
      headline: isPaidLicense ? 'Full Commercial License + Command Perks' : 'Starlight Commander Supporter Pass',
      perks: [
        'Unlocks Overdrive Fleet Mode: 4 Action Points (AP) per turn instead of 3 AP',
        'Unlocks Heavy Ion Cannon button (55 DMG long-range strike) & +30 starting shields',
        'Verified Supporter Patron badge on your community reviews + 85% direct creator payout',
      ],
    };
  }
  if (playType === 'pulsepad-synth') {
    return {
      headline: isPaidLicense ? 'Full Synth Studio License & Pro Expansion' : 'Audio Lab Supporter Pass',
      perks: [
        'Unlocks the Cyber-Arpeggio 16-Step Master Preset pattern',
        'Unlocks 1-Click JSON Loop & Sequence Exporter for external DAWs',
        'Verified Supporter Patron badge on your community reviews + 85% direct creator payout',
      ],
    };
  }
  if (playType === 'botanica-word') {
    return {
      headline: isPaidLicense ? 'Full Sanctuary License + Botanist Toolkit' : 'Botanical Patron Supporter Pass',
      perks: [
        'Unlocks 1-Click "Instant Specimen Reveal" to auto-solve any word on the board',
        'Unlocks Golden Herbarium tile accent mode during puzzle play',
        'Verified Supporter Patron badge on your community reviews + 85% direct creator payout',
      ],
    };
  }
  if (playType === 'patchforge-vision') {
    return {
      headline: isPaidLicense ? 'Pro SDK Patch Studio License' : 'Maintainer Supporter Pass',
      perks: [
        'Unlocks full git format-patch bundle including unit test suite (test_types.py)',
        'Unlocks downloadable Markdown Diagnostic Report export',
        'Verified Supporter Patron badge on your community reviews + 85% direct creator payout',
      ],
    };
  }
  return {
    headline: isPaidLicense ? 'Full Application License & Patron Perks' : 'Creator Supporter Pass',
    perks: [
      'Unlocks Supporter Overdrive mode and bonus controls in the interactive stage',
      'Grants permanent license receipt in your Firestore Payments Ledger',
      'Sends 85% of your purchase directly to the independent creator',
    ],
  };
}

export const ISSUE_3060_PATCH = `diff --git a/google/genai/_automatic_function_calling_util.py b/google/genai/_automatic_function_calling_util.py
index 8b4d921..c3f91a4 100644
--- a/google/genai/_automatic_function_calling_util.py
+++ b/google/genai/_automatic_function_calling_util.py
@@ -342,6 +342,35 @@ def _add_unevaluated_items_to_fixed_len_tuple_schema(
   return schema
 
 
+def _infer_type_from_any_of(
+    schema_dict: dict[str, Any],
+    defs: Optional[dict[str, Any]] = None,
+) -> str:
+  """Infers a top-level JSON schema type from an anyOf list for Vertex compatibility."""
+  if defs is None:
+    defs = {}
+  member_types: set[str] = set()
+  for member in schema_dict.get('anyOf', []):
+    if not isinstance(member, dict):
+      continue
+    member_type = member.get('type')
+    if isinstance(member_type, list):
+      for t in member_type:
+        if t != 'null':
+          member_types.add(t)
+    elif isinstance(member_type, str):
+      if member_type != 'null':
+        member_types.add(member_type)
+    elif '$ref' in member:
+      ref_key = member['$ref'].split('/')[-1]
+      ref_schema = defs.get(ref_key, {})
+      if 'type' in ref_schema:
+        member_types.add(ref_schema['type'])
+      else:
+        member_types.add('object')
+    elif 'properties' in member:
+      member_types.add('object')
+  if len(member_types) == 1:
+    return next(iter(member_types))
+  return 'object'
+
+
 def parse_function_declaration_json_schema(
     func: Callable[..., Any],
     *,
@@ -379,7 +408,7 @@ def parse_function_declaration_json_schema(
     # Vertex requires 'type' field to be present even when 'anyOf' is present.
     if not 'type' in json_schema_dict and 'anyOf' in json_schema_dict:
-      json_schema_dict['type'] = 'object'
+      json_schema_dict['type'] = _infer_type_from_any_of(json_schema_dict, root_defs)
     json_schema_dict = _add_unevaluated_items_to_fixed_len_tuple_schema(
         json_schema_dict
     )
@@ -437,7 +466,7 @@ def parse_function_declaration_json_schema(
     if (
         not 'type' in return_View_json_schema_dict
         and 'anyOf' in return_View_json_schema_dict
     ):
-      return_View_json_schema_dict['type'] = 'object'
+      return_View_json_schema_dict['type'] = _infer_type_from_any_of(
+          return_View_json_schema_dict, return_defs
+      )
`;

export const BUILT_IN_APPS: PlaygroundAppItem[] = [
  {
    id: 'builtin-starlight-tactics',
    title: 'Starlight Tactics: Sector Zero',
    tagline: 'Turn-based 2D hex-grid starship command with autonomous fleet AI and shield telemetry.',
    description:
      'Command two vanguard corvettes across a 6x5 deep-space sector grid. Balance reactor energy between plasma cannons, warp thrusters, and deflector shields to outmaneuver the autonomous Dreadnought AI. Built with a deterministic game state machine and real-time Web Audio synthesized sound effects.',
    category: 'Game',
    playType: 'starlight-tactics',
    externalUrl: '',
    version: '2.4.0',
    authorId: 'playground-studio',
    authorName: 'Playground Core Studio',
    isPublic: true,
    playsCount: 1420,
    likesCount: 389,
    priceCents: 0,
    monetizationModel: 'Creator Supporter Pass',
    ageRating: 'Everyone 10+ (E10+)',
    dataPrivacyPolicy: 'Zero Data Collected',
    accessibilityFeatures: 'Keyboard + Mouse + High-Contrast',
    aiVisualSummary:
      'Verified 60-30-10 velvet navy arena palette (#0A192F), high-contrast tactical ship tokens, non-hue-only shield & hull bars, and responsive 180ms turn transitions.',
    createdAtLabel: 'Featured Release',
    isBuiltIn: true,
  },
  {
    id: 'builtin-pulsepad-synth',
    title: 'PulsePad Synth & Beat Lab',
    tagline: '16-step polyphonic Web Audio synthesizer, drum machine, and live waveform studio.',
    description:
      'Compose electronic loops directly in the browser using zero-latency Web Audio API oscillators and noise buffers. Features 4 independent tracks (Sub Bass, FM Pluck Lead, Analog Snare, Crisp Hi-Hat), adjustable BPM clock, swing timing, and one-click pattern presets.',
    category: 'Creative App',
    playType: 'pulsepad-synth',
    externalUrl: '',
    version: '1.8.2',
    authorId: 'playground-studio',
    authorName: 'Playground Audio Lab',
    isPublic: true,
    playsCount: 985,
    likesCount: 312,
    priceCents: 499,
    monetizationModel: 'One-Time Purchase',
    ageRating: 'Everyone (E)',
    dataPrivacyPolicy: 'Zero Data Collected',
    accessibilityFeatures: 'Full Controller + Audio Cues',
    aiVisualSummary:
      'Tactile dark-slate hardware matrix with tabular BPM readouts, active step playhead indicator, and accessible 44px pad targets.',
    createdAtLabel: 'Featured Release',
    isBuiltIn: true,
  },
  {
    id: 'builtin-botanica-word',
    title: 'Botanica Word & Tile Sanctuary',
    tagline: 'Accessible large-type botanical word search puzzle with a 4-tier progressive hint engine.',
    description:
      'Designed for unhurried clarity and senior-friendly accessibility. Discover hidden botanical genera across a high-contrast letter matrix using large 48px touch tiles and a 4-tier hint system: Letter Reveal, Orientation Clue, Column Indicator, and First-Letter Highlight.',
    category: 'Game',
    playType: 'botanica-word',
    externalUrl: '',
    version: '1.5.0',
    authorId: 'playground-studio',
    authorName: 'Playground Studio',
    isPublic: true,
    playsCount: 1190,
    likesCount: 428,
    priceCents: 0,
    monetizationModel: 'Free to Play',
    ageRating: 'Everyone (E)',
    dataPrivacyPolicy: 'Zero Data Collected',
    accessibilityFeatures: 'Touch + Screen Reader Friendly',
    aiVisualSummary:
      'WCAG AAA contrast ratios, 48px minimum grid cells, zero countdown stress timers, and explicit 4-stage progressive assistance.',
    createdAtLabel: 'Featured Release',
    isBuiltIn: true,
  },
  {
    id: 'builtin-patchforge-vision',
    title: 'PatchForge & Vision Inspector',
    tagline: 'Multimodal Gemini 4 Argon screenshot analyzer, python-genai #3060 schema sandbox, and .patch generator.',
    description:
      'Inspect the critical googleapis/python-genai Issue #3060 fix (_infer_type_from_any_of for int | None callable tool schemas), test Python type annotations interactively, or upload any screenshot/photo to run Gemini 4 Argon visual diagnostics and export a clean git .patch file.',
    category: 'Developer Tool',
    playType: 'patchforge-vision',
    externalUrl: '',
    version: '3.1.0',
    authorId: 'playground-studio',
    authorName: 'SDK Engineering Guild',
    isPublic: true,
    playsCount: 864,
    likesCount: 295,
    priceCents: 900,
    monetizationModel: 'One-Time Purchase',
    ageRating: 'Everyone (E)',
    dataPrivacyPolicy: 'Zero Data Collected',
    accessibilityFeatures: 'Keyboard + Mouse + High-Contrast',
    aiVisualSummary:
      'Includes verified fix-issue-3060.patch for googleapis/python-genai plus live server-side gemini-4-argon multimodal image understanding.',
    createdAtLabel: 'Featured Release',
    isBuiltIn: true,
  },
];

export function createSampleDiagnosticImage(preset: 'game-ui' | 'python-traceback' | 'synth-app'): {
  dataUrl: string;
  mimeType: string;
  label: string;
  defaultPrompt: string;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    if (preset === 'game-ui') {
      ctx.fillStyle = '#0A192F';
      ctx.fillRect(0, 0, 800, 480);
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2;
      for (let x = 60; x < 740; x += 90) {
        for (let y = 90; y < 410; y += 75) {
          ctx.strokeRect(x, y, 80, 65);
        }
      }
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('STARLIGHT TACTICS // SECTOR 04', 60, 52);
      ctx.fillStyle = '#10B981';
      ctx.font = '18px monospace';
      ctx.fillText('PLAYER HULL: 95/100 · SHIELDS: ACTIVE · AP: 3/3', 60, 445);
      ctx.fillStyle = '#3B82F6';
      ctx.fillRect(155, 170, 70, 55);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('VGR-1', 165, 203);
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(515, 245, 70, 55);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('BOSS', 528, 278);
    } else if (preset === 'python-traceback') {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, 800, 480);
      ctx.fillStyle = '#EF4444';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('Issue #3060: googleapis/python-genai AFC Schema Bug', 40, 55);
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '17px monospace';
      ctx.fillText('def read_file(path: str, start_line: int | None = None):', 40, 110);
      ctx.fillStyle = '#F59E0B';
      ctx.fillText('Generated parameters_json_schema:', 40, 165);
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('"start_line": {', 60, 205);
      ctx.fillText('  "anyOf": [{"type": "integer"}, {"type": "null"}],', 60, 235);
      ctx.fillStyle = '#EF4444';
      ctx.fillText('  "type": "object"  <-- BUG: Causes Gemini to send {}', 60, 265);
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('}', 60, 295);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText('TypeError: int() argument must be a string or number, not dict {}', 40, 360);
      ctx.fillStyle = '#10B981';
      ctx.fillText('Fix: _infer_type_from_any_of(json_schema_dict, root_defs) -> "integer"', 40, 415);
    } else {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, 800, 480);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('ORBITHOP // ZERO-GRAVITY PUZZLE PROTOTYPE', 50, 58);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '18px sans-serif';
      ctx.fillText('Slingshot satellites around planetary gravity wells to reach the relay beacon.', 50, 95);
      ctx.strokeStyle = '#6366F1';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(400, 260, 90, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(400, 260, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10B981';
      ctx.font = '16px monospace';
      ctx.fillText('VELOCITY: 14.2 km/s · ORBIT: STABLE · LEVEL 07', 50, 435);
    }
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    mimeType: 'image/png',
    label:
      preset === 'game-ui'
        ? 'Starlight Tactics HUD Capture'
        : preset === 'python-traceback'
          ? 'Python-GenAI #3060 Schema Bug Capture'
          : 'OrbitHop Game Concept Screenshot',
    defaultPrompt:
      preset === 'python-traceback'
        ? 'Analyze this Python-GenAI #3060 traceback and JSON schema screenshot. Explain the root cause and provide the unified git .patch fix.'
        : 'Analyze this app/game screenshot to suggest publishing metadata (title, tagline, category), visual quality feedback, and an enhancement patch.',
  };
}
