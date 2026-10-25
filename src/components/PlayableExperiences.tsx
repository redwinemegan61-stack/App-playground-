import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Shield,
  Crosshair,
  HelpCircle,
  Download,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { PlaygroundAppItem, ISSUE_3060_PATCH } from '../data/defaultApps';

type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'ROUND_SUMMARY' | 'GAME_OVER';

// Web Audio Synthesizer helper for crisp UI & game audio feedback
function playSynthTone(freq: number, durationMs: number, type: OscillatorType = 'sine', gainLevel = 0.08) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainLevel, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, durationMs + 100);
  } catch {
    // Ignore audio errors if blocked by browser autoplay policy
  }
}

// ============================================================================
// 1. STARLIGHT TACTICS (Turn-Based 2D Space Strategy Game)
// ============================================================================
interface ShipUnit {
  id: string;
  name: string;
  team: 'player' | 'ai';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
}

const INITIAL_UNITS: ShipUnit[] = [
  { id: 'p1', name: 'Vanguard-01', team: 'player', x: 0, y: 1, hp: 100, maxHp: 100, shield: 30 },
  { id: 'p2', name: 'Aegis-02', team: 'player', x: 0, y: 3, hp: 100, maxHp: 100, shield: 40 },
  { id: 'ai1', name: 'Raider-Alpha', team: 'ai', x: 5, y: 1, hp: 90, maxHp: 90, shield: 20 },
  { id: 'ai2', name: 'Dreadnought-Omega', team: 'ai', x: 5, y: 3, hp: 130, maxHp: 130, shield: 30 },
];

