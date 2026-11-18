import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  BookHeart,
  Heart,
  Home,
  Settings,
  Ticket,
  WifiOff,
} from 'lucide-react';
import {
  ALLOWED_EMAILS,
  COUPLE_SPACE_DOC_ID,
  DEFAULT_KEY_DATES,
  firebaseConfig,
} from './config/coupleConfig';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './lib/firebase';
import {
  ChalkboardData,
  ColorMode,
  CoupleSpace,
  PartnerProfile,
  PolaroidPhoto,
  SharedMemo,
  SnapStory,
  TimeCapsuleLetter,
  TimelineNode,
  WishlistItem,
  WishVoucher,
} from './types/couple';
import {
  applyCustomPaletteToDocument,
  CustomPalette,
  DEFAULT_CUSTOM_PALETTE,
} from './utils/colorPalette';
import { useOnlineStatus } from './hooks/usePWA';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  LoginScreen,
  PinLockScreen,
  RoleOnboardingModal,
  UnauthorizedScreen,
} from './components/AuthAndLockScreens';
import { HomeDashboard } from './components/HomeDashboard';
import { VoucherSection } from './components/VoucherSection';
import { StoryAndPolaroidSection } from './components/StoryAndPolaroidSection';
import { WishlistAndCapsuleSection } from './components/WishlistAndCapsuleSection';
import { SettingsSection } from './components/SettingsSection';

// 雙人白名單陣列與 Firebase 設定（集中於 ./config/coupleConfig.ts，亦可於此查閱）
export { ALLOWED_EMAILS, firebaseConfig };

type ActiveTab = 'home' | 'board' | 'story' | 'wishlist' | 'settings';

const NAV_ITEMS: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: '首頁', icon: Home },
  { id: 'board', label: '願望券夾', icon: Ticket },
  { id: 'story', label: '故事相簿', icon: BookHeart },
  { id: 'wishlist', label: '愛心膠囊', icon: Heart },
  { id: 'settings', label: '設定', icon: Settings },
];

