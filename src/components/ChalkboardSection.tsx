import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  Check,
  Eraser,
  Pencil,
  RotateCcw,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { CHALK_COLORS } from '../config/coupleConfig';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ChalkboardData, ChalkColorId, PartnerProfile } from '../types/couple';
import { compressCanvasElement } from '../utils/imageCompression';

const QUICK_EMOJIS = ['❤️', '🥺', '✨', '🫂', '☕️', '🌙', '🍓', '💤'];

function formatUpdatedAt(ts: ChalkboardData['updatedAt']): string {
  if (!ts) return '尚未留下訊息';
  let date: Date | null = null;
  if (ts instanceof Date) {
    date = ts;
  } else if (typeof ts === 'object' && 'seconds' in ts) {
    date = new Date(ts.seconds * 1000);
  }
  if (!date) return '剛剛更新';
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${m}/${d} ${hh}:${mm}`;
}

function fontSizeClass(sz: 'sm' | 'md' | 'lg') {
  return sz === 'sm'
    ? 'text-sm leading-relaxed'
    : sz === 'lg'
      ? 'text-xl sm:text-2xl leading-snug'
      : 'text-base sm:text-lg leading-relaxed';
}

/* -------------------------------------------------------------------------- */
/* 可重用的個人黑板編輯器（支援文字 Emoji 與 Canvas 微顆粒粉筆塗鴉）             */
/* -------------------------------------------------------------------------- */
const EditableChalkboardPanel: React.FC<{
  ownerProfile: PartnerProfile;
  boardData: ChalkboardData | null;
  allowedEmails: string[];
  readOnlyPreview?: boolean;
  compact?: boolean;
}> = ({ ownerProfile, boardData, allowedEmails, readOnlyPreview = false, compact = false }) => {
  const [mode, setMode] = useState<'text' | 'draw'>(boardData?.mode || 'text');
  const [textContent, setTextContent] = useState(boardData?.textContent || '');
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>(boardData?.fontSize || 'md');
  const [chalkColor, setChalkColor] = useState<ChalkColorId>(boardData?.chalkColor || 'white');
  const [brushTool, setBrushTool] = useState<'chalk' | 'eraser'>('chalk');
  const [lineWidth, setLineWidth] = useState<number>(5);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const syncedUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (boardData && syncedUidRef.current !== ownerProfile.uid) {
      setMode(boardData.mode);
      setTextContent(boardData.textContent);
      setFontSize(boardData.fontSize);
      setChalkColor(boardData.chalkColor);
      syncedUidRef.current = ownerProfile.uid;
    }
  }, [boardData, ownerProfile.uid]);

  useEffect(() => {
    if (mode !== 'draw' || readOnlyPreview) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (boardData?.drawingDataUrl && historyRef.current.length === 0) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = boardData.drawingDataUrl;
    }
  }, [mode, boardData?.drawingDataUrl, readOnlyPreview]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const pushHistory = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(snap);
    if (historyRef.current.length > 18) {
      historyRef.current.shift();
    }
  };

  const drawChalkSegment = (
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => {
    if (brushTool === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineWidth = lineWidth * 3.2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const hex = CHALK_COLORS[chalkColor].hex;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / 2));

    ctx.save();
    ctx.fillStyle = hex;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = from.x + (to.x - from.x) * t;
      const cy = from.y + (to.y - from.y) * t;

      ctx.globalAlpha = 0.24;
      ctx.beginPath();
      ctx.arc(cx, cy, lineWidth * 0.65, 0, Math.PI * 2);
      ctx.fill();

      const grainCount = Math.max(6, lineWidth * 2);
      for (let g = 0; g < grainCount; g++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * lineWidth * 1.15;
        const gx = cx + Math.cos(angle) * radius;
        const gy = cy + Math.sin(angle) * radius;
        ctx.globalAlpha = 0.25 + Math.random() * 0.55;
        const dotSize = 0.8 + Math.random() * 1.4;
        ctx.fillRect(gx, gy, dotSize, dotSize);
      }
    }
    ctx.restore();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pushHistory();
    isDrawingRef.current = true;
    const pt = getCanvasPoint(e);
    lastPosRef.current = pt;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawChalkSegment(ctx, pt, pt);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPosRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    drawChalkSegment(ctx, lastPosRef.current, pt);
    lastPosRef.current = pt;
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;
    lastPosRef.current = null;
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const prev = historyRef.current.pop();
    if (canvas && ctx && prev) {
      ctx.putImageData(prev, 0, 0);
    }
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      pushHistory();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSyncBoard = async () => {
    if (readOnlyPreview) return;
    setSaving(true);
    const boardPath = `chalkboards/${ownerProfile.uid}`;
    try {
      let drawingDataUrl = boardData?.drawingDataUrl || '';
      if (mode === 'draw' && canvasRef.current) {
        drawingDataUrl = compressCanvasElement(canvasRef.current, 260_000);
      }

      const payload: Record<string, unknown> = {
        ownerUid: ownerProfile.uid,
        ownerEmail: ownerProfile.email.toLowerCase(),
        mode,
        textContent: textContent.slice(0, 600),
        fontSize,
        chalkColor,
        drawingDataUrl,
        allowedEmails,
        updatedAt: serverTimestamp(),
      };

      if (!boardData) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'chalkboards', ownerProfile.uid), payload, { merge: true });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, boardPath);
    } finally {
      setSaving(false);
    }
  };

  if (readOnlyPreview) {
    return (
      <ReadOnlyChalkboardPanel
        ownerName={ownerProfile.nickname}
        boardData={boardData}
        compact={compact}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-black/[0.06] dark:bg-white/5">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition whitespace-nowrap ${
              mode === 'text'
                ? 'bg-white/90 text-slate-900 dark:bg-white/15 dark:text-white shadow-sm'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Type className="h-3.5 w-3.5" />
            文字 Emoji
          </button>
          <button
            type="button"
            onClick={() => setMode('draw')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition whitespace-nowrap ${
              mode === 'draw'
                ? 'bg-white/90 text-slate-900 dark:bg-white/15 dark:text-white shadow-sm'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Pencil className="h-3.5 w-3.5" />
            粉筆手寫
          </button>
        </div>

        <div className="flex items-center gap-2">
          {(Object.keys(CHALK_COLORS) as ChalkColorId[]).map((cid) => (
            <button
              key={cid}
              type="button"
              onClick={() => {
                setChalkColor(cid);
                setBrushTool('chalk');
              }}
              aria-label={CHALK_COLORS[cid].label}
              className={`h-7 w-7 rounded-full border-2 transition ${
                chalkColor === cid && brushTool === 'chalk'
                  ? 'scale-110 border-[var(--accent-400)] shadow-md'
                  : 'border-white/25 opacity-75 hover:opacity-100'
              }`}
              style={{ backgroundColor: CHALK_COLORS[cid].hex }}
            />
          ))}
        </div>
      </div>

      {mode === 'text' ? (
        <div
          className={`chalkboard-surface rounded-2xl p-4 flex flex-col justify-between border border-white/10 ${
            compact ? 'min-h-[175px]' : 'min-h-[220px]'
          }`}
        >
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            maxLength={600}
            placeholder="寫下一句暖心的話或 Emoji 送給對方..."
            className={`w-full flex-1 bg-transparent resize-none outline-none placeholder:text-white/30 ${fontSizeClass(
              fontSize
            )}`}
            style={{ color: CHALK_COLORS[chalkColor].hex }}
          />
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {QUICK_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setTextContent((prev) => (prev + em).slice(0, 600))}
                  className="h-8 w-8 rounded-lg hover:bg-white/10 text-base shrink-0 flex items-center justify-center transition"
                >
                  {em}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {(['sm', 'md', 'lg'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setFontSize(sz)}
                  className={`min-h-[30px] px-2 rounded-lg text-[11px] font-medium transition ${
                    fontSize === sz
                      ? 'text-white'
                      : 'text-white/50 hover:text-white/85'
                  }`}
                  style={fontSize === sz ? { backgroundColor: 'var(--accent-500)' } : undefined}
                >
                  {sz === 'sm' ? '小' : sz === 'md' ? '中' : '大'}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="chalkboard-surface rounded-2xl overflow-hidden border border-white/10 relative touch-none">
            <canvas
              ref={canvasRef}
              width={640}
              height={360}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`w-full block cursor-crosshair touch-none ${
                compact ? 'h-[190px] sm:h-[220px]' : 'h-[220px] sm:h-[250px]'
              }`}
            />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              {[3, 5, 8].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    setLineWidth(w);
                    setBrushTool('chalk');
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-xs ${
                    lineWidth === w && brushTool === 'chalk'
                      ? 'border-[var(--accent-500)] text-[var(--text-primary)] font-semibold'
                      : 'border-[var(--border-glass)]'
                  }`}
                >
                  {w === 3 ? '細' : w === 5 ? '中' : '粗'}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setBrushTool((t) => (t === 'eraser' ? 'chalk' : 'eraser'))}
                className={`min-h-[32px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition ${
                  brushTool === 'eraser'
                    ? 'bg-rose-500 text-white'
                    : 'glass-card text-[var(--text-secondary)]'
                }`}
              >
                <Eraser className="h-3.5 w-3.5" />
                板擦
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleUndo}
                aria-label="復原筆畫"
                className="min-h-[32px] min-w-[32px] rounded-lg glass-card flex items-center justify-center"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClearCanvas}
                aria-label="清空畫板"
                className="min-h-[32px] min-w-[32px] rounded-lg glass-card flex items-center justify-center text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const canvas = canvasRef.current;
                  const ctx = canvas?.getContext('2d');
                  if (canvas && ctx && boardData?.drawingDataUrl) {
                    const img = new Image();
                    img.onload = () => {
                      ctx.clearRect(0, 0, canvas.width, canvas.height);
                      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    };
                    img.src = boardData.drawingDataUrl;
                  }
                }}
                aria-label="還原雲端版本"
                className="min-h-[32px] min-w-[32px] rounded-lg glass-card flex items-center justify-center"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleSyncBoard}
        disabled={saving}
        className="w-full min-h-[44px] rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60 inline-flex items-center justify-center gap-2"
        style={{ backgroundColor: 'var(--accent-500)' }}
      >
        {savedNotice ? (
          <>
            <Check className="h-4 w-4" />
            已同步至黑板
          </>
        ) : saving ? (
          '即時同步中...'
        ) : (
          '儲存並即時同步'
        )}
      </button>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 唯讀展示黑板                                                                */
