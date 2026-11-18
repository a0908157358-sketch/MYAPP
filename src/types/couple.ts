export type ColorMode = 'light' | 'dark';
export type PartnerRole = 'boy' | 'girl' | 'custom';
export type ChalkColorId = 'white' | 'pink' | 'blue' | 'yellow';

export interface CoupleSpace {
  partner1Email: string;
  partner2Email: string;
  allowedEmails: string[];
  firstMetDate: string;
  firstTogetherDate: string;
  firstApartDate: string;
  reunitedDate: string;
  partner1Birthday: string;
  partner2Birthday: string;
  spaceTitle: string;
  pinEnabled: boolean;
  pinCode: string;
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PartnerProfile {
  uid: string;
  email: string;
  role: PartnerRole;
  roleLabel: string;
  nickname: string;
  avatarDataUrl: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChalkboardData {
  ownerUid: string;
  ownerEmail: string;
  mode: 'text' | 'draw';
  textContent: string;
  fontSize: 'sm' | 'md' | 'lg';
  chalkColor: ChalkColorId;
  drawingDataUrl: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: { seconds: number; nanoseconds: number } | Date | null;
}

export interface WishVoucher {
  id: string;
  creatorUid: string;
  creatorEmail: string;
  creatorName: string;
  recipientEmail: string;
  title: string;
  description: string;
  expiresAt: string;
  status: 'active' | 'redeemed';
  redeemCode: string;
  qrToken: string;
  redeemedAt: string;
  redeemedMethod: '' | 'qr' | 'pin';
  redeemedByUid: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WishlistItem {
  id: string;
  title: string;
  note: string;
  completed: boolean;
  completedAt: string;
  creatorUid: string;
  creatorName: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TimelineNode {
  id: string;
  eventDate: string;
  title: string;
  story: string;
  mood: string;
  photoDataUrl: string;
  creatorUid: string;
  creatorName: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PolaroidPhoto {
  id: string;
  photoDataUrl: string;
  captionDate: string;
  frontCaption: string;
  backNote: string;
  location: string;
  tiltDeg: number;
  creatorUid: string;
  creatorName: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TimeCapsuleLetter {
  id: string;
  senderUid: string;
  senderName: string;
  recipientLabel: string;
  title: string;
  content: string;
  unlockAtIso: string;
  unlockAtMs: number;
  opened: boolean;
  openedAtIso: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}
