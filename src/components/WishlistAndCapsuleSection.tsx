import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  Check,
  Clock,
  Droplets,
  Heart,
  Lock,
  Mail,
  MailOpen,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PartnerProfile, TimeCapsuleLetter, WishlistItem } from '../types/couple';
import { mixHex } from '../utils/colorPalette';
import { computeLiquidHeartState } from '../utils/loveTime';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatCountdown(msRemaining: number): string {
  const safe = Math.max(0, msRemaining);
  const days = Math.floor(safe / (1000 * 60 * 60 * 24));
  const hours = Math.floor((safe % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((safe % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((safe % (1000 * 60)) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${days} 天 ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

/* -------------------------------------------------------------------------- */
/* 動態液體升級愛心容器 SVG                                                     */
/* -------------------------------------------------------------------------- */
const LiquidHeartContainer: React.FC<{
  completedCount: number;
  accentHex: string;
  dropTriggerKey: number;
}> = ({ completedCount, accentHex, dropTriggerKey }) => {
  const state = useMemo(() => computeLiquidHeartState(completedCount), [completedCount]);
  const liquidStart = useMemo(() => mixHex(accentHex, '#FFFFFF', 0.25), [accentHex]);
  const liquidEnd = useMemo(() => mixHex(accentHex, '#000000', 0.16), [accentHex]);
  const prevLevelRef = useRef(state.level);
  const [upgradingLevel, setUpgradingLevel] = useState<number | null>(null);
  const [tiltDeg, setTiltDeg] = useState(0);

  // 偵測升級瞬間觸發光環過場動畫
  useEffect(() => {
    if (state.level > prevLevelRef.current) {
      setUpgradingLevel(state.level);
      const t = window.setTimeout(() => setUpgradingLevel(null), 2200);
      prevLevelRef.current = state.level;
      return () => window.clearTimeout(t);
    }
    prevLevelRef.current = state.level;
  }, [state.level]);

  // 手機傾斜感應（輕微晃動液面角度）
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (typeof e.gamma === 'number') {
        const clamped = Math.max(-12, Math.min(12, e.gamma * 0.35));
        setTiltDeg(clamped);
      }
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  // 隨階級微幅放大容器尺寸（1.0 -> 1.14）
  const scaleFactor = Math.min(1.14, 1 + (state.level - 1) * 0.035);
  // 液體表面 Y 座標（viewBox 高度 220：滿 100% 在 y=26，0% 在 y=200）
  const liquidTopY = 200 - (state.fillPercent / 100) * 172;

  return (
    <div className="glass-card rounded-3xl p-6 sm:p-7 relative overflow-hidden flex flex-col items-center text-center">
      {/* 落入水滴動畫 */}
      <AnimatePresence>
        {dropTriggerKey > 0 && (
          <motion.div
            key={dropTriggerKey}
            initial={{ y: -24, opacity: 1, scale: 0.7 }}
            animate={{ y: 84, opacity: 0, scale: 1.15 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: 'easeIn' }}
            className="pointer-events-none absolute top-4 z-20"
            style={{ color: accentHex }}
          >
            <Droplets className="h-7 w-7 fill-current" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 升級慶祝提示 */}
      <AnimatePresence>
        {upgradingLevel !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="mb-3 rounded-2xl px-4 py-2 text-xs font-bold text-white shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${liquidStart}, ${liquidEnd})`,
            }}
          >
            愛心容器滿溢升級至 Lv.{upgradingLevel}！總容量提升至 {state.maxCapacity} ml（原有液量完整保留）
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="relative flex items-center justify-center transition-transform duration-500"
        style={{ transform: `scale(${scaleFactor})` }}
      >
        <svg
          viewBox="0 0 260 225"
          className="w-56 h-48 sm:w-64 sm:h-56 drop-shadow-xl overflow-visible"
          aria-label={`愛心液體進度 Lv.${state.level}`}
        >
          <defs>
            <linearGradient id="liquidGradMain" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={liquidStart} stopOpacity="0.92" />
              <stop offset="100%" stopColor={liquidEnd} stopOpacity="0.98" />
            </linearGradient>
            <linearGradient id="liquidGradBack" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={liquidStart} stopOpacity="0.55" />
              <stop offset="100%" stopColor={liquidEnd} stopOpacity="0.7" />
            </linearGradient>

            {/* 單一愛心裁切路徑 OR 超過第3階 (>=250ml) 雙愛心交疊造型 */}
            <clipPath id="heartClipPath">
              {state.isDualHeart ? (
                <>
                  {/* 大愛心（左側主體） */}
                  <path d="M116 196 C116 196 30 142 30 82 C30 50 55 26 85 26 C103 26 112 36 116 46 C120 36 129 26 147 26 C177 26 202 50 202 82 C202 142 116 196 116 196 Z" />
                  {/* 小愛心（右側交疊共鳴） */}
                  <path d="M188 188 C188 188 136 154 136 116 C136 96 151 82 170 82 C180 82 186 88 188 94 C190 88 196 82 206 82 C225 82 240 96 240 116 C240 154 188 188 188 188 Z" />
                </>
              ) : (
                <path d="M130 200 C130 200 32 140 32 76 C32 42 59 18 91 18 C111 18 123 30 130 42 C137 30 149 18 169 18 C201 18 228 42 228 76 C228 140 130 200 130 200 Z" />
              )}
            </clipPath>
          </defs>

          {/* 液體層（於裁切愛心內部波動） */}
          <g clipPath="url(#heartClipPath)">
            <rect x="0" y="0" width="260" height="225" fill="rgba(148, 163, 184, 0.14)" />
            <g
              style={{
                transform: `rotate(${tiltDeg}deg)`,
                transformOrigin: '130px 115px',
                transition: 'transform 220ms ease-out',
              }}
            >
              {/* 後層波浪 */}
              <g
                style={{
                  transform: `translateY(${liquidTopY}px)`,
                  transition: 'transform 650ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <path
                  className="animate-wave-fast"
                  d="M0 0 Q 65 -12 130 0 T 260 0 T 390 0 T 520 0 V 240 H 0 Z"
                  fill="url(#liquidGradBack)"
                />
                {/* 前層波浪 */}
                <path
                  className="animate-wave-slow"
                  d="M0 4 Q 65 15 130 4 T 260 4 T 390 4 T 520 4 V 240 H 0 Z"
                  fill="url(#liquidGradMain)"
                />
              </g>
            </g>
          </g>

          {/* 發光玻璃外框輪廓 */}
          {state.isDualHeart ? (
            <>
              <path
                d="M116 196 C116 196 30 142 30 82 C30 50 55 26 85 26 C103 26 112 36 116 46 C120 36 129 26 147 26 C177 26 202 50 202 82 C202 142 116 196 116 196 Z"
                fill="none"
                stroke={accentHex}
                strokeWidth="3"
                strokeOpacity="0.7"
              />
              <path
                d="M188 188 C188 188 136 154 136 116 C136 96 151 82 170 82 C180 82 186 88 188 94 C190 88 196 82 206 82 C225 82 240 96 240 116 C240 154 188 188 188 188 Z"
                fill="none"
                stroke={liquidStart}
                strokeWidth="2.5"
                strokeOpacity="0.85"
              />
            </>
          ) : (
            <path
              d="M130 200 C130 200 32 140 32 76 C32 42 59 18 91 18 C111 18 123 30 130 42 C137 30 149 18 169 18 C201 18 228 42 228 76 C228 140 130 200 130 200 Z"
              fill="none"
              stroke={accentHex}
              strokeWidth="3"
              strokeOpacity="0.75"
            />
          )}
        </svg>
      </div>

      {/* 液量與階級數據 */}
      <div className="mt-4 space-y-1">
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="font-semibold" style={{ color: accentHex }}>
            Lv.{state.level} {state.isDualHeart ? '雙心交疊共鳴形態' : '愛心能量容器'}
          </span>
          <span aria-hidden="true">·</span>
          <span>每完成 1 個願望 +10 ml</span>
        </div>
        <p className="font-mono-tabular text-2xl sm:text-3xl font-bold tracking-tight">
          {state.currentMl} <span className="text-sm font-normal text-[var(--text-muted)]">/ {state.maxCapacity} ml</span>
        </p>
        <p className="text-xs font-mono-tabular text-[var(--text-secondary)]">
          目前水位 {state.fillPercent}% · 再完成{' '}
          {Math.ceil((state.maxCapacity - state.currentMl) / 10)} 個願望上限升級至{' '}
          {state.maxCapacity + 50} ml
        </p>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 主整合分頁：共同願望清單 & 時光膠囊                                         */
/* -------------------------------------------------------------------------- */
export const WishlistAndCapsuleSection: React.FC<{
  myProfile: PartnerProfile;
  wishlistItems: WishlistItem[];
  capsules: TimeCapsuleLetter[];
  allowedEmails: string[];
  accentHex: string;
  onRefreshData?: () => void;
}> = ({ myProfile, wishlistItems, capsules, allowedEmails, accentHex, onRefreshData }) => {
  const [subMode, setSubMode] = useState<'wishlist' | 'capsule'>('wishlist');
  const [dropTriggerKey, setDropTriggerKey] = useState(0);

  // Wishlist add form
  const [wishTitle, setWishTitle] = useState('');
  const [wishNote, setWishNote] = useState('');
  const [addingWish, setAddingWish] = useState(false);

  // Capsule state
  const [showCreateCapsule, setShowCreateCapsule] = useState(false);
  const [capTitle, setCapTitle] = useState('');
  const [capRecipient, setCapRecipient] = useState('給親愛的你');
  const [capContent, setCapContent] = useState('');
  const [capUnlockLocal, setCapUnlockLocal] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [creatingCap, setCreatingCap] = useState(false);
  const [openedCapsuleView, setOpenedCapsuleView] = useState<TimeCapsuleLetter | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const completedCount = useMemo(
    () => wishlistItems.filter((w) => w.completed).length,
    [wishlistItems]
  );

  const handleAddWish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wishTitle.trim()) return;
    setAddingWish(true);
    const id = generateId('wish');
    try {
      await setDoc(doc(db, 'wishlist', id), {
        id,
        title: wishTitle.trim().slice(0, 100),
        note: wishNote.trim().slice(0, 240),
        completed: false,
        completedAt: '',
        creatorUid: myProfile.uid,
        creatorName: myProfile.nickname,
        allowedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setWishTitle('');
      setWishNote('');
      onRefreshData?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `wishlist/${id}`);
    } finally {
      setAddingWish(false);
    }
  };

  const handleToggleWish = async (item: WishlistItem) => {
    const nextCompleted = !item.completed;
    if (nextCompleted) {
      setDropTriggerKey((k) => k + 1);
    }
    try {
      await updateDoc(doc(db, 'wishlist', item.id), {
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString().slice(0, 10) : '',
        updatedAt: serverTimestamp(),
      });
      onRefreshData?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `wishlist/${item.id}`);
    }
  };

  const handleCreateCapsule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capTitle.trim() || !capContent.trim() || !capUnlockLocal) return;
    const unlockDate = new Date(capUnlockLocal);
    if (Number.isNaN(unlockDate.getTime())) return;

    setCreatingCap(true);
    const id = generateId('cap');
    try {
      await setDoc(doc(db, 'capsules', id), {
        id,
        senderUid: myProfile.uid,
        senderName: myProfile.nickname,
        recipientLabel: capRecipient.trim().slice(0, 30) || '給親愛的你',
        title: capTitle.trim().slice(0, 80),
        content: capContent.trim().slice(0, 3000),
        unlockAtIso: unlockDate.toISOString(),
        unlockAtMs: unlockDate.getTime(),
        opened: false,
        openedAtIso: '',
        allowedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCapTitle('');
      setCapContent('');
      setShowCreateCapsule(false);
      onRefreshData?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `capsules/${id}`);
    } finally {
      setCreatingCap(false);
    }
  };

  const handleOpenCapsule = async (cap: TimeCapsuleLetter) => {
    if (nowMs < cap.unlockAtMs) return; // 嚴格鎖定：未到解鎖時間禁止開啟
    setOpenedCapsuleView(cap);
    if (!cap.opened) {
      try {
        await updateDoc(doc(db, 'capsules', cap.id), {
          opened: true,
          openedAtIso: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        });
        onRefreshData?.();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `capsules/${cap.id}`);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-card w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setSubMode('wishlist')}
            className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
              subMode === 'wishlist'
                ? 'bg-white dark:bg-slate-800 shadow-sm'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Heart className="h-4 w-4" />
            液體愛心清單 ({completedCount}/{wishlistItems.length})
          </button>
          <button
            type="button"
            onClick={() => setSubMode('capsule')}
            className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
              subMode === 'capsule'
                ? 'bg-white dark:bg-slate-800 shadow-sm'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Mail className="h-4 w-4" />
            時光膠囊信箱 ({capsules.length})
          </button>
        </div>

        {subMode === 'capsule' && (
          <button
            type="button"
            onClick={() => setShowCreateCapsule(true)}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl text-sm font-semibold text-white shadow-sm inline-flex items-center justify-center gap-2 transition active:scale-[0.98] whitespace-nowrap shrink-0"
            style={{ backgroundColor: 'var(--accent-500)' }}
          >
            <Plus className="h-4 w-4" />
            封存一封未來信
          </button>
        )}
      </div>

      {/* 1. 共同願望清單與動態液體愛心 */}
      {subMode === 'wishlist' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5">
            <LiquidHeartContainer
              completedCount={completedCount}
              accentHex={accentHex}
              dropTriggerKey={dropTriggerKey}
            />
          </div>

          <div className="lg:col-span-7 space-y-4">
            {/* 新增願望表單 */}
            <form
              onSubmit={handleAddWish}
              className="glass-card rounded-3xl p-4 sm:p-5 space-y-3"
            >
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={wishTitle}
                  onChange={(e) => setWishTitle(e.target.value)}
                  placeholder="新增一個想一起完成的願望（例：一起去北海道看雪）"
                  className="flex-1 rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-sm outline-none"
                />
                <button
                  type="submit"
                  disabled={addingWish}
                  className="min-h-[46px] px-5 rounded-2xl text-sm font-semibold text-white shrink-0 transition active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--accent-500)' }}
                >
                  加入清單
                </button>
              </div>
              <input
                type="text"
                maxLength={240}
                value={wishNote}
                onChange={(e) => setWishNote(e.target.value)}
                placeholder="備註細節（選填）"
                className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/40 dark:bg-slate-900/40 px-4 py-2.5 text-xs outline-none"
              />
            </form>

            {/* 願望清單列表 */}
            <div className="glass-card rounded-3xl divide-y divide-[var(--border-glass)] overflow-hidden">
              {wishlistItems.length === 0 ? (
                <div className="p-8 text-center">
                  <Sparkles className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                  <p className="text-sm font-medium">還沒有共同願望清單項目</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    每完成一項，愛心就會增加 10 ml 發光液體！
                  </p>
                </div>
              ) : (
                wishlistItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 flex items-center justify-between gap-3 hover:bg-white/30 dark:hover:bg-slate-800/30 transition"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleWish(item)}
                      className="flex items-start gap-3.5 text-left flex-1 min-w-0 min-h-[44px]"
                    >
                      <span
                        className={`mt-0.5 h-6 w-6 rounded-lg border flex items-center justify-center shrink-0 transition ${
                          item.completed
                            ? 'border-transparent text-white'
                            : 'border-[var(--text-muted)]'
                        }`}
                        style={
                          item.completed
                            ? { backgroundColor: 'var(--accent-500)' }
                            : undefined
                        }
                      >
                        {item.completed && <Check className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold break-words ${
                            item.completed
                              ? 'line-through text-[var(--text-muted)]'
                              : ''
                          }`}
                        >
                          {item.title}
                        </p>
                        {item.note && (
                          <p className="mt-0.5 text-xs text-[var(--text-secondary)] break-words">
                            {item.note}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          由 {item.creatorName} 新增
                          {item.completed && item.completedAt
                            ? ` · 完成於 ${item.completedAt}（+10 ml）`
                            : ''}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await deleteDoc(doc(db, 'wishlist', item.id));
                          onRefreshData?.();
                        } catch (err) {
                          handleFirestoreError(err, OperationType.DELETE, `wishlist/${item.id}`);
                        }
                      }}
                      aria-label="刪除願望"
                      className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-rose-500 transition shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. 給未來的一封信（時光膠囊） */}
      {subMode === 'capsule' && (
        <section>
          {capsules.length === 0 ? (
            <div className="glass-card rounded-3xl p-10 text-center">
              <Mail className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
              <p className="text-sm font-semibold">尚無封存的時光膠囊信件</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                寫一封給未來週年或生日才能拆封的信，時間到之前絕對無法偷看
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {capsules.map((cap) => {
                const isLocked = nowMs < cap.unlockAtMs;
                const unlockDateFormatted = new Date(cap.unlockAtMs).toLocaleString('zh-TW', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={cap.id}
                    className="glass-card rounded-3xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">
                          寄件：{cap.senderName} → {cap.recipientLabel}
                        </p>
                        <h3 className="mt-1 text-lg font-bold tracking-tight">
                          {cap.title}
                        </h3>
                      </div>
                      <div
                        className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          isLocked
                            ? 'bg-slate-500/15 text-[var(--text-secondary)]'
                            : 'text-white shadow-sm'
                        }`}
                        style={!isLocked ? { backgroundColor: 'var(--accent-500)' } : undefined}
                      >
                        {isLocked ? (
                          <Lock className="h-5 w-5" />
                        ) : (
                          <MailOpen className="h-5 w-5" />
                        )}
                      </div>
                    </div>

                    {isLocked ? (
                      /* 加密封印狀態：絕對不渲染 cap.content */
                      <div className="rounded-2xl border border-[var(--border-glass)] bg-black/5 dark:bg-white/5 p-4 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                          <Clock className="h-3.5 w-3.5" />
                          <span>加密封印中 · 解鎖前無法檢視內容</span>
                        </div>
                        <p
                          className="font-mono-tabular text-xl font-bold"
                          style={{ color: 'var(--accent-600)' }}
                        >
                          {formatCountdown(cap.unlockAtMs - nowMs)}
                        </p>
                        <p className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                          預計解鎖：{unlockDateFormatted}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          已到達解鎖時刻 · {cap.opened ? '已拆閱' : '可點擊拆封閱讀'}
                        </p>
                        <p className="mt-1 text-[11px] font-mono-tabular text-[var(--text-muted)]">
                          解鎖時間：{unlockDateFormatted}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-glass)]">
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => handleOpenCapsule(cap)}
                        className={`min-h-[44px] flex-1 rounded-2xl px-4 py-2 text-xs font-semibold transition ${
                          isLocked
                            ? 'glass-card text-[var(--text-muted)] cursor-not-allowed opacity-70'
                            : 'text-white shadow-sm active:scale-[0.98]'
                        }`}
                        style={!isLocked ? { backgroundColor: 'var(--accent-500)' } : undefined}
                      >
                        {isLocked ? '等待時間解鎖' : '拆封閱讀信件'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteDoc(doc(db, 'capsules', cap.id));
                            onRefreshData?.();
                          } catch (err) {
                            handleFirestoreError(err, OperationType.DELETE, `capsules/${cap.id}`);
                          }
                        }}
                        aria-label="刪除膠囊"
                        className="min-h-[44px] min-w-[44px] rounded-2xl glass-card flex items-center justify-center text-[var(--text-muted)] hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 撰寫時光膠囊 Modal */}
      <AnimatePresence>
        {showCreateCapsule && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onSubmit={handleCreateCapsule}
              className="glass-card-strong w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">封存給未來的一封信</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateCapsule(false)}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    寫給誰
                  </label>
                  <select
                    value={capRecipient}
                    onChange={(e) => setCapRecipient(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-sm outline-none"
                  >
                    <option value="給親愛的你">給親愛的你</option>
                    <option value="給未來的我們">給未來的我們</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    解鎖日期與時間
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={capUnlockLocal}
                    onChange={(e) => setCapUnlockLocal(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-xs font-mono-tabular outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  信件標題
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={capTitle}
                  onChange={(e) => setCapTitle(e.target.value)}
                  placeholder="例如：給復合後滿一週年的我們"
                  className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  信件內容（封存後在解鎖時間前皆無法偷看）
                </label>
                <textarea
                  rows={5}
                  required
                  maxLength={3000}
                  value={capContent}
                  onChange={(e) => setCapContent(e.target.value)}
                  placeholder="親愛的，當你看到這封信的時候..."
                  className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-sm outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={creatingCap}
                className="w-full min-h-[48px] rounded-2xl text-sm font-semibold text-white shadow transition active:scale-[0.98]"
                style={{ backgroundColor: 'var(--accent-500)' }}
              >
                {creatingCap ? '加密封存中...' : '鎖上時光膠囊'}
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* 拆信動畫 Modal（僅在已解鎖時可開啟） */}
      <AnimatePresence>
        {openedCapsuleView && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, rotateX: -25, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card-strong w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-3xl p-7 shadow-2xl space-y-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-11 w-11 rounded-2xl text-white flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--accent-500)' }}
                  >
                    <MailOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {openedCapsuleView.senderName} 寄給 {openedCapsuleView.recipientLabel}
                    </p>
                    <h3 className="text-xl font-bold">{openedCapsuleView.title}</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenedCapsuleView(null)}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-2xl border border-[var(--border-glass)] bg-white/50 dark:bg-slate-900/50 p-5">
                <p className="text-sm leading-loose whitespace-pre-wrap break-words">
                  {openedCapsuleView.content}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
