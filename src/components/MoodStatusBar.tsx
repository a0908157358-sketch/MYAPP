import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Check, Plus, Sparkles, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PartnerProfile } from '../types/couple';

export interface MoodPreset {
  emoji: string;
  text: string;
}

const DEFAULT_MOOD_PRESETS: MoodPreset[] = [
  { emoji: '🥰', text: '想你了' },
  { emoji: '😴', text: '想睡覺' },
  { emoji: '🍜', text: '肚子餓' },
  { emoji: '🔥', text: '忙碌中' },
  { emoji: '☕️', text: '放空中' },
  { emoji: '🎧', text: '聽歌中' },
  { emoji: '💪', text: '加油中' },
  { emoji: '🌙', text: '準備睡了' },
];

const QUICK_CUSTOM_EMOJIS = ['✨', '🥺', '🧋', '🚗', '🎮', '📚', '🍓', '🫂'];

function parseCustomMood(raw: string): MoodPreset | null {
  const sepIdx = raw.indexOf('|');
  if (sepIdx === -1) return null;
  const emoji = raw.slice(0, sepIdx).trim();
  const text = raw.slice(sepIdx + 1).trim();
  if (!emoji || !text) return null;
  return { emoji, text };
}

function serializeCustomMood(emoji: string, text: string): string {
  return `${emoji.trim().slice(0, 8)}|${text.trim().slice(0, 18)}`;
}

