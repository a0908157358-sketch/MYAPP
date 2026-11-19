import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlipHorizontal2,
  ImagePlus,
  MessageCircleHeart,
  Plus,
  Send,
  SwitchCamera,
  Trash2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PartnerProfile, SnapReply, SnapStory } from '../types/couple';
import {
  compressCanvasToJpegDataUrl,
  compressImageFile,
  flipDataUrlHorizontal,
} from '../utils/imageCompression';

function generateSnapId(prefix = 'snap'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  // Locally tracked seen snap IDs for instant calm transition on tap
  const [locallySeenIds, setLocallySeenIds] = useState<string[]>([]);

  // Composer state
  const [draftPhoto, setDraftPhoto] = useState('');
  const [draftCaption, setDraftCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const captionInputRef = useRef<HTMLInputElement | null>(null);

  // Live web camera state (getUserMedia / <video> / <canvas>)
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraErr, setCameraErr] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const replyInputRef = useRef<HTMLInputElement | null>(null);

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

  // 判斷對方是否發了尚未點開看過的新隨手拍
  const hasUnreadSnap = useMemo(() => {
    return activeSnaps.some(
      (s) =>
        s.creatorUid !== myProfile.uid &&
        !(s.seenByUids || []).includes(myProfile.uid) &&
        !locallySeenIds.includes(s.id)
    );
  }, [activeSnaps, myProfile.uid, locallySeenIds]);

  // 展開看過後自動標記為已讀，讓呼吸提醒恢復平靜
  useEffect(() => {
    if (!modalOpen || mode !== 'view' || !currentSnap) return;
    if (currentSnap.creatorUid === myProfile.uid) return;

    const alreadySeenInDoc = (currentSnap.seenByUids || []).includes(myProfile.uid);
    const alreadySeenLocally = locallySeenIds.includes(currentSnap.id);

    if (!alreadySeenLocally) {
      setLocallySeenIds((prev) => (prev.includes(currentSnap.id) ? prev : [...prev, currentSnap.id]));
    }

    if (!alreadySeenInDoc) {
      const nextSeen = Array.from(
        new Set([...(currentSnap.seenByUids || []), myProfile.uid])
      ).slice(0, 4);
      updateDoc(doc(db, 'snaps', currentSnap.id), {
        seenByUids: nextSeen,
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(err, OperationType.UPDATE, `snaps/${currentSnap.id}`)
      );
    }
  }, [modalOpen, mode, currentSnap, myProfile.uid, locallySeenIds]);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!modalOpen || mode !== 'compose' || !cameraOpen) {
      stopCameraStream();
      return;
    }

    let cancelled = false;
    setCameraStarting(true);
    setCameraErr('');

    const startCamera = async () => {
      stopCameraStream();
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraErr('此瀏覽器不支援網頁即時相機，請改用下方「前鏡頭拍照」或「從相簿上傳」。');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          await video.play();
        }
      } catch (err) {
        if (!cancelled) {
          setCameraErr(
            err instanceof Error
              ? `無法開啟相機（${err.message}），請確認權限或改用原生拍照／相簿上傳。`
              : '無法開啟相機，請改用原生拍照或相簿上傳。'
          );
        }
      } finally {
        if (!cancelled) setCameraStarting(false);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [modalOpen, mode, cameraOpen, facingMode]);

  const handleOpenEdgeThumbnail = () => {
    setErrorMsg('');
    setCameraErr('');
    setCameraOpen(false);
    setReplyText('');
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
    setCameraErr('');
    setCameraOpen(false);
    setDraftPhoto('');
    setDraftCaption('');
    setMode('compose');
  };

  const handleCaptureFromWebCamera = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 判斷實際使用中的鏡頭方向（優先讀取 video track settings）
    const activeTrack = streamRef.current?.getVideoTracks()[0];
    const actualFacing = activeTrack?.getSettings?.().facingMode;
    const isFrontCamera = actualFacing ? actualFacing === 'user' : facingMode === 'user';

    ctx.save();
    if (isFrontCamera) {
      // 前置鏡頭修正：預覽時已鏡像顯示，繪製到 Canvas 時同步水平翻轉以維持肉眼一致方向
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const jpegDataUrl = compressCanvasToJpegDataUrl(canvas, {
      maxDim: 960,
      maxDataUrlLength: 360_000,
    });

    stopCameraStream();
    setCameraOpen(false);
    setDraftPhoto(jpegDataUrl);
  };

  const handleFlipDraftHorizontal = async () => {
    if (!draftPhoto) return;
    try {
      const flipped = await flipDataUrlHorizontal(draftPhoto, 360_000);
      setDraftPhoto(flipped);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '照片翻轉失敗');
    }
  };

  const handlePickPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    options: { mirrorHorizontal?: boolean } = {}
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');
    setCameraOpen(false);
    try {
      const compressed = await compressImageFile(file, {
        maxDim: 960,
        maxDataUrlLength: 360_000,
        mirrorHorizontal: options.mirrorHorizontal ?? false,
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
    const id = generateSnapId('snap');
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
        seenByUids: [myProfile.uid],
        replies: [],
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

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSnap || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    const cleanText = replyText.trim().slice(0, 200);
    const nextReply: SnapReply = {
      id: generateSnapId('reply'),
      senderUid: myProfile.uid,
      senderName: myProfile.nickname,
      text: cleanText,
      createdAtMs: Date.now(),
    };
    const nextReplies = [...(currentSnap.replies || []), nextReply].slice(-30);
    try {
      await updateDoc(doc(db, 'snaps', currentSnap.id), {
        replies: nextReplies,
        updatedAt: serverTimestamp(),
      });
      setReplyText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `snaps/${currentSnap.id}`);
    } finally {
      setSendingReply(false);
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
      {/* 右側邊緣半露小方框縮圖（固定精緻大小，預設向左傾斜 25 度，未讀時於 -28deg ~ -22deg 之間輕微晃動） */}
      <div className="fixed right-0 top-[44%] sm:top-[42%] z-30 pointer-events-none">
        <motion.div
          initial={{ rotate: -25 }}
          animate={
            hasUnreadSnap
              ? { rotate: [-25, -28, -22, -27, -23, -25] }
              : { rotate: -25 }
          }
          transition={
            hasUnreadSnap
              ? { duration: 1.35, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.25, ease: 'easeOut' }
          }
          style={{ transformOrigin: '78% 50%' }}
        >
          <button
            type="button"
            onClick={handleOpenEdgeThumbnail}
            aria-label={
              latestSnap
                ? `${hasUnreadSnap ? '未讀：' : ''}查看 ${latestSnap.creatorName} 的 24h 隨手拍`
                : '新增 24h 隨手拍'
            }
            className={`pointer-events-auto group relative flex items-center justify-start w-[82px] h-[82px] sm:w-[90px] sm:h-[90px] rounded-2xl overflow-hidden transition-transform duration-300 ease-out translate-x-[50%] hover:translate-x-[42%] touch-manipulation ${
              hasUnreadSnap
                ? 'border-2 border-[var(--accent-400)] ring-2 ring-[var(--accent-400)]/70 shadow-[0_0_24px_var(--accent-glow-1)]'
                : 'border-2 border-white/85 dark:border-white/35 shadow-2xl'
            }`}
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
                {/* 左側露出邊緣的未讀/新動態提示點 */}
                {hasUnreadSnap ? (
                  <span className="absolute top-2 left-2 flex h-3 w-3">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-80"
                      style={{ backgroundColor: 'var(--accent-400)' }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-3 w-3 ring-2 ring-white shadow"
                      style={{ backgroundColor: 'var(--accent-500)' }}
                    />
                  </span>
                ) : (
                  <span
                    className="absolute top-2 left-2 h-2.5 w-2.5 rounded-full ring-2 ring-white/90 shadow"
                    style={{ backgroundColor: 'var(--accent-500)' }}
                  />
                )}
              </>
            ) : (
              <div className="w-[46%] h-full flex flex-col items-center justify-center gap-0.5 text-[var(--text-primary)] bg-white/45 dark:bg-white/10 backdrop-blur-md border-r border-[var(--border-glass)]">
                <Plus className="h-4 w-4 text-[var(--accent-600)] dark:text-[var(--accent-400)]" />
                <span className="text-[10px] font-bold leading-tight [writing-mode:vertical-rl]">
                  隨手拍
                </span>
              </div>
            )}
          </button>
        </motion.div>
      </div>

      {/* 1:1 彈出正方形卡片 Modal（照片下方附即時回覆留言區，背景微暗模糊，點擊卡片外部即關閉） */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {modalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-5 pointer-events-auto">
                {/* 點擊外部關閉遮罩 */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setModalOpen(false)}
                  className="absolute inset-0 bg-black/65 backdrop-blur-md"
                  aria-hidden="true"
                />

                {mode === 'view' && currentSnap ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 12 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="24 小時隨手拍"
                    className="relative z-10 w-full max-w-[375px] sm:max-w-[415px] max-h-[88vh] rounded-3xl overflow-hidden bg-[#141519] border border-white/20 shadow-2xl flex flex-col pointer-events-auto"
                  >
                    {/* 上半部：嚴格 1:1 正方形照片展示區（object-contain 不裁切）+ 文字說明 */}
                    <div className="relative w-full aspect-square shrink-0 bg-[#141519] flex flex-col justify-between">
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

                      {/* 照片底部疊加文字與「＋換一張 / 新增隨手拍」按鈕 */}
                      <div className="relative z-10 p-3.5 bg-gradient-to-t from-black/80 via-black/45 to-transparent space-y-2">
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
                            className="min-h-[34px] px-3 py-1 rounded-full text-[11px] font-semibold text-white shadow-lg inline-flex items-center gap-1 transition active:scale-95 touch-manipulation"
                            style={{ backgroundColor: 'var(--accent-500)' }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            換一張 / 新增隨手拍
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 下半部：照片與文字說明下方的「即時回覆留言區」 */}
                    <div className="bg-[#181A20] border-t border-white/10 p-3.5 space-y-2.5 text-white shrink-0">
                      <div className="flex items-center justify-between text-[11px] text-white/60">
                        <span className="inline-flex items-center gap-1.5 font-medium text-white/80">
                          <MessageCircleHeart className="h-3.5 w-3.5 text-[var(--accent-400)]" />
                          回覆留言
                        </span>
                        <span className="font-mono-tabular">
                          {(currentSnap.replies || []).length} 則
                        </span>
                      </div>

                      <div className="max-h-[112px] overflow-y-auto space-y-1.5 pr-1">
                        {(currentSnap.replies || []).length === 0 ? (
                          <p className="text-[11px] text-white/40 py-1">
                            還沒人留言，寫下一句回應這張隨手拍吧…
                          </p>
                        ) : (
                          (currentSnap.replies || []).map((rep) => (
                            <div
                              key={rep.id}
                              className="rounded-xl bg-white/[0.06] border border-white/[0.08] px-2.5 py-1.5 text-xs flex items-baseline justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1 break-words">
                                <span
                                  className="font-semibold mr-1.5"
                                  style={{ color: 'var(--accent-400)' }}
                                >
                                  {rep.senderName}
                                </span>
                                <span className="text-white/90">{rep.text}</span>
                              </div>
                              <span className="text-[10px] font-mono-tabular text-white/45 shrink-0">
                                {formatPublishTime(rep.createdAtMs)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      <form onSubmit={handleSendReply} className="flex items-center gap-2">
                        <input
                          ref={replyInputRef}
                          type="text"
                          maxLength={200}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={() => replyInputRef.current?.focus()}
                          placeholder="回覆這張照片..."
                          className="flex-1 min-h-[38px] rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 text-base sm:text-xs text-white placeholder:text-white/45 outline-none pointer-events-auto select-text touch-manipulation focus:border-white/50"
                        />
                        <button
                          type="submit"
                          disabled={!replyText.trim() || sendingReply}
                          aria-label="送出回覆"
                          className="min-h-[38px] px-3 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-1 transition active:scale-95 disabled:opacity-40 pointer-events-auto touch-manipulation shrink-0"
                          style={{ backgroundColor: 'var(--accent-500)' }}
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>送出</span>
                        </button>
                      </form>
                    </div>
                  </motion.div>
                ) : (
                  /* 1:1 拍攝 / 上傳與加字模式 */
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 12 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="新增 24 小時隨手拍"
                    className="relative z-10 w-full max-w-[360px] sm:max-w-[400px] aspect-square rounded-3xl overflow-hidden bg-[#141519] border border-white/20 shadow-2xl flex flex-col justify-between pointer-events-auto"
                  >
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

                      {cameraOpen && !draftPhoto && (
                        <video
                          ref={videoRef}
                          autoPlay
                          muted
                          playsInline
                          className="absolute inset-0 w-full h-full object-contain bg-[#141519]"
                          style={{
                            transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                          }}
                        />
                      )}

                      {/* 頂部操作欄 */}
                      <div className="relative z-10 p-3.5 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent">
                        <div className="flex items-center gap-2">
                          {cameraOpen && !draftPhoto ? (
                            <button
                              type="button"
                              onClick={() => setCameraOpen(false)}
                              className="min-h-[32px] px-2.5 rounded-full bg-white/15 hover:bg-white/25 text-[11px] font-semibold inline-flex items-center gap-1 touch-manipulation"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                              返回選項
                            </button>
                          ) : (
                            activeSnaps.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setMode('view')}
                                className="min-h-[32px] px-2.5 rounded-full bg-white/15 hover:bg-white/25 text-[11px] font-semibold inline-flex items-center gap-1 touch-manipulation"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                返回查看
                              </button>
                            )
                          )}
                          <span className="text-xs font-bold">24h 隨手拍</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {cameraOpen && !draftPhoto && (
                            <button
                              type="button"
                              onClick={() =>
                                setFacingMode((prev) =>
                                  prev === 'user' ? 'environment' : 'user'
                                )
                              }
                              aria-label="切換前後鏡頭"
                              className="min-h-[32px] px-2.5 rounded-full bg-white/15 hover:bg-white/25 text-[11px] font-semibold inline-flex items-center gap-1 touch-manipulation"
                            >
                              <SwitchCamera className="h-3.5 w-3.5" />
                              {facingMode === 'user' ? '前鏡頭' : '後鏡頭'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setModalOpen(false)}
                            aria-label="關閉"
                            className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center touch-manipulation"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* 中央選取照片區 / 即時相機預覽狀態 */}
                      {!draftPhoto && !cameraOpen ? (
                        <div className="relative z-10 px-5 flex flex-col items-center justify-center gap-3 text-center">
                          <p className="text-xs text-white/75">
                            拍下現在的瞬間分享給對方，保留 24 小時後自動消失
                          </p>
                          <div className="grid grid-cols-2 gap-2.5 w-full">
                            <button
                              type="button"
                              onClick={() => {
                                setFacingMode('user');
                                setCameraOpen(true);
                              }}
                              className="min-h-[80px] rounded-2xl border border-white/20 bg-white/10 hover:bg-white/15 flex flex-col items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition active:scale-95 touch-manipulation"
                            >
                              <Camera className="h-5 w-5" />
                              <span>開啟網頁相機</span>
                            </button>
                            <label className="min-h-[80px] rounded-2xl border border-white/20 bg-white/10 hover:bg-white/15 flex flex-col items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition active:scale-95 touch-manipulation">
                              <ImagePlus className="h-5 w-5" />
                              <span>從相簿上傳</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handlePickPhoto(e)}
                                className="hidden"
                              />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-2.5 w-full">
                            <label className="min-h-[38px] rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/10 flex items-center justify-center gap-1.5 text-[11px] font-medium cursor-pointer transition touch-manipulation">
                              <SwitchCamera className="h-3.5 w-3.5" />
                              <span>前鏡頭拍照</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="user"
                                onChange={(e) =>
                                  handlePickPhoto(e, { mirrorHorizontal: true })
                                }
                                className="hidden"
                              />
                            </label>
                            <label className="min-h-[38px] rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/10 flex items-center justify-center gap-1.5 text-[11px] font-medium cursor-pointer transition touch-manipulation">
                              <Camera className="h-3.5 w-3.5" />
                              <span>後鏡頭拍照</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => handlePickPhoto(e)}
                                className="hidden"
                              />
                            </label>
                          </div>
                          {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}
                        </div>
                      ) : !draftPhoto && cameraOpen ? (
                        <div className="relative z-10 px-6 flex flex-col items-center justify-center text-center gap-2">
                          {cameraStarting && (
                            <p className="text-xs text-white/75 bg-black/45 px-3 py-1.5 rounded-full">
                              正在喚醒鏡頭...
                            </p>
                          )}
                          {cameraErr && (
                            <div className="rounded-2xl bg-black/75 border border-rose-400/35 px-4 py-3 space-y-2">
                              <p className="text-xs text-rose-300 leading-relaxed">{cameraErr}</p>
                              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 text-xs font-semibold cursor-pointer">
                                <Camera className="h-3.5 w-3.5" />
                                改用手機前鏡頭拍照
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="user"
                                  onChange={(e) =>
                                    handlePickPhoto(e, { mirrorHorizontal: true })
                                  }
                                  className="hidden"
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="relative z-10 px-4 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={handleFlipDraftHorizontal}
                            className="px-3 py-1.5 rounded-full bg-black/55 border border-white/20 text-[11px] font-medium hover:bg-black/75 transition touch-manipulation inline-flex items-center gap-1"
                          >
                            <FlipHorizontal2 className="h-3.5 w-3.5" />
                            左右翻轉
                          </button>
                          <label className="px-3 py-1.5 rounded-full bg-black/55 border border-white/20 text-[11px] font-medium cursor-pointer hover:bg-black/75 transition touch-manipulation">
                            重新換一張
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handlePickPhoto(e)}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}

                      {/* 底部操作區：相機模式顯示快門鍵，照片完成後顯示加字與發布 */}
                      <div className="relative z-10 p-3.5 bg-gradient-to-t from-black/80 via-black/45 to-transparent space-y-2.5">
                        {cameraOpen && !draftPhoto ? (
                          <div className="flex items-center justify-center pb-1">
                            <button
                              type="button"
                              disabled={cameraStarting || !!cameraErr}
                              onClick={handleCaptureFromWebCamera}
                              aria-label="按下快門拍照"
                              className="h-14 w-14 rounded-full border-4 border-white bg-white/25 hover:bg-white/40 active:scale-95 transition flex items-center justify-center disabled:opacity-40 touch-manipulation"
                            >
                              <span className="h-10 w-10 rounded-full bg-white shadow" />
                            </button>
                          </div>
                        ) : (
                          <>
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
                          </>
                        )}
                      </div>
                    </form>
                  </motion.div>
                )}
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
};