function CoupleAppShell() {
  const isOnline = useOnlineStatus();

  // 預設溫潤奶茶色淺色模式，支援切換高級碳灰深色模式與自訂調色盤
  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    const saved = localStorage.getItem('cove_color_mode_v3');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [customPalette, setCustomPalette] = useState<CustomPalette>(() => {
    try {
      const raw = localStorage.getItem('cove_custom_palette_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CustomPalette>;
        if (
          typeof parsed.lightBg === 'string' &&
          typeof parsed.darkBg === 'string' &&
          typeof parsed.accent === 'string'
        ) {
          return {
            lightBg: parsed.lightBg,
            darkBg: parsed.darkBg,
            accent: parsed.accent,
          };
        }
      }
    } catch {
      // 忽略損壞的本地設定，退回預設值
    }
    return DEFAULT_CUSTOM_PALETTE;
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [perspectiveMode, setPerspectiveMode] = useState<'self' | 'partner'>('self');
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null);
  const [pinUnlocked, setPinUnlocked] = useState(false);

  const [coupleSpace, setCoupleSpace] = useState<CoupleSpace | null>(null);
  const [partners, setPartners] = useState<PartnerProfile[]>([]);
  const [chalkboards, setChalkboards] = useState<ChalkboardData[]>([]);
  const [vouchers, setVouchers] = useState<WishVoucher[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [timelineNodes, setTimelineNodes] = useState<TimelineNode[]>([]);
  const [polaroids, setPolaroids] = useState<PolaroidPhoto[]>([]);
  const [capsules, setCapsules] = useState<TimeCapsuleLetter[]>([]);
  const [memos, setMemos] = useState<SharedMemo[]>([]);
  const [snaps, setSnaps] = useState<SnapStory[]>([]);

  useEffect(() => {
    applyCustomPaletteToDocument(customPalette, colorMode);
    localStorage.setItem('cove_color_mode_v3', colorMode);
    localStorage.setItem('cove_custom_palette_v1', JSON.stringify(customPalette));
  }, [colorMode, customPalette]);

  useEffect(() => {
    testFirestoreConnection();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setAuthReady(true);
        return;
      }

      const emailLower = (currentUser.email || '').trim().toLowerCase();
      const staticAllowed = ALLOWED_EMAILS.map((e) => e.trim().toLowerCase());
      let isAuthorized = staticAllowed.includes(emailLower);

      if (!isAuthorized) {
        try {
          const snap = await getDoc(doc(db, 'coupleSpace', COUPLE_SPACE_DOC_ID));
          if (snap.exists()) {
            const data = snap.data() as CoupleSpace;
            if (Array.isArray(data.allowedEmails) && data.allowedEmails.includes(emailLower)) {
              isAuthorized = true;
            }
          }
        } catch {
          // 無權讀取代表非白名單成員
        }
      }

      if (!isAuthorized) {
        setBlockedEmail(currentUser.email || '未知帳號');
        await signOut(auth);
        setUser(null);
        setAuthReady(true);
        return;
      }

      setBlockedEmail(null);
      setUser(currentUser);
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user || !user.email) return;

    const emailLower = user.email.trim().toLowerCase();
    const initialAllowed = Array.from(
      new Set(ALLOWED_EMAILS.map((e) => e.trim().toLowerCase()))
    );
    if (!initialAllowed.includes(emailLower)) {
      initialAllowed.push(emailLower);
    }

    const spaceRef = doc(db, 'coupleSpace', COUPLE_SPACE_DOC_ID);
    getDoc(spaceRef)
      .then(async (snap) => {
        if (!snap.exists()) {
          await setDoc(spaceRef, {
            partner1Email: initialAllowed[0] || emailLower,
            partner2Email: initialAllowed[1] || 'yu67428@gmail.com',
            allowedEmails: initialAllowed,
            ...DEFAULT_KEY_DATES,
            spaceTitle: '嶼你 · 雙人絲絨空間',
            pinEnabled: false,
            pinCode: '',
            updatedBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          // 若舊資料仍殘留範例信箱，自動升級同步為 yu67428@gmail.com
          const existing = snap.data() as CoupleSpace;
          if (
            existing.partner2Email === 'partner2@gmail.com' &&
            initialAllowed[1] &&
            initialAllowed[1] !== 'partner2@gmail.com'
          ) {
            await updateDoc(spaceRef, {
              partner2Email: initialAllowed[1],
              allowedEmails: initialAllowed,
              updatedBy: user.uid,
              updatedAt: serverTimestamp(),
            });
          }
        }
      })
      .catch((err) =>
        handleFirestoreError(err, OperationType.GET, `coupleSpace/${COUPLE_SPACE_DOC_ID}`)
      );

    const unsubSpace = onSnapshot(
      spaceRef,
      (snap) => {
        if (snap.exists()) {
          setCoupleSpace(snap.data() as CoupleSpace);
        }
      },
      (err) =>
        handleFirestoreError(err, OperationType.GET, `coupleSpace/${COUPLE_SPACE_DOC_ID}`)
    );

    const watchCollection = <T,>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>
    ) => {
      const q = query(
        collection(db, colName),
        where('allowedEmails', 'array-contains', emailLower)
      );
      return onSnapshot(
        q,
        (snap) => {
          setter(snap.docs.map((d) => d.data() as T));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, colName)
      );
    };

    const unsubPartners = watchCollection<PartnerProfile>('partners', setPartners);
    const unsubChalk = watchCollection<ChalkboardData>('chalkboards', setChalkboards);
    const unsubVouchers = watchCollection<WishVoucher>('vouchers', setVouchers);
    const unsubWishlist = watchCollection<WishlistItem>('wishlist', setWishlistItems);
    const unsubTimeline = watchCollection<TimelineNode>('timeline', setTimelineNodes);
    const unsubPolaroids = watchCollection<PolaroidPhoto>('polaroids', setPolaroids);
    const unsubCapsules = watchCollection<TimeCapsuleLetter>('capsules', setCapsules);
    const unsubMemos = watchCollection<SharedMemo>('memos', setMemos);
    const unsubSnaps = watchCollection<SnapStory>('snaps', setSnaps);

    return () => {
      unsubSpace();
      unsubPartners();
      unsubChalk();
      unsubVouchers();
      unsubWishlist();
      unsubTimeline();
      unsubPolaroids();
      unsubCapsules();
      unsubMemos();
      unsubSnaps();
    };
  }, [authReady, user]);

  const handleGoogleLogin = async () => {
    setLoginLoading(true);
    setLoginError(null);
    setBlockedEmail(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setLoginError(
        err instanceof Error ? `登入未完成：${err.message}` : 'Google 登入失敗，請再試一次'
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const myProfile = useMemo(
    () => partners.find((p) => p.uid === user?.uid) || null,
    [partners, user?.uid]
  );

  const partnerProfile = useMemo(
    () => partners.find((p) => p.uid !== user?.uid) || null,
    [partners, user?.uid]
  );

  const isPreview = perspectiveMode === 'partner' && !!partnerProfile;
  const activeProfile = isPreview && partnerProfile ? partnerProfile : myProfile;
  const otherProfile = isPreview ? myProfile : partnerProfile;

  const activeBoard = useMemo(
    () => chalkboards.find((b) => b.ownerUid === activeProfile?.uid) || null,
    [chalkboards, activeProfile?.uid]
  );

  const otherBoard = useMemo(
    () => chalkboards.find((b) => b.ownerUid !== activeProfile?.uid) || null,
    [chalkboards, activeProfile?.uid]
  );

  const currentAllowedEmails = useMemo(() => {
    if (coupleSpace?.allowedEmails?.length) return coupleSpace.allowedEmails;
    return ALLOWED_EMAILS.map((e) => e.trim().toLowerCase());
  }, [coupleSpace]);

  // 依據真實綁定之暱稱解析兩人生日對應名稱（絕不出現「伴侶1 / 伴侶2」）
  const { partner1DisplayName, partner2DisplayName } = useMemo(() => {
    const p1Email = (coupleSpace?.partner1Email || ALLOWED_EMAILS[0] || '').toLowerCase();
    const p2Email = (coupleSpace?.partner2Email || ALLOWED_EMAILS[1] || '').toLowerCase();
    const p1 = partners.find((p) => p.email.toLowerCase() === p1Email);
    const p2 = partners.find((p) => p.email.toLowerCase() === p2Email);
    return {
      partner1DisplayName: p1?.nickname || p1Email.split('@')[0] || '我',
      partner2DisplayName: p2?.nickname || p2Email.split('@')[0] || '另一半',
    };
  }, [coupleSpace, partners]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-secondary)] text-sm">
        正在喚醒專屬絲絨空間...
      </div>
    );
  }

  if (blockedEmail) {
    return (
      <UnauthorizedScreen
        blockedEmail={blockedEmail}
        onRetryLogin={() => {
          setBlockedEmail(null);
          handleGoogleLogin();
        }}
      />
    );
  }

  if (!user) {
    return (
      <LoginScreen
        onLogin={handleGoogleLogin}
        loading={loginLoading}
        errorMsg={loginError}
      />
    );
  }

  if (coupleSpace?.pinEnabled && coupleSpace.pinCode && !pinUnlocked) {
    return (
      <PinLockScreen
        expectedPin={coupleSpace.pinCode}
        spaceTitle={coupleSpace.spaceTitle || '嶼你 · 專屬空間'}
        onUnlock={() => setPinUnlocked(true)}
      />
    );
  }

  if (!coupleSpace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-secondary)] text-sm">
        正在同步雲端紀念日與設定...
      </div>
    );
  }

  if (!myProfile || !activeProfile) {
    return (
      <RoleOnboardingModal
        defaultName={user.displayName || ''}
        defaultAvatar={user.photoURL || ''}
        email={user.email || ''}
        onSubmit={async ({ role, roleLabel, nickname, avatarDataUrl }) => {
          const emailLower = (user.email || '').trim().toLowerCase();
          await setDoc(doc(db, 'partners', user.uid), {
            uid: user.uid,
            email: emailLower,
            role,
            roleLabel,
            nickname,
            avatarDataUrl,
            allowedEmails: currentAllowedEmails,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] pb-28">
      {/* 絲絨柔和微光暈 */}
      <div
        className="pointer-events-none fixed -top-36 -left-24 h-[420px] w-[420px] rounded-full blur-3xl opacity-85"
        style={{ backgroundColor: 'var(--accent-glow-1)' }}
      />
      <div
        className="pointer-events-none fixed top-1/3 -right-28 h-[420px] w-[420px] rounded-full blur-3xl opacity-80"
        style={{ backgroundColor: 'var(--accent-glow-2)' }}
      />

      {!isOnline && (
        <div className="sticky top-0 z-40 bg-amber-500 text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 shadow">
          <WifiOff className="h-3.5 w-3.5" />
          目前處於離線模式，連線恢復後將自動與對方雙向同步
        </div>
      )}

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-safe pt-4 sm:pt-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'home' && (
              <HomeDashboard
                coupleSpace={coupleSpace}
                myProfile={myProfile}
                partnerProfile={partnerProfile}
                activeProfile={activeProfile}
                otherProfile={otherProfile}
                activeBoard={activeBoard}
                otherBoard={otherBoard}
                memos={memos}
                snaps={snaps}
                allowedEmails={currentAllowedEmails}
                perspectiveMode={perspectiveMode}
                onTogglePerspective={() =>
                  setPerspectiveMode((prev) => (prev === 'self' ? 'partner' : 'self'))
                }
                partner1DisplayName={partner1DisplayName}
                partner2DisplayName={partner2DisplayName}
              />
            )}

            {activeTab === 'board' && (
              <VoucherSection
                activeProfile={activeProfile}
                realMyUid={myProfile.uid}
                vouchers={vouchers}
                allowedEmails={currentAllowedEmails}
                isPreviewPerspective={isPreview}
              />
            )}

            {activeTab === 'story' && (
              <StoryAndPolaroidSection
                myProfile={myProfile}
                timelineNodes={timelineNodes}
                polaroids={polaroids}
                allowedEmails={currentAllowedEmails}
              />
            )}

            {activeTab === 'wishlist' && (
              <WishlistAndCapsuleSection
                myProfile={myProfile}
                wishlistItems={wishlistItems}
                capsules={capsules}
                allowedEmails={currentAllowedEmails}
                accentHex={customPalette.accent}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsSection
                coupleSpace={coupleSpace}
                myProfile={myProfile}
                partner1DisplayName={partner1DisplayName}
                partner2DisplayName={partner2DisplayName}
                colorMode={colorMode}
                customPalette={customPalette}
                onChangeColorMode={setColorMode}
                onChangeCustomPalette={setCustomPalette}
                onResetCustomPalette={() => setCustomPalette(DEFAULT_CUSTOM_PALETTE)}
                onSignOut={async () => {
                  setPinUnlocked(false);
                  setPerspectiveMode('self');
                  await signOut(auth);
                }}
                allDocIdsToSyncEmail={{
                  partners: partners.map((p) => p.uid),
                  chalkboards: chalkboards.map((c) => c.ownerUid),
                  vouchers: vouchers.map((v) => v.id),
                  wishlist: wishlistItems.map((w) => w.id),
                  timeline: timelineNodes.map((t) => t.id),
                  polaroids: polaroids.map((p) => p.id),
                  capsules: capsules.map((c) => c.id),
                  memos: memos.map((m) => m.id),
                  snaps: snaps.map((s) => s.id),
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 底部懸浮絲絨毛玻璃導覽列 */}
      <nav
        aria-label="主分頁導覽"
        className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-safe pt-2 pointer-events-none"
      >
        <div className="pointer-events-auto max-w-xl mx-auto glass-card-strong rounded-3xl px-1.5 py-1.5 grid grid-cols-5 items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[52px] rounded-2xl flex flex-col items-center justify-center gap-0.5 px-1 transition relative ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                style={isActive ? { backgroundColor: 'var(--accent-500)' } : undefined}
              >
                <Icon className="h-[20px] w-[20px] shrink-0" />
                <span className="text-[10px] font-medium tracking-tight whitespace-nowrap truncate max-w-full">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CoupleAppShell />
    </ErrorBoundary>
  );
}
