export interface TimeBreakdown {
  totalDays: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export interface FourDimLoveMetrics {
  met: TimeBreakdown;
  priorTogether: TimeBreakdown;
  reunited: TimeBreakdown;
  totalTogether: TimeBreakdown;
}

export interface MilestoneItem {
  id: string;
  label: string;
  category: string;
  daysRemaining: number;
  targetDateStr: string;
}

export interface LiquidHeartState {
  level: number;
  currentMl: number;
  maxCapacity: number;
  fillPercent: number;
  isDualHeart: boolean;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

export function parseLocalDateStart(dateStr: string): Date {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date();
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * 包含式天數計算（起始當天即為第 1 天）：
 * 若設定日為今天（diffMs >= 0 且 < 24h），回傳 totalDays = 1（第 1 天），
 * 並附帶當天已過之時、分、秒。
 */
function msToInclusiveBreakdown(rawMs: number): TimeBreakdown {
  if (rawMs < 0) {
    return { totalDays: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }
  const totalDays = Math.floor(rawMs / MS_PER_DAY) + 1;
  const remAfterDays = rawMs % MS_PER_DAY;
  const hours = Math.floor(remAfterDays / MS_PER_HOUR);
  const remAfterHours = remAfterDays % MS_PER_HOUR;
  const minutes = Math.floor(remAfterHours / MS_PER_MINUTE);
  const seconds = Math.floor((remAfterHours % MS_PER_MINUTE) / MS_PER_SECOND);
  return {
    totalDays,
    hours,
    minutes,
    seconds,
    totalMs: rawMs,
  };
}

export function computeLoveMetrics(
  dates: {
    firstMetDate: string;
    firstTogetherDate: string;
    firstApartDate: string;
    reunitedDate: string;
  },
  now: Date = new Date()
): FourDimLoveMetrics {
  const nowMs = now.getTime();
  const metStart = parseLocalDateStart(dates.firstMetDate).getTime();
  const firstStart = parseLocalDateStart(dates.firstTogetherDate).getTime();
  const apartEnd = parseLocalDateStart(dates.firstApartDate).getTime();
  const reunitedStart = parseLocalDateStart(dates.reunitedDate).getTime();

  const met = msToInclusiveBreakdown(nowMs - metStart);
  const priorTogether = msToInclusiveBreakdown(apartEnd - firstStart);
  const reunited = msToInclusiveBreakdown(nowMs - reunitedStart);

  // 總共在一起天數 = 之前在一起天數 + 復合後在一起天數
  const totalDays = priorTogether.totalDays + reunited.totalDays;
  const totalTogether: TimeBreakdown = {
    totalDays,
    hours: reunited.hours,
    minutes: reunited.minutes,
    seconds: reunited.seconds,
    totalMs: priorTogether.totalMs + reunited.totalMs,
  };

  return {
    met,
    priorTogether,
    reunited,
    totalTogether,
  };
}

function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeUpcomingMilestones(
  dates: {
    firstMetDate: string;
    firstTogetherDate: string;
    firstApartDate: string;
    reunitedDate: string;
    partner1Birthday: string;
    partner2Birthday: string;
  },
  partner1DisplayName: string,
  partner2DisplayName: string,
  now: Date = new Date()
): MilestoneItem[] {
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const metrics = computeLoveMetrics(dates, now);
  const milestones: MilestoneItem[] = [];

  const pushHundredMilestone = (
    idPrefix: string,
    titlePrefix: string,
    category: string,
    currentDays: number
  ) => {
    if (currentDays <= 0) return;
    const isExactHundredToday = currentDays % 100 === 0;
    const targetHundred = isExactHundredToday
      ? currentDays
      : (Math.floor(currentDays / 100) + 1) * 100;
    const daysRemaining = targetHundred - currentDays;
    const targetDate = new Date(todayMidnight.getTime() + daysRemaining * MS_PER_DAY);
    milestones.push({
      id: `${idPrefix}-${targetHundred}`,
      label: `${titlePrefix}第 ${targetHundred.toLocaleString()} 天`,
      category,
      daysRemaining,
      targetDateStr: formatYMD(targetDate),
    });
  };

  pushHundredMilestone('met', '認識', '百日里程碑', metrics.met.totalDays);
  pushHundredMilestone('reunited', '復合後', '百日里程碑', metrics.reunited.totalDays);
  pushHundredMilestone('total-love', '總共在一起', '愛從未歸零', metrics.totalTogether.totalDays);

  const pushAnnualEvent = (id: string, label: string, category: string, sourceDateStr: string) => {
    if (!sourceDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDateStr)) return;
    const [origYear, m, d] = sourceDateStr.split('-').map(Number);
    let nextYear = todayMidnight.getFullYear();
    let candidate = new Date(nextYear, m - 1, d, 0, 0, 0, 0);
    if (candidate.getTime() < todayMidnight.getTime()) {
      nextYear += 1;
      candidate = new Date(nextYear, m - 1, d, 0, 0, 0, 0);
    }
    const yearsCount = nextYear - origYear;
    const daysRemaining = Math.round((candidate.getTime() - todayMidnight.getTime()) / MS_PER_DAY);
    const displayLabel =
      category === '生日'
        ? label
        : yearsCount > 0
          ? `${label} · 第 ${yearsCount} 週年`
          : label;

    milestones.push({
      id,
      label: displayLabel,
      category,
      daysRemaining,
      targetDateStr: formatYMD(candidate),
    });
  };

  pushAnnualEvent('anniv-met', '認識紀念日', '年度紀念', dates.firstMetDate);
  pushAnnualEvent('anniv-reunited', '復合紀念日', '年度紀念', dates.reunitedDate);
  if (partner1DisplayName) {
    pushAnnualEvent('bday-p1', `${partner1DisplayName} 的生日`, '生日', dates.partner1Birthday);
  }
  if (partner2DisplayName) {
    pushAnnualEvent('bday-p2', `${partner2DisplayName} 的生日`, '生日', dates.partner2Birthday);
  }

  return milestones.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * 動態液體愛心容量升級數學邏輯：
 * - 初始第 1 階容量上限 100 ml
 * - 每完成 1 個願望 +10 ml
 * - 每當累積液量 >= 當前容量上限時，升級且上限 +50 ml，原液量完全保留
 * - 當容量上限 >= 250 ml（第 4 階起）進化為雙愛心交疊造型
 */
export function computeLiquidHeartState(completedCount: number): LiquidHeartState {
  const safeCount = Math.max(0, completedCount);
  const currentMl = safeCount * 10;
  let level = 1;
  let maxCapacity = 100;

  while (currentMl >= maxCapacity) {
    level += 1;
    maxCapacity += 50;
  }

  const fillPercent = Math.min(100, Number(((currentMl / maxCapacity) * 100).toFixed(1)));
  return {
    level,
    currentMl,
    maxCapacity,
    fillPercent,
    isDualHeart: maxCapacity >= 250,
  };
}