export const MoodStatusBar: React.FC<{
  myProfile: PartnerProfile;
  partnerProfile: PartnerProfile | null;
}> = ({ myProfile, partnerProfile }) => {
  const [openPicker, setOpenPicker] = useState(false);
  const [customEmoji, setCustomEmoji] = useState('✨');
  const [customText, setCustomText] = useState('');
  const [saving, setSaving] = useState(false);

  const customMoods = useMemo(() => {
    const rawList = Array.isArray(myProfile.customMoods) ? myProfile.customMoods : [];
    return rawList
      .map(parseCustomMood)
      .filter((item): item is MoodPreset => item !== null);
  }, [myProfile.customMoods]);

  const applyMood = async (emoji: string, text: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'partners', myProfile.uid), {
        moodEmoji: emoji.slice(0, 16),
        moodText: text.slice(0, 24),
        updatedAt: serverTimestamp(),
      });
      setOpenPicker(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `partners/${myProfile.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCustomMood = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmoji = customEmoji.trim() || '✨';
    const cleanText = customText.trim();
    if (!cleanText) return;

    const encoded = serializeCustomMood(cleanEmoji, cleanText);
    const existingRaw = Array.isArray(myProfile.customMoods) ? myProfile.customMoods : [];
    const nextCustomMoods = [
      encoded,
      ...existingRaw.filter((item) => item !== encoded),
    ].slice(0, 12);

    setSaving(true);
    try {
      await updateDoc(doc(db, 'partners', myProfile.uid), {
        moodEmoji: cleanEmoji.slice(0, 16),
        moodText: cleanText.slice(0, 24),
        customMoods: nextCustomMoods,
        updatedAt: serverTimestamp(),
      });
      setCustomText('');
      setOpenPicker(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `partners/${myProfile.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomMood = async (target: MoodPreset) => {
    const encoded = serializeCustomMood(target.emoji, target.text);
    const existingRaw = Array.isArray(myProfile.customMoods) ? myProfile.customMoods : [];
    const nextCustomMoods = existingRaw.filter((item) => item !== encoded);
    try {
      await updateDoc(doc(db, 'partners', myProfile.uid), {
        customMoods: nextCustomMoods,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `partners/${myProfile.uid}`);
    }
  };

  const myHasMood = !!(myProfile.moodEmoji || myProfile.moodText);
  const partnerHasMood = !!(partnerProfile?.moodEmoji || partnerProfile?.moodText);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* 我的心情狀態膠囊（點擊可切換或自訂） */}
        <button
          type="button"
          onClick={() => setOpenPicker(true)}
          className="glass-card rounded-full px-3.5 py-1.5 min-h-[38px] inline-flex items-center gap-2 text-xs font-medium transition hover:scale-[1.02] active:scale-[0.97] border border-[var(--accent-500)]/35"
        >
          <span className="text-sm leading-none" aria-hidden="true">
            {myHasMood ? myProfile.moodEmoji || '✨' : '🫧'}
          </span>
          <span className="text-[var(--text-muted)] max-w-[68px] truncate">
            {myProfile.nickname}
          </span>
          <span className="font-semibold text-[var(--text-primary)] whitespace-nowrap">
            {myHasMood ? myProfile.moodText : '設定心情'}
          </span>
        </button>

        {/* 對方的即時心情狀態膠囊 */}
        {partnerProfile && (
          <div className="glass-card rounded-full px-3.5 py-1.5 min-h-[38px] inline-flex items-center gap-2 text-xs font-medium">
            <span className="text-sm leading-none" aria-hidden="true">
              {partnerHasMood ? partnerProfile.moodEmoji || '✨' : '💭'}
            </span>
            <span className="text-[var(--text-muted)] max-w-[68px] truncate">
              {partnerProfile.nickname}
            </span>
            <span className="text-[var(--text-secondary)] whitespace-nowrap">
              {partnerHasMood ? partnerProfile.moodText : '尚無狀態'}
            </span>
          </div>
        )}
      </div>

      {/* 心情與狀態快速切換 / 自訂建立 Modal */}
      <AnimatePresence>
        {openPicker && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-4"
            onClick={() => setOpenPicker(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card-strong w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="h-5 w-5 text-[var(--accent-600)] dark:text-[var(--accent-400)]" />
                  <div>
                    <h3 className="text-base font-bold">
                      {myProfile.nickname} 的今日狀態
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      切換後將即時同步顯示在對方首頁上方
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenPicker(false)}
                  aria-label="關閉視窗"
                  className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-[var(--text-muted)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 快速預設狀態 */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--text-secondary)]">快速狀態</p>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_MOOD_PRESETS.map((preset) => {
                    const active =
                      myProfile.moodEmoji === preset.emoji &&
                      myProfile.moodText === preset.text;
                    return (
                      <button
                        key={`${preset.emoji}-${preset.text}`}
                        type="button"
                        disabled={saving}
                        onClick={() => applyMood(preset.emoji, preset.text)}
                        className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border transition active:scale-95 ${
                          active
                            ? 'text-white border-transparent shadow-sm'
                            : 'glass-card border-[var(--border-glass)] text-[var(--text-primary)] hover:border-[var(--accent-500)]'
                        }`}
                        style={active ? { backgroundColor: 'var(--accent-500)' } : undefined}
                      >
                        <span>{preset.emoji}</span>
                        <span>{preset.text}</span>
                        {active && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 使用者自訂儲存的狀態 */}
              {customMoods.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">
                    我的自訂狀態
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {customMoods.map((cm) => {
                      const active =
                        myProfile.moodEmoji === cm.emoji && myProfile.moodText === cm.text;
                      return (
                        <div
                          key={`${cm.emoji}-${cm.text}`}
                          className={`min-h-[38px] pl-3 pr-1.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border transition ${
                            active
                              ? 'text-white border-transparent shadow-sm'
                              : 'glass-card border-[var(--border-glass)] text-[var(--text-primary)]'
                          }`}
                          style={active ? { backgroundColor: 'var(--accent-500)' } : undefined}
                        >
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => applyMood(cm.emoji, cm.text)}
                            className="inline-flex items-center gap-1.5 py-0.5"
                          >
                            <span>{cm.emoji}</span>
                            <span>{cm.text}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomMood(cm)}
                            aria-label={`移除自訂狀態 ${cm.text}`}
                            className={`h-6 w-6 rounded-full flex items-center justify-center transition ${
                              active
                                ? 'hover:bg-white/20 text-white/90'
                                : 'hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-muted)]'
                            }`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 自訂建立新狀態表單 */}
              <form
                onSubmit={handleCreateCustomMood}
                className="pt-3 border-t border-[var(--border-glass)] space-y-3"
              >
                <p className="text-xs font-semibold text-[var(--text-secondary)]">
                  自訂建立新狀態
                </p>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {QUICK_CUSTOM_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setCustomEmoji(em)}
                      className={`h-8 w-8 rounded-xl text-base shrink-0 flex items-center justify-center transition ${
                        customEmoji === em
                          ? 'bg-[var(--accent-500)]/20 ring-1 ring-[var(--accent-500)]'
                          : 'hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={8}
                    value={customEmoji}
                    onChange={(e) => setCustomEmoji(e.target.value)}
                    aria-label="狀態 Emoji"
                    placeholder="✨"
                    className="w-14 text-center rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-2 py-2.5 text-base outline-none shrink-0"
                  />
                  <input
                    type="text"
                    required
                    maxLength={18}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="輸入狀態文字（例：買飲料中）"
                    className="flex-1 min-w-0 rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-3.5 py-2.5 text-sm outline-none"
                  />
                  <button
                    type="submit"
                    disabled={saving || !customText.trim()}
                    className="min-h-[42px] px-3.5 rounded-2xl text-xs font-semibold text-white shrink-0 inline-flex items-center gap-1 transition active:scale-95 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent-500)' }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    套用
                  </button>
                </div>

                {myHasMood && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => applyMood('', '')}
                    className="w-full min-h-[38px] rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                  >
                    清除目前心情狀態
                  </button>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
