import firebaseAppletConfig from '../../firebase-applet-config.json';

/**
 * ============================================================================
 * 【雙人白名單設定區 ALLOWED_EMAILS】
 * ----------------------------------------------------------------------------
 * 只有列在此陣列中的 Google 帳號信箱（不分大小寫）才可進入此雙人專屬空間。
 * 若日後需更換信箱，可直接修改此陣列，或於應用程式內的「設定」頁面更新並同步。
 * ============================================================================
 */
export const ALLOWED_EMAILS: string[] = [
  'a0908157358@gmail.com',
  'yu67428@gmail.com',
];

/**
 * ============================================================================
 * 【Firebase 連線設定區 firebaseConfig】
 * ----------------------------------------------------------------------------
 * 本專案已透過 AI Studio 自動建立並綁定 Firebase 專案與 Firestore 資料庫。
 * 若日後想改用自己於 Firebase Console 建立的專案，只需替換下方 config 物件：
 *
 * export const firebaseConfig = {
 *   apiKey: "您的_API_KEY",
 *   authDomain: "您的專案.firebaseapp.com",
 *   projectId: "您的專案ID",
 *   storageBucket: "您的專案.firebasestorage.app",
 *   messagingSenderId: "發送者ID",
 *   appId: "您的_APP_ID",
 *   firestoreDatabaseId: "(default)",
 * };
 * ============================================================================
 */
export const firebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey,
  authDomain: firebaseAppletConfig.authDomain,
  projectId: firebaseAppletConfig.projectId,
  storageBucket: firebaseAppletConfig.storageBucket,
  messagingSenderId: firebaseAppletConfig.messagingSenderId,
  appId: firebaseAppletConfig.appId,
  firestoreDatabaseId: firebaseAppletConfig.firestoreDatabaseId,
};

export const COUPLE_SPACE_DOC_ID = 'main';

export const DEFAULT_KEY_DATES = {
  firstMetDate: '2022-05-20',
  firstTogetherDate: '2022-08-14',
  firstApartDate: '2024-02-10',
  reunitedDate: '2026-11-18',
  partner1Birthday: '1999-04-12',
  partner2Birthday: '2000-09-18',
};

export const CHALK_COLORS = {
  white: { label: '純白粉筆', hex: '#F6F2EA' },
  pink: { label: '乾燥玫瑰粉', hex: '#F4A8C0' },
  blue: { label: '霧海晴空藍', hex: '#88D4F7' },
  yellow: { label: '香檳暖陽黃', hex: '#F6D57A' },
  mint: { label: '薄荷青粉筆', hex: '#9EE6C0' },
} as const;

export const EXTENDED_CHALK_PALETTE: { label: string; hex: string }[] = [
  // 馬卡龍柔霧粉彩色系
  { label: '奶油蜜桃杏', hex: '#FDE4CF' },
  { label: '蜜桃珊瑚粉', hex: '#FFADAD' },
  { label: '櫻花草莓奶', hex: '#FFCFD2' },
  { label: '丁香粉紫羅蘭', hex: '#F1C0E8' },
  { label: '薰衣草淺紫', hex: '#CFBAF0' },
  { label: '天空冰藍', hex: '#A3C4F3' },
  { label: '湖水蒂芬妮', hex: '#90DBF4' },
  { label: '抹茶蘋果綠', hex: '#B9FBC0' },
  // 螢光高飽和亮彩粉筆
  { label: '螢光粉桃', hex: '#FF6B9D' },
  { label: '螢光檸檬黃', hex: '#F9F871' },
  { label: '螢光萊姆綠', hex: '#7CFF6B' },
  { label: '螢光電光青', hex: '#4DFFFF' },
  { label: '螢光紫羅蘭', hex: '#C77DFF' },
  { label: '熾熱蜜橘', hex: '#FF8C61' },
  { label: '琥珀焦糖橘', hex: '#FFC478' },
  { label: '珍珠柔霧銀', hex: '#D8DEE9' },
];

export function resolveChalkHex(colorIdOrHex?: string): string {
  if (!colorIdOrHex) return CHALK_COLORS.white.hex;
  if (colorIdOrHex in CHALK_COLORS) {
    return CHALK_COLORS[colorIdOrHex as keyof typeof CHALK_COLORS].hex;
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(colorIdOrHex)) {
    return colorIdOrHex;
  }
  return CHALK_COLORS.white.hex;
}