export const StarlightTacticsGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [units, setUnits] = useState<ShipUnit[]>(INITIAL_UNITS);
  const [selectedId, setSelectedId] = useState<string>('p1');
  const [turn, setTurn] = useState<'player' | 'ai'>('player');
  const [actionPoints, setActionPoints] = useState<number>(3);
  const [roundNum, setRoundNum] = useState<number>(1);
  const [combatLog, setCombatLog] = useState<string[]>([
    'Sector 04 initialized. Select a friendly corvette and move or fire lasers.',
  ]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const startNewGame = () => {
    setUnits(INITIAL_UNITS.map((u) => ({ ...u })));
    setSelectedId('p1');
    setTurn('player');
    setActionPoints(3);
    setRoundNum(1);
    setCombatLog(['Command link established. 3 Action Points available this turn.']);
    setGameState('PLAYING');
    if (soundEnabled) playSynthTone(523.25, 180, 'triangle');
  };

  const selectedUnit = units.find((u) => u.id === selectedId && u.hp > 0);
  const playerAlive = units.filter((u) => u.team === 'player' && u.hp > 0);
  const aiAlive = units.filter((u) => u.team === 'ai' && u.hp > 0);

  // Trigger AI turn automatically when turn === 'ai'
  useEffect(() => {
    if (gameState !== 'PLAYING' || turn !== 'ai') return;

    const timer = setTimeout(() => {
      setUnits((prev) => {
        const next = prev.map((u) => ({ ...u }));
        const aiShips = next.filter((u) => u.team === 'ai' && u.hp > 0);
        const pShips = next.filter((u) => u.team === 'player' && u.hp > 0);
        if (aiShips.length === 0 || pShips.length === 0) return next;

        const logs: string[] = [];
        for (const ai of aiShips) {
          // Find nearest player ship
          let target = pShips[0];
          let bestDist = Math.abs(ai.x - target.x) + Math.abs(ai.y - target.y);
          for (const p of pShips) {
            const d = Math.abs(ai.x - p.x) + Math.abs(ai.y - p.y);
            if (d < bestDist) {
              bestDist = d;
              target = p;
            }
          }

          if (bestDist <= 2) {
            // Fire at player target
            const dmg = 28;
            const absorbed = Math.min(target.shield, dmg);
            target.shield -= absorbed;
            target.hp = Math.max(0, target.hp - (dmg - absorbed));
            logs.push(`${ai.name} fired plasma volley at ${target.name} (-${dmg} DMG).`);
          } else {
            // Step closer
            const dx = target.x < ai.x ? -1 : target.x > ai.x ? 1 : 0;
            const dy = target.y < ai.y ? -1 : target.y > ai.y ? 1 : 0;
            const nx = Math.max(0, Math.min(5, ai.x + dx));
            const ny = Math.max(0, Math.min(4, ai.y + dy));
            const occupied = next.some((u) => u.hp > 0 && u.x === nx && u.y === ny);
            if (!occupied) {
              ai.x = nx;
              ai.y = ny;
              logs.push(`${ai.name} maneuvered to grid (${nx + 1}, ${ny + 1}).`);
            }
          }
        }

        const remainingPlayers = next.filter((u) => u.team === 'player' && u.hp > 0);
        if (remainingPlayers.length === 0) {
          setGameState('GAME_OVER');
        } else {
          setTurn('player');
          setActionPoints(3);
          setRoundNum((r) => r + 1);
          if ( !next.find((u) => u.id === selectedId && u.hp > 0) ) {
            setSelectedId(remainingPlayers[0].id);
          }
        }
        if (logs.length > 0) {
          setCombatLog((old) => [...logs, ...old].slice(0, 6));
        }
        return next;
      });
      if (soundEnabled) playSynthTone(220, 200, 'sawtooth');
    }, 650);

    return () => clearTimeout(timer);
  }, [gameState, turn, selectedId, soundEnabled]);

  const handleCellClick = (x: number, y: number) => {
    if (gameState !== 'PLAYING' || turn !== 'player') return;

    const clickedUnit = units.find((u) => u.hp > 0 && u.x === x && u.y === y);

    if (clickedUnit && clickedUnit.team === 'player') {
      setSelectedId(clickedUnit.id);
      if (soundEnabled) playSynthTone(440, 90, 'sine');
      return;
    }

    if (!selectedUnit || actionPoints <= 0) return;

    const dist = Math.abs(selectedUnit.x - x) + Math.abs(selectedUnit.y - y);

    // Attack enemy within range 2
    if (clickedUnit && clickedUnit.team === 'ai') {
      if (dist <= 2) {
        const dmg = 35;
        setUnits((prev) => {
          const next = prev.map((u) => {
            if (u.id !== clickedUnit.id) return u;
            const absorbed = Math.min(u.shield, dmg);
            const remDmg = dmg - absorbed;
            return {
              ...u,
              shield: u.shield - absorbed,
              hp: Math.max(0, u.hp - remDmg),
            };
          });
          const anyAiLeft = next.some((u) => u.team === 'ai' && u.hp > 0);
          if (!anyAiLeft) {
            setGameState('GAME_OVER');
          }
          return next;
        });
        setCombatLog((old) =>
          [`${selectedUnit.name} struck ${clickedUnit.name} for ${dmg} laser damage!`, ...old].slice(0, 6)
        );
        if (soundEnabled) playSynthTone(660, 160, 'square');
        const nextAp = actionPoints - 1;
        setActionPoints(nextAp);
        if (nextAp === 0) setTurn('ai');
      } else {
        setCombatLog((old) => [`Target out of range (Dist: ${dist}, Max Fire Range: 2).`, ...old].slice(0, 6));
      }
      return;
    }

    // Move to empty adjacent cell
    if (!clickedUnit && dist === 1) {
      setUnits((prev) =>
        prev.map((u) => (u.id === selectedUnit.id ? { ...u, x, y } : u))
      );
      setCombatLog((old) =>
        [`${selectedUnit.name} thrusters engaged -> Sector (${x + 1}, ${y + 1}).`, ...old].slice(0, 6)
      );
      if (soundEnabled) playSynthTone(330, 110, 'triangle');
      const nextAp = actionPoints - 1;
      setActionPoints(nextAp);
      if (nextAp === 0) setTurn('ai');
    }
  };

  const handleBoostShields = () => {
    if (gameState !== 'PLAYING' || turn !== 'player' || !selectedUnit || actionPoints <= 0) return;
    setUnits((prev) =>
      prev.map((u) => (u.id === selectedUnit.id ? { ...u, shield: Math.min(60, u.shield + 20) } : u))
    );
    setCombatLog((old) => [`${selectedUnit.name} boosted deflector shields (+20 SHD).`, ...old].slice(0, 6));
    if (soundEnabled) playSynthTone(587.33, 150, 'sine');
    const nextAp = actionPoints - 1;
    setActionPoints(nextAp);
    if (nextAp === 0) setTurn('ai');
  };

  if (gameState === 'TITLE_MENU') {
    return (
      <div className="bg-[#0A192F] border border-slate-800 rounded-xl p-8 text-center space-y-6">
        <div className="space-y-2 max-w-xl mx-auto">
          <p className="text-xs font-mono text-sky-400">2D TACTICAL FLEET COMMAND · STATE MACHINE VERIFIED</p>
          <h3 className="text-2xl font-bold font-display text-white">Starlight Tactics: Sector Zero</h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            Command two vanguard starships on a 6×5 sector grid. Each turn grants 3 Action Points (AP). Click an adjacent
            tile (distance 1) to maneuver, click a hostile vessel within range 2 to fire plasma cannons, or recharge
            deflector shields.
          </p>
        </div>
        <div className="flex justify-center gap-4">
          <button
            onClick={startNewGame}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            Start Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0A192F] border border-slate-800 rounded-xl p-5 space-y-4">
      {/* Unobtrusive Top HUD */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
          <span className="text-slate-300">ROUND {roundNum}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className={turn === 'player' ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
            {turn === 'player' ? `PLAYER TURN (AP: ${actionPoints}/3)` : 'AI FLEET MANEUVERING...'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900/80 border border-slate-700 rounded-md hover:text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {soundEnabled ? 'Audio On' : 'Muted'}
          </button>
          <button
            onClick={handleBoostShields}
            disabled={turn !== 'player' || actionPoints <= 0 || !selectedUnit}
            className="px-3 py-1.5 text-xs font-medium text-sky-200 bg-sky-950/80 border border-sky-700/60 rounded-md hover:bg-sky-900 disabled:opacity-40 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            Boost Shield (1 AP)
          </button>
          <button
            onClick={() => {
              if (turn === 'player') setTurn('ai');
            }}
            disabled={turn !== 'player'}
            className="px-3 py-1.5 text-xs font-medium text-amber-200 bg-amber-950/70 border border-amber-700/60 rounded-md hover:bg-amber-900 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            End Turn
          </button>
          <button
            onClick={startNewGame}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-700 rounded-md hover:text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* 6x5 Tactical Grid */}
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 5 }).map((_, y) =>
          Array.from({ length: 6 }).map((__, x) => {
            const unit = units.find((u) => u.hp > 0 && u.x === x && u.y === y);
            const isSelected = unit && unit.id === selectedId;
            const distFromSelected = selectedUnit ? Math.abs(selectedUnit.x - x) + Math.abs(selectedUnit.y - y) : 99;
            const canMoveHere = !unit && turn === 'player' && actionPoints > 0 && distFromSelected === 1;
            const canAttackHere =
              unit && unit.team === 'ai' && turn === 'player' && actionPoints > 0 && distFromSelected <= 2;

            return (
              <button
                key={`${x}-${y}`}
                onClick={() => handleCellClick(x, y)}
                className={`h-20 rounded-lg border p-2 flex flex-col justify-between text-left transition-transform duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-sky-950/90 border-sky-400 scale-[1.02]'
                    : canAttackHere
                      ? 'bg-rose-950/60 border-rose-500 hover:bg-rose-900/70'
                      : canMoveHere
                        ? 'bg-emerald-950/30 border-emerald-500/60 hover:bg-emerald-900/40'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full text-[11px] font-mono text-slate-400 tabular-nums">
                  <span>
                    {x + 1},{y + 1}
                  </span>
                  {canAttackHere && <Crosshair className="w-3.5 h-3.5 text-rose-400" />}
                </div>
                {unit ? (
                  <div className="space-y-0.5">
                    <div
                      className={`text-xs font-semibold truncate ${
                        unit.team === 'player' ? 'text-sky-300' : 'text-rose-300'
                      }`}
                    >
                      {unit.name}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-300">
                      HP {unit.hp}/{unit.maxHp} · SHD {unit.shield}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-slate-600">
                    {canMoveHere ? 'MOVE (1 AP)' : 'OPEN'}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Combat Telemetry & Victory/Defeat Overlay */}
      {gameState === 'GAME_OVER' ? (
        <div className="bg-slate-900 border border-indigo-500/50 rounded-lg p-5 flex items-center justify-between">
          <div>
            <h4 className="text-base font-bold text-white">
              {aiAlive.length === 0 ? 'Sector Secured — Victory!' : 'Vanguard Fleet Lost — Mission Over'}
            </h4>
            <p className="text-xs text-slate-300 mt-1">
              Completed in {roundNum} rounds · Friendly vessels remaining: {playerAlive.length}
            </p>
          </div>
          <button
            onClick={startNewGame}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Play Again
          </button>
        </div>
      ) : (
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">TACTICAL COMBAT LOG</div>
          {combatLog.slice(0, 3).map((entry, idx) => (
            <div key={idx} className="text-xs font-mono text-slate-300 truncate">
              {entry}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. PULSEPADS SYNTH & BEAT LAB (16-Step Web Audio Sequencer)
// ============================================================================
const TRACK_INFO = [
  { name: 'Sub Bass (C2)', freq: 65.41, wave: 'sawtooth' as OscillatorType, color: 'bg-indigo-500 border-indigo-300' },
  { name: 'FM Pluck (G4)', freq: 392.0, wave: 'triangle' as OscillatorType, color: 'bg-emerald-500 border-emerald-300' },
  { name: 'Synth Lead (D#4)', freq: 311.13, wave: 'square' as OscillatorType, color: 'bg-amber-500 border-amber-300' },
  { name: 'Crisp Pulse (A5)', freq: 880.0, wave: 'sine' as OscillatorType, color: 'bg-sky-500 border-sky-300' },
];

const INITIAL_GRID: boolean[][] = [
  [true, false, false, true, true, false, false, false, true, false, true, false, true, false, false, false],
  [false, false, true, false, false, true, false, true, false, false, true, false, false, true, false, true],
  [false, false, false, false, true, false, false, false, false, false, false, false, true, false, true, false],
  [true, true, false, true, true, false, true, true, true, true, false, true, true, false, true, true],
];

export const PulsePadSynthApp: React.FC = () => {
  const [grid, setGrid] = useState<boolean[][]>(INITIAL_GRID);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(120);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  useEffect(() => {
    if (!isPlaying) return;
    const stepMs = (60 / bpm / 4) * 1000;
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        const nextStep = (prev + 1) % 16;
        TRACK_INFO.forEach((track, rowIdx) => {
          if (gridRef.current[rowIdx][nextStep]) {
            playSynthTone(track.freq, 130, track.wave, 0.06);
          }
        });
        return nextStep;
      });
    }, stepMs);
    return () => clearInterval(interval);
  }, [isPlaying, bpm]);

  const togglePad = (row: number, col: number) => {
    setGrid((prev) =>
      prev.map((r, rIdx) => (rIdx === row ? r.map((cell, cIdx) => (cIdx === col ? !cell : cell)) : r))
    );
    playSynthTone(TRACK_INFO[row].freq, 110, TRACK_INFO[row].wave, 0.06);
  };

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              isPlaying ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            {isPlaying ? 'Stop Sequencer' : 'Start Sequencer'}
          </button>
          <button
            onClick={() => setGrid(INITIAL_GRID.map((r) => [...r]))}
            className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-700 rounded-lg hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reset Pattern
          </button>
          <button
            onClick={() => setGrid(TRACK_INFO.map(() => Array(16).fill(false)))}
            className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-700 rounded-lg hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Clear Grid
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-mono text-slate-300 tabular-nums">
            TEMPO: {bpm} BPM
          </label>
          <input
            type="range"
            min={80}
            max={160}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-28 accent-indigo-500 cursor-pointer"
          />
        </div>
      </div>

      <div className="space-y-3 overflow-x-auto pb-2">
        {TRACK_INFO.map((track, rowIdx) => (
          <div key={track.name} className="flex items-center gap-3 min-w-[680px]">
            <div className="w-36 text-xs font-mono text-slate-300 shrink-0 truncate">{track.name}</div>
            <div className="grid grid-cols-16 gap-1.5 flex-1">
              {grid[rowIdx].map((active, colIdx) => {
                const isPlayhead = isPlaying && currentStep === colIdx;
                return (
                  <button
                    key={colIdx}
                    onClick={() => togglePad(rowIdx, colIdx)}
                    aria-label={`${track.name} Step ${colIdx + 1}`}
                    className={`h-10 rounded-md border transition-transform duration-100 cursor-pointer ${
                      active
                        ? `${track.color} scale-[1.03]`
                        : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                    } ${isPlayhead ? 'ring-2 ring-white' : ''}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 3. BOTANICA WORD & TILE SANCTUARY (Accessible Word Search with 4-Tier Hints)
// ============================================================================
interface WordTarget {
  word: string;
  row: number;
  col: number;
  direction: 'Horizontal' | 'Vertical';
  clue: string;
}

const BOTANICAL_WORDS: WordTarget[] = [
  { word: 'FERN', row: 0, col: 1, direction: 'Horizontal', clue: 'Ancient shade-loving vascular plant with fronds' },
  { word: 'LOTUS', row: 2, col: 2, direction: 'Horizontal', clue: 'Sacred aquatic blossom rising from calm ponds' },
  { word: 'SAGE', row: 4, col: 0, direction: 'Horizontal', clue: 'Aromatic perennial herb with silvery-green leaves' },
  { word: 'MOSS', row: 5, col: 3, direction: 'Horizontal', clue: 'Soft emerald carpet thriving on forest stones' },
];

const PUZZLE_GRID: string[][] = [
  ['B', 'F', 'E', 'R', 'N', 'P', 'K'],
  ['O', 'L', 'A', 'V', 'E', 'N', 'D'],
  ['T', 'O', 'L', 'O', 'T', 'U', 'S'],
  ['A', 'R', 'O', 'S', 'E', 'L', 'I'],
  ['S', 'A', 'G', 'E', 'M', 'I', 'N'],
  ['C', 'L', 'E', 'M', 'O', 'S', 'S'],
];

export const BotanicaWordGame: React.FC = () => {
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [hintTier, setHintTier] = useState<number>(0);

  const activeTarget = BOTANICAL_WORDS.find((w) => !foundWords.includes(w.word)) || BOTANICAL_WORDS[0];

  const toggleCell = useCallback(
    (r: number, c: number) => {
      const key = `${r}-${c}`;
      setSelectedCells((prev) => {
        const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
        // Check if any target word is completely selected
        for (const target of BOTANICAL_WORDS) {
          if (foundWords.includes(target.word)) continue;
          const targetKeys = Array.from({ length: target.word.length }).map((_, idx) =>
            target.direction === 'Horizontal' ? `${target.row}-${target.col + idx}` : `${target.row + idx}-${target.col}`
          );
          if (targetKeys.every((tk) => next.includes(tk))) {
            setFoundWords((fw) => (fw.includes(target.word) ? fw : [...fw, target.word]));
            playSynthTone(587.33, 220, 'sine');
          }
        }
        return next;
      });
    },
    [foundWords]
  );

  const resetPuzzle = () => {
    setFoundWords([]);
    setSelectedCells([]);
    setHintTier(0);
  };

  return (
    <div className="bg-[#0F2922] border border-emerald-900/70 rounded-xl p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-emerald-900/70">
        <div>
          <h4 className="text-base font-bold text-white">Botanica Word &amp; Tile Sanctuary</h4>
          <p className="text-xs text-emerald-200/80">
            Click letter tiles to highlight hidden botanical names ({foundWords.length}/{BOTANICAL_WORDS.length} found)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHintTier((t) => (t % 4) + 1)}
            className="px-3.5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Progressive Hint (Tier {hintTier}/4)
          </button>
          <button
            onClick={resetPuzzle}
            className="px-3 py-2 text-xs font-medium text-emerald-100 bg-emerald-950 border border-emerald-800 rounded-lg hover:bg-emerald-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reset Board
          </button>
        </div>
      </div>

      {/* 4-Tier Progressive Hint Banner */}
      {hintTier > 0 && (
        <div className="bg-emerald-950/90 border border-emerald-700/70 rounded-lg p-3 text-xs text-emerald-100 space-y-1">
          <div className="font-mono font-semibold text-emerald-300">
            ACTIVE HINT FOR &ldquo;{activeTarget.word}&rdquo; — TIER {hintTier} OF 4
          </div>
          {hintTier >= 1 && <div>1. First &amp; Last Letters: Starts with &ldquo;{activeTarget.word[0]}&rdquo;, ends with &ldquo;{activeTarget.word[activeTarget.word.length - 1]}&rdquo; ({activeTarget.clue})</div>}
          {hintTier >= 2 && <div>2. Orientation Clue: Arranged {activeTarget.direction}ly across row {activeTarget.row + 1}</div>}
          {hintTier >= 3 && <div>3. Column Indicator: Begins at Column {activeTarget.col + 1}</div>}
          {hintTier >= 4 && <div>4. First Letter Highlighted on Board: Tile ({activeTarget.row + 1}, {activeTarget.col + 1}) is outlined in gold</div>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 grid grid-cols-7 gap-2">
          {PUZZLE_GRID.map((rowLetters, rIdx) =>
            rowLetters.map((letter, cIdx) => {
              const key = `${rIdx}-${cIdx}`;
              const isSelected = selectedCells.includes(key);
              const isFirstLetterHint =
                hintTier >= 4 && activeTarget.row === rIdx && activeTarget.col === cIdx;

              return (
                <button
                  key={key}
                  onClick={() => toggleCell(rIdx, cIdx)}
                  className={`h-12 rounded-lg font-display text-lg font-bold transition-transform duration-100 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-400 text-emerald-950 scale-[1.03]'
                      : isFirstLetterHint
                        ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-200'
                        : 'bg-[#163B31] text-white border border-emerald-800/80 hover:border-emerald-500'
                  }`}
                >
                  {letter}
                </button>
              );
            })
          )}
        </div>

        <div className="lg:col-span-5 bg-emerald-950/60 border border-emerald-800/60 rounded-lg p-4 space-y-3">
          <div className="text-xs font-mono text-emerald-300">BOTANICAL SPECIMEN LIST</div>
          {BOTANICAL_WORDS.map((item) => {
            const isFound = foundWords.includes(item.word);
            return (
              <div
                key={item.word}
                className="flex items-start justify-between gap-2 pb-2 border-b border-emerald-900/60 last:border-none"
              >
                <div>
                  <div className={`text-sm font-bold ${isFound ? 'line-through text-emerald-400' : 'text-white'}`}>
                    {item.word}
                  </div>
                  <div className="text-xs text-emerald-200/70">{item.clue}</div>
                </div>
                <span className="text-xs font-mono text-emerald-300 tabular-nums shrink-0">
                  {isFound ? 'FOUND' : `${item.word.length} LETTERS`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. PATCHFORGE & VISION INSPECTOR (Issue #3060 Sandbox + .patch Exporter)
// ============================================================================
const SCHEMA_TEST_CASES = [
  {
    signature: 'start_line: int | None = None',
    buggySchema: '{"anyOf": [{"type": "integer"}, {"type": "null"}], "type": "object"}',
    fixedSchema: '{"anyOf": [{"type": "integer"}, {"type": "null"}], "type": "integer"}',
    runtimeEffect: 'Pre-fix: Gemini sends {} causing TypeError. Post-fix: Gemini sends int or null.',
  },
  {
    signature: 'query: str | None = None',
    buggySchema: '{"anyOf": [{"type": "string"}, {"type": "null"}], "type": "object"}',
    fixedSchema: '{"anyOf": [{"type": "string"}, {"type": "null"}], "type": "string"}',
    runtimeEffect: 'Pre-fix: Gemini sends {} instead of string. Post-fix: Inferred as "string".',
  },
  {
    signature: 'tags: list[str] | None = None',
    buggySchema: '{"anyOf": [{"type": "array", "items": {"type": "string"}}, {"type": "null"}], "type": "object"}',
    fixedSchema: '{"anyOf": [{"type": "array", "items": {"type": "string"}}, {"type": "null"}], "type": "array"}',
    runtimeEffect: 'Pre-fix: Top-level type forced to "object". Post-fix: Inferred as "array".',
  },
  {
    signature: 'color: ColorEnum | None = None',
    buggySchema: '{"anyOf": [{"$ref": "#/$defs/ColorEnum"}, {"type": "null"}], "type": "object"}',
    fixedSchema: '{"anyOf": [{"$ref": "#/$defs/ColorEnum"}, {"type": "null"}], "type": "string"}',
    runtimeEffect: 'Resolves $ref against root_defs to infer underlying enum type "string".',
  },
];

export const PatchForgeVisionApp: React.FC<{ onOpenVisionTab?: () => void }> = ({ onOpenVisionTab }) => {
  const [selectedCaseIdx, setSelectedCaseIdx] = useState<number>(0);
  const [copiedPatch, setCopiedPatch] = useState<boolean>(false);

  const activeCase = SCHEMA_TEST_CASES[selectedCaseIdx];

  const handleDownloadPatch = () => {
    const blob = new Blob([ISSUE_3060_PATCH], { type: 'text/x-patch;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fix-issue-3060.patch';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyPatch = () => {
    navigator.clipboard.writeText(ISSUE_3060_PATCH);
    setCopiedPatch(true);
    setTimeout(() => setCopiedPatch(false), 2000);
  };

  return (
    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div>
          <div className="text-xs font-mono text-indigo-400">
            googleapis/python-genai · ISSUE #3060 VERIFIED PATCH
          </div>
          <h4 className="text-base font-bold text-white mt-0.5">
            Callable Tools Optional Scalar Parameter Schema Sandbox &amp; Diff Viewer
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {onOpenVisionTab && (
            <button
              onClick={onOpenVisionTab}
              className="px-3.5 py-2 text-xs font-semibold text-indigo-200 bg-indigo-950/90 border border-indigo-700/70 rounded-lg hover:bg-indigo-900 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Analyze Screenshot with Gemini 4 Argon
            </button>
          )}
          <button
            onClick={handleCopyPatch}
            className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedPatch ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedPatch ? 'Copied .patch' : 'Copy .patch'}
          </button>
          <button
            onClick={handleDownloadPatch}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download fix-issue-3060.patch
          </button>
        </div>
      </div>

      {/* Interactive Signature Selector */}
      <div className="space-y-3">
        <div className="text-xs font-mono text-slate-400">
          SELECT PYTHON PARAMETER SIGNATURE TO COMPARE GENERATED JSON SCHEMA:
        </div>
        <div className="flex flex-wrap gap-2">
          {SCHEMA_TEST_CASES.map((tc, idx) => (
            <button
              key={tc.signature}
              onClick={() => setSelectedCaseIdx(idx)}
              className={`px-3 py-1.5 text-xs font-mono rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCaseIdx === idx
                  ? 'bg-indigo-600/20 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tc.signature}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-rose-950/25 border border-rose-900/60 rounded-lg p-3.5 space-y-1.5">
            <div className="text-xs font-mono text-rose-400 font-semibold">
              BEFORE PATCH (Hardcoded &quot;type&quot;: &quot;object&quot;)
            </div>
            <pre className="text-xs font-mono text-rose-200 overflow-x-auto whitespace-pre-wrap">
              {activeCase.buggySchema}
            </pre>
          </div>
          <div className="bg-emerald-950/25 border border-emerald-900/60 rounded-lg p-3.5 space-y-1.5">
            <div className="text-xs font-mono text-emerald-400 font-semibold">
              AFTER PATCH (_infer_type_from_any_of)
            </div>
            <pre className="text-xs font-mono text-emerald-200 overflow-x-auto whitespace-pre-wrap">
              {activeCase.fixedSchema}
            </pre>
          </div>
        </div>
        <div className="text-xs text-slate-300 font-mono bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2">
          Impact: {activeCase.runtimeEffect}
        </div>
      </div>

      {/* Unified Diff Viewer */}
      <div className="bg-[#090D16] border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs font-mono text-slate-400 flex items-center justify-between">
          <span>google/genai/_automatic_function_calling_util.py</span>
          <span>UNIFIED GIT DIFF</span>
        </div>
        <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto max-h-64 text-slate-300">
          {ISSUE_3060_PATCH}
        </pre>
      </div>
    </div>
  );
};

// ============================================================================
// 5. UNIFIED EXPERIENCE LAUNCHER
// ============================================================================
export const PlayableStage: React.FC<{
  app: PlaygroundAppItem;
  onOpenVisionTab?: () => void;
}> = ({ app, onOpenVisionTab }) => {
  if (app.playType === 'starlight-tactics') {
    return <StarlightTacticsGame />;
  }
  if (app.playType === 'pulsepad-synth') {
    return <PulsePadSynthApp />;
  }
  if (app.playType === 'botanica-word') {
    return <BotanicaWordGame />;
  }
  if (app.playType === 'patchforge-vision') {
    return <PatchForgeVisionApp onOpenVisionTab={onOpenVisionTab} />;
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-8 text-center space-y-4">
      <div className="text-xs font-mono text-indigo-400">
        COMMUNITY PUBLISHED EXPERIENCE · VERSION {app.version}
      </div>
      <h4 className="text-xl font-bold text-white">{app.title}</h4>
      <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">{app.description}</p>
      {app.externalUrl ? (
        <div className="pt-2">
          <a
            href={app.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
            Open External Web Build ({app.externalUrl})
          </a>
        </div>
      ) : (
        <div className="pt-2">
          <StarlightTacticsGame />
        </div>
      )}
    </div>
  );
};