/* -------------------------------------------------------------------------- */
const ReadOnlyChalkboardPanel: React.FC<{
  ownerName: string;
  boardData: ChalkboardData | null;
  compact?: boolean;
}> = ({ ownerName, boardData, compact = false }) => {
  return (
    <div
      className={`chalkboard-surface rounded-2xl p-5 border border-white/10 flex flex-col justify-between ${
        compact ? 'min-h-[195px]' : 'min-h-[260px]'
      }`}
    >
      <div className="flex-1 flex items-center justify-center">
        {!boardData ? (
          <p className="text-sm text-white/45 text-center">
            {ownerName} 還沒有寫下新的小黑板留言...
          </p>
        ) : boardData.mode === 'draw' && boardData.drawingDataUrl ? (
          <img
            src={boardData.drawingDataUrl}
            alt={`${ownerName} 的粉筆塗鴉`}
            className="w-full max-h-[220px] object-contain"
          />
        ) : (
          <p
            className={`w-full whitespace-pre-wrap break-words ${fontSizeClass(
              boardData.fontSize || 'md'
            )}`}
            style={{
              color: CHALK_COLORS[boardData.chalkColor || 'white']?.hex || '#F6F2EA',
            }}
          >
            {boardData.textContent || '（目前黑板空白）'}
          </p>
        )}
      </div>

      <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50">
        <span>來自 {ownerName}</span>
        <span className="font-mono-tabular">最後更新：{formatUpdatedAt(boardData?.updatedAt)}</span>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 1. 首頁置頂互動小黑板（單板 + 極簡一鍵切換：對方的留言 <-> 我的黑板）         */
/* -------------------------------------------------------------------------- */
export const PinnedHomeChalkboard: React.FC<{
  activeProfile: PartnerProfile;
  otherProfile: PartnerProfile | null;
  activeBoard: ChalkboardData | null;
  otherBoard: ChalkboardData | null;
  allowedEmails: string[];
  isPreviewPerspective?: boolean;
}> = ({
  activeProfile,
  otherProfile,
  activeBoard,
  otherBoard,
  allowedEmails,
  isPreviewPerspective = false,
}) => {
  // 預設顯示「對方的黑板留言」
  const [boardTab, setBoardTab] = useState<'partner' | 'mine'>('partner');

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl p-4 sm:p-5 space-y-3.5"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-black/[0.06] dark:bg-white/5">
          <button
            type="button"
            onClick={() => setBoardTab('partner')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              boardTab === 'partner'
                ? 'text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            style={boardTab === 'partner' ? { backgroundColor: 'var(--accent-500)' } : undefined}
          >
            對方留言
          </button>
          <button
            type="button"
            onClick={() => setBoardTab('mine')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              boardTab === 'mine'
                ? 'text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            style={boardTab === 'mine' ? { backgroundColor: 'var(--accent-500)' } : undefined}
          >
            {isPreviewPerspective ? `${activeProfile.nickname} 的黑板` : '寫給對方'}
          </button>
        </div>

        <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
          {boardTab === 'partner'
            ? `更新於 ${formatUpdatedAt(otherBoard?.updatedAt)}`
            : isPreviewPerspective
              ? '預覽視角（唯讀）'
              : `已同步 · ${formatUpdatedAt(activeBoard?.updatedAt)}`}
        </span>
      </div>

      {boardTab === 'partner' ? (
        <ReadOnlyChalkboardPanel
          ownerName={otherProfile?.nickname || '另一半'}
          boardData={otherBoard}
          compact
        />
      ) : (
        <EditableChalkboardPanel
          ownerProfile={activeProfile}
          boardData={activeBoard}
          allowedEmails={allowedEmails}
          readOnlyPreview={isPreviewPerspective}
          compact
        />
      )}
    </motion.section>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. 第二分頁：雙人並排畫板工作室                                              */
/* -------------------------------------------------------------------------- */
export const ChalkboardSection: React.FC<{
  activeProfile: PartnerProfile;
  otherProfile: PartnerProfile | null;
  activeBoard: ChalkboardData | null;
  otherBoard: ChalkboardData | null;
  allowedEmails: string[];
  isPreviewPerspective?: boolean;
}> = ({
  activeProfile,
  otherProfile,
  activeBoard,
  otherBoard,
  allowedEmails,
  isPreviewPerspective = false,
}) => {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight">雙人畫板工作室</h2>
        <p className="text-xs text-[var(--text-secondary)]">
          並排呈現雙方的手寫塗鴉與留言黑板 · 毫秒級雙向同步
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-3xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">{activeProfile.nickname} 的黑板</h3>
            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
              {formatUpdatedAt(activeBoard?.updatedAt)}
            </span>
          </div>
          <EditableChalkboardPanel
            ownerProfile={activeProfile}
            boardData={activeBoard}
            allowedEmails={allowedEmails}
            readOnlyPreview={isPreviewPerspective}
          />
        </div>

        <div className="glass-card rounded-3xl p-4 sm:p-5 space-y-3 flex flex-col">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">
              {otherProfile?.nickname || '另一半'} 的黑板
            </h3>
            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
              {formatUpdatedAt(otherBoard?.updatedAt)}
            </span>
          </div>
          <div className="flex-1 flex flex-col">
            <ReadOnlyChalkboardPanel
              ownerName={otherProfile?.nickname || '另一半'}
              boardData={otherBoard}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
