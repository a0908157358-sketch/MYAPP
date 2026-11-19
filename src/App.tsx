import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  BellRing,
  BookHeart,
  Heart,
  Home,
  Settings,
  Ticket,
  WifiOff,
  X,
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
  WishRequest,
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

interface InAppToast {
  id: string;
  title: string;
  message: string;
  tab?: ActiveTab;
}

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
  const [wishRequests, setWishRequests] = useState<WishRequest[]>([]);
  const [activeToast, setActiveToast] = useState<InAppToast | null>(null);

  const partnersRef = useRef<PartnerProfile[]>([]);
  const coupleSpaceRef = useRef<CoupleSpace | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    partnersRef.current = partners;
  }, [partners]);

  useEffect(() => {
    coupleSpaceRef.current = coupleSpace;
  }, [coupleSpace]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((toast: Omit<InAppToast, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setActiveToast({ ...toast, id });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setActiveToast((curr) => (curr?.id === id ? null : curr));
    }, 4800);
  }, []);

  const getPartnerDisplayName = useCallback((myUid: string, fallbackName?: string) => {
    const partner = partnersRef.current.find((p) => p.uid !== myUid);
    if (partner?.nickname?.trim()) return partner.nickname.trim();
    if (fallbackName?.trim()) return fallbackName.trim();
    const myEmail = auth.currentUser?.email?.trim().toLowerCase() || '';
    const spaceEmails = coupleSpaceRef.current?.allowedEmails || ALLOWED_EMAILS;
    const otherEmail = spaceEmails.find((e) => e.trim().toLowerCase() !== myEmail);
    return otherEmail ? otherEmail.split('@')[0] : '親愛的';
  }, []);

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

    const hydratedCols: Record<string, boolean> = {};
    const prevSnapRepliesCount: Record<string, number> = {};
    let prevPartnerMoodKey: { uid: string; key: string } | null = null;

    const watchCollection = <T,>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      onLiveChanges?: (changes: ReturnType<typeof snapChangesFallback>) => void
    ) => {
      const q = query(
        collection(db, colName),
        where('allowedEmails', 'array-contains', emailLower)
      );
      return onSnapshot(
        q,
        (snap) => {
          const docs = snap.docs.map((d) => d.data() as T);
          setter(docs);

          if (!hydratedCols[colName]) {
            hydratedCols[colName] = true;
            if (colName === 'snaps') {
              (docs as unknown as SnapStory[]).forEach((s) => {
                prevSnapRepliesCount[s.id] = (s.replies || []).length;
              });
            } else if (colName === 'partners') {
              const other = (docs as unknown as PartnerProfile[]).find(
                (p) => p.uid !== user.uid
              );
              if (other) {
                prevPartnerMoodKey = {
                  uid: other.uid,
                  key: `${other.moodEmoji || ''}|${other.moodText || ''}`,
                };
              }
            }
            return;
          }

          if (onLiveChanges) {
            onLiveChanges(
              snap.docChanges().map((c) => ({
                type: c.type,
                data: c.doc.data(),
              }))
            );
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, colName)
      );
    };

    function snapChangesFallback() {
      return [] as { type: 'added' | 'modified' | 'removed'; data: unknown }[];
    }

    const unsubPartners = watchCollection<PartnerProfile>('partners', setPartners, (changes) => {
      changes.forEach((c) => {
        if (c.type !== 'modified') return;
        const d = c.data as PartnerProfile;
        if (d.uid === user.uid) return;
        const moodKey = `${d.moodEmoji || ''}|${d.moodText || ''}`;
        if (
          prevPartnerMoodKey &&
          prevPartnerMoodKey.uid === d.uid &&
          prevPartnerMoodKey.key !== moodKey &&
          (d.moodEmoji || d.moodText)
        ) {
          const pName = d.nickname || getPartnerDisplayName(user.uid);
          showToast({
            title: `${pName} 切換了今日心情`,
            message: `${d.moodEmoji || '✨'} ${d.moodText || '更新了目前狀態'}`,
            tab: 'home',
          });
        }
        prevPartnerMoodKey = { uid: d.uid, key: moodKey };
      });
    });

    const unsubChalk = watchCollection<ChalkboardData>('chalkboards', setChalkboards, (changes) => {
      changes.forEach((c) => {
        if (c.type === 'removed') return;
        const d = c.data as ChalkboardData;
        if (d.ownerUid === user.uid) return;
        const pName = getPartnerDisplayName(user.uid);
        showToast({
          title: `${pName} 更新了小黑板`,
          message:
            d.mode === 'draw'
              ? '剛畫了新的粉筆塗鴉，快來看看！'
              : d.textContent
              ? `「${d.textContent.slice(0, 32)}${d.textContent.length > 32 ? '…' : ''}」`
              : '更新了小黑板留言',
          tab: 'home',
        });
      });
    });

    const unsubVouchers = watchCollection<WishVoucher>('vouchers', setVouchers, (changes) => {
      changes.forEach((c) => {
        const d = c.data as WishVoucher;
        if (c.type === 'added' && d.creatorUid !== user.uid) {
          const pName = getPartnerDisplayName(user.uid, d.creatorName);
          showToast({
            title: `${pName} 送了一張願望券給你`,
            message: `「${d.title}」已放進你的願望券夾 🎟️`,
            tab: 'board',
          });
        } else if (
          c.type === 'modified' &&
          d.status === 'redeemed' &&
          d.redeemedByUid &&
          d.redeemedByUid !== user.uid
        ) {
          const pName = getPartnerDisplayName(user.uid);
          showToast({
            title: `${pName} 兌換了你的願望券`,
            message: `「${d.title}」剛剛完成核銷兌換 ✨`,
            tab: 'board',
          });
        }
      });
    });

    const unsubWishlist = watchCollection<WishlistItem>('wishlist', setWishlistItems, (changes) => {
      changes.forEach((c) => {
        if (c.type !== 'added') return;
        const d = c.data as WishlistItem;
        if (d.creatorUid === user.uid) return;
        const pName = getPartnerDisplayName(user.uid, d.creatorName);
        showToast({
          title: `${pName} 新增了愛心願望`,
          message: `「${d.title}」已加入雙人清單 💗`,
          tab: 'wishlist',
        });
      });
    });

    const unsubTimeline = watchCollection<TimelineNode>('timeline', setTimelineNodes, (changes) => {
      changes.forEach((c) => {
        if (c.type !== 'added') return;
        const d = c.data as TimelineNode;
        if (d.creatorUid === user.uid) return;
        const pName = getPartnerDisplayName(user.uid, d.creatorName);
        showToast({
          title: `${pName} 寫下了新的故事回憶`,
          message: `「${d.title}」已記錄到故事軸 📖`,
          tab: 'story',
        });
      });
    });

    const unsubPolaroids = watchCollection<PolaroidPhoto>('polaroids', setPolaroids, (changes) => {
      changes.forEach((c) => {
        if (c.type !== 'added') return;
        const d = c.data as PolaroidPhoto;
        if (d.creatorUid === user.uid) return;
        const pName = getPartnerDisplayName(user.uid, d.creatorName);
        showToast({
          title: `${pName} 上傳了新拍立得`,
          message: d.frontCaption ? `「${d.frontCaption}」` : '拍立得照片牆多了一張新回憶 📷',
          tab: 'story',
        });
      });
    });

    const unsubCapsules = watchCollection<TimeCapsuleLetter>('capsules', setCapsules, (changes) => {
      changes.forEach((c) => {
        if (c.type !== 'added') return;
        const d = c.data as TimeCapsuleLetter;
        if (d.senderUid === user.uid) return;
        const pName = getPartnerDisplayName(user.uid, d.senderName);
        showToast({
          title: `${pName} 寄出了一封時光膠囊`,
          message: `「${d.title}」等待你未來開啟 ⏳`,
          tab: 'wishlist',
        });
      });
    });

    const unsubMemos = watchCollection<SharedMemo>('memos', setMemos, (changes) => {
      changes.forEach((c) => {
        if (c.type !== 'added') return;
        const d = c.data as SharedMemo;
        if (d.creatorUid === user.uid) return;
        const pName = getPartnerDisplayName(user.uid, d.creatorName);
        showToast({
          title: `${pName} 新增了共享備忘錄`,
          message: `「${d.content}」`,
          tab: 'home',
        });
      });
    });

    const unsubSnaps = watchCollection<SnapStory>('snaps', setSnaps, (changes) => {
      changes.forEach((c) => {
        const d = c.data as SnapStory;
        const replyCount = (d.replies || []).length;
        if (c.type === 'added') {
          prevSnapRepliesCount[d.id] = replyCount;
          if (d.creatorUid !== user.uid) {
            const pName = getPartnerDisplayName(user.uid, d.creatorName);
            showToast({
              title: `${pName} 發布了新的 24h 隨手拍`,
              message: d.caption ? `「${d.caption}」` : '拍了一張新照片分享給你，快點開看！',
              tab: 'home',
            });
          }
        } else if (c.type === 'modified') {
          const prevCount = prevSnapRepliesCount[d.id] ?? 0;
          prevSnapRepliesCount[d.id] = replyCount;
          if (replyCount > prevCount) {
            const latestReply = d.replies?.[replyCount - 1];
            if (latestReply && latestReply.senderUid !== user.uid) {
              const pName = getPartnerDisplayName(user.uid, latestReply.senderName);
              showToast({
                title: `${pName} 回覆了隨手拍`,
                message: `「${latestReply.text.slice(0, 36)}${latestReply.text.length > 36 ? '…' : ''}」`,
                tab: 'home',
              });
            }
          }
        }
      });
    });

    const unsubWishRequests = watchCollection<WishRequest>('wishRequests', setWishRequests, (changes) => {
      changes.forEach((c) => {
        const d = c.data as WishRequest;
        if (c.type === 'added' && d.requesterUid !== user.uid) {
          const pName = getPartnerDisplayName(user.uid, d.requesterName);
          showToast({
            title: `${pName} 向你許了一個願望`,
            message: `「${d.title}」等待你同意並轉為願望券 🌠`,
            tab: 'board',
          });
        } else if (c.type === 'modified' && d.requesterUid === user.uid) {
          const pName = getPartnerDisplayName(user.uid);
          if (d.status === 'accepted') {
            showToast({
              title: `${pName} 同意了你的許願！`,
              message: `「${d.title}」已自動轉換成正式願望券 🎉`,
              tab: 'board',
            });
          } else if (d.status === 'declined') {
            showToast({
              title: `${pName} 回應了你的許願`,
              message: `「${d.title}」暫時先保留囉 💌`,
              tab: 'board',
            });
          }
        }
      });
    });

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
      unsubWishRequests();
    };
  }, [authReady, user, getPartnerDisplayName, showToast]);

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
          目前處於離線模式，連線恢復後將自動與彼此雙向同步
        </div>
      )}

      {/* App 內前景即時動態通知橫幅 (Toasts) */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-24px)] max-w-md pt-safe pointer-events-none">
        <AnimatePresence>
          {activeToast && (
            <motion.div
              key={activeToast.id}
              initial={{ opacity: 0, y: -40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -28, scale: 0.96 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto glass-card-strong rounded-2xl px-3.5 py-3 shadow-2xl border border-[var(--accent-400)]/45 flex items-center gap-3 backdrop-blur-xl"
            >
              <button
                type="button"
                onClick={() => {
                  if (activeToast.tab) setActiveTab(activeToast.tab);
                  setActiveToast(null);
                }}
                className="flex-1 min-w-0 flex items-center gap-3 text-left"
              >
                <span
                  className="h-9 w-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: 'var(--accent-500)' }}
                >
                  <BellRing className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {activeToast.title}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                    {activeToast.message}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveToast(null)}
                aria-label="關閉即時通知"
                className="h-7 w-7 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-muted)] flex items-center justify-center shrink-0 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
                wishRequests={wishRequests}
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
                  wishRequests: wishRequests.map((r) => r.id),
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
