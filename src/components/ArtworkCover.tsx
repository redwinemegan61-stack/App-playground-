import React from 'react';
import { PlayableEngineType, AppCategory } from '../data/defaultApps';

interface ArtworkCoverProps {
  playType: PlayableEngineType;
  category: AppCategory;
  title: string;
  className?: string;
}

export const ArtworkCover: React.FC<ArtworkCoverProps> = ({
  playType,
  category,
  title,
  className = 'h-48 w-full',
}) => {
  if (playType === 'starlight-tactics') {
    return (
      <div
        className={`relative overflow-hidden bg-[#0A192F] flex items-center justify-center select-none ${className}`}
        aria-label={`${title} tactical space artwork`}
      >
        <svg
          viewBox="0 0 400 260"
          className="w-full h-full object-cover"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="400" height="260" fill="#0A192F" />
          {/* Tactical Grid */}
          <g stroke="#1E3A5F" strokeWidth="1" opacity="0.7">
            <line x1="0" y1="52" x2="400" y2="52" />
            <line x1="0" y1="104" x2="400" y2="104" />
            <line x1="0" y1="156" x2="400" y2="156" />
            <line x1="0" y1="208" x2="400" y2="208" />
            <line x1="80" y1="0" x2="80" y2="260" />
            <line x1="160" y1="0" x2="160" y2="260" />
            <line x1="240" y1="0" x2="240" y2="260" />
            <line x1="320" y1="0" x2="320" y2="260" />
          </g>
          {/* Orbit Rings */}
          <circle cx="200" cy="130" r="88" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.45" />
          <circle cx="200" cy="130" r="46" stroke="#F59E0B" strokeWidth="1.5" opacity="0.4" />
          {/* Player Vanguard Ship */}
          <g transform="translate(105, 112)">
            <polygon points="0,18 38,0 28,18 38,36" fill="#3B82F6" stroke="#93C5FD" strokeWidth="1.5" />
          </g>
          {/* Laser Trajectory */}
          <line x1="145" y1="130" x2="255" y2="130" stroke="#F59E0B" strokeWidth="2.5" strokeDasharray="4 4" />
          {/* Enemy Dreadnought */}
          <g transform="translate(260, 106)">
            <polygon points="44,24 0,4 12,24 0,44" fill="#DC2626" stroke="#FCA5A5" strokeWidth="1.5" />
          </g>
          <text x="20" y="240" fill="#93C5FD" fontFamily="JetBrains Mono, monospace" fontSize="11">
            SECTOR 04 · TURN-BASED FLEET STRATEGY
          </text>
        </svg>
      </div>
    );
  }

  if (playType === 'pulsepad-synth') {
    return (
      <div
        className={`relative overflow-hidden bg-[#12161F] flex items-center justify-center select-none ${className}`}
        aria-label={`${title} synthesizer matrix artwork`}
      >
        <svg
          viewBox="0 0 400 260"
          className="w-full h-full object-cover"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="400" height="260" fill="#12161F" />
          {/* Step Sequencer Matrix */}
          {[0, 1, 2, 3].map((row) =>
            [0, 1, 2, 3, 4, 5, 6, 7].map((col) => {
              const isLit =
                (row === 0 && (col === 0 || col === 4)) ||
                (row === 1 && (col === 2 || col === 5 || col === 7)) ||
                (row === 2 && (col === 2 || col === 6)) ||
                (row === 3 && col % 2 === 1);
              const colors = ['#6366F1', '#10B981', '#F59E0B', '#38BDF8'];
              return (
                <rect
                  key={`${row}-${col}`}
                  x={44 + col * 40}
                  y={42 + row * 38}
                  width="30"
                  height="28"
                  rx="4"
                  fill={isLit ? colors[row] : '#1E293B'}
                  stroke={isLit ? '#F8FAFC' : '#334155'}
                  strokeWidth={isLit ? '1.2' : '1'}
                />
              );
            })
          )}
          <text x="44" y="232" fill="#94A3B8" fontFamily="JetBrains Mono, monospace" fontSize="11">
            16-STEP POLYPHONIC SEQUENCER · 124 BPM
          </text>
        </svg>
      </div>
    );
  }

  if (playType === 'botanica-word') {
    return (
      <div
        className={`relative overflow-hidden bg-[#0F2922] flex items-center justify-center select-none ${className}`}
        aria-label={`${title} word puzzle artwork`}
      >
        <svg
          viewBox="0 0 400 260"
          className="w-full h-full object-cover"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="400" height="260" fill="#0F2922" />
          {['F', 'E', 'R', 'N', 'L', 'I', 'L', 'Y'].map((letter, idx) => {
            const col = idx % 4;
            const row = Math.floor(idx / 4);
            const active = row === 0;
            return (
              <g key={idx} transform={`translate(${92 + col * 56}, ${56 + row * 60})`}>
                <rect
                  width="46"
                  height="46"
                  rx="6"
                  fill={active ? '#10B981' : '#163B31'}
                  stroke={active ? '#A7F3D0' : '#2D5A4C'}
                  strokeWidth="1.5"
                />
                <text
                  x="23"
                  y="30"
                  textAnchor="middle"
                  fill={active ? '#06221A' : '#E2E8F0'}
                  fontFamily="Plus Jakarta Sans, sans-serif"
                  fontWeight="700"
                  fontSize="20"
                >
                  {letter}
                </text>
              </g>
            );
          })}
          <text x="92" y="226" fill="#A7F3D0" fontFamily="JetBrains Mono, monospace" fontSize="11">
            LARGE-TYPE ACCESSIBLE WORD SANCTUARY
          </text>
        </svg>
      </div>
    );
  }

  if (playType === 'patchforge-vision') {
    return (
      <div
        className={`relative overflow-hidden bg-[#0F172A] flex items-center justify-center select-none ${className}`}
        aria-label={`${title} developer vision studio artwork`}
      >
        <svg
          viewBox="0 0 400 260"
          className="w-full h-full object-cover"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="400" height="260" fill="#0F172A" />
          <rect x="28" y="28" width="344" height="176" rx="6" fill="#090D16" stroke="#334155" strokeWidth="1.2" />
          <rect x="42" y="52" width="316" height="24" rx="3" fill="#451A1C" />
          <text x="52" y="68" fill="#FCA5A5" fontFamily="JetBrains Mono, monospace" fontSize="11">
            - json_schema_dict[&apos;type&apos;] = &apos;object&apos;
          </text>
          <rect x="42" y="84" width="316" height="24" rx="3" fill="#0E3A2F" />
          <text x="52" y="100" fill="#6EE7B7" fontFamily="JetBrains Mono, monospace" fontSize="11">
            + json_schema_dict[&apos;type&apos;] = _infer_type_from_any_of(...)
          </text>
          <text x="42" y="138" fill="#94A3B8" fontFamily="JetBrains Mono, monospace" fontSize="11">
            Issue #3060 · googleapis/python-genai
          </text>
          <text x="42" y="162" fill="#818CF8" fontFamily="JetBrains Mono, monospace" fontSize="11">
            Gemini 4 Argon Visual Debugger Ready
          </text>
          <text x="28" y="232" fill="#94A3B8" fontFamily="JetBrains Mono, monospace" fontSize="11">
            PATCH STUDIO &amp; MULTIMODAL INSPECTOR
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-[#131B2E] flex items-center justify-center select-none ${className}`}
      aria-label={`${title} ${category} cover`}
    >
      <svg
        viewBox="0 0 400 260"
        className="w-full h-full object-cover"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="400" height="260" fill="#131B2E" />
        <circle cx="200" cy="115" r="54" fill="#1E293B" stroke="#6366F1" strokeWidth="2" />
        <polygon points="188,95 224,115 188,135" fill="#818CF8" />
        <text
          x="200"
          y="206"
          textAnchor="middle"
          fill="#F8FAFC"
          fontFamily="Plus Jakarta Sans, sans-serif"
          fontWeight="600"
          fontSize="15"
        >
          {title.slice(0, 28)}
        </text>
        <text
          x="200"
          y="228"
          textAnchor="middle"
          fill="#94A3B8"
          fontFamily="JetBrains Mono, monospace"
          fontSize="11"
        >
          {category.toUpperCase()} · COMMUNITY BUILD
        </text>
      </svg>
    </div>
  );
};
