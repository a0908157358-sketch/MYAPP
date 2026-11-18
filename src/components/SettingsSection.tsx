import React, { useState } from 'react';
import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import {
  Camera,
  Download,
  Lock,
  LogOut,
  Moon,
  Palette,
  RotateCcw,
  Share,
  Smartphone,
  Sun,
  UserCog,
  X,
} from 'lucide-react';
import { COUPLE_SPACE_DOC_ID } from '../config/coupleConfig';
import { usePWAInstall } from '../hooks/usePWA';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ColorMode, CoupleSpace, PartnerProfile } from '../types/couple';
import { CustomPalette } from '../utils/colorPalette';
import { compressImageFile } from '../utils/imageCompression';

export const SettingsSection: React.FC<{
  coupleSpace: CoupleSpace;
  myProfile: PartnerProfile;
  partner1DisplayName: string;
  partner2DisplayName: string;
  colorMode: ColorMode;
  customPalette: CustomPalette;
  onChangeColorMode: (mode: ColorMode) => void;
  onChangeCustomPalette: (next: CustomPalette) => void;
  onResetCustomPalette: () => void;
  onSignOut: () => void;
  allDocIdsToSyncEmail: {
    partners: string[];
    chalkboards: string[];
    vouchers: string[];
    wishlist: string[];
    timeline: string[];
    polaroids: string[];
    capsules: string[];
    memos: string[];
    snaps: string[];
  };
}> = ({
  coupleSpace,
  myProfile,
  partner1DisplayName,
  partner2DisplayName,
  colorMode,
  customPalette,
  onChangeColorMode,
  onChangeCustomPalette,
  onResetCustomPalette,
  onSignOut,
  allDocIdsToSyncEmail,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const [spaceTitle, setSpaceTitle] = useState(coupleSpace.spaceTitle);
  const [firstMetDate, setFirstMetDate] = useState(coupleSpace.firstMetDate);
  const [firstTogetherDate, setFirstTogetherDate] = useState(coupleSpace.firstTogetherDate);
  const [firstApartDate, setFirstApartDate] = useState(coupleSpace.firstApartDate);
  const [reunitedDate, setReunitedDate] = useState(coupleSpace.reunitedDate);
  const [partner1Birthday, setPartner1Birthday] = useState(coupleSpace.partner1Birthday);
  const [partner2Birthday, setPartner2Birthday] = useState(coupleSpace.partner2Birthday);
  const [partner2Email, setPartner2Email] = useState(coupleSpace.partner2Email);
  const [savingDates, setSavingDates] = useState(false);
  const [savedDatesNotice, setSavedDatesNotice] = useState(false);

  const [pinEnabled, setPinEnabled] = useState(coupleSpace.pinEnabled);
  const [pinCode, setPinCode] = useState(coupleSpace.pinCode || '0520');
  const [pinErr, setPinErr] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [savedPinNotice, setSavedPinNotice] = useState(false);

  const [nickname, setNickname] = useState(myProfile.nickname);
  const [avatarDataUrl, setAvatarDataUrl] = useState(myProfile.avatarDataUrl);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfileNotice, setSavedProfileNotice] = useState(false);

  const handleSaveDatesAndWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDates(true);
    const cleanP1 = coupleSpace.partner1Email.trim().toLowerCase();
    const cleanP2 = partner2Email.trim().toLowerCase() || 'yu67428@gmail.com';
    const nextAllowed = Array.from(new Set([cleanP1, cleanP2]));

    try {
      await updateDoc(doc(db, 'coupleSpace', COUPLE_SPACE_DOC_ID), {
        spaceTitle: spaceTitle.trim().slice(0, 40) || '嶼你 · 專屬絲絨空間',
        firstMetDate,
        firstTogetherDate,
        firstApartDate,
        reunitedDate,
        partner1Birthday,
        partner2Birthday,
        partner2Email: cleanP2,
        allowedEmails: nextAllowed,
        updatedBy: myProfile.uid,
        updatedAt: serverTimestamp(),
      });

      if (cleanP2 !== coupleSpace.partner2Email.toLowerCase()) {
        const batch = writeBatch(db);
        const addUpdates = (col: string, ids: string[]) => {
          ids.forEach((id) => {
            batch.update(doc(db, col, id), {
              allowedEmails: nextAllowed,
              updatedAt: serverTimestamp(),
            });
          });
        };
        addUpdates('partners', allDocIdsToSyncEmail.partners);
        addUpdates('chalkboards', allDocIdsToSyncEmail.chalkboards);
        addUpdates('vouchers', allDocIdsToSyncEmail.vouchers);
        addUpdates('wishlist', allDocIdsToSyncEmail.wishlist);
        addUpdates('timeline', allDocIdsToSyncEmail.timeline);
        addUpdates('polaroids', allDocIdsToSyncEmail.polaroids);
        addUpdates('capsules', allDocIdsToSyncEmail.capsules);
        addUpdates('memos', allDocIdsToSyncEmail.memos);
        addUpdates('snaps', allDocIdsToSyncEmail.snaps);
        await batch.commit();
      }

      setSavedDatesNotice(true);
      setTimeout(() => setSavedDatesNotice(false), 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `coupleSpace/${COUPLE_SPACE_DOC_ID}`);
    } finally {
      setSavingDates(false);
    }
  };

  const handleSavePinLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinEnabled && !/^\d{4}$/.test(pinCode)) {
      setPinErr('請輸入 4 位數字密碼（0-9）');
      return;
    }
    setPinErr('');
    setSavingPin(true);
    try {
      await updateDoc(doc(db, 'coupleSpace', COUPLE_SPACE_DOC_ID), {
        pinEnabled,
        pinCode: pinEnabled ? pinCode : '',
        updatedBy: myProfile.uid,
        updatedAt: serverTimestamp(),
      });
      setSavedPinNotice(true);
      setTimeout(() => setSavedPinNotice(false), 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `coupleSpace/${COUPLE_SPACE_DOC_ID}`);
    } finally {
      setSavingPin(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNick = nickname.trim();
    if (!cleanNick) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'partners', myProfile.uid), {
        nickname: cleanNick.slice(0, 30),
        roleLabel: cleanNick.slice(0, 20),
        avatarDataUrl,
        updatedAt: serverTimestamp(),
      });
      setSavedProfileNotice(true);
      setTimeout(() => setSavedProfileNotice(false), 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `partners/${myProfile.uid}`);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 溫潤奶茶淺色 / 高級碳灰深色 與自訂調色盤 (Color Picker) */}
      <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Palette className="h-5 w-5 text-[var(--accent-600)] dark:text-[var(--accent-400)]" />
            <div>
              <h2 className="text-base sm:text-lg font-bold">外觀模式與自訂調色盤</h2>
              <p className="text-xs text-[var(--text-muted)]">
                內建溫潤奶茶淺色與高級碳灰黑，亦可使用調色盤自由客製專屬色彩
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onResetCustomPalette}
            className="min-h-[36px] px-3 rounded-xl glass-card text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 transition active:scale-[0.98]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重設為預設奶茶與碳灰配色
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChangeColorMode('light')}
            className={`min-h-[52px] rounded-2xl px-4 py-3 border flex items-center justify-center gap-2 text-sm font-semibold transition ${
              colorMode === 'light'
                ? 'border-[var(--accent-500)] bg-white/80 text-slate-900 shadow-sm'
                : 'border-[var(--border-glass)] text-[var(--text-secondary)]'
            }`}
          >
            <Sun className="h-4 w-4" />
            溫潤奶茶淺色
          </button>
          <button
            type="button"
            onClick={() => onChangeColorMode('dark')}
            className={`min-h-[52px] rounded-2xl px-4 py-3 border flex items-center justify-center gap-2 text-sm font-semibold transition ${
              colorMode === 'dark'
                ? 'border-[var(--accent-500)] bg-white/10 text-white shadow-sm'
                : 'border-[var(--border-glass)] text-[var(--text-secondary)]'
            }`}
          >
            <Moon className="h-4 w-4" />
            高級碳灰深色
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="rounded-2xl p-3.5 border border-[var(--border-glass)] bg-white/40 dark:bg-white/[0.04] flex items-center justify-between gap-3 cursor-pointer hover:border-[var(--accent-500)] transition">
            <div className="min-w-0">
              <p className="text-xs font-bold">奶茶淺色底色</p>
              <p className="mt-0.5 text-[11px] font-mono-tabular uppercase text-[var(--text-muted)]">
                {customPalette.lightBg}
              </p>
            </div>
            <input
              type="color"
              aria-label="自訂奶茶淺色底色"
              value={customPalette.lightBg}
              onChange={(e) =>
                onChangeCustomPalette({ ...customPalette, lightBg: e.target.value })
              }
              className="h-10 w-12 rounded-xl border border-[var(--border-glass)] bg-transparent cursor-pointer shrink-0"
            />
          </label>

          <label className="rounded-2xl p-3.5 border border-[var(--border-glass)] bg-white/40 dark:bg-white/[0.04] flex items-center justify-between gap-3 cursor-pointer hover:border-[var(--accent-500)] transition">
            <div className="min-w-0">
              <p className="text-xs font-bold">深色碳灰底色</p>
              <p className="mt-0.5 text-[11px] font-mono-tabular uppercase text-[var(--text-muted)]">
                {customPalette.darkBg}
              </p>
            </div>
            <input
              type="color"
              aria-label="自訂深色碳灰底色"
              value={customPalette.darkBg}
              onChange={(e) =>
                onChangeCustomPalette({ ...customPalette, darkBg: e.target.value })
              }
              className="h-10 w-12 rounded-xl border border-[var(--border-glass)] bg-transparent cursor-pointer shrink-0"
            />
          </label>

          <label className="rounded-2xl p-3.5 border border-[var(--border-glass)] bg-white/40 dark:bg-white/[0.04] flex items-center justify-between gap-3 cursor-pointer hover:border-[var(--accent-500)] transition">
            <div className="min-w-0">
              <p className="text-xs font-bold">主題強調色</p>
              <p className="mt-0.5 text-[11px] font-mono-tabular uppercase text-[var(--text-muted)]">
                {customPalette.accent}
              </p>
            </div>
            <input
              type="color"
              aria-label="自訂主題強調色"
              value={customPalette.accent}
              onChange={(e) =>
                onChangeCustomPalette({ ...customPalette, accent: e.target.value })
              }
              className="h-10 w-12 rounded-xl border border-[var(--border-glass)] bg-transparent cursor-pointer shrink-0"
            />
          </label>
        </div>
      </section>

      {/* 2. 四個關鍵日期與雙方真實暱稱生日 */}
      <form
        onSubmit={handleSaveDatesAndWhitelist}
        className="glass-card rounded-3xl p-5 sm:p-6 space-y-4"
      >
        <div>
          <h2 className="text-base sm:text-lg font-bold">愛情關鍵日期與生日設定</h2>
          <p className="text-xs text-[var(--text-muted)]">
            若設定今日為復合日，首頁將正確計算並顯示為「第 1 天」
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              空間名稱
            </label>
            <input
              type="text"
              maxLength={40}
              value={spaceTitle}
              onChange={(e) => setSpaceTitle(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-sm outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              第一次認識日
            </label>
            <input
              type="date"
              required
              value={firstMetDate}
              onChange={(e) => setFirstMetDate(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-sm font-mono-tabular outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              第一次在一起日
            </label>
            <input
              type="date"
              required
              value={firstTogetherDate}
              onChange={(e) => setFirstTogetherDate(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-sm font-mono-tabular outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              第一次分開日
            </label>
            <input
              type="date"
              required
              value={firstApartDate}
              onChange={(e) => setFirstApartDate(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-sm font-mono-tabular outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              重新復合日
            </label>
            <input
              type="date"
              required
              value={reunitedDate}
              onChange={(e) => setReunitedDate(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-sm font-mono-tabular outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {partner1DisplayName} 的生日
            </label>
            <input
              type="date"
              required
              value={partner1Birthday}
              onChange={(e) => setPartner1Birthday(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-sm font-mono-tabular outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {partner2DisplayName} 的生日
            </label>
            <input
              type="date"
              required
              value={partner2Birthday}
              onChange={(e) => setPartner2Birthday(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-sm font-mono-tabular outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              授權登入信箱（雙人白名單）
            </label>
            <input
              type="email"
              required
              value={partner2Email}
              onChange={(e) => setPartner2Email(e.target.value)}
              placeholder="yu67428@gmail.com"
              className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-sm font-mono-tabular outline-none"
            />
            <p className="mt-1 text-[11px] font-mono-tabular text-[var(--text-muted)]">
              已綁定主信箱：{coupleSpace.partner1Email}
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={savingDates}
          className="w-full sm:w-auto min-h-[46px] px-6 rounded-2xl text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
          style={{ backgroundColor: 'var(--accent-500)' }}
        >
          {savedDatesNotice ? '已同步更新日期與設定 ✓' : savingDates ? '同步儲存中...' : '儲存日期與設定'}
        </button>
      </form>

      {/* 3. 4 位數隱私密碼鎖 */}
      <form
        onSubmit={handleSavePinLock}
        className="glass-card rounded-3xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Lock className="h-5 w-5" style={{ color: 'var(--accent-400)' }} />
            <div>
              <h2 className="text-base font-bold">App 啟動 4 位數隱私密碼鎖</h2>
              <p className="text-xs text-[var(--text-muted)]">
                開啟後每次打開網頁需先輸入 4 位數密碼才能進入
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={pinEnabled}
            onClick={() => setPinEnabled((v) => !v)}
            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              pinEnabled ? '' : 'bg-black/15 dark:bg-white/15'
            }`}
            style={pinEnabled ? { backgroundColor: 'var(--accent-500)' } : undefined}
          >
            <span
              className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow transition ${
                pinEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {pinEnabled && (
          <div className="max-w-xs space-y-1.5">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              設定 4 位數字密碼
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-lg font-mono-tabular tracking-[0.35em] outline-none"
            />
            {pinErr && <p className="text-xs text-rose-400">{pinErr}</p>}
          </div>
        )}

        <button
          type="submit"
          disabled={savingPin}
          className="min-h-[44px] px-5 rounded-2xl text-xs font-semibold text-white transition active:scale-[0.98]"
          style={{ backgroundColor: 'var(--accent-500)' }}
        >
          {savedPinNotice ? '隱私鎖設定已儲存 ✓' : savingPin ? '儲存中...' : '套用隱私鎖設定'}
        </button>
      </form>

      {/* 4. 我的暱稱頭貼 & PWA 安裝 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <form
          onSubmit={handleSaveProfile}
          className="glass-card rounded-3xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <UserCog className="h-5 w-5" style={{ color: 'var(--accent-400)' }} />
            <h2 className="text-base font-bold">我的暱稱與頭貼</h2>
          </div>

          <div className="flex items-center gap-4">
            <label className="relative cursor-pointer shrink-0">
              <div className="h-16 w-16 rounded-full overflow-hidden border border-[var(--border-glass)] bg-white/10 flex items-center justify-center">
                {avatarDataUrl ? (
                  <img
                    src={avatarDataUrl}
                    alt={nickname}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-semibold">{nickname.slice(0, 1)}</span>
                )}
              </div>
              <span
                className="absolute bottom-0 right-0 h-6 w-6 rounded-full text-white flex items-center justify-center shadow"
                style={{ backgroundColor: 'var(--accent-500)' }}
              >
                <Camera className="h-3 w-3" />
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const compressed = await compressImageFile(f, {
                    maxDim: 360,
                    maxDataUrlLength: 160_000,
                  });
                  setAvatarDataUrl(compressed);
                }}
                className="hidden"
              />
            </label>

            <div className="flex-1 space-y-1.5">
              <label className="block text-xs text-[var(--text-muted)]">顯示暱稱</label>
              <input
                type="text"
                maxLength={30}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="輸入您的真實暱稱"
                className="w-full rounded-xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-3 py-2.5 text-sm outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="min-h-[44px] px-5 rounded-2xl text-xs font-semibold text-white transition active:scale-[0.98]"
            style={{ backgroundColor: 'var(--accent-500)' }}
          >
            {savedProfileNotice ? '已更新個人名片 ✓' : savingProfile ? '更新中...' : '儲存暱稱與頭貼'}
          </button>
        </form>

        <div className="glass-card rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Smartphone className="h-5 w-5" style={{ color: 'var(--accent-400)' }} />
              <h2 className="text-base font-bold">iPhone Safari / PWA 安裝</h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              將「嶼你」加入主畫面後，可獲得無瀏覽器工具列的全螢幕原生質感體驗。
            </p>

            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="min-h-[44px] w-full rounded-2xl px-4 py-2.5 text-xs font-semibold text-white inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--accent-500)' }}
              >
                <Download className="h-4 w-4" />
                安裝為桌面應用程式 (PWA)
              </button>
            )}

            {!isInstalled && !isInstallable && (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="min-h-[44px] w-full rounded-2xl px-4 py-2.5 text-xs font-semibold glass-card inline-flex items-center justify-center gap-2"
              >
                <Share className="h-4 w-4" />
                {isIOS ? '查看 iPhone Safari 加入主畫面步驟' : '查看 PWA 加入主畫面說明'}
              </button>
            )}

            {isInstalled && (
              <p className="text-xs font-medium text-emerald-400">
                ✓ 目前已以獨立 PWA 模式運行
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="min-h-[46px] w-full rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-semibold inline-flex items-center justify-center gap-2 transition active:scale-[0.98]"
          >
            <LogOut className="h-4 w-4" />
            登出目前 Google 帳號（{myProfile.email}）
          </button>
        </div>
      </div>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card-strong w-full max-w-sm rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">加入 iPhone 主畫面步驟</h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="space-y-2.5 text-sm text-[var(--text-secondary)] list-decimal pl-5">
              <li>使用 iPhone Safari 開啟本網址。</li>
              <li>點擊瀏覽器底部工具列的 <strong>分享按鈕（方形向上箭頭）</strong>。</li>
              <li>往下滑動選單並點擊 <strong>「加入主畫面」</strong>。</li>
              <li>點擊右上角「新增」，即可獲得獨立桌面 App 圖示。</li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full min-h-[44px] rounded-2xl text-xs font-semibold text-white"
              style={{ backgroundColor: 'var(--accent-500)' }}
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
