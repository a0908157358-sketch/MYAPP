import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImagePlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PartnerProfile, SnapStory } from '../types/couple';
import { compressImageFile } from '../utils/imageCompression';

function generateSnapId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatRemaining24h(msRemaining: number): string {
  const safe = Math.max(0, msRemaining);
  const hours = Math.floor(safe / (1000 * 60 * 60));
  const mins = Math.floor((safe % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((safe % (1000 * 60)) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `剩餘 ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

function formatPublishTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const SnapStoryWidget: React.FC<{
  snaps: SnapStory[];
  myProfile: PartnerProfile;
  allowedEmails: string[];
}> = ({ snaps, myProfile, allowedEmails }) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<'view' | 'compose'>('view');
  const [activeIndex, setActiveIndex] = useState(0);

  // Composer state
  const [draftPhoto, setDraftPhoto] = useState('');
  const [draftCaption, setDraftCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const captionInputRef = useRef<HTMLInputElement | null>(null);

  // 24 小時自動倒數與過期清理過濾
  useEffect(() => {
    const interval = window.setInterval(
      () => setNowMs(Date.now()),
      modalOpen ? 1000 : 15_000
    );
    return () => window.clearInterval(interval);
  }, [modalOpen]);

  const activeSnaps = useMemo(() => {
    return snaps
      .filter((s) => s.expiresAtMs > nowMs)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [snaps, nowMs]);

  const latestSnap = activeSnaps[0] || null;
  const safeIndex = activeSnaps.length > 0 ? Math.min(activeIndex, activeSnaps.length - 1) : 0;
  const currentSnap = activeSnaps[safeIndex] || null;

  const handleOpenEdgeThumbnail = () => {
    setErrorMsg('');
    if (activeSnaps.length > 0) {
      setActiveIndex(0);
      setMode('view');
    } else {
      setDraftPhoto('');
      setDraftCaption('');
      setMode('compose');
    }
    setModalOpen(true);
  };

  const handleSwitchToCompose = () => {
    setErrorMsg('');
    setDraftPhoto('');
    setDraftCaption('');
    setMode('compose');
  };

  const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');
    try {
      const compressed = await compressImageFile(file, {
        maxDim: 960,
        maxDataUrlLength: 360_000,
      });
      setDraftPhoto(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '照片壓縮失敗，請換一張試試');
    }
  };

  const handlePublishSnap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPhoto) return;
    setUploading(true);
    setErrorMsg('');
    const id = generateSnapId();
    const createdAtMs = Date.now();
    const expiresAtMs = createdAtMs + 24 * 60 * 60 * 1000;

    try {
      await setDoc(doc(db, 'snaps', id), {
        id,
        photoDataUrl: draftPhoto,
        caption: draftCaption.trim().slice(0, 80),
        creatorUid: myProfile.uid,
        creatorName: myProfile.nickname,
        createdAtMs,
        expiresAtMs,
        allowedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setDraftPhoto('');
      setDraftCaption('');
      setActiveIndex(0);
      setMode('view');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `snaps/${id}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSnap = async (snap: SnapStory) => {
    try {
      await deleteDoc(doc(db, 'snaps', snap.id));
      if (activeSnaps.length <= 1) {
        setModalOpen(false);
      } else {
        setActiveIndex((idx) => Math.max(0, idx - 1));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `snaps/${snap.id}`);
    }
  };

  return (
    <>
      {/* 右側邊緣半露小方框縮圖（露出約 25%~30% 最新照片或 ＋隨手拍） */}
      <div className="fixed right-0 top-[30%] sm:top-[32%] z-30 pointer-events-none">
        <button
          type="button"
          onClick={handleOpenEdgeThumbnail}
          aria-label={latestSnap ? `查看 ${latestSnap.creatorName} 的 24h 隨手拍` : '新增 24h 隨手拍'}
          className="pointer-events-auto group relative flex items-center justify-start w-[76px] h-[76px] sm:w-[86px] sm:h-[86px] rounded-2xl overflow-hidden border-2 border-white/85 dark:border-white/35 shadow-2xl transition-transform duration-300 ease-out translate-x-[68%] hover:translate-x-[58%] active:scale-95 touch-manipulation"
          style={{
            backgroundColor: latestSnap ? '#141519' : 'var(--bg-surface-strong)',
          }}
        >
          {latestSnap ? (
            <>
              <img
                src={latestSnap.photoDataUrl}
                alt={`${latestSnap.creatorName} 的隨手拍`}
                className="w-full h-full object-cover"
              />
              {/* 左側露出邊緣的微亮提示點 */}
              <span
                className="absolute top-2 left-2 h-2.5 w-2.5 rounded-full ring-2 ring-white shadow"
                style={{ backgroundColor: 'var(--accent-500)' }}
              />
            </>
          ) : (
            <div className="w-[32%] h-full flex flex-col items-center justify-center gap-0.5 text-[var(--text-primary)] bg-white/40 dark:bg-white/10 backdrop-blur-md border-r border-[var(--border-glass)]">
              <Plus className="h-4 w-4 text-[var(--accent-600)] dark:text-[var(--accent-400)]" />
              <span className="text-[9px] font-bold leading-tight [writing-mode:vertical-rl]">
                隨手拍
              </span>
            </div>
          )}
        </button>
      </div>

      {/* 1:1 彈出正方形卡片 Modal（背景微暗模糊，點擊卡片外部即關閉） */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {modalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 pointer-events-auto">
                {/* 點擊外部關閉遮罩 */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setModalOpen(false)}
                  className="absolute inset-0 bg-black/65 backdrop-blur-md"
                  aria-hidden="true"
                />

                {/* 精緻 1:1 正方形卡片 */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: 12 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  role="dialog"
                  aria-modal="true"
                  aria-label="24 小時隨手拍"
                  className="relative z-10 w-full max-w-[360px] sm:max-w-[400px] aspect-square rounded-3xl overflow-hidden bg-[#141519] border border-white/20 shadow-2xl flex flex-col justify-between pointer-events-auto"
                >
                  {mode === 'view' && currentSnap ? (
                    <>
                      {/* 完整 1:1 不裁切照片顯示 */}
                      <img
                        src={currentSnap.photoDataUrl}
                        alt={currentSnap.caption || `${currentSnap.creatorName} 的隨手拍`}
                        className="absolute inset-0 w-full h-full object-contain bg-[#141519]"
                      />

                      {/* 頂部資訊列：進度條 + 發布者/時間 + 24h 倒數 + 關閉/刪除 */}
                      <div className="relative z-10 p-3.5 bg-gradient-to-b from-black/75 via-black/35 to-transparent space-y-2.5">
                        {activeSnaps.length > 1 && (
                          <div className="flex items-center gap-1">
                            {activeSnaps.map((s, idx) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => setActiveIndex(idx)}
                                aria-label={`切換至第 ${idx + 1} 張隨手拍`}
                                className="h-1 flex-1 rounded-full overflow-hidden bg-white/25"
                              >
                                <span
                                  className={`block h-full transition-all ${
                                    idx === safeIndex ? 'w-full bg-white' : 'w-0'
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 text-white">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold truncate">
                                {currentSnap.creatorName}
                              </span>
                              <span className="text-[11px] font-mono-tabular text-white/75">
                                {formatPublishTime(currentSnap.createdAtMs)}
                              </span>
                            </div>
                            <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-mono-tabular text-amber-200/95">
                              <Clock className="h-3 w-3" />
                              <span>{formatRemaining24h(currentSnap.expiresAtMs - nowMs)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {currentSnap.creatorUid === myProfile.uid && (
                              <button
                                type="button"
                                onClick={() => handleDeleteSnap(currentSnap)}
                                aria-label="刪除此隨手拍"
                                className="h-8 w-8 rounded-full bg-black/40 hover:bg-rose-500/75 text-white flex items-center justify-center transition touch-manipulation"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setModalOpen(false)}
                              aria-label="關閉隨手拍卡片"
                              className="h-8 w-8 rounded-full bg-black/40 hover:bg-black/65 text-white flex items-center justify-center transition touch-manipulation"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 多張切換左右按鈕 */}
                      {activeSnaps.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveIndex((prev) => (prev - 1 + activeSnaps.length) % activeSnaps.length)
                            }
                            aria-label="上一張隨手拍"
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/65 transition touch-manipulation"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveIndex((prev) => (prev + 1) % activeSnaps.length)
                            }
                            aria-label="下一張隨手拍"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/65 transition touch-manipulation"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </>
                      )}

                      {/* 底部疊加文字與「＋換一張 / 新增隨手拍」按鈕 */}
                      <div className="relative z-10 p-3.5 bg-gradient-to-t from-black/80 via-black/45 to-transparent space-y-2.5">
                        {currentSnap.caption && (
                          <div className="flex justify-center">
                            <p className="inline-block max-w-full rounded-2xl bg-black/55 backdrop-blur-md border border-white/15 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white text-center break-words">
                              {currentSnap.caption}
                            </p>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleSwitchToCompose}
                            className="min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-semibold text-white shadow-lg inline-flex items-center gap-1.5 transition active:scale-95 touch-manipulation"
                            style={{ backgroundColor: 'var(--accent-500)' }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            換一張 / 新增隨手拍
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* 1:1 拍攝 / 上傳與加字模式 */
                    <form
                      onSubmit={handlePublishSnap}
                      className="relative w-full h-full flex flex-col justify-between text-white"
                    >
                      {draftPhoto && (
                        <img
                          src={draftPhoto}
                          alt="隨手拍預覽"
                          className="absolute inset-0 w-full h-full object-contain bg-[#141519]"
                        />
                      )}

                      {/* 頂部操作欄 */}
                      <div className="relative z-10 p-3.5 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent">
                        <div className="flex items-center gap-2">
                          {activeSnaps.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setMode('view')}
                              className="min-h-[32px] px-2.5 rounded-full bg-white/15 hover:bg-white/25 text-[11px] font-semibold inline-flex items-center gap-1 touch-manipulation"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                              返回查看
                            </button>
                          )}
                          <span className="text-xs font-bold">24h 隨手拍</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setModalOpen(false)}
                          aria-label="關閉"
                          className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center touch-manipulation"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {/* 中央選取照片區（未選照片時顯示拍照與相簿按鈕） */}
                      {!draftPhoto ? (
                        <div className="relative z-10 px-6 flex flex-col items-center justify-center gap-3 text-center">
                          <p className="text-xs text-white/75">
                            拍下現在的瞬間分享給對方，保留 24 小時後自動消失
                          </p>
                          <div className="grid grid-cols-2 gap-3 w-full">
                            <label className="min-h-[84px] rounded-2xl border border-white/20 bg-white/10 hover:bg-white/15 flex flex-col items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition active:scale-95 touch-manipulation">
                              <Camera className="h-5 w-5" />
                              <span>直接拍照</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handlePickPhoto}
                                className="hidden"
                              />
                            </label>
                            <label className="min-h-[84px] rounded-2xl border border-white/20 bg-white/10 hover:bg-white/15 flex flex-col items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition active:scale-95 touch-manipulation">
                              <ImagePlus className="h-5 w-5" />
                              <span>從相簿上傳</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handlePickPhoto}
                                className="hidden"
                              />
                            </label>
                          </div>
                          {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}
                        </div>
                      ) : (
                        <div className="relative z-10 px-4 flex justify-end">
                          <label className="px-3 py-1.5 rounded-full bg-black/55 border border-white/20 text-[11px] font-medium cursor-pointer hover:bg-black/75 transition touch-manipulation">
                            重新換一張
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handlePickPhoto}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}

                      {/* 底部加字輸入框與發布按鈕 */}
                      <div className="relative z-10 p-3.5 bg-gradient-to-t from-black/80 via-black/45 to-transparent space-y-2.5">
                        {draftPhoto && (
                          <input
                            ref={captionInputRef}
                            type="text"
                            maxLength={80}
                            value={draftCaption}
                            onChange={(e) => setDraftCaption(e.target.value)}
                            onPointerDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            onClick={() => captionInputRef.current?.focus()}
                            placeholder="在照片上輸入一句話..."
                            className="w-full min-h-[42px] rounded-2xl border border-white/25 bg-black/50 backdrop-blur-md px-3.5 py-2 text-base sm:text-sm text-white placeholder:text-white/55 outline-none pointer-events-auto select-text touch-manipulation focus:border-white"
                          />
                        )}

                        {errorMsg && draftPhoto && (
                          <p className="text-xs text-rose-400 text-center">{errorMsg}</p>
                        )}

                        <button
                          type="submit"
                          disabled={!draftPhoto || uploading}
                          className="w-full min-h-[42px] rounded-2xl text-xs font-semibold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-45 pointer-events-auto touch-manipulation"
                          style={{ backgroundColor: 'var(--accent-500)' }}
                        >
                          {uploading ? '傳送隨手拍中...' : '發布 24h 隨手拍'}
                        </button>
                      </div>
                    </form>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
};
