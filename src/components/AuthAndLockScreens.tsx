import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Camera,
  Delete,
  Heart,
  Lock,
  LogOut,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { PartnerRole } from '../types/couple';
import { compressImageFile } from '../utils/imageCompression';

/* -------------------------------------------------------------------------- */
/* 1. 4 位數 App 啟動隱私密碼鎖                                                */
/* -------------------------------------------------------------------------- */
export const PinLockScreen: React.FC<{
  expectedPin: string;
  spaceTitle: string;
  onUnlock: () => void;
}> = ({ expectedPin, spaceTitle, onUnlock }) => {
  const [digits, setDigits] = useState<string>('');
  const [errorShake, setErrorShake] = useState(false);
  const [errorText, setErrorText] = useState('');

  const handlePress = (num: string) => {
    if (digits.length >= 4) return;
    const next = digits + num;
    setDigits(next);
    setErrorText('');

    if (next.length === 4) {
      if (next === expectedPin) {
        setTimeout(onUnlock, 150);
      } else {
        setErrorShake(true);
        setErrorText('密碼不正確，請重新輸入');
        setTimeout(() => {
          setErrorShake(false);
          setDigits('');
        }, 550);
      }
    }
  };

  const handleDelete = () => {
    setDigits((prev) => prev.slice(0, -1));
    setErrorText('');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div
        className="pointer-events-none fixed -top-28 -left-24 h-80 w-80 rounded-full blur-3xl"
        style={{ backgroundColor: 'var(--accent-glow-1)' }}
      />
      <div
        className="pointer-events-none fixed -bottom-28 -right-24 h-80 w-80 rounded-full blur-3xl"
        style={{ backgroundColor: 'var(--accent-glow-2)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card-strong w-full max-w-sm rounded-3xl p-8 relative z-10 text-center"
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md"
          style={{
            background: 'linear-gradient(135deg, var(--accent-400), var(--accent-600))',
          }}
        >
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{spaceTitle}</h1>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
          請輸入 4 位數隱私密碼進入
        </p>

        <motion.div
          animate={errorShake ? { x: [-8, 8, -6, 6, 0] } : {}}
          transition={{ duration: 0.35 }}
          className="mt-7 mb-3 flex items-center justify-center gap-4"
        >
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < digits.length;
            return (
              <div
                key={idx}
                className="h-4 w-4 rounded-full transition-all duration-150 border"
                style={{
                  backgroundColor: filled ? 'var(--accent-500)' : 'transparent',
                  borderColor: filled ? 'var(--accent-500)' : 'var(--text-muted)',
                  transform: filled ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            );
          })}
        </motion.div>

        <div className="h-5 text-xs text-rose-400 font-medium">{errorText}</div>

        <div className="mt-4 grid grid-cols-3 gap-3.5 max-w-[260px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handlePress(n)}
              className="glass-card h-16 rounded-2xl text-xl font-mono-tabular font-semibold flex items-center justify-center transition hover:scale-[1.03] active:scale-95"
            >
              {n}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => handlePress('0')}
            className="glass-card h-16 rounded-2xl text-xl font-mono-tabular font-semibold flex items-center justify-center transition hover:scale-[1.03] active:scale-95"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            aria-label="刪除一位數"
            className="h-16 rounded-2xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition active:scale-95"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. Google 登入歡迎頁（Velvet Dark Glassmorphism）                           */
/* -------------------------------------------------------------------------- */
export const LoginScreen: React.FC<{
  onLogin: () => void;
  loading: boolean;
  errorMsg: string | null;
}> = ({ onLogin, loading, errorMsg }) => {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 relative overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div
        className="pointer-events-none fixed top-0 left-1/4 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: 'var(--accent-glow-1)' }}
      />
      <div
        className="pointer-events-none fixed bottom-0 right-1/4 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: 'var(--accent-glow-2)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card-strong relative z-10 w-full max-w-md rounded-3xl p-8 sm:p-10"
      >
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-lg"
          style={{
            background: 'linear-gradient(135deg, var(--accent-400), var(--accent-600))',
          }}
        >
          <Heart className="h-8 w-8 fill-current" />
        </div>

        <div className="text-center">
          <p className="text-xs font-medium tracking-[0.2em] text-[var(--text-muted)]">
            PRIVATE SANCTUARY FOR TWO
          </p>
          <h1 className="mt-2.5 text-2xl sm:text-3xl font-bold tracking-tight">
            嶼你 · 雙人專屬空間
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            為我們保留的私密天地。即時同步小黑板、四維度愛戀時光、願望券核銷與時光膠囊信件。
          </p>
        </div>

        {errorMsg && (
          <div className="mt-5 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-400">
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          onClick={onLogin}
          disabled={loading}
          className="mt-8 w-full min-h-[52px] rounded-2xl px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-3"
          style={{
            background: 'linear-gradient(135deg, var(--accent-500), var(--accent-600))',
          }}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
            />
          </svg>
          {loading ? '正在驗證 Google 帳號...' : '使用 Google 帳號進入'}
        </button>

        <p className="mt-5 text-center text-xs text-[var(--text-muted)]">
          僅限受邀白名單內的兩位帳號登入
        </p>
      </motion.div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. 非白名單專屬私人空間阻擋畫面                                              */
/* -------------------------------------------------------------------------- */
export const UnauthorizedScreen: React.FC<{
  blockedEmail: string;
  onRetryLogin: () => void;
}> = ({ blockedEmail, onRetryLogin }) => {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card-strong w-full max-w-md rounded-3xl p-8 text-center"
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-500/15 text-rose-400">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold">專屬私人空間，僅限授權兩人進入</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          帳號 <span className="font-mono-tabular font-medium">{blockedEmail}</span> 不在此空間的白名單中，系統已自動為您登出以確保隱私。
        </p>
        <button
          type="button"
          onClick={onRetryLogin}
          className="mt-7 w-full min-h-[48px] rounded-2xl px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98] inline-flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--accent-500)' }}
        >
          <LogOut className="h-4 w-4" />
          切換其他 Google 帳號
        </button>
      </motion.div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. 首次登入設定真實暱稱與頭貼                                                */
/* -------------------------------------------------------------------------- */
export const RoleOnboardingModal: React.FC<{
  defaultName: string;
  defaultAvatar: string;
  email: string;
  onSubmit: (payload: {
    role: PartnerRole;
    roleLabel: string;
    nickname: string;
    avatarDataUrl: string;
  }) => Promise<void>;
}> = ({ defaultName, defaultAvatar, email, onSubmit }) => {
  const [nickname, setNickname] = useState(defaultName || '');
  const [avatarDataUrl, setAvatarDataUrl] = useState(defaultAvatar || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, {
        maxDim: 360,
        maxDataUrlLength: 160_000,
      });
      setAvatarDataUrl(compressed);
    } catch {
      setErr('頭貼壓縮失敗，請換一張圖片試試');
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNick = nickname.trim();
    if (!trimmedNick) {
      setErr('請輸入您想在空間裡顯示的專屬暱稱');
      return;
    }

    setSaving(true);
    setErr('');
    try {
      await onSubmit({
        role: 'custom',
        roleLabel: trimmedNick.slice(0, 20),
        nickname: trimmedNick.slice(0, 30),
        avatarDataUrl,
      });
    } catch (error) {
      setErr(error instanceof Error ? error.message : '儲存資料失敗');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleConfirm}
        className="glass-card-strong w-full max-w-md rounded-3xl p-7 space-y-6"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
            style={{ backgroundColor: 'var(--accent-500)' }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">建立您的專屬名片</h2>
            <p className="text-xs text-[var(--text-muted)] font-mono-tabular">{email}</p>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <label className="relative cursor-pointer group">
            <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-white/25 shadow-lg bg-white/5 flex items-center justify-center">
              {avatarDataUrl ? (
                <img
                  src={avatarDataUrl}
                  alt="頭貼預覽"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-semibold text-[var(--text-secondary)]">
                  {nickname.slice(0, 1) || '♥'}
                </span>
              )}
            </div>
            <span
              className="absolute bottom-0 right-0 h-8 w-8 rounded-full text-white flex items-center justify-center shadow-md"
              style={{ backgroundColor: 'var(--accent-500)' }}
            >
              <Camera className="h-4 w-4" />
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          <span className="mt-2.5 text-xs text-[var(--text-muted)]">
            點擊上傳或更換您的專屬頭貼
          </span>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            您的專屬暱稱（全站將顯示此真實稱呼）
          </label>
          <input
            type="text"
            maxLength={30}
            required
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="例如：Kai、Darling"
            className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400/35"
          />
        </div>

        {err && <p className="text-xs text-rose-400">{err}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full min-h-[48px] rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-md transition active:scale-[0.98] disabled:opacity-60"
          style={{ backgroundColor: 'var(--accent-500)' }}
        >
          {saving ? '正在同步專屬空間...' : '進入我們的私密空間'}
        </button>
      </motion.form>
    </div>
  );
};
