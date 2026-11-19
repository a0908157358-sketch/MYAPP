import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { doc, serverTimestamp, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  Camera,
  Check,
  CheckCircle2,
  KeyRound,
  Plus,
  QrCode,
  ScanLine,
  Sparkles,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PartnerProfile, WishRequest, WishVoucher } from '../types/couple';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generate4DigitPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function formatDateTimeNow(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
}

export const VoucherSection: React.FC<{
  activeProfile: PartnerProfile;
  realMyUid: string;
  vouchers: WishVoucher[];
  wishRequests: WishRequest[];
  allowedEmails: string[];
  isPreviewPerspective?: boolean;
  onRefreshData?: () => void;
}> = ({
  activeProfile,
  realMyUid,
  vouchers,
  wishRequests,
  allowedEmails,
  isPreviewPerspective = false,
  onRefreshData,
}) => {
  const [subTab, setSubTab] = useState<'wallet' | 'sent' | 'redeemed'>('wallet');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWishRequestModal, setShowWishRequestModal] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [creating, setCreating] = useState(false);

  // 向對方許願表單狀態
  const [wishTitle, setWishTitle] = useState('');
  const [wishDesc, setWishDesc] = useState('');
  const [wishExpiresAt, setWishExpiresAt] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [sendingWish, setSendingWish] = useState(false);
  const [respondingWishId, setRespondingWishId] = useState<string | null>(null);

  // 收券人核銷視窗
  const [redeemTargetId, setRedeemTargetId] = useState<string | null>(null);
  const [redeemMode, setRedeemMode] = useState<'qr' | 'pin'>('qr');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [submittingPin, setSubmittingPin] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 建立人掃碼 / 密碼核銷視窗
  const [scanTargetVoucher, setScanTargetVoucher] = useState<WishVoucher | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [scanSuccessMsg, setScanSuccessMsg] = useState('');
  const [creatorPinConfirm, setCreatorPinConfirm] = useState('');
  const [creatorPinErr, setCreatorPinErr] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const redeemTarget = useMemo(
    () => vouchers.find((v) => v.id === redeemTargetId) || null,
    [vouchers, redeemTargetId]
  );

  const receivedActive = useMemo(
    () => vouchers.filter((v) => v.status === 'active' && v.creatorUid !== activeProfile.uid),
    [vouchers, activeProfile.uid]
  );
  const sentActive = useMemo(
    () => vouchers.filter((v) => v.status === 'active' && v.creatorUid === activeProfile.uid),
    [vouchers, activeProfile.uid]
  );
  const redeemedList = useMemo(
    () => vouchers.filter((v) => v.status === 'redeemed'),
    [vouchers]
  );

  // 對方許給我的待回應許願請求（顯示在頁面最上方）
  const incomingPendingWishes = useMemo(
    () =>
      wishRequests.filter(
        (r) => r.status === 'pending' && r.requesterUid !== activeProfile.uid
      ),
    [wishRequests, activeProfile.uid]
  );

  // 我向對方許的願望（等待對方回應中）
  const myPendingWishes = useMemo(
    () =>
      wishRequests.filter(
        (r) => r.status === 'pending' && r.requesterUid === activeProfile.uid
      ),
    [wishRequests, activeProfile.uid]
  );

  useEffect(() => {
    if (!redeemTarget || redeemTarget.status !== 'active') return;

    if (!redeemTarget.redeemCode && !isPreviewPerspective) {
      const code = generate4DigitPin();
      updateDoc(doc(db, 'vouchers', redeemTarget.id), {
        redeemCode: code,
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(err, OperationType.UPDATE, `vouchers/${redeemTarget.id}`)
      );
    }

    if (redeemMode === 'qr' && qrCanvasRef.current) {
      const qrPayload = JSON.stringify({
        voucherId: redeemTarget.id,
        qrToken: redeemTarget.qrToken,
      });
      QRCode.toCanvas(
        qrCanvasRef.current,
        qrPayload,
        {
          width: 220,
          margin: 2,
          color: { dark: '#0B0A10', light: '#FFFFFF' },
        },
        (err) => {
          if (err) console.error('QR render failed:', err);
        }
      );
    }
  }, [redeemTarget, redeemMode, isPreviewPerspective]);

  useEffect(() => {
    if (!scanTargetVoucher) return;

    let stream: MediaStream | null = null;
    let rafId = 0;
    let cancelled = false;
    setCameraError('');
    setScanSuccessMsg('');
    setCreatorPinConfirm('');
    setCreatorPinErr('');

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('此瀏覽器不支援相機存取，可使用下方 4 位數密碼核銷。');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        const tick = async () => {
          if (cancelled || !videoRef.current || !scanCanvasRef.current) return;
          const v = videoRef.current;
          const c = scanCanvasRef.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const imageData = ctx.getImageData(0, 0, c.width, c.height);
              const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (decoded?.data) {
                try {
                  const parsed = JSON.parse(decoded.data);
                  if (
                    parsed?.voucherId === scanTargetVoucher.id &&
                    parsed?.qrToken === scanTargetVoucher.qrToken
                  ) {
                    cancelled = true;
                    await updateDoc(doc(db, 'vouchers', scanTargetVoucher.id), {
                      status: 'redeemed',
                      redeemedAt: formatDateTimeNow(),
                      redeemedMethod: 'qr',
                      redeemedByUid: realMyUid,
                      updatedAt: serverTimestamp(),
                    });
                    onRefreshData?.();
                    setScanSuccessMsg('QR Code 驗證成功，已完成核銷！');
                    setTimeout(() => setScanTargetVoucher(null), 1300);
                    return;
                  }
                } catch {
                  // 忽略非本券 QR
                }
              }
            }
          }
          rafId = window.requestAnimationFrame(tick);
        };
        rafId = window.requestAnimationFrame(tick);
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? `無法開啟相機（${err.message}），請確認 Safari 相機權限或使用 4 位數密碼核銷。`
            : '無法存取相機權限'
        );
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [scanTargetVoucher, realMyUid]);

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isPreviewPerspective) return;
    setCreating(true);
    const id = generateId('voucher');
    const recipientEmail =
      allowedEmails.find((em) => em !== activeProfile.email.toLowerCase()) ||
      activeProfile.email.toLowerCase();

    try {
      await setDoc(doc(db, 'vouchers', id), {
        id,
        creatorUid: realMyUid,
        creatorEmail: activeProfile.email.toLowerCase(),
        creatorName: activeProfile.nickname,
        recipientEmail,
        title: title.trim().slice(0, 60),
        description: description.trim().slice(0, 300),
        expiresAt,
        status: 'active',
        redeemCode: generate4DigitPin(),
        qrToken: Math.random().toString(36).slice(2) + Date.now().toString(36),
        redeemedAt: '',
        redeemedMethod: '',
        redeemedByUid: '',
        allowedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTitle('');
      setDescription('');
      setShowCreateModal(false);
      setSubTab('sent');
      onRefreshData?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `vouchers/${id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitWishRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wishTitle.trim() || isPreviewPerspective) return;
    setSendingWish(true);
    const id = generateId('wishreq');
    const targetEmail =
      allowedEmails.find((em) => em !== activeProfile.email.toLowerCase()) ||
      activeProfile.email.toLowerCase();

    try {
      await setDoc(doc(db, 'wishRequests', id), {
        id,
        requesterUid: realMyUid,
        requesterEmail: activeProfile.email.toLowerCase(),
        requesterName: activeProfile.nickname,
        targetEmail,
        title: wishTitle.trim().slice(0, 60),
        description: wishDesc.trim().slice(0, 300),
        expiresAt: wishExpiresAt,
        status: 'pending',
        convertedVoucherId: '',
        allowedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setWishTitle('');
      setWishDesc('');
      setShowWishRequestModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `wishRequests/${id}`);
    } finally {
      setSendingWish(false);
    }
  };

  const handleAcceptWishRequest = async (req: WishRequest) => {
    if (isPreviewPerspective || respondingWishId) return;
    setRespondingWishId(req.id);
    const voucherId = generateId('voucher');
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'vouchers', voucherId), {
        id: voucherId,
        creatorUid: realMyUid,
        creatorEmail: activeProfile.email.toLowerCase(),
        creatorName: activeProfile.nickname,
        recipientEmail: req.requesterEmail,
        title: req.title.slice(0, 60),
        description: req.description.slice(0, 300),
        expiresAt: req.expiresAt || '',
        status: 'active',
        redeemCode: generate4DigitPin(),
        qrToken: Math.random().toString(36).slice(2) + Date.now().toString(36),
        redeemedAt: '',
        redeemedMethod: '',
        redeemedByUid: '',
        allowedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'wishRequests', req.id), {
        status: 'accepted',
        convertedVoucherId: voucherId,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setSubTab('sent');
      onRefreshData?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `wishRequests/${req.id}`);
    } finally {
      setRespondingWishId(null);
    }
  };

  const handleDeclineWishRequest = async (req: WishRequest) => {
    if (isPreviewPerspective || respondingWishId) return;
    setRespondingWishId(req.id);
    try {
      await updateDoc(doc(db, 'wishRequests', req.id), {
        status: 'declined',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `wishRequests/${req.id}`);
    } finally {
      setRespondingWishId(null);
    }
  };

  const handleVerifyPinRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemTarget || isPreviewPerspective) return;
    if (pinInput.trim().length !== 4) {
      setPinError('請輸入完整 4 位數兌換碼');
      return;
    }
    if (!redeemTarget.redeemCode || pinInput.trim() !== redeemTarget.redeemCode) {
      setPinError('兌換碼不正確，請再確認一次');
      return;
    }

    setSubmittingPin(true);
    setPinError('');
    try {
      await updateDoc(doc(db, 'vouchers', redeemTarget.id), {
        status: 'redeemed',
        redeemedAt: formatDateTimeNow(),
        redeemedMethod: 'pin',
        redeemedByUid: realMyUid,
        updatedAt: serverTimestamp(),
      });
      setPinInput('');
      setRedeemTargetId(null);
      setSubTab('redeemed');
      onRefreshData?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vouchers/${redeemTarget.id}`);
    } finally {
      setSubmittingPin(false);
    }
  };

  const handleCreatorPinRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanTargetVoucher || isPreviewPerspective) return;
    if (creatorPinConfirm.trim() !== scanTargetVoucher.redeemCode) {
      setCreatorPinErr('4 位數密碼不符，請向對方確認');
      return;
    }
    try {
      await updateDoc(doc(db, 'vouchers', scanTargetVoucher.id), {
        status: 'redeemed',
        redeemedAt: formatDateTimeNow(),
        redeemedMethod: 'pin',
        redeemedByUid: realMyUid,
        updatedAt: serverTimestamp(),
      });
      setScanTargetVoucher(null);
      setSubTab('redeemed');
      onRefreshData?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vouchers/${scanTargetVoucher.id}`);
    }
  };

  const currentList =
    subTab === 'wallet' ? receivedActive : subTab === 'sent' ? sentActive : redeemedList;

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">專屬願望券夾</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            {isPreviewPerspective
              ? `正預覽 ${activeProfile.nickname} 的票券夾視角`
              : '支援 QR Code 相機掃描與 4 位數密碼雙向即時核銷'}
          </p>
        </div>

        {!isPreviewPerspective && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowWishRequestModal(true)}
              className="min-h-[44px] px-4 py-2.5 rounded-2xl text-sm font-semibold glass-card border border-[var(--accent-500)]/40 text-[var(--accent-600)] dark:text-[var(--accent-400)] inline-flex items-center justify-center gap-2 transition active:scale-[0.98] whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              向對方許願
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="min-h-[44px] px-4 py-2.5 rounded-2xl text-sm font-semibold text-white shadow-sm inline-flex items-center justify-center gap-2 transition active:scale-[0.98] whitespace-nowrap"
              style={{ backgroundColor: 'var(--accent-500)' }}
            >
              <Plus className="h-4 w-4" />
              製作願望券送給對方
            </button>
          </div>
        )}
      </div>

      {/* 頂部「待回應的許願請求」卡片區 */}
      {incomingPendingWishes.length > 0 && (
        <div className="space-y-3">
          {incomingPendingWishes.map((req) => {
            const busy = respondingWishId === req.id;
            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-3xl p-5 border border-[var(--accent-500)]/45 shadow-lg space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-600)] dark:text-[var(--accent-400)]"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      待回應的許願請求 · 來自 {req.requesterName}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold tracking-tight break-words">
                      {req.title}
                    </h3>
                    {req.description && (
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed break-words">
                        {req.description}
                      </p>
                    )}
                    <p className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                      期望期限：{req.expiresAt || '無期限'}
                    </p>
                  </div>
                </div>

                {!isPreviewPerspective && (
                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDeclineWishRequest(req)}
                      className="min-h-[42px] px-4 rounded-2xl glass-card text-xs font-semibold text-[var(--text-secondary)] hover:text-rose-400 inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98] disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      婉拒
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAcceptWishRequest(req)}
                      className="flex-1 min-h-[42px] px-4 rounded-2xl text-xs font-semibold text-white shadow inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98] disabled:opacity-50"
                      style={{ backgroundColor: 'var(--accent-500)' }}
                    >
                      <Check className="h-4 w-4" />
                      {busy ? '處理中...' : '同意並自動轉為願望券'}
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 我送出的等待回應中許願清單 */}
      {myPendingWishes.length > 0 && (
        <div className="glass-card rounded-2xl px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-500)]" />
            已向對方許願，等待對方同意轉券（{myPendingWishes.length}）
          </p>
          <div className="space-y-1.5">
            {myPendingWishes.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between gap-2 text-xs rounded-xl bg-black/[0.04] dark:bg-white/[0.04] px-3 py-2"
              >
                <span className="font-medium truncate">{req.title}</span>
                {!isPreviewPerspective && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteDoc(doc(db, 'wishRequests', req.id));
                      } catch (err) {
                        handleFirestoreError(err, OperationType.DELETE, `wishRequests/${req.id}`);
                      }
                    }}
                    className="text-[11px] text-[var(--text-muted)] hover:text-rose-400 shrink-0"
                  >
                    收回
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-card w-full sm:w-fit">
        {[
          { id: 'wallet' as const, label: `我的票券夾 (${receivedActive.length})` },
          { id: 'sent' as const, label: `我送出的券 (${sentActive.length})` },
          { id: 'redeemed' as const, label: `已兌換 (${redeemedList.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              subTab === tab.id
                ? 'bg-white/90 text-slate-900 dark:bg-white/15 dark:text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentList.length === 0 ? (
        <div className="glass-card rounded-3xl p-8 text-center">
          <Ticket className="h-9 w-9 mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-sm font-medium">
            {subTab === 'wallet'
              ? '目前票券夾還沒有待使用的願望券'
              : subTab === 'sent'
                ? '尚未送出新的願望券給對方'
                : '尚未有已核銷完成的願望券紀錄'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentList.map((voucher) => {
            const isCreator = voucher.creatorUid === activeProfile.uid;
            const isRedeemed = voucher.status === 'redeemed';

            return (
              <motion.div
                key={voucher.id}
                layout
                className="glass-card rounded-3xl p-5 relative overflow-hidden flex flex-col justify-between gap-4"
              >
                {isRedeemed && (
                  <div className="pointer-events-none absolute top-4 right-4 rotate-[-12deg] border-2 border-emerald-400/75 text-emerald-400 rounded-xl px-3 py-1 text-xs font-bold tracking-widest">
                    已兌換完成
                  </div>
                )}

                <div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {isCreator ? `${activeProfile.nickname} 送出的心意` : `來自 ${voucher.creatorName}`}
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    期限 {voucher.expiresAt || '無期限'}
                  </p>
                  <h3 className="mt-1.5 text-lg font-bold tracking-tight pr-20">
                    {voucher.title}
                  </h3>
                  {voucher.description && (
                    <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                      {voucher.description}
                    </p>
                  )}
                </div>

                {!isRedeemed && isCreator && voucher.redeemCode && (
                  <div className="rounded-2xl border border-[var(--border-glass)] bg-white/50 dark:bg-white/[0.04] px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        此張願望券 4 位數兌換密碼
                      </p>
                      <p
                        className="font-mono-tabular text-2xl font-bold tracking-[0.25em] text-[var(--accent-600)] dark:text-[var(--accent-400)]"
                      >
                        {voucher.redeemCode}
                      </p>
                    </div>
                    <KeyRound className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
                  </div>
                )}

                <div className="pt-3 border-t border-[var(--border-glass)] flex items-center justify-between gap-2">
                  {isRedeemed ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="font-mono-tabular">
                        {voucher.redeemedAt} · {voucher.redeemedMethod === 'qr' ? 'QR 掃碼核銷' : '4位數密碼核銷'}
                      </span>
                    </div>
                  ) : isCreator ? (
                    <button
                      type="button"
                      disabled={isPreviewPerspective}
                      onClick={() => setScanTargetVoucher(voucher)}
                      className="min-h-[44px] flex-1 rounded-2xl px-4 py-2 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-50"
                      style={{ backgroundColor: 'var(--accent-500)' }}
                    >
                      <ScanLine className="h-4 w-4" />
                      掃碼 / 密碼核銷
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRedeemTargetId(voucher.id);
                        setRedeemMode('qr');
                        setPinInput('');
                        setPinError('');
                      }}
                      className="min-h-[44px] flex-1 rounded-2xl px-4 py-2 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 transition active:scale-[0.98]"
                      style={{ backgroundColor: 'var(--accent-500)' }}
                    >
                      <QrCode className="h-4 w-4" />
                      我要兌換
                    </button>
                  )}

                  {!isPreviewPerspective && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await deleteDoc(doc(db, 'vouchers', voucher.id));
                          onRefreshData?.();
                        } catch (error) {
                          handleFirestoreError(error, OperationType.DELETE, `vouchers/${voucher.id}`);
                        }
                      }}
                      aria-label="刪除願望券"
                      className="min-h-[44px] min-w-[44px] rounded-2xl glass-card flex items-center justify-center text-[var(--text-muted)] hover:text-rose-400 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 製作願望券 Modal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {showCreateModal && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-auto">
                <div
                  onClick={() => setShowCreateModal(false)}
                  className="absolute inset-0 bg-black/55 backdrop-blur-sm"
                  aria-hidden="true"
                />
                <motion.form
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  onSubmit={handleCreateVoucher}
                  className="relative z-10 glass-card-strong w-full max-w-md rounded-3xl p-6 space-y-4 pointer-events-auto"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">製作專屬願望券</h3>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--text-muted)]"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      願望券標題
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="例如：無條件抱抱 10 分鐘券"
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-3 text-base sm:text-sm outline-none pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      內容說明
                    </label>
                    <textarea
                      rows={3}
                      maxLength={300}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="寫下使用說明或附註..."
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-3 text-base sm:text-sm outline-none resize-none pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      有效期限
                    </label>
                    <input
                      type="date"
                      required
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-3 text-base sm:text-sm outline-none font-mono-tabular pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={creating}
                    className="w-full min-h-[48px] rounded-2xl text-sm font-semibold text-white shadow transition active:scale-[0.98]"
                    style={{ backgroundColor: 'var(--accent-500)' }}
                  >
                    {creating ? '送出中...' : '送出到對方的票券夾'}
                  </button>
                </motion.form>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* 向對方許願 Modal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {showWishRequestModal && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-auto">
                <div
                  onClick={() => setShowWishRequestModal(false)}
                  className="absolute inset-0 bg-black/55 backdrop-blur-sm"
                  aria-hidden="true"
                />
                <motion.form
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  onSubmit={handleSubmitWishRequest}
                  className="relative z-10 glass-card-strong w-full max-w-md rounded-3xl p-6 space-y-4 pointer-events-auto"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold">向對方許下一個願望</h3>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        對方同意後，將自動轉為你的專屬未使用願望券
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowWishRequestModal(false)}
                      className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--text-muted)]"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      許願標題
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={wishTitle}
                      onChange={(e) => setWishTitle(e.target.value)}
                      placeholder="例如：陪我去吃巷口那家深夜拉麵"
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-3 text-base sm:text-sm outline-none pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      許願內容說明
                    </label>
                    <textarea
                      rows={3}
                      maxLength={300}
                      value={wishDesc}
                      onChange={(e) => setWishDesc(e.target.value)}
                      placeholder="寫下希望對方幫你完成的心願細節..."
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-3 text-base sm:text-sm outline-none resize-none pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      期望兌換期限
                    </label>
                    <input
                      type="date"
                      required
                      value={wishExpiresAt}
                      onChange={(e) => setWishExpiresAt(e.target.value)}
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-3 text-base sm:text-sm outline-none font-mono-tabular pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sendingWish || !wishTitle.trim()}
                    className="w-full min-h-[48px] rounded-2xl text-sm font-semibold text-white shadow transition active:scale-[0.98] disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent-500)' }}
                  >
                    {sendingWish ? '送出許願中...' : '送出許願請求給對方'}
                  </button>
                </motion.form>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* 收券人核銷視窗 */}
      <AnimatePresence>
        {redeemTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="glass-card-strong w-full max-w-md rounded-3xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">核銷願望券</p>
                  <h3 className="text-lg font-bold">{redeemTarget.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRedeemTargetId(null)}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--text-muted)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {redeemTarget.status === 'redeemed' ? (
                <div className="py-8 text-center space-y-3">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-400" />
                  <p className="text-base font-bold">已完成兌換！</p>
                  <p className="text-xs font-mono-tabular text-[var(--text-muted)]">
                    {redeemTarget.redeemedAt}
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-black/[0.06] dark:bg-white/5">
                    <button
                      type="button"
                      onClick={() => setRedeemMode('qr')}
                      className={`min-h-[40px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        redeemMode === 'qr'
                          ? 'bg-white/90 text-slate-900 dark:bg-white/15 dark:text-white shadow-sm'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      <QrCode className="h-4 w-4" />
                      出示 QR Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setRedeemMode('pin')}
                      className={`min-h-[40px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        redeemMode === 'pin'
                          ? 'bg-white/90 text-slate-900 dark:bg-white/15 dark:text-white shadow-sm'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      <KeyRound className="h-4 w-4" />
                      輸入 4 位數密碼
                    </button>
                  </div>

                  {redeemMode === 'qr' ? (
                    <div className="flex flex-col items-center py-4 space-y-3">
                      <div className="rounded-3xl bg-white p-4 shadow-lg">
                        <canvas ref={qrCanvasRef} />
                      </div>
                      <p className="text-xs text-center text-[var(--text-secondary)]">
                        請讓送出此券的 {redeemTarget.creatorName} 掃描此 QR Code
                      </p>
                      {redeemTarget.redeemCode && (
                        <p className="text-xs text-[var(--text-muted)]">
                          或報出 4 位數驗證碼：
                          <span className="ml-1 font-mono-tabular font-bold text-[var(--accent-600)] dark:text-[var(--accent-400)]">
                            {redeemTarget.redeemCode}
                          </span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleVerifyPinRedeem} className="space-y-4 py-2">
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        輸入對方手機上顯示的 4 位數隨機密碼即可完成兌換：
                      </p>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={pinInput}
                        onChange={(e) => {
                          setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                          setPinError('');
                        }}
                        placeholder="4 位數"
                        className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-4 text-center text-2xl font-mono-tabular font-bold tracking-[0.4em] outline-none"
                      />
                      {pinError && <p className="text-xs text-rose-400 text-center">{pinError}</p>}
                      <button
                        type="submit"
                        disabled={submittingPin || isPreviewPerspective}
                        className="w-full min-h-[48px] rounded-2xl text-sm font-semibold text-white shadow transition active:scale-[0.98]"
                        style={{ backgroundColor: 'var(--accent-500)' }}
                      >
                        {submittingPin ? '核銷驗證中...' : '確認密碼並完成兌換'}
                      </button>
                    </form>
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 建立人掃碼 / 輸入密碼核銷視窗 */}
      <AnimatePresence>
        {scanTargetVoucher && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              className="glass-card-strong w-full max-w-md rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-[var(--accent-600)] dark:text-[var(--accent-400)]" />
                  <h3 className="text-base font-bold">掃描對方願望券或密碼核銷</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setScanTargetVoucher(null)}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--text-muted)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-[var(--text-secondary)]">
                核銷券別：<span className="font-semibold">{scanTargetVoucher.title}</span>
              </p>

              <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-square flex items-center justify-center">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                <canvas ref={scanCanvasRef} className="hidden" />
                <div className="pointer-events-none absolute inset-12 border-2 border-white/70 rounded-2xl shadow-[0_0_0_999px_rgba(0,0,0,0.4)]" />
              </div>

              {scanSuccessMsg && (
                <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-xs font-semibold text-emerald-400 text-center">
                  {scanSuccessMsg}
                </div>
              )}

              {cameraError && (
                <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-xs text-rose-400">
                  {cameraError}
                </div>
              )}

              {scanTargetVoucher.redeemCode && (
                <form
                  onSubmit={handleCreatorPinRedeem}
                  className="pt-3 border-t border-[var(--border-glass)] space-y-2.5"
                >
                  <p className="text-xs text-[var(--text-muted)]">
                    若遠距離核銷，也可向對方索取這張券的 4 位數密碼（提示：
                    <span className="font-mono-tabular font-bold text-[var(--accent-600)] dark:text-[var(--accent-400)]">
                      {scanTargetVoucher.redeemCode}
                    </span>
                    ）並輸入確認：
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={creatorPinConfirm}
                      onChange={(e) => {
                        setCreatorPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4));
                        setCreatorPinErr('');
                      }}
                      placeholder="輸入 4 位數"
                      className="flex-1 rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-center font-mono-tabular font-bold tracking-[0.25em] outline-none"
                    />
                    <button
                      type="submit"
                      className="min-h-[44px] px-4 rounded-2xl text-xs font-semibold text-white shrink-0"
                      style={{ backgroundColor: 'var(--accent-500)' }}
                    >
                      密碼核銷
                    </button>
                  </div>
                  {creatorPinErr && <p className="text-xs text-rose-400">{creatorPinErr}</p>}
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
};
