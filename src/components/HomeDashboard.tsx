import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  HeartHandshake,
} from 'lucide-react';
import { ChalkboardData, CoupleSpace, PartnerProfile, SharedMemo } from '../types/couple';
import { computeLoveMetrics, computeUpcomingMilestones } from '../utils/loveTime';
import { PinnedHomeChalkboard } from './ChalkboardSection';
import { MoodStatusBar } from './MoodStatusBar';
import { SharedMemoCard } from './SharedMemoCard';

const pad2 = (n: number) => String(n).padStart(2, '0');

export const HomeDashboard: React.FC<{
  coupleSpace: CoupleSpace;
  myProfile: PartnerProfile;
  partnerProfile: PartnerProfile | null;
  activeProfile: PartnerProfile;
  otherProfile: PartnerProfile | null;
  activeBoard: ChalkboardData | null;
  otherBoard: ChalkboardData | null;
  memos: SharedMemo[];
  allowedEmails: string[];
  perspectiveMode: 'self' | 'partner';
  onTogglePerspective: () => void;
  partner1DisplayName: string;
  partner2DisplayName: string;
}> = ({
  coupleSpace,
  myProfile,
  partnerProfile,
  activeProfile,
  otherProfile,
  activeBoard,
  otherBoard,
  memos,
  allowedEmails,
  perspectiveMode,
  onTogglePerspective,
  partner1DisplayName,
  partner2DisplayName,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [milestoneIndex, setMilestoneIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const metrics = useMemo(
    () =>
      computeLoveMetrics(
        {
          firstMetDate: coupleSpace.firstMetDate,
          firstTogetherDate: coupleSpace.firstTogetherDate,
          firstApartDate: coupleSpace.firstApartDate,
          reunitedDate: coupleSpace.reunitedDate,
        },
        now
      ),
    [coupleSpace, now]
  );

  const milestones = useMemo(
    () =>
      computeUpcomingMilestones(
        coupleSpace,
        partner1DisplayName,
        partner2DisplayName,
        now
      ),
    [coupleSpace, partner1DisplayName, partner2DisplayName, now]
  );

  const safeMilestoneIdx = milestones.length > 0 ? milestoneIndex % milestones.length : 0;
  const activeMilestone = milestones[safeMilestoneIdx];

  const isPreview = perspectiveMode === 'partner' && !!partnerProfile;

  return (
    <div className="space-y-5">
      {/* 1. 頂部高質感識別區：雙人大頭貼真實暱稱 + 今日心情與狀態膠囊 */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 max-w-full">
          <button
            type="button"
            onClick={onTogglePerspective}
            disabled={!partnerProfile}
            className="glass-card rounded-full pl-2 pr-4 py-1.5 flex items-center gap-3 transition hover:scale-[1.01] active:scale-[0.98] disabled:cursor-default max-w-full"
            title={partnerProfile ? '點擊切換雙人預覽視角' : undefined}
          >
            <div className="flex -space-x-2.5 shrink-0">
              <div className="h-9 w-9 rounded-full border-2 border-[var(--bg-canvas)] overflow-hidden bg-white/10 flex items-center justify-center shadow">
                {myProfile.avatarDataUrl ? (
                  <img
                    src={myProfile.avatarDataUrl}
                    alt={myProfile.nickname}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-semibold">{myProfile.nickname.slice(0, 1)}</span>
                )}
              </div>
              <div className="h-9 w-9 rounded-full border-2 border-[var(--bg-canvas)] overflow-hidden bg-white/10 flex items-center justify-center shadow">
                {partnerProfile?.avatarDataUrl ? (
                  <img
                    src={partnerProfile.avatarDataUrl}
                    alt={partnerProfile.nickname}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-semibold text-[var(--text-muted)]">
                    {partnerProfile?.nickname?.slice(0, 1) || '♥'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold tracking-tight truncate">
                {myProfile.nickname} &amp; {partnerProfile?.nickname || '另一半'}
              </span>
              {partnerProfile && (
                <ArrowLeftRight
                  className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
              )}
            </div>
          </button>

          {isPreview && (
            <span
              className="text-xs font-medium px-3 py-1.5 rounded-full glass-card shrink-0 text-[var(--accent-600)] dark:text-[var(--accent-400)]"
            >
              正以 {activeProfile.nickname} 視角預覽
            </span>
          )}
        </div>

        <MoodStatusBar myProfile={myProfile} partnerProfile={partnerProfile} />
      </header>

      {/* 2. 首頁置頂：擬真暗色磨砂互動小黑板（預設顯示對方的黑板留言） */}
      <PinnedHomeChalkboard
        activeProfile={activeProfile}
        otherProfile={otherProfile}
        activeBoard={activeBoard}
        otherBoard={otherBoard}
        allowedEmails={allowedEmails}
        isPreviewPerspective={isPreview}
      />

      {/* 3. 四維度愛情時間儀表板（全數採包含首日之第 1 天計算） */}
      <section aria-label="四維度愛情時間儀表板" className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 主焦點：總共在一起天數 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="lg:col-span-7 rounded-3xl p-6 sm:p-7 text-white shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[205px]"
          style={{
            background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))',
          }}
        >
          <div className="flex items-start justify-between gap-4 relative z-10">
            <div>
              <p className="text-xs font-medium text-white/80">
                愛從未歸零 · 累計相愛總時光
              </p>
              <h2 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight">
                總共在一起天數
              </h2>
            </div>
            <HeartHandshake className="h-6 w-6 text-white/85 shrink-0" />
          </div>

          <div className="mt-5 relative z-10">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-white/85">第</span>
              <span className="font-mono-tabular text-5xl sm:text-6xl font-bold tracking-tight">
                {metrics.totalTogether.totalDays.toLocaleString()}
              </span>
              <span className="text-base font-medium text-white/90">天</span>
            </div>
            <p className="mt-2 font-mono-tabular text-sm text-white/90">
              {pad2(metrics.totalTogether.hours)} 時 {pad2(metrics.totalTogether.minutes)} 分{' '}
              {pad2(metrics.totalTogether.seconds)} 秒
            </p>
            <p className="mt-3 text-xs text-white/75">
              之前在一起 {metrics.priorTogether.totalDays.toLocaleString()} 天 ＋ 復合後第{' '}
              {metrics.reunited.totalDays.toLocaleString()} 天
            </p>
          </div>
        </motion.div>

        {/* 伴隨三維度卡片 */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          <div className="glass-card rounded-3xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">復合後在一起</span>
              <span className="text-xs text-[var(--text-muted)]">現在進行式</span>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-[var(--text-muted)]">第</span>
                <span
                  className="font-mono-tabular text-3xl font-bold text-[var(--accent-600)] dark:text-[var(--accent-400)]"
                >
                  {metrics.reunited.totalDays.toLocaleString()}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">天</span>
              </div>
              <span className="font-mono-tabular text-xs text-[var(--text-secondary)]">
                {pad2(metrics.reunited.hours)}:{pad2(metrics.reunited.minutes)}:
                {pad2(metrics.reunited.seconds)}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-muted)] font-mono-tabular">
              自 {coupleSpace.reunitedDate} 重新牽手
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:col-span-2 lg:col-span-1">
            <div className="glass-card rounded-3xl p-5 flex flex-col justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                總共認識
              </span>
              <div className="mt-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] text-[var(--text-muted)]">第</span>
                  <span className="font-mono-tabular text-2xl font-bold">
                    {metrics.met.totalDays.toLocaleString()}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">天</span>
                </div>
                <p className="mt-1 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  {pad2(metrics.met.hours)}:{pad2(metrics.met.minutes)}:
                  {pad2(metrics.met.seconds)}
                </p>
              </div>
              <p className="mt-2 text-[11px] font-mono-tabular text-[var(--text-muted)] truncate">
                {coupleSpace.firstMetDate}
              </p>
            </div>

            <div className="glass-card rounded-3xl p-5 flex flex-col justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                之前在一起
              </span>
              <div className="mt-2">
                <div className="flex items-baseline gap-1">
                  <span className="font-mono-tabular text-2xl font-bold">
                    {metrics.priorTogether.totalDays.toLocaleString()}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">天</span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">初戀篇章</p>
              </div>
              <p className="mt-2 text-[11px] font-mono-tabular text-[var(--text-muted)] truncate">
                {coupleSpace.firstTogetherDate} ~ {coupleSpace.firstApartDate}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 精簡呼吸感紀念日與生日倒數區 */}
      <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarHeart className="h-5 w-5 text-[var(--accent-600)] dark:text-[var(--accent-400)]" />
            <h2 className="text-base font-bold">紀念日與生日倒數</h2>
          </div>

          {milestones.length > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setMilestoneIndex((prev) => (prev - 1 + milestones.length) % milestones.length)
                }
                aria-label="上一個倒數"
                className="min-h-[40px] min-w-[40px] rounded-xl glass-card flex items-center justify-center hover:opacity-80 transition active:scale-95"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setMilestoneIndex((prev) => (prev + 1) % milestones.length)}
                aria-label="下一個倒數"
                className="min-h-[40px] min-w-[40px] rounded-xl glass-card flex items-center justify-center hover:opacity-80 transition active:scale-95"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {activeMilestone && (
          <motion.div
            key={activeMilestone.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22 }}
            className="rounded-2xl p-5 border border-[var(--border-glass)] bg-white/50 dark:bg-white/[0.03] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div>
              <p className="text-xs text-[var(--text-muted)]">
                {activeMilestone.category}
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span className="font-mono-tabular">{activeMilestone.targetDateStr}</span>
              </p>
              <p className="mt-1.5 text-lg sm:text-xl font-bold tracking-tight">
                {activeMilestone.daysRemaining === 0
                  ? `今天就是【${activeMilestone.label}】`
                  : `距離【${activeMilestone.label}】還有 ${activeMilestone.daysRemaining.toLocaleString()} 天`}
              </p>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <span
                className="font-mono-tabular text-3xl sm:text-4xl font-bold text-[var(--accent-600)] dark:text-[var(--accent-400)]"
              >
                {activeMilestone.daysRemaining === 0 ? 'TODAY' : activeMilestone.daysRemaining}
              </span>
              {activeMilestone.daysRemaining > 0 && (
                <span className="ml-1.5 text-xs text-[var(--text-secondary)]">天</span>
              )}
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {milestones.slice(0, 3).map((m, idx) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMilestoneIndex(idx)}
              className={`text-left rounded-2xl px-4 py-3 border transition min-h-[54px] ${
                idx === safeMilestoneIdx
                  ? 'border-[var(--accent-500)] bg-white/10'
                  : 'border-[var(--border-glass)] hover:bg-white/5'
              }`}
            >
              <p className="text-xs font-semibold truncate">{m.label}</p>
              <p className="mt-1 text-[11px] font-mono-tabular text-[var(--text-muted)]">
                {m.daysRemaining === 0 ? '就是今天' : `${m.daysRemaining} 天後`} · {m.targetDateStr}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* 5. 首頁最下方：雙人共享備忘錄 */}
      <SharedMemoCard
        memos={memos}
        myProfile={myProfile}
        allowedEmails={allowedEmails}
      />
    </div>
  );
};
