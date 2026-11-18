import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { Check, Eraser, ListTodo, Plus, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PartnerProfile, SharedMemo } from '../types/couple';

function generateMemoId(): string {
  return `memo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const SharedMemoCard: React.FC<{
  memos: SharedMemo[];
  myProfile: PartnerProfile;
  allowedEmails: string[];
}> = ({ memos, myProfile, allowedEmails }) => {
  const [content, setContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [clearing, setClearing] = useState(false);

  // 未完成優先顯示（新到舊），已完成置於下方
  const sortedMemos = useMemo(() => {
    return [...memos].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      return b.id.localeCompare(a.id);
    });
  }, [memos]);

  const completedMemos = useMemo(
    () => memos.filter((m) => m.completed),
    [memos]
  );
  const pendingCount = memos.length - completedMemos.length;

  const handleAddMemo = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setAdding(true);
    const id = generateMemoId();
    try {
      await setDoc(doc(db, 'memos', id), {
        id,
        content: trimmed.slice(0, 120),
        completed: false,
        creatorUid: myProfile.uid,
        creatorName: myProfile.nickname,
        allowedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setContent('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `memos/${id}`);
    } finally {
      setAdding(false);
    }
  };

  const handleToggleMemo = async (memo: SharedMemo) => {
    try {
      await updateDoc(doc(db, 'memos', memo.id), {
        completed: !memo.completed,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `memos/${memo.id}`);
    }
  };

  const handleClearCompleted = async () => {
    if (completedMemos.length === 0) return;
    setClearing(true);
    try {
      const batch = writeBatch(db);
      completedMemos.forEach((m) => {
        batch.delete(doc(db, 'memos', m.id));
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'memos/batch-clear');
    } finally {
      setClearing(false);
    }
  };

  return (
    <section
      aria-label="雙人共享備忘錄"
      className="glass-card rounded-3xl p-5 sm:p-6 space-y-4"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <ListTodo className="h-5 w-5 text-[var(--accent-600)] dark:text-[var(--accent-400)]" />
          <div>
            <h2 className="text-base font-bold">雙人共享備忘錄</h2>
            <p className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
              {memos.length === 0
                ? '即時同步生活瑣事與代辦'
                : `待完成 ${pendingCount} 項 · 共 ${memos.length} 項`}
            </p>
          </div>
        </div>

        <AnimatePresence>
          {completedMemos.length > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              type="button"
              disabled={clearing}
              onClick={handleClearCompleted}
              className="min-h-[34px] px-3 rounded-xl glass-card text-xs font-medium text-[var(--text-secondary)] hover:text-rose-500 inline-flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
            >
              <Eraser className="h-3.5 w-3.5" />
              一鍵清除已完成 ({completedMemos.length})
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* 快速新增輸入列 */}
      <form onSubmit={handleAddMemo} className="flex items-center gap-2">
        <input
          type="text"
          maxLength={120}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="新增生活瑣事或備忘（例：下班順路買鮮奶）"
          className="flex-1 min-w-0 rounded-2xl border border-[var(--border-glass)] bg-white/65 dark:bg-black/25 px-4 py-2.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={adding || !content.trim()}
          aria-label="新增備忘事項"
          className="min-h-[42px] px-4 rounded-2xl text-xs font-semibold text-white shrink-0 inline-flex items-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-500)' }}
        >
          <Plus className="h-4 w-4" />
          新增
        </button>
      </form>

      {/* 備忘錄清單 */}
      {sortedMemos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-glass)] py-6 px-4 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            目前沒有備忘事項，隨時記下屬於兩人的日常提醒 ✨
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-glass)] rounded-2xl border border-[var(--border-glass)] bg-white/40 dark:bg-white/[0.02] overflow-hidden">
          <AnimatePresence initial={false}>
            {sortedMemos.map((memo) => (
              <motion.div
                key={memo.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-between gap-2 px-3.5 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => handleToggleMemo(memo)}
                  className="flex items-center gap-3 flex-1 min-w-0 min-h-[40px] text-left group"
                >
                  <motion.span
                    animate={{ scale: memo.completed ? [1, 1.15, 1] : 1 }}
                    transition={{ duration: 0.22 }}
                    className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                      memo.completed
                        ? 'border-transparent text-white'
                        : 'border-[var(--text-muted)] group-hover:border-[var(--accent-500)]'
                    }`}
                    style={
                      memo.completed
                        ? { backgroundColor: 'var(--accent-500)' }
                        : undefined
                    }
                  >
                    {memo.completed && <Check className="h-3.5 w-3.5" />}
                  </motion.span>

                  <div className="min-w-0 flex-1">
                    <span
                      className={`relative inline-block max-w-full text-sm font-medium break-words transition-opacity duration-200 ${
                        memo.completed
                          ? 'opacity-45 text-[var(--text-muted)]'
                          : 'opacity-100 text-[var(--text-primary)]'
                      }`}
                    >
                      {memo.content}
                      <motion.span
                        initial={false}
                        animate={{ scaleX: memo.completed ? 1 : 0 }}
                        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                        style={{ originX: 0 }}
                        className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-current"
                      />
                    </span>
                    <span className="ml-2 text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                      · {memo.creatorName}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await deleteDoc(doc(db, 'memos', memo.id));
                    } catch (err) {
                      handleFirestoreError(err, OperationType.DELETE, `memos/${memo.id}`);
                    }
                  }}
                  aria-label="刪除此備忘項目"
                  className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-rose-500 transition shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
};
